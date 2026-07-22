import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignerResultDto } from './signer-result.dto';

/**
 * Request body for `POST /signer/jobs/:requestId/result`.
 *
 * The global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform)
 * validates this DTO before the handler is invoked.
 *
 * Validation rejects:
 * - Unknown fields (`forbidNonWhitelisted`).
 * - Empty `signature` or `signatureAlgorithm`.
 * - Invalid ISO 8601 `completedAt`.
 * - Requests where `result` fails nested validation.
 *
 * ## What this DTO contains
 * The Offline Signer submits only the fields it computed:
 * - `requestId` — correlation id echoed from the payload.
 * - `signature` — the raw cryptographic output.
 * - `signatureAlgorithm` — the algorithm used (must match stored value).
 * - `publicKeyFingerprint` — short fingerprint for audit (not the full key).
 * - `completedAt` — when the Signer performed the operation.
 * - `result` — the full `SignerResult` contract as a nested object.
 *
 * ## What this DTO does NOT contain
 * - No `claimToken` — the backend retrieves the stored claimToken from the
 *   database and uses it for ownership verification internally.
 * - No wallet data.
 * - No private key material.
 * - No RPC or blockchain data.
 * - No signing payload bytes.
 *
 * ## Security
 * `signature` is cryptographic material. It is accepted here solely for
 * storage in the `result` JSONB column. The backend NEVER logs it.
 */
export class SubmitResultRequest {
  /**
   * UUID v4 echoed from `SignerPayload.requestId`.
   * Must match the `:requestId` path parameter.
   * Duplicate check: the backend rejects if these two values differ.
   */
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description:
      'UUID echoed from SignerPayload.requestId. Must match the :requestId path parameter.',
  })
  @IsString()
  @IsNotEmpty()
  public requestId!: string;

  /**
   * Hex-encoded signature bytes produced by the Signer.
   *
   * SENSITIVE — never log this value at any layer.
   * Minimum 1 character; maximum 1024 hex characters (512 raw bytes).
   */
  @ApiProperty({
    example: '304402201...',
    description:
      'Hex-encoded signature bytes. SENSITIVE — never log. Min 1, max 1024 hex chars.',
    minLength: 1,
    maxLength: 1024,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1024)
  public signature!: string;

  /**
   * Signing algorithm used by the Signer.
   * Must match `SignerPayload.signAlgorithm` stored in the job row.
   * The backend rejects mismatches with 422 Unprocessable Entity.
   */
  @ApiProperty({
    enum: SignAlgorithm,
    example: SignAlgorithm.ECDSA_SECP256K1,
    description:
      'Algorithm used for signing. Must match the stored SignerPayload.signAlgorithm.',
  })
  @IsEnum(SignAlgorithm)
  public signatureAlgorithm!: SignAlgorithm;

  /**
   * Short fingerprint of the public key used for signing.
   * Not the full compressed public key — the full key is in `result.publicKey`.
   * Used for quick audit lookup without requiring full key parsing.
   * Maximum 128 characters.
   */
  @ApiProperty({
    example: 'sha256:ab12cd...',
    description:
      'Short fingerprint of the public key used. For audit. Max 128 chars.',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public publicKeyFingerprint!: string;

  /**
   * ISO 8601 UTC timestamp of when the Signer completed the signing operation.
   * Must fall within [SignerPayload.createdAt, SignerPayload.expiresAt].
   * The backend rejects values outside this window with 422.
   */
  @ApiProperty({
    example: '2026-07-22T19:00:00.000Z',
    description:
      'ISO 8601 UTC timestamp of signing completion. Must be within the job validity window.',
  })
  @IsISO8601()
  @IsNotEmpty()
  public completedAt!: string;

  /**
   * The complete `SignerResult` contract.
   * Validated recursively via `@ValidateNested()` and `@Type()`.
   * Contains: requestId, signature, publicKey, signAlgorithm,
   * signatureFormat, signerVersion, signedAt, executionTimeMs.
   */
  @ApiProperty({
    type: () => SignerResultDto,
    description: 'Full SignerResult contract. All fields are validated.',
  })
  @ValidateNested()
  @Type(() => SignerResultDto)
  public result!: SignerResultDto;
}
