import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { NullEventPublisher } from './event-publisher.service';

/**
 * Registers the event publisher globally under `INJECTION_TOKENS.EVENT_PUBLISHER`.
 *
 * Phase 1: uses `NullEventPublisher` (no-op, no EventEmitter2 dependency).
 * Replace `useClass` with an EventEmitter2-backed implementation in a later phase.
 */
@Global()
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.EVENT_PUBLISHER,
      useClass: NullEventPublisher,
    },
  ],
  exports: [INJECTION_TOKENS.EVENT_PUBLISHER],
})
export class EventsModule {}
