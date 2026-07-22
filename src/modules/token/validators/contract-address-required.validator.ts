import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { TokenType } from '../enums/token-type.enum';

/** Zero address forbidden for EVM networks. */
const EVM_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Zero address forbidden for Tron networks (Base58Check representation). */
const TRON_ZERO_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

/** EVM contract address pattern: 0x-prefixed 40 hex chars (20 bytes). */
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/** Tron Base58Check address pattern: starts with T, 34 chars. */
const TRON_BASE58_REGEX = /^T[A-HJ-NP-Z1-9]{33}$/;

/** Tron hex address pattern: 41-prefixed 42 hex chars. */
const TRON_HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

/**
 * Cross-field validator that enforces the contractAddress ↔ type invariant.
 *
 * Rules:
 * - `type = native`   → contractAddress must be absent or null.
 *                       Empty string and zero addresses are explicitly rejected.
 * - `type = contract` → contractAddress must be present, non-empty, and
 *                       pass format validation (EVM or Tron pattern).
 *
 * This validator is applied to the `contractAddress` field on `CreateTokenDto`.
 * It reads the sibling `type` field from the same DTO object.
 *
 * Never queries the database — format validation only.
 */
@ValidatorConstraint({ name: 'ContractAddressRequired', async: false })
export class ContractAddressRequiredConstraint
  implements ValidatorConstraintInterface
{
  public validate(
    contractAddress: unknown,
    args: ValidationArguments,
  ): boolean {
    const object = args.object as Record<string, unknown>;
    const type = object['type'] as TokenType | undefined;

    if (type === TokenType.NATIVE) {
      return contractAddress === null || contractAddress === undefined;
    }

    if (type === TokenType.CONTRACT) {
      if (
        contractAddress === null ||
        contractAddress === undefined ||
        contractAddress === ''
      ) {
        return false;
      }

      const address = contractAddress as string;

      if (
        address === EVM_ZERO_ADDRESS ||
        address === TRON_ZERO_ADDRESS
      ) {
        return false;
      }

      return (
        EVM_ADDRESS_REGEX.test(address) ||
        TRON_BASE58_REGEX.test(address) ||
        TRON_HEX_REGEX.test(address)
      );
    }

    return true;
  }

  public defaultMessage(args: ValidationArguments): string {
    const object = args.object as Record<string, unknown>;
    const type = object['type'] as TokenType | undefined;

    if (type === TokenType.NATIVE) {
      return 'contractAddress must be null for native tokens. Empty string and zero address are forbidden.';
    }

    return (
      'contractAddress is required for contract tokens and must be a valid ' +
      'EVM address (0x-prefixed 40 hex chars) or Tron address ' +
      '(Base58Check starting with T, or 41-prefixed hex). ' +
      'Empty string and zero addresses are forbidden.'
    );
  }
}

/**
 * Decorator that applies `ContractAddressRequiredConstraint` to a class field.
 *
 * Usage on `CreateTokenDto.contractAddress`:
 * ```ts
 * @ContractAddressRequired()
 * public contractAddress!: string | null;
 * ```
 */
export function ContractAddressRequired(
  options?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options,
      constraints: [],
      validator: ContractAddressRequiredConstraint,
    });
  };
}
