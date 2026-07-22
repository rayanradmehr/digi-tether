import { Inject, Injectable } from '@nestjs/common';
import { SignerJobRepository } from '../repositories/signer-job.repository';
import { SignerJob } from '../entities/signer-job.entity';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobNotFoundError } from '../errors/signer-job-not-found.error';
import { SignerJobExpiredError } from '../errors/signer-job-expired.error';
import { SignerJobAlreadyClaimedError } from '../errors/signer-job-already-claimed.error';
import { SignerJobInvalidStatusError } from '../errors/signer-job-invalid-status.error';
import { SignerJobCompletedError } from '../errors/signer-job-completed.error';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ILogger } from '@shared/logger/logger.interface';
import type {
  ISignerJobService,
  CreateJobParams,
  ClaimJobParams,
  CompleteJobParams,
  MarkFailedParams,
} from './signer-job.service.interface';

/**
 * Maximum number of times a job may be re-queued after an expiry event
 * before it is permanently transitioned to EXPIRED.
 *
 * Extension Point §9.3 — configurable via environment in a future step.
 */
const MAX_RETRY_COUNT = 3;

/**
 * Complete lifecycle owner for the `signer_jobs` table.
 *
 * This service is the ONLY component authorised to mutate `SignerJob` rows.
 * All state transitions are guarded by explicit pre-condition checks that
 * throw typed domain errors on invalid paths.
 *
 * Responsibilities (Architecture — Phase 3.5 Revision 3)
 * -------------------------------------------------------
 * - Create immutable jobs from sealed SignerPayload objects.
 * - Enforce the state machine: PENDING → CLAIMED → COMPLETED / FAILED / EXPIRED.
 * - Enforce field immutability after job creation.
 * - Log every state transition as a structured entry.
 *
 * Non-responsibilities (strict — enforced by architecture review)
 * ---------------------------------------------------------------
 * - Never builds, parses, or modifies a SignerPayload.
 * - Never calls a BlockchainDriver.
 * - Never performs cryptographic operations.
 * - Never communicates with the Offline Signer.
 * - Never publishes events or messages (that is Step 4).
 * - Never calls RPC nodes.
 */
@Injectable()
export class SignerJobService implements ISignerJobService {
  public constructor(
    private readonly signerJobRepository: SignerJobRepository,
    @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns the SignerJob entity for the given UUID primary key.
   *
   * @throws {SignerJobNotFoundError} When no row exists for `id`.
   */
  public async findById(id: string): Promise<SignerJob> {
    return this.requireJob(id);
  }

  /**
   * Returns the SignerJob entity for the given `requestId`.
   *
   * `requestId` has a unique index so at most one row can exist.
   *
   * @throws {SignerJobNotFoundError} When no row matches `requestId`.
   */
  public async findByRequestId(requestId: string): Promise<SignerJob> {
    const job = await this.signerJobRepository.findByRequestId(requestId);
    if (job === null) {
      throw new SignerJobNotFoundError(requestId);
    }
    return job;
  }

  /**
   * Returns `true` when a non-deleted job with the given UUID exists.
   * This method never throws — it is safe to call without a try/catch.
   */
  public async exists(jobId: string): Promise<boolean> {
    return this.signerJobRepository.existsByRequestId(jobId);
  }

  /**
   * Returns the count of jobs currently in PENDING status.
   */
  public async countPending(): Promise<number> {
    const stats = await this.signerJobRepository.getStats();
    return stats.byStatus[SignerJobStatus.PENDING];
  }

  /**
   * Returns the count of jobs currently in CLAIMED status.
   */
  public async countClaimed(): Promise<number> {
    const stats = await this.signerJobRepository.getStats();
    return stats.byStatus[SignerJobStatus.CLAIMED];
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Creates an immutable PENDING SignerJob from a sealed SignerPayload.
   *
   * The service receives a pre-built payload from the caller (assembled by
   * SigningPayloadBuilder). It extracts denormalised fields for indexed
   * columns and persists the complete sealed payload in the JSONB column.
   *
   * Post-conditions after this call:
   * - One `signer_jobs` row exists with status = PENDING.
   * - retryCount = 0.
   * - All immutable fields are set and will never change.
   * - expiresAt is denormalised from payload.expiresAt to the column.
   */
  public async createJob(params: CreateJobParams): Promise<SignerJob> {
    const { jobType, networkId, walletId, referenceId, referenceType, payload } = params;

    const job = await this.signerJobRepository.create({
      jobType,
      networkId,
      walletId,
      referenceId,
      referenceType,
      payload,
      requestId: payload.requestId,
      payloadVersion: payload.payloadVersion,
      protocolVersion: payload.protocolVersion,
      status: SignerJobStatus.PENDING,
      expiresAt: new Date(payload.expiresAt),
      retryCount: 0,
      claimedBy: null,
      claimedAt: null,
      claimToken: null,
      completedAt: null,
      result: null,
      errorMessage: null,
    });

    this.logger.log(
      `SignerJob created: id='${job.id}' requestId='${job.requestId}' jobType='${job.jobType}' walletId='${job.walletId}' networkId='${job.networkId}'`,
      SignerJobService.name,
    );

    return job;
  }

  /**
   * Transitions a PENDING job to CLAIMED.
   *
   * Pre-conditions (checked in order):
   * 1. Job must exist.
   * 2. expiresAt must not have passed.
   * 3. Status must be PENDING (not already CLAIMED or terminal).
   *
   * The `claimToken` provided by the caller was generated by the controller
   * layer (uuid()) before invoking this method. The service stores it;
   * it does not generate it — generation is outside service responsibility.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobExpiredError}        When the TTL has passed.
   * @throws {SignerJobAlreadyClaimedError} When already CLAIMED.
   * @throws {SignerJobInvalidStatusError}  When status is not PENDING.
   */
  public async claimJob(params: ClaimJobParams): Promise<SignerJob> {
    const { jobId, signerInstanceId, claimToken } = params;
    const job = await this.requireJob(jobId);

    this.assertNotExpired(job);

    if (job.status === SignerJobStatus.CLAIMED) {
      throw new SignerJobAlreadyClaimedError(jobId, job.claimedBy ?? 'unknown');
    }

    if (job.status !== SignerJobStatus.PENDING) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'claim');
    }

    const updated = await this.signerJobRepository.update(job, {
      status: SignerJobStatus.CLAIMED,
      claimedBy: signerInstanceId,
      claimedAt: new Date(),
      claimToken,
    });

    this.logger.log(
      `SignerJob claimed: id='${job.id}' signerInstanceId='${signerInstanceId}'`,
      SignerJobService.name,
    );

    return updated;
  }

