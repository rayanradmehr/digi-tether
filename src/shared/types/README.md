# shared/types

Shared TypeScript types and interfaces scoped to the infrastructure layer.

## Files
- `nullable.type.ts` — `Nullable<T>` = `T | null`
- `queue-message.type.ts` — `QueueMessage<T>` — typed message envelope
- `log-level.type.ts` — `LogLevel` union type
- `cache-options.type.ts` — `CacheOptions` for set/wrap TTL

## Rules
- These types are infrastructure-layer concerns only
- No business domain types here (those live in their module)
- No NestJS decorator imports
