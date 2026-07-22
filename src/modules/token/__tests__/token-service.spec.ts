import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from '../services/token.service';
import { TokenRepository } from '../repositories/token.repository';
import { TokenMapper } from '../mappers/token.mapper';
import { NetworkService } from '@modules/network/services/network.service';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';
import { NetworkDriver } from '@modules/network/enums/network-driver.enum';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { Token } from '../entities/token.entity';
import type { TokenResponseDto } from '../dto/token-response.dto';
import type { NetworkResponseDto } from '@modules/network/dto/network-response.dto';
import type { CreateTokenDto } from '../dto/create-token.dto';
import type { UpdateTokenDto } from '../dto/update-token.dto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NETWORK_ID = '11111111-1111-1111-1111-111111111111';
const TOKEN_ID   = '22222222-2222-2222-2222-222222222222';

function makeNetwork(overrides: Partial<NetworkResponseDto> = {}): NetworkResponseDto {
  return {
    id: NETWORK_ID,
    name: 'Ethereum',
    slug: 'ethereum-mainnet',
    symbol: 'ETH',
    chainId: '1',
    nativeDecimals: 18,
    driverKey: NetworkDriver.EVM,
    explorerBaseUrl: 'https://etherscan.io',
    requiredConfirmations: 12,
    blockTimeSeconds: 12,
    isTestnet: false,
    isActive: true,
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: TOKEN_ID,
    networkId: NETWORK_ID,
    type: TokenType.CONTRACT,
    standard: TokenStandard.ERC20,
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    status: TokenStatus.ACTIVE,
    confirmationsOverride: null,
    logoUrl: null,
    description: null,
    version: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    network: {} as never,
    ...overrides,
  } as Token;
}

function makeResponseDto(token: Token): TokenResponseDto {
  return {
    id: token.id,
    networkId: token.networkId,
    type: token.type,
    standard: token.standard,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    contractAddress: token.contractAddress,
    status: token.status,
    confirmationsOverride: token.confirmationsOverride,
    logoUrl: token.logoUrl,
    description: token.description,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockRepository = (): jest.Mocked<TokenRepository> => ({
  findById: jest.fn(),
  findAll: jest.fn(),
  findByNetworkId: jest.fn(),
  findActiveByNetworkId: jest.fn(),
  existsNativeByNetworkId: jest.fn(),
  existsBySymbolAndNetworkId: jest.fn(),
  existsByContractAddressAndNetworkId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
} as jest.Mocked<TokenRepository>);

const mockMapper = (): jest.Mocked<TokenMapper> => ({
  toResponseDto: jest.fn((token: Token) => makeResponseDto(token)),
} as jest.Mocked<TokenMapper>);

const mockNetworkService = (): jest.Mocked<Pick<NetworkService, 'findById' | 'getRequiredConfirmations' | 'getExplorerUrl'>> => ({
  findById: jest.fn(),
  getRequiredConfirmations: jest.fn(),
  getExplorerUrl: jest.fn(),
});

const mockCache = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  reset: jest.fn(),
  wrap: jest.fn(),
});

