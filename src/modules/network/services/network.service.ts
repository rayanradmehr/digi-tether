import { Inject, Injectable } from '@nestjs/common';
import { NetworkRepository } from '../repositories/network.repository';
import { Network } from '../entities/network.entity';
import { NetworkDriver } from '../enums/network-driver.enum';
import type { CreateNetworkDto } from '../dto/create-network.dto';
import type { UpdateNetworkDto } from '../dto/update-network.dto';
import type { NetworkQueryDto } from '../dto/network-query.dto';
import type { NetworkResponseDto } from '../dto/network-response.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import { CACHE_PREFIX, buildCacheKey } from '@common/constants/cache.constants';
import { TTL } from '@common/constants/ttl.constants';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ICache } from '@shared/cache/cache.interface';
import type { ILogger } from '@shared/logger/logger.interface';

/** TTL for individual network lookups (by ID or slug): 5 minutes. */
const NETWORK_CACHE_TTL_MS = TTL.MEDIUM * 1_000;

/**
 * Single business layer for the Network Module.
 *
 * This service owns ALL business logic for blockchain network metadata.
 * It enforces:
 * - Uniqueness constraints on `slug` and `chainId` before INSERT.
 * - Immutability of `slug` and `chainId` (they are absent from UpdateNetworkDto).
 * - Activation gate semantics (`isActive` flag).
 * - Soft-delete-only policy (no hard deletion ever).
 * - Cache-aside for read operations via `ICache.wrap()`.
 * - Structured logging for every mutation.
 * - Domain exceptions (`NotFoundException`, `ConflictException`) — never raw `Error`.
 *
 * Rules (enforced by architecture review)
 * ----------------------------------------
 * - Must never use TypeORM directly (always through `NetworkRepository`).
 * - Must never call another service.
 * - Must never communicate with blockchain nodes or RPC endpoints.
 * - Must never instantiate drivers.
 * - Must never import from Token, Wallet, Deposit, Withdrawal, Sweep, Signer.
 * - Exported methods are the complete public API — no controller logic leaks in.
 */
