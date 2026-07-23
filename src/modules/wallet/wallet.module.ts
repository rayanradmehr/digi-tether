import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { WalletPoolConfigEntity } from './entities/wallet-pool-config.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { WALLET_REPOSITORY } from './repositories/wallet.repository.token';
import { WalletAuditLogRepository } from './repositories/wallet-audit-log.repository';
import { WALLET_AUDIT_LOG_REPOSITORY } from './repositories/wallet-audit-log.repository.token';
import { WalletService } from './services/wallet.service';
import { WalletController } from './controllers/wallet.controller';

/**
 * Wallet Module — the dependency root for all wallet lifecycle operations.
 *
 * ## Provider tokens
 * - `WALLET_REPOSITORY`          → WalletRepository
 * - `WALLET_AUDIT_LOG_REPOSITORY` → WalletAuditLogRepository
 *
 * WalletService injects both via custom tokens (@Inject), so the module
 * must register them with `provide/useClass` — not as plain class providers.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WalletPoolConfigEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [
    {
      provide: WALLET_REPOSITORY,
      useClass: WalletRepository,
    },
    {
      provide: WALLET_AUDIT_LOG_REPOSITORY,
      useClass: WalletAuditLogRepository,
    },
    WalletService,
  ],
  exports: [WalletService],
})
export class WalletModule {}
