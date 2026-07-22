import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for all application-level HTTP exceptions.
 *
 * Extends NestJS `HttpException` so it is handled automatically by
 * `GlobalHttpExceptionFilter`. Every concrete exception subclass must
 * supply a stable machine-readable `code` that API consumers can key
 * on without parsing human-readable messages.
 */
export class AppException extends HttpException {
  /** Stable machine-readable error code. Example: 'RESOURCE_NOT_FOUND' */
  public readonly code: string;

  public constructor(
    message: string,
    status: HttpStatus,
    code: string,
  ) {
    super(message, status);
    this.code = code;
  }
}
