import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Input DTO for registering a new blockchain network.
 *
 * All string fields are trimmed by `TrimStringsPipe` before validation.
 * `slug` and `chainId` are accepted here (creation-only) but excluded from
 * `UpdateNetworkDto` because they are immutable after creation.
 */
export class CreateNetworkDto {
  /**
   * Human-readable display name for the network.
   * Must be unique across all registered networks.
   */
  @ApiProperty({ example: 'Ethereum', description: 'Human-readable network name. Must be unique.' })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  /**
   * URL-safe unique slug. Immutable after creation.
   * Format: lowercase alphanumeric words separated by hyphens.
   * Example: 'ethereum-mainnet', 'bsc-mainnet', 'tron-mainnet'
   */
  @ApiProperty({
    example: 'ethereum-mainnet',
    description:
      'URL-safe unique identifier. Lowercase hyphenated. IMMUTABLE after creation.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens (e.g. ethereum-mainnet)',
  })
  public slug!: string;

  /**
   * Native currency ticker symbol.
   * Example: 'ETH', 'TRX', 'BNB'
   */
  @ApiProperty({ example: 'ETH', description: 'Native currency ticker symbol (e.g. ETH, TRX)' })
  @IsString()
  @IsNotEmpty()
  public symbol!: string;

  /**
   * Chain-level network identifier. Immutable after creation.
   * EVM: EIP-155 chain ID as a decimal string (e.g. '1').
   * Others: network-specific canonical identifier.
   */
  @ApiProperty({
    example: '1',
    description:
      'Chain-level identifier. EIP-155 integer string for EVM chains. IMMUTABLE after creation.',
  })
  @IsString()
  @IsNotEmpty()
  public chainId!: string;

  /**
   * Decimal precision of the native currency.
   * Range: 0–36. Common values: 18 (ETH/BNB), 6 (TRX).
   */
  @ApiProperty({
    example: 18,
    description: 'Decimal precision of the native currency. Range 0–36.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public nativeDecimals!: number;

  /**
   * Driver family that handles this network.
   * Must be a valid `NetworkDriver` enum value.
   */
  @ApiProperty({
    enum: NetworkDriver,
    example: NetworkDriver.EVM,
    description: 'Driver family identifier. Must match a value from the NetworkDriver enum.',
  })
  @IsEnum(NetworkDriver)
  public driverKey!: NetworkDriver;

  /**
   * Block explorer base URL.
   * Used to construct transaction and address explorer links.
   */
  @ApiProperty({
    example: 'https://etherscan.io',
    description: 'Block explorer base URL. Must be a valid HTTPS URL.',
  })
  @IsUrl({ require_tld: true })
  public explorerBaseUrl!: string;

  /** Minimum deposit confirmations required. Defaults to 12. Range: 1–500. */
  @ApiPropertyOptional({
    example: 12,
    description: 'Minimum block confirmations for deposit finality. Default: 12.',
    default: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public requiredConfirmations?: number;

  /** Approximate block time in seconds. Informational only. Defaults to 12. */
  @ApiPropertyOptional({
    example: 12,
    description: 'Approximate block time in seconds. Informational only. Default: 12.',
    default: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  public blockTimeSeconds?: number;

  /** True for test networks (Goerli, Sepolia, Nile, Shasta, etc.). */
  @ApiPropertyOptional({
    example: false,
    description: 'Set to true for testnet networks. Default: false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  /** Whether the network is active on registration. Defaults to true. */
  @ApiPropertyOptional({
    example: true,
    description: 'Initial activation state. Default: true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  public isActive?: boolean;

  /** Optional operator description. Not used in business logic. */
  @ApiPropertyOptional({
    example: 'The Ethereum mainnet (EIP-155 chain ID 1).',
    description: 'Optional human-readable description for operators.',
  })
  @IsOptional()
  @IsString()
  public description?: string;
}
