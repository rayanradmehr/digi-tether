import type { IQueueConsumer } from './queue.interface';
import type { QueueMessage } from '../types/queue-message.type';

/**
 * Abstract base class for all queue message consumers.
 *
 * Feature modules extend this class, declare their payload type `T`,
 * and implement `handle()` with their processing logic.
 *
 * ```ts
 * @Injectable()
 * export class DepositCreatedConsumer extends BaseQueueConsumer<DepositCreatedPayload> {
 *   public async handle(message: QueueMessage<DepositCreatedPayload>): Promise<void> {
 *     // process message.payload
 *   }
 * }
 * ```
 */
export abstract class BaseQueueConsumer<T = unknown> implements IQueueConsumer<T> {
  public abstract handle(message: QueueMessage<T>): Promise<void>;
}
