import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

/**
 * Factory that produces the application-wide `ValidationPipe`.
 *
 * Configuration decisions:
 * - `whitelist: true` — strips properties not declared in the DTO, preventing
 *   mass-assignment vulnerabilities without explicit allowlisting.
 * - `forbidNonWhitelisted: true` — rejects requests containing unknown fields
 *   rather than silently stripping them, making bad inputs explicit.
 * - `transform: true` — auto-converts plain JSON objects into DTO class
 *   instances and coerces primitive types (e.g. query `'42'` → `number 42`).
 * - `transformOptions.enableImplicitConversion: false` — relies on explicit
 *   `@Type()` decorators from `class-transformer` for type coercion; implicit
 *   conversion can cause subtle bugs with strict TypeScript.
 */
export function createGlobalValidationPipe(options?: ValidationPipeOptions): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    ...options,
  });
}
