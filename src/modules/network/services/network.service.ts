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

  public async findAll(
    query: NetworkQueryDto,
  ): Promise<PaginatedResult<NetworkResponseDto>> {
    const result = await this.networkRepository.findAll(query);
    return {
      ...result,
      data: result.data.map((n) => this.toResponseDto(n)),
    };
  }

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

  public async findActive(): Promise<NetworkResponseDto[]> {
    const networks = await this.networkRepository.findActive();
    return networks.map((n) => this.toResponseDto(n));
  }

  public async isActive(id: string): Promise<boolean> {
    const network = await this.networkRepository.findById(id);
    return network !== null && network.isActive;
  }

  public async getDriverKey(id: string): Promise<NetworkDriver> {
    const network = await this.requireNetwork(id);
    if (!network.isActive) {
      throw new ConflictException(
        `Network '${network.slug}' (${id}) is inactive and cannot be used for operations`,
      );
    }
    return network.driverKey;
  }

  public async getRequiredConfirmations(id: string): Promise<number> {
    const network = await this.requireNetwork(id);
    return network.requiredConfirmations;
  }

  /**
   * Constructs a block explorer URL for a given transaction hash or address.
   * Returns null when no explorerBaseUrl is configured for this network.
   */
  public async getExplorerUrl(id: string, hashOrAddress: string): Promise<string | null> {
    const network = await this.requireNetwork(id);
    if (!network.explorerBaseUrl) return null;
    const base = network.explorerBaseUrl.replace(/\/+$/, '');
    return `${base}/search?q=${hashOrAddress}`;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

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
      rpcUrl: dto.rpcUrl,
      explorerBaseUrl: dto.explorerBaseUrl ?? null,
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

  public async update(id: string, dto: UpdateNetworkDto): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);

    const changes: Partial<Network> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.symbol !== undefined) changes.symbol = dto.symbol;
    if (dto.nativeDecimals !== undefined) changes.nativeDecimals = dto.nativeDecimals;
    if (dto.driverKey !== undefined) changes.driverKey = dto.driverKey;
    if (dto.rpcUrl !== undefined) changes.rpcUrl = dto.rpcUrl;
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

  public async activate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);
    const updated = await this.networkRepository.update(network, { isActive: true });
    await this.invalidateNetworkCache(network);
    this.logger.log(`Network activated: slug='${network.slug}' id='${id}'`, NetworkService.name);
    return this.toResponseDto(updated);
  }

  public async deactivate(id: string): Promise<NetworkResponseDto> {
    const network = await this.requireNetwork(id);
    const updated = await this.networkRepository.update(network, { isActive: false });
    await this.invalidateNetworkCache(network);
    this.logger.log(`Network deactivated: slug='${network.slug}' id='${id}'`, NetworkService.name);
    return this.toResponseDto(updated);
  }

  public async remove(id: string): Promise<void> {
    const network = await this.requireNetwork(id);
    await this.networkRepository.softDelete(network);
    await this.invalidateNetworkCache(network);
    this.logger.log(`Network soft-deleted: slug='${network.slug}' id='${id}'`, NetworkService.name);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async requireNetwork(id: string): Promise<Network> {
    const network = await this.networkRepository.findById(id);
    if (network === null) {
      throw new NotFoundException('Network', id);
    }
    return network;
  }

  private async assertSlugIsAvailable(slug: string): Promise<void> {
    const exists = await this.networkRepository.existsBySlug(slug);
    if (exists) {
      throw new ConflictException(`A network with slug '${slug}' already exists`);
    }
  }

  private async assertChainIdIsAvailable(chainId: string): Promise<void> {
    const exists = await this.networkRepository.existsByChainId(chainId);
    if (exists) {
      throw new ConflictException(`A network with chainId '${chainId}' already exists`);
    }
  }

  private async invalidateNetworkCache(network: Network): Promise<void> {
    await Promise.all([
      this.cache.del(buildCacheKey(CACHE_PREFIX.NETWORK, 'id', network.id)),
      this.cache.del(buildCacheKey(CACHE_PREFIX.NETWORK, 'slug', network.slug)),
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
      rpcUrl: network.rpcUrl,
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
