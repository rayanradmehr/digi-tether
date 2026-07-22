import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

/**
 * Thrown when an operation violates a uniqueness or state constraint.
 * Maps to HTTP 409.
 */
export class ConflictException extends AppException {
  public constructor(message: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT');
  }
}
