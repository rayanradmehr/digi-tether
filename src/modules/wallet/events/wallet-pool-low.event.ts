import type { WalletFamily } from '../enums/wallet-family.enum';

export const WALLET_POOL_LOW = 'wallet.pool.low' as const;

export class WalletPoolLowEvent {
  public readonly type = WALLET_POOL_LOW;
  public readonly timestamp: Date;
  public readonly driverFamily: WalletFamily;
  public readonly availableCount: number;
  public readonly threshold: number;
  public readonly detectedAt: string;

  public constructor(payload: {
    driverFamily: WalletFamily;
    availableCount: number;
    threshold: number;
    detectedAt: string;
  }) {
    this.timestamp = new Date();
    this.driverFamily = payload.driverFamily;
    this.availableCount = payload.availableCount;
    this.threshold = payload.threshold;
    this.detectedAt = payload.detectedAt;
  }
}