  /**
   * Transitions a CLAIMED job to COMPLETED and writes the SignerResult.
   *
   * Pre-conditions:
   * 1. Job must exist.
   * 2. Status must be CLAIMED.
   * 3. Provided claimToken must match the stored claimToken.
   *
   * The `result` object has already been validated by the controller layer
   * (requestId match, algorithm match, format match, timestamp window).
   * The service only persists — it does not re-validate the result.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobCompletedError}     When already COMPLETED.
   * @throws {SignerJobInvalidStatusError} When status is not CLAIMED, or claimToken mismatch.
   */
  public async completeJob(params: CompleteJobParams): Promise<SignerJob> {
    const { jobId, claimToken, result } = params;
    const job = await this.requireJob(jobId);

    if (job.status === SignerJobStatus.COMPLETED) {
      throw new SignerJobCompletedError(jobId);
    }

    if (job.status !== SignerJobStatus.CLAIMED) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'complete');
    }

    if (job.claimToken !== claimToken) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'complete — claimToken mismatch');
    }

    const updated = await this.signerJobRepository.update(job, {
      status: SignerJobStatus.COMPLETED,
      result,
      completedAt: new Date(),
    });

    this.logger.log(
      `SignerJob completed: id='${job.id}' requestId='${job.requestId}'`,
      SignerJobService.name,
    );

    return updated;
  }

  /**
   * Transitions a PENDING or CLAIMED job to CANCELLED.
   *
   * Only jobs that have not yet reached a terminal state may be cancelled.
   * A completed job cannot be un-done.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobCompletedError}     When already COMPLETED.
   * @throws {SignerJobInvalidStatusError} When status is FAILED or EXPIRED.
   */
  public async cancelJob(jobId: string): Promise<SignerJob> {
    const job = await this.requireJob(jobId);

    if (job.status === SignerJobStatus.COMPLETED) {
      throw new SignerJobCompletedError(jobId);
    }

    const cancellableStatuses: SignerJobStatus[] = [
      SignerJobStatus.PENDING,
      SignerJobStatus.CLAIMED,
    ];

    if (!cancellableStatuses.includes(job.status)) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'cancel');
    }

    const updated = await this.signerJobRepository.update(job, {
      status: SignerJobStatus.CANCELLED,
      completedAt: new Date(),
    });

    this.logger.log(
      `SignerJob cancelled: id='${job.id}' previousStatus='${job.status}'`,
      SignerJobService.name,
    );

    return updated;
  }

  /**
   * Transitions a PENDING or CLAIMED job to EXPIRED.
   *
   * Called exclusively by the scheduled expiry cron task.
   * Verifies that `expiresAt` has genuinely passed before transitioning.
   * A job that is not yet expired cannot be force-expired through this method.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobCompletedError}     When already in a terminal state.
   * @throws {SignerJobInvalidStatusError} When the job is CANCELLED, FAILED, or not yet expired.
   */
  public async expireJob(jobId: string): Promise<SignerJob> {
    const job = await this.requireJob(jobId);

    if (
      job.status === SignerJobStatus.COMPLETED ||
      job.status === SignerJobStatus.FAILED ||
      job.status === SignerJobStatus.EXPIRED ||
      job.status === SignerJobStatus.CANCELLED
    ) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'expire');
    }

    this.assertNotExpired(job);

    // Verify TTL has actually passed — cannot expire a job that is still valid.
    const now = new Date();
    if (job.expiresAt > now) {
      throw new SignerJobInvalidStatusError(
        jobId,
        job.status,
        'expire — expiresAt has not yet passed',
      );
    }

    const updated = await this.signerJobRepository.update(job, {
      status: SignerJobStatus.EXPIRED,
      completedAt: new Date(),
    });

    this.logger.warn(
      `SignerJob expired: id='${job.id}' expiresAt='${job.expiresAt.toISOString()}' retryCount=${job.retryCount}`,
      SignerJobService.name,
    );

    return updated;
  }

  /**
   * Increments `retryCount` by 1 up to the configured maximum.
   *
   * The caller (expiry cron) decides what to do after incrementing:
   * re-queue the job (reset to PENDING) or let it stay EXPIRED.
   * This method only increments the counter — it does not change status.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobInvalidStatusError} When retryCount is already at MAX_RETRY_COUNT.
   */
  public async incrementRetry(jobId: string): Promise<SignerJob> {
    const job = await this.requireJob(jobId);

    if (job.retryCount >= MAX_RETRY_COUNT) {
      throw new SignerJobInvalidStatusError(
        jobId,
        job.status,
        `incrementRetry — retryCount already at maximum (${MAX_RETRY_COUNT})`,
      );
    }

    const updated = await this.signerJobRepository.update(job, {
      retryCount: job.retryCount + 1,
    });

    this.logger.log(
      `SignerJob retry incremented: id='${job.id}' retryCount=${updated.retryCount}/${MAX_RETRY_COUNT}`,
      SignerJobService.name,
    );

    return updated;
  }

  /**
   * Transitions a CLAIMED job to FAILED and records the failure reason.
   *
   * Called when the Signer submits an error result, or when backend
   * validation of a submitted result fails.
   *
   * @throws {SignerJobNotFoundError}      When the job does not exist.
   * @throws {SignerJobInvalidStatusError} When status is not CLAIMED.
   */
  public async markFailed(params: MarkFailedParams): Promise<SignerJob> {
    const { jobId, reason } = params;
    const job = await this.requireJob(jobId);

    if (job.status !== SignerJobStatus.CLAIMED) {
      throw new SignerJobInvalidStatusError(jobId, job.status, 'markFailed');
    }

    const updated = await this.signerJobRepository.update(job, {
      status: SignerJobStatus.FAILED,
      errorMessage: reason,
      completedAt: new Date(),
    });

    this.logger.error(
      `SignerJob failed: id='${job.id}' reason='${reason}'`,
      undefined,
      SignerJobService.name,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetches a SignerJob by UUID and throws `SignerJobNotFoundError` if absent.
   * Centralises the "require or throw" pattern used by every guarded method.
   */
  private async requireJob(id: string): Promise<SignerJob> {
    const job = await this.signerJobRepository.findById(id);
    if (job === null) {
      throw new SignerJobNotFoundError(id);
    }
    return job;
  }

  /**
   * Throws `SignerJobExpiredError` when `job.expiresAt` is in the past.
   * Used in claimJob to prevent the Signer from claiming an expired job.
   */
  private assertNotExpired(job: SignerJob): void {
    const now = new Date();
    if (job.expiresAt < now) {
      throw new SignerJobExpiredError(job.id, job.expiresAt);
    }
  }
}
