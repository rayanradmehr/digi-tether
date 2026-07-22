/**
 * Business-origin classifier for a SignerJob.
 *
 * This enum represents the business operation that triggered the signing
 * request. It is used INTERNALLY ONLY for audit, tracing, and monitoring.
 *
 * THE OFFLINE SIGNER NEVER RECEIVES THIS VALUE.
 *
 * The Signer receives only an opaque `signingPayload` bytes string inside
 * a `SignerPayload` contract. It cannot determine — and must not determine —
 * which job type corresponds to the payload it is signing.
 *
 * All three business operations are translated into a generic cryptographic
 * signing request by `SigningPayloadBuilder` before the payload is stored.
 *
 * IMPORTANT
 * - Stored as VARCHAR in `signer_jobs.job_type`.
 * - Immutable after row creation.
 * - Adding a new type requires a new enum value here, a new union member in
 *   `CreateJobParams`, and a ratified ADR (ADR-JM-004).
 */
export enum SignerJobType {
  /**
   * A wallet address derivation request.
   * Originates from WalletModule when a new HD wallet address must be derived.
   */
  CREATE_WALLET = 'CREATE_WALLET',

  /**
   * A funds collection request.
   * Originates from SweepModule to move funds from a deposit wallet
   * to the platform hot wallet.
   */
  SWEEP = 'SWEEP',

  /**
   * A withdrawal request.
   * Originates from WithdrawalModule to send funds from the hot wallet
   * to a user-specified external address.
   */
  WITHDRAW = 'WITHDRAW',
}
