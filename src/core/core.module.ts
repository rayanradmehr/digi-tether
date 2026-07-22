import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalHttpExceptionFilter } from '@common/filters/global-http-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

/**
 * CoreModule wires all global cross-cutting providers:
 * - `RequestIdMiddleware` on every route
 * - `LoggingInterceptor` (global APP_INTERCEPTOR)
 * - `ResponseInterceptor` (global APP_INTERCEPTOR, runs after logging)
 * - `GlobalHttpExceptionFilter` (global APP_FILTER)
 *
 * Import this module once in `AppModule`. Do not import it anywhere else.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class CoreModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
