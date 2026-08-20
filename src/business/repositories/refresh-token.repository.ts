export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Set when the token was ROTATED; a logout revokes without a successor. */
  replacedById: string | null;
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

  /** A logout ends the whole family at once. */
  revokeFamily(familyId: string, now: Date): Promise<void>;

  /**
   * True when the family was deliberately ended (some member revoked with
   * no successor, which only a logout produces). An old rotated cookie
   * may resurrect a living family, never a logged-out one.
   */
  familyEnded(familyId: string): Promise<boolean>;

  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
