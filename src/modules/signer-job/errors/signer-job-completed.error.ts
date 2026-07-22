import { HttpStatus } from '@nestjs/common';
import { AppException } from '@core/exceptions/app.exception';

/**
 * Thrown when a mutation is attempted on a SignerJob that has already
 * reached the COMPLETED terminal state.
 *
 * COMPLETED is an immutable terminal state. No field may change after
 * completion (Architecture Rule — Phase 3.5 Revision 3).
 *
 * Maps to HTTP 409 Conflict.
 */
export class SignerJobCompletedError extends AppException {
  public constructor(jobId: string) {
    super(
      `SignerJob '${jobId}' is already completed and cannot be modified`,
      HttpStatus.CONFLICT,
      'SIGNER_JOB_ALREADY_COMPLETED',
    );
  }
}
