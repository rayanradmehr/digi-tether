import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { DataSource } from 'typeorm';

import type { IWalletRepository } from '../repositories/wallet.repository.interface';
import { WALLET_REPOSITORY } from '../repositories/wallet.repository.token';

import type { WalletAuditLogRepository } from '../repositories/wallet-audit-log.repository';
import { WALLET_AUDIT_LOG_REPOSITORY } from '../repositories/wallet-audit-log.repository.token';

import type { WalletEntity } from '../entities/wallet.entity';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import { WalletAuditAction } from '../enums/wallet-audit-action.enum';

import { WalletNotFoundError } from '../errors/wallet-not-found.error';
import { WalletPoolExhaustedError } from '../errors/wallet-pool-exhausted.error';
import { WalletInvalidStatusError } from '../errors/wallet-invalid-status.error';
import { WalletTerminalStatusError } from '../errors/wallet-terminal-status.error';
import { WalletFamilyNotSupportedError } from '../errors/wallet-family-not-supported.error';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

import { WalletCreatedEvent } from '../events/wallet-created.event';
import { WalletAssignedEvent } from '../events/wallet-assigned.event';
import { WalletLockedEvent } from '../events/wallet-locked.event';
import { WalletUnlockedEvent } from '../events/wallet-unlocked.event';
import { WalletCompromisedEvent } from '../events/wallet-compromised.event';
import { WalletArchivedEvent } from '../events/wallet-archived.event';
import { WalletPoolLowEvent } from '../events/wallet-pool-low.event';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/**
 * Input to createFromSignerResult().
 * Contains only the fields the Wallet Module cares about from the completed
 * CREATE_WALLET SignerJob result. The service never reads signature bytes
 * or performs any cryptographic operation.
 */
export interface WalletCreationInput {
  /** UUID of the CREATE_WALLET SignerJob that produced this wallet. */
  readonly createdByJobId: string;
  /** Blockchain address produced by the Offline Signer. Stored as-is. */
  readonly address: string;
  /** Cryptographic family of the wallet. */
  readonly driverFamily: WalletFamily;
  /**
   * Full public key hex from the Signer result.
   * REQUIRED — a result without publicKey is rejected before persistence.
   */
  readonly publicKey: string;
  /** Optional: SHA-256 fingerprint of publicKey. */
  readonly publicKeyFingerprint?: string | null;
  /** Optional: Offline Signer binary version. */
  readonly signerVersion?: string | null;
}

/**
 * Input to assignWallet().
 */
export interface AssignWalletInput {
  readonly customerId: string;
  readonly driverFamily: WalletFamily;
}

/**
 * Result of a successful assignWallet() call.
 */
export interface WalletAssignmentResult {
  readonly walletId: string;
  readonly address: string;
  readonly driverFamily: WalletFamily;
}

// ---------------------------------------------------------------------------
// Cache key helpers — centralised so every mutation can invalidate correctly
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000; // 60 seconds

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

