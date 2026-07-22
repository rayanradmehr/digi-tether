// AppLoggerService — structured logger wrapping NestJS LoggerService
// Outputs JSON in production, human-readable in development
// Every log entry carries: timestamp, level, context, correlationId, message
