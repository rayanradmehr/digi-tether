# common/constants

All shared magic strings, magic numbers, and configuration keys used across two or more modules.

## Files
- `cache.constants.ts` — cache key namespace prefixes
- `queue.constants.ts` — exchange names and routing keys
- `pagination.constants.ts` — default and max pagination limits
- `ttl.constants.ts` — TTL values in seconds
- `http.constants.ts` — reusable HTTP status message strings

## Rules
- No environment variable names (those belong in `config/`)
- No entity field names
- No constants that only ever appear in one single module
