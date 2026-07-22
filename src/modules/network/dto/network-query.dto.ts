import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@common/pagination/pagination-query.dto';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Query parameters for listing networks.
 *
 * Extends `PaginationQueryDto` so `page` and `limit` are inherited with
 * their constraints (min: 1, max: 100) and default values.
 *
 * All filter fields are optional. Omitting a field means no filter is applied
 * for that dimension. Multiple filters are combined with AND semantics.
 */
export class NetworkQueryDto extends PaginationQueryDto {
  /**
   * Filter by driver family.
   * Example: `?driverKey=evm` returns only EVM-compatible networks.
   */
  @ApiPropertyOptional({
    enum: NetworkDriver,
    example: NetworkDriver.EVM,
    description: 'Filter networks by driver family.',
  })
  @IsOptional()
  @IsEnum(NetworkDriver)
  public driverKey?: NetworkDriver;

  /**
   * Filter by activation status.
   * Example: `?isActive=true` returns only networks available for operations.
   */
  @ApiPropertyOptional({
    example: true,
    description: 'Filter by active status. Omit to return all.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public isActive?: boolean;

  /**
   * Filter by testnet classification.
   * Example: `?isTestnet=false` returns only production networks.
   */
  @ApiPropertyOptional({
    example: false,
    description: 'Filter by testnet flag. Omit to return all.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public isTestnet?: boolean;
}
