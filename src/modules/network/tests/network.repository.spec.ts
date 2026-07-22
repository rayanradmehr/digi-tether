import { Network } from '../entities/network.entity';
import { NetworkRepository } from '../repositories/network.repository';
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

describe('NetworkRepository', () => {
  let repository: NetworkRepository;
  let mockTypeOrmRepo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    softRemove: jest.Mock;
  };

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      merge: jest.fn(),
      softRemove: jest.fn(),
    };
    repository = new NetworkRepository(mockTypeOrmRepo as never);
  });

  describe('findById', () => {
    it('returns network when found', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findById('uuid-1');
      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('returns null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(null);
      expect(await repository.findById('missing')).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('queries by slug', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findBySlug('ethereum-mainnet');
      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'ethereum-mainnet' } });
    });
  });

  describe('findByChainId', () => {
    it('queries by chainId', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.findOne.mockResolvedValueOnce(network);

      const result = await repository.findByChainId('1');
      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({ where: { chainId: '1' } });
    });
  });

  describe('findAll', () => {
    it('returns paginated results with correct metadata', async () => {
      const networks = [makeNetwork(), makeNetwork({ id: 'uuid-2', slug: 'bsc-mainnet' })];
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([networks, 2]);

      const query: NetworkQueryDto = { page: 1, limit: 20 };
      const result = await repository.findAll(query);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
    });

    it('applies driverKey filter when provided', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      const query: NetworkQueryDto = { page: 1, limit: 20, driverKey: 'evm' };
      await repository.findAll(query);

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as { where: { driverKey?: string } };
      expect(callArg.where.driverKey).toBe('evm');
    });

    it('applies isActive filter when provided', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      const query: NetworkQueryDto = { page: 1, limit: 20, isActive: false };
      await repository.findAll(query);

      const callArg = mockTypeOrmRepo.findAndCount.mock.calls[0][0] as { where: { isActive?: boolean } };
      expect(callArg.where.isActive).toBe(false);
    });
  });

  describe('create', () => {
    it('creates and saves a new entity', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.create.mockReturnValueOnce(network);
      mockTypeOrmRepo.save.mockResolvedValueOnce(network);

      const result = await repository.create({ name: 'Ethereum', slug: 'ethereum-mainnet' });
      expect(result).toEqual(network);
      expect(mockTypeOrmRepo.create).toHaveBeenCalled();
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(network);
    });
  });

  describe('update', () => {
    it('merges changes and saves', async () => {
      const network = makeNetwork();
      const updated = { ...network, name: 'ETH Mainnet' } as Network;
      mockTypeOrmRepo.save.mockResolvedValueOnce(updated);

      const result = await repository.update(network, { name: 'ETH Mainnet' });
      expect(mockTypeOrmRepo.merge).toHaveBeenCalledWith(network, { name: 'ETH Mainnet' });
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('ETH Mainnet');
    });
  });

  describe('softDelete', () => {
    it('calls softRemove on the entity', async () => {
      const network = makeNetwork();
      mockTypeOrmRepo.softRemove.mockResolvedValueOnce(network);

      await repository.softDelete(network);
      expect(mockTypeOrmRepo.softRemove).toHaveBeenCalledWith(network);
    });
  });
});
