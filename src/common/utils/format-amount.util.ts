/**
 * Converts a raw integer amount (e.g. Wei, Satoshi) stored as a `bigint`
 * or numeric string into a human-readable decimal string.
 *
 * @param rawAmount - The integer amount as bigint or string of digits.
 * @param decimals  - Number of decimal places for the token (e.g. 18 for ETH).
 * @returns A decimal string such as `'1.500000000000000000'`.
 */
export function formatAmount(rawAmount: bigint | string, decimals: number): string {
  const value = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  const divisor = 10n ** BigInt(decimals);
  const intPart = value / divisor;
  const fracPart = value % divisor;
  const fracStr = fracPart.toString().padStart(decimals, '0');
  return `${intPart.toString()}.${fracStr}`;
}
