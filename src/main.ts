import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from '@config/app-config.service';
import { setupSwagger } from '@config/swagger.config';
import { GlobalHttpExceptionFilter } from '@common/filters/global-http-exception.filter';

/**
 * Application entrypoint.
 *
 * Responsibilities are intentionally limited to framework bootstrap concerns:
 * - creating the Nest application
 * - wiring global, cross-cutting HTTP concerns (security headers, filters)
 * - conditionally enabling API documentation
 *
 * No business logic may ever be placed here. Anything domain-related belongs
 * inside a module under `src/modules`.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService);

  // helmet sets secure HTTP headers by default (CSP, HSTS, etc). This is a
  // baseline security control required for any public-facing exchange API.
  app.use(helmet());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  // Centralized exception handling ensures every error response, including
  // unexpected ones, follows the same documented error contract.
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Swagger is environment-aware: it is wired here, but the decision of
  // whether to actually mount it is made inside setupSwagger() based on
  // AppConfigService, keeping main.ts free of environment branching logic.
  setupSwagger(app, config);

  await app.listen(config.port);
}

void bootstrap();
