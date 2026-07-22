/**
 * Expected encoding format of the signature returned by the Offline Signer.
 *
 * Set by `SigningPayloadBuilder` inside `SignerPayload.signatureFormat`.
 * The Signer MUST return a signature encoded in exactly this format.
 * The backend validates the format on result receipt before accepting.
 *
 * Different blockchain driver families require different formats:
 * - EVM chains expect RECOVERABLE (65 bytes: r || s || v).
 * - Tron expects RSV with a specific v offset.
 * - Bitcoin Taproot expects COMPACT (64 bytes BIP-340).
 *
 * IMPORTANT
 * - These values are stored inside the `payload` and `result` JSONB columns.
 * - Adding a new format requires a new enum member here and a new validation
 *   case in `SignerResultValidator`, plus a ratified ADR.
 * - Never rename a value once persisted in production.
 */
export enum SignatureFormat {
  /**
   * Raw concatenated bytes: r || s (64 bytes) or r || s || v (65 bytes).
   * No ASN.1 framing. Length depends on algorithm.
   */
  RAW = 'RAW',

  /**
   * ASN.1 DER-encoded signature.
   * Variable length (typically 70–72 bytes for secp256k1).
   * Used by some HSM and legacy systems.
   */
  DER = 'DER',

  /**
   * Big-endian R, S, V components.
   * Common in Tron transaction serialisation.
   */
  RSV = 'RSV',

  /**
   * 65-byte recoverable signature: r || s || v (Ethereum convention).
   * The recovery byte `v` allows derivation of the signer's public key
   * without requiring the public key to be transmitted separately.
   * Standard format for EVM chains.
   */
  RECOVERABLE = 'RECOVERABLE',

  /**
   * 64-byte compact Schnorr signature (BIP-340).
   * Used by Bitcoin Taproot. No recovery byte.
   */
  COMPACT = 'COMPACT',
}
