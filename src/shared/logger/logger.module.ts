import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { AppLoggerService } from './logger.service';

/**
 * Registers `AppLoggerService` globally under `INJECTION_TOKENS.LOGGER`.
 *
 * Mark as `@Global()` so every module can inject `ILogger` without
 * importing `LoggerModule` individually.
 */
@Global()
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.LOGGER,
      useClass: AppLoggerService,
    },
  ],
  exports: [INJECTION_TOKENS.LOGGER],
})
export class LoggerModule {}
