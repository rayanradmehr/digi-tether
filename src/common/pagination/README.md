# common/pagination

Cross-cutting pagination primitives used by every list endpoint.

## Files
- `pagination-query.dto.ts` — `PaginationQueryDto` (page, limit with min/max validation)
- `paginated-result.type.ts` — `PaginatedResult<T>` generic response wrapper
- `pagination.util.ts` — pure `paginate()` function returning `{ skip, take }`

## Rules
- No TypeORM query builders here
- No database calls
- No module-specific pagination filters
