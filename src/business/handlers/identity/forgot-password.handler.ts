import { Inject, Injectable } from '@nestjs/common';
import { frontendOrigin } from './frontend-origin';
import { ConfigService } from '@nestjs/config';
import { TokenGenerator } from '../../../auth/token-generator';
import { CLOCK, EMAIL } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { EmailPort } from '../../ports/email.port';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface ForgotPasswordRequest {
  email: string;
}

const RESET_TTL_HOURS = 1;

@Injectable()
export class ForgotPasswordHandler extends AbstractRequestHandlerTemplate<
  ForgotPasswordRequest,
  void
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

  protected async handleRequest(
    cmd: ForgotPasswordRequest,
  ): Promise<CommandResponse<void>> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());

    // Always report success. Confirming which addresses exist would turn this
    // endpoint into an account-enumeration tool.
    if (!user || !user.canLogin()) return CommandResponse.empty();

    const token = this.tokens.generate();
    user.setResetToken(
      this.tokens.hash(token),
      new Date(this.clock.now().getTime() + RESET_TTL_HOURS * 60 * 60 * 1000),
    );
    await this.users.save(user);

    await this.email
      .sendPasswordReset({
        to: user.email,
        name: user.name,
        url: `${frontendOrigin(this.config)}/reset?state=form&token=${token}`,
      })
      .catch((error: Error) =>
        this.logger.error(
          `Reset email failed for ${user.id}: ${error.message}`,
        ),
      );

    return CommandResponse.empty();
  }
}
