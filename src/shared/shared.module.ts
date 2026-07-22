import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module';
import { EventsModule } from './events/events.module';
import { LoggerModule } from './logger/logger.module';
import { QueueModule } from './queue/queue.module';

/**
 * Aggregator module that imports all shared infrastructure sub-modules.
 *
 * Import `SharedModule` once in `AppModule`. Because each sub-module is
 * decorated with `@Global()`, their providers become available across the
 * entire application without re-importing.
 *
 * Sub-modules:
 * - `LoggerModule` — `INJECTION_TOKENS.LOGGER` → `ILogger`
 * - `CacheModule` — `INJECTION_TOKENS.CACHE` → `ICache`
 * - `QueueModule` — `INJECTION_TOKENS.QUEUE_PUBLISHER` → `IQueuePublisher`
 * - `EventsModule` — `INJECTION_TOKENS.EVENT_PUBLISHER` → `IEventPublisher`
 */
@Module({
  imports: [LoggerModule, CacheModule, QueueModule, EventsModule],
})
export class SharedModule {}
