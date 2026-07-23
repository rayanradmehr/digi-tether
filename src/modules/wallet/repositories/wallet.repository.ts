import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { WalletEntity } from '../entities/wallet.entity';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletQueryDto } from '../dto/wallet-query.dto';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type {
  IWalletRepository,
  WalletAssignParams,
  WalletReservationResult,
  WalletStatusCountMap,
} from './wallet.repository.interface';

/**
 * Pure persistence layer for the `wallets` table.
 *
 * Responsibilities
 * ----------------
 * - Wrap every TypeORM operation behind a typed method.
 * - Translate primitives / query objects into TypeORM `FindOptions` or
 *   raw SQL where TypeORM's query builder is necessary for correctness
 *   (e.g. `SELECT … FOR UPDATE SKIP LOCKED`).
 * - Apply pagination and filtering at the database level.
 *
 * Rules (ARCHITECTURE.md §11.1 + §18)
 * ------------------------------------
 * - Must never call another repository.
 * - Must never call a service.
 * - Must never contain business rules or state-machine logic.
 * - Must never throw domain exceptions except `WalletReservationTokenMismatchError`
 *   (detected at persistence level — 0 rows updated on token mismatch).
 * - Must never expose the raw TypeORM `Repository<WalletEntity>` to callers.
 * - No event publishing.
 * - No validation of payload contents.
 * - No blockchain logic.
 * - Hard deletion is permanently forbidden.
 */
