/**
 * Discriminator for wallet_audit_log rows.
 *
 * Every value corresponds to a distinct lifecycle event that WalletService
 * must record in the append-only audit log. No action may be deleted from
 * this enum without a ratified ADR.
 */
export enum WalletAuditAction {
  /** A new wallet was persisted from a completed CREATE_WALLET SignerJob result. */
  CREATED = 'CREATED',

  /** A wallet was atomically reserved in Phase 1 of the assignment protocol. */
  RESERVED = 'RESERVED',

  /** A reserved wallet was permanently assigned to a customer. */
  ASSIGNED = 'ASSIGNED',

  /** A reservation expired and the wallet was released back to AVAILABLE. */
  RESERVATION_RELEASED = 'RESERVATION_RELEASED',

  /** A wallet was locked by an operator with a human-readable reason. */
  LOCKED = 'LOCKED',

  /** A locked wallet was unlocked; previous status was restored. */
  UNLOCKED = 'UNLOCKED',

  /** A wallet was permanently marked as compromised (terminal). */
  COMPROMISED = 'COMPROMISED',

  /** A wallet was retired to the ARCHIVED state (terminal). */
  ARCHIVED = 'ARCHIVED',
}
