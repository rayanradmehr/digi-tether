import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';

/**
 * Owns the single PostgreSQL connection (ADR-003) for the whole modular
 * monolith.
 *
 * WHY TypeORM configured here and not per-module: Architecture-Rules state
 * Repositories only access the database and modules must not duplicate
 * infrastructure wiring. Business modules will register their own entities
 * via `TypeOrmModule.forFeature([...])` inside their own module files, but
 * the connection itself — host, credentials, migration strategy — is owned
 * exclusively here.
 *
 * Phase 0 note: no entities are registered yet since no business module
 * exists. `autoLoadEntities` is left `false` on purpose so an empty entity
 * set does not silently hide configuration mistakes.
 */
@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres',
        host: config.database.host,
        port: config.database.port,
        username: config.database.user,
        password: config.database.password,
        database: config.database.name,
        entities: [],
        synchronize: false,
        migrationsRun: false,
        autoLoadEntities: false,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
