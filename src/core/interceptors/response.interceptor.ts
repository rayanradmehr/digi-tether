import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HTTP_MESSAGES } from '@common/constants/http.constants';
import type { ApiResponse } from '@common/types/api-response.type';

/**
 * Wraps every successful controller response in the canonical
 * `ApiResponse<T>` envelope so all 2xx responses have a consistent shape.
 *
 * Shape: `{ success: true, data: <original body>, message: 'Success' }`
 *
 * Controllers that need a custom message should return an object that already
 * conforms to `ApiResponse<T>` — this interceptor detects that and passes it
 * through untouched.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  public intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: T): ApiResponse<T> => {
        // If the controller already returned a wrapped response, pass through.
        if (this.isWrapped(data)) {
          return data as unknown as ApiResponse<T>;
        }
        return {
          success: true,
          data,
          message: HTTP_MESSAGES.OK,
        };
      }),
    );
  }

  private isWrapped(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'success' in data &&
      'data' in data &&
      'message' in data
    );
  }
}
