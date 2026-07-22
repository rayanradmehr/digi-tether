# src/common

Framework-agnostic utility layer. Pure TypeScript only.

## Sub-folders
- `constants/` — shared magic strings, numbers, keys
- `types/` — shared TypeScript interfaces and types
- `pagination/` — pagination DTO, result type, utility function
- `decorators/` — reusable NestJS decorators
- `pipes/` — reusable transformation pipes
- `validators/` — custom class-validator constraints
- `utils/` — pure stateless utility functions

## Hard Rules
- Zero NestJS `@Injectable()` providers
- No database access
- No HTTP calls
- No imports from `src/shared` or `src/modules`
- Safe to import from anywhere in the codebase
