import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Network } from './entities/network.entity';
import { NetworkRepository } from './repositories/network.repository';
import { NetworkService } from './services/network.service';
import { NetworkController } from './controllers/network.controller';

/**
 * Network Module — the dependency root for all blockchain network operations.
 *
 * ## Wired providers (Step 4 — complete business + HTTP layer)
 * | Layer      | Class               | Exported |
 * |------------|---------------------|----------|
 * | Persistence| `NetworkRepository` | No       |
 * | Business   | `NetworkService`    | Yes      |
 * | HTTP       | `NetworkController` | No       |
 *
 * ## Routes exposed by this module
 * | Method | Path                        | Handler              |
 * |--------|-----------------------------|----------------------|
 * | POST   | /networks                   | create               |
 * | GET    | /networks                   | findAll              |
 * | GET    | /networks/:id               | findById             |
 * | GET    | /networks/slug/:slug        | findBySlug           |
 * | PATCH  | /networks/:id               | update               |
 * | PATCH  | /networks/:id/activate      | activate             |
 * | PATCH  | /networks/:id/deactivate    | deactivate           |
 * | DELETE | /networks/:id               | remove (soft-delete) |
 *
 * ## Module boundary rule
 * Only `NetworkService` is exported. Downstream modules (Token, Wallet,
 * Deposit, Withdrawal, Sweep, Signer) import `NetworkModule` and inject
 * `NetworkService`. They MUST NEVER access `NetworkRepository` directly
 * or issue queries against the `networks` table themselves.
 *
 * ## Usage
 * ```ts
 * // app.module.ts or a feature module
 * @Module({ imports: [NetworkModule] })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [TypeOrmModule.forFeature([Network])],
  controllers: [NetworkController],
  providers: [NetworkRepository, NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
