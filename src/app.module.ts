import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { DatabaseModule } from '@database/database.module';
import { QueuesModule } from '@queues/queues.module';
import { CoreModule } from '@core/core.module';
import { SharedModule } from '@shared/shared.module';
import { HealthModule } from '@modules/health/health.module';
import { NetworkModule } from '@modules/network/network.module';

/**
 * Root application module.
 *
 * Import order:
 * 1. AppConfigModule  — config available first
 * 2. DatabaseModule   — TypeORM connection
 * 3. SharedModule     — global infrastructure providers (logger, cache, queue, events)
 * 4. CoreModule       — global filters, interceptors, middleware
 * 5. QueuesModule     — RabbitMQ placeholder (Phase 0 legacy)
 * 6. Feature modules  — Health, Network, … (business modules in dependency order)
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedModule,
    CoreModule,
    QueuesModule,
    HealthModule,
    NetworkModule,
  ],
})
export class AppModule {}
