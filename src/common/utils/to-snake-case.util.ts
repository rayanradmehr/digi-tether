/**
 * Converts a camelCase or PascalCase string to snake_case.
 *
 * Examples:
 * - `'camelCase'` → `'camel_case'`
 * - `'PascalCase'` → `'pascal_case'`
 * - `'alreadySnake'` → `'already_snake'`
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
