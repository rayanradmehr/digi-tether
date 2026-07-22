import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';

/**
 * Outbound shape returned by every Token Module endpoint.
 *
 * Intentionally excludes infrastructure-level fields:
 * - `deletedAt`  — soft-delete internals are never exposed via the API.
 * - `version`    — optimistic lock counter is an infrastructure concern.
 *
 * This class is the stable public contract. Changes to `Token` entity
 * columns do not automatically affect this DTO — the mapper (`TokenMapper`)
 * mediates between the two.
 */
export class TokenResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  public id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  public networkId!: string;

  @ApiProperty({ enum: TokenType, example: TokenType.CONTRACT })
  public type!: TokenType;

  @ApiProperty({ enum: TokenStandard, example: TokenStandard.ERC20 })
  public standard!: TokenStandard;

  @ApiProperty({ example: 'Tether USD' })
  public name!: string;

  @ApiProperty({ example: 'USDT' })
  public symbol!: string;

  @ApiProperty({ example: 6 })
  public decimals!: number;

  @ApiPropertyOptional({
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    nullable: true,
  })
  public contractAddress!: string | null;

  @ApiProperty({ enum: TokenStatus, example: TokenStatus.ACTIVE })
  public status!: TokenStatus;

  @ApiPropertyOptional({ example: 20, nullable: true })
  public confirmationsOverride!: number | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/tokens/usdt.png',
    nullable: true,
  })
  public logoUrl!: string | null;

  @ApiPropertyOptional({
    example: 'Tether USD ERC-20 token on Ethereum mainnet.',
    nullable: true,
  })
  public description!: string | null;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  public createdAt!: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  public updatedAt!: Date;
}
