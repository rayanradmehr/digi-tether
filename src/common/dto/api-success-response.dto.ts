import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-documented shape of the `ApiResponse<T>` success envelope.
 *
 * Because `@nestjs/swagger` cannot generate schemas for generic classes,
 * controllers that return a paginated or data-bearing response should use
 * `@ApiPaginatedResponse()` or compose `ApiSuccessResponseDto` with
 * `@ApiExtraModels` + inline schema `$ref` for the specific data type.
 *
 * For simple endpoints where the data type is already documented on the
 * returned DTO itself, this class documents the wrapper fields.
 */
export class ApiSuccessResponseDto {
  @ApiProperty({ example: true })
  public success!: boolean;

  @ApiProperty({ example: 'Success' })
  public message!: string;

  @ApiProperty({
    description: 'Response payload — shape depends on the specific endpoint.',
    nullable: true,
  })
  public data!: unknown;
}
