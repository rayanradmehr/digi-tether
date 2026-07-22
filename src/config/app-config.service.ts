import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './environment.schema';

/**
 * Strongly-typed facade over `@nestjs/config`.
 *
 * WHY a facade: consumers should never know that configuration comes from
 * environment variables at all — they depend on this interface-like service,
 * which could be backed by a secrets manager or vault in the future without
 * any consuming module changing a single line (Dependency Injection +
 * Modular Design rules).
 */
@Injectable()
export class AppConfigService {
  public constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {}

  public get nodeEnv(): EnvironmentVariables['NODE_ENV'] {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  public get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  public get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  public get swaggerEnabled(): boolean {
    // Swagger must be disabled/configurable in production per the API
    // documentation requirements. We only ever mount it when explicitly
    // enabled AND not running in production.
    return this.configService.get('SWAGGER_ENABLED', { infer: true }) && !this.isProduction;
  }

  public get swaggerPath(): string {
    return this.configService.get('SWAGGER_PATH', { infer: true });
  }

  public get database(): {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  } {
    return {
      host: this.configService.get('DATABASE_HOST', { infer: true }),
      port: this.configService.get('DATABASE_PORT', { infer: true }),
      user: this.configService.get('DATABASE_USER', { infer: true }),
      password: this.configService.get('DATABASE_PASSWORD', { infer: true }),
      name: this.configService.get('DATABASE_NAME', { infer: true }),
    };
  }

  public get rabbitMqUrl(): string {
    return this.configService.get('RABBITMQ_URL', { infer: true });
  }

  public get corsOrigins(): string[] {
    const raw = this.configService.get('CORS_ORIGINS', { infer: true });
    return raw.length > 0 ? raw.split(',').map((origin) => origin.trim()) : [];
  }
}
