import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Network } from './entities/network.entity';
import { NetworkRepository } from './repositories/network.repository';
import { NetworkService } from './services/network.service';
import { NetworkController } from './controllers/network.controller';

/**
 * Network Module — the dependency root for all blockchain operations.
 *
 * Exports: `NetworkService` only.
 * All other providers (repository, entity) are internal.
 *
 * Downstream modules that need network data must import `NetworkModule`
 * and inject `NetworkService`. They must never access `NetworkRepository`
 * or query the `networks` table directly.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Network])],
  providers: [NetworkRepository, NetworkService],
  controllers: [NetworkController],
  exports: [NetworkService],
})
export class NetworkModule {}