@Injectable()
export class WalletRepository implements IWalletRepository {
  public constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: Repository<WalletEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /**
   * Finds a wallet by its UUID primary key.
   * TypeORM automatically appends `AND deleted_at IS NULL`.
   * Returns `null` on miss or soft-delete.
   */
  public async findById(id: string): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Finds a wallet by its blockchain address.
   * Uses `IDX_wallets_address` (UNIQUE) — single index scan, O(log n).
   * Returns `null` if the address does not exist in active (non-deleted) rows.
   */
  public async findByAddress(address: string): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { address } });
  }

  /**
   * Finds the wallet assigned to a specific customer for a specific family.
   * Uses `IDX_wallets_customer_driver_family` (partial UNIQUE).
   * Returns `null` when no assignment exists for the combination.
   */
  public async findByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { customerId, driverFamily } });
  }

  /**
   * Returns all wallets across all families assigned to a customer.
   * Uses `IDX_wallets_customer_id` — B-tree on customer_id.
   * Ordered by `driverFamily ASC` for deterministic response ordering.
   */
  public async findAllByCustomer(customerId: string): Promise<WalletEntity[]> {
    return this.repo.find({
      where: { customerId },
      order: { driverFamily: 'ASC' },
    });
  }

  /**
   * Paginated wallet list filtered to a single driver family.
   * Uses `IDX_wallets_driver_family` for the primary filter.
   * Ordered by `created_at DESC` (newest first — consistent with admin UX).
   */
  public async findByDriverFamily(
    driverFamily: WalletFamily,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<WalletEntity>> {
    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where: { driverFamily },
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Paginated, multi-filter wallet list for the admin API.
   * All filter fields are optional and combined with AND semantics.
   * Ordered by `created_at DESC`.
   *
   * Index usage:
   *   - `driverFamily` alone → `IDX_wallets_driver_family`
   *   - `driverFamily + status` → `IDX_wallets_driver_family_status_created_at`
   *   - `customerId` alone → `IDX_wallets_customer_id`
   *   - `status` alone → TypeORM uses status column; planner may choose composite
   */
  public async findAll(
    query: WalletQueryDto,
  ): Promise<PaginatedResult<WalletEntity>> {
    const {
      page = 1,
      limit = 50,
      driverFamily,
      status,
      customerId,
      createdByJobId,
    } = query;

    const where: FindOptionsWhere<WalletEntity> = {};
    if (driverFamily !== undefined) where.driverFamily = driverFamily;
    if (status !== undefined) where.status = status;
    if (customerId !== undefined) where.customerId = customerId;
    if (createdByJobId !== undefined) where.createdByJobId = createdByJobId;

    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
    return buildPaginatedResult(data, total, page, limit);
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  /**
   * Checks whether a given address exists in the database including
   * soft-deleted rows. Address uniqueness is permanent — a decommissioned
   * wallet's address must never be reused.
   *
   * Uses `IDX_wallets_address` (UNIQUE) — no TypeORM soft-delete filter.
   * `withDeleted()` instructs TypeORM to omit the `deleted_at IS NULL` clause.
   */
  public async existsByAddress(address: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('w')
      .withDeleted()
      .where('w.address = :address', { address })
      .getCount();
    return count > 0;
  }

  /**
   * Checks whether a customer already has a wallet for the given family
   * (among active, non-deleted records).
   * Used by WalletService for idempotent assignment guard.
   * Uses `IDX_wallets_customer_driver_family` (partial UNIQUE, soft-delete aware).
   */
  public async existsByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { customerId, driverFamily } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Aggregate reads
  // ---------------------------------------------------------------------------

  /**
   * Returns the count of AVAILABLE wallets for a given family.
   * Critical for pool health monitoring (`WalletPoolService.checkThreshold`).
   *
   * Uses `IDX_wallets_driver_family_status_created_at` (leading columns
   * driver_family + status satisfy the WHERE clause without a full scan).
   */
  public async countAvailable(driverFamily: WalletFamily): Promise<number> {
    return this.repo.count({
      where: { driverFamily, status: WalletStatus.AVAILABLE },
    });
  }

  /**
   * Returns counts grouped by status for a given family.
   * All `WalletStatus` keys are always present in the result map (0 when absent).
   *
   * Uses a single GROUP BY query to avoid N round-trips.
   * Index: `IDX_wallets_driver_family` narrows to family rows first.
   */
  public async countByStatus(
    driverFamily: WalletFamily,
  ): Promise<WalletStatusCountMap> {
    const rows = await this.repo
      .createQueryBuilder('w')
      .select('w.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('w.driver_family = :driverFamily', { driverFamily })
      .andWhere('w.deleted_at IS NULL')
      .groupBy('w.status')
      .getRawMany<{ status: WalletStatus; count: string }>();

    const result = Object.values(WalletStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as WalletStatusCountMap,
    );
    for (const row of rows) {
      result[row.status] = parseInt(row.count, 10);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Persists a new WalletEntity.
   *
   * `repo.create()` builds the entity in memory; `repo.save()` runs the INSERT
   * and populates auto-generated fields (`id`, `createdAt`, `updatedAt`, `version`).
   *
   * Uniqueness guards (`address`, `created_by_job_id`, `public_key`) are enforced
   * at the database level — a constraint violation bubbles up as a TypeORM
   * `QueryFailedError` with Postgres error code `23505`.
   */
  public async save(data: Partial<WalletEntity>): Promise<WalletEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Atomically reserves the oldest AVAILABLE wallet for the given family.
   *
   * Executes in two SQL statements within a single raw transaction:
   *
   * ```sql
   * -- Statement 1: claim a row with skip-locked
   * SELECT id FROM wallets
   *   WHERE driver_family = $1
   *     AND status = 'AVAILABLE'
   *     AND deleted_at IS NULL
   *   ORDER BY created_at ASC
   *   LIMIT 1
   *   FOR UPDATE SKIP LOCKED;
   *
   * -- Statement 2: atomically transition to RESERVED
   * UPDATE wallets
   *   SET status = 'RESERVED',
   *       reservation_token = gen_random_uuid(),
   *       reserved_at = NOW(),
   *       version = version + 1
   *   WHERE id = $selectedId
   *     AND status = 'AVAILABLE'
   *   RETURNING id, reservation_token;
   * ```
   *
   * `FOR UPDATE SKIP LOCKED` prevents two concurrent callers from selecting
   * the same row. If no row is available, returns `null`.
   *
   * Must be called inside a caller-managed database transaction
   * (the `assignWallet` transaction in `WalletService`).
   *
   * Index: `IDX_wallets_driver_family_status_created_at` satisfies the
   * WHERE + ORDER BY in a single composite index scan.
   */
  public async reserveWallet(
    driverFamily: WalletFamily,
  ): Promise<WalletReservationResult | null> {
    const result = await this.dataSource.query<
      Array<{ id: string; reservation_token: string }>
    >(
      `
      UPDATE wallets
      SET
        status            = 'RESERVED',
        reservation_token = gen_random_uuid()::varchar,
        reserved_at       = NOW(),
        version           = version + 1
      WHERE id = (
        SELECT id
        FROM wallets
        WHERE driver_family = $1
          AND status        = 'AVAILABLE'
          AND deleted_at    IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      AND status    = 'AVAILABLE'
      AND deleted_at IS NULL
      RETURNING id, reservation_token
      `,
      [driverFamily],
    );

    if (result.length === 0) return null;

    return {
      walletId: result[0].id,
      reservationToken: result[0].reservation_token,
    };
  }

  /**
   * Completes Phase 2 of the 2-phase assignment protocol.
   *
   * ```sql
   * UPDATE wallets
   *   SET status            = 'ASSIGNED',
   *       customer_id       = $customerId,
   *       assigned_at       = NOW(),
   *       reservation_token = NULL,
   *       reserved_at       = NULL,
   *       version           = version + 1
   *   WHERE id                = $walletId
   *     AND reservation_token = $reservationToken
   *     AND status            = 'RESERVED'
   *     AND deleted_at        IS NULL;
   * ```
   *
   * Token verification is performed inside the WHERE clause — if the token
   * has expired or was already consumed, zero rows are updated and the
   * method throws `WalletReservationTokenMismatchError`.
   *
   * Returns the refreshed entity after assignment.
   *
   * Index: primary key (`id`) for the outer WHERE; token verified inline.
   */
  public async assignWallet(
    params: WalletAssignParams,
  ): Promise<WalletEntity> {
    const { walletId, reservationToken, customerId } = params;

    const result = await this.dataSource.query<Array<{ id: string }>>(
      `
      UPDATE wallets
      SET
        status            = 'ASSIGNED',
        customer_id       = $1,
        assigned_at       = NOW(),
        reservation_token = NULL,
        reserved_at       = NULL,
        version           = version + 1,
        updated_at        = NOW()
      WHERE id                = $2
        AND reservation_token = $3
        AND status            = 'RESERVED'
        AND deleted_at        IS NULL
      RETURNING id
      `,
      [customerId, walletId, reservationToken],
    );

    if (result.length === 0) {
      // Import is deferred to avoid circular deps at module load time.
      // The error class lives in the errors/ folder (Step 6.4).
      const { WalletReservationTokenMismatchError } = await import(
        '../errors/wallet-reservation-token-mismatch.error'
      );
      throw new WalletReservationTokenMismatchError(walletId);
    }

    return this.repo.findOneOrFail({ where: { id: walletId } });
  }

  /**
   * Releases all RESERVED wallets whose `reserved_at` is older than `ttlSeconds`.
   *
   * ```sql
   * UPDATE wallets
   *   SET status            = 'AVAILABLE',
   *       reservation_token = NULL,
   *       reserved_at       = NULL,
   *       released_at       = NOW(),
   *       version           = version + 1
   *   WHERE status     = 'RESERVED'
   *     AND reserved_at < NOW() - ($1 || ' seconds')::interval
   *     AND deleted_at  IS NULL;
   * ```
   *
   * Called by `WalletReservationCleanupTask` every 10 seconds.
   * Returns the number of rows released.
   *
   * Index: `IDX_wallets_status_reserved_at` (partial on status='RESERVED')
   * makes this query a narrow index scan even at high wallet volume.
   */
  public async releaseExpiredReservations(
    ttlSeconds: number,
  ): Promise<number> {
    const result = await this.dataSource.query<Array<{ id: string }>>(
      `
      UPDATE wallets
      SET
        status            = 'AVAILABLE',
        reservation_token = NULL,
        reserved_at       = NULL,
        released_at       = NOW(),
        version           = version + 1,
        updated_at        = NOW()
      WHERE status      = 'RESERVED'
        AND reserved_at < NOW() - ($1 || ' seconds')::interval
        AND deleted_at  IS NULL
      RETURNING id
      `,
      [ttlSeconds.toString()],
    );
    return result.length;
  }

  /**
   * Transitions a wallet to LOCKED status.
   *
   * Snapshots `status` into `previous_status` so `unlockWallet()` can
   * restore the correct prior state.
   *
   * WHERE guard: rejects terminal states (COMPROMISED, ARCHIVED).
   * Returns the updated entity.
   *
   * Index: primary key scan on `id`.
   */
  public async lockWallet(
    id: string,
    reason: string,
  ): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        previous_status = status,
        status          = 'LOCKED',
        locked_at       = NOW(),
        lock_reason     = $1,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $2
        AND status     NOT IN ('COMPROMISED', 'ARCHIVED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  /**
   * Restores a LOCKED wallet to its `previous_status`.
   *
   * Clears `previous_status`, `locked_at`, and `lock_reason` atomically.
   * WHERE guard: only applies to currently LOCKED wallets.
   * Returns the updated entity.
   *
   * Index: primary key scan on `id`.
   */
  public async unlockWallet(id: string): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status          = previous_status,
        previous_status = NULL,
        locked_at       = NULL,
        lock_reason     = NULL,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $1
        AND status     = 'LOCKED'
        AND deleted_at IS NULL
      `,
      [id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  /**
   * Permanently decommissions a wallet by transitioning to COMPROMISED.
   *
   * Terminal — no further transition is permitted from COMPROMISED.
   * WHERE guard: rejects already-terminal states (COMPROMISED, ARCHIVED).
   * Returns the updated entity.
   *
   * Index: primary key scan on `id`.
   */
  public async compromiseWallet(
    id: string,
    reason: string,
  ): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status          = 'COMPROMISED',
        compromised_at  = NOW(),
        lock_reason     = $1,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $2
        AND status     NOT IN ('COMPROMISED', 'ARCHIVED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  /**
   * Retires a wallet by transitioning to ARCHIVED.
   *
   * Terminal — no further transition is permitted from ARCHIVED.
   * WHERE guard: only AVAILABLE or LOCKED wallets may be archived.
   * (ASSIGNED wallets must be compromised, not archived.)
   * Returns the updated entity.
   *
   * Index: primary key scan on `id`.
   */
  public async archiveWallet(
    id: string,
    reason: string,
  ): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status      = 'ARCHIVED',
        archived_at = NOW(),
        lock_reason = $1,
        version     = version + 1,
        updated_at  = NOW()
      WHERE id         = $2
        AND status     IN ('AVAILABLE', 'LOCKED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  /**
   * Soft-deletes a wallet row.
   *
   * Hard deletion is permanently forbidden (ARCHITECTURE.md §18).
   * Sets `deleted_at = NOW()` via TypeORM `softDelete()`.
   * The row is excluded from all subsequent queries automatically.
   */
  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
