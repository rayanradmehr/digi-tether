import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';

import type { IWalletRepository } from '../repositories/wallet.repository.interface';
import { WALLET_REPOSITORY } from '../repositories/wallet.repository.token';

import type { WalletAuditLogRepository } from '../repositories/wallet-audit-log.repository';
import { WALLET_AUDIT_LOG_REPOSITORY } from '../repositories/wallet-audit-log.repository.token';

import type { WalletEntity } from '../entities/wallet.entity';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import { WalletAuditAction } from '../enums/wallet-audit-action.enum';
import type { WalletQueryDto } from '../dto/wallet-query.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

import { WalletNotFoundError } from '../errors/wallet-not-found.error';
import { WalletPoolExhaustedError } from '../errors/wallet-pool-exhausted.error';
import { WalletInvalidStatusError } from '../errors/wallet-invalid-status.error';
import { WalletTerminalStatusError } from '../errors/wallet-terminal-status.error';
import { WalletFamilyNotSupportedError } from '../errors/wallet-family-not-supported.error';

import { WalletCreatedEvent } from '../events/wallet-created.event';
import { WalletAssignedEvent } from '../events/wallet-assigned.event';
import { WalletLockedEvent } from '../events/wallet-locked.event';
import { WalletUnlockedEvent } from '../events/wallet-unlocked.event';
import { WalletCompromisedEvent } from '../events/wallet-compromised.event';
import { WalletArchivedEvent } from '../events/wallet-archived.event';
import { WalletPoolLowEvent } from '../events/wallet-pool-low.event';

import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ICache } from '@shared/cache/cache.interface';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface WalletCreationInput {
  readonly createdByJobId: string;
  readonly address: string;
  readonly driverFamily: WalletFamily;
  readonly publicKey: string;
  readonly publicKeyFingerprint?: string | null;
  readonly signerVersion?: string | null;
}

export interface AssignWalletInput {
  readonly customerId: string;
  readonly driverFamily: WalletFamily;
}

