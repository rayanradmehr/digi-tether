import { ApiProperty } from '@nestjs/swagger';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignatureFormat } from '../enums/signature-format.enum';

/**
 * Response DTO for `POST /signer/jobs/:requestId/claim`.
 *
 * This is the ONLY moment the Signer receives `signingPayload`,
 * `payloadDigest`, and `integritySignature`. Delivering them here
 * — after atomic ownership is confirmed — prevents a Signer from
 * consuming cryptographic material for a job it does not own.
 *
 * Field exclusions (enforced by explicit mapping — no spread or Object.assign):
 * - No database primary key (`id`).
 * - No `claimedAt`, `claimToken`, `updatedAt`, `version`.
 * - No wallet internal fields beyond what the sealed payload carries.
 * - No network internal fields.
 * - No `referenceId`, `referenceType`, `jobType` — business context
 *   is never leaked to the Offline Signer.
 *
 * The Signer MUST perform the following verifications before signing:
 * 1. Verify `integritySignature` using the shared HMAC-SHA256 secret.
 * 2. Verify `payloadVersion` is understood.
 * 3. Verify `expiresAt` has not passed.
 * 4. Recompute `payloadDigest` from `signingPayload` and verify it matches.
 * 5. Sign `signingPayload` bytes using `signAlgorithm`.
 * 6. Return a `SignerResult` in the format specified by `signatureFormat`.
 */
export class ClaimJobResponse {
  /**
   * UUID of the signing request — echoed for Signer-side correlation.
   * The Signer MUST echo this verbatim in `SignerResult.requestId`.
   */
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description:
      'UUID of the signing request. Echo this in SignerResult.requestId.',
  })
  public requestId!: string;

  /**
   * Schema version of the `SignerPayload` structure.
   * Reject if this version is not supported by the Signer binary.
   */
  @ApiProperty({
    example: 1,
    description: 'Schema version of the SignerPayload.',
  })
  public payloadVersion!: number;

  /**
   * Backend–Signer communication protocol version.
   */
  @ApiProperty({
    example: 1,
    description: 'Backend–Signer protocol version.',
  })
  public protocolVersion!: number;

  /**
   * Encoding version of the `signingPayload` bytes.
   * Driver-family-specific (e.g. EIP-2718 envelope version for EVM).
   */
  @ApiProperty({
    example: 1,
    description:
      'Encoding version of the signingPayload bytes. Driver-family-specific.',
  })
  public transactionVersion!: number;

  /**
   * Cryptographic algorithm the Signer MUST use.
   * Echo this in `SignerResult.signAlgorithm`.
   */
  @ApiProperty({
    enum: SignAlgorithm,
    example: SignAlgorithm.ECDSA_SECP256K1,
    description: 'Cryptographic signing algorithm. Echo in SignerResult.signAlgorithm.',
  })
  public signAlgorithm!: SignAlgorithm;

  /**
   * Required encoding format of the signature the Signer MUST return.
   * The backend rejects results where `signatureFormat` does not match.
   */
  @ApiProperty({
    enum: SignatureFormat,
    description:
      'Required signature encoding format. Produce the signature in exactly this format.',
  })
  public signatureFormat!: SignatureFormat;

  /**
   * Hex-encoded canonical byte payload to sign.
   * The Signer applies its private key to these bytes using `signAlgorithm`.
   *
   * THIS IS SENSITIVE CRYPTOGRAPHIC MATERIAL.
   * Never log this value. Never store it outside secure memory.
   * Zeroize after use.
   */
  @ApiProperty({
    example: 'f86c0285012a05f200825208944592d8f8d...',
    description:
      'Hex-encoded bytes to sign. SENSITIVE — never log, never persist outside secure memory.',
  })
  public signingPayload!: string;

  /**
   * Hex-encoded deterministic digest of `signingPayload`.
   * The Signer MUST recompute this from `signingPayload` and verify it
   * matches before performing any signing operation.
   */
  @ApiProperty({
    example: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    description:
      'Hex-encoded digest of signingPayload. Recompute and verify before signing.',
  })
  public payloadDigest!: string;

  /**
   * HMAC-SHA256 integrity signature of this payload.
   * The Signer MUST verify this before touching any private key material.
   *
   * THIS IS SENSITIVE CRYPTOGRAPHIC MATERIAL.
   * Never log this value.
   */
  @ApiProperty({
    example: 'hmac:sha256:a1b2c3d4...',
    description:
      'HMAC-SHA256 integrity signature. MUST be verified before any signing. SENSITIVE — never log.',
  })
  public integritySignature!: string;

  /**
   * ISO 8601 UTC expiry deadline.
   * The Signer MUST independently verify this has not passed.
   */
  @ApiProperty({
    example: '2026-07-22T21:00:00.000Z',
    description:
      'ISO 8601 UTC expiry. Signer must independently verify this has not passed.',
  })
  public expiresAt!: string;
}
