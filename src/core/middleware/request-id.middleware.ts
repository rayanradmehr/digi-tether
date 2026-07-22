import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { generateCorrelationId } from '@common/utils/correlation-id.util';

/** Header name clients can send to propagate a trace ID from upstream. */
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attaches a unique `requestId` to every incoming HTTP request.
 *
 * Strategy:
 * 1. Honour an existing `x-request-id` header (propagated by load-balancer
 *    or upstream service) to preserve distributed trace continuity.
 * 2. Otherwise generate a fresh UUID v4.
 *
 * The ID is stored on `req.id` (Express convention) and echoed back in the
 * `x-request-id` response header so clients can correlate log entries.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const existing = req.headers[REQUEST_ID_HEADER];
    const requestId = typeof existing === 'string' && existing.length > 0
      ? existing
      : generateCorrelationId();

    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
