export interface IEnvironment {
  // Application
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  APP_NAME: string;

  // Database
  DATABASE_URL: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;

  // RabbitMQ
  RABBITMQ_URL: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
}
