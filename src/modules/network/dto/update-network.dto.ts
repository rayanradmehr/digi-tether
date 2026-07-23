import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Input DTO for partial updates to a network record.
 *
 * Immutable fields are intentionally absent:
 * - `slug`    — immutable after creation (ADR-N-013)
 * - `chainId` — immutable after creation (ADR-N-013)
 *
 * `rpcUrl` IS mutable — operators rotate RPC node endpoints at any time.
 */
export class UpdateNetworkDto {
  @ApiPropertyOptional({ example: 'Ethereum Mainnet', description: 'Updated human-readable name.' })
  @IsOptional()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({ example: 'ETH', description: 'Updated native currency ticker symbol.' })
  @IsOptional()
  @IsString()
  public symbol?: string;

  @ApiPropertyOptional({
    example: 18,
    description: 'Updated native currency decimal precision. Range 0–36.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36)
  public nativeDecimals?: number;

  @ApiPropertyOptional({
    enum: NetworkDriver,
    example: NetworkDriver.EVM,
    description: 'Updated driver family key.',
  })
  @IsOptional()
  @IsEnum(NetworkDriver)
  public driverKey?: NetworkDriver;

  /**
   * Updated RPC node endpoint URL.
   * Mutable — rotate when switching providers or key rotation.
   */
  @ApiPropertyOptional({
    example: 'https://mainnet.infura.io/v3/NEW_KEY',
    description: 'Updated RPC node endpoint URL.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true, require_protocol: true })
  public rpcUrl?: string;

  @ApiPropertyOptional({
    example: 'https://etherscan.io',
    description: 'Updated block explorer base URL.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true })
  public explorerBaseUrl?: string;

  @ApiPropertyOptional({ example: 12, description: 'Updated minimum block confirmations.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public requiredConfirmations?: number;

  @ApiPropertyOptional({ example: 12, description: 'Updated approximate block time in seconds.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  public blockTimeSeconds?: number;

  @ApiPropertyOptional({ example: false, description: 'Updated testnet flag.' })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  @ApiPropertyOptional({ example: 'Updated description.', description: 'Updated operator description.' })
  @IsOptional()
  @IsString()
  public description?: string;
}
