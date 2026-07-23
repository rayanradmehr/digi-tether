import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignerJob } from './entities/signer-job.entity';
import { SignerJobRepository } from './repositories/signer-job.repository';
import { SignerJobService } from './services/signer-job.service';
import { SignerJobController } from './controllers/signer-job.controller';

/**
 * SignerJobModule — lifecycle owner for all signer job operations.
 *
 * ## Wired providers
 * | Layer       | Class                 | Exported |
 * |-------------|-----------------------|----------|
 * | Persistence | SignerJobRepository   | No       |
 * | Business    | SignerJobService      | Yes      |
 * | HTTP        | SignerJobController   | No       |
 *
 * ## TypeORM entities registered
 * - `SignerJob` — primary signer_jobs table
 *
 * ## Dependencies
 * - `TypeOrmModule.forFeature([SignerJob])` — provides Repository<SignerJob> token
 *   used by SignerJobRepository via @InjectRepository.
 * - `SharedModule` (global via AppModule) — provides INJECTION_TOKENS.LOGGER
 *   used by SignerJobService and SignerJobController.
 *
 * ## Module boundary rule
 * Only `SignerJobService` is exported. Downstream modules (Wallet, Withdrawal, Sweep)
 * import `SignerJobModule` and inject `SignerJobService`.
 * They MUST NEVER access `SignerJobRepository` directly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SignerJob]),
  ],
  controllers: [SignerJobController],
  providers: [SignerJobRepository, SignerJobService],
  exports: [SignerJobService],
})
export class SignerJobModule {}
