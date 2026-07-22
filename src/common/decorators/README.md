# common/decorators

Reusable NestJS/TypeScript decorators with no domain-specific behavior.

## Files
- `current-user.decorator.ts` — `@CurrentUser()` request param extractor
- `trim.decorator.ts` — `@Trim()` DTO property whitespace trimmer
- `api-paginated-response.decorator.ts` — `@ApiPaginatedResponse()` Swagger helper

## Rules
- No decorators encoding business rules (e.g. @RequiresKYC)
- No decorators that reach into the database
- No decorators tied to a single module's logic
