import type { SignerJobStatus } from '../enums/signer-job-status.enum';
import type { SignerJobType } from '../enums/signer-job-type.enum';
import type { SignerJob } from '../entities/signer-job.entity';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';

/**
 * Query parameters for `findAll()` — all fields optional.
 * Filters are combined with AND logic at the query level.
 */
export interface SignerJobQuery {
  readonly status?: SignerJobStatus;
  readonly jobType?: SignerJobType;
  readonly networkId?: string;
  readonly referenceType?: string;
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Pure data-access contract for the `signer_jobs` table.
 *
 * Rules enforced by architecture review:
 * - Must never call another repository.
 * - Must never call a service.
 * - Must never contain business rules or conditional logic beyond
 *   translating caller arguments to WHERE clauses.
 * - Must never throw domain exceptions (returns `null` on miss).
 * - Must never expose the raw TypeORM `Repository<SignerJob>` to callers.
 * - No event publishing.
 * - No cryptographic operations.
 * - No validation.
 */
export interface ISignerJobRepository {
  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /** Finds a job by its UUID primary key. Returns `null` on miss or soft-delete. */
  findById(id: string): Promise<SignerJob | null>;

  /** Finds a job by its `requestId`. Returns `null` on miss. Unique index guarantees at most one result. */
  findByRequestId(requestId: string): Promise<SignerJob | null>;

  /**
   * Finds all jobs associated with a given upstream business entity.
   * Used by services and the admin API to trace a wallet / sweep / withdrawal
   * through the job lifecycle.
   */
  findByReference(referenceId: string, referenceType: string): Promise<SignerJob[]>;

  /**
   * Returns PENDING jobs ordered by `created_at ASC` (FIFO).
   * The Signer polling endpoint is backed by this query.
   *
   * @param networkId - Optional UUID filter. When provided only jobs for
   *                    that network are returned.
   * @param limit     - Maximum number of rows to return (default: 10, max: 50).
   */
  findAvailable(networkId?: string, limit?: number): Promise<SignerJob[]>;

  /** Returns a paginated, filtered list of jobs for the admin API. */
  findAll(query: SignerJobQuery): Promise<PaginatedResult<SignerJob>>;

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  /** Returns `true` if a non-deleted job with the given `requestId` exists. */
  existsByRequestId(requestId: string): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Aggregate reads
  // ---------------------------------------------------------------------------

  /**
   * Returns counts grouped by `status` and `jobType`.
   * Used by the admin stats endpoint and monitoring dashboards.
   * Also returns the count of CLAIMED jobs past `expiresAt` (staleClaimed).
   */
  getStats(): Promise<SignerJobStats>;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Creates and persists a new `SignerJob` row.
   * The caller provides a partial entity; TypeORM populates auto-generated
   * fields (`id`, `createdAt`, `updatedAt`, `version`).
   */
  create(data: Partial<SignerJob>): Promise<SignerJob>;

  /**
   * Merges `changes` into an existing entity and persists the result.
   * The caller is responsible for fetching the entity before calling update.
   * TypeORM increments `version` (optimistic lock) on every save.
   */
  update(job: SignerJob, changes: Partial<SignerJob>): Promise<SignerJob>;

  /**
   * Soft-deletes a job (safety mechanism only).
   * In normal operation signer jobs are NEVER deleted — terminal states
   * are sufficient for audit and cleanup (ADR-JM-006).
   */
  softDelete(job: SignerJob): Promise<void>;
}

/**
 * Shape returned by `ISignerJobRepository.getStats()`.
 */
export interface SignerJobStats {
  /** Count of jobs in each status. All statuses are always present (0 if none). */
  readonly byStatus: Record<SignerJobStatus, number>;
  /** Count of jobs of each type. All types are always present (0 if none). */
  readonly byType: Record<SignerJobType, number>;
  /** Count of CLAIMED jobs whose `expiresAt` is in the past. */
  readonly staleClaimed: number;
}
