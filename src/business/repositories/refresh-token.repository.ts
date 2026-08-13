export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRepository {
  issue(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }): Promise<StoredRefreshToken>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  /** Marks a token used and points it at its successor. */
  rotate(id: string, replacedById: string, now: Date): Promise<void>;

  /** Reuse of a rotated token means theft — kill the whole family (§3.1). */
  revokeFamily(familyId: string, now: Date): Promise<void>;

  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
