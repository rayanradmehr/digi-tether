import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

/**
 * Thrown when an authenticated user lacks permission for the operation.
 * Maps to HTTP 403.
 */
export class ForbiddenException extends AppException {
  public constructor(message = 'Access denied') {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}
