import { Inject, Injectable } from '@nestjs/common';
import { TokenGenerator } from '../../../auth/token-generator';
import {
  InvalidTokenError,
  TokenExpiredError,
} from '../../domain/errors/errors';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface VerifyEmailRequest {
  token: string;
}

@Injectable()
export class VerifyEmailHandler extends AbstractRequestHandlerTemplate<
  VerifyEmailRequest,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly tokens: TokenGenerator,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: VerifyEmailRequest,
  ): Promise<CommandResponse<void>> {
    const user = await this.users.findByVerificationTokenHash(
      this.tokens.hash(cmd.token),
    );
    if (!user)
      throw new InvalidTokenError('That verification link is not valid');

    const now = this.clock.now();
    if (user.verificationTokenIsExpired(now)) throw new TokenExpiredError();

    user.verifyEmail(now);
    await this.users.save(user);
    return CommandResponse.empty();
  }
}
