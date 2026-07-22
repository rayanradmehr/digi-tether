# shared/logger

Structured application logger abstraction.

## Files
- `logger.interface.ts` — `ILogger` contract (verbose/debug/log/warn/error)
- `logger.service.ts` — `AppLoggerService` — NestJS `Logger`-backed implementation
- `logger.module.ts` — `LoggerModule` — global module, registers `INJECTION_TOKENS.LOGGER`

## Usage in a module
```ts
@Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger
```

## Rules
- Never import `AppLoggerService` directly in business modules
- Always inject via `INJECTION_TOKENS.LOGGER` + `ILogger` type
- No `console.log` anywhere in the codebase
