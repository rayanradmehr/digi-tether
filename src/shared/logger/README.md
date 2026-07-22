# shared/logger

Structured application logger. Wraps NestJS LoggerService with a consistent format.

## Files
- `logger.service.ts` — `AppLoggerService` injectable
- `logger.module.ts` — `LoggerModule` (registered globally)

## Log Entry Shape
Every log line carries: `timestamp`, `level`, `context`, `correlationId`, `message`.

## Rules
- No `console.log` anywhere in the codebase — use this service
- No business-specific log messages defined here
- No hardcoded module names or entity-specific fields
