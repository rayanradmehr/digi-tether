import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { WalletPoolConfigEntity } from './entities/wallet-pool-config.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletService } from './services/wallet.service';
import { WalletController } from './controllers/wallet.controller';

/**
 * Wallet Module — the dependency root for all wallet lifecycle operations.
 *
 * ## Wired providers
 * | Layer       | Class                  | Token                    | Exported |
 * |-------------|------------------------|--------------------------|----------|
 * | Persistence | `WalletRepository`     | `WALLET_REPOSITORY`      | No       |
 * | Business    | `WalletService`        | —                        | Yes      |
 * | HTTP        | `WalletController`     | —                        | No       |
 *
 * ## TypeORM entities registered
 * - `WalletEntity`           — primary wallet table
 * - `WalletPoolConfigEntity` — per-family pool configuration table
 *
 * ## Routes exposed
 * | Method | Path                          | Handler           | Status |
 * |--------|-------------------------------|-------------------|--------|
 * | POST   | /wallets/assign               | assign            | 201    |
 * | GET    | /wallets                      | findAll           | 200    |
 * | GET    | /wallets/customer/:customerId | findAllByCustomer | 200    |
 * | GET    | /wallets/address/:address     | findByAddress     | 200    |
 * | GET    | /wallets/pool/:family         | getPoolStatus     | 200    |
 * | GET    | /wallets/:id                  | findById          | 200    |
 * | PATCH  | /wallets/:id/lock             | lock              | 200    |
 * | PATCH  | /wallets/:id/unlock           | unlock            | 200    |
 * | PATCH  | /wallets/:id/compromise       | compromise        | 200    |
 * | PATCH  | /wallets/:id/archive          | archive           | 200    |
 *
 * ## Module boundary rule
 * Only `WalletService` is exported. Downstream modules (SweepModule,
 * WithdrawalModule, DepositModule) import `WalletModule` and inject
 * `WalletService`. They MUST NEVER access `WalletRepository` directly
 * or issue queries against the `wallets` table themselves.
 *
 * ## Dependencies
 * - `TypeOrmModule.forFeature([WalletEntity, WalletPoolConfigEntity])`
 *   provides the TypeORM `Repository<WalletEntity>` and
 *   `Repository<WalletPoolConfigEntity>` tokens used by `WalletRepository`.
 * - `SharedModule` (imported globally via `AppModule`) provides
 *   `CACHE_MANAGER`, `EventEmitter2`, and the logger infrastructure.
 *   It does NOT need to be re-imported here.
 *
 * ## Usage
 * ```ts
 * // app.module.ts
 * @Module({ imports: [..., WalletModule] })
 * export class AppModule {}
 *
 * // SweepModule (example consumer)
 * @Module({ imports: [WalletModule] })
 * export class SweepModule {}
 * ```
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WalletPoolConfigEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletRepository, WalletService],
  exports: [WalletService],
})
export class WalletModule {}
