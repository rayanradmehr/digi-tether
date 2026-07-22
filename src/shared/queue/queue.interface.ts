import type { QueueMessage } from '../types/queue-message.type';

/**
 * Contract for publishing messages to an async message broker.
 *
 * Every module depends on this interface, never on a concrete class.
 * The implementation (RabbitMQ, SQS, in-memory, …) is wired in
 * `SharedModule` and injected via `INJECTION_TOKENS.QUEUE_PUBLISHER`.
 */
export interface IQueuePublisher {
  /**
   * Fire-and-forget publish.
   * Does not wait for broker acknowledgement.
   *
   * @param message - Typed queue message envelope.
   */
  publish<T>(message: QueueMessage<T>): Promise<void>;

  /**
   * Publish with broker acknowledgement.
   * Resolves only after the broker confirms receipt.
   *
   * @param message - Typed queue message envelope.
   */
  publishWithConfirm<T>(message: QueueMessage<T>): Promise<void>;
}

/**
 * Contract for handling incoming queue messages.
 *
 * Feature modules implement this interface to register their own consumers.
 * Each consumer is scoped to a single logical queue / routing key.
 */
export interface IQueueConsumer<T = unknown> {
  /**
   * Processes a single incoming message.
   * Implementations must be idempotent where possible.
   *
   * @param message - Typed queue message envelope.
   */
  handle(message: QueueMessage<T>): Promise<void>;
}
