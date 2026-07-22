/**
 * Options accepted by cache set/wrap operations.
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds. Omit to use the implementation default. */
  ttlMs?: number;
}
