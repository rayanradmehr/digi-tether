import type { WalletFamily } from '../enums/wallet-family.enum';

export const WALLET_ASSIGNED = 'wallet.assigned' as const;

export class WalletAssignedEvent {
  public readonly type = WALLET_ASSIGNED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly address: string;
  public readonly driverFamily: WalletFamily;
  public readonly customerId: string;
  public readonly assignedAt: string;

  public constructor(payload: {
    walletId: string;
    address: string;
    driverFamily: WalletFamily;
    customerId: string;
    assignedAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.address = payload.address;
    this.driverFamily = payload.driverFamily;
    this.customerId = payload.customerId;
    this.assignedAt = payload.assignedAt;
  }
}
