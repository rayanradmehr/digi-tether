# core/middleware

HTTP middleware applied at the application level before any route handler.

## Files
- `request-id.middleware.ts` — `RequestIdMiddleware`
  Attaches a UUID `requestId` to `req.id`. Honours upstream `x-request-id`
  header for distributed tracing. Echoes the ID in the response header.

## Rules
- Middleware here must be request-lifecycle concerns only
- No business logic
- No database access
