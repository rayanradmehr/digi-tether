import { createEvent } from '@shared/events/app-event.interface';
import type { AppEvent } from '@shared/events/app-event.interface';
import type { WalletFamily } from '../enums/wallet-family.enum';

export const WALLET_CREATED = 'wallet.created' as const;

export type WalletCreatedEvent = AppEvent & {
  readonly walletId: string;
  readonly address: string;
  readonly driverFamily: WalletFamily;
  readonly createdByJobId: string;
  readonly signerVersion: string;
  readonly createdAt: string;
};

export class WalletCreatedEvent {
  public readonly type = WALLET_CREATED;
  public readonly timestamp: Date;
  public readonly walletId: string;
  public readonly address: string;
  public readonly driverFamily: WalletFamily;
  public readonly createdByJobId: string;
  public readonly signerVersion: string;
  public readonly createdAt: string;

  public constructor(payload: {
    walletId: string;
    address: string;
    driverFamily: WalletFamily;
    createdByJobId: string;
    signerVersion: string;
    createdAt: string;
  }) {
    this.timestamp = new Date();
    this.walletId = payload.walletId;
    this.address = payload.address;
    this.driverFamily = payload.driverFamily;
    this.createdByJobId = payload.createdByJobId;
    this.signerVersion = payload.signerVersion;
    this.createdAt = payload.createdAt;
  }
}
