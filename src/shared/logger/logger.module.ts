import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '../tokens/injection-tokens';
import { AppLoggerService } from './logger.service';

/**
 * Registers `AppLoggerService` globally under `INJECTION_TOKENS.LOGGER`.
 *
 * useFactory instead of useClass — AppLoggerService accepts an optional
 * `context?: string` constructor param which NestJS DI would try to resolve
 * as a String provider and fail with UnknownDependenciesException.
 * useFactory bypasses DI for constructor args and instantiates directly.
 */
@Global()
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.LOGGER,
      useFactory: () => new AppLoggerService(),
    },
  ],
  exports: [INJECTION_TOKENS.LOGGER],
})
export class LoggerModule {}
