import { Test, TestingModule } from '@nestjs/testing';
import { NetworkService } from '../services/network.service';
import { NetworkRepository } from '../repositories/network.repository';
import { NetworkDriver } from '../enums/network-driver.enum';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { Network } from '../entities/network.entity';
import type { CreateNetworkDto } from '../dto/create-network.dto';
import type { UpdateNetworkDto } from '../dto/update-network.dto';
import type { NetworkQueryDto } from '../dto/network-query.dto';
import type { NetworkResponseDto } from '../dto/network-response.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeNetwork = (overrides: Partial<Network> = {}): Network =>
  ({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
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
    version: 1,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as Network);

const makeResponseDto = (overrides: Partial<NetworkResponseDto> = {}): NetworkResponseDto =>
  ({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
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
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  } as NetworkResponseDto);

const makePaginatedResult = (
  data: NetworkResponseDto[] = [],
): PaginatedResult<NetworkResponseDto> => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NetworkService', () => {
  let service: NetworkService;
  let repo: jest.Mocked<NetworkRepository>;
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    reset: jest.Mock;
    wrap: jest.Mock;
  };
  let logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findByChainId: jest.fn(),
      findAll: jest.fn(),
      findActive: jest.fn(),
      existsBySlug: jest.fn(),
      existsByChainId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<NetworkRepository>;

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
      // Default: execute the factory (cache-miss behaviour).
      wrap: jest.fn().mockImplementation((_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
    };

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NetworkService,
        { provide: NetworkRepository, useValue: repo },
        { provide: INJECTION_TOKENS.LOGGER, useValue: logger },
        { provide: INJECTION_TOKENS.CACHE, useValue: cache },
      ],
    }).compile();

    service = module.get(NetworkService);
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns a mapped paginated result with correct shape', async () => {
      const network = makeNetwork();
      const paginatedEntities = {
        data: [network],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      repo.findAll.mockResolvedValueOnce(paginatedEntities);

      const query: NetworkQueryDto = { page: 1, limit: 20 };
      const result = await service.findAll(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(network.id);
      expect(result.data[0]).not.toHaveProperty('deletedAt');
      expect(result.data[0]).not.toHaveProperty('version');
      expect(result.total).toBe(1);
    });

    it('returns an empty paginated result when there are no records', async () => {
      repo.findAll.mockResolvedValueOnce(makePaginatedResult() as PaginatedResult<Network>);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('passes filter parameters to repository unchanged', async () => {
      repo.findAll.mockResolvedValueOnce(makePaginatedResult() as PaginatedResult<Network>);

      const query: NetworkQueryDto = {
        page: 2,
        limit: 10,
        driverKey: NetworkDriver.EVM,
        isActive: true,
        isTestnet: false,
      };
      await service.findAll(query);

      expect(repo.findAll).toHaveBeenCalledWith(query);
    });

    it('never calls cache for list queries', async () => {
      repo.findAll.mockResolvedValueOnce(makePaginatedResult() as PaginatedResult<Network>);

      await service.findAll({ page: 1, limit: 20 });

      expect(cache.wrap).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('invokes cache.wrap with the correct key', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);

      await service.findById(network.id);

      expect(cache.wrap).toHaveBeenCalledWith(
        `network:id:${network.id}`,
        expect.any(Function),
        expect.any(Number),
      );
    });

    it('returns the mapped response DTO on cache miss', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);

      const result = await service.findById(network.id);

      expect(result.id).toBe(network.id);
      expect(result.slug).toBe(network.slug);
      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('version');
    });

    it('returns cached DTO directly on cache hit without calling repo', async () => {
      const cachedDto = makeResponseDto();
      cache.wrap.mockResolvedValueOnce(cachedDto);

      const result = await service.findById(cachedDto.id);

      expect(result).toEqual(cachedDto);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when repo returns null', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.findById('non-existent-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findBySlug
  // -------------------------------------------------------------------------
  describe('findBySlug', () => {
    it('invokes cache.wrap with the correct slug key', async () => {
      const network = makeNetwork();
      repo.findBySlug.mockResolvedValueOnce(network);

      await service.findBySlug('ethereum-mainnet');

      expect(cache.wrap).toHaveBeenCalledWith(
        'network:slug:ethereum-mainnet',
        expect.any(Function),
        expect.any(Number),
      );
    });

    it('returns the mapped response DTO on cache miss', async () => {
      const network = makeNetwork();
      repo.findBySlug.mockResolvedValueOnce(network);

      const result = await service.findBySlug('ethereum-mainnet');

      expect(result.slug).toBe('ethereum-mainnet');
    });

    it('returns cached DTO directly on cache hit without calling repo', async () => {
      const cachedDto = makeResponseDto();
      cache.wrap.mockResolvedValueOnce(cachedDto);

      const result = await service.findBySlug('ethereum-mainnet');

      expect(result).toEqual(cachedDto);
      expect(repo.findBySlug).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when slug does not exist', async () => {
      repo.findBySlug.mockResolvedValueOnce(null);

      await expect(service.findBySlug('non-existent-slug')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // findActive
  // -------------------------------------------------------------------------
  describe('findActive', () => {
    it('returns mapped DTOs for all active networks', async () => {
      const networks = [makeNetwork(), makeNetwork({ id: 'bbbb', slug: 'bsc-mainnet' })];
      repo.findActive.mockResolvedValueOnce(networks);

      const result = await service.findActive();

      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('deletedAt');
    });

    it('returns an empty array when no networks are active', async () => {
      repo.findActive.mockResolvedValueOnce([]);

      const result = await service.findActive();

      expect(result).toEqual([]);
    });

    it('never calls cache for findActive', async () => {
      repo.findActive.mockResolvedValueOnce([]);

      await service.findActive();

      expect(cache.wrap).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // isActive
  // -------------------------------------------------------------------------
  describe('isActive', () => {
    it('returns true when the network exists and isActive is true', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: true }));

      expect(await service.isActive('uuid-1')).toBe(true);
    });

    it('returns false when the network exists but isActive is false', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: false }));

      expect(await service.isActive('uuid-1')).toBe(false);
    });

    it('returns false when the network does not exist (never throws)', async () => {
      repo.findById.mockResolvedValueOnce(null);

      expect(await service.isActive('missing')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDriverKey
  // -------------------------------------------------------------------------
  describe('getDriverKey', () => {
    it('returns the driver key for an active network', async () => {
      repo.findById.mockResolvedValueOnce(
        makeNetwork({ driverKey: NetworkDriver.EVM, isActive: true }),
      );

      expect(await service.getDriverKey('uuid-1')).toBe(NetworkDriver.EVM);
    });

    it('throws ConflictException when the network is inactive', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: false }));

      await expect(service.getDriverKey('uuid-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.getDriverKey('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredConfirmations
  // -------------------------------------------------------------------------
  describe('getRequiredConfirmations', () => {
    it('returns the configured confirmation count', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ requiredConfirmations: 30 }));

      expect(await service.getRequiredConfirmations('uuid-1')).toBe(30);
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.getRequiredConfirmations('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // getExplorerUrl
  // -------------------------------------------------------------------------
  describe('getExplorerUrl', () => {
    it('builds a correctly formatted explorer URL', async () => {
      repo.findById.mockResolvedValueOnce(
        makeNetwork({ explorerBaseUrl: 'https://etherscan.io' }),
      );

      const url = await service.getExplorerUrl('uuid-1', '0xabc123');

      expect(url).toBe('https://etherscan.io/search?q=0xabc123');
    });

    it('strips a trailing slash from the base URL', async () => {
      repo.findById.mockResolvedValueOnce(
        makeNetwork({ explorerBaseUrl: 'https://etherscan.io/' }),
      );

      const url = await service.getExplorerUrl('uuid-1', '0xabc');

      expect(url).toBe('https://etherscan.io/search?q=0xabc');
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.getExplorerUrl('missing', '0xabc')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const baseDto: CreateNetworkDto = {
      name: 'Ethereum',
      slug: 'ethereum-mainnet',
      symbol: 'ETH',
      chainId: '1',
      nativeDecimals: 18,
      driverKey: NetworkDriver.EVM,
      explorerBaseUrl: 'https://etherscan.io',
    };

    it('creates and returns the new network with mapped DTO', async () => {
      repo.existsBySlug.mockResolvedValueOnce(false);
      repo.existsByChainId.mockResolvedValueOnce(false);
      repo.create.mockResolvedValueOnce(makeNetwork());

      const result = await service.create(baseDto);

      expect(repo.create).toHaveBeenCalledOnce();
      expect(result.slug).toBe('ethereum-mainnet');
      expect(result).not.toHaveProperty('deletedAt');
    });

    it('applies defaults when optional fields are omitted', async () => {
      repo.existsBySlug.mockResolvedValueOnce(false);
      repo.existsByChainId.mockResolvedValueOnce(false);
      const created = makeNetwork({
        requiredConfirmations: 12,
        blockTimeSeconds: 12,
        isTestnet: false,
        isActive: true,
        description: null,
      });
      repo.create.mockResolvedValueOnce(created);

      await service.create(baseDto);

      const callArg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<Network>;
      expect(callArg.requiredConfirmations).toBe(12);
      expect(callArg.blockTimeSeconds).toBe(12);
      expect(callArg.isTestnet).toBe(false);
      expect(callArg.isActive).toBe(true);
      expect(callArg.description).toBeNull();
    });

    it('throws ConflictException when slug is already in use', async () => {
      repo.existsBySlug.mockResolvedValueOnce(true);

      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when chainId is already in use', async () => {
      repo.existsBySlug.mockResolvedValueOnce(false);
      repo.existsByChainId.mockResolvedValueOnce(true);

      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('checks slug uniqueness before chainId uniqueness', async () => {
      repo.existsBySlug.mockResolvedValueOnce(true);

      await expect(service.create(baseDto)).rejects.toBeInstanceOf(ConflictException);
      // chainId check must not execute if slug already fails
      expect(repo.existsByChainId).not.toHaveBeenCalled();
    });

    it('logs a structured message after successful creation', async () => {
      repo.existsBySlug.mockResolvedValueOnce(false);
      repo.existsByChainId.mockResolvedValueOnce(false);
      repo.create.mockResolvedValueOnce(makeNetwork());

      await service.create(baseDto);

      expect(logger.log).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('merges only the provided fields and returns updated DTO', async () => {
      const network = makeNetwork();
      const updated = makeNetwork({ name: 'Ethereum Mainnet' });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(updated);

      const dto: UpdateNetworkDto = { name: 'Ethereum Mainnet' };
      const result = await service.update(network.id, dto);

      expect(repo.update).toHaveBeenCalledOnce();
      const callArgs = (repo.update as jest.Mock).mock.calls[0] as [Network, Partial<Network>];
      expect(callArgs[1]).toEqual({ name: 'Ethereum Mainnet' });
      expect(result.name).toBe('Ethereum Mainnet');
    });

    it('invalidates both UUID and slug cache keys after update', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      await service.update(network.id, { name: 'New Name' });

      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(cache.del).toHaveBeenCalledWith(`network:id:${network.id}`);
      expect(cache.del).toHaveBeenCalledWith(`network:slug:${network.slug}`);
    });

    it('does not pass undefined fields to the repository', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      // dto has only symbol defined
      await service.update(network.id, { symbol: 'WETH' });

      const callArgs = (repo.update as jest.Mock).mock.calls[0] as [Network, Partial<Network>];
      expect(callArgs[1]).toStrictEqual({ symbol: 'WETH' });
      expect(callArgs[1]).not.toHaveProperty('name');
      expect(callArgs[1]).not.toHaveProperty('slug');
      expect(callArgs[1]).not.toHaveProperty('chainId');
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // activate
  // -------------------------------------------------------------------------
  describe('activate', () => {
    it('sets isActive to true and returns the updated DTO', async () => {
      const network = makeNetwork({ isActive: false });
      const updated = makeNetwork({ isActive: true });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(updated);

      const result = await service.activate(network.id);

      expect(repo.update).toHaveBeenCalledWith(network, { isActive: true });
      expect(result.isActive).toBe(true);
    });

    it('is idempotent when called on an already-active network', async () => {
      const network = makeNetwork({ isActive: true });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      const result = await service.activate(network.id);

      expect(result.isActive).toBe(true);
    });

    it('invalidates both cache keys after activation', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      await service.activate(network.id);

      expect(cache.del).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.activate('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // deactivate
  // -------------------------------------------------------------------------
  describe('deactivate', () => {
    it('sets isActive to false and returns the updated DTO', async () => {
      const network = makeNetwork({ isActive: true });
      const updated = makeNetwork({ isActive: false });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(updated);

      const result = await service.deactivate(network.id);

      expect(repo.update).toHaveBeenCalledWith(network, { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('is idempotent when called on an already-inactive network', async () => {
      const network = makeNetwork({ isActive: false });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      const result = await service.deactivate(network.id);

      expect(result.isActive).toBe(false);
    });

    it('invalidates both cache keys after deactivation', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce(network);

      await service.deactivate(network.id);

      expect(cache.del).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.deactivate('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove (soft-delete)
  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('calls softDelete on the repository with the correct entity', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.softDelete.mockResolvedValueOnce(undefined);

      await service.remove(network.id);

      expect(repo.softDelete).toHaveBeenCalledWith(network);
    });

    it('invalidates both cache keys after soft-deletion', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.softDelete.mockResolvedValueOnce(undefined);

      await service.remove(network.id);

      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(cache.del).toHaveBeenCalledWith(`network:id:${network.id}`);
      expect(cache.del).toHaveBeenCalledWith(`network:slug:${network.slug}`);
    });

    it('returns void (undefined) on success', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.softDelete.mockResolvedValueOnce(undefined);

      const result = await service.remove(network.id);

      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when the network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('logs a structured message after successful soft-deletion', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.softDelete.mockResolvedValueOnce(undefined);

      await service.remove(network.id);

      expect(logger.log).toHaveBeenCalledOnce();
    });
  });
});
