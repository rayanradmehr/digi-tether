import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@common/pagination/pagination-query.dto';

/**
 * Query parameters for listing networks.
 * Extends the shared pagination DTO so `page` and `limit` are inherited.
 */
export class NetworkQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'evm', description: 'Filter by driver key' })
  @IsOptional()
  @IsString()
  public driverKey?: string;

  @ApiPropertyOptional({ example: true, description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public isActive?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Filter by testnet flag' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public isTestnet?: boolean;
}
