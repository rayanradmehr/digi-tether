import type { WalletStatus } from '../enums/wallet-status.enum';

/**
 * Thrown when a state-machine transition is attempted from an invalid status.
 */
export class WalletInvalidStatusError extends Error {
  public readonly walletId: string;
  public readonly currentStatus: WalletStatus;

  public constructor(walletId: string, currentStatus: WalletStatus, message: string) {
    super(message);
    this.name = 'WalletInvalidStatusError';
    this.walletId = walletId;
    this.currentStatus = currentStatus;
    Object.setPrototypeOf(this, WalletInvalidStatusError.prototype);
  }
}
