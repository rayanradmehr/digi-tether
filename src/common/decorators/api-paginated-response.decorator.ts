import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Swagger shorthand decorator for paginated list endpoints.
 *
 * Generates an OpenAPI schema that accurately represents the
 * `PaginatedResult<T>` envelope without requiring callers to manually
 * compose `$ref` + `allOf` schema fragments.
 *
 * Usage:
 * ```ts
 * @ApiPaginatedResponse(UserDto)
 * @Get()
 * findAll(): Promise<PaginatedResult<UserDto>> { ... }
 * ```
 */
export function ApiPaginatedResponse<T>(model: Type<T>): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Success' },
              data: {
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: getSchemaPath(model) },
                  },
                  total: { type: 'number', example: 100 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 20 },
                  totalPages: { type: 'number', example: 5 },
                  hasNextPage: { type: 'boolean', example: true },
                  hasPreviousPage: { type: 'boolean', example: false },
                },
              },
            },
          },
        ],
      },
    }),
  );
}
