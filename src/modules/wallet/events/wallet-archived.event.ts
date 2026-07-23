import type { WalletFamily } from '../enums/wallet-family.enum';

export const WALLET_ARCHIVED = 'wallet.archived' as const;

export class WalletArchivedEvent {
  public readonly type = WALLET_ARCHIVED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly driverFamily: WalletFamily;
  public readonly reason: string;
  public readonly archivedAt: string;

  public constructor(payload: {
    walletId: string;
    driverFamily: WalletFamily;
    reason: string;
    archivedAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.driverFamily = payload.driverFamily;
    this.reason = payload.reason;
    this.archivedAt = payload.archivedAt;
  }
}
