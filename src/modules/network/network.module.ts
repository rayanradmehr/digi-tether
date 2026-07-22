import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Network } from './entities/network.entity';
import { NetworkRepository } from './repositories/network.repository';
import { NetworkService } from './services/network.service';

/**
 * Network Module — the dependency root for all blockchain operations.
 *
 * ## Wired providers (Step 3)
 * | Provider            | Scope    | Exported |
 * |---------------------|----------|----------|
 * | `NetworkRepository` | Internal | No       |
 * | `NetworkService`    | Internal | Yes      |
 *
 * ## What is intentionally absent in this step
 * - `NetworkController` — wired in Step 4 (HTTP layer).
 * - Queue publishers — Phase 3+.
 * - Event publishers — Phase 3+.
 *
 * ## Module boundary rule
 * Only `NetworkService` is listed in `exports`.
 * Downstream modules (Token, Wallet, Deposit, …) import `NetworkModule`
 * and inject `NetworkService`. They must never access `NetworkRepository`
 * or query the `networks` table directly.
 *
 * ## Usage in a downstream module
 * ```ts
 * // downstream.module.ts
 * @Module({ imports: [NetworkModule] })
 * export class DownstreamModule {}
 *
 * // downstream.service.ts
 * constructor(private readonly networkService: NetworkService) {}
 * ```
 */
@Module({
  imports: [TypeOrmModule.forFeature([Network])],
  providers: [NetworkRepository, NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
