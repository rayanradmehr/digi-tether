/**
 * Base interface all in-process event classes must extend.
 * Enforces a consistent shape across the event bus.
 */
export interface AppEvent {
  /** Dot-notation event type identifier. Example: 'user.created' */
  readonly type: string;
  /** UTC timestamp of when the event was created */
  readonly timestamp: Date;
}

/**
 * Helper to build a typed event payload.
 * Usage: createEvent('user.created', { id: '123', email: 'a@b.com' })
 */
export function createEvent<T extends Record<string, unknown>>(
  type: string,
  payload: T,
): AppEvent & T {
  return {
    type,
    timestamp: new Date(),
    ...payload,
  };
}
