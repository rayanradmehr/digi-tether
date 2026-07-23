import type { WalletFamily } from '../enums/wallet-family.enum';

export const WALLET_COMPROMISED = 'wallet.compromised' as const;

export class WalletCompromisedEvent {
  public readonly type = WALLET_COMPROMISED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly address: string;
  public readonly driverFamily: WalletFamily;
  public readonly reason: string;
  public readonly compromisedAt: string;

  public constructor(payload: {
    walletId: string;
    address: string;
    driverFamily: WalletFamily;
    reason: string;
    compromisedAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.address = payload.address;
    this.driverFamily = payload.driverFamily;
    this.reason = payload.reason;
    this.compromisedAt = payload.compromisedAt;
  }
}
