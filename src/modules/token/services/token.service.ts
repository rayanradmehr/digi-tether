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

const ALLOWED_STANDARDS_BY_DRIVER: Readonly<Record<NetworkDriver, TokenStandard[]>> = {
  [NetworkDriver.EVM]: [TokenStandard.NATIVE, TokenStandard.ERC20],
  [NetworkDriver.TRON]: [TokenStandard.NATIVE, TokenStandard.TRC20],
};

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

  public async findAll(query: TokenQueryDto): Promise<PaginatedResult<TokenResponseDto>> {
    const result = await this.tokenRepository.findAll(query);
    return {
      ...result,
      data: result.data.map((t) => this.tokenMapper.toResponseDto(t)),
    };
  }

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

  public async findByNetworkId(
    networkId: string,
    query: TokenQueryDto,
  ): Promise<PaginatedResult<TokenResponseDto>> {
    return this.findAll({ ...query, networkId });
  }

  public async findActiveByNetworkId(networkId: string): Promise<TokenResponseDto[]> {
    const tokens = await this.tokenRepository.findActiveByNetworkId(networkId);
    return tokens.map((t) => this.tokenMapper.toResponseDto(t));
  }

  public async isActive(id: string): Promise<boolean> {
    const token = await this.tokenRepository.findById(id);
    return token !== null && token.status === TokenStatus.ACTIVE;
  }

  public async getDecimals(id: string): Promise<number> {
    const token = await this.requireToken(id);
    return token.decimals;
  }

  public async getConfirmations(id: string): Promise<number> {
    const token = await this.requireToken(id);
    if (token.confirmationsOverride !== null) {
      return token.confirmationsOverride;
    }
    return this.networkService.getRequiredConfirmations(token.networkId);
  }

  /**
   * Returns the block explorer URL for this token's contract address or symbol.
   * Returns null when the network has no explorerBaseUrl configured.
   */
  public async getExplorerUrl(id: string): Promise<string | null> {
    const token = await this.requireToken(id);
    const hashOrAddress = token.contractAddress ?? token.symbol;
    return this.networkService.getExplorerUrl(token.networkId, hashOrAddress);
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

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
        tokenType: token.type,
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

  public async enable(id: string): Promise<TokenResponseDto> {
    return this.update(id, { status: TokenStatus.ACTIVE });
  }

  public async disable(id: string): Promise<TokenResponseDto> {
    return this.update(id, { status: TokenStatus.INACTIVE });
  }

  public async deprecate(id: string): Promise<TokenResponseDto> {
    const token = await this.requireToken(id);
    if (token.status === TokenStatus.DEPRECATED) {
      throw new ConflictException(`Token '${id}' is already deprecated.`);
    }
    return this.update(id, { status: TokenStatus.DEPRECATED });
  }

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

  private async requireToken(id: string): Promise<Token> {
    const token = await this.tokenRepository.findById(id);
    if (token === null) {
      throw new NotFoundException('Token', id);
    }
    return token;
  }

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

  private async assertNoNativeTokenForNetwork(networkId: string): Promise<void> {
    const exists = await this.tokenRepository.existsNativeByNetworkId(networkId);
    if (exists) {
      throw new ConflictException(
        `Network '${networkId}' already has a native token. ` +
        'Only one native token is permitted per network (Invariant 1).',
      );
    }
  }

  private async assertSymbolIsAvailable(
    symbol: string,
    networkId: string,
    excludeId?: string,
  ): Promise<void> {
    const exists = await this.tokenRepository.existsBySymbolAndNetworkId(symbol, networkId);
    if (exists) {
      const isCurrentToken = excludeId !== undefined;
      if (!isCurrentToken) {
        throw new ConflictException(
          `A token with symbol '${symbol}' already exists on network '${networkId}'.`,
        );
      }
      const existing = await this.tokenRepository.findById(excludeId);
      if (existing === null || existing.symbol !== symbol) {
        throw new ConflictException(
          `A token with symbol '${symbol}' already exists on network '${networkId}'.`,
        );
      }
    }
  }

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

  private assertStatusTransitionAllowed(current: TokenStatus, next: TokenStatus): void {
    if (current === TokenStatus.DEPRECATED && next !== TokenStatus.DEPRECATED) {
      throw new ConflictException(
        `Cannot transition token status from '${current}' to '${next}'. ` +
        'DEPRECATED is a terminal state and cannot be reversed.',
      );
    }
  }

  private async invalidateTokenCache(id: string): Promise<void> {
    await this.cache.del(buildTokenCacheKey('id', id));
  }
}
