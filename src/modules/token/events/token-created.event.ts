import { createEvent } from '@shared/events/app-event.interface';
import type { AppEvent } from '@shared/events/app-event.interface';
import type { TokenType } from '../enums/token-type.enum';
import type { TokenStandard } from '../enums/token-standard.enum';

/** Dot-notation event type identifier for token creation. */
export const TOKEN_CREATED = 'token.created' as const;

/**
 * Published immediately after a new token record is persisted.
 *
 * Consumers (future modules) may use this event to:
 * - Warm caches.
 * - Trigger downstream configuration setup.
 * - Audit trail logging.
 *
 * Must never be consumed within the Token Module itself.
 */
export type TokenCreatedEvent = AppEvent & {
  readonly tokenId: string;
  readonly networkId: string;
  readonly symbol: string;
  readonly type: TokenType;
  readonly standard: TokenStandard;
  readonly contractAddress: string | null;
};

/**
 * Factory function — constructs a fully typed `TokenCreatedEvent`.
 *
 * @param payload - Fields describing the newly created token.
 */
export function createTokenCreatedEvent(
  payload: Omit<TokenCreatedEvent, 'type' | 'timestamp'>,
): TokenCreatedEvent {
  return createEvent(TOKEN_CREATED, payload) as TokenCreatedEvent;
}
