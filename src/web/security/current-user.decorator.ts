import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UnauthorizedError } from '../../business/domain/errors/errors';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.guard';

/**
 * The authenticated user, as attached by `AuthGuard`.
 *
 * Throws rather than returning undefined when it's missing: reaching a handler
 * without a user means the guard was skipped, and quietly handing back
 * `undefined` there would turn an auth bug into a data leak.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedError();
    return field ? request.user[field] : request.user;
  },
);

/** Shorthand for the common `@CurrentUser('id') userId: string`. */
export const UserId = () => CurrentUser('id');
