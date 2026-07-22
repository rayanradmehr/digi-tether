# src/core

Bootstrap wiring layer. Registered once at application startup via AppModule.

## Files
- `core.module.ts` — assembles all global providers
- `filters/` — global exception filter (ApiResponse<null> shape)
- `interceptors/` — global response wrapper and request logger
- `guards/` — global guards (e.g. JWT guard if applied universally)

## Hard Rules
- No business logic
- No module-specific guards (those belong in their own module)
- No stateful services
- May import from `src/shared` and `src/common` only
