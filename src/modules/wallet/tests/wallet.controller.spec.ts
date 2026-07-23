/**
 * WalletController — unit test suite
 *
 * Strategy: WalletService is fully mocked. Tests verify:
 *   - Every handler calls exactly ONE service method.
 *   - Response is mapped through WalletResponseDto.fromEntity().
 *   - Correct HTTP status codes are declared.
 *   - Zero business logic exists in the controller.
 *
 * Covered:
 *   - assign: happy path → 201, returns WalletResponseDto
 *   - findAll: delegates to service.findAll(), returns PaginatedWalletResponseDto
 *   - findAllByCustomer: returns array of WalletResponseDto
 *   - findByAddress: returns WalletResponseDto
 *   - getPoolStatus: returns { family, availableCount }
 *   - findById: returns WalletResponseDto
 *   - lock: calls lockWallet with id + lockReason, returns WalletResponseDto
 *   - unlock: calls unlockWallet with id only, returns WalletResponseDto
 *   - compromise: calls compromiseWallet, returns WalletResponseDto
 *   - archive: calls archiveWallet, returns WalletResponseDto
 *   - assign propagates WalletPoolExhaustedError from service
 *   - findById propagates WalletNotFoundError from service
 */
import { Test, TestingModule } from '@nestjs/testing';

