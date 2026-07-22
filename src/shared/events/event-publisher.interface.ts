import type { AppEvent } from './app-event.interface';

/**
 * Contract for publishing in-process domain events.
 *
 * Every module depends on this interface, never on a concrete class.
 * The implementation (EventEmitter2, RxJS Subject, …) is wired in
 * `SharedModule` and injected via `INJECTION_TOKENS.EVENT_PUBLISHER`.
 */
export interface IEventPublisher {
  /**
   * Publishes a single domain event to all registered listeners.
   *
   * @param event - A typed event object extending `AppEvent`.
   */
  publish(event: AppEvent): void;

  /**
   * Publishes multiple domain events in order.
   * Listeners receive them sequentially in the order supplied.
   *
   * @param events - Array of typed event objects.
   */
  publishAll(events: AppEvent[]): void;
}
