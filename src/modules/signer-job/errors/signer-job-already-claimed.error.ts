import { HttpStatus } from '@nestjs/common';
import { AppException } from '@core/exceptions/app.exception';

/**
 * Thrown when a Signer instance attempts to claim a job that has already
 * been claimed by another instance.
 *
 * Maps to HTTP 409 Conflict — the request is valid but cannot be fulfilled
 * because the resource state has changed since the caller last queried it.
 */
export class SignerJobAlreadyClaimedError extends AppException {
  public constructor(jobId: string, claimedBy: string) {
    super(
      `SignerJob '${jobId}' is already claimed by '${claimedBy}'`,
      HttpStatus.CONFLICT,
      'SIGNER_JOB_ALREADY_CLAIMED',
    );
  }
}