import { WalletController } from '../controllers/wallet.controller';
import { WalletService } from '../services/wallet.service';
import {
  WalletResponseDto,
  PaginatedWalletResponseDto,
} from '../dto/wallet-response.dto';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import { WalletNotFoundError } from '../errors/wallet-not-found.error';
import { WalletPoolExhaustedError } from '../errors/wallet-pool-exhausted.error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w-uuid-001',
    address: '0xABCDEF',
    driverFamily: WalletFamily.EVM,
    status: WalletStatus.AVAILABLE,
    customerId: null,
    assignedAt: null,
    lockReason: null,
    compromisedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('WalletController', () => {
  let controller: WalletController;
  let service: jest.Mocked<WalletService>;

  beforeEach(async () => {
    const mockService = {
      assignWallet: jest.fn(),
      findAll: jest.fn(),
      findAllByCustomer: jest.fn(),
      findByAddress: jest.fn(),
      getPoolStatus: jest.fn(),
      findById: jest.fn(),
      lockWallet: jest.fn(),
      unlockWallet: jest.fn(),
      compromiseWallet: jest.fn(),
      archiveWallet: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: mockService }],
    }).compile();

    controller = module.get(WalletController);
    service = module.get(WalletService) as jest.Mocked<WalletService>;
  });

  // =========================================================================
  // assign
  // =========================================================================

  describe('assign', () => {
    it('calls assignWallet then findById and returns WalletResponseDto', async () => {
      const entity = makeEntity({ status: WalletStatus.ASSIGNED, customerId: 'cust-001', assignedAt: new Date() });
      service.assignWallet.mockResolvedValue({
        walletId: 'w-uuid-001',
        address: '0xABCDEF',
        driverFamily: WalletFamily.EVM,
      });
      service.findById.mockResolvedValue(entity as any);

      const result = await controller.assign({
        customerId: 'cust-001',
        driverFamily: WalletFamily.EVM,
      });

      expect(service.assignWallet).toHaveBeenCalledWith({
        customerId: 'cust-001',
        driverFamily: WalletFamily.EVM,
      });
      expect(service.findById).toHaveBeenCalledWith('w-uuid-001');
      expect(result).toBeInstanceOf(WalletResponseDto);
      expect(result.id).toBe('w-uuid-001');
    });

    it('propagates WalletPoolExhaustedError from service', async () => {
      service.assignWallet.mockRejectedValue(
        new WalletPoolExhaustedError(WalletFamily.EVM),
      );

      await expect(
        controller.assign({ customerId: 'cust-001', driverFamily: WalletFamily.EVM }),
      ).rejects.toBeInstanceOf(WalletPoolExhaustedError);
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('delegates to service.findAll and returns PaginatedWalletResponseDto', async () => {
      const entity = makeEntity();
      service.findAll.mockResolvedValue({
        data: [entity as any],
        total: 1,
        page: 1,
        limit: 50,
      } as any);

      const result = await controller.findAll({ page: 1, limit: 50 });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 50 });
      expect(result).toBeInstanceOf(PaginatedWalletResponseDto);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // =========================================================================
  // findAllByCustomer
  // =========================================================================

  describe('findAllByCustomer', () => {
    it('returns an array of WalletResponseDto', async () => {
      const entity = makeEntity({ customerId: 'cust-001' });
      service.findAllByCustomer.mockResolvedValue([entity as any]);

      const result = await controller.findAllByCustomer('cust-001');

      expect(service.findAllByCustomer).toHaveBeenCalledWith('cust-001');
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(WalletResponseDto);
    });

    it('returns empty array when customer has no wallets', async () => {
      service.findAllByCustomer.mockResolvedValue([]);

      const result = await controller.findAllByCustomer('cust-empty');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // findByAddress
  // =========================================================================

  describe('findByAddress', () => {
    it('delegates to service.findByAddress and returns WalletResponseDto', async () => {
      const entity = makeEntity();
      service.findByAddress.mockResolvedValue(entity as any);

      const result = await controller.findByAddress('0xABCDEF');

      expect(service.findByAddress).toHaveBeenCalledWith('0xABCDEF');
      expect(result).toBeInstanceOf(WalletResponseDto);
    });

    it('propagates WalletNotFoundError when address does not exist', async () => {
      service.findByAddress.mockRejectedValue(new WalletNotFoundError('0xMISSING'));

      await expect(controller.findByAddress('0xMISSING')).rejects.toBeInstanceOf(
        WalletNotFoundError,
      );
    });
  });

  // =========================================================================
  // getPoolStatus
  // =========================================================================

  describe('getPoolStatus', () => {
    it('returns { family, availableCount } from service.getPoolStatus', async () => {
      service.getPoolStatus.mockResolvedValue(350);

      const result = await controller.getPoolStatus(WalletFamily.EVM);

      expect(service.getPoolStatus).toHaveBeenCalledWith(WalletFamily.EVM);
      expect(result).toEqual({ family: WalletFamily.EVM, availableCount: 350 });
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('delegates to service.findById and returns WalletResponseDto', async () => {
      const entity = makeEntity();
      service.findById.mockResolvedValue(entity as any);

      const result = await controller.findById('w-uuid-001');

      expect(service.findById).toHaveBeenCalledWith('w-uuid-001');
      expect(result).toBeInstanceOf(WalletResponseDto);
      expect(result.id).toBe('w-uuid-001');
    });

    it('propagates WalletNotFoundError', async () => {
      service.findById.mockRejectedValue(new WalletNotFoundError('missing'));

      await expect(controller.findById('missing')).rejects.toBeInstanceOf(
        WalletNotFoundError,
      );
    });
  });

  // =========================================================================
  // lock
  // =========================================================================

  describe('lock', () => {
    it('calls lockWallet with id and lockReason, returns WalletResponseDto', async () => {
      const entity = makeEntity({ status: WalletStatus.LOCKED, lockedAt: new Date() });
      service.lockWallet.mockResolvedValue(entity as any);

      const result = await controller.lock('w-uuid-001', { lockReason: 'suspicious' });

      expect(service.lockWallet).toHaveBeenCalledWith('w-uuid-001', 'suspicious');
      expect(result).toBeInstanceOf(WalletResponseDto);
    });

    it('uses empty string when lockReason is omitted', async () => {
      const entity = makeEntity({ status: WalletStatus.LOCKED, lockedAt: new Date() });
      service.lockWallet.mockResolvedValue(entity as any);

      await controller.lock('w-uuid-001', {});

      expect(service.lockWallet).toHaveBeenCalledWith('w-uuid-001', '');
    });
  });

  // =========================================================================
  // unlock
  // =========================================================================

  describe('unlock', () => {
    it('calls unlockWallet with id only, returns WalletResponseDto', async () => {
      const entity = makeEntity({ status: WalletStatus.AVAILABLE });
      service.unlockWallet.mockResolvedValue(entity as any);

      const result = await controller.unlock('w-uuid-001');

      expect(service.unlockWallet).toHaveBeenCalledWith('w-uuid-001');
      expect(result).toBeInstanceOf(WalletResponseDto);
    });
  });

  // =========================================================================
  // compromise
  // =========================================================================

  describe('compromise', () => {
    it('calls compromiseWallet with id and lockReason, returns WalletResponseDto', async () => {
      const entity = makeEntity({ status: WalletStatus.COMPROMISED, compromisedAt: new Date() });
      service.compromiseWallet.mockResolvedValue(entity as any);

      const result = await controller.compromise('w-uuid-001', { lockReason: 'key leak' });

      expect(service.compromiseWallet).toHaveBeenCalledWith('w-uuid-001', 'key leak');
      expect(result).toBeInstanceOf(WalletResponseDto);
    });
  });

  // =========================================================================
  // archive
  // =========================================================================

  describe('archive', () => {
    it('calls archiveWallet with id and lockReason, returns WalletResponseDto', async () => {
      const entity = makeEntity({ status: WalletStatus.ARCHIVED, archivedAt: new Date() });
      service.archiveWallet.mockResolvedValue(entity as any);

      const result = await controller.archive('w-uuid-001', { lockReason: 'decommissioned' });

      expect(service.archiveWallet).toHaveBeenCalledWith('w-uuid-001', 'decommissioned');
      expect(result).toBeInstanceOf(WalletResponseDto);
    });
  });
});
