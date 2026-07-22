import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { DatabaseModule } from '@database/database.module';
import { QueuesModule } from '@queues/queues.module';
import { HealthModule } from '@modules/health/health.module';

/**
 * Root application module.
 *
 * Phase 0 scope: only foundational, framework/infrastructure modules and the
 * Health module (used to validate the whole bootstrap pipeline, including
 * Swagger, config loading and the database connection). No blockchain
 * business modules (wallet, deposit, withdrawal, ...) are registered here
 * yet — they will be added module-by-module in later phases, each following
 * the mandated Architecture -> Rules -> Folder -> Interfaces -> DTOs ->
 * Implementation -> Tests order.
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, QueuesModule, HealthModule],
})
export class AppModule {}
