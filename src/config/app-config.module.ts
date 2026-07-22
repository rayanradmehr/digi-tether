import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { environmentSchema } from './environment.schema';
import { AppConfigService } from './app-config.service';

/**
 * Centralizes ALL environment/configuration concerns behind a single typed
 * service (`AppConfigService`). No other module or provider is allowed to
 * read `process.env` directly — this keeps configuration access consistent,
 * testable (the service can be mocked) and framework-independent from the
 * perspective of consuming modules.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config) => environmentSchema.parse(config),
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
