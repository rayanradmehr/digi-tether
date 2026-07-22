import type { SignAlgorithm } from '../enums/sign-algorithm.enum';
import type { SignatureFormat } from '../enums/signature-format.enum';

/**
 * Versioned result contract returned by the Offline Signer.
 *
 * Submitted via `POST /signer/jobs/:id/submit` and stored in the
 * `result` JSONB column of the `signer_jobs` row on COMPLETED.
 *
 * Backend validation sequence on receipt (ADR-JM-003, ADR-JM-009):
 * 1. `requestId` matches `payload.requestId`           → 422 if not.
 * 2. `signAlgorithm` matches `payload.signAlgorithm`   → 422 if not.
 * 3. `signatureFormat` matches `payload.signatureFormat`→ 422 if not.
 * 4. `signature` is valid hex of expected byte length   → 422 if not.
 * 5. `signedAt` is within [payload.createdAt, payload.expiresAt] → 422 if not.
 * 6. All pass → CLAIMED → COMPLETED, result column written, event emitted.
 *
 * Once written to the database, all fields are immutable.
 */
export interface SignerResult {
  // — Correlation —

  /**
   * Must exactly match `SignerPayload.requestId`.
   * The backend rejects any result where this does not match.
   * Prevents stale or replayed submissions from being accepted.
   */
  readonly requestId: string;

  // — Cryptographic Output —

  /**
   * Hex-encoded signature bytes, encoded in the format specified by
   * `signatureFormat`.
   *
   * Expected byte lengths by algorithm and format:
   * - ECDSA_SECP256K1 + RECOVERABLE: 65 bytes (r || s || v)
   * - ECDSA_SECP256K1 + DER: 70–72 bytes (variable)
   * - ECDSA_SECP256K1 + RAW: 64 bytes (r || s)
   * - ECDSA_SECP256K1 + RSV: 65 bytes
   * - ED25519 + RAW: 64 bytes
   * - SCHNORR + COMPACT: 64 bytes (BIP-340)
   *
   * The backend validates the hex encoding and byte length.
   */
  readonly signature: string;

  /**
   * Hex-encoded compressed public key corresponding to the `walletId`.
   * Used by the backend to verify the signature and derive / confirm
   * the wallet address without additional RPC calls.
   *
   * Expected formats:
   * - secp256k1 compressed: 33 bytes (02/03 prefix + 32-byte X coordinate)
   * - Ed25519: 32 bytes
   */
  readonly publicKey: string;

  // — Algorithm Record —

  /**
   * Must echo `SignerPayload.signAlgorithm`.
   * Backend rejects if this does not match the stored payload value.
   */
  readonly signAlgorithm: SignAlgorithm;

  /**
   * Must match `SignerPayload.signatureFormat`.
   * Backend rejects if this does not match the stored payload value.
   * Ensures the backend knows exactly how to parse `signature` bytes.
   */
  readonly signatureFormat: SignatureFormat;

  // — Signer Provenance —

  /**
   * Semantic version string of the Rust Signer binary that produced
   * this result (e.g. '1.0.0').
   * Enables audit of which Signer version signed each job.
   * Useful for incident investigation and rollout tracking.
   */
  readonly signerVersion: string;

  // — Timing —

  /**
   * ISO 8601 UTC timestamp of when the Signer performed the signing operation.
   * Must fall within [SignerPayload.createdAt, SignerPayload.expiresAt].
   * Backend rejects results signed outside this window.
   */
  readonly signedAt: string;

  /**
   * Wall-clock milliseconds the signing operation took.
   * Used for performance monitoring and anomaly detection.
   * A signing operation taking unexpectedly long may indicate key storage issues.
   */
  readonly executionTimeMs: number;
}
