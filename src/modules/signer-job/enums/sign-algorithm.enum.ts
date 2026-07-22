/**
 * Cryptographic signing algorithm the Offline Signer must use.
 *
 * Set by `SigningPayloadBuilder` based on the network's `driverKey`.
 * Stored inside the `SignerPayload.signAlgorithm` field (JSONB).
 * The Signer uses this to select the correct curve and signing operation.
 *
 * The `payloadDigest` algorithm is also determined by this enum value
 * inside `SigningPayloadBuilder` — it is NOT stored separately in the payload.
 *
 * IMPORTANT
 * - These values are stored as VARCHAR inside the `payload` JSONB column.
 * - Adding a new algorithm requires:
 *   1. A new enum member here.
 *   2. A new digest-function mapping in `SigningPayloadBuilder`.
 *   3. A new byte-length validation case in `SignerResultValidator`.
 *   4. A ratified ADR.
 * - Never rename a value once it has been persisted in production.
 */
export enum SignAlgorithm {
  /**
   * ECDSA over secp256k1 curve.
   * Used by all EVM-compatible chains (Ethereum, BSC, Polygon, etc.).
   * Digest function: keccak256.
   */
  ECDSA_SECP256K1 = 'ECDSA_SECP256K1',

  /**
   * Edwards-curve Digital Signature Algorithm over Curve25519.
   * Reserved for future chain families (Solana, NEAR, etc.).
   * Digest function: SHA-512 (per RFC 8032).
   */
  ED25519 = 'ED25519',

  /**
   * Schnorr signature scheme over secp256k1.
   * Reserved for Bitcoin Taproot (BIP-340) and future chains.
   * Digest function: SHA-256d (double SHA-256).
   */
  SCHNORR = 'SCHNORR',
}
