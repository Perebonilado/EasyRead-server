import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../../../auth/password.service';
import { TokenGenerator } from '../../../auth/token-generator';
import { EmailInUseError } from '../../domain/errors/errors';
import { CLOCK, EMAIL, STARTER_LIBRARY } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { EmailPort } from '../../ports/email.port';
import type { StarterLibraryPort } from '../../ports/starter-library.port';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

const VERIFICATION_TTL_HOURS = 24;

@Injectable()
export class RegisterHandler extends AbstractRequestHandlerTemplate<
  RegisterRequest,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EMAIL) private readonly email: EmailPort,
    @Inject(STARTER_LIBRARY) private readonly starter: StarterLibraryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenGenerator,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: RegisterRequest,
  ): Promise<CommandResponse<void>> {
    const email = cmd.email.trim().toLowerCase();
    if (await this.users.emailExists(email)) throw new EmailInUseError();

    const token = this.tokens.generate();
    const expires = new Date(
      this.clock.now().getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
    );

    const user = await this.users.create({
      email,
      name: cmd.name.trim(),
      passwordHash: await this.passwords.hash(cmd.password),
      googleId: null,
      emailVerifiedAt: null,
      verificationTokenHash: this.tokens.hash(token),
      verificationTokenExpires: expires,
    });

    // The starter document (onboarding): seeded in the background so the
    // library is ready by first login, and never allowed to fail a signup.
    void this.starter
      .copyToUser(user.id)
      .catch((error: Error) =>
        this.logger.error(
          `Starter seed failed for ${user.id}: ${error.message}`,
        ),
      );

    // Delivery failure must not lose the account — the user can resend.
    await this.email
      .sendVerification({
        to: user.email,
        name: user.name,
        url: `${this.config.get('FRONTEND_URL')}/verify?token=${token}`,
      })
      .catch((error: Error) =>
        this.logger.error(
          `Verification email failed for ${user.id}: ${error.message}`,
        ),
      );

    return CommandResponse.empty();
  }
}
