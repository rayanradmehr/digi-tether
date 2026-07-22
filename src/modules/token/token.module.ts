import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { TokenRepository } from './repositories/token.repository';
import { TokenMapper } from './mappers/token.mapper';
import { TokenService } from './services/token.service';
import { TokenController } from './controllers/token.controller';
import { NetworkModule } from '@modules/network/network.module';

/**
 * Token Module — the second tier in the platform dependency chain.
 *
 * ## Wired providers
 * | Layer       | Class             | Exported |
 * |-------------|-------------------|----------|
 * | Persistence | `TokenRepository` | No       |
 * | Mapping     | `TokenMapper`     | No       |
 * | Business    | `TokenService`    | Yes      |
 * | HTTP        | `TokenController` | No       |
 *
 * ## Routes exposed
 * | Method | Path                            | Handler             |
 * |--------|---------------------------------|---------------------|
 * | POST   | /tokens                         | create              |
 * | GET    | /tokens                         | findAll             |
 * | GET    | /tokens/network/:networkId      | findByNetworkId     |
 * | GET    | /tokens/:id                     | findById            |
 * | PATCH  | /tokens/:id                     | update              |
 * | PATCH  | /tokens/:id/enable              | enable              |
 * | PATCH  | /tokens/:id/disable             | disable             |
 * | PATCH  | /tokens/:id/deprecate           | deprecate           |
 * | DELETE | /tokens/:id                     | remove (soft-delete)|
 *
 * ## Module boundary rule
 * Only `TokenService` is exported. Downstream modules (Wallet, Deposit,
 * Withdrawal, Sweep, Signer) import `TokenModule` and inject `TokenService`.
 * They MUST NEVER access `TokenRepository` or `TokenMapper` directly,
 * or issue queries against the `tokens` table themselves.
 *
 * ## Dependency rule
 * This module imports `NetworkModule` and injects `NetworkService`.
 * It must never import Wallet, Deposit, Withdrawal, Sweep, Broadcast,
 * or Signer modules (no circular dependency path is permitted).
 *
 * ## Usage
 * ```ts
 * // app.module.ts or a feature module
 * @Module({ imports: [TokenModule] })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    NetworkModule,
  ],
  controllers: [TokenController],
  providers: [TokenRepository, TokenMapper, TokenService],
  exports: [TokenService],
})
export class TokenModule {}
