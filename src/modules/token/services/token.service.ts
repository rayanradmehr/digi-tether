import { Inject, Injectable } from '@nestjs/common';
import { TokenRepository } from '../repositories/token.repository';
import { TokenMapper } from '../mappers/token.mapper';
import { Token } from '../entities/token.entity';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';
import { buildTokenCacheKey, TOKEN_CACHE_TTL_MS } from '../constants/token-cache.constants';
import {
  createTokenCreatedEvent,
  createTokenStatusChangedEvent,
} from '../events';
import type { CreateTokenDto } from '../dto/create-token.dto';
import type { UpdateTokenDto } from '../dto/update-token.dto';
import type { TokenResponseDto } from '../dto/token-response.dto';
import type { TokenQueryDto } from '../dto/token-query.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ICache } from '@shared/cache/cache.interface';
import type { ILogger } from '@shared/logger/logger.interface';
import type { IEventPublisher } from '@shared/events/event-publisher.interface';
import { NetworkService } from '@modules/network/services/network.service';
import { NetworkDriver } from '@modules/network/enums/network-driver.enum';

/**
 * Permitted token standard → driver mapping.
 * Used to validate that the `standard` field is compatible with the
 * network's `driverKey` on every create operation (Invariant 7).
 */
const ALLOWED_STANDARDS_BY_DRIVER: Readonly<Record<NetworkDriver, TokenStandard[]>> = {
  [NetworkDriver.EVM]: [TokenStandard.NATIVE, TokenStandard.ERC20],
  [NetworkDriver.TRON]: [TokenStandard.NATIVE, TokenStandard.TRC20],
};

/**
 * Single business layer for the Token Module.
 *
 * This service owns ALL business logic for blockchain asset metadata.
 * It enforces:
 * - Network existence and activity gate on create.
 * - Standard × driver compatibility (Invariant 7).
 * - One native token per network (Invariant 1).
 * - (networkId, symbol) uniqueness among live records (Invariant 5).
 * - (networkId, contractAddress) uniqueness among live records (Invariant 4).
 * - contractAddress = NULL for native tokens; required for contract tokens.
 * - `DEPRECATED` terminal state — transitions FROM deprecated are forbidden.
 * - Soft-delete-only policy (Invariant 12).
 * - Cache-aside for individual token lookups via `ICache.wrap()`.
 * - Cache invalidation after every mutation.
 * - Domain event publishing after create and status transitions.
 * - Structured logging for every mutation.
 * - Domain exceptions (`NotFoundException`, `ConflictException`) only.
 *
 * Rules (enforced by architecture review)
 * ----------------------------------------
 * - Must never use TypeORM directly — always through `TokenRepository`.
 * - Must never call any service other than `NetworkService`.
 * - Must never communicate with blockchain nodes or RPC endpoints.
 * - Must never import from Wallet, Deposit, Withdrawal, Sweep, or Signer.
 */
