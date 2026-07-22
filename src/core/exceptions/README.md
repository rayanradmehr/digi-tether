# core/exceptions

Application-level HTTP exception hierarchy.

All classes extend `AppException` which extends NestJS `HttpException`.
They are caught automatically by `GlobalHttpExceptionFilter` in `common/filters/`.

## Files
- `app.exception.ts` — `AppException` base (message + status + stable `code`)
- `bad-request.exception.ts` — 400 `BAD_REQUEST`
- `unauthorized.exception.ts` — 401 `UNAUTHORIZED`
- `forbidden.exception.ts` — 403 `FORBIDDEN`
- `not-found.exception.ts` — 404 `RESOURCE_NOT_FOUND`
- `conflict.exception.ts` — 409 `CONFLICT`

## Rules
- Every exception MUST carry a stable machine-readable `code` string
- No domain-specific exceptions here (those live in their own module)
- No HTTP knowledge in domain/service layer — only throw these at the controller boundary
