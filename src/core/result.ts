/**
 * Framework-independent Result type used by the domain/application layer to
 * represent success/failure without throwing exceptions for expected
 * business-rule failures (Architecture-Rules: Business Logic is framework
 * independent; No Global State).
 *
 * Controllers/DTO mappers translate a `Result` into the appropriate HTTP
 * response and OpenAPI-documented error shape — the domain itself never
 * knows about HTTP.
 */
export class Result<T, E = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  public static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  public static fail<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public get isSuccess(): boolean {
    return this._isSuccess;
  }

  public get isFailure(): boolean {
    return !this._isSuccess;
  }

  public get value(): T {
    if (!this._isSuccess || this._value === undefined) {
      throw new Error('Cannot access value of a failed Result.');
    }
    return this._value;
  }

  public get error(): E {
    if (this._isSuccess || this._error === undefined) {
      throw new Error('Cannot access error of a successful Result.');
    }
    return this._error;
  }
}
