import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';
import { ContractAddressRequired } from '../validators/contract-address-required.validator';

/**
 * Input DTO for registering a new blockchain asset (`POST /tokens`).
 *
 * Immutable fields after creation (structurally absent from `UpdateTokenDto`):
 * - `networkId`       (Invariant 10)
 * - `type`           (Invariant 11)
 * - `standard`       (encodes protocol identity)
 * - `contractAddress` (Invariant 9)
 * - `decimals`       (Invariant 8)
 *
 * Cross-field constraint:
 * - `type = native`   → `contractAddress` must be null.
 * - `type = contract` → `contractAddress` must be a valid chain address.
 *
 * All string fields are trimmed by the global `TrimStringsPipe` before
 * validation executes.
 */
export class CreateTokenDto {
  /** UUID v4 of the network this token belongs to. Immutable after creation. */
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID v4 of the parent network. IMMUTABLE after creation.',
  })
  @IsUUID('4')
  public networkId!: string;

  /**
   * Token discriminator: native coin or smart-contract token.
   * IMMUTABLE after creation.
   */
  @ApiProperty({
    enum: TokenType,
    example: TokenType.CONTRACT,
    description: 'Discriminates native coins from contract tokens. IMMUTABLE after creation.',
  })
  @IsEnum(TokenType)
  public type!: TokenType;

  /**
   * Token protocol standard.
   * IMMUTABLE after creation. Must be compatible with the network driver.
   */
  @ApiProperty({
    enum: TokenStandard,
    example: TokenStandard.ERC20,
    description:
      'Token protocol standard. Must be compatible with the network driver. IMMUTABLE after creation.',
  })
  @IsEnum(TokenStandard)
  public standard!: TokenStandard;

  /** Human-readable display name. Example: 'Tether USD'. */
  @ApiProperty({
    example: 'Tether USD',
    description: 'Human-readable display name of the asset.',
  })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  /**
   * Ticker symbol.
   * Format: 1–20 uppercase alphanumeric characters.
   * Must be unique per network among live records.
   */
  @ApiProperty({
    example: 'USDT',
    description:
      'Ticker symbol. 1–20 uppercase alphanumeric chars. ' +
      'Unique per network among live records.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{1,20}$/, {
    message: 'symbol must be 1–20 uppercase alphanumeric characters (A–Z, 0–9).',
  })
  public symbol!: string;

  /**
   * Decimal precision of the asset's smallest unit.
   * IMMUTABLE after creation (Invariant 8). Range: 0–36.
   */
  @ApiProperty({
    example: 6,
    description:
      'Decimal precision of the smallest unit. Range 0–36. IMMUTABLE after creation.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public decimals!: number;

  /**
   * Smart-contract address on-chain.
   *
   * IMMUTABLE after creation (Invariant 9).
   * Must be null for native tokens.
   * Must be a valid EVM (0x-prefixed) or Tron (Base58Check / hex) address
   * for contract tokens. Empty string and zero address are forbidden.
   */
  @ApiPropertyOptional({
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    nullable: true,
    description:
      'On-chain contract address. NULL for native tokens. ' +
      'Required for contract tokens. IMMUTABLE after creation.',
  })
  @IsOptional()
  @IsString()
  @ContractAddressRequired()
  public contractAddress!: string | null;

  /** Initial lifecycle status. Defaults to ACTIVE when omitted. */
  @ApiPropertyOptional({
    enum: TokenStatus,
    example: TokenStatus.ACTIVE,
    description: 'Initial lifecycle status. Defaults to ACTIVE.',
    default: TokenStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TokenStatus)
  public status?: TokenStatus;

  /**
   * Per-token confirmation override.
   * NULL means "use the network default" (Invariant 15).
   * Range when non-null: 1–500.
   */
  @ApiPropertyOptional({
    example: 20,
    nullable: true,
    description:
      'Override confirmation count for this token. ' +
      'NULL inherits the network default. Range 1–500.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public confirmationsOverride?: number | null;

  /** HTTPS URL of the token logo. Optional. */
  @ApiPropertyOptional({
    example: 'https://cdn.example.com/tokens/usdt.png',
    nullable: true,
    description: 'HTTPS URL of the token logo. Presentation metadata only.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https'] })
  public logoUrl?: string | null;

  /** Optional operator description. Not used in business logic. */
  @ApiPropertyOptional({
    example: 'Tether USD ERC-20 token on Ethereum mainnet.',
    nullable: true,
    description: 'Optional operator description. Informational only.',
  })
  @IsOptional()
  @IsString()
  public description?: string | null;
}
