/**
 * Lifecycle state of a token on the platform.
 *
 * Permitted transitions
 * ---------------------
 *   ACTIVE   → INACTIVE    (reversible suspension)
 *   INACTIVE → ACTIVE      (reinstatement)
 *   ACTIVE   → DEPRECATED  (terminal — irreversible)
 *   INACTIVE → DEPRECATED  (terminal — irreversible)
 *   DEPRECATED → *         ❌ FORBIDDEN
 *
 * A three-value enum is required because `DEPRECATED` is a terminal state
 * with distinct business semantics that cannot be modelled by a boolean.
 *
 * Never rename or remove enum values after they have been persisted in
 * production; the string is stored in the `tokens.status` Postgres ENUM column.
 */
export enum TokenStatus {
  /** Token is fully operable for deposits and withdrawals. */
  ACTIVE = 'active',

  /** Token is temporarily suspended; no new on-chain operations are permitted. */
  INACTIVE = 'inactive',

  /**
   * Terminal state — token will never be re-enabled.
   * Historical records (deposits, withdrawals) remain valid and queryable.
   */
  DEPRECATED = 'deprecated',
}
