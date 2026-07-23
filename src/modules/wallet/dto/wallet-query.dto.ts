import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';

/**
 * Query parameters for `GET /v1/wallets` (admin paginated wallet list).
 *
 * All fields are optional — omitting all fields returns all wallets
 * ordered by `created_at DESC`, paginated by `page` and `limit`.
 *
 * The global `ValidationPipe` with `transform: true` coerces
 * query string values to their declared TypeScript types via
 * `@Type(() => Number)` decorators on numeric fields.
 *
 * ## Pagination defaults
 * - `page`  default: 1
 * - `limit` default: 50, max: 100
 *
 * ## Filter combinations
 * All provided filters are combined with AND semantics.
 * Example: `?driverFamily=EVM&status=AVAILABLE` returns only AVAILABLE EVM wallets.
 *
 * ## Security note
 * `customerId` is PII. Query logs must not retain raw query strings
 * containing this parameter.
 */
export class WalletQueryDto {
  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  /**
   * Filter by wallet family. Returns wallets from the specified family pool only.
   */
  @ApiPropertyOptional({
    description: 'Filter by cryptographic address family.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @IsOptional()
  @IsEnum(WalletFamily)
  public readonly driverFamily?: WalletFamily;

  /**
   * Filter by lifecycle status.
   * Useful for pool monitoring: `?status=AVAILABLE` shows pool depth.
   */
  @ApiPropertyOptional({
    description: 'Filter by lifecycle status.',
    enum: WalletStatus,
    example: WalletStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(WalletStatus)
  public readonly status?: WalletStatus;

  /**
   * Filter by customer identifier.
   * Returns all wallets assigned to the specified customer across all families.
   * PII — never log query strings containing this parameter.
   */
  @ApiPropertyOptional({
    description:
      'Filter by opaque customer identifier. PII — never log this parameter.',
    example: 'cust_01HX5K3MZPQ8R9T2VWYX4ZBCD',
    minLength: 1,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly customerId?: string;

  /**
   * Filter by the UUID of the SignerJob that created the wallet.
   * Useful for tracing a specific batch of wallets to their originating job.
   */
  @ApiPropertyOptional({
    description: 'Filter by the UUID of the CREATE_WALLET SignerJob that produced the wallet.',
    example: 'b1e2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4')
  public readonly createdByJobId?: string;

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  /**
   * 1-based page number.
   * Default: 1.
   */
  @ApiPropertyOptional({
    description: '1-based page number.',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page?: number;

  /**
   * Maximum records per page.
   * Default: 50. Maximum: 100.
   */
  @ApiPropertyOptional({
    description: 'Maximum records per page. Default 50, max 100.',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly limit?: number;
}
