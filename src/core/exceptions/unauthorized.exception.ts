import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

/**
 * Thrown when a request lacks valid authentication credentials.
 * Maps to HTTP 401.
 */
export class UnauthorizedException extends AppException {
  public constructor(message = 'Authentication required') {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}
