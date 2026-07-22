import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that a string represents a positive decimal number.
 *
 * Accepts: `'0.001'`, `'1'`, `'100.50'`
 * Rejects: `'-1'`, `'0'`, `'abc'`, `'1e5'` (scientific notation)
 *
 * Used for token amounts, fees and any financial quantity that must be
 * represented as a decimal string to avoid floating-point precision loss.
 */
@ValidatorConstraint({ name: 'isPositiveDecimal', async: false })
export class IsPositiveDecimalConstraint implements ValidatorConstraintInterface {
  /** Matches positive decimals: optional leading digits, optional dot + decimals */
  private static readonly DECIMAL_REGEX = /^(?!0+(?:\.0+)?$)\d+(?:\.\d+)?$/;

  public validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    if (!IsPositiveDecimalConstraint.DECIMAL_REGEX.test(value)) return false;
    return parseFloat(value) > 0;
  }

  public defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a positive decimal string (e.g. '0.001')`;
  }
}

/**
 * Decorator: validates the property value is a positive decimal string.
 */
export function IsPositiveDecimal(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options,
      constraints: [],
      validator: IsPositiveDecimalConstraint,
    });
  };
}