const mockLogger = () => ({
  verbose: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TokenService', () => {
  let service: TokenService;
  let repo: jest.Mocked<TokenRepository>;
  let mapper: jest.Mocked<TokenMapper>;
  let networkService: jest.Mocked<Pick<NetworkService, 'findById' | 'getRequiredConfirmations' | 'getExplorerUrl'>>;
  let cache: ReturnType<typeof mockCache>;
  let logger: ReturnType<typeof mockLogger>;

  beforeEach(async () => {
    repo          = mockRepository();
    mapper        = mockMapper();
    networkService = mockNetworkService();
    cache         = mockCache();
    logger        = mockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: TokenRepository, useValue: repo },
        { provide: TokenMapper,     useValue: mapper },
        { provide: NetworkService,  useValue: networkService },
        { provide: INJECTION_TOKENS.LOGGER,           useValue: logger },
        { provide: INJECTION_TOKENS.CACHE,            useValue: cache },
        { provide: INJECTION_TOKENS.EVENT_PUBLISHER,  useValue: { publish: jest.fn(), publishAll: jest.fn() } },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns a paginated mapped result', async () => {
      const token = makeToken();
      const paged = { data: [token], total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
      repo.findAll.mockResolvedValue(paged);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(mapper.toResponseDto).toHaveBeenCalledWith(token);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('returns empty page when no tokens match filters', async () => {
      const paged = { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
      repo.findAll.mockResolvedValue(paged);

      const result = await service.findAll({ status: TokenStatus.DEPRECATED });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('passes all filters to repository', async () => {
      const paged = { data: [], total: 0, page: 1, limit: 5, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
      repo.findAll.mockResolvedValue(paged);

      await service.findAll({ page: 1, limit: 5, networkId: NETWORK_ID, type: TokenType.CONTRACT, standard: TokenStandard.ERC20, status: TokenStatus.ACTIVE });

      expect(repo.findAll).toHaveBeenCalledWith(expect.objectContaining({
        networkId: NETWORK_ID,
        type: TokenType.CONTRACT,
        standard: TokenStandard.ERC20,
        status: TokenStatus.ACTIVE,
      }));
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns cached dto on cache hit (wrap called once)', async () => {
      const token = makeToken();
      const dto   = makeResponseDto(token);
      cache.wrap.mockResolvedValue(dto);

      const result = await service.findById(TOKEN_ID);

      expect(cache.wrap).toHaveBeenCalledWith(
        'token:id:' + TOKEN_ID,
        expect.any(Function),
        expect.any(Number),
      );
      expect(result).toEqual(dto);
    });

    it('calls repository inside wrap factory on cache miss', async () => {
      const token = makeToken();
      repo.findById.mockResolvedValue(token);
      cache.wrap.mockImplementation(async (_key, factory) => factory());

      const result = await service.findById(TOKEN_ID);

      expect(repo.findById).toHaveBeenCalledWith(TOKEN_ID);
      expect(mapper.toResponseDto).toHaveBeenCalledWith(token);
      expect(result.id).toBe(TOKEN_ID);
    });

    it('throws NotFoundException when token does not exist (cache miss + db miss)', async () => {
      repo.findById.mockResolvedValue(null);
      cache.wrap.mockImplementation(async (_key, factory) => factory());

      await expect(service.findById('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findByNetworkId
  // -------------------------------------------------------------------------

  describe('findByNetworkId', () => {
    it('delegates to findAll with networkId injected', async () => {
      const paged = { data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false };
      repo.findAll.mockResolvedValue(paged);

      await service.findByNetworkId(NETWORK_ID, { page: 1, limit: 20 });

      expect(repo.findAll).toHaveBeenCalledWith(expect.objectContaining({ networkId: NETWORK_ID }));
    });
  });

  // -------------------------------------------------------------------------
  // findActiveByNetworkId
  // -------------------------------------------------------------------------

  describe('findActiveByNetworkId', () => {
    it('returns mapped active tokens', async () => {
      const token = makeToken();
      repo.findActiveByNetworkId.mockResolvedValue([token]);

      const result = await service.findActiveByNetworkId(NETWORK_ID);

      expect(repo.findActiveByNetworkId).toHaveBeenCalledWith(NETWORK_ID);
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no active tokens', async () => {
      repo.findActiveByNetworkId.mockResolvedValue([]);
      const result = await service.findActiveByNetworkId(NETWORK_ID);
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // isActive
  // -------------------------------------------------------------------------

  describe('isActive', () => {
    it('returns true when token is ACTIVE', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.ACTIVE }));
      expect(await service.isActive(TOKEN_ID)).toBe(true);
    });

    it('returns false when token is INACTIVE', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.INACTIVE }));
      expect(await service.isActive(TOKEN_ID)).toBe(false);
    });

    it('returns false when token does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      expect(await service.isActive(TOKEN_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDecimals
  // -------------------------------------------------------------------------

  describe('getDecimals', () => {
    it('returns decimals of existing token', async () => {
      repo.findById.mockResolvedValue(makeToken({ decimals: 6 }));
      expect(await service.getDecimals(TOKEN_ID)).toBe(6);
    });

    it('throws NotFoundException for missing token', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getDecimals(TOKEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // getConfirmations
  // -------------------------------------------------------------------------

  describe('getConfirmations', () => {
    it('returns override when set', async () => {
      repo.findById.mockResolvedValue(makeToken({ confirmationsOverride: 20 }));
      expect(await service.getConfirmations(TOKEN_ID)).toBe(20);
    });

    it('returns network default when override is null', async () => {
      repo.findById.mockResolvedValue(makeToken({ confirmationsOverride: null }));
      networkService.getRequiredConfirmations.mockResolvedValue(12);
      expect(await service.getConfirmations(TOKEN_ID)).toBe(12);
      expect(networkService.getRequiredConfirmations).toHaveBeenCalledWith(NETWORK_ID);
    });

    it('throws NotFoundException for missing token', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getConfirmations(TOKEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    const baseDto: CreateTokenDto = {
      networkId: NETWORK_ID,
      type: TokenType.CONTRACT,
      standard: TokenStandard.ERC20,
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    };

    beforeEach(() => {
      networkService.findById.mockResolvedValue(makeNetwork());
      repo.existsNativeByNetworkId.mockResolvedValue(false);
      repo.existsBySymbolAndNetworkId.mockResolvedValue(false);
      repo.existsByContractAddressAndNetworkId.mockResolvedValue(false);
    });

    it('creates and returns a token DTO with defaults applied', async () => {
      const token = makeToken();
      repo.create.mockResolvedValue(token);

      const result = await service.create(baseDto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          networkId: NETWORK_ID,
          status: TokenStatus.ACTIVE,
          contractAddress: baseDto.contractAddress,
          confirmationsOverride: null,
          logoUrl: null,
          description: null,
        }),
      );
      expect(mapper.toResponseDto).toHaveBeenCalledWith(token);
      expect(result.symbol).toBe('USDT');
    });

    it('throws NotFoundException when network does not exist', async () => {
      networkService.findById.mockRejectedValue(new NotFoundException('Network', NETWORK_ID));
      await expect(service.create(baseDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when network is inactive', async () => {
      networkService.findById.mockResolvedValue(makeNetwork({ isActive: false }));
      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException for incompatible standard × driver (ERC20 on TRON)', async () => {
      networkService.findById.mockResolvedValue(makeNetwork({ driverKey: NetworkDriver.TRON }));
      await expect(service.create({ ...baseDto, standard: TokenStandard.ERC20 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException for incompatible standard × driver (TRC20 on EVM)', async () => {
      networkService.findById.mockResolvedValue(makeNetwork({ driverKey: NetworkDriver.EVM }));
      await expect(service.create({ ...baseDto, standard: TokenStandard.TRC20 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows NATIVE standard on EVM network', async () => {
      const token = makeToken({ type: TokenType.NATIVE, standard: TokenStandard.NATIVE, contractAddress: null });
      repo.create.mockResolvedValue(token);
      repo.existsNativeByNetworkId.mockResolvedValue(false);

      await service.create({
        ...baseDto,
        type: TokenType.NATIVE,
        standard: TokenStandard.NATIVE,
        contractAddress: null,
      });

      expect(repo.existsNativeByNetworkId).toHaveBeenCalledWith(NETWORK_ID);
    });

    it('throws ConflictException when native token already exists for network', async () => {
      networkService.findById.mockResolvedValue(makeNetwork());
      repo.existsNativeByNetworkId.mockResolvedValue(true);

      await expect(
        service.create({ ...baseDto, type: TokenType.NATIVE, standard: TokenStandard.NATIVE, contractAddress: null }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException on duplicate symbol', async () => {
      repo.existsBySymbolAndNetworkId.mockResolvedValue(true);
      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException on duplicate contract address', async () => {
      repo.existsByContractAddressAndNetworkId.mockResolvedValue(true);
      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies custom status when provided', async () => {
      const token = makeToken({ status: TokenStatus.INACTIVE });
      repo.create.mockResolvedValue(token);

      await service.create({ ...baseDto, status: TokenStatus.INACTIVE });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: TokenStatus.INACTIVE }),
      );
    });

    it('publishes token.created event', async () => {
      const token = makeToken();
      repo.create.mockResolvedValue(token);
      const module = await Test.createTestingModule({
        providers: [
          TokenService,
          { provide: TokenRepository, useValue: repo },
          { provide: TokenMapper,     useValue: mapper },
          { provide: NetworkService,  useValue: networkService },
          { provide: INJECTION_TOKENS.LOGGER,           useValue: logger },
          { provide: INJECTION_TOKENS.CACHE,            useValue: cache },
          { provide: INJECTION_TOKENS.EVENT_PUBLISHER,  useValue: { publish: jest.fn(), publishAll: jest.fn() } },
        ],
      }).compile();
      const svc    = module.get(TokenService);
      const ep     = module.get<{ publish: jest.Mock }>(INJECTION_TOKENS.EVENT_PUBLISHER as never);

      await svc.create(baseDto);

      expect(ep.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'token.created', tokenId: token.id }),
      );
    });

    it('emits a structured log entry after creation', async () => {
      const token = makeToken();
      repo.create.mockResolvedValue(token);

      await service.create(baseDto);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Token created'),
        'TokenService',
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates mutable fields and returns DTO', async () => {
      const token   = makeToken();
      const updated = makeToken({ name: 'USD Tether' });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(updated);
      cache.del.mockResolvedValue(undefined);

      const dto: UpdateTokenDto = { name: 'USD Tether' };
      const result = await service.update(TOKEN_ID, dto);

      expect(repo.update).toHaveBeenCalledWith(token, expect.objectContaining({ name: 'USD Tether' }));
      expect(result.name).toBe('USD Tether');
    });

    it('throws NotFoundException when token does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('bad-id', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when transitioning FROM DEPRECATED', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.DEPRECATED }));
      await expect(
        service.update(TOKEN_ID, { status: TokenStatus.ACTIVE }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException on duplicate symbol change', async () => {
      repo.findById.mockResolvedValue(makeToken({ symbol: 'USDT' }));
      repo.existsBySymbolAndNetworkId.mockResolvedValue(true);
      // Returning null simulates that the conflicting record is a different token
      repo.findById.mockResolvedValueOnce(makeToken()).mockResolvedValueOnce(null);

      await expect(
        service.update(TOKEN_ID, { symbol: 'DAI' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not re-check symbol uniqueness when symbol is unchanged', async () => {
      const token = makeToken({ symbol: 'USDT' });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(token);
      cache.del.mockResolvedValue(undefined);

      await service.update(TOKEN_ID, { symbol: 'USDT' });

      expect(repo.existsBySymbolAndNetworkId).not.toHaveBeenCalled();
    });

    it('invalidates cache entry after update', async () => {
      const token = makeToken();
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(token);
      cache.del.mockResolvedValue(undefined);

      await service.update(TOKEN_ID, { name: 'New Name' });

      expect(cache.del).toHaveBeenCalledWith('token:id:' + TOKEN_ID);
    });

    it('publishes token.status.changed event when status changes', async () => {
      const token   = makeToken({ status: TokenStatus.ACTIVE });
      const updated = makeToken({ status: TokenStatus.INACTIVE });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(updated);
      cache.del.mockResolvedValue(undefined);

      const publisher = { publish: jest.fn(), publishAll: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          TokenService,
          { provide: TokenRepository, useValue: repo },
          { provide: TokenMapper,     useValue: mapper },
          { provide: NetworkService,  useValue: networkService },
          { provide: INJECTION_TOKENS.LOGGER,           useValue: logger },
          { provide: INJECTION_TOKENS.CACHE,            useValue: cache },
          { provide: INJECTION_TOKENS.EVENT_PUBLISHER,  useValue: publisher },
        ],
      }).compile();
      const svc = module.get(TokenService);

      await svc.update(TOKEN_ID, { status: TokenStatus.INACTIVE });

      expect(publisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'token.status.changed', previousStatus: TokenStatus.ACTIVE, newStatus: TokenStatus.INACTIVE }),
      );
    });

    it('does NOT publish event when status is unchanged', async () => {
      const token = makeToken({ status: TokenStatus.ACTIVE });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(token);
      cache.del.mockResolvedValue(undefined);

      const publisher = { publish: jest.fn(), publishAll: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          TokenService,
          { provide: TokenRepository, useValue: repo },
          { provide: TokenMapper,     useValue: mapper },
          { provide: NetworkService,  useValue: networkService },
          { provide: INJECTION_TOKENS.LOGGER,           useValue: logger },
          { provide: INJECTION_TOKENS.CACHE,            useValue: cache },
          { provide: INJECTION_TOKENS.EVENT_PUBLISHER,  useValue: publisher },
        ],
      }).compile();
      const svc = module.get(TokenService);

      await svc.update(TOKEN_ID, { name: 'Different name' });

      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // enable
  // -------------------------------------------------------------------------

  describe('enable', () => {
    it('sets status to ACTIVE', async () => {
      const token   = makeToken({ status: TokenStatus.INACTIVE });
      const updated = makeToken({ status: TokenStatus.ACTIVE });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(updated);
      cache.del.mockResolvedValue(undefined);

      const result = await service.enable(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.ACTIVE);
    });

    it('is idempotent when token is already ACTIVE', async () => {
      const token = makeToken({ status: TokenStatus.ACTIVE });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(token);
      cache.del.mockResolvedValue(undefined);

      await expect(service.enable(TOKEN_ID)).resolves.not.toThrow();
    });

    it('throws ConflictException when token is DEPRECATED', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.DEPRECATED }));
      await expect(service.enable(TOKEN_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // disable
  // -------------------------------------------------------------------------

  describe('disable', () => {
    it('sets status to INACTIVE', async () => {
      const token   = makeToken({ status: TokenStatus.ACTIVE });
      const updated = makeToken({ status: TokenStatus.INACTIVE });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(updated);
      cache.del.mockResolvedValue(undefined);

      const result = await service.disable(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.INACTIVE);
    });

    it('throws ConflictException when token is DEPRECATED', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.DEPRECATED }));
      await expect(service.disable(TOKEN_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // deprecate
  // -------------------------------------------------------------------------

  describe('deprecate', () => {
    it('sets status to DEPRECATED', async () => {
      const token   = makeToken({ status: TokenStatus.ACTIVE });
      const updated = makeToken({ status: TokenStatus.DEPRECATED });
      repo.findById.mockResolvedValue(token);
      repo.update.mockResolvedValue(updated);
      cache.del.mockResolvedValue(undefined);

      const result = await service.deprecate(TOKEN_ID);
      expect(result.status).toBe(TokenStatus.DEPRECATED);
    });

    it('throws ConflictException when already DEPRECATED', async () => {
      repo.findById.mockResolvedValue(makeToken({ status: TokenStatus.DEPRECATED }));
      await expect(service.deprecate(TOKEN_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when token does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.deprecate(TOKEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    it('calls softDelete and invalidates cache', async () => {
      const token = makeToken();
      repo.findById.mockResolvedValue(token);
      repo.softDelete.mockResolvedValue(undefined);
      cache.del.mockResolvedValue(undefined);

      await service.remove(TOKEN_ID);

      expect(repo.softDelete).toHaveBeenCalledWith(token);
      expect(cache.del).toHaveBeenCalledWith('token:id:' + TOKEN_ID);
    });

    it('logs a structured entry after soft-delete', async () => {
      const token = makeToken();
      repo.findById.mockResolvedValue(token);
      repo.softDelete.mockResolvedValue(undefined);
      cache.del.mockResolvedValue(undefined);

      await service.remove(TOKEN_ID);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('soft-deleted'),
        'TokenService',
      );
    });

    it('throws NotFoundException when token does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove('bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // getExplorerUrl
  // -------------------------------------------------------------------------

  describe('getExplorerUrl', () => {
    it('passes contractAddress for contract tokens', async () => {
      const token = makeToken({ contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' });
      repo.findById.mockResolvedValue(token);
      networkService.getExplorerUrl.mockResolvedValue('https://etherscan.io/search?q=0xdAC17F958D2ee523a2206206994597C13D831ec7');

      const url = await service.getExplorerUrl(TOKEN_ID);

      expect(networkService.getExplorerUrl).toHaveBeenCalledWith(NETWORK_ID, '0xdAC17F958D2ee523a2206206994597C13D831ec7');
      expect(url).toContain('search?q=');
    });

    it('passes symbol for native tokens (no contractAddress)', async () => {
      const token = makeToken({ type: TokenType.NATIVE, contractAddress: null, symbol: 'ETH' });
      repo.findById.mockResolvedValue(token);
      networkService.getExplorerUrl.mockResolvedValue('https://etherscan.io/search?q=ETH');

      await service.getExplorerUrl(TOKEN_ID);

      expect(networkService.getExplorerUrl).toHaveBeenCalledWith(NETWORK_ID, 'ETH');
    });
  });
});
