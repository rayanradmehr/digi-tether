import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Swagger-documented output shape for a single network record.
 *
 * Rules:
 * - Never exposes `deletedAt` (soft-delete implementation detail).
 * - Never exposes `version` (optimistic lock counter, internal only).
 * - `rpcUrl` IS exposed — consumers (admin panel, health checks) need it.
 */
export class NetworkResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  public id!: string;

  @ApiProperty({ example: 'Ethereum' })
  public name!: string;

  @ApiProperty({ example: 'ethereum-mainnet' })
  public slug!: string;

  @ApiProperty({ example: 'ETH' })
  public symbol!: string;

  @ApiProperty({ example: '1' })
  public chainId!: string;

  @ApiProperty({ example: 18 })
  public nativeDecimals!: number;

  @ApiProperty({ enum: NetworkDriver, example: NetworkDriver.EVM })
  public driverKey!: NetworkDriver;

  @ApiProperty({ example: 'https://mainnet.infura.io/v3/YOUR_KEY', description: 'RPC node endpoint URL.' })
  public rpcUrl!: string;

  @ApiPropertyOptional({ example: 'https://etherscan.io', nullable: true })
  public explorerBaseUrl!: string | null;

  @ApiProperty({ example: 12 })
  public requiredConfirmations!: number;

  @ApiProperty({ example: 12 })
  public blockTimeSeconds!: number;

  @ApiProperty({ example: false })
  public isTestnet!: boolean;

  @ApiProperty({ example: true })
  public isActive!: boolean;

  @ApiPropertyOptional({ example: 'The Ethereum mainnet.', nullable: true })
  public description!: string | null;

  @ApiProperty()
  public createdAt!: Date;

  @ApiProperty()
  public updatedAt!: Date;
}
