import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { NullQueuePublisher } from './queue.publisher';

/**
 * Registers the queue publisher globally under `INJECTION_TOKENS.QUEUE_PUBLISHER`.
 *
 * Phase 1: uses `NullQueuePublisher` (no-op, no broker connection).
 * Replace `useClass` with a RabbitMQ implementation in a later phase.
 */
@Global()
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.QUEUE_PUBLISHER,
      useClass: NullQueuePublisher,
    },
  ],
  exports: [INJECTION_TOKENS.QUEUE_PUBLISHER],
})
export class QueueModule {}
