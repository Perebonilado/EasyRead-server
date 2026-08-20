/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories whose interface is Promise-shaped. */
import { SessionService } from './session.service';
import { TokenGenerator } from '../../../auth/token-generator';
import { User, type UserProps } from '../../domain/entities/user';
import type {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../../repositories/refresh-token.repository';
import type { UserRepository } from '../../repositories/user.repository';
import type { ClockPort } from '../../ports/clock.port';
import type { JwtService } from '../../../auth/jwt.service';

const REFRESH_TTL_DAYS = 30;

class FakeRefreshTokens implements RefreshTokenRepository {
  rows: StoredRefreshToken[] = [];
  private seq = 0;

  async issue(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }): Promise<StoredRefreshToken> {
    const row: StoredRefreshToken = {
      id: `t${++this.seq}`,
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.rows.push(row);
    return row;
  }

  async findByHash(tokenHash: string) {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  async rotate(id: string, _replacedById: string, now: Date) {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.revokedAt = now;
  }

  async revokeFamily(familyId: string, now: Date) {
    for (const row of this.rows) {
      if (row.familyId === familyId) row.revokedAt = now;
    }
  }

  async revokeAllForUser(userId: string, now: Date) {
    for (const row of this.rows) {
      if (row.userId === userId) row.revokedAt = now;
    }
  }

  live() {
    return this.rows.filter((r) => !r.revokedAt);
  }
}

const userProps = (): UserProps => ({
  id: 'u1',
  email: 'reader@easyread.test',
  passwordHash: 'hashed',
  googleId: null,
  name: 'Ada',
  emailVerifiedAt: null,
  defaultLevel: 'standard',
  verificationTokenHash: null,
  verificationTokenExpires: null,
  resetTokenHash: null,
  resetTokenExpires: null,
  tokenVersion: 0,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

describe('SessionService', () => {
  let refreshTokens: FakeRefreshTokens;
  let service: SessionService;
  let now: Date;

  const context = { userAgent: null, ip: null };
  const tick = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  beforeEach(() => {
    now = new Date('2026-08-20T12:00:00Z');
    refreshTokens = new FakeRefreshTokens();
    const users: Partial<UserRepository> = {
      findById: async () => new User(userProps()),
    };
    const clock: ClockPort = { now: () => now };
    const jwt: Partial<JwtService> = {
      signAccessToken: () => ({ token: 'access', expiresIn: 900 }),
      refreshTtlDays: () => REFRESH_TTL_DAYS,
    };
    service = new SessionService(
      refreshTokens,
      users as UserRepository,
      clock,
      jwt as JwtService,
      new TokenGenerator(),
    );
  });

  it('gives a signed-in reader a full month before they must sign in again', async () => {
    const session = await service.issue(new User(userProps()), context);
    const days =
      (session.refreshExpiresAt.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(REFRESH_TTL_DAYS);
  });

  it('slides that month forward on every use, so an active reader never falls out', async () => {
    const first = await service.issue(new User(userProps()), context);
    tick(20 * 86_400_000);
    const second = await service.rotate(first.refreshToken, context);
    const days =
      (second.refreshExpiresAt.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(REFRESH_TTL_DAYS);
  });

  it('survives two tabs refreshing at once instead of signing the reader out', async () => {
    const first = await service.issue(new User(userProps()), context);
    // The winning tab rotates.
    const winner = await service.rotate(first.refreshToken, context);
    // The other tab was already in flight with the same cookie.
    tick(1_000);
    const loser = await service.rotate(first.refreshToken, context);

    expect(loser.refreshToken).not.toBe(winner.refreshToken);
    expect(loser.accessToken).toBeTruthy();
    // Both tabs keep working: nothing in the family was revoked.
    expect(refreshTokens.live()).toHaveLength(2);
  });

  it('still burns the family when a rotated token comes back much later', async () => {
    const first = await service.issue(new User(userProps()), context);
    await service.rotate(first.refreshToken, context);
    tick(10 * 60_000);

    await expect(service.rotate(first.refreshToken, context)).rejects.toThrow(
      'security',
    );
    expect(refreshTokens.live()).toHaveLength(0);
  });

  it('refuses a token that has passed its own expiry', async () => {
    const first = await service.issue(new User(userProps()), context);
    tick((REFRESH_TTL_DAYS + 1) * 86_400_000);
    await expect(service.rotate(first.refreshToken, context)).rejects.toThrow(
      'expired',
    );
  });
});
