/**
 * Contract for the application-wide key/value cache.
 *
 * Every module depends on this interface, never on a concrete class.
 * The implementation (Redis, in-memory, …) is wired in `SharedModule`
 * and injected via `INJECTION_TOKENS.CACHE`.
 *
 * Key convention: `namespace:entity:identifier`
 * Use `buildCacheKey()` from `@common/constants/cache.constants` to
 * construct keys consistently.
 */
export interface ICache {
  /**
   * Retrieves a cached value by key.
   * Returns `null` if the key does not exist or has expired.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores a value under `key`.
   * @param key   - Cache key.
   * @param value - Value to store (must be JSON-serialisable).
   * @param ttlMs - Optional time-to-live in **milliseconds**.
   *                If omitted the implementation's default TTL applies.
   */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Deletes the entry for `key`.
   * Is a no-op if the key does not exist.
   */
  del(key: string): Promise<void>;

  /**
   * Clears the entire cache store.
   * Use with caution — only appropriate during tests or full resets.
   */
  reset(): Promise<void>;

  /**
   * Cache-aside helper: returns the cached value if present, otherwise
   * executes `factory`, stores the result, and returns it.
   *
   * @param key     - Cache key.
   * @param factory - Async function that produces the value on a cache miss.
   * @param ttlMs   - Optional TTL in milliseconds.
   */
  wrap<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T>;
}
