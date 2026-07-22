import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs every incoming HTTP request and its corresponding response time.
 *
 * Log format:
 * - Incoming: `[LoggingInterceptor] --> METHOD /path (requestId)`
 * - Outgoing: `[LoggingInterceptor] <-- METHOD /path (requestId) +Xms`
 *
 * The `requestId` is injected by `RequestIdMiddleware` into `req.id`.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { id?: string }>();
    const { method, url } = req;
    const requestId = req.id ?? 'n/a';
    const start = Date.now();

    this.logger.log(`--> ${method} ${url} (${requestId})`);

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(`<-- ${method} ${url} (${requestId}) +${ms}ms`);
      }),
    );
  }
}
