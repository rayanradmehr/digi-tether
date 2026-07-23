import type { WalletEntity } from '../entities/wallet.entity';
import type { WalletFamily } from '../enums/wallet-family.enum';
import type { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletQueryDto } from '../dto/wallet-query.dto';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

// ---------------------------------------------------------------------------
// Reservation result contract
// ---------------------------------------------------------------------------

/**
 * Returned by `reserveWallet()` on success.
 * The caller MUST use `reservationToken` in the subsequent `assignWallet()` call.
 */
export interface WalletReservationResult {
  readonly walletId: string;
  readonly reservationToken: string;
}

// ---------------------------------------------------------------------------
// Assign params contract
// ---------------------------------------------------------------------------

/**
 * Parameters required for Phase 2 of the 2-phase assignment protocol.
 * All three fields are mandatory. Missing or mismatched `reservationToken`
 * causes zero rows updated, which the repository surfaces as a thrown error.
 */
export interface WalletAssignParams {
  readonly walletId: string;
  readonly reservationToken: string;
  readonly customerId: string;
}

// ---------------------------------------------------------------------------
// Status count map
// ---------------------------------------------------------------------------

/**
 * Count of wallets per status for a given driver family.
 * All `WalletStatus` keys are always present (0 when no matching rows).
 */
export type WalletStatusCountMap = Record<WalletStatus, number>;

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

/**
 * Contract for the `WalletRepository`.
 *
 * Defines every persistence operation the `WalletService` is permitted
 * to invoke. The interface is the boundary — services depend on this
 * abstraction, never on the concrete TypeORM implementation.
 *
 * All mutation methods return the mutated entity (or a typed result) so
 * the service can proceed without a second fetch.
 *
 * Rules:
 * - No business logic.
 * - No event publishing.
 * - Returns `null` on miss — never throws `NotFoundException`.
 * - Throws typed errors only for precondition violations detected at
 *   the persistence layer (e.g. `WalletReservationTokenMismatchError`).
 */
export interface IWalletRepository {
  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  findById(id: string): Promise<WalletEntity | null>;
  findByAddress(address: string): Promise<WalletEntity | null>;
  findByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<WalletEntity | null>;
  findAllByCustomer(customerId: string): Promise<WalletEntity[]>;
  findByDriverFamily(
    driverFamily: WalletFamily,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<WalletEntity>>;
  findAll(query: WalletQueryDto): Promise<PaginatedResult<WalletEntity>>;

  // -------------------------------------------------------------------------
  // Existence checks
  // -------------------------------------------------------------------------

  /**
   * Checks address uniqueness across ALL rows — including soft-deleted ones.
   * An address that was once used must never be reused.
   */
  existsByAddress(address: string): Promise<boolean>;
  existsByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Aggregate reads
  // -------------------------------------------------------------------------

  countAvailable(driverFamily: WalletFamily): Promise<number>;
  countByStatus(driverFamily: WalletFamily): Promise<WalletStatusCountMap>;

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  save(data: Partial<WalletEntity>): Promise<WalletEntity>;

  /**
   * Atomic SELECT … FOR UPDATE SKIP LOCKED + UPDATE.
   * Returns `null` when no AVAILABLE wallet exists for the family.
   * Must be called inside a caller-managed transaction.
   */
  reserveWallet(
    driverFamily: WalletFamily,
  ): Promise<WalletReservationResult | null>;

  /**
   * Phase 2 of assignment.
   * Throws `WalletReservationTokenMismatchError` when the WHERE clause
   * matches zero rows (token mismatch or status no longer RESERVED).
   */
  assignWallet(params: WalletAssignParams): Promise<WalletEntity>;

  /**
   * Releases all expired RESERVED wallets back to AVAILABLE.
   * Returns the count of rows affected.
   * Called by the `WalletReservationCleanupTask` cron.
   */
  releaseExpiredReservations(ttlSeconds: number): Promise<number>;

  lockWallet(id: string, reason: string): Promise<WalletEntity>;
  unlockWallet(id: string): Promise<WalletEntity>;
  compromiseWallet(id: string, reason: string): Promise<WalletEntity>;
  archiveWallet(id: string, reason: string): Promise<WalletEntity>;
  softDelete(id: string): Promise<void>;
}
