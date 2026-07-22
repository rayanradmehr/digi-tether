# config

Single source of truth for environment/runtime configuration.

- `environment.schema.ts`: zod schema validating `process.env` at boot
  (fail-fast, no assumed defaults for required secrets).
- `app-config.service.ts`: strongly-typed facade injected via DI; no other
  module is allowed to read `process.env` directly.
- `swagger.config.ts`: centralized, environment-aware OpenAPI bootstrap.
