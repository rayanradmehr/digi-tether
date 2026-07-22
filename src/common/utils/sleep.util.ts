/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Used in retry loops and back-off strategies.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
