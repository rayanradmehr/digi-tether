import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

/**
 * Exposes liveness/readiness probes for orchestration platforms (Docker,
 * Kubernetes, PM2) and uptime monitoring.
 *
 * Business Logic never exists inside Controllers (Architecture-Rules): this
 * controller only delegates to `HealthCheckService`/`TypeOrmHealthIndicator`
 * from `@nestjs/terminus`, it contains no custom logic of its own.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check service health',
    description:
      'Returns the liveness/readiness status of the service and its critical ' +
      'dependencies (currently: PostgreSQL connectivity). Used by orchestrators ' +
      'and uptime monitors; must never require authentication.',
  })
  @ApiResponse({ status: 200, description: 'Service and all dependencies are healthy.' })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies are unhealthy.',
    type: ErrorResponseDto,
  })
  public check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.pingCheck('database')]);
  }
}
