/**
 * Typed envelope for all messages travelling through the async queue.
 *
 * Every message carries routing metadata alongside its payload so the
 * broker layer can route and dead-letter correctly without inspecting
 * the payload body.
 */
export interface QueueMessage<T = unknown> {
  /** Target exchange name. Use values from `QUEUE_EXCHANGE`. */
  readonly exchange: string;

  /** Routing key for the target queue. Use values from `QUEUE_ROUTING_KEY`. */
  readonly routingKey: string;

  /** Typed business payload. Must be JSON-serialisable. */
  readonly payload: T;

  /**
   * Optional correlation ID for distributed tracing.
   * Set this to the `requestId` from `RequestIdMiddleware` when available.
   */
  readonly correlationId?: string;

  /**
   * Optional ISO-8601 timestamp of when the message was created.
   * Defaults to `new Date().toISOString()` if not supplied.
   */
  readonly createdAt?: string;
}
