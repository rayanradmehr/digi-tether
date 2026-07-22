import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '@common/types/app-user.type';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * Usage: `@CurrentUser() user: AppUser`
 *
 * The user object must be set on `req.user` by an authentication guard before
 * this decorator is evaluated. If no user is present `undefined` is returned;
 * a guard should prevent unauthenticated access before reaching the handler.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AppUser }>();
    return request.user;
  },
);
