import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

/**
 * Thrown when a requested resource does not exist.
 * Maps to HTTP 404.
 */
export class NotFoundException extends AppException {
  public constructor(resource: string, identifier?: string | number) {
    const detail = identifier !== undefined ? ` '${String(identifier)}'` : '';
    super(`${resource}${detail} not found`, HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND');
  }
}
