/**
 * Thrown when a requested wallet does not exist or has been soft-deleted.
 */
export class WalletNotFoundError extends Error {
  public readonly walletId: string;

  public constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
    this.name = 'WalletNotFoundError';
    this.walletId = walletId;
    Object.setPrototypeOf(this, WalletNotFoundError.prototype);
  }
}
