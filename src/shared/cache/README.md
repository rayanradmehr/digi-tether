# shared/cache

Redis-backed cache integration via `@nestjs/cache-manager`.

## Files
- `cache.service.ts` — `CacheService` with typed get/set/del/wrap interface
- `cache.module.ts` — `CacheModule` (registered globally)

## Key Convention
`namespace:entity:identifier` — e.g. `user:profile:42`

## Rules
- No business-specific cache keys as string literals (those come from `common/constants`)
- No entity serialization logic here
- No module-specific cache invalidation strategies
