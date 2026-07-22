import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, LessThan, Not, Repository } from 'typeorm';
import { SignerJob } from '../entities/signer-job.entity';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobType } from '../enums/signer-job-type.enum';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type {
  ISignerJobRepository,
  SignerJobQuery,
  SignerJobStats,
} from './signer-job.repository.interface';

/**
 * Pure persistence layer for the `signer_jobs` table.
 *
 * Responsibilities
 * ----------------
 * - Wrap every TypeORM operation behind a typed method.
 * - Translate primitives / query objects into TypeORM `FindOptions`.
 * - Apply pagination and filtering at the query level.
 *
 * Rules (enforced by architecture review — Phase 3.5 Revision 3)
 * --------------------------------------------------------------
 * - Must never call another repository.
 * - Must never call a service.
 * - Must never contain business rules or conditional logic beyond
 *   translating caller arguments to WHERE clauses.
 * - Must never throw domain exceptions (returns `null` on miss).
 * - Must never expose the raw TypeORM `Repository<SignerJob>` to callers.
 * - No event publishing.
 * - No cryptographic operations.
 * - No validation of payload contents.
 * - No blockchain logic.
 */
@Injectable()
export class SignerJobRepository implements ISignerJobRepository {
  public constructor(
    @InjectRepository(SignerJob)
    private readonly repo: Repository<SignerJob>,
  ) {}

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /**
   * Finds a job by its UUID primary key.
   *
   * Returns `null` when the UUID does not exist or the record is soft-deleted.
   * TypeORM automatically appends `WHERE deleted_at IS NULL`.
   */
  public async findById(id: string): Promise<SignerJob | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Finds a job by its `requestId`.
   *
   * `requestId` has a unique index so at most one row is returned.
   * Returns `null` on miss or soft-delete.
   */
  public async findByRequestId(requestId: string): Promise<SignerJob | null> {
    return this.repo.findOne({ where: { requestId } });
  }

  /**
   * Returns all jobs (non-deleted) linked to a given business entity.
   *
   * Used by services and the admin API to trace a wallet, sweep, or
   * withdrawal through the complete signing lifecycle.
   * Ordered by `created_at DESC` (most recent first).
   */
  public async findByReference(
    referenceId: string,
    referenceType: string,
  ): Promise<SignerJob[]> {
    return this.repo.find({
      where: { referenceId, referenceType },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Returns PENDING jobs available for the Offline Signer to claim.
   *
   * Ordered by `created_at ASC` (FIFO) so the oldest waiting job is
   * always served first.
   *
   * @param networkId - Optional UUID filter. When provided, only jobs
   *                    for that network are returned.
   * @param limit     - Maximum number of rows (default: 10, capped at 50).
   */
  public async findAvailable(
    networkId?: string,
    limit: number = 10,
  ): Promise<SignerJob[]> {
    const safeLimit = Math.min(limit, 50);
    const where: FindOptionsWhere<SignerJob> = { status: SignerJobStatus.PENDING };
    if (networkId !== undefined) {
      where.networkId = networkId;
    }
    return this.repo.find({
      where,
      order: { createdAt: 'ASC' },
      take: safeLimit,
    });
  }

  /**
   * Returns a paginated, optionally filtered list of jobs for the admin API.
   *
   * All filter fields are optional and combined with AND logic.
   * Results are ordered by `created_at DESC` (newest first).
   */
  public async findAll(query: SignerJobQuery): Promise<PaginatedResult<SignerJob>> {
    const { page = 1, limit = 20, status, jobType, networkId, referenceType } = query;

    const where: FindOptionsWhere<SignerJob> = {};
    if (status !== undefined) where.status = status;
    if (jobType !== undefined) where.jobType = jobType;
    if (networkId !== undefined) where.networkId = networkId;
    if (referenceType !== undefined) where.referenceType = referenceType;

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
   * Returns `true` if a non-deleted job with the given `requestId` exists.
   *
   * Used by `SignerJobService` before persisting a new job to guard against
   * duplicate payload construction.
   */
  public async existsByRequestId(requestId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { requestId } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Aggregate reads
  // ---------------------------------------------------------------------------

  /**
   * Returns status and type aggregate counts for monitoring dashboards.
   *
   * Uses three raw count queries to avoid pulling full rows into memory.
   * All status and type keys are always present (0 when no matching rows).
   */
  public async getStats(): Promise<SignerJobStats> {
    const now = new Date();

    const [statusRows, typeRows, staleClaimed] = await Promise.all([
      this.repo
        .createQueryBuilder('j')
        .select('j.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('j.deleted_at IS NULL')
        .groupBy('j.status')
        .getRawMany<{ status: SignerJobStatus; count: string }>(),

      this.repo
        .createQueryBuilder('j')
        .select('j.job_type', 'jobType')
        .addSelect('COUNT(*)', 'count')
        .where('j.deleted_at IS NULL')
        .groupBy('j.job_type')
        .getRawMany<{ jobType: SignerJobType; count: string }>(),

      this.repo.count({
        where: {
          status: SignerJobStatus.CLAIMED,
          expiresAt: LessThan(now),
          deletedAt: IsNull(),
        },
      }),
    ]);

    const byStatus = Object.values(SignerJobStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<SignerJobStatus, number>,
    );
    for (const row of statusRows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const byType = Object.values(SignerJobType).reduce(
      (acc, t) => ({ ...acc, [t]: 0 }),
      {} as Record<SignerJobType, number>,
    );
    for (const row of typeRows) {
      byType[row.jobType] = parseInt(row.count, 10);
    }

    return { byStatus, byType, staleClaimed };
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Creates and persists a new `SignerJob` entity.
   *
   * `repo.create()` builds the entity in memory; `repo.save()` persists it
   * and populates auto-generated fields (`id`, `createdAt`, `updatedAt`, `version`).
   *
   * Returns the fully populated saved entity.
   */
  public async create(data: Partial<SignerJob>): Promise<SignerJob> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Merges `changes` into an existing entity and persists the result.
   *
   * TypeORM `merge()` performs a shallow merge in memory; `save()` writes
   * only changed columns and increments the `@VersionColumn` counter
   * (optimistic locking — prevents concurrent cron + submit races).
   *
   * The caller is responsible for fetching the entity before calling update.
   * The repository never fetches inside a mutation.
   *
   * Returns the updated entity with refreshed `updatedAt` and `version`.
   */
  public async update(
    job: SignerJob,
    changes: Partial<SignerJob>,
  ): Promise<SignerJob> {
    this.repo.merge(job, changes);
    return this.repo.save(job);
  }

  /**
   * Soft-deletes a job by setting `deleted_at` to the current timestamp.
   *
   * Hard deletion is permanently forbidden (ADR-JM-006).
   * In normal operation, signer jobs transition to terminal states and
   * are retained for audit. This method exists as a safety mechanism only.
   */
  public async softDelete(job: SignerJob): Promise<void> {
    await this.repo.softRemove(job);
  }
}
