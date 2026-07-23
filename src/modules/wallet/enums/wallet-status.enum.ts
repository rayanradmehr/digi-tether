/**
 * Lifecycle states of a single wallet record.
 *
 * State machine (full spec in DOMAIN-MODEL.md §4):
 *
 *   AVAILABLE ──► RESERVED ──► ASSIGNED   (mandatory 2-phase; terminal for owner)
 *   RESERVED  ──► AVAILABLE               (timeout / explicit release)
 *   AVAILABLE ──► LOCKED   ──► AVAILABLE  (temporary freeze)
 *   ASSIGNED  ──► LOCKED   ──► ASSIGNED   (investigation hold)
 *   AVAILABLE | ASSIGNED | LOCKED ──► COMPROMISED  (terminal)
 *   AVAILABLE | LOCKED             ──► ARCHIVED     (terminal)
 *
 * COMPROMISED and ARCHIVED are permanently terminal — no further
 * transitions are ever permitted from either state.
 *
 * Direct AVAILABLE → ASSIGNED skipping RESERVED is permanently forbidden.
 */
export enum WalletStatus {
  /** In the pool; ready for assignment. */
  AVAILABLE = 'AVAILABLE',

  /**
   * Temporarily claimed by an in-progress assignment transaction.
   * Released back to AVAILABLE if not completed within the configured TTL.
   */
  RESERVED = 'RESERVED',

  /** Permanently assigned to a customer. Ownership is immutable. */
  ASSIGNED = 'ASSIGNED',

  /** Temporarily frozen. No operations permitted. Reversible via unlock(). */
  LOCKED = 'LOCKED',

  /**
   * Permanently decommissioned. Private key may be exposed.
   * Terminal — no further transitions permitted.
   */
  COMPROMISED = 'COMPROMISED',

  /**
   * Retired from active use. Historical record only.
   * Terminal — no further transitions permitted.
   */
  ARCHIVED = 'ARCHIVED',
}
