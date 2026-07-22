import { z } from 'zod';

/**
 * Runtime schema for all environment variables the application depends on.
 *
 * WHY a schema instead of trusting `process.env` directly: "Never assume
 * defaults" (Output-Rules) and "No Global State" (Architecture-Rules) mean
 * configuration must be validated once, at boot, and injected — not read
 * ad-hoc from `process.env` throughout the codebase. If a required variable
 * is missing or malformed, the process must fail fast at startup rather than
 * fail unpredictably later inside business logic.
 */
export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  SWAGGER_ENABLED: z.coerce.boolean().default(true),
  SWAGGER_PATH: z.string().min(1).default('docs'),

  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_NAME: z.string().min(1),

  RABBITMQ_URL: z.string().url(),

  CORS_ORIGINS: z.string().default(''),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;
