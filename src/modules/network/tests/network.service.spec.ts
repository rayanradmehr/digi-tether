import { Test, TestingModule } from '@nestjs/testing';
import { NetworkService } from '../services/network.service';
import { NetworkRepository } from '../repositories/network.repository';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import { NotFoundException } from '@core/exceptions/not-found.exception';
import { ConflictException } from '@core/exceptions/conflict.exception';
import type { Network } from '../entities/network.entity';
import type { CreateNetworkDto } from '../dto/create-network.dto';
import type { UpdateNetworkDto } from '../dto/update-network.dto';
import type { NetworkQueryDto } from '../dto/network-query.dto';

const makeNetwork = (overrides: Partial<Network> = {}): Network =>
  ({
    id: 'uuid-1',
    name: 'Ethereum',
    slug: 'ethereum-mainnet',
    symbol: 'ETH',
    chainId: '1',
    nativeDecimals: 18,
    driverKey: 'evm',
    explorerBaseUrl: 'https://etherscan.io',
    requiredConfirmations: 12,
    blockTimeSeconds: 12,
    isTestnet: false,
    isActive: true,
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  } as Network);

describe('NetworkService', () => {
  let service: NetworkService;
  let repo: jest.Mocked<NetworkRepository>;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock; reset: jest.Mock; wrap: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock; verbose: jest.Mock };

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findByChainId: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as jest.Mocked<NetworkRepository>;

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
      wrap: jest.fn(),
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
  // findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('returns cached dto when cache hit', async () => {
      const dto = { id: 'uuid-1', name: 'Ethereum' };
      cache.get.mockResolvedValueOnce(dto);

      const result = await service.findById('uuid-1');

      expect(result).toEqual(dto);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('fetches from repo on cache miss and stores result', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);

      const result = await service.findById('uuid-1');

      expect(repo.findById).toHaveBeenCalledWith('uuid-1');
      expect(cache.set).toHaveBeenCalled();
      expect(result.id).toBe('uuid-1');
    });

    it('throws NotFoundException when network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // isActive
  // -------------------------------------------------------------------------
  describe('isActive', () => {
    it('returns true for an active network', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: true }));
      expect(await service.isActive('uuid-1')).toBe(true);
    });

    it('returns false for an inactive network', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: false }));
      expect(await service.isActive('uuid-1')).toBe(false);
    });

    it('returns false when network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);
      expect(await service.isActive('missing')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDriverKey
  // -------------------------------------------------------------------------
  describe('getDriverKey', () => {
    it('returns the driver key for an active network', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ driverKey: 'evm', isActive: true }));
      expect(await service.getDriverKey('uuid-1')).toBe('evm');
    });

    it('throws when the network is inactive', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ isActive: false }));
      await expect(service.getDriverKey('uuid-1')).rejects.toThrow();
    });

    it('throws NotFoundException when network missing', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(service.getDriverKey('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // getConfirmations
  // -------------------------------------------------------------------------
  describe('getConfirmations', () => {
    it('returns the configured confirmation count', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ requiredConfirmations: 30 }));
      expect(await service.getConfirmations('uuid-1')).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // getExplorerUrl
  // -------------------------------------------------------------------------
  describe('getExplorerUrl', () => {
    it('builds a correctly formatted explorer URL', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ explorerBaseUrl: 'https://etherscan.io' }));
      const url = await service.getExplorerUrl('uuid-1', '0xabc');
      expect(url).toBe('https://etherscan.io/search?q=0xabc');
    });

    it('strips trailing slash from base URL', async () => {
      repo.findById.mockResolvedValueOnce(makeNetwork({ explorerBaseUrl: 'https://etherscan.io/' }));
      const url = await service.getExplorerUrl('uuid-1', '0xabc');
      expect(url).toBe('https://etherscan.io/search?q=0xabc');
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto: CreateNetworkDto = {
      name: 'Ethereum',
      slug: 'ethereum-mainnet',
      symbol: 'ETH',
      chainId: '1',
      nativeDecimals: 18,
      driverKey: 'evm',
      explorerBaseUrl: 'https://etherscan.io',
    };

    it('creates and returns the new network', async () => {
      repo.findBySlug.mockResolvedValueOnce(null);
      repo.findByChainId.mockResolvedValueOnce(null);
      repo.create.mockResolvedValueOnce(makeNetwork());

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalled();
      expect(result.slug).toBe('ethereum-mainnet');
    });

    it('throws ConflictException when slug is already taken', async () => {
      repo.findBySlug.mockResolvedValueOnce(makeNetwork());

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when chainId is already taken', async () => {
      repo.findBySlug.mockResolvedValueOnce(null);
      repo.findByChainId.mockResolvedValueOnce(makeNetwork());

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('updates mutable fields and invalidates cache', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce({ ...network, name: 'ETH Mainnet' } as Network);

      const dto: UpdateNetworkDto = { name: 'ETH Mainnet' };
      const result = await service.update('uuid-1', dto);

      expect(repo.update).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledTimes(2);
      expect(result.name).toBe('ETH Mainnet');
    });
  });

  // -------------------------------------------------------------------------
  // activate / deactivate
  // -------------------------------------------------------------------------
  describe('activate', () => {
    it('sets isActive to true', async () => {
      const network = makeNetwork({ isActive: false });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce({ ...network, isActive: true } as Network);

      const result = await service.activate('uuid-1');
      expect(result.isActive).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      const network = makeNetwork({ isActive: true });
      repo.findById.mockResolvedValueOnce(network);
      repo.update.mockResolvedValueOnce({ ...network, isActive: false } as Network);

      const result = await service.deactivate('uuid-1');
      expect(result.isActive).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('soft-deletes the network and invalidates cache', async () => {
      const network = makeNetwork();
      repo.findById.mockResolvedValueOnce(network);
      repo.softDelete.mockResolvedValueOnce(undefined);

      await service.remove('uuid-1');

      expect(repo.softDelete).toHaveBeenCalledWith(network);
      expect(cache.del).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when network does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns a mapped paginated result', async () => {
      const network = makeNetwork();
      repo.findAll.mockResolvedValueOnce({
        data: [network],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      const query: NetworkQueryDto = { page: 1, limit: 20 };
      const result = await service.findAll(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('uuid-1');
    });
  });
});
