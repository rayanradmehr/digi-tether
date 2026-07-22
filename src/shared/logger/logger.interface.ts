/**
 * Contract for the application-wide structured logger.
 *
 * Every module depends on this interface, never on a concrete class.
 * The implementation (NestJS Logger, Winston, Pino, …) is wired in
 * `CoreModule` and injected via `INJECTION_TOKENS.LOGGER`.
 *
 * Log levels follow the conventional severity ladder:
 * verbose < debug < log < warn < error
 */
export interface ILogger {
  /**
   * Emits a verbose trace message (highest verbosity, dev-only).
   * @param message - Human-readable description.
   * @param context - Calling class or scope name.
   */
  verbose(message: string, context?: string): void;

  /**
   * Emits a debug message for development diagnostics.
   * @param message - Human-readable description.
   * @param context - Calling class or scope name.
   */
  debug(message: string, context?: string): void;

  /**
   * Emits a standard informational log entry.
   * @param message - Human-readable description.
   * @param context - Calling class or scope name.
   */
  log(message: string, context?: string): void;

  /**
   * Emits a warning that does not interrupt execution.
   * @param message - Human-readable description.
   * @param context - Calling class or scope name.
   */
  warn(message: string, context?: string): void;

  /**
   * Emits an error entry. Supply the original `Error` object when available
   * so the stack trace is preserved in structured output.
   * @param message  - Human-readable description.
   * @param trace    - Stack trace string or `Error` instance.
   * @param context  - Calling class or scope name.
   */
  error(message: string, trace?: string | Error, context?: string): void;
}
