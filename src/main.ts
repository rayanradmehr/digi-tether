import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from '@config/app-config.service';
import { setupSwagger } from '@config/swagger.config';
import { createGlobalValidationPipe } from '@core/pipes/global-validation.pipe';

/**
 * Application entrypoint.
 *
 * Responsibilities are intentionally limited to framework bootstrap concerns:
 * - creating the Nest application
 * - wiring global, cross-cutting HTTP concerns (security headers, filters,
 *   validation pipe)
 * - conditionally enabling API documentation
 *
 * No business logic may ever be placed here. Anything domain-related belongs
 * inside a module under `src/modules`.
 *
 * Global filter and interceptors are wired via `CoreModule` (APP_FILTER /
 * APP_INTERCEPTOR tokens) so they participate in the DI container and can
 * have services injected. The `ValidationPipe` is stateless and registered
 * here directly.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService);

  app.use(helmet());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  // Global validation pipe — whitelist, forbidNonWhitelisted, transform.
  app.useGlobalPipes(createGlobalValidationPipe());

  setupSwagger(app, config);

  await app.listen(config.port);
}

void bootstrap();
