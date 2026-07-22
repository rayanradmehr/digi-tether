export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse extends ApiResponse<null> {
  success: false;
  data: null;
  statusCode: number;
  errors?: string[];
}
