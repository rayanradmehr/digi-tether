import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Network } from './entities/network.entity';
import { NetworkRepository } from './repositories/network.repository';
import { NetworkService } from './services/network.service';
import { NetworkController } from './controllers/network.controller';

/**
 * Network Module — the dependency root for all blockchain operations.
 *
 * ## What this module provides
 * - `NetworkService` — the single exported business-layer provider.
 *   Every downstream module (Token, Wallet, Deposit, …) injects this
 *   service to validate network existence and retrieve metadata.
 *
 * ## What this module does NOT provide
 * - RPC clients or blockchain SDK instances
 * - Driver implementations (those live in the Drivers layer)
 * - Wallet, Deposit, Withdrawal, or Sweep logic
 * - Queue publishers or consumers
 *
 * ## Module boundary rule
 * Only `NetworkService` is listed in `exports`.
 * `NetworkRepository` and the `Network` entity are internal — downstream
 * modules must never query the `networks` table directly.
 *
 * ## Import in AppModule
 * ```ts
 * // src/app.module.ts
 * imports: [ ..., NetworkModule ]
 * ```
 *
 * ## Usage in a downstream module
 * ```ts
 * // src/modules/token/token.module.ts
 * imports: [NetworkModule]
 * // then in TokenService:
 * constructor(private readonly networkService: NetworkService) {}
 * ```
 */
@Module({
  imports: [TypeOrmModule.forFeature([Network])],
  providers: [NetworkRepository, NetworkService],
  controllers: [NetworkController],
  exports: [NetworkService],
})
export class NetworkModule {}
