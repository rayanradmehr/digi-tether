import { randomUUID } from 'crypto';

/**
 * Generates a UUID v4 string for use as a correlation / request ID.
 *
 * Uses Node.js built-in `crypto.randomUUID()` — no external dependency.
 */
export function generateCorrelationId(): string {
  return randomUUID();
}
