# shared/tokens

Central registry of all Dependency Injection token `Symbol`s for the shared
infrastructure layer.

## File
- `injection-tokens.ts` — `INJECTION_TOKENS` constant map + `InjectionToken` type

## Token → Interface mapping

| Token | Interface | Default implementation |
|---|---|---|
| `INJECTION_TOKENS.LOGGER` | `ILogger` | `AppLoggerService` |
| `INJECTION_TOKENS.CACHE` | `ICache` | `NullCacheService` |
| `INJECTION_TOKENS.QUEUE_PUBLISHER` | `IQueuePublisher` | `NullQueuePublisher` |
| `INJECTION_TOKENS.EVENT_PUBLISHER` | `IEventPublisher` | `NullEventPublisher` |

## Rules
- Use `Symbol` only — never plain strings for shared tokens
- Add a new token here when a new shared contract is introduced
- Never import a concrete implementation class directly in business modules
