import type { WalletFamily } from '../enums/wallet-family.enum';
import type { WalletStatus } from '../enums/wallet-status.enum';

export const WALLET_UNLOCKED = 'wallet.unlocked' as const;

export class WalletUnlockedEvent {
  public readonly type = WALLET_UNLOCKED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly driverFamily: WalletFamily;
  public readonly restoredStatus: WalletStatus;
  public readonly unlockedAt: string;

  public constructor(payload: {
    walletId: string;
    driverFamily: WalletFamily;
    restoredStatus: WalletStatus;
    unlockedAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.driverFamily = payload.driverFamily;
    this.restoredStatus = payload.restoredStatus;
    this.unlockedAt = payload.unlockedAt;
  }
}
