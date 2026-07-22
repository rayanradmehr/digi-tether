import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenRepository } from '../repositories/token.repository';
import { Token } from '../entities/token.entity';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN_ID   = '22222222-2222-2222-2222-222222222222';
const NETWORK_ID = '11111111-1111-1111-1111-111111111111';

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

// ---------------------------------------------------------------------------
// Mock TypeORM Repository
// ---------------------------------------------------------------------------

function mockTypeOrmRepo(): jest.Mocked<Repository<Token>> {
  return {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    softRemove: jest.fn(),
  } as unknown as jest.Mocked<Repository<Token>>;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TokenRepository', () => {
  let repository: TokenRepository;
  let typeormRepo: jest.Mocked<Repository<Token>>;

  beforeEach(async () => {
    typeormRepo = mockTypeOrmRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRepository,
        { provide: getRepositoryToken(Token), useValue: typeormRepo },
      ],
    }).compile();

    repository = module.get(TokenRepository);
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns token when found', async () => {
      const token = makeToken();
      typeormRepo.findOne.mockResolvedValue(token);

      const result = await repository.findById(TOKEN_ID);

      expect(typeormRepo.findOne).toHaveBeenCalledWith({ where: { id: TOKEN_ID } });
      expect(result).toEqual(token);
    });

    it('returns null when not found', async () => {
      typeormRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('missing');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findAll — pagination
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns paginated result with correct shape', async () => {
      const token = makeToken();
      typeormRepo.findAndCount.mockResolvedValue([[token], 1]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('applies skip/take for page 2', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 30]);

      await repository.findAll({ page: 2, limit: 20 });

      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });

    it('filters by networkId', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findAll({ networkId: NETWORK_ID });

      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ networkId: NETWORK_ID }) }),
      );
    });

    it('filters by type', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);
      await repository.findAll({ type: TokenType.CONTRACT });
      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: TokenType.CONTRACT }) }),
      );
    });

    it('filters by standard', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);
      await repository.findAll({ standard: TokenStandard.ERC20 });
      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ standard: TokenStandard.ERC20 }) }),
      );
    });

    it('filters by status', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);
      await repository.findAll({ status: TokenStatus.ACTIVE });
      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: TokenStatus.ACTIVE }) }),
      );
    });

    it('orders results by createdAt DESC', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);
      await repository.findAll({});
      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });

    it('returns hasNextPage=true when more pages exist', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 50]);
      const result = await repository.findAll({ page: 1, limit: 20 });
      expect(result.hasNextPage).toBe(true);
    });

    it('returns hasPreviousPage=true for page > 1', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 50]);
      const result = await repository.findAll({ page: 2, limit: 20 });
      expect(result.hasPreviousPage).toBe(true);
    });

    it('omits undefined filters from WHERE clause', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[], 0]);
      await repository.findAll({});
      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findByNetworkId
  // -------------------------------------------------------------------------

  describe('findByNetworkId', () => {
    it('returns tokens for the given network ordered by symbol ASC', async () => {
      typeormRepo.find.mockResolvedValue([makeToken()]);

      const result = await repository.findByNetworkId(NETWORK_ID);

      expect(typeormRepo.find).toHaveBeenCalledWith({
        where: { networkId: NETWORK_ID },
        order: { symbol: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // findActiveByNetworkId
  // -------------------------------------------------------------------------

  describe('findActiveByNetworkId', () => {
    it('queries only ACTIVE tokens for the network', async () => {
      typeormRepo.find.mockResolvedValue([]);

      await repository.findActiveByNetworkId(NETWORK_ID);

      expect(typeormRepo.find).toHaveBeenCalledWith({
        where: { networkId: NETWORK_ID, status: TokenStatus.ACTIVE },
        order: { symbol: 'ASC' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // existsNativeByNetworkId
  // -------------------------------------------------------------------------

  describe('existsNativeByNetworkId', () => {
    it('returns true when native token count > 0', async () => {
      typeormRepo.count.mockResolvedValue(1);
      expect(await repository.existsNativeByNetworkId(NETWORK_ID)).toBe(true);
    });

    it('returns false when no native token exists', async () => {
      typeormRepo.count.mockResolvedValue(0);
      expect(await repository.existsNativeByNetworkId(NETWORK_ID)).toBe(false);
    });

    it('queries with type = NATIVE', async () => {
      typeormRepo.count.mockResolvedValue(0);
      await repository.existsNativeByNetworkId(NETWORK_ID);
      expect(typeormRepo.count).toHaveBeenCalledWith({
        where: { networkId: NETWORK_ID, type: TokenType.NATIVE },
      });
    });
  });

  // -------------------------------------------------------------------------
  // existsBySymbolAndNetworkId
  // -------------------------------------------------------------------------

  describe('existsBySymbolAndNetworkId', () => {
    it('returns true when symbol exists on network', async () => {
      typeormRepo.count.mockResolvedValue(1);
      expect(await repository.existsBySymbolAndNetworkId('USDT', NETWORK_ID)).toBe(true);
    });

    it('returns false when symbol is available', async () => {
      typeormRepo.count.mockResolvedValue(0);
      expect(await repository.existsBySymbolAndNetworkId('NEW', NETWORK_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // existsByContractAddressAndNetworkId
  // -------------------------------------------------------------------------

  describe('existsByContractAddressAndNetworkId', () => {
    it('returns true when contract address is already registered', async () => {
      typeormRepo.count.mockResolvedValue(1);
      expect(
        await repository.existsByContractAddressAndNetworkId('0xABC', NETWORK_ID),
      ).toBe(true);
    });

    it('returns false when contract address is available', async () => {
      typeormRepo.count.mockResolvedValue(0);
      expect(
        await repository.existsByContractAddressAndNetworkId('0xNEW', NETWORK_ID),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates entity in memory and persists it', async () => {
      const token = makeToken();
      typeormRepo.create.mockReturnValue(token);
      typeormRepo.save.mockResolvedValue(token);

      const result = await repository.create({ symbol: 'USDT', networkId: NETWORK_ID });

      expect(typeormRepo.create).toHaveBeenCalledWith({ symbol: 'USDT', networkId: NETWORK_ID });
      expect(typeormRepo.save).toHaveBeenCalledWith(token);
      expect(result).toEqual(token);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('merges changes and saves', async () => {
      const token   = makeToken();
      const updated = makeToken({ name: 'USD Tether' });
      typeormRepo.merge.mockReturnValue(updated);
      typeormRepo.save.mockResolvedValue(updated);

      const result = await repository.update(token, { name: 'USD Tether' });

      expect(typeormRepo.merge).toHaveBeenCalledWith(token, { name: 'USD Tether' });
      expect(typeormRepo.save).toHaveBeenCalledWith(updated);
      expect(result.name).toBe('USD Tether');
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('calls softRemove and does NOT hard-delete', async () => {
      const token = makeToken();
      typeormRepo.softRemove.mockResolvedValue(token);

      await repository.softDelete(token);

      expect(typeormRepo.softRemove).toHaveBeenCalledWith(token);
      // Verify delete / remove are never called
      expect((typeormRepo as Record<string, jest.Mock>)['delete']).toBeUndefined();
      expect((typeormRepo as Record<string, jest.Mock>)['remove']).toBeUndefined();
    });
  });
});
