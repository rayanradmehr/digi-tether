import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Input DTO for partial updates to a network record.
 *
 * `slug` and `chainId` are intentionally excluded — they are immutable
 * after creation per ADR-N-001 and ADR-N-013.
 */
export class UpdateNetworkDto {
  @ApiPropertyOptional({ example: 'Ethereum', description: 'Human-readable network name' })
  @IsOptional()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({ example: 'ETH', description: 'Native currency ticker symbol' })
  @IsOptional()
  @IsString()
  public symbol?: string;

  @ApiPropertyOptional({ example: 18, description: 'Decimal precision of the native currency' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public nativeDecimals?: number;

  @ApiPropertyOptional({ example: 'evm', description: 'Driver key' })
  @IsOptional()
  @IsString()
  public driverKey?: string;

  @ApiPropertyOptional({ example: 'https://etherscan.io', description: 'Block explorer base URL' })
  @IsOptional()
  @IsUrl({ require_tld: true })
  public explorerBaseUrl?: string;

  @ApiPropertyOptional({ example: 12, description: 'Required deposit confirmations' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public requiredConfirmations?: number;

  @ApiPropertyOptional({ example: 12, description: 'Approximate block time in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  public blockTimeSeconds?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  @ApiPropertyOptional({ example: 'The Ethereum mainnet.' })
  @IsOptional()
  @IsString()
  public description?: string;
}
