import { Inject, Injectable } from '@nestjs/common';
import { NetworkRepository } from '../repositories/network.repository';
import { Network } from '../entities/network.entity';
import type { CreateNetworkDto } from '../dto/create-network.dto';
import type { UpdateNetworkDto } from '../dto/update-network.dto';
import type { NetworkQueryDto } from '../dto/network-query.dto';
import type { NetworkResponseDto } from '../dto/network-response.dto';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ILogger } from '@shared/logger/logger.interface';
import type { ICache } from '@shared/cache/cache.interface';
import { TTL } from '@common/constants/ttl.constants';

const CACHE_PREFIX = 'network';

/**
 * Single business layer for the Network Module.
 *
 * Enforces all invariants: activation gate, slug/chainId uniqueness,
 * soft-delete-only policy. Applies cache-aside for read-heavy lookups.
 *
 * This is the only exported provider from `NetworkModule`. All downstream
 * modules inject this service — never the repository or entity directly.
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

  /** Returns a paginated list of networks matching the supplied filters. */
  public async findAll(query: NetworkQueryDto): Promise<PaginatedResult<NetworkResponseDto>> {
    const result = await this.networkRepository.findAll(query);
    return { ...result, data: result.data.map(this.toResponseDto) };
  }

  /** Returns a single network by UUID. Throws `NotFoundException` if absent. */
  public async findById(id: string): Promise<NetworkResponseDto> {
    const cacheKey = `${CACHE_PREFIX}:id:${id}`;
    const cached = await this.cache.get<NetworkResponseDto>(cacheKey);
    if (cached !== null) return cached;

    const network = await this.requireNetwork({ id });
    const dto = this.toResponseDto(network);
    await this.cache.set(cacheKey, dto, TTL.FIVE_MINUTES);
    return dto;
  }

  /** Returns a single network by slug. Throws `NotFoundException` if absent. */
  public async findBySlug(slug: string): Promise<NetworkResponseDto> {
    const cacheKey = `${CACHE_PREFIX}:slug:${slug}`;
    const cached = await this.cache.get<NetworkResponseDto>(cacheKey);
    if (cached !== null) return cached;

    const network = await this.networkRepository.findBySlug(slug);
    if (network === null) throw new NotFoundException('Network', slug);
    const dto = this.toResponseDto(network);
    await this.cache.set(cacheKey, dto, TTL.FIVE_MINUTES);
    return dto;
  }

  /**
   * Returns `true` if the network exists and is active.
   * Used by downstream modules as a gate before on-chain operations.
   */
  public async isActive(id: string): Promise<boolean> {
    const network = await this.networkRepository.findById(id);
    return network !== null && network.isActive;
  }

  /**
   * Returns the driver key string for the given network.
   * Throws `NotFoundException` if the network does not exist.
   * Throws `Error` if the network is inactive.
   */
  public async getDriverKey(id: string): Promise<string> {
    const network = await this.requireNetwork({ id });
    if (!network.isActive) {
      throw new Error(`Network '${id}' is not active`);
    }
    return network.driverKey;
  }

  /**
   * Returns the required confirmation count for the given network.
   * Throws `NotFoundException` if the network does not exist.
   */
  public async getConfirmations(id: string): Promise<number> {
    const network = await this.requireNetwork({ id });
    return network.requiredConfirmations;
  }

  /**
   * Returns a formatted block explorer URL for the given hash or address.
   * Throws `NotFoundException` if the network does not exist.
   */
  public async getExplorerUrl(id: string, hashOrAddress: string): Promise<string> {
    const network = await this.requireNetwork({ id });
    const base = network.explorerBaseUrl.replace(/\/$/, '');
    return `${base}/search?q=${hashOrAddress}`;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /** Registers a new network. Throws `ConflictException` on duplicate slug or chainId. */
  public async create(dto: CreateNetworkDto): Promise<NetworkResponseDto> {
    await this.assertNoDuplicate(dto.slug, dto.chainId);

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

    this.logger.log(`Network created: ${network.slug} (${network.id})`, NetworkService.name);
    return this.toResponseDto(network);
  }

  /** Updates mutable fields on an existing network. Immutable fields (slug, chainId) are ignored. */
  public async update(id: string, dto: UpdateNetworkDto): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork({ id });
    const updated = await this.networkRepository.update(network, {
      name: dto.name,
      symbol: dto.symbol,
      nativeDecimals: dto.nativeDecimals,
      driverKey: dto.driverKey,
      explorerBaseUrl: dto.explorerBaseUrl,
      requiredConfirmations: dto.requiredConfirmations,
      blockTimeSeconds: dto.blockTimeSeconds,
      isTestnet: dto.isTestnet,
      description: dto.description,
    });

    await this.invalidateCache(network);
    this.logger.log(`Network updated: ${network.slug} (${id})`, NetworkService.name);
    return this.toResponseDto(updated);
  }

  /** Sets `isActive = true` for the given network. */
  public async activate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork({ id });
    const updated = await this.networkRepository.update(network, { isActive: true });
    await this.invalidateCache(network);
    this.logger.log(`Network activated: ${network.slug} (${id})`, NetworkService.name);
    return this.toResponseDto(updated);
  }

  /** Sets `isActive = false` for the given network. Does NOT cascade. */
  public async deactivate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork({ id });
    const updated = await this.networkRepository.update(network, { isActive: false });
    await this.invalidateCache(network);
    this.logger.log(`Network deactivated: ${network.slug} (${id})`, NetworkService.name);
    return this.toResponseDto(updated);
  }

  /** Soft-deletes the network. The row is retained for referential integrity. */
  public async remove(id: string): Promise<void> {
    const network = await this.requireNetwork({ id });
    await this.networkRepository.softDelete(network);
    await this.invalidateCache(network);
    this.logger.log(`Network soft-deleted: ${network.slug} (${id})`, NetworkService.name);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async requireNetwork(where: { id: string }): Promise<Network> {
    const network = await this.networkRepository.findById(where.id);
    if (network === null) throw new NotFoundException('Network', where.id);
    return network;
  }

  private async assertNoDuplicate(slug: string, chainId: string): Promise<void> {
    const bySlug = await this.networkRepository.findBySlug(slug);
    if (bySlug !== null) throw new ConflictException(`Network with slug '${slug}' already exists`);

    const byChain = await this.networkRepository.findByChainId(chainId);
    if (byChain !== null) throw new ConflictException(`Network with chainId '${chainId}' already exists`);
  }

  private async invalidateCache(network: Network): Promise<void> {
    await Promise.all([
      this.cache.del(`${CACHE_PREFIX}:id:${network.id}`),
      this.cache.del(`${CACHE_PREFIX}:slug:${network.slug}`),
    ]);
  }

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
