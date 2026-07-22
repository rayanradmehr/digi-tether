# src/shared

NestJS-aware infrastructure layer. All providers here are registered globally.

## Sub-folders
- `logger/` — structured application logger (AppLoggerService)
- `cache/` — Redis-backed cache service (CacheService)
- `queue/` — RabbitMQ publisher and base consumer (QueueModule)
- `events/` — in-process EventEmitter2 bus (EventsModule)

## Hard Rules
- Never import from `src/modules`
- Never import from `src/shared` itself (no cross-service deps within shared)
- May import from `src/common` and `src/config` only
- Every service here must be injectable and exportable via its own module
