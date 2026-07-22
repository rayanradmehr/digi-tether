import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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

/**
 * Input DTO for registering a new blockchain network.
 * All string fields are trimmed by `TrimStringsPipe` before validation.
 */
export class CreateNetworkDto {
  @ApiProperty({ example: 'Ethereum', description: 'Human-readable network name' })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  @ApiProperty({
    example: 'ethereum-mainnet',
    description: 'URL-safe unique slug. Immutable after creation.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  public slug!: string;

  @ApiProperty({ example: 'ETH', description: 'Native currency ticker symbol' })
  @IsString()
  @IsNotEmpty()
  public symbol!: string;

  @ApiProperty({
    example: '1',
    description: 'Chain-level identifier (EIP-155 integer as string for EVM, etc.)',
  })
  @IsString()
  @IsNotEmpty()
  public chainId!: string;

  @ApiProperty({ example: 18, description: 'Decimal precision of the native currency' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public nativeDecimals!: number;

  @ApiProperty({
    example: 'evm',
    description: 'Driver key used to resolve the blockchain driver implementation',
  })
  @IsString()
  @IsNotEmpty()
  public driverKey!: string;

  @ApiProperty({
    example: 'https://etherscan.io',
    description: 'Block explorer base URL',
  })
  @IsUrl({ require_tld: true })
  public explorerBaseUrl!: string;

  @ApiPropertyOptional({ example: 12, description: 'Required deposit confirmations', default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public requiredConfirmations?: number;

  @ApiPropertyOptional({ example: 12, description: 'Approximate block time in seconds', default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  public blockTimeSeconds?: number;

  @ApiPropertyOptional({ example: false, description: 'True for test networks' })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Whether the network is active', default: true })
  @IsOptional()
  @IsBoolean()
  public isActive?: boolean;

  @ApiPropertyOptional({ example: 'The Ethereum mainnet.', description: 'Optional description' })
  @IsOptional()
  @IsString()
  public description?: string;
}
