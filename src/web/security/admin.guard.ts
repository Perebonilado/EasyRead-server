import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../business/domain/errors/errors';
import type { AuthenticatedRequest } from './auth.guard';

/**
 * The platform admin's gate: the person who runs the schools. Applied per
 * controller after the bearer gate has put the user on the request. A
 * learner reaching an admin route is refused outright, never told what is
 * behind it.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== 'admin') throw new ForbiddenError();
    return true;
  }
}
