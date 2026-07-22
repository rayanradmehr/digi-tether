import { ApiProperty } from '@nestjs/swagger';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignatureFormat } from '../enums/signature-format.enum';

/**
 * Nested DTO that mirrors `SignerResult` for Swagger documentation.
 *
 * This class is embedded inside `SubmitResultRequest` and provides
 * full `@ApiProperty` coverage for every field the Offline Signer
 * submits as part of the result.
 *
 * Field mapping to the `SignerResult` contract (signer-result.contract.ts):
 * - `requestId`      → SignerResult.requestId
 * - `signature`      → SignerResult.signature
 * - `publicKey`      → SignerResult.publicKey
 * - `signAlgorithm`  → SignerResult.signAlgorithm
 * - `signatureFormat`→ SignerResult.signatureFormat
 * - `signerVersion`  → SignerResult.signerVersion
 * - `signedAt`       → SignerResult.signedAt
 * - `executionTimeMs`→ SignerResult.executionTimeMs
 *
 * SECURITY: `signature` and `publicKey` are cryptographic material.
 * They must NEVER be logged at any layer.
 */
export class SignerResultDto {
  /**
   * Must exactly match the `requestId` from the claimed `SignerPayload`.
   * The backend rejects submissions where this does not match the stored value.
   * Prevents stale or replayed submissions.
   */
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description:
      'Must exactly match SignerPayload.requestId. Replayed or mismatched values are rejected.',
  })
  public requestId!: string;

  /**
   * Hex-encoded signature bytes in the format specified by `signatureFormat`.
   *
   * SENSITIVE — never log this value.
   */
  @ApiProperty({
    example: '304402201...',
    description:
      'Hex-encoded signature bytes. Format is determined by signatureFormat. '
      + 'SENSITIVE — never log.',
  })
  public signature!: string;

  /**
   * Hex-encoded compressed public key used to produce the signature.
   * Used by the backend for audit; not used for cryptographic verification
   * in this phase.
   */
  @ApiProperty({
    example: '02b4632d08485ff1df2db55b9dafd23347d1c47a457072a1e87be26896549a8737',
    description:
      'Hex-encoded compressed public key. Used for audit. Not cryptographically verified by the backend.',
  })
  public publicKey!: string;

  /**
   * Must echo `SignerPayload.signAlgorithm`.
   * The backend rejects if this does not match the stored payload value.
   */
  @ApiProperty({
    enum: SignAlgorithm,
    example: SignAlgorithm.ECDSA_SECP256K1,
    description: 'Must match SignerPayload.signAlgorithm. Mismatches are rejected with 422.',
  })
  public signAlgorithm!: SignAlgorithm;

  /**
   * Must match `SignerPayload.signatureFormat`.
   * The backend rejects if this does not match the stored payload value.
   */
  @ApiProperty({
    enum: SignatureFormat,
    description: 'Must match SignerPayload.signatureFormat. Mismatches are rejected with 422.',
  })
  public signatureFormat!: SignatureFormat;

  /**
   * Semantic version string of the Signer binary that produced this result.
   * Used for audit and rollout tracking.
   * Example: '1.0.0'
   */
  @ApiProperty({
    example: '1.0.0',
    description: 'Semantic version of the Offline Signer binary. Used for audit.',
  })
  public signerVersion!: string;

  /**
   * ISO 8601 UTC timestamp of when the signing operation was performed.
   * Must fall within [SignerPayload.createdAt, SignerPayload.expiresAt].
   * The backend rejects results signed outside this window.
   */
  @ApiProperty({
    example: '2026-07-22T19:00:00.000Z',
    description:
      'ISO 8601 UTC signing timestamp. Must be within [payload.createdAt, payload.expiresAt].',
  })
  public signedAt!: string;

  /**
   * Wall-clock milliseconds the signing operation required.
   * Used for performance monitoring and anomaly detection.
   */
  @ApiProperty({
    example: 42,
    description: 'Signing operation wall-clock duration in milliseconds. Used for monitoring.',
  })
  public executionTimeMs!: number;
}
