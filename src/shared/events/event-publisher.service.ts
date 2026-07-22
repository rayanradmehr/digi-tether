import { Injectable } from '@nestjs/common';
import type { IEventPublisher } from './event-publisher.interface';
import type { AppEvent } from './app-event.interface';

/**
 * No-op (null) implementation of `IEventPublisher`.
 *
 * Used as the default provider until EventEmitter2 is wired in a later phase.
 * Keeps the application bootable in Phase 1 without an event bus dependency.
 *
 * Swap by rebinding `INJECTION_TOKENS.EVENT_PUBLISHER` in `SharedModule`.
 */
@Injectable()
export class NullEventPublisher implements IEventPublisher {
  public publish(_event: AppEvent): void {
    // no-op stub
  }

  public publishAll(_events: AppEvent[]): void {
    // no-op stub
  }
}
