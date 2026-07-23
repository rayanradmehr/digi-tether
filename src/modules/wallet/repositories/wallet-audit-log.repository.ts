import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletAuditAction } from '../enums/wallet-audit-action.enum';

/**
 * Append-only audit log entry for a wallet lifecycle event.
 */
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
  // Note: In production, inject a WalletAuditLogEntity repository here.
  // For now we accept the DataSource and write raw SQL to avoid requiring
  // the entity to be registered upfront.
  public constructor() {}

  /**
   * Appends a single audit log entry.
   * Failures are swallowed by the caller (WalletService) — they must never
   * roll back the parent business transaction.
   */
  public async append(_entry: WalletAuditLogEntry): Promise<void> {
    // TODO: persist to wallet_audit_logs table when entity is wired up.
    // For now this is a no-op placeholder so the service compiles and runs.
  }
}
