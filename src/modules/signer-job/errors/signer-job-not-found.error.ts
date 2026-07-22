import { HttpStatus } from '@nestjs/common';
import { AppException } from '@core/exceptions/app.exception';

/**
 * Thrown when a `SignerJob` row cannot be located by the given identifier.
 *
 * Maps to HTTP 404 when surfaced through the API.
 * Callers within the service layer catch this to distinguish a genuine
 * missing-row condition from a programming error.
 */
export class SignerJobNotFoundError extends AppException {
  public constructor(identifier: string) {
    super(
      `SignerJob '${identifier}' not found`,
      HttpStatus.NOT_FOUND,
      'SIGNER_JOB_NOT_FOUND',
    );
  }
}
