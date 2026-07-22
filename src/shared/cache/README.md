# shared/cache

Key/value cache abstraction.

## Files
- `cache.interface.ts` — `ICache` contract (get/set/del/reset/wrap)
- `cache.service.ts` — `NullCacheService` — no-op stub for Phase 1
- `cache.module.ts` — `CacheModule` — global module, registers `INJECTION_TOKENS.CACHE`

## Key convention
`namespace:entity:identifier` — use `buildCacheKey()` from `@common/constants`.

## Replacing the implementation
Bind a Redis-backed class to `INJECTION_TOKENS.CACHE` in `CacheModule`.
No consumer code changes required.

## Rules
- Inject via `INJECTION_TOKENS.CACHE` + `ICache` type
- TTL values come from `TTL` constants in `@common/constants/ttl.constants`
