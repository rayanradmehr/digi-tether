# common/utils

Pure functions with no side effects and no dependencies on NestJS or the database.

## Files
- `sleep.util.ts` — async delay
- `chunk.util.ts` — array batch splitter
- `format-amount.util.ts` — token amount formatter
- `to-snake-case.util.ts` — string transformer
- `correlation-id.util.ts` — UUID v4 generator for request tracing

## Rules
- No NestJS imports
- No database calls
- No HTTP calls
- No business logic
