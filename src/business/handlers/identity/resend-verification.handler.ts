import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenGenerator } from '../../../auth/token-generator';
import { NotFoundError } from '../../domain/errors/errors';
import { CLOCK, EMAIL } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { EmailPort } from '../../ports/email.port';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface ResendVerificationRequest {
  userId: string;
}

const VERIFICATION_TTL_HOURS = 24;

/**
 * A fresh confirmation email for a signed-in, still-unverified account.
 * Idempotent: an already-verified account gets a quiet ok and no email.
 */
@Injectable()
export class ResendVerificationHandler extends AbstractRequestHandlerTemplate<
  ResendVerificationRequest,
  { ok: true }
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EMAIL) private readonly email: EmailPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly tokens: TokenGenerator,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ResendVerificationRequest) {
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('Account');
    if (user.isVerified) return CommandResponse.of({ ok: true as const });

    const token = this.tokens.generate();
    user.setVerificationToken(
      this.tokens.hash(token),
      new Date(
        this.clock.now().getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
      ),
    );
    await this.users.save(user);

    await this.email
      .sendVerification({
        to: user.email,
        name: user.name,
        url: `${this.config.get('FRONTEND_URL')}/verify?token=${token}`,
      })
      .catch((error: Error) =>
        this.logger.error(
          `Verification resend failed for ${user.id}: ${error.message}`,
        ),
      );
    return CommandResponse.of({ ok: true as const });
  }
}
