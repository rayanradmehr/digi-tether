import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { DatabaseModule } from '@database/database.module';
import { QueuesModule } from '@queues/queues.module';
import { CoreModule } from '@core/core.module';
import { HealthModule } from '@modules/health/health.module';

/**
 * Root application module.
 *
 * Phase 0 scope: foundational infrastructure modules + Health endpoint.
 * Phase 1 adds: CoreModule which wires global filters, interceptors and
 * the RequestIdMiddleware across all routes.
 *
 * Business modules (wallet, deposit, withdrawal, …) are registered here
 * module-by-module in later phases following the mandated order:
 * Architecture → Rules → Folder → Interfaces → DTOs → Implementation → Tests.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, QueuesModule, CoreModule, HealthModule],
})
export class AppModule {}