@Injectable()
export class NetworkService {
  public constructor(
    private readonly networkRepository: NetworkRepository,
    @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger,
    @Inject(INJECTION_TOKENS.CACHE) private readonly cache: ICache,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated list of network records, optionally filtered by
   * `driverKey`, `isActive`, and `isTestnet`.
   *
   * Does NOT cache list results — pagination parameters make cache keys
   * prohibitively varied. The database query is fast because the filtered
   * columns carry indexes.
   *
   * @param query - Pagination + filter parameters from `NetworkQueryDto`.
   * @returns Paginated response with mapped `NetworkResponseDto` objects.
   */
  public async findAll(
    query: NetworkQueryDto,
  ): Promise<PaginatedResult<NetworkResponseDto>> {
    const result = await this.networkRepository.findAll(query);
    return {
      ...result,
      data: result.data.map((n) => this.toResponseDto(n)),
    };
  }

  /**
   * Returns a single network by UUID.
   *
   * Cache strategy: cache-aside via `ICache.wrap()`.
   * - Cache hit  → returns cached DTO without hitting the database.
   * - Cache miss → queries the database, stores the result, returns the DTO.
   * - TTL: 5 minutes (`NETWORK_CACHE_TTL_MS`).
   *
   * Cache key: `network:id:<uuid>`
   *
   * @param id - UUID primary key of the network.
   * @throws {NotFoundException} When no active record exists for `id`.
   */
  public async findById(id: string): Promise<NetworkResponseDto> {
    const key = buildCacheKey(CACHE_PREFIX.NETWORK, 'id', id);
    return this.cache.wrap<NetworkResponseDto>(
      key,
      async () => {
        const network = await this.requireNetwork(id);
        return this.toResponseDto(network);
      },
      NETWORK_CACHE_TTL_MS,
    );
  }

  /**
   * Returns a single network by its URL-safe slug.
   *
   * Cache strategy: identical to `findById` but keyed by slug.
   * Cache key: `network:slug:<slug>`
   *
   * @param slug - URL-safe slug (e.g. 'ethereum-mainnet').
   * @throws {NotFoundException} When no active record exists for `slug`.
   */
  public async findBySlug(slug: string): Promise<NetworkResponseDto> {
    const key = buildCacheKey(CACHE_PREFIX.NETWORK, 'slug', slug);
    return this.cache.wrap<NetworkResponseDto>(
      key,
      async () => {
        const network = await this.networkRepository.findBySlug(slug);
        if (network === null) {
          throw new NotFoundException('Network', slug);
        }
        return this.toResponseDto(network);
      },
      NETWORK_CACHE_TTL_MS,
    );
  }

  /**
   * Returns all networks where `isActive = true`, unordered by ID.
   *
   * Intended for downstream modules (Token, Wallet, Deposit Scanner, etc.)
   * that need the full set of operable networks to validate operations.
   *
   * Not cached — callers receive a fresh list on every call.
   * The result set is expected to be small (single-digit to tens of records).
   *
   * @returns Array of `NetworkResponseDto` for all active networks.
   */
  public async findActive(): Promise<NetworkResponseDto[]> {
    const networks = await this.networkRepository.findActive();
    return networks.map((n) => this.toResponseDto(n));
  }

  /**
   * Checks whether a network exists and is active.
   *
   * Used as a lightweight gate by downstream modules before they attempt
   * any on-chain operation. Returns a boolean — never throws.
   *
   * @param id - UUID of the network to check.
   * @returns `true` if the network exists and `isActive = true`; `false` otherwise.
   */
  public async isActive(id: string): Promise<boolean> {
    const network = await this.networkRepository.findById(id);
    return network !== null && network.isActive;
  }

  /**
   * Returns the `NetworkDriver` enum value for the given network.
   *
   * Used by downstream modules (Sweep, Broadcast, Signer) to resolve the
   * correct driver implementation from the Drivers layer without depending
   * on Network internals.
   *
   * @param id - UUID of the network.
   * @throws {NotFoundException}     When the network does not exist.
   * @throws {ConflictException}     When the network exists but is inactive.
   */
  public async getDriverKey(id: string): Promise<NetworkDriver> {
    const network = await this.requireNetwork(id);
    if (!network.isActive) {
      throw new ConflictException(
        `Network '${network.slug}' (${id}) is inactive and cannot be used for operations`,
      );
    }
    return network.driverKey;
  }

  /**
   * Returns the required deposit confirmation count for the given network.
   *
   * Read by the Deposit Scanner before crediting a deposit transaction.
   *
   * @param id - UUID of the network.
   * @throws {NotFoundException} When the network does not exist.
   */
  public async getRequiredConfirmations(id: string): Promise<number> {
    const network = await this.requireNetwork(id);
    return network.requiredConfirmations;
  }

  /**
   * Constructs a block explorer URL for a given transaction hash or address.
   *
   * Format: `{explorerBaseUrl}/search?q={hashOrAddress}`
   * Trailing slashes on `explorerBaseUrl` are normalised away.
   *
   * @param id            - UUID of the network.
   * @param hashOrAddress - Transaction hash or wallet address to link.
   * @throws {NotFoundException} When the network does not exist.
   */
  public async getExplorerUrl(id: string, hashOrAddress: string): Promise<string> {
    const network = await this.requireNetwork(id);
    const base = network.explorerBaseUrl.replace(/\/+$/, '');
    return `${base}/search?q=${hashOrAddress}`;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Registers a new blockchain network.
   *
   * Pre-conditions checked (in order):
   * 1. `slug` must be globally unique among non-deleted networks.
   * 2. `chainId` must be globally unique among non-deleted networks.
   *
   * Defaults applied when optional DTO fields are omitted:
   * - `requiredConfirmations` → 12
   * - `blockTimeSeconds`      → 12
   * - `isTestnet`             → false
   * - `isActive`              → true
   * - `description`           → null
   *
   * @param dto - Validated `CreateNetworkDto`.
   * @throws {ConflictException} On duplicate `slug` or `chainId`.
   * @returns The newly created network as `NetworkResponseDto`.
   */
  public async create(dto: CreateNetworkDto): Promise<NetworkResponseDto> {
    await this.assertSlugIsAvailable(dto.slug);
    await this.assertChainIdIsAvailable(dto.chainId);

    const network = await this.networkRepository.create({
      name: dto.name,
      slug: dto.slug,
      symbol: dto.symbol,
      chainId: dto.chainId,
      nativeDecimals: dto.nativeDecimals,
      driverKey: dto.driverKey,
      explorerBaseUrl: dto.explorerBaseUrl,
      requiredConfirmations: dto.requiredConfirmations ?? 12,
      blockTimeSeconds: dto.blockTimeSeconds ?? 12,
      isTestnet: dto.isTestnet ?? false,
      isActive: dto.isActive ?? true,
      description: dto.description ?? null,
    });

    this.logger.log(
      `Network created: slug='${network.slug}' chainId='${network.chainId}' id='${network.id}'`,
      NetworkService.name,
    );

    return this.toResponseDto(network);
  }

  /**
   * Updates mutable fields of an existing network.
   *
   * Immutable fields (`slug`, `chainId`) are absent from `UpdateNetworkDto`
   * and are therefore structurally impossible to overwrite through this method.
   *
   * Undefined DTO fields are stripped by the merge operation — only fields
   * explicitly provided in the DTO are written to the database. Fields not
   * included in the update are preserved unchanged.
   *
   * Cache is invalidated for both the UUID key and the slug key.
   *
   * @param id  - UUID of the network to update.
   * @param dto - Partial `UpdateNetworkDto` with fields to change.
   * @throws {NotFoundException} When the network does not exist.
   * @returns The updated network as `NetworkResponseDto`.
   */
  public async update(id: string, dto: UpdateNetworkDto): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);

    // Build the changes object containing only explicitly provided fields.
    // Undefined values are omitted so TypeORM merge does not overwrite with undefined.
    const changes: Partial<Network> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.symbol !== undefined) changes.symbol = dto.symbol;
    if (dto.nativeDecimals !== undefined) changes.nativeDecimals = dto.nativeDecimals;
    if (dto.driverKey !== undefined) changes.driverKey = dto.driverKey;
    if (dto.explorerBaseUrl !== undefined) changes.explorerBaseUrl = dto.explorerBaseUrl;
    if (dto.requiredConfirmations !== undefined) changes.requiredConfirmations = dto.requiredConfirmations;
    if (dto.blockTimeSeconds !== undefined) changes.blockTimeSeconds = dto.blockTimeSeconds;
    if (dto.isTestnet !== undefined) changes.isTestnet = dto.isTestnet;
    if (dto.description !== undefined) changes.description = dto.description;

