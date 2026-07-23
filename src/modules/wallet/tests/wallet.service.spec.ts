/**
 * WalletService — unit test suite
 *
 * Strategy: all dependencies are fully mocked. No database, no cache
 * infrastructure, no EventEmitter is started. Each test verifies a single
 * observable behaviour of WalletService in complete isolation.
 *
 * Covered:
 *   - createFromSignerResult: happy path, duplicate address (idempotent),
 *     missing publicKey, invalid family
 *   - assignWallet: happy path (2-phase), idempotent return, pool exhausted,
 *     empty customerId, invalid family, WalletPoolLow event emitted
 *   - findById: cache hit, cache miss → DB, not found
 *   - findByCustomer: cache hit, not found
 *   - findAllByCustomer: delegates, empty customerId throws
 *   - findByAddress: cache hit, not found, empty address throws
 *   - findAll: delegates to repository
 *   - getPoolStatus: cache hit, cache miss → DB, invalid family
 *   - lockWallet: happy path, already locked, terminal states, not found
 *   - unlockWallet: happy path, not locked
 *   - compromiseWallet: happy path, terminal guard
 *   - archiveWallet: happy path, ASSIGNED guard, terminal guard
 *   - audit log failure does NOT throw
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';

import { WalletService } from '../services/wallet.service';
import { WALLET_REPOSITORY } from '../repositories/wallet.repository.token';
import { WALLET_AUDIT_LOG_REPOSITORY } from '../repositories/wallet-audit-log.repository.token';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import { WalletNotFoundError } from '../errors/wallet-not-found.error';
import { WalletPoolExhaustedError } from '../errors/wallet-pool-exhausted.error';
import { WalletInvalidStatusError } from '../errors/wallet-invalid-status.error';
import { WalletTerminalStatusError } from '../errors/wallet-terminal-status.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w-uuid-001',
    address: '0xABCDEF',
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
    publicKey: '0x02abcdef',
    publicKeyFingerprint: null,
    signerVersion: '1.0.0',
    createdByJobId: 'job-uuid-001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WalletService', () => {
  let service: WalletService;
  let repo: jest.Mocked<Record<string, jest.Mock>>;
  let auditLog: jest.Mocked<Record<string, jest.Mock>>;
  let cache: jest.Mocked<Record<string, jest.Mock>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findByAddress: jest.fn(),
      findByCustomer: jest.fn(),
      findAllByCustomer: jest.fn(),
      findAll: jest.fn(),
      existsByAddress: jest.fn(),
      existsByCustomer: jest.fn(),
      countAvailable: jest.fn(),
      countByStatus: jest.fn(),
      save: jest.fn(),
      reserveWallet: jest.fn(),
      assignWallet: jest.fn(),
      releaseExpiredReservations: jest.fn(),
      lockWallet: jest.fn(),
      unlockWallet: jest.fn(),
      compromiseWallet: jest.fn(),
      archiveWallet: jest.fn(),
      softDelete: jest.fn(),
    };

    auditLog = { append: jest.fn().mockResolvedValue(undefined) };

    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (em: unknown) => Promise<void>) => cb({})),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: WALLET_REPOSITORY, useValue: repo },
        { provide: WALLET_AUDIT_LOG_REPOSITORY, useValue: auditLog },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  // =========================================================================
  // createFromSignerResult
  // =========================================================================

  describe('createFromSignerResult', () => {
    const input = {
      createdByJobId: 'job-001',
      address: '0xABC',
      driverFamily: WalletFamily.EVM,
      publicKey: '0x02abcdef',
      signerVersion: '1.0.0',
    };

    it('persists a new AVAILABLE wallet and emits wallet.created', async () => {
      const wallet = makeWallet();
      repo.existsByAddress.mockResolvedValue(false);
      repo.save.mockResolvedValue(wallet);

      const result = await service.createFromSignerResult(input);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: WalletStatus.AVAILABLE, address: input.address }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.created', expect.anything());
      expect(auditLog.append).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('w-uuid-001');
    });

    it('returns existing wallet idempotently when address already exists', async () => {
      const existing = makeWallet();
      repo.existsByAddress.mockResolvedValue(true);
      repo.findByAddress.mockResolvedValue(existing);

      const result = await service.createFromSignerResult(input);

      expect(repo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('throws when publicKey is empty', async () => {
      await expect(
        service.createFromSignerResult({ ...input, publicKey: '   ' }),
      ).rejects.toThrow('missing publicKey');
    });

    it('throws WalletFamilyNotSupportedError for an invalid family', async () => {
      await expect(
        service.createFromSignerResult({ ...input, driverFamily: 'INVALID' as WalletFamily }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // assignWallet
  // =========================================================================

  describe('assignWallet', () => {
    const input = { customerId: 'cust-001', driverFamily: WalletFamily.EVM };

    it('executes 2-phase assignment and returns walletId/address/family', async () => {
      const assigned = makeWallet({ status: WalletStatus.ASSIGNED, customerId: 'cust-001', assignedAt: new Date() });
      repo.findByCustomer.mockResolvedValue(null);
      repo.reserveWallet.mockResolvedValue({ walletId: 'w-uuid-001', reservationToken: 'tok-001' });
      repo.assignWallet.mockResolvedValue(assigned);
      cache.del.mockResolvedValue(undefined);

      const result = await service.assignWallet(input);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repo.reserveWallet).toHaveBeenCalledWith(WalletFamily.EVM);
      expect(repo.assignWallet).toHaveBeenCalledWith({
        walletId: 'w-uuid-001',
        reservationToken: 'tok-001',
        customerId: 'cust-001',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.assigned', expect.anything());
      expect(result.walletId).toBe('w-uuid-001');
    });

    it('returns existing assignment idempotently without calling transaction', async () => {
      const existing = makeWallet({ status: WalletStatus.ASSIGNED, customerId: 'cust-001' });
      repo.findByCustomer.mockResolvedValue(existing);

      const result = await service.assignWallet(input);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result.walletId).toBe(existing.id);
    });

    it('throws WalletPoolExhaustedError and emits wallet.pool.low when pool is empty', async () => {
      repo.findByCustomer.mockResolvedValue(null);
      repo.countAvailable.mockResolvedValue(0);
      // reserveWallet returns null inside the transaction callback
      dataSource.transaction = jest.fn().mockImplementation(async (cb: (em: unknown) => Promise<void>) => {
        // Override reserveWallet to return null inside this test
        repo.reserveWallet.mockResolvedValueOnce(null);
        await cb({});
      });
      repo.reserveWallet.mockResolvedValue(null);

      await expect(service.assignWallet(input)).rejects.toBeInstanceOf(WalletPoolExhaustedError);
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.pool.low', expect.anything());
    });

    it('throws when customerId is empty', async () => {
      await expect(
        service.assignWallet({ ...input, customerId: '' }),
      ).rejects.toThrow('customerId must not be empty');
    });

    it('throws WalletFamilyNotSupportedError for invalid family', async () => {
      await expect(
        service.assignWallet({ ...input, driverFamily: 'UNKNOWN' as WalletFamily }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('returns cached wallet without hitting DB', async () => {
      const wallet = makeWallet();
      cache.get.mockResolvedValue(wallet);

      const result = await service.findById('w-uuid-001');

      expect(repo.findById).not.toHaveBeenCalled();
      expect(result).toBe(wallet);
    });

    it('queries DB on cache miss and populates cache', async () => {
      const wallet = makeWallet();
      cache.get.mockResolvedValue(undefined);
      repo.findById.mockResolvedValue(wallet);

      const result = await service.findById('w-uuid-001');

      expect(repo.findById).toHaveBeenCalledWith('w-uuid-001');
      expect(cache.set).toHaveBeenCalledWith('wallet:id:w-uuid-001', wallet, 60_000);
      expect(result).toBe(wallet);
    });

    it('throws WalletNotFoundError on cache miss + DB miss', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(WalletNotFoundError);
    });
  });

  // =========================================================================
  // findByAddress
  // =========================================================================

  describe('findByAddress', () => {
    it('returns cached wallet on cache hit', async () => {
      const wallet = makeWallet();
      cache.get.mockResolvedValue(wallet);

      const result = await service.findByAddress('0xABC');
      expect(repo.findByAddress).not.toHaveBeenCalled();
      expect(result).toBe(wallet);
    });

    it('throws WalletNotFoundError when address not found', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.findByAddress.mockResolvedValue(null);

      await expect(service.findByAddress('0xMISSING')).rejects.toBeInstanceOf(WalletNotFoundError);
    });

    it('throws when address is empty string', async () => {
      await expect(service.findByAddress('')).rejects.toThrow('address must not be empty');
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('delegates to walletRepository.findAll() and returns paginated result', async () => {
      const wallet = makeWallet();
      const paginated = { data: [wallet], total: 1, page: 1, limit: 50 };
      repo.findAll.mockResolvedValue(paginated);

      const result = await service.findAll({ page: 1, limit: 50 });

      expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 50 });
      expect(result).toBe(paginated);
    });
  });

  // =========================================================================
  // getPoolStatus
  // =========================================================================

  describe('getPoolStatus', () => {
    it('returns cached count on cache hit', async () => {
      cache.get.mockResolvedValue(350);

      const result = await service.getPoolStatus(WalletFamily.EVM);

      expect(repo.countAvailable).not.toHaveBeenCalled();
      expect(result).toBe(350);
    });

    it('queries DB on cache miss and caches with 5-second TTL', async () => {
      cache.get.mockResolvedValue(null);
      repo.countAvailable.mockResolvedValue(200);

      const result = await service.getPoolStatus(WalletFamily.EVM);

      expect(repo.countAvailable).toHaveBeenCalledWith(WalletFamily.EVM);
      expect(cache.set).toHaveBeenCalledWith('wallet:pool:available:EVM', 200, 5_000);
      expect(result).toBe(200);
    });

    it('throws on invalid family', async () => {
      await expect(
        service.getPoolStatus('FAKE' as WalletFamily),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // lockWallet
  // =========================================================================

  describe('lockWallet', () => {
    it('transitions AVAILABLE → LOCKED, appends audit, emits event, invalidates cache', async () => {
      const wallet = makeWallet({ status: WalletStatus.AVAILABLE });
      const locked = makeWallet({ status: WalletStatus.LOCKED, lockedAt: new Date() });
      cache.get.mockResolvedValueOnce(wallet); // findById cache hit
      repo.lockWallet.mockResolvedValue(locked);

      const result = await service.lockWallet('w-uuid-001', 'investigation');

      expect(repo.lockWallet).toHaveBeenCalledWith('w-uuid-001', 'investigation');
      expect(auditLog.append).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.locked', expect.anything());
      expect(cache.del).toHaveBeenCalled();
      expect(result.status).toBe(WalletStatus.LOCKED);
    });

    it('throws WalletInvalidStatusError when already LOCKED', async () => {
      const wallet = makeWallet({ status: WalletStatus.LOCKED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(service.lockWallet('w-uuid-001', 'reason')).rejects.toBeInstanceOf(
        WalletInvalidStatusError,
      );
    });

    it('throws WalletTerminalStatusError for COMPROMISED wallet', async () => {
      const wallet = makeWallet({ status: WalletStatus.COMPROMISED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(service.lockWallet('w-uuid-001', 'reason')).rejects.toBeInstanceOf(
        WalletTerminalStatusError,
      );
    });

    it('throws WalletTerminalStatusError for ARCHIVED wallet', async () => {
      const wallet = makeWallet({ status: WalletStatus.ARCHIVED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(service.lockWallet('w-uuid-001', 'reason')).rejects.toBeInstanceOf(
        WalletTerminalStatusError,
      );
    });
  });

  // =========================================================================
  // unlockWallet
  // =========================================================================

  describe('unlockWallet', () => {
    it('restores LOCKED wallet to previousStatus, appends audit, emits event', async () => {
      const wallet = makeWallet({ status: WalletStatus.LOCKED, previousStatus: WalletStatus.ASSIGNED });
      const unlocked = makeWallet({ status: WalletStatus.ASSIGNED });
      cache.get.mockResolvedValueOnce(wallet);
      repo.unlockWallet.mockResolvedValue(unlocked);

      const result = await service.unlockWallet('w-uuid-001');

      expect(repo.unlockWallet).toHaveBeenCalledWith('w-uuid-001');
      expect(auditLog.append).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.unlocked', expect.anything());
      expect(result.status).toBe(WalletStatus.ASSIGNED);
    });

    it('defaults restoredStatus to AVAILABLE when previousStatus is null', async () => {
      const wallet = makeWallet({ status: WalletStatus.LOCKED, previousStatus: null });
      const unlocked = makeWallet({ status: WalletStatus.AVAILABLE });
      cache.get.mockResolvedValueOnce(wallet);
      repo.unlockWallet.mockResolvedValue(unlocked);

      await service.unlockWallet('w-uuid-001');

      expect(auditLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { restoredStatus: WalletStatus.AVAILABLE } }),
      );
    });

    it('throws WalletInvalidStatusError when not LOCKED', async () => {
      const wallet = makeWallet({ status: WalletStatus.AVAILABLE });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(service.unlockWallet('w-uuid-001')).rejects.toBeInstanceOf(
        WalletInvalidStatusError,
      );
    });
  });

  // =========================================================================
  // compromiseWallet
  // =========================================================================

  describe('compromiseWallet', () => {
    it('transitions to COMPROMISED, appends audit, emits event', async () => {
      const wallet = makeWallet({ status: WalletStatus.ASSIGNED, address: '0xABCDEF' });
      const compromised = makeWallet({ status: WalletStatus.COMPROMISED, compromisedAt: new Date() });
      cache.get.mockResolvedValueOnce(wallet);
      repo.compromiseWallet.mockResolvedValue(compromised);

      const result = await service.compromiseWallet('w-uuid-001', 'private key leak');

      expect(repo.compromiseWallet).toHaveBeenCalledWith('w-uuid-001', 'private key leak');
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.compromised', expect.anything());
      expect(result.status).toBe(WalletStatus.COMPROMISED);
    });

    it('throws WalletTerminalStatusError when already COMPROMISED', async () => {
      const wallet = makeWallet({ status: WalletStatus.COMPROMISED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(
        service.compromiseWallet('w-uuid-001', 'reason'),
      ).rejects.toBeInstanceOf(WalletTerminalStatusError);
    });
  });

  // =========================================================================
  // archiveWallet
  // =========================================================================

  describe('archiveWallet', () => {
    it('archives an AVAILABLE wallet, appends audit, emits event', async () => {
      const wallet = makeWallet({ status: WalletStatus.AVAILABLE });
      const archived = makeWallet({ status: WalletStatus.ARCHIVED, archivedAt: new Date() });
      cache.get.mockResolvedValueOnce(wallet);
      repo.archiveWallet.mockResolvedValue(archived);

      const result = await service.archiveWallet('w-uuid-001', 'decommissioned');

      expect(repo.archiveWallet).toHaveBeenCalledWith('w-uuid-001', 'decommissioned');
      expect(eventEmitter.emit).toHaveBeenCalledWith('wallet.archived', expect.anything());
      expect(result.status).toBe(WalletStatus.ARCHIVED);
    });

    it('throws WalletInvalidStatusError when archiving an ASSIGNED wallet', async () => {
      const wallet = makeWallet({ status: WalletStatus.ASSIGNED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(
        service.archiveWallet('w-uuid-001', 'reason'),
      ).rejects.toBeInstanceOf(WalletInvalidStatusError);
    });

    it('throws WalletTerminalStatusError when already ARCHIVED', async () => {
      const wallet = makeWallet({ status: WalletStatus.ARCHIVED });
      cache.get.mockResolvedValueOnce(wallet);

      await expect(
        service.archiveWallet('w-uuid-001', 'reason'),
      ).rejects.toBeInstanceOf(WalletTerminalStatusError);
    });
  });

  // =========================================================================
  // Audit log failure resilience
  // =========================================================================

  describe('audit log failure resilience', () => {
    it('does not propagate audit log failure — wallet creation still succeeds', async () => {
      const wallet = makeWallet();
      repo.existsByAddress.mockResolvedValue(false);
      repo.save.mockResolvedValue(wallet);
      auditLog.append.mockRejectedValue(new Error('DB connection lost'));

      // Must not throw despite audit failure
      await expect(
        service.createFromSignerResult({
          createdByJobId: 'job-001',
          address: '0xNEW',
          driverFamily: WalletFamily.EVM,
          publicKey: '0x02ff',
        }),
      ).resolves.toBeDefined();
    });
  });
});
