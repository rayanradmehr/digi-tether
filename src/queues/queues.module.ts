import { Module } from '@nestjs/common';

/**
 * Placeholder for the RabbitMQ integration (ADR-002).
 *
 * Phase 0 explicitly excludes business workflows (wallet.generate,
 * deposit.detect, withdrawal.sign, ...), so this module intentionally does
 * not connect to RabbitMQ yet. It exists now so that:
 * - the top-level folder structure matches the mandated layout,
 * - `AppModule` already has a stable import point for the future
 *   `RabbitMqModule.forRootAsync(...)` wiring,
 * - later phases only need to fill this module in, never relocate it.
 */
@Module({})
export class QueuesModule {}
