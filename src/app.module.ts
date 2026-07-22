import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { DatabaseModule } from '@database/database.module';
import { QueuesModule } from '@queues/queues.module';
import { CoreModule } from '@core/core.module';
import { SharedModule } from '@shared/shared.module';
import { HealthModule } from '@modules/health/health.module';

/**
 * Root application module.
 *
 * Import order matters for global module resolution:
 * 1. `AppConfigModule` — config must be available first
 * 2. `DatabaseModule` — TypeORM connection
 * 3. `SharedModule` — global infrastructure providers (logger, cache, queue, events)
 * 4. `CoreModule` — global filters, interceptors, middleware
 * 5. `QueuesModule` — placeholder for RabbitMQ (Phase 0 legacy, will be merged into SharedModule later)
 * 6. Feature modules (HealthModule and future business modules)
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedModule,
    CoreModule,
    QueuesModule,
    HealthModule,
  ],
})
export class AppModule {}
