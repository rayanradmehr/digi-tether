import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

/**
 * Thrown when input data is structurally valid but semantically rejected.
 * Maps to HTTP 400.
 *
 * For validation-pipe failures (structural invalidity) NestJS emits its own
 * `BadRequestException` — this class is for explicit service-layer rejections.
 */
export class BadRequestException extends AppException {
  public constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
  }
}
