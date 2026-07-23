import type { WalletFamily } from '../enums/wallet-family.enum';
import type { WalletStatus } from '../enums/wallet-status.enum';

export const WALLET_LOCKED = 'wallet.locked' as const;

export class WalletLockedEvent {
  public readonly type = WALLET_LOCKED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly driverFamily: WalletFamily;
  public readonly reason: string;
  public readonly previousStatus: WalletStatus;
  public readonly lockedAt: string;

  public constructor(payload: {
    walletId: string;
    driverFamily: WalletFamily;
    reason: string;
    previousStatus: WalletStatus;
    lockedAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.driverFamily = payload.driverFamily;
    this.reason = payload.reason;
    this.previousStatus = payload.previousStatus;
    this.lockedAt = payload.lockedAt;
  }
}