    const updated = await this.networkRepository.update(network, changes);
    await this.invalidateNetworkCache(network);

    this.logger.log(
      `Network updated: slug='${network.slug}' id='${id}'`,
      NetworkService.name,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Activates a network by setting `isActive = true`.
   *
   * Does NOT cascade: downstream records (Wallets, Tokens, etc.) are not
   * affected. The network simply becomes eligible for on-chain operations.
   *
   * Idempotent: activating an already-active network succeeds without error.
   *
   * @param id - UUID of the network to activate.
   * @throws {NotFoundException} When the network does not exist.
   * @returns The updated network as `NetworkResponseDto`.
   */
  public async activate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);
    const updated = await this.networkRepository.update(network, { isActive: true });
    await this.invalidateNetworkCache(network);

    this.logger.log(
      `Network activated: slug='${network.slug}' id='${id}'`,
      NetworkService.name,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Deactivates a network by setting `isActive = false`.
   *
   * Does NOT cascade: existing Wallets, Tokens, and in-flight operations are
   * not automatically blocked — each downstream module must call `isActive()`
   * before performing on-chain operations.
   *
   * Idempotent: deactivating an already-inactive network succeeds without error.
   *
   * @param id - UUID of the network to deactivate.
   * @throws {NotFoundException} When the network does not exist.
   * @returns The updated network as `NetworkResponseDto`.
   */
  public async deactivate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);
    const updated = await this.networkRepository.update(network, { isActive: false });
    await this.invalidateNetworkCache(network);

