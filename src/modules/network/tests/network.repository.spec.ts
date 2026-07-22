import { Network } from '../entities/network.entity';
import { NetworkDriver } from '../enums/network-driver.enum';
import { NetworkRepository } from '../repositories/network.repository';
import type { NetworkQueryDto } from '../dto/network-query.dto';

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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('NetworkRepository', () => {
  let repository: NetworkRepository;
  let mockTypeOrmRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    softRemove: jest.Mock;
  };

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      softRemove: jest.fn(),
    };
    repository = new NetworkRepository(mockTypeOrmRepo as never);
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('returns the network when found', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findById('aaaaaaaa-0000-0000-0000-000000000001');

      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'aaaaaaaa-0000-0000-0000-000000000001' },
      });
    });

    it('returns null when the record is not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(null);

      expect(await repository.findById('missing')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findBySlug
  // -------------------------------------------------------------------------
  describe('findBySlug', () => {
    it('queries by slug and returns the network', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findBySlug('ethereum-mainnet');

      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'ethereum-mainnet' },
      });
    });

    it('returns null when slug is not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(null);

      expect(await repository.findBySlug('non-existent')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findByChainId
  // -------------------------------------------------------------------------
  describe('findByChainId', () => {
    it('queries by chainId and returns the network', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findByChainId('1');

      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { chainId: '1' } });
    });

    it('returns null when chainId is not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(null);

      expect(await repository.findByChainId('9999')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns a correctly structured paginated result', async () => {
      const networks = [
        makeNetwork(),
        makeNetwork({ id: 'bbbb', slug: 'bsc-mainnet', chainId: '56' }),
      ];
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([networks, 2]);

      const query: NetworkQueryDto = { page: 1, limit: 20 };
      const result = await repository.findAll(query);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('applies the driverKey filter when provided', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      const query: NetworkQueryDto = { page: 1, limit: 20, driverKey: NetworkDriver.EVM };
      await repository.findAll(query);

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as {
        where: { driverKey?: string };
      };
      expect(callArg.where.driverKey).toBe(NetworkDriver.EVM);
    });

    it('applies the isActive filter when provided', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      const query: NetworkQueryDto = { page: 1, limit: 20, isActive: false };
      await repository.findAll(query);

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as {
        where: { isActive?: boolean };
      };
      expect(callArg.where.isActive).toBe(false);
    });

    it('applies the isTestnet filter when provided', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      const query: NetworkQueryDto = { page: 1, limit: 20, isTestnet: true };
      await repository.findAll(query);

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as {
        where: { isTestnet?: boolean };
      };
      expect(callArg.where.isTestnet).toBe(true);
    });

    it('omits filter fields when they are undefined', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      await repository.findAll({ page: 1, limit: 20 });

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArg.where).not.toHaveProperty('driverKey');
      expect(callArg.where).not.toHaveProperty('isActive');
      expect(callArg.where).not.toHaveProperty('isTestnet');
    });

    it('calculates correct pagination for page 2 with limit 5', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 12]);

      const result = await repository.findAll({ page: 2, limit: 5 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.totalPages).toBe(3);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
      // Verifies skip = (page-1) * limit = 5
      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as { skip: number; take: number };
      expect(callArg.skip).toBe(5);
      expect(callArg.take).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // findActive
  // -------------------------------------------------------------------------
  describe('findActive', () => {
    it('queries for isActive=true and orders by name ASC', async () => {
      const networks = [makeNetwork()];
      mockTypeOrmRepo.find.mockResolvedValueOnce(networks);

      const result = await repository.findActive();

      expect(result).toEqual(networks);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
    });

    it('returns an empty array when no active networks exist', async () => {
      mockTypeOrmRepo.find.mockResolvedValueOnce([]);

      expect(await repository.findActive()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // existsBySlug
  // -------------------------------------------------------------------------
  describe('existsBySlug', () => {
    it('returns true when a network with the given slug exists', async () => {
      mockTypeOrmRepo.count.mockResolvedValueOnce(1);

      expect(await repository.existsBySlug('ethereum-mainnet')).toBe(true);
      expect(mockTypeOrmRepo.count).toHaveBeenCalledWith({
        where: { slug: 'ethereum-mainnet' },
      });
    });

    it('returns false when no network with the given slug exists', async () => {
      mockTypeOrmRepo.count.mockResolvedValueOnce(0);

      expect(await repository.existsBySlug('non-existent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // existsByChainId
  // -------------------------------------------------------------------------
  describe('existsByChainId', () => {
    it('returns true when a network with the given chainId exists', async () => {
      mockTypeOrmRepo.count.mockResolvedValueOnce(1);

      expect(await repository.existsByChainId('1')).toBe(true);
      expect(mockTypeOrmRepo.count).toHaveBeenCalledWith({ where: { chainId: '1' } });
    });

    it('returns false when no network with the given chainId exists', async () => {
      mockTypeOrmRepo.count.mockResolvedValueOnce(0);

      expect(await repository.existsByChainId('9999')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('calls repo.create then repo.save and returns the saved entity', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.create.mockReturnValueOnce(network);
      mockTypeOrmRepo.save.mockResolvedValueOnce(network);

      const result = await repository.create({ name: 'Ethereum', slug: 'ethereum-mainnet' });

      expect(mockTypeOrmRepo.create).toHaveBeenCalled();
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(network);
      expect(result).toEqual(network);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('merges changes into the entity and saves the result', async () => {
      const network = makeNetwork();
      const updated = makeNetwork({ name: 'Ethereum Mainnet' });
      mockTypeOrmRepo.save.mockResolvedValueOnce(updated);

      const result = await repository.update(network, { name: 'Ethereum Mainnet' });

      expect(mockTypeOrmRepo.merge).toHaveBeenCalledWith(network, { name: 'Ethereum Mainnet' });
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(network);
      expect(result.name).toBe('Ethereum Mainnet');
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------
  describe('softDelete', () => {
    it('delegates to repo.softRemove with the entity', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.softRemove.mockResolvedValueOnce(network);

      await repository.softDelete(network);

      expect(mockTypeOrmRepo.softRemove).toHaveBeenCalledWith(network);
    });
  });
});
