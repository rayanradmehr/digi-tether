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
 * - `slug`    — immutable after creation (ADR-N-013); rename requires migration + ADR
 * - `chainId` — immutable after creation (ADR-N-013); change requires migration + ADR
 *
 * Downstream modules must never call update with these fields. The service
 * layer will ignore them even if somehow passed, but the DTO is the first
 * line of defence.
 */
export class UpdateNetworkDto {
  /** New human-readable display name. */
  @ApiPropertyOptional({
    example: 'Ethereum Mainnet',
    description: 'Updated human-readable name.',
  })
  @IsOptional()
  @IsString()
  public name?: string;

  /** Updated native currency ticker symbol. */
  @ApiPropertyOptional({
    example: 'ETH',
    description: 'Updated native currency ticker symbol.',
  })
  @IsOptional()
  @IsString()
  public symbol?: string;

  /** Updated decimal precision of the native currency. Range: 0–36. */
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

  /**
   * Updated driver family.
   * Changing the driver key on an active network is a significant operational
   * change — the operator must verify the new driver is deployed and tested.
   */
  @ApiPropertyOptional({
    enum: NetworkDriver,
    example: NetworkDriver.EVM,
    description: 'Updated driver family key. Must be a valid NetworkDriver enum value.',
  })
  @IsOptional()
  @IsEnum(NetworkDriver)
  public driverKey?: NetworkDriver;

  /** Updated block explorer base URL. */
  @ApiPropertyOptional({
    example: 'https://etherscan.io',
    description: 'Updated block explorer base URL.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true })
  public explorerBaseUrl?: string;

  /** Updated minimum deposit confirmation count. Range: 1–500. */
  @ApiPropertyOptional({
    example: 12,
    description: 'Updated minimum block confirmations for deposit finality.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public requiredConfirmations?: number;

  /** Updated approximate block time in seconds. Range: 1–3600. */
  @ApiPropertyOptional({
    example: 12,
    description: 'Updated approximate block time in seconds.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  public blockTimeSeconds?: number;

  /** Updated testnet classification. */
  @ApiPropertyOptional({
    example: false,
    description: 'Updated testnet flag.',
  })
  @IsOptional()
  @IsBoolean()
  public isTestnet?: boolean;

  /** Updated operator description. */
  @ApiPropertyOptional({
    example: 'Updated description for Ethereum mainnet.',
    description: 'Updated optional operator description.',
  })
  @IsOptional()
  @IsString()
  public description?: string;
}
