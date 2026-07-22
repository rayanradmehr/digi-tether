import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that a string is a well-formed ISO 4217 currency code.
 *
 * Accepts: exactly 3 uppercase ASCII letters (e.g. `'USD'`, `'EUR'`, `'IRR'`).
 * Does NOT validate against a live list of active codes — that check belongs
 * in the business layer where the set of supported currencies is known.
 */
@ValidatorConstraint({ name: 'isISOCurrencyCode', async: false })
export class IsISOCurrencyCodeConstraint implements ValidatorConstraintInterface {
  private static readonly ISO_REGEX = /^[A-Z]{3}$/;

  public validate(value: unknown, _args: ValidationArguments): boolean {
    return typeof value === 'string' && IsISOCurrencyCodeConstraint.ISO_REGEX.test(value);
  }

  public defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid ISO 4217 currency code (e.g. 'USD')`;
  }
}

/**
 * Decorator: validates the property is a valid ISO 4217 currency code.
 */
export function IsISOCurrencyCode(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options,
      constraints: [],
      validator: IsISOCurrencyCodeConstraint,
    });
  };
}
