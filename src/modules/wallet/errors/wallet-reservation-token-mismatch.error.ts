/**
 * Thrown by WalletRepository.assignWallet() when the UPDATE affects 0 rows,
 * indicating the reservation token has expired or was already consumed.
 */
export class WalletReservationTokenMismatchError extends Error {
  public readonly walletId: string;

  public constructor(walletId: string) {
    super(
      `Reservation token mismatch for wallet '${walletId}'. ` +
      'The token may have expired or already been consumed.',
    );
    this.name = 'WalletReservationTokenMismatchError';
    this.walletId = walletId;
    Object.setPrototypeOf(this, WalletReservationTokenMismatchError.prototype);
  }
}