    this.logger.log(
      `Network deactivated: slug='${network.slug}' id='${id}'`,
      NetworkService.name,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Soft-deletes a network.
   *
   * Sets `deleted_at` to the current timestamp. The row is retained in the
   * database for referential integrity (downstream FK references) and audit.
   * Hard deletion is permanently forbidden — the database row must never be
   * removed.
   *
   * After soft-deletion:
   * - All `find*` methods will exclude this record automatically.
   * - Downstream modules will receive `null` on lookups and should treat
   *   the network as non-existent.
   *
   * @param id - UUID of the network to soft-delete.
   * @throws {NotFoundException} When the network does not exist.
   */
  public async remove(id: string): Promise<void> {
    const network = await this.requireNetwork(id);
    await this.networkRepository.softDelete(network);
    await this.invalidateNetworkCache(network);

    this.logger.log(
      `Network soft-deleted: slug='${network.slug}' id='${id}'`,
      NetworkService.name,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetches a network by UUID and throws `NotFoundException` if absent.
   * Centralises the "require or throw" pattern used by every mutation
   * and guarded query method.
   */
  private async requireNetwork(id: string): Promise<Network> {
    const network = await this.networkRepository.findById(id);
    if (network === null) {
      throw new NotFoundException('Network', id);
    }
    return network;
  }

  /**
   * Asserts that no non-deleted network already uses the given `slug`.
   * Throws `ConflictException` if a duplicate exists.
   */
  private async assertSlugIsAvailable(slug: string): Promise<void> {
    const exists = await this.networkRepository.existsBySlug(slug);
    if (exists) {
      throw new ConflictException(
        `A network with slug '${slug}' already exists`,
      );
    }
  }

  /**
   * Asserts that no non-deleted network already uses the given `chainId`.
   * Throws `ConflictException` if a duplicate exists.
   */
  private async assertChainIdIsAvailable(chainId: string): Promise<void> {
    const exists = await this.networkRepository.existsByChainId(chainId);
    if (exists) {
      throw new ConflictException(
        `A network with chainId '${chainId}' already exists`,
      );
    }
  }

  /**
   * Invalidates all cache entries for a network after a mutation.
   *
   * Deletes both the UUID-keyed entry and the slug-keyed entry in parallel.
   * Uses `Promise.all` to avoid sequential round-trips to the cache store.
   */
  private async invalidateNetworkCache(network: Network): Promise<void> {
    await Promise.all([
      this.cache.del(buildCacheKey(CACHE_PREFIX.NETWORK, 'id', network.id)),
      this.cache.del(buildCacheKey(CACHE_PREFIX.NETWORK, 'slug', network.slug)),
    ]);
  }

  /**
   * Maps a `Network` entity to its public `NetworkResponseDto` shape.
   *
   * This is the single mapping function for the entire service — one place
   * to update if the response shape changes. Never exposes `deletedAt` or
   * the optimistic-lock `version` field.
   */
  private toResponseDto(network: Network): NetworkResponseDto {
    return {
      id: network.id,
      name: network.name,
      slug: network.slug,
      symbol: network.symbol,
      chainId: network.chainId,
      nativeDecimals: network.nativeDecimals,
      driverKey: network.driverKey,
      explorerBaseUrl: network.explorerBaseUrl,
      requiredConfirmations: network.requiredConfirmations,
      blockTimeSeconds: network.blockTimeSeconds,
      isTestnet: network.isTestnet,
      isActive: network.isActive,
      description: network.description,
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
    };
  }
}