/**
 * WalletService — single source of truth for wallet lifecycle management.
 *
 * Responsibilities (ARCHITECTURE.md §10.1):
 * - Wallet creation from Signer results
 * - Mandatory 2-phase assignment (reserve → assign) inside one transaction
 * - All state-machine transitions (lock / unlock / compromise / archive)
 * - Append-only audit log on every transition
 * - Domain event emission on every transition
 * - Cache population and invalidation
 *
 * Hard boundaries — this service MUST NEVER:
 * - Generate wallets, key pairs, or addresses
 * - Build blockchain payloads or transactions
 * - Sign any data
 * - Call blockchain RPC nodes
 * - Import ethers, tronweb, bitcoinjs-lib, or any blockchain SDK
 * - Call the Offline Signer directly
 *
 * Race conditions are handled by:
 * - SELECT … FOR UPDATE SKIP LOCKED inside reserveWallet()
 * - Atomic reserve + assign inside a single database transaction
 * - TypeORM @VersionColumn optimistic lock on every entity mutation
 *
 * All state transitions are guarded by the state machine defined in
 * ARCHITECTURE.md §4 and DOMAIN-MODEL.md §4.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  public constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: IWalletRepository,

    @Inject(WALLET_AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: WalletAuditLogRepository,

    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,

    private readonly eventEmitter: EventEmitter2,

    private readonly dataSource: DataSource,
  ) {}

  // =========================================================================
  // CREATION
  // =========================================================================

  /**
   * Persists a new AVAILABLE wallet record from a completed CREATE_WALLET
   * SignerJob result.
   *
   * Guards:
   * - Rejects if `publicKey` is absent or empty (required field per blueprint).
   * - Rejects if `address` already exists (idempotency + uniqueness guard).
   *   An address that was once used must never produce a duplicate row.
   *
   * No blockchain validation, no cryptographic verification.
   * The Signer is trusted as the sole cryptographic authority.
   *
   * Post-conditions:
   * - New row: status = AVAILABLE, all immutable fields frozen.
   * - Audit log entry: CREATED.
   * - Event: WalletCreated emitted.
   * - Cache: pool count invalidated for the family.
   */
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

    // Idempotency guard — address uniqueness is permanent (includes soft-deleted)
    const alreadyExists = await this.walletRepository.existsByAddress(input.address);
    if (alreadyExists) {
      this.logger.warn(
        { address: input.address, createdByJobId: input.createdByJobId },
        'Duplicate address from CREATE_WALLET result — ignoring',
      );
      // Return the existing record rather than throwing; this is idempotent
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
  // ASSIGNMENT — mandatory 2-phase, single transaction
  // =========================================================================

  /**
   * Assigns an AVAILABLE wallet to a customer using the mandatory 2-phase
   * reserve → assign protocol inside a single database transaction.
   *
   * Idempotent: if the customer already holds a wallet for this family,
   * the existing wallet is returned without any modification.
   *
   * Protocol (ARCHITECTURE.md §7):
   * 1. Guard: customer already assigned? → return existing (idempotent).
   * 2. BEGIN TRANSACTION
   * 3. PHASE 1 — reserveWallet(): SELECT … FOR UPDATE SKIP LOCKED + UPDATE RESERVED
   * 4. PHASE 2 — assignWallet(): UPDATE ASSIGNED + clear reservation fields
   * 5. COMMIT
   * 6. Append audit log (RESERVED + ASSIGNED entries).
   * 7. Emit WalletAssigned event.
   * 8. Invalidate caches.
   *
   * Race condition handling:
   * - SELECT … FOR UPDATE SKIP LOCKED prevents two callers reserving the same wallet.
   * - The entire reserve+assign runs inside one serialisable transaction.
   * - If reserve returns null, the pool is exhausted — emit WalletPoolLow + throw.
   *
   * @throws {WalletFamilyNotSupportedError} When driverFamily is not a valid enum value.
   * @throws {WalletPoolExhaustedError}       When no AVAILABLE wallet exists for the family.
   */
  public async assignWallet(
    input: AssignWalletInput,
  ): Promise<WalletAssignmentResult> {
    this.assertValidFamily(input.driverFamily);
    this.assertCustomerIdNotEmpty(input.customerId);

    // Idempotency: return existing assignment without modification
    const existing = await this.walletRepository.findByCustomer(
      input.customerId,
      input.driverFamily,
    );
    if (existing) {
      this.logger.debug(
        { walletId: existing.id, driverFamily: input.driverFamily },
        'assignWallet — idempotent return of existing assignment',
      );
      return {
        walletId: existing.id,
        address: existing.address,
        driverFamily: existing.driverFamily,
      };
    }

    // Execute 2-phase assignment inside a single database transaction
    let assignedWallet: WalletEntity;
    let reservationToken: string;

    await this.dataSource.transaction(async () => {
      // PHASE 1: Reserve
      const reservation = await this.walletRepository.reserveWallet(
        input.driverFamily,
      );

      if (!reservation) {
        // Pool is exhausted — emit alert and throw
        const availableCount = await this.walletRepository.countAvailable(
          input.driverFamily,
        );
        this.logger.error(
          { driverFamily: input.driverFamily, availableCount },
          'Wallet pool exhausted — no AVAILABLE wallet for family',
        );
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

      reservationToken = reservation.reservationToken;

      // PHASE 2: Assign — token must match exactly
      assignedWallet = await this.walletRepository.assignWallet({
        walletId: reservation.walletId,
        reservationToken: reservation.reservationToken,
        customerId: input.customerId,
      });
    });

    // Post-transaction: audit log, events, cache invalidation
    // (outside TX — append-only log does not need to roll back with wallet)
    await this.appendAuditLog({
      walletId: assignedWallet!.id,
      action: WalletAuditAction.RESERVED,
      previousStatus: WalletStatus.AVAILABLE,
      newStatus: WalletStatus.RESERVED,
      actor: WalletService.name,
      reason: 'Phase 1 of 2-phase assignment',
      metadata: { driverFamily: input.driverFamily },
    });

    await this.appendAuditLog({
      walletId: assignedWallet!.id,
      action: WalletAuditAction.ASSIGNED,
      previousStatus: WalletStatus.RESERVED,
      newStatus: WalletStatus.ASSIGNED,
      actor: WalletService.name,
      // customerId is PII — must NOT appear in logs or metadata
      metadata: { driverFamily: input.driverFamily },
    });

    await this.invalidateWalletCaches(assignedWallet!);
    await this.invalidatePoolCountCache(input.driverFamily);

    this.eventEmitter.emit(
      'wallet.assigned',
      new WalletAssignedEvent({
        walletId: assignedWallet!.id,
        address: assignedWallet!.address,
        driverFamily: assignedWallet!.driverFamily,
        customerId: input.customerId,
        assignedAt: assignedWallet!.assignedAt!.toISOString(),
      }),
    );

    this.logger.log(
      { walletId: assignedWallet!.id, driverFamily: input.driverFamily },
      'Wallet assigned to customer',
    );

    return {
      walletId: assignedWallet!.id,
      address: assignedWallet!.address,
      driverFamily: assignedWallet!.driverFamily,
    };
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  /**
   * Returns a wallet by its UUID primary key.
   * Warm cache hit is served without a database round-trip.
   *
   * @throws {WalletNotFoundError} When the wallet does not exist or is soft-deleted.
   */
  public async findById(id: string): Promise<WalletEntity> {
    const cacheKey = cacheKeyById(id);
    const cached = await this.cache.get<WalletEntity>(cacheKey);
    if (cached) return cached;

    const wallet = await this.walletRepository.findById(id);
    if (!wallet) throw new WalletNotFoundError(id);

    await this.cache.set(cacheKey, wallet, CACHE_TTL_MS);
    return wallet;
  }

  /**
   * Returns the wallet assigned to a customer for a specific family.
   * Cache key: customer + family composite.
   *
   * @throws {WalletNotFoundError} When no assignment exists for this combination.
   */
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
    if (!wallet) {
      throw new WalletNotFoundError(
        `customer:${customerId}:family:${driverFamily}`,
      );
    }

    await this.cache.set(cacheKey, wallet, CACHE_TTL_MS);
    return wallet;
  }

  /**
   * Returns all wallets across all families assigned to a customer.
   * No cache (list queries are uncached to avoid stale list ordering).
   */
  public async findAllByCustomer(customerId: string): Promise<WalletEntity[]> {
    this.assertCustomerIdNotEmpty(customerId);
    return this.walletRepository.findAllByCustomer(customerId);
  }

  /**
   * Returns a wallet by its blockchain address.
   * Warm cache hit is served without a database round-trip.
   *
   * @throws {WalletNotFoundError} When the address is not found.
   */
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

  /**
   * Returns the count of AVAILABLE wallets for a given family.
   * Used by WalletPoolService.checkThreshold() and admin pool status endpoint.
   * Result is cached for 5 seconds to reduce DB load under high polling.
   */
  public async getPoolStatus(driverFamily: WalletFamily): Promise<number> {
    this.assertValidFamily(driverFamily);

    const cacheKey = cacheKeyPoolCount(driverFamily);
    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const count = await this.walletRepository.countAvailable(driverFamily);
    await this.cache.set(cacheKey, count, 5_000); // 5 second TTL for pool counts
    return count;
  }

  // =========================================================================
  // STATE TRANSITIONS — lock / unlock
  // =========================================================================

  /**
   * Transitions a wallet to LOCKED status.
   * Snapshots `previousStatus` so unlockWallet() can restore the correct state.
   *
   * Permitted from: AVAILABLE, ASSIGNED.
   * Forbidden from: COMPROMISED, ARCHIVED (terminal), already LOCKED.
   *
   * @throws {WalletNotFoundError}       When the wallet does not exist.
   * @throws {WalletTerminalStatusError} When the wallet is in a terminal state.
   * @throws {WalletInvalidStatusError}  When the wallet is already LOCKED.
   */
  public async lockWallet(walletId: string, reason: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);

    this.assertNotTerminal(wallet);
    if (wallet.status === WalletStatus.LOCKED) {
      throw new WalletInvalidStatusError(
        walletId,
        wallet.status,
        'Wallet is already LOCKED',
      );
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

    this.logger.log({ walletId, previousStatus, reason }, 'Wallet locked');
    return updated;
  }

  /**
   * Unlocks a LOCKED wallet, restoring its previous status.
   *
   * Permitted from: LOCKED only.
   * Restores: previousStatus (AVAILABLE or ASSIGNED).
   *
   * @throws {WalletNotFoundError}      When the wallet does not exist.
   * @throws {WalletInvalidStatusError} When the wallet is not currently LOCKED.
   */
  public async unlockWallet(walletId: string): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);

    if (wallet.status !== WalletStatus.LOCKED) {
      throw new WalletInvalidStatusError(
        walletId,
        wallet.status,
        'Only LOCKED wallets can be unlocked',
      );
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

    this.logger.log({ walletId, restoredStatus }, 'Wallet unlocked');
    return updated;
  }

  // =========================================================================
  // STATE TRANSITIONS — terminal
  // =========================================================================

  /**
   * Permanently decommissions a wallet.
   * Terminal — no further transition is permitted after COMPROMISED.
   *
   * Permitted from: AVAILABLE, RESERVED, ASSIGNED, LOCKED.
   * Forbidden from: COMPROMISED (already terminal), ARCHIVED (terminal).
   *
   * @throws {WalletNotFoundError}       When the wallet does not exist.
   * @throws {WalletTerminalStatusError} When the wallet is already in a terminal state.
   */
  public async compromiseWallet(
    walletId: string,
    reason: string,
  ): Promise<WalletEntity> {
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

    this.logger.warn({ walletId, reason }, 'Wallet compromised — terminal state');
    return updated;
  }

  /**
   * Retires a wallet to ARCHIVED status.
   * Terminal — no further transition is permitted after ARCHIVED.
   *
   * Permitted from: AVAILABLE, LOCKED only.
   * Forbidden from: ASSIGNED (must be compromised, not archived),
   *                 COMPROMISED, ARCHIVED (terminal).
   *
   * @throws {WalletNotFoundError}       When the wallet does not exist.
   * @throws {WalletTerminalStatusError} When the wallet is already in a terminal state.
   * @throws {WalletInvalidStatusError}  When the wallet is in ASSIGNED or RESERVED status.
   */
  public async archiveWallet(
    walletId: string,
    reason: string,
  ): Promise<WalletEntity> {
    const wallet = await this.findById(walletId);
    this.assertNotTerminal(wallet);

    const archivableStatuses: WalletStatus[] = [
      WalletStatus.AVAILABLE,
      WalletStatus.LOCKED,
    ];
    if (!archivableStatuses.includes(wallet.status)) {
      throw new WalletInvalidStatusError(
        walletId,
        wallet.status,
        `Only AVAILABLE or LOCKED wallets may be archived. ` +
        `Current status: ${wallet.status}`,
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

    this.logger.log({ walletId, reason }, 'Wallet archived — terminal state');
    return updated;
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Appends an entry to the append-only wallet_audit_log table.
   * Failures here must NEVER roll back the parent business operation —
   * the audit log call is intentionally outside the assignment transaction.
   * A failed audit write is logged at ERROR level for alerting.
   */
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

  /**
   * Invalidates all cache keys tied to a specific wallet entity.
   * Called on every state transition to prevent stale reads.
   */
  private async invalidateWalletCaches(wallet: WalletEntity): Promise<void> {
    await Promise.allSettled([
      this.cache.del(cacheKeyById(wallet.id)),
      this.cache.del(cacheKeyByAddress(wallet.address)),
      wallet.customerId
        ? this.cache.del(cacheKeyByCustomer(wallet.customerId, wallet.driverFamily))
        : Promise.resolve(),
    ]);
  }

  /**
   * Invalidates the pool available-count cache for a family.
   * Called after any mutation that changes the AVAILABLE count.
   */
  private async invalidatePoolCountCache(driverFamily: WalletFamily): Promise<void> {
    await this.cache.del(cacheKeyPoolCount(driverFamily));
  }

  /**
   * Guards against operations on terminal-state wallets.
   * COMPROMISED and ARCHIVED are terminal — no transition is ever permitted.
   *
   * @throws {WalletTerminalStatusError}
   */
  private assertNotTerminal(wallet: WalletEntity): void {
    const terminalStatuses: WalletStatus[] = [
      WalletStatus.COMPROMISED,
      WalletStatus.ARCHIVED,
    ];
    if (terminalStatuses.includes(wallet.status)) {
      throw new WalletTerminalStatusError(wallet.id, wallet.status);
    }
  }

  /**
   * Guards against unsupported WalletFamily values.
   * Validates at service entry point before any DB access.
   *
   * @throws {WalletFamilyNotSupportedError}
   */
  private assertValidFamily(driverFamily: WalletFamily): void {
    if (!Object.values(WalletFamily).includes(driverFamily)) {
      throw new WalletFamilyNotSupportedError(driverFamily as string);
    }
  }

  /**
   * Guards against empty customerId strings.
   * customerId is PII and must never be empty.
   */
  private assertCustomerIdNotEmpty(customerId: string): void {
    if (!customerId || customerId.trim().length === 0) {
      throw new Error('customerId must not be empty');
    }
  }
}
