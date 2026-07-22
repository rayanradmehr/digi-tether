import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that a string looks like a plausible blockchain address.
 *
 * Accepts:
 * - EVM-style hex addresses: `0x` followed by 40 hex characters (case-insensitive)
 * - Base58-encoded addresses: 25–62 alphanumeric characters excluding 0, O, I, l
 *
 * This is an intentionally broad format check. Checksum validation and
 * network-specific rules belong in the domain layer.
 */
@ValidatorConstraint({ name: 'isBlockchainAddress', async: false })
export class IsBlockchainAddressConstraint implements ValidatorConstraintInterface {
  private static readonly EVM_REGEX = /^0x[0-9a-fA-F]{40}$/;
  private static readonly BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{25,62}$/;

  public validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return (
      IsBlockchainAddressConstraint.EVM_REGEX.test(value) ||
      IsBlockchainAddressConstraint.BASE58_REGEX.test(value)
    );
  }

  public defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid blockchain address (EVM hex or Base58)`;
  }
}

/**
 * Decorator: validates the property value is a valid blockchain address.
 */
export function IsBlockchainAddress(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options,
      constraints: [],
      validator: IsBlockchainAddressConstraint,
    });
  };
}
