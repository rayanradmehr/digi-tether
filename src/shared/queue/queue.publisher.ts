import { Injectable } from '@nestjs/common';
import type { IQueuePublisher } from './queue.interface';
import type { QueueMessage } from '../types/queue-message.type';

/**
 * No-op (null) implementation of `IQueuePublisher`.
 *
 * Used as the default provider until RabbitMQ is wired in a later phase.
 * Keeps the application bootable in Phase 1 without a broker connection.
 *
 * Swap by rebinding `INJECTION_TOKENS.QUEUE_PUBLISHER` in `SharedModule`.
 */
@Injectable()
export class NullQueuePublisher implements IQueuePublisher {
  public async publish<T>(_message: QueueMessage<T>): Promise<void> {
    // no-op stub
  }

  public async publishWithConfirm<T>(_message: QueueMessage<T>): Promise<void> {
    // no-op stub
  }
}
