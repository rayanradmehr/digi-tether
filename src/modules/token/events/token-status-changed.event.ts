import { createEvent } from '@shared/events/app-event.interface';
import type { AppEvent } from '@shared/events/app-event.interface';
import type { TokenStatus } from '../enums/token-status.enum';

/** Dot-notation event type identifier for token status transitions. */
export const TOKEN_STATUS_CHANGED = 'token.status.changed' as const;

/**
 * Published after any status transition on a token:
 *   ACTIVE → INACTIVE
 *   INACTIVE → ACTIVE
 *   ACTIVE → DEPRECATED
 *   INACTIVE → DEPRECATED
 *
 * Must never be published for DEPRECATED → * transitions (those are forbidden).
 */
export type TokenStatusChangedEvent = AppEvent & {
  readonly tokenId: string;
  readonly networkId: string;
  readonly symbol: string;
  readonly previousStatus: TokenStatus;
  readonly newStatus: TokenStatus;
};

/**
 * Factory function — constructs a fully typed `TokenStatusChangedEvent`.
 *
 * @param payload - Fields describing the status transition.
 */
export function createTokenStatusChangedEvent(
  payload: Omit<TokenStatusChangedEvent, 'type' | 'timestamp'>,
): TokenStatusChangedEvent {
  return createEvent(TOKEN_STATUS_CHANGED, payload) as TokenStatusChangedEvent;
}
