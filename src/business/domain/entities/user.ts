import type { Level } from '../../../contracts';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  name: string;
  emailVerifiedAt: Date | null;
  defaultLevel: Level;
  verificationTokenHash: string | null;
  verificationTokenExpires: Date | null;
  resetTokenHash: string | null;
  resetTokenExpires: Date | null;
  tokenVersion: number;
  deletedAt: Date | null;
  createdAt: Date;
}

/**
 * Business rules about an account live here rather than in the handlers, so
 * that two handlers doing the same thing can't disagree about the rules.
 */
export class User {
  constructor(readonly props: UserProps) {}

  get id() {
    return this.props.id;
  }
  get email() {
    return this.props.email;
  }
  get name() {
    return this.props.name;
  }
  get isDeleted() {
    return this.props.deletedAt !== null;
  }
  get isVerified() {
    return this.props.emailVerifiedAt !== null;
  }

  /**
   * An unverified account can still sign in — the PRD gates nothing on
   * verification, and locking people out of a document they just uploaded
   * would be hostile. Verification only gates outbound email trust.
   */
  canLogin(): boolean {
    return (
      !this.isDeleted &&
      (this.props.passwordHash !== null || this.props.googleId !== null)
    );
  }

  verificationTokenIsExpired(now: Date): boolean {
    return (
      !this.props.verificationTokenExpires ||
      this.props.verificationTokenExpires < now
    );
  }

  resetTokenIsExpired(now: Date): boolean {
    return !this.props.resetTokenExpires || this.props.resetTokenExpires < now;
  }

  /** Confirms the address and clears the one-time token. */
  verifyEmail(now: Date): void {
    this.props.emailVerifiedAt = now;
    this.props.verificationTokenHash = null;
    this.props.verificationTokenExpires = null;
  }

  /**
   * Sets a new password and clears the reset token. Bumping `tokenVersion`
   * invalidates every outstanding refresh token: a password reset should end
   * all other sessions, which is the whole point of resetting it.
   */
  resetPassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    this.props.resetTokenHash = null;
    this.props.resetTokenExpires = null;
    this.props.tokenVersion += 1;
  }

  setVerificationToken(hash: string, expires: Date): void {
    this.props.verificationTokenHash = hash;
    this.props.verificationTokenExpires = expires;
  }

  setResetToken(hash: string, expires: Date): void {
    this.props.resetTokenHash = hash;
    this.props.resetTokenExpires = expires;
  }

  /** Links a Google identity to an existing account matched by verified email. */
  linkGoogle(googleId: string, now: Date): void {
    this.props.googleId = googleId;
    if (!this.props.emailVerifiedAt) this.props.emailVerifiedAt = now;
  }

  rename(name: string): void {
    this.props.name = name;
  }

  setDefaultLevel(level: Level): void {
    this.props.defaultLevel = level;
  }

  /**
   * Soft delete. The purge job hard-deletes after 14 days; until then the row
   * stays so the account can be recovered (PRD §10).
   */
  softDelete(now: Date): void {
    this.props.deletedAt = now;
    this.props.tokenVersion += 1;
  }
}
