import { HttpStatus } from '@nestjs/common';
import { AppException } from '@core/exceptions/app.exception';

/**
 * Thrown when an operation is attempted on a SignerJob whose `expiresAt`
 * has already passed.
 *
 * Valid contexts:
 * - Attempting to claim a job that is past its TTL.
 * - Attempting to submit a result for an already-expired job.
 *
 * Maps to HTTP 410 Gone — the resource existed but its validity window
 * has permanently closed.
 */
export class SignerJobExpiredError extends AppException {
  public constructor(jobId: string, expiresAt: Date) {
    super(
      `SignerJob '${jobId}' expired at ${expiresAt.toISOString()}`,
      HttpStatus.GONE,
      'SIGNER_JOB_EXPIRED',
    );
  }
}
