# core/pipes

Global NestJS pipe factories registered in `main.ts` or `CoreModule`.

## Files
- `global-validation.pipe.ts` — `createGlobalValidationPipe()` factory
  Produces a `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`,
  `transform` and strict `class-transformer` options.

## Rules
- These are wiring factories only — no business validation logic here
- Reusable per-route pipes live in `src/common/pipes/`