export interface WalletAssignmentResult {
  readonly walletId: string;
  readonly address: string;
  readonly driverFamily: WalletFamily;
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

function cacheKeyById(id: string): string {
  return `wallet:id:${id}`;
}

function cacheKeyByAddress(address: string): string {
  return `wallet:address:${address}`;
}

function cacheKeyByCustomer(customerId: string, driverFamily: WalletFamily): string {
  return `wallet:customer:${customerId}:${driverFamily}`;
}

function cacheKeyPoolCount(driverFamily: WalletFamily): string {
  return `wallet:pool:available:${driverFamily}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  public constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,

    @Inject(WALLET_AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: WalletAuditLogRepository,

    @Inject(INJECTION_TOKENS.CACHE)
    private readonly cache: ICache,

    private readonly eventEmitter: EventEmitter2,

    private readonly dataSource: DataSource,
  ) {}

  // =========================================================================
  // CREATION
  // =========================================================================

  public async createFromSignerResult(
    input: WalletCreationInput,
  ): Promise<WalletEntity> {
    this.assertValidFamily(input.driverFamily);

    if (!input.publicKey || input.publicKey.trim().length === 0) {
      throw new Error(
        `CREATE_WALLET result for job ${input.createdByJobId} is missing publicKey. ` +
        `Wallet cannot be persisted without a public key.`,
      );
    }

    const alreadyExists = await this.walletRepository.existsByAddress(input.address);
    if (alreadyExists) {
      this.logger.warn(
        { address: input.address, createdByJobId: input.createdByJobId },
        'Duplicate address from CREATE_WALLET result — ignoring',
      );
      const existing = await this.walletRepository.findByAddress(input.address);
      if (existing) return existing;
    }

    const wallet = await this.walletRepository.save({
      address: input.address,
      driverFamily: input.driverFamily,
      status: WalletStatus.AVAILABLE,
      createdByJobId: input.createdByJobId,
      publicKey: input.publicKey,
      publicKeyFingerprint: input.publicKeyFingerprint ?? null,
      signerVersion: input.signerVersion ?? null,
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
    });

    await this.appendAuditLog({
      walletId: wallet.id,
      action: WalletAuditAction.CREATED,
      previousStatus: null,
      newStatus: WalletStatus.AVAILABLE,
      actor: WalletService.name,
      reason: `Created from SignerJob ${input.createdByJobId}`,
      metadata: {
        createdByJobId: input.createdByJobId,
        driverFamily: input.driverFamily,
        signerVersion: input.signerVersion ?? null,
      },
    });

    await this.invalidatePoolCountCache(input.driverFamily);

    this.eventEmitter.emit(
      'wallet.created',
      new WalletCreatedEvent({
        walletId: wallet.id,
        address: wallet.address,
        driverFamily: wallet.driverFamily,
        createdByJobId: wallet.createdByJobId,
        signerVersion: wallet.signerVersion ?? '',
        createdAt: wallet.createdAt.toISOString(),
      }),
    );

    this.logger.log(
      { walletId: wallet.id, driverFamily: wallet.driverFamily },
      'Wallet created from SignerJob result',
    );

    return wallet;
  }

  // =========================================================================
  // ASSIGNMENT
  // =========================================================================

  public async assignWallet(
    input: AssignWalletInput,
  ): Promise<WalletAssignmentResult> {
    this.assertValidFamily(input.driverFamily);
    this.assertCustomerIdNotEmpty(input.customerId);

    const existing = await this.walletRepository.findByCustomer(
      input.customerId,
      input.driverFamily,
    );
    if (existing) {
      return {
        walletId: existing.id,
        address: existing.address,
        driverFamily: existing.driverFamily,
      };
    }

    let assignedWallet!: WalletEntity;

    await this.dataSource.transaction(async () => {
      const reservation = await this.walletRepository.reserveWallet(input.driverFamily);

      if (!reservation) {
        const availableCount = await this.walletRepository.countAvailable(input.driverFamily);
        this.eventEmitter.emit(
          'wallet.pool.low',
          new WalletPoolLowEvent({
            driverFamily: input.driverFamily,
            availableCount,
            threshold: 0,
            detectedAt: new Date().toISOString(),
          }),
        );
        throw new WalletPoolExhaustedError(input.driverFamily);
      }

      assignedWallet = await this.walletRepository.assignWallet({
        walletId: reservation.walletId,
        reservationToken: reservation.reservationToken,
        customerId: input.customerId,
      });
    });

    await this.appendAuditLog({
      walletId: assignedWallet.id,
      action: WalletAuditAction.ASSIGNED,
      previousStatus: WalletStatus.RESERVED,
      newStatus: WalletStatus.ASSIGNED,
      actor: WalletService.name,
      metadata: { driverFamily: input.driverFamily },
    });

    await this.invalidateWalletCaches(assignedWallet);
    await this.invalidatePoolCountCache(input.driverFamily);

    this.eventEmitter.emit(
      'wallet.assigned',
      new WalletAssignedEvent({
        walletId: assignedWallet.id,
        address: assignedWallet.address,
        driverFamily: assignedWallet.driverFamily,
        customerId: input.customerId,
        assignedAt: assignedWallet.assignedAt!.toISOString(),
      }),
    );

    return {
      walletId: assignedWallet.id,
      address: assignedWallet.address,
      driverFamily: assignedWallet.driverFamily,
    };
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  public async findAll(query: WalletQueryDto): Promise<PaginatedResult<WalletEntity>> {
    return this.walletRepository.findAll(query);
  }

  public async findById(id: string): Promise<WalletEntity> {
    const cacheKey = cacheKeyById(id);
    const cached = await this.cache.get<WalletEntity>(cacheKey);
    if (cached) return cached;

    const wallet = await this.walletRepository.findById(id);
    if (!wallet) throw new WalletNotFoundError(id);

    await this.cache.set(cacheKey, wallet, CACHE_TTL_MS);
    return wallet;
  }

  public async findByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<WalletEntity> {
    this.assertCustomerIdNotEmpty(customerId);
    this.assertValidFamily(driverFamily);

    const cacheKey = cacheKeyByCustomer(customerId, driverFamily);
    const cached = await this.cache.get<WalletEntity>(cacheKey);
    if (cached) return cached;

    const wallet = await this.walletRepository.findByCustomer(customerId, driverFamily);
    if (!wallet) throw new WalletNotFoundError(`customer:${customerId}:family:${driverFamily}`);

    await this.cache.set(cacheKey, wallet, CACHE_TTL_MS);
    return wallet;
  }

  public async findAllByCustomer(customerId: string): Promise<WalletEntity[]> {
    this.assertCustomerIdNotEmpty(customerId);
    return this.walletRepository.findAllByCustomer(customerId);
  }

  public async findByAddress(address: string): Promise<WalletEntity> {
    if (!address || address.trim().length === 0) {
      throw new Error('address must not be empty');
    }
    const cacheKey = cacheKeyByAddress(address);
    const cached = await this.cache.get<WalletEntity>(cacheKey);
    if (cached) return cached;

    const wallet = await this.walletRepository.findByAddress(address);
    if (!wallet) throw new WalletNotFoundError(`address:${address}`);

    await this.cache.set(cacheKey, wallet, CACHE_TTL_MS);
    return wallet;
  }

  public async getPoolStatus(driverFamily: WalletFamily): Promise<number> {
    this.assertValidFamily(driverFamily);
    const cacheKey = cacheKeyPoolCount(driverFamily);
    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const count = await this.walletRepository.countAvailable(driverFamily);
    await this.cache.set(cacheKey, count, 5_000);
    return count;
  }

  // =========================================================================
  // STATE TRANSITIONS
  // =========================================================================

  public async lockWallet(walletId: string, reason: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);
    this.assertNotTerminal(wallet);
    if (wallet.status === WalletStatus.LOCKED) {
      throw new WalletInvalidStatusError(walletId, wallet.status, 'Wallet is already LOCKED');
    }

    const previousStatus = wallet.status;
    const updated = await this.walletRepository.lockWallet(walletId, reason);

    await this.appendAuditLog({
      walletId,
      action: WalletAuditAction.LOCKED,
      previousStatus,
      newStatus: WalletStatus.LOCKED,
      actor: WalletService.name,
      reason,
    });

    await this.invalidateWalletCaches(wallet);
    await this.invalidatePoolCountCache(wallet.driverFamily);

    this.eventEmitter.emit(
      'wallet.locked',
      new WalletLockedEvent({
        walletId,
        driverFamily: updated.driverFamily,
        reason,
        previousStatus,
        lockedAt: updated.lockedAt!.toISOString(),
      }),
    );

    return updated;
  }

  public async unlockWallet(walletId: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);
    if (wallet.status !== WalletStatus.LOCKED) {
      throw new WalletInvalidStatusError(walletId, wallet.status, 'Only LOCKED wallets can be unlocked');
    }

    const restoredStatus = wallet.previousStatus ?? WalletStatus.AVAILABLE;
    const updated = await this.walletRepository.unlockWallet(walletId);

    await this.appendAuditLog({
      walletId,
      action: WalletAuditAction.UNLOCKED,
      previousStatus: WalletStatus.LOCKED,
      newStatus: restoredStatus,
      actor: WalletService.name,
      metadata: { restoredStatus },
    });

    await this.invalidateWalletCaches(wallet);
    await this.invalidatePoolCountCache(wallet.driverFamily);

    this.eventEmitter.emit(
      'wallet.unlocked',
      new WalletUnlockedEvent({
        walletId,
        driverFamily: updated.driverFamily,
        restoredStatus,
        unlockedAt: new Date().toISOString(),
      }),
    );

    return updated;
  }

  public async compromiseWallet(walletId: string, reason: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);
    this.assertNotTerminal(wallet);

    const previousStatus = wallet.status;
    const updated = await this.walletRepository.compromiseWallet(walletId, reason);

    await this.appendAuditLog({
      walletId,
      action: WalletAuditAction.COMPROMISED,
      previousStatus,
      newStatus: WalletStatus.COMPROMISED,
      actor: WalletService.name,
      reason,
    });

    await this.invalidateWalletCaches(wallet);
    await this.invalidatePoolCountCache(wallet.driverFamily);

    this.eventEmitter.emit(
      'wallet.compromised',
      new WalletCompromisedEvent({
        walletId,
        address: wallet.address,
        driverFamily: wallet.driverFamily,
        reason,
        compromisedAt: updated.compromisedAt!.toISOString(),
      }),
    );

    return updated;
  }

  public async archiveWallet(walletId: string, reason: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);
    this.assertNotTerminal(wallet);

    const archivableStatuses: WalletStatus[] = [WalletStatus.AVAILABLE, WalletStatus.LOCKED];
    if (!archivableStatuses.includes(wallet.status)) {
      throw new WalletInvalidStatusError(
        walletId,
        wallet.status,
        `Only AVAILABLE or LOCKED wallets may be archived. Current status: ${wallet.status}`,
      );
    }

    const previousStatus = wallet.status;
    const updated = await this.walletRepository.archiveWallet(walletId, reason);

    await this.appendAuditLog({
      walletId,
      action: WalletAuditAction.ARCHIVED,
      previousStatus,
      newStatus: WalletStatus.ARCHIVED,
      actor: WalletService.name,
      reason,
    });

    await this.invalidateWalletCaches(wallet);
    await this.invalidatePoolCountCache(wallet.driverFamily);

    this.eventEmitter.emit(
      'wallet.archived',
      new WalletArchivedEvent({
        walletId,
        driverFamily: wallet.driverFamily,
        reason,
        archivedAt: updated.archivedAt!.toISOString(),
      }),
    );

    return updated;
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async appendAuditLog(entry: {
    walletId: string;
    action: WalletAuditAction;
    previousStatus: WalletStatus | null;
    newStatus: WalletStatus;
    actor: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.auditLogRepository.append({
        walletId: entry.walletId,
        action: entry.action,
        previousStatus: entry.previousStatus,
        newStatus: entry.newStatus,
        actor: entry.actor,
        reason: entry.reason ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (err) {
      this.logger.error(
        { walletId: entry.walletId, action: entry.action, err },
        'Failed to append wallet audit log entry',
      );
    }
  }

  private async invalidateWalletCaches(wallet: WalletEntity): Promise<void> {
    await Promise.allSettled([
      this.cache.del(cacheKeyById(wallet.id)),
      this.cache.del(cacheKeyByAddress(wallet.address)),
      wallet.customerId
        ? this.cache.del(cacheKeyByCustomer(wallet.customerId, wallet.driverFamily))
        : Promise.resolve(),
    ]);
  }

  private async invalidatePoolCountCache(driverFamily: WalletFamily): Promise<void> {
    await this.cache.del(cacheKeyPoolCount(driverFamily));
  }

  private assertNotTerminal(wallet: WalletEntity): void {
    const terminalStatuses: WalletStatus[] = [WalletStatus.COMPROMISED, WalletStatus.ARCHIVED];
    if (terminalStatuses.includes(wallet.status)) {
      throw new WalletTerminalStatusError(wallet.id, wallet.status);
    }
  }

  private assertValidFamily(driverFamily: WalletFamily): void {
    if (!Object.values(WalletFamily).includes(driverFamily)) {
      throw new WalletFamilyNotSupportedError(driverFamily as string);
    }
  }

  private assertCustomerIdNotEmpty(customerId: string): void {
    if (!customerId || customerId.trim().length === 0) {
      throw new Error('customerId must not be empty');
    }
  }
}
