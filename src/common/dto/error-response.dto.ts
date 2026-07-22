import { ApiProperty } from '@nestjs/swagger';

/**
 * Documented shape returned by `GlobalHttpExceptionFilter` for every error
 * response. Referenced by controllers via `@ApiResponse({ type: ErrorResponseDto })`
 * so Swagger consumers (frontend, QA, third parties) have one canonical error
 * contract for the whole API, instead of ad-hoc shapes per endpoint.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 404, description: 'HTTP status code' })
  public statusCode!: number;

  @ApiProperty({ example: 'Resource not found', description: 'Human-readable error message' })
  public message!: string;

  @ApiProperty({ example: 'Not Found', description: 'HTTP status text' })
  public error!: string;

  @ApiProperty({ example: '/api/v1/health', description: 'Request path that triggered the error' })
  public path!: string;

  @ApiProperty({ example: '2026-07-22T01:00:00.000Z', description: 'ISO timestamp of the error' })
  public timestamp!: string;
}
