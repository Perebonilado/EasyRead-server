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
 * Issues and rotates sessions.
 *
 * Refresh tokens rotate on every use and are stored hashed, and every
 * rotation issues a fresh full-length token, so the 30 day window slides:
 * someone who keeps using the app is never asked to sign in again.
 *
 * Reuse of an already-rotated token is treated as the mundane thing it
 * almost always is, not as theft. A phone freezes the page at any moment,
 * including between the server committing a rotation and the browser
 * saving the new cookie; when the tab thaws days later it presents the old
 * one. Burning the family for that logged real people out of every device
 * they owned (and did, repeatedly, on mobile). So: any unexpired member of
 * a family signs you in, reuse is logged for visibility, and a family dies
 * only by logging out or by thirty days of silence. EasyRead is a reading
 * app; per the product's own security posture, keeping readers signed in
 * beats punishing a stolen-cookie scenario nobody is likely to run.
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
      // Revoked WITHOUT a successor means a logout: the reader chose to
      // end this session, and it stays ended. The same goes for any older
      // cookie from a family that was later logged out.
      if (
        !stored.replacedById ||
        (await this.refreshTokens.familyEnded(stored.familyId))
      ) {
        throw new InvalidTokenError('That session is no longer valid');
      }
      // An already-rotated token, presented again: a second tab racing the
      // first, or a thawed phone that never saw the newer cookie. Hand it
      // its own fresh token in the same family and log it for visibility.
      this.logger.log(
        `Rotated refresh token reused for user ${stored.userId}; issuing a fresh one`,
      );
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
