import type { WalletStatus } from '../enums/wallet-status.enum';

/**
 * Thrown when a transition is attempted on a wallet that is in a terminal
 * state (COMPROMISED or ARCHIVED).
 */
export class WalletTerminalStatusError extends Error {
  public readonly walletId: string;
  public readonly terminalStatus: WalletStatus;

  public constructor(walletId: string, terminalStatus: WalletStatus) {
    super(
      `Wallet '${walletId}' is in terminal state '${terminalStatus}'. No further transitions are permitted.`,
    );
    this.name = 'WalletTerminalStatusError';
    this.walletId = walletId;
    this.terminalStatus = terminalStatus;
    Object.setPrototypeOf(this, WalletTerminalStatusError.prototype);
  }
}
