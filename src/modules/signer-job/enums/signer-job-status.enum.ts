/**
 * Lifecycle states of a single SignerJob row.
 *
 * State machine (see ADR-JM-005):
 *
 *   PENDING ──► CLAIMED ──► COMPLETED  (terminal)
 *   PENDING ──► CANCELLED              (terminal)
 *   CLAIMED ──► FAILED                 (terminal — Signer error or TTL expiry)
 *   CLAIMED ──► EXPIRED                (terminal — cron-detected TTL breach)
 *
 * Terminal states: COMPLETED, FAILED, EXPIRED, CANCELLED.
 * A row in a terminal state is immutable — no further column changes are
 * permitted except by a ratified ADR.
 *
 * IMPORTANT
 * - These values are stored as VARCHAR in `signer_jobs.status`.
 * - Never rename or remove a value once persisted in production.
 * - A migration + ADR is required to add a new state.
 */
export enum SignerJobStatus {
  /**
   * Job has been created and persisted.
   * The SignerPayload is sealed and ready for the Offline Signer to claim.
   * No Signer instance has acknowledged this job yet.
   */
  PENDING = 'PENDING',

  /**
   * A Signer instance has claimed this job.
   * The claimToken has been issued and the Signer is processing offline.
   * The job will transition to COMPLETED, FAILED, or EXPIRED from here.
   */
  CLAIMED = 'CLAIMED',

  /**
   * The Signer submitted a valid SignerResult and all backend validations
   * passed. The result column is populated and immutable.
   * Terminal state.
   */
  COMPLETED = 'COMPLETED',

  /**
   * The Signer submitted an explicit error result, or the backend
   * validation of the submitted result failed.
   * The errorMessage column explains the reason.
   * Terminal state.
   */
  FAILED = 'FAILED',

  /**
   * The job was CLAIMED but expiresAt passed without a submit.
   * Detected and set by the scheduled expiry task (ADR-JM-005).
   * Distinct from FAILED to enable separate monitoring and retry logic.
   * Terminal state.
   */
  EXPIRED = 'EXPIRED',

  /**
   * The originating module (Wallet, Sweep, Withdrawal) explicitly cancelled
   * this job before it was claimed.
   * Only PENDING jobs may be cancelled.
   * Terminal state.
   */
  CANCELLED = 'CANCELLED',
}
