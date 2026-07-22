import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger-documented output shape for a single network record.
 * Never exposes `deletedAt` or internal audit fields beyond timestamps.
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

  @ApiProperty({ example: 'evm' })
  public driverKey!: string;

  @ApiProperty({ example: 'https://etherscan.io' })
  public explorerBaseUrl!: string;

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
