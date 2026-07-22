export const HTTP_MESSAGES = {
  OK: 'Success',
  CREATED: 'Resource created successfully',
  BAD_REQUEST: 'Invalid request data',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource already exists',
  UNPROCESSABLE: 'Validation failed',
  INTERNAL: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

export type HttpMessage = (typeof HTTP_MESSAGES)[keyof typeof HTTP_MESSAGES];
