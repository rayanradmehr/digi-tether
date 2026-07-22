export const CACHE_PREFIX = {
  USER: 'user',
  TOKEN: 'token',
  NETWORK: 'network',
  WALLET: 'wallet',
  RATE: 'rate',
} as const;

export type CachePrefix = (typeof CACHE_PREFIX)[keyof typeof CACHE_PREFIX];

/**
 * Builds a canonical cache key.
 * Pattern: namespace:entity:identifier
 * Example: buildCacheKey(CACHE_PREFIX.USER, 'profile', '42') => 'user:profile:42'
 */
export function buildCacheKey(
  prefix: CachePrefix,
  entity: string,
  identifier: string | number,
): string {
  return `${prefix}:${entity}:${identifier}`;
}
