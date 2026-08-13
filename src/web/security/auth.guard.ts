import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/sequelize';
import type { Request } from 'express';
import { UnauthorizedError } from '../../business/domain/errors/errors';
import { JwtService, type AccessTokenClaims } from '../../auth/jwt.service';
import { UserModel } from '../database/models';
import { IS_PUBLIC } from './public.decorator';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Bearer-token gate, applied globally — endpoints opt *out* with `@Public()`
 * rather than opting in, so a new controller is protected by default.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectModel(UserModel) private readonly users: typeof UserModel,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedError();

    const claims: AccessTokenClaims = this.jwt.verifyAccessToken(token);

    // `tokenVersion` is bumped on password reset and account deletion, which
    // is what makes those actions invalidate live access tokens immediately
    // rather than waiting out the 15-minute TTL.
    const user = await this.users.findByPk(claims.sub);
    if (!user || user.deletedAt || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedError('Your session has expired');
    }

    request.user = { id: user.id, email: user.email };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer '))
      return header.slice('Bearer '.length).trim();

    // EventSource can't set headers, so the SSE endpoint passes the token as a
    // query parameter. Same verification either way.
    const query = request.query?.access_token;
    return typeof query === 'string' && query ? query : null;
  }
}