@Injectable()
export class TokenService {
  public constructor(
    private readonly tokenRepository: TokenRepository,
    private readonly tokenMapper: TokenMapper,
    private readonly networkService: NetworkService,
    @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger,
    @Inject(INJECTION_TOKENS.CACHE) private readonly cache: ICache,
    @Inject(INJECTION_TOKENS.EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated, optionally filtered list of live tokens.
   *
   * Not cached — pagination parameters make cache keys prohibitively varied.
   * The database query is fast because filtered columns carry indexes.
   *
   * @param query - Pagination + filter parameters from `TokenQueryDto`.
   */
  public async findAll(
    query: TokenQueryDto,
  ): Promise<PaginatedResult<TokenResponseDto>> {
    const result = await this.tokenRepository.findAll(query);
    return {
      ...result,
      data: result.data.map((t) => this.tokenMapper.toResponseDto(t)),
    };
  }

  /**
   * Returns a single token by UUID.
   *
   * Cache strategy: cache-aside via `ICache.wrap()`.
   * - Cache hit  → returns cached DTO without hitting the database.
   * - Cache miss → queries the database, stores the result, returns the DTO.
   * - TTL: `TOKEN_CACHE_TTL_MS` (5 minutes).
   *
   * Cache key: `token:id:<uuid>`
   *
   * @param id - UUID primary key of the token.
   * @throws {NotFoundException} When no live record exists for `id`.
   */
  public async findById(id: string): Promise<TokenResponseDto> {
    const key = buildTokenCacheKey('id', id);
    return this.cache.wrap<TokenResponseDto>(
      key,
      async () => {
        const token = await this.requireToken(id);
        return this.tokenMapper.toResponseDto(token);
      },
      TOKEN_CACHE_TTL_MS,
    );
  }

  /**
   * Returns all live tokens for a given network, paginated and filtered.
   *
   * Delegates to `findAll` with a forced `networkId` filter.
   *
   * @param networkId - UUID of the parent network.
   * @param query     - Additional pagination + filter parameters.
   */
  public async findByNetworkId(
    networkId: string,
    query: TokenQueryDto,
  ): Promise<PaginatedResult<TokenResponseDto>> {
    return this.findAll({ ...query, networkId });
  }

  /**
   * Returns all ACTIVE live tokens for a given network.
   *
   * Used by downstream modules (Wallet, Deposit) as a gate-check list.
   * Not cached — the full active set must always be fresh.
   *
   * @param networkId - UUID of the parent network.
   */
  public async findActiveByNetworkId(
    networkId: string,
  ): Promise<TokenResponseDto[]> {
    const tokens = await this.tokenRepository.findActiveByNetworkId(networkId);
    return tokens.map((t) => this.tokenMapper.toResponseDto(t));
  }

  /**
   * Gate check — returns `true` only when the token exists and is ACTIVE.
   *
   * Never throws. Used by downstream modules before performing on-chain
   * operations involving this token.
   *
   * @param id - UUID of the token.
   */
  public async isActive(id: string): Promise<boolean> {
    const token = await this.tokenRepository.findById(id);
    return token !== null && token.status === TokenStatus.ACTIVE;
  }

  /**
   * Returns the decimal precision for the given token.
   *
   * Used by amount-formatting utilities across all downstream modules.
   *
   * @param id - UUID of the token.
   * @throws {NotFoundException} When the token does not exist.
   */
  public async getDecimals(id: string): Promise<number> {
    const token = await this.requireToken(id);
    return token.decimals;
  }

  /**
   * Returns the effective confirmation count for the given token.
   *
   * Resolution order (Invariant 15):
   * 1. Token's `confirmationsOverride` when non-null.
   * 2. Network's `requiredConfirmations` when override is null.
   *
   * @param id - UUID of the token.
   * @throws {NotFoundException} When the token does not exist.
   */
  public async getConfirmations(id: string): Promise<number> {
    const token = await this.requireToken(id);
    if (token.confirmationsOverride !== null) {
      return token.confirmationsOverride;
    }
    return this.networkService.getRequiredConfirmations(token.networkId);
  }

  /**
   * Constructs a block explorer URL for the token's contract address
   * (or the network's explorer URL for native tokens).
   *
   * Delegates to `NetworkService.getExplorerUrl` which owns the
   * explorer base URL (ADR-T-008).
   *
   * @param id - UUID of the token.
   * @throws {NotFoundException} When the token does not exist.
   */
  public async getExplorerUrl(id: string): Promise<string> {
    const token = await this.requireToken(id);
    const hashOrAddress = token.contractAddress ?? token.symbol;
    return this.networkService.getExplorerUrl(token.networkId, hashOrAddress);
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Registers a new blockchain asset.
   *
   * Pre-conditions checked (in order):
   * 1. Network must exist.
   * 2. Network must be active.
   * 3. `standard` must be compatible with the network's `driverKey`.
   * 4. `type = native` → exactly one native token may exist per network.
   * 5. `(networkId, symbol)` must be unique among live records.
   * 6. `(networkId, contractAddress)` must be unique among live records (contract tokens only).
   *
   * Defaults applied when optional DTO fields are omitted:
   * - `status`               → `TokenStatus.ACTIVE`
   * - `confirmationsOverride` → `null`
   * - `logoUrl`              → `null`
   * - `description`          → `null`
   *
   * @param dto - Validated `CreateTokenDto`.
   * @throws {NotFoundException}  When the network does not exist.
   * @throws {ConflictException}  On any uniqueness violation or inactive network.
   * @returns The newly created token as `TokenResponseDto`.
   */
  public async create(dto: CreateTokenDto): Promise<TokenResponseDto> {
    const network = await this.networkService.findById(dto.networkId);

    if (!network.isActive) {
      throw new ConflictException(
        `Network '${dto.networkId}' is inactive and cannot accept new tokens.`,
      );
    }

    this.assertStandardDriverCompatibility(dto.standard, network.driverKey);

    if (dto.type === TokenType.NATIVE) {
      await this.assertNoNativeTokenForNetwork(dto.networkId);
    }

    await this.assertSymbolIsAvailable(dto.symbol, dto.networkId);

    if (dto.type === TokenType.CONTRACT && dto.contractAddress !== null && dto.contractAddress !== undefined) {
      await this.assertContractAddressIsAvailable(dto.contractAddress, dto.networkId);
    }

    const token = await this.tokenRepository.create({
      networkId: dto.networkId,
      type: dto.type,
      standard: dto.standard,
      name: dto.name,
      symbol: dto.symbol,
      decimals: dto.decimals,
      contractAddress: dto.contractAddress ?? null,
      status: dto.status ?? TokenStatus.ACTIVE,
      confirmationsOverride: dto.confirmationsOverride ?? null,
      logoUrl: dto.logoUrl ?? null,
      description: dto.description ?? null,
    });

    this.eventPublisher.publish(
      createTokenCreatedEvent({
        tokenId: token.id,
        networkId: token.networkId,
        symbol: token.symbol,
        type: token.type,
        standard: token.standard,
        contractAddress: token.contractAddress,
      }),
    );

    this.logger.log(
      `Token created: symbol='${token.symbol}' network='${token.networkId}' id='${token.id}'`,
      TokenService.name,
    );

    return this.tokenMapper.toResponseDto(token);
  }

  /**
   * Updates mutable fields of an existing token.
   *
   * Immutable fields (`networkId`, `type`, `standard`, `contractAddress`,
   * `decimals`) are absent from `UpdateTokenDto` and therefore structurally
   * impossible to change through this method.
   *
   * Symbol uniqueness is re-checked when the symbol is being changed.
   * Cache is invalidated after the update.
   *
   * @param id  - UUID of the token to update.
   * @param dto - Partial `UpdateTokenDto` with fields to change.
   * @throws {NotFoundException}  When the token does not exist.
   * @throws {ConflictException}  On duplicate symbol or forbidden status transition.
   * @returns The updated token as `TokenResponseDto`.
   */
  public async update(id: string, dto: UpdateTokenDto): Promise<TokenResponseDto> {
    const token = await this.requireToken(id);

    if (dto.status !== undefined) {
      this.assertStatusTransitionAllowed(token.status, dto.status);
    }

    if (dto.symbol !== undefined && dto.symbol !== token.symbol) {
      await this.assertSymbolIsAvailable(dto.symbol, token.networkId, id);
    }

    const previousStatus = token.status;

    const changes: Partial<Token> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.symbol !== undefined) changes.symbol = dto.symbol;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.confirmationsOverride !== undefined) changes.confirmationsOverride = dto.confirmationsOverride;
    if (dto.logoUrl !== undefined) changes.logoUrl = dto.logoUrl;
    if (dto.description !== undefined) changes.description = dto.description;

    const updated = await this.tokenRepository.update(token, changes);
    await this.invalidateTokenCache(token.id);

    if (dto.status !== undefined && dto.status !== previousStatus) {
      this.eventPublisher.publish(
        createTokenStatusChangedEvent({
          tokenId: updated.id,
          networkId: updated.networkId,
          symbol: updated.symbol,
          previousStatus,
          newStatus: updated.status,
        }),
      );
    }

    this.logger.log(
      `Token updated: symbol='${updated.symbol}' id='${id}'`,
      TokenService.name,
    );

    return this.tokenMapper.toResponseDto(updated);
  }

  /**
   * Sets the token status to ACTIVE.
   *
   * Idempotent: calling on an already-active token succeeds without error.
   * Forbidden: cannot reinstate a DEPRECATED token (Invariant — terminal state).
   *
   * @param id - UUID of the token to enable.
   * @throws {NotFoundException} When the token does not exist.
   * @throws {ConflictException} When the token is DEPRECATED.
   */
  public async enable(id: string): Promise<TokenResponseDto> {
    return this.update(id, { status: TokenStatus.ACTIVE });
  }

  /**
   * Sets the token status to INACTIVE.
   *
   * Idempotent: calling on an already-inactive token succeeds without error.
   * Forbidden: cannot suspend a DEPRECATED token.
   *
   * @param id - UUID of the token to disable.
   * @throws {NotFoundException} When the token does not exist.
   * @throws {ConflictException} When the token is DEPRECATED.
   */
  public async disable(id: string): Promise<TokenResponseDto> {
    return this.update(id, { status: TokenStatus.INACTIVE });
  }

  /**
   * Sets the token status to DEPRECATED (terminal — irreversible).
   *
   * Once deprecated, a token can never be re-enabled or suspended again.
   * Historical records (deposits, withdrawals) remain valid and queryable.
   *
   * @param id - UUID of the token to deprecate.
   * @throws {NotFoundException} When the token does not exist.
   * @throws {ConflictException} When the token is already DEPRECATED.
   */
  public async deprecate(id: string): Promise<TokenResponseDto> {
    const token = await this.requireToken(id);
    if (token.status === TokenStatus.DEPRECATED) {
      throw new ConflictException(
        `Token '${id}' is already deprecated.`,
      );
    }
    return this.update(id, { status: TokenStatus.DEPRECATED });
  }

  /**
   * Soft-deletes a token.
   *
   * Sets `deleted_at` to the current timestamp. The row is retained in the
   * database for referential integrity (downstream FK references) and audit.
   * Hard deletion is permanently forbidden (Invariant 12).
   *
   * After soft-deletion, all `find*` methods exclude this record automatically.
   *
   * @param id - UUID of the token to soft-delete.
   * @throws {NotFoundException} When the token does not exist.
   */
  public async remove(id: string): Promise<void> {
    const token = await this.requireToken(id);
    await this.tokenRepository.softDelete(token);
    await this.invalidateTokenCache(token.id);

    this.logger.log(
      `Token soft-deleted: symbol='${token.symbol}' id='${id}'`,
      TokenService.name,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetches a token by UUID and throws `NotFoundException` if absent.
   * Centralises the "require or throw" pattern used by every guarded method.
   */
  private async requireToken(id: string): Promise<Token> {
    const token = await this.tokenRepository.findById(id);
    if (token === null) {
      throw new NotFoundException('Token', id);
    }
    return token;
  }

  /**
   * Asserts that the given `standard` is permitted for the network's `driverKey`.
   *
   * Invariant 7: token standard must match driver type.
   * - EVM driver   → allows NATIVE and ERC20.
   * - TRON driver  → allows NATIVE and TRC20.
   *
   * @throws {ConflictException} On incompatible standard × driver combination.
   */
  private assertStandardDriverCompatibility(
    standard: TokenStandard,
    driverKey: NetworkDriver,
  ): void {
    const allowed = ALLOWED_STANDARDS_BY_DRIVER[driverKey];
    if (!allowed.includes(standard)) {
      throw new ConflictException(
        `Token standard '${standard}' is not compatible with network driver '${driverKey}'. ` +
        `Allowed standards for this driver: ${allowed.join(', ')}.`,
      );
    }
  }

  /**
   * Asserts that no live native token already exists for the given network.
   * Enforces Invariant 1 (one native token per network).
   *
   * @throws {ConflictException} When a native token already exists.
   */
  private async assertNoNativeTokenForNetwork(networkId: string): Promise<void> {
    const exists = await this.tokenRepository.existsNativeByNetworkId(networkId);
    if (exists) {
      throw new ConflictException(
        `Network '${networkId}' already has a native token. ` +
        'Only one native token is permitted per network (Invariant 1).',
      );
    }
  }

  /**
   * Asserts that no live token on the same network uses the given `symbol`.
   * Enforces Invariant 5 ((networkId, symbol) uniqueness).
   *
   * @param symbol      - The symbol to check.
   * @param networkId   - The network scope.
   * @param excludeId   - Optional token UUID to exclude (used during updates).
   * @throws {ConflictException} On duplicate symbol within the same network.
   */
  private async assertSymbolIsAvailable(
    symbol: string,
    networkId: string,
    excludeId?: string,
  ): Promise<void> {
    const exists = await this.tokenRepository.existsBySymbolAndNetworkId(
      symbol,
      networkId,
    );
    if (exists) {
      const isCurrentToken = excludeId !== undefined;
      if (!isCurrentToken) {
        throw new ConflictException(
          `A token with symbol '${symbol}' already exists on network '${networkId}'.`,
        );
      }
      // Re-check by fetching to confirm it's a different record, not the same one.
      const existing = await this.tokenRepository.findById(excludeId);
      if (existing === null || existing.symbol !== symbol) {
        throw new ConflictException(
          `A token with symbol '${symbol}' already exists on network '${networkId}'.`,
        );
      }
    }
  }

  /**
   * Asserts that no live token on the same network uses the given contract address.
   * Enforces Invariant 4 ((networkId, contractAddress) uniqueness).
   *
   * @throws {ConflictException} On duplicate contract address within the same network.
   */
  private async assertContractAddressIsAvailable(
    contractAddress: string,
    networkId: string,
  ): Promise<void> {
    const exists = await this.tokenRepository.existsByContractAddressAndNetworkId(
      contractAddress,
      networkId,
    );
    if (exists) {
      throw new ConflictException(
        `A token with contract address '${contractAddress}' already exists on network '${networkId}'.`,
      );
    }
  }

  /**
   * Validates that a status transition is permitted.
   *
   * Forbidden transitions (Invariant — DEPRECATED is terminal):
   *   DEPRECATED → ACTIVE
   *   DEPRECATED → INACTIVE
   *
   * @param current - The token's current status.
   * @param next    - The requested new status.
   * @throws {ConflictException} When the transition is forbidden.
   */
  private assertStatusTransitionAllowed(
    current: TokenStatus,
    next: TokenStatus,
  ): void {
    if (current === TokenStatus.DEPRECATED && next !== TokenStatus.DEPRECATED) {
      throw new ConflictException(
        `Cannot transition token status from '${current}' to '${next}'. ` +
        'DEPRECATED is a terminal state and cannot be reversed.',
      );
    }
  }

  /**
   * Invalidates the cache entry for a token after a mutation.
   * Deletes the UUID-keyed entry.
   */
  private async invalidateTokenCache(id: string): Promise<void> {
    await this.cache.del(buildTokenCacheKey('id', id));
  }
}
