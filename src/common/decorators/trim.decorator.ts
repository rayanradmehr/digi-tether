import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';

/**
 * Property decorator that trims leading and trailing whitespace from string
 * DTO fields during `class-transformer` transformation.
 *
 * Usage: `@Trim() @IsString() name: string;`
 *
 * Only operates on string values; non-string values are passed through
 * unchanged so the decorator is safe to compose with `@IsOptional()`.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  });
}
