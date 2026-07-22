/**
 * Splits `array` into sub-arrays of at most `size` elements.
 *
 * Example: `chunk([1,2,3,4,5], 2)` → `[[1,2],[3,4],[5]]`
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) throw new RangeError('chunk size must be >= 1');
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
