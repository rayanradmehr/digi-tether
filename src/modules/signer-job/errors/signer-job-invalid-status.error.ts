import { HttpStatus } from '@nestjs/common';
import { AppException } from '@core/exceptions/app.exception';
import type { SignerJobStatus } from '../enums/signer-job-status.enum';

/**
 * Thrown when a requested lifecycle transition is not permitted from
 * the current job status.
 *
 * Provides the caller with all three contextual values (job ID, current
 * status, attempted operation) so the API layer can surface a precise
 * error message without any additional lookups.
 *
 * Maps to HTTP 422 Unprocessable Entity — the request is well-formed
 * but cannot be executed in the current state.
 */
export class SignerJobInvalidStatusError extends AppException {
  public constructor(
    jobId: string,
    currentStatus: SignerJobStatus,
    attemptedOperation: string,
  ) {
    super(
      `SignerJob '${jobId}' cannot perform '${attemptedOperation}' from status '${currentStatus}'`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'SIGNER_JOB_INVALID_STATUS',
    );
  }
}
