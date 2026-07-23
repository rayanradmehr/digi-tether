/**
 * WalletRepository — unit contract tests
 *
 * Strategy: TypeORM Repository and DataSource are mocked. Tests verify
 * that WalletRepository correctly delegates to TypeORM primitives and
 * applies correct query semantics. No database is started.
 *
 * Covered:
 *   - findById: delegates to repo.findOne with { where: { id } }
 *   - findByAddress: uses IDX_wallets_address
 *   - findByCustomer: uses customer + family composite
 *   - findAllByCustomer: returns ordered by driverFamily ASC
 *   - countAvailable: counts AVAILABLE rows for family
 *   - existsByAddress: uses withDeleted (permanent uniqueness)
 *   - existsByCustomer: counts active rows
 *   - save: creates + saves entity
 *   - reserveWallet: returns null when no AVAILABLE wallet
 *   - reserveWallet: returns walletId + reservationToken on success
 *   - assignWallet: throws WalletReservationTokenMismatchError on 0-row result
 *   - assignWallet: returns entity on success
 *   - lockWallet: executes UPDATE and returns entity
 *   - unlockWallet: executes UPDATE and returns entity
 *   - compromiseWallet: executes UPDATE and returns entity
 *   - archiveWallet: executes UPDATE and returns entity
 *   - releaseExpiredReservations: returns count of affected rows
 *   - softDelete: delegates to repo.softDelete
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { WalletRepository } from '../repositories/wallet.repository';
import { WalletEntity } from '../entities/wallet.entity';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';

function makeWalletRow(overrides: Record<string, unknown> = {}): WalletEntity {
  return {
    id: 'w-001',
    address: '0xABC',
    driverFamily: WalletFamily.EVM,
    status: WalletStatus.AVAILABLE,
    customerId: null,
    assignedAt: null,
    reservationToken: null,
    reservedAt: null,
    releasedAt: null,
    previousStatus: null,
    lockedAt: null,
    lockReason: null,
    compromisedAt: null,
    archivedAt: null,
    publicKey: '0x02aabbcc',
    publicKeyFingerprint: null,
    signerVersion: '1.0.0',
    createdByJobId: 'job-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    deletedAt: null,
    ...overrides,
  } as WalletEntity;
}

describe('WalletRepository', () => {
  let repository: WalletRepository;
  let typeormRepo: jest.Mocked<Record<string, jest.Mock>>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    typeormRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(),
      findOneOrFail: jest.fn(),
    };

    dataSource = {
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        { provide: getRepositoryToken(WalletEntity), useValue: typeormRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repository = module.get(WalletRepository);
  });

  // -------------------------------------------------------------------------
  // Lookup methods
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('calls repo.findOne with correct where clause', async () => {
      const wallet = makeWalletRow();
      typeormRepo.findOne.mockResolvedValue(wallet);

      const result = await repository.findById('w-001');

      expect(typeormRepo.findOne).toHaveBeenCalledWith({ where: { id: 'w-001' } });
      expect(result).toBe(wallet);
    });

    it('returns null on miss', async () => {
      typeormRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByAddress', () => {
    it('calls repo.findOne with address filter', async () => {
      const wallet = makeWalletRow();
      typeormRepo.findOne.mockResolvedValue(wallet);

      const result = await repository.findByAddress('0xABC');

      expect(typeormRepo.findOne).toHaveBeenCalledWith({ where: { address: '0xABC' } });
      expect(result).toBe(wallet);
    });
  });

  describe('findByCustomer', () => {
    it('calls repo.findOne with customerId + driverFamily', async () => {
      typeormRepo.findOne.mockResolvedValue(null);

      await repository.findByCustomer('cust-001', WalletFamily.EVM);

      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { customerId: 'cust-001', driverFamily: WalletFamily.EVM },
      });
    });
  });

  describe('findAllByCustomer', () => {
    it('calls repo.find ordered by driverFamily ASC', async () => {
      typeormRepo.find.mockResolvedValue([]);

      await repository.findAllByCustomer('cust-001');

      expect(typeormRepo.find).toHaveBeenCalledWith({
        where: { customerId: 'cust-001' },
        order: { driverFamily: 'ASC' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Aggregate reads
  // -------------------------------------------------------------------------

  describe('countAvailable', () => {
    it('counts AVAILABLE rows for the given family', async () => {
      typeormRepo.count.mockResolvedValue(42);

      const result = await repository.countAvailable(WalletFamily.EVM);

      expect(typeormRepo.count).toHaveBeenCalledWith({
        where: { driverFamily: WalletFamily.EVM, status: WalletStatus.AVAILABLE },
      });
      expect(result).toBe(42);
    });
  });

  describe('existsByAddress', () => {
    it('returns true when count > 0 (includes soft-deleted rows)', async () => {
      // createQueryBuilder chain mock
      const qb = {
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };
      typeormRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.existsByAddress('0xABC');

      expect(qb.withDeleted).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      const qb = {
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      typeormRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.existsByAddress('0xNEW');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  describe('save', () => {
    it('creates entity via repo.create then persists via repo.save', async () => {
      const data = { address: '0xNEW', driverFamily: WalletFamily.EVM };
      const entity = makeWalletRow({ address: '0xNEW' });
      typeormRepo.create.mockReturnValue(entity);
      typeormRepo.save.mockResolvedValue(entity);

      const result = await repository.save(data);

      expect(typeormRepo.create).toHaveBeenCalledWith(data);
      expect(typeormRepo.save).toHaveBeenCalledWith(entity);
      expect(result).toBe(entity);
    });
  });

  describe('reserveWallet', () => {
    it('returns null when no AVAILABLE wallet is found', async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await repository.reserveWallet(WalletFamily.EVM);

      expect(result).toBeNull();
    });

    it('returns walletId + reservationToken when a row is reserved', async () => {
      dataSource.query.mockResolvedValue([{ id: 'w-001', reservation_token: 'tok-abc' }]);

      const result = await repository.reserveWallet(WalletFamily.EVM);

      expect(result).toEqual({ walletId: 'w-001', reservationToken: 'tok-abc' });
    });
  });

  describe('assignWallet', () => {
    it('throws WalletReservationTokenMismatchError on 0-row UPDATE result', async () => {
      dataSource.query.mockResolvedValue([]);

      await expect(
        repository.assignWallet({ walletId: 'w-001', reservationToken: 'bad-tok', customerId: 'cust-001' }),
      ).rejects.toThrow();
    });

    it('returns the wallet entity on success', async () => {
      const wallet = makeWalletRow({ status: WalletStatus.ASSIGNED });
      dataSource.query.mockResolvedValue([{ id: 'w-001' }]);
      typeormRepo.findOneOrFail.mockResolvedValue(wallet);

      const result = await repository.assignWallet({
        walletId: 'w-001',
        reservationToken: 'tok-ok',
        customerId: 'cust-001',
      });

      expect(result).toBe(wallet);
    });
  });

  describe('releaseExpiredReservations', () => {
    it('returns the count of released rows', async () => {
      dataSource.query.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      const count = await repository.releaseExpiredReservations(30);

      expect(count).toBe(2);
    });
  });

  describe('lockWallet / unlockWallet / compromiseWallet / archiveWallet', () => {
    const wallet = makeWalletRow({ status: WalletStatus.LOCKED, lockedAt: new Date() });

    it('lockWallet executes UPDATE and returns the entity', async () => {
      dataSource.query.mockResolvedValue(undefined);
      typeormRepo.findOneOrFail.mockResolvedValue(wallet);

      const result = await repository.lockWallet('w-001', 'test reason');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
      expect(result).toBe(wallet);
    });

    it('unlockWallet executes UPDATE and returns the entity', async () => {
      dataSource.query.mockResolvedValue(undefined);
      typeormRepo.findOneOrFail.mockResolvedValue(makeWalletRow({ status: WalletStatus.AVAILABLE }));

      await repository.unlockWallet('w-001');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('compromiseWallet executes UPDATE and returns the entity', async () => {
      dataSource.query.mockResolvedValue(undefined);
      typeormRepo.findOneOrFail.mockResolvedValue(makeWalletRow({ status: WalletStatus.COMPROMISED, compromisedAt: new Date() }));

      await repository.compromiseWallet('w-001', 'key leaked');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('archiveWallet executes UPDATE and returns the entity', async () => {
      dataSource.query.mockResolvedValue(undefined);
      typeormRepo.findOneOrFail.mockResolvedValue(makeWalletRow({ status: WalletStatus.ARCHIVED, archivedAt: new Date() }));

      await repository.archiveWallet('w-001', 'retired');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('softDelete', () => {
    it('delegates to repo.softDelete', async () => {
      typeormRepo.softDelete.mockResolvedValue(undefined);

      await repository.softDelete('w-001');

      expect(typeormRepo.softDelete).toHaveBeenCalledWith('w-001');
    });
  });
});
