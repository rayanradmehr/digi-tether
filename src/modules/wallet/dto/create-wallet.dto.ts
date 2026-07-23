import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { WalletFamily } from '../enums/wallet-family.enum';

/**
 * Data required to persist a new wallet returned by the Offline Signer
 * after completing a `CREATE_WALLET` SignerJob.
 *
 * This DTO is used INTERNALLY by `WalletCreationResultHandler` —
 * it is NOT a public API request body. No controller accepts this DTO directly.
 *
 * Source: the `result` field of a completed `CREATE_WALLET` SignerJob row.
 *
 * ## Validation rules
 * - `address` must be 1–128 non-empty chars.
 * - `driverFamily` must be a recognised enum value.
 * - `publicKey` must be a non-empty hex string, 1–512 chars.
 * - `createdByJobId` must be a valid UUID v4.
 * - `publicKeyFingerprint` optional; format `sha256:<hex>`, max 128 chars.
 * - `signerVersion` optional; semver-ish string, max 32 chars.
 *
 * ## What this DTO does NOT contain
 * - No status — always set to AVAILABLE by the service.
 * - No customerId — not yet assigned.
 * - No reservationToken — N/A at creation time.
 * - No private key material.
 */
export class CreateWalletDto {
  /**
   * The blockchain address string as produced by the Offline Signer.
   * Format is family-specific (see wallet.entity.ts for per-family formats).
   * Immutable once stored.
   */
  @ApiProperty({
    description:
      'Blockchain address as produced by the Offline Signer. Immutable after creation.',
    example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  public readonly address!: string;

  /**
   * Cryptographic address family. Determines pool membership.
   * Immutable once stored.
   */
  @ApiProperty({
    description: 'Cryptographic address family of this wallet. Immutable after creation.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @IsEnum(WalletFamily)
  public readonly driverFamily!: WalletFamily;

  /**
   * Full public key hex string as returned by the Offline Signer.
   * Mandatory — a CREATE_WALLET result without a public key must be rejected
   * before this DTO is constructed (ADR-WM-002, ADR-WM-007).
   * Immutable once stored.
   */
  @ApiProperty({
    description:
      'Full public key hex string from the Offline Signer. Mandatory. Immutable.',
    example:
      '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
    minLength: 1,
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(512)
  public readonly publicKey!: string;

  /**
   * UUID v4 of the `CREATE_WALLET` SignerJob that produced this wallet.
   * Must exist in `signer_jobs`. Enforces one wallet per job result.
   */
  @ApiProperty({
    description:
      'UUID v4 of the CREATE_WALLET SignerJob that produced this wallet.',
    example: 'b1e2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4')
  public readonly createdByJobId!: string;

  /**
   * SHA-256 fingerprint of the public key.
   * Format: `sha256:<64 hex chars>`. Optional.
   */
  @ApiPropertyOptional({
    description:
      'SHA-256 fingerprint of publicKey. Format: sha256:<hex>. Optional.',
    example: 'sha256:a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^sha256:[0-9a-f]{64}$/, {
    message: 'publicKeyFingerprint must be in format sha256:<64 lowercase hex chars>',
  })
  public readonly publicKeyFingerprint?: string;

  /**
   * Version string of the Offline Signer binary that generated this wallet.
   * Used for audit and incident response. Optional.
   */
  @ApiPropertyOptional({
    description:
      'Signer binary version that generated this wallet. Optional. For audit.',
    example: '2.4.1',
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  public readonly signerVersion?: string;
}
