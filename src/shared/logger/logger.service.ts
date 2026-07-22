import { Injectable, Logger } from '@nestjs/common';
import type { ILogger } from './logger.interface';

/**
 * Default implementation of `ILogger` backed by NestJS's built-in `Logger`.
 *
 * Registered as `INJECTION_TOKENS.LOGGER` in `SharedModule`.
 * Modules that need structured logging inject `ILogger` via that token;
 * they never reference this concrete class directly.
 */
@Injectable()
export class AppLoggerService implements ILogger {
  private readonly logger: Logger;

  public constructor(context?: string) {
    this.logger = new Logger(context ?? AppLoggerService.name);
  }

  public verbose(message: string, context?: string): void {
    this.logger.verbose(message, context);
  }

  public debug(message: string, context?: string): void {
    this.logger.debug(message, context);
  }

  public log(message: string, context?: string): void {
    this.logger.log(message, context);
  }

  public warn(message: string, context?: string): void {
    this.logger.warn(message, context);
  }

  public error(message: string, trace?: string | Error, context?: string): void {
    const traceStr =
      trace instanceof Error ? trace.stack ?? trace.message : trace;
    this.logger.error(message, traceStr, context);
  }
}
