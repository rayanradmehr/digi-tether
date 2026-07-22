/**
 * Strongly typed enum of supported blockchain driver families.
 *
 * Each value is a stable string key that the Drivers layer maps to a
 * concrete driver class. Adding a new driver family requires only a new
 * enum member here — no entity migration, no DTO change.
 *
 * Naming convention: use the canonical chain-family name in UPPER_SNAKE_CASE.
 *
 * IMPORTANT
 * - These values are stored as VARCHAR in the `networks.driver_key` column.
 * - Never rename or remove a value once it has been persisted in production;
 *   create a database migration to rename the stored string instead.
 * - The Drivers layer is the single source of truth for which drivers are
 *   actually implemented; this enum describes which driver families the
 *   platform *intends* to support at the data-model level.
 */
export enum NetworkDriver {
  /**
   * EVM-compatible chains (Ethereum, BSC, Polygon, Avalanche C-Chain, etc.).
   * These chains share the same ABI encoding, transaction format, and
   * JSON-RPC interface (eth_* methods).
   */
  EVM = 'evm',

  /**
   * Tron network.
   * Uses a distinct HTTP/gRPC API, energy/bandwidth model, and TRC-20
   * token standard that differs fundamentally from EVM.
   */
  TRON = 'tron',
}
