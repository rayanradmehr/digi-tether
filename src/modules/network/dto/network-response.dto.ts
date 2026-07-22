import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Swagger-documented output shape for a single network record.
 *
 * Rules:
 * - Never exposes `deletedAt` (soft-delete implementation detail).
 * - Never exposes `version` (optimistic lock counter, internal only).
 * - `driverKey` is typed as `NetworkDriver` enum for type-safe consumers.
 * - All fields are documented with examples for accurate Swagger generation.
 */
export class NetworkResponseDto {
  /** UUID primary key of the network record. */
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  public id!: string;

  /** Human-readable display name. */
  @ApiProperty({ example: 'Ethereum' })
  public name!: string;

  /** URL-safe unique slug. Immutable. */
  @ApiProperty({ example: 'ethereum-mainnet' })
  public slug!: string;

  /** Native currency ticker symbol. */
  @ApiProperty({ example: 'ETH' })
  public symbol!: string;

  /** Chain-level identifier. Immutable. */
  @ApiProperty({ example: '1' })
  public chainId!: string;

  /** Decimal precision of the native currency. */
  @ApiProperty({ example: 18 })
  public nativeDecimals!: number;

  /** Driver family key. Resolves to a concrete driver class in the Drivers layer. */
  @ApiProperty({ enum: NetworkDriver, example: NetworkDriver.EVM })
  public driverKey!: NetworkDriver;

  /** Block explorer base URL. */
  @ApiProperty({ example: 'https://etherscan.io' })
  public explorerBaseUrl!: string;

  /** Required deposit confirmation count. */
  @ApiProperty({ example: 12 })
  public requiredConfirmations!: number;

  /** Approximate block time in seconds. Informational only. */
  @ApiProperty({ example: 12 })
  public blockTimeSeconds!: number;

  /** Whether this is a testnet network. */
  @ApiProperty({ example: false })
  public isTestnet!: boolean;

  /** Whether this network is currently active. */
  @ApiProperty({ example: true })
  public isActive!: boolean;

  /** Optional operator-facing description. */
  @ApiPropertyOptional({ example: 'The Ethereum mainnet.', nullable: true })
  public description!: string | null;

  /** Record creation timestamp. */
  @ApiProperty()
  public createdAt!: Date;

  /** Last update timestamp. */
  @ApiProperty()
  public updatedAt!: Date;
}
