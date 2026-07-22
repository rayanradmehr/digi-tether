import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * The only business-facing module in Phase 0.
 *
 * WHY it is allowed despite "no business logic": liveness/readiness checks
 * are infrastructure concerns, not blockchain business logic (wallet,
 * deposit, withdrawal, sweep are explicitly excluded). It also serves as the
 * reference implementation for how every future module must be documented
 * with Swagger, satisfying "no endpoint is considered complete unless fully
 * documented".
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
