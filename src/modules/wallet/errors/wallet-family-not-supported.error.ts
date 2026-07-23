/**
 * Thrown when an operation is attempted with an unsupported WalletFamily value.
 */
export class WalletFamilyNotSupportedError extends Error {
  public readonly family: string;

  public constructor(family: string) {
    super(`Wallet family not supported: ${family}`);
    this.name = 'WalletFamilyNotSupportedError';
    this.family = family;
    Object.setPrototypeOf(this, WalletFamilyNotSupportedError.prototype);
  }
}
