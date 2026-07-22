import { ApiProperty } from '@nestjs/swagger';
import { SignerJobStatus } from '../enums/signer-job-status.enum';

/**
 * Response DTO for `POST /signer/jobs/:requestId/result`.
 *
 * Returned after a successful CLAIMED → COMPLETED transition.
 *
 * ## Field exclusion policy (enforced by explicit mapping — no spread)
 * - No `signature` — cryptographic material is never echoed in responses.
 * - No `signingPayload` — opaque payload is never re-served after completion.
 * - No `payloadDigest` — sensitive digest is not included.
 * - No `integritySignature` — sensitive HMAC is not included.
 * - No `claimToken` — nonce is invalidated on completion and never re-served.
 * - No `walletId`, `networkId`, `referenceId` — internal business data.
 * - No `publicKey` — cryptographic material.
 *
 * The Signer uses this response to confirm the backend accepted its result
 * and to record the `processingDuration` for its own telemetry.
 */
export class SubmitResultResponse {
  /**
   * UUID of the signing request — echoed for Signer-side correlation.
   */
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description: 'UUID of the signing request. Echoed for Signer-side correlation.',
  })
  public requestId!: string;

  /**
   * Terminal status of the job after this submission.
   * Will always be `COMPLETED` on a 200 response.
   */
  @ApiProperty({
    enum: SignerJobStatus,
    example: SignerJobStatus.COMPLETED,
    description: 'Terminal job status. Always COMPLETED on a 200 response.',
  })
  public status!: SignerJobStatus;

  /**
   * ISO 8601 UTC timestamp when the job was marked COMPLETED by the backend.
   * This is the backend's wall-clock time, not the Signer's `completedAt`.
   */
  @ApiProperty({
    example: '2026-07-22T19:00:05.123Z',
    description:
      'ISO 8601 UTC timestamp set by the backend when the job was marked COMPLETED.',
  })
  public completedAt!: string;

  /**
   * Milliseconds elapsed between `claimedAt` and the backend\'s
   * `completedAt`. Computed by the backend from stored timestamps.
   * Useful for Signer-side telemetry and SLA monitoring.
   * Null when `claimedAt` is not available (should not occur in practice).
   */
  @ApiProperty({
    example: 312,
    nullable: true,
    description:
      'Processing duration in milliseconds (claimedAt → completedAt). '
      + 'Computed by the backend. Null if claimedAt is unavailable.',
  })
  public processingDuration!: number | null;
}
