import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';

/**
 * Query parameter shape for `GET /tokens`.
 *
 * All fields are optional. Omitting all filters returns all live
 * (non-deleted) tokens paginated. Provided filters combine with AND semantics.
 *
 * `page` and `limit` use the same defaults as the Network Module
 * (page = 1, limit = 20) for a consistent developer experience.
 */
export class TokenQueryDto {
  /** Page number (1-based). Defaults to 1. */
  @ApiPropertyOptional({ example: 1, description: 'Page number (1-based). Default: 1.', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number;

  /** Results per page. Range 1–100. Defaults to 20. */
  @ApiPropertyOptional({ example: 20, description: 'Results per page. Range 1–100. Default: 20.', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;

  /** Filter to tokens belonging to a specific network. */
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter by network UUID.',
  })
  @IsOptional()
  @IsUUID('4')
  public networkId?: string;

  /** Filter by token type (native or contract). */
  @ApiPropertyOptional({
    enum: TokenType,
    example: TokenType.CONTRACT,
    description: 'Filter by token type.',
  })
  @IsOptional()
  @IsEnum(TokenType)
  public type?: TokenType;

  /** Filter by token standard (native, erc20, trc20). */
  @ApiPropertyOptional({
    enum: TokenStandard,
    example: TokenStandard.ERC20,
    description: 'Filter by token standard.',
  })
  @IsOptional()
  @IsEnum(TokenStandard)
  public standard?: TokenStandard;

  /** Filter by lifecycle status. */
  @ApiPropertyOptional({
    enum: TokenStatus,
    example: TokenStatus.ACTIVE,
    description: 'Filter by lifecycle status.',
  })
  @IsOptional()
  @IsEnum(TokenStatus)
  public status?: TokenStatus;
}
