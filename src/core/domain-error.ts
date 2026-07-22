/**
 * Base class for all domain-level errors.
 *
 * Kept inside `core/` (not `common/`) because it belongs to the business/
 * domain vocabulary, not to NestJS-specific cross-cutting concerns. Modules
 * extend this to define their own domain errors (e.g. `WalletNotFoundError`)
 * without any dependency on `@nestjs/common` or HTTP status codes.
 */
export abstract class DomainError extends Error {
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
