# common/pipes

Reusable NestJS transformation and validation pipes with no domain awareness.

## Files
- `parse-positive-int.pipe.ts` — rejects non-positive integers with a clear error
- `trim-strings.pipe.ts` — recursively trims string fields on incoming request bodies

## Rules
- No pipes that validate domain rules (e.g. wallet address must exist in DB)
- No service-injecting pipes
- No module-specific business logic
