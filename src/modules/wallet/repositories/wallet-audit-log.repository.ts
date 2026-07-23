import { Injectable } from '@nestjs/common';
import type { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletAuditAction } from '../enums/wallet-audit-action.enum';

export interface WalletAuditLogEntry {
  walletId: string;
  action: WalletAuditAction;
  previousStatus: WalletStatus | null;
  newStatus: WalletStatus;
  actor: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only repository for wallet audit log entries.
 *
 * Rules:
 * - Never deletes rows.
 * - Never updates rows.
 * - Only appends.
 */
@Injectable()
export class WalletAuditLogRepository {
  public constructor() {}

  /**
   * Appends a single audit log entry.
   * Failures are swallowed by the caller (WalletService) — they must never
   * roll back the parent business transaction.
   */
  public async append(_entry: WalletAuditLogEntry): Promise<void> {
    // TODO: persist to wallet_audit_logs table when entity is wired up.
  }
}
