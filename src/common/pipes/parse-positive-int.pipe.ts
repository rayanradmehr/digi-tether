import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates that a route or query parameter is a positive integer (≥ 1).
 *
 * Provides a clearer error message than the built-in `ParseIntPipe` and
 * explicitly rejects zero and negative values.
 *
 * Usage: `@Param('id', ParsePositiveIntPipe) id: number`
 */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  public transform(value: string, _metadata: ArgumentMetadata): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(
        `Validation failed: '${value}' must be a positive integer (>= 1)`,
      );
    }
    return parsed;
  }
}
