/**
 * Canonical input contract for `IntegritySignatureService.sign()`.
 *
 * Represents the full `SignerPayload` minus the `integritySignature` field
 * itself. `SigningPayloadBuilder` passes this type to `IntegritySignatureService`
 * as the final step of payload assembly.
 *
 * The HMAC is computed over the deterministic JSON serialisation of this
 * object (keys sorted lexicographically, no trailing whitespace).
 *
 * This type is a utility contract internal to `SignerJobModule`.
 * It must never be exposed to upstream modules or to the Signer API surface.
 *
 * WHY A SEPARATE TYPE?
 * TypeScript's `Omit<SignerPayload, 'integritySignature'>` would work but
 * is opaque at the call site. A named type makes the boundary explicit and
 * forces reviewers to notice when its shape changes.
 */
export type IntegritySignatureInput = {
  readonly payloadVersion: number;
  readonly protocolVersion: number;
  readonly transactionVersion: number;
  readonly requestId: string;
  readonly walletId: string;
  readonly network: {
    readonly chainId: string;
    readonly driverKey: string;
    readonly nativeSymbol: string;
  };
  readonly signAlgorithm: string;
  readonly signatureFormat: string;
  readonly signingPayload: string;
  readonly payloadDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};

/**
 * Result returned by `IntegritySignatureService.sign()`.
 *
 * An opaque hex or prefixed string representation of the HMAC-SHA256
 * computed over the canonical JSON of `IntegritySignatureInput`.
 *
 * Format: `hmac:sha256:<hex-digest>` — the prefix makes the algorithm
 * explicit in stored data and enables future algorithm agility without
 * changing the field name.
 *
 * Example: `'hmac:sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b'`
 */
export type IntegritySignatureValue = string;
