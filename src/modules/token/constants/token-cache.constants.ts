import { buildCacheKey, CACHE_PREFIX } from '@common/constants/cache.constants';
import { TTL } from '@common/constants/ttl.constants';

/**
 * Cache key prefix for all token-scoped cache entries.
 * Sourced from the shared `CACHE_PREFIX` registry to prevent key collisions.
 */
export const TOKEN_CACHE_PREFIX = CACHE_PREFIX.TOKEN;

/**
 * TTL for individual token lookups (by UUID): 5 minutes.
 * Matches the Network Module caching policy for consistency.
 */
export const TOKEN_CACHE_TTL_MS = TTL.MEDIUM * 1_000;

/**
 * Builds a canonical cache key for a token lookup.
 *
 * Pattern: `token:id:<uuid>`
 * Example: `buildTokenCacheKey('id', '550e8400-...')` → `'token:id:550e8400-...'`
 *
 * @param segment    - Sub-entity segment (e.g. 'id').
 * @param identifier - The value being cached (UUID string).
 */
export function buildTokenCacheKey(
  segment: string,
  identifier: string | number,
): string {
  return buildCacheKey(TOKEN_CACHE_PREFIX, segment, identifier);
}
