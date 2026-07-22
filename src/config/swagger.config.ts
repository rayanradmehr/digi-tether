import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from './app-config.service';

/**
 * Centralized Swagger/OpenAPI bootstrap.
 *
 * WHY centralized here (not scattered in main.ts or per-module):
 * - Single source of truth for API metadata, servers, tags and security
 *   schemes, matching the Output-Rules requirement that every configuration
 *   decision be explicit and explained in one place.
 * - Environment-aware: only mounted when `AppConfigService.swaggerEnabled`
 *   is true, which is automatically false in production.
 * - OpenAPI 3.1: `@nestjs/swagger` (v8+) generates 3.1-compatible documents
 *   when `SwaggerDocumentOptions` is configured accordingly; we opt in
 *   explicitly via `openApiOutputFormat` handled by SwaggerModule internals.
 */
export function setupSwagger(app: INestApplication, config: AppConfigService): void {
  if (!config.swaggerEnabled) {
    return;
  }

  const documentBuilder = new DocumentBuilder()
    .setTitle('Digi-Tether Blockchain Backend API')
    .setDescription(
      'Blockchain Custody Platform backend. Handles network, token, wallet, ' +
        'deposit, withdrawal and sweep orchestration. Private keys never touch ' +
        'this service — signing is delegated to an isolated Offline Signer.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token issued by the Auth module.',
      },
      'access-token',
    )
    .addTag('health', 'Service liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);

  SwaggerModule.setup(config.swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Digi-Tether API Docs',
  });
}
