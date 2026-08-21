import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidCredentialsError,
  InvalidTokenError,
} from '../../domain/errors/errors';
import type { User } from '../../domain/entities/user';
import { CLOCK, GOOGLE_IDENTITY, STARTER_LIBRARY } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { GoogleIdentityPort } from '../../ports/google-identity.port';
import type { StarterLibraryPort } from '../../ports/starter-library.port';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import {
  SessionService,
  type IssuedSession,
  type SessionContext,
} from './session.service';

export interface GoogleLoginRequest extends SessionContext {
  credential: string;
}

/**
 * One button, three cases: a returning Google user signs straight in; an
 * existing email account gets the Google identity linked onto it (only on
 * an address Google itself has verified — an unverified claim to someone
 * else's email must never take over their account); a stranger gets an
 * account. Google vouched for the address either way, so the email
 * verification gate does not apply here.
 */
@Injectable()
export class GoogleLoginHandler extends AbstractRequestHandlerTemplate<
  GoogleLoginRequest,
  IssuedSession
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentityPort,
    @Inject(STARTER_LIBRARY) private readonly starter: StarterLibraryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly sessions: SessionService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: GoogleLoginRequest,
  ): Promise<CommandResponse<IssuedSession>> {
    const profile = await this.google.verify(cmd.credential);

    let user = await this.users.findByGoogleId(profile.googleId);

    if (!user) {
      if (!profile.emailVerified) {
        throw new InvalidTokenError(
          'This Google account has no verified email address',
        );
      }
      const existing = await this.users.findByEmail(profile.email);
      user = existing
        ? await this.link(existing, profile.googleId)
        : await this.createAccount(
            profile.email,
            profile.name,
            profile.googleId,
          );
    }

    if (!user.canLogin()) throw new InvalidCredentialsError();

    const session = await this.sessions.issue(user, {
      userAgent: cmd.userAgent,
      ip: cmd.ip,
    });
    return CommandResponse.of(session);
  }

  private async link(existing: User, googleId: string): Promise<User> {
    existing.linkGoogle(googleId, this.clock.now());
    await this.users.save(existing);
    return existing;
  }

  private async createAccount(
    email: string,
    name: string,
    googleId: string,
  ): Promise<User> {
    const user = await this.users.create({
      email,
      name,
      passwordHash: null,
      googleId,
      emailVerifiedAt: this.clock.now(),
      verificationTokenHash: null,
      verificationTokenExpires: null,
    });

    // Same onboarding as an email signup: seeded in the background and
    // never allowed to fail the sign-in.
    void this.starter
      .copyToUser(user.id)
      .catch((error: Error) =>
        this.logger.error(
          `Starter seed failed for ${user.id}: ${error.message}`,
        ),
      );

    return user;
  }
}
