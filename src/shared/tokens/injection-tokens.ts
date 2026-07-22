/**
 * Central registry of all Dependency Injection token symbols used across
 * the shared infrastructure layer.
 *
 * Using `Symbol` (not strings) prevents accidental token collisions between
 * modules. Every token is documented with the interface it resolves to.
 *
 * Usage:
 * ```ts
 * @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger
 * ```
 */
export const INJECTION_TOKENS = {
  /** Resolves to `ILogger` — structured application logger. */
  LOGGER: Symbol('LOGGER'),

  /** Resolves to `ICache` — key/value cache store. */
  CACHE: Symbol('CACHE'),

  /** Resolves to `IQueuePublisher` — async message broker publisher. */
  QUEUE_PUBLISHER: Symbol('QUEUE_PUBLISHER'),

  /** Resolves to `IEventPublisher` — in-process domain event bus. */
  EVENT_PUBLISHER: Symbol('EVENT_PUBLISHER'),
} as const;

export type InjectionToken = (typeof INJECTION_TOKENS)[keyof typeof INJECTION_TOKENS];
