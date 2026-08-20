import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '../../../auth/jwt.service';
import { TokenGenerator } from '../../../auth/token-generator';
import { User } from '../../domain/entities/user';
import {
  InvalidTokenError,
  UnauthorizedError,
} from '../../domain/errors/errors';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import type { UserRepository } from '../../repositories/user.repository';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  /** Row id of the stored token, so a rotation can point at its successor. */
  refreshTokenId: string;
}

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
}

/**
 * How long after a rotation the old token still counts as a race rather than
 * a replay. Two tabs, a reload landing on an in-flight refresh, or a phone
 * restoring a backgrounded page all present the same cookie at nearly the
 * same moment; treating that as theft logged real people out of every device
 * they owned. Genuine replay attacks do not arrive inside a minute of the
 * legitimate rotation.
 */
const REUSE_GRACE_MS = 60_000;

/**
 * Issues and rotates sessions.
 *
 * Refresh tokens rotate on every use and are stored hashed. Presenting a token
 * that was rotated a while ago means someone is replaying a stolen copy, so
 * the entire family is revoked rather than just that token — the legitimate
 * user gets logged out too, which is the correct trade when a token has leaked
 * (technical design §3.1). Inside `REUSE_GRACE_MS` of the rotation it is read
 * as the race it almost always is, and the session survives.
 *
 * Every rotation issues a fresh full-length token, so the 30 day window
 * slides: someone who keeps using the app is never asked to sign in again.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly jwt: JwtService,
    private readonly tokens: TokenGenerator,
  ) {}

  async issue(
    user: User,
    context: SessionContext,
    familyId?: string,
  ): Promise<IssuedSession> {
    const { token: accessToken, expiresIn } = this.jwt.signAccessToken({
      sub: user.id,
      email: user.email,
      ver: user.props.tokenVersion,
    });

    const refreshToken = this.tokens.generate();
    const refreshExpiresAt = new Date(
      this.clock.now().getTime() +
        this.jwt.refreshTtlDays() * 24 * 60 * 60 * 1000,
    );

    const stored = await this.refreshTokens.issue({
      userId: user.id,
      familyId: familyId ?? randomUUID(),
      tokenHash: this.tokens.hash(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: context.userAgent,
      ip: context.ip,
    });

    return {
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresAt,
      refreshTokenId: stored.id,
    };
  }

  async rotate(
    presented: string,
    context: SessionContext,
  ): Promise<IssuedSession> {
    const now = this.clock.now();
    const stored = await this.refreshTokens.findByHash(
      this.tokens.hash(presented),
    );
    if (!stored) throw new InvalidTokenError('That session is no longer valid');

    if (stored.revokedAt) {
      const sinceRotation = now.getTime() - stored.revokedAt.getTime();
      if (sinceRotation > REUSE_GRACE_MS) {
        // Rotated long ago and presented again: a replay. Burn the family.
        this.logger.warn(
          `Refresh token reuse detected for user ${stored.userId}; revoking family`,
        );
        await this.refreshTokens.revokeFamily(stored.familyId, now);
        throw new UnauthorizedError(
          'That session was ended for security reasons',
        );
      }

      // A race between two tabs, not a theft: hand this one its own token
      // and leave the family standing.
      const raced = await this.users.findById(stored.userId);
      if (!raced || !raced.canLogin()) throw new UnauthorizedError();
      return this.issue(raced, context, stored.familyId);
    }

    if (stored.expiresAt < now)
      throw new InvalidTokenError('That session has expired');

    const user = await this.users.findById(stored.userId);
    if (!user || !user.canLogin()) throw new UnauthorizedError();

    const next = await this.issue(user, context, stored.familyId);
    await this.refreshTokens.rotate(stored.id, next.refreshTokenId, now);
    return next;
  }

  async revoke(presented: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(
      this.tokens.hash(presented),
    );
    if (stored)
      await this.refreshTokens.revokeFamily(stored.familyId, this.clock.now());
  }
}
