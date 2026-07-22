# common/types

TypeScript interfaces and types reused across multiple modules with no domain affiliation.

## Files
- `api-response.type.ts` — `ApiResponse<T>` standard HTTP response envelope
- `service-result.type.ts` — `ServiceResult<T>` for non-throwing service results
- `app-user.type.ts` — `AppUser` authenticated user shape
- `sort-order.type.ts` — `SortOrder` enum
- `environment.type.ts` — `IEnvironment` typed env shape

## Rules
- No entity interfaces (those live beside the entity in their module)
- No request/response DTOs for specific endpoints
- No types encoding domain concepts (e.g. TransactionStatus)
