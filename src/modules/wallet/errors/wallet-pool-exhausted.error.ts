import type { WalletFamily } from '../enums/wallet-family.enum';

/**
 * Thrown when no AVAILABLE wallet exists for the requested driver family.
 */
export class WalletPoolExhaustedError extends Error {
  public readonly driverFamily: WalletFamily;

  public constructor(driverFamily: WalletFamily) {
    super(`Wallet pool exhausted for family: ${driverFamily}`);
    this.name = 'WalletPoolExhaustedError';
    this.driverFamily = driverFamily;
    Object.setPrototypeOf(this, WalletPoolExhaustedError.prototype);
  }
}
