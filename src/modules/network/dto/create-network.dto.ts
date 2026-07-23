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

export class CreateNetworkDto {
  @ApiProperty({ example: 'Ethereum', description: 'Human-readable network name. Must be unique.' })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  @ApiProperty({
    example: 'ethereum-mainnet',
    description: 'URL-safe unique identifier. Lowercase hyphenated. IMMUTABLE after creation.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens (e.g. ethereum-mainnet)',
  })
  public slug!: string;

  @ApiProperty({ example: 'ETH', description: 'Native currency ticker symbol (e.g. ETH, TRX)' })
  @IsString()
  @IsNotEmpty()
  public symbol!: string;

  @ApiProperty({
    example: '1',
    description: 'Chain-level identifier. EIP-155 integer string for EVM chains. IMMUTABLE after creation.',
  })
  @IsString()
  @IsNotEmpty()
  public chainId!: string;

  @ApiProperty({
    example: 18,
    description: 'Decimal precision of the native currency. Range 0–36.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public nativeDecimals!: number;

  @ApiProperty({
    enum: NetworkDriver,
    example: NetworkDriver.EVM,
    description: 'Driver family identifier. Must match a value from the NetworkDriver enum.',
  })
  @IsEnum(NetworkDriver)
  public driverKey!: NetworkDriver;

  /**
   * RPC node endpoint URL.
   * Required — without it the Drivers layer cannot connect to the blockchain.
   * Example: 'https://mainnet.infura.io/v3/<key>', 'https://api.trongrid.io'
   */
  @ApiProperty({
    example: 'https://mainnet.infura.io/v3/YOUR_KEY',
    description: 'RPC node endpoint URL. Required for blockchain connectivity.',
  })
  @IsUrl({ require_tld: true, require_protocol: true })
  public rpcUrl!: string;

  @ApiPropertyOptional({
    example: 'https://etherscan.io',
    description: 'Block explorer base URL. Optional.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true })
  public explorerBaseUrl?: string;

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

  @ApiPropertyOptional({
    example: false,
    description: 'Set to true for testnet networks. Default: false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Initial activation state. Default: true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  public isActive?: boolean;

  @ApiPropertyOptional({
    example: 'The Ethereum mainnet (EIP-155 chain ID 1).',
    description: 'Optional human-readable description for operators.',
  })
  @IsOptional()
  @IsString()
  public description?: string;
}
