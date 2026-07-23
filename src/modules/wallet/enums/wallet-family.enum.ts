/**
 * Cryptographic address family of a wallet.
 *
 * A family maps to a single key-pair algorithm and address derivation scheme.
 * All networks within the same family share the same underlying address.
 *
 * Family → algorithm mapping (DOMAIN-MODEL.md §3):
 *
 *   EVM     → ECDSA_SECP256K1 — Ethereum, BSC, Polygon, Arbitrum, Optimism,
 *                                Base, Avalanche C-Chain, all future EVM chains.
 *   TRON    → ECDSA_SECP256K1 — Tron (Base58Check encoding).
 *   BITCOIN → SCHNORR         — Bitcoin Taproot (BIP-340, P2TR, bech32m).
 *   SOLANA  → ED25519         — Solana (Base58 pubkey).
 *   NEAR    → ED25519         — NEAR Protocol (Base58 pubkey).
 *
 * New families are added by:
 *   1. Extending this enum.
 *   2. Adding one entry in WalletFamilyResolver.
 *   3. No other component requires change.
 *
 * Column name: driver_family (aligned with Network Module driverKey concept).
 */
export enum WalletFamily {
  /** All EVM-compatible chains. One pool, one address space. */
  EVM = 'EVM',

  /** Tron network. Separate pool — Base58Check address encoding differs. */
  TRON = 'TRON',

  /** Bitcoin Taproot (P2TR). Schnorr signature scheme. */
  BITCOIN = 'BITCOIN',

  /** Solana. Ed25519 key pairs. */
  SOLANA = 'SOLANA',

  /** NEAR Protocol. Ed25519 key pairs. */
  NEAR = 'NEAR',
}
