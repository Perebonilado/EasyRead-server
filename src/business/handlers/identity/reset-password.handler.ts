import { Inject, Injectable } from '@nestjs/common';
import { PasswordService } from '../../../auth/password.service';
import { TokenGenerator } from '../../../auth/token-generator';
import {
  InvalidTokenError,
  TokenExpiredError,
} from '../../domain/errors/errors';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

@Injectable()
export class ResetPasswordHandler extends AbstractRequestHandlerTemplate<
  ResetPasswordRequest,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenGenerator,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: ResetPasswordRequest,
  ): Promise<CommandResponse<void>> {
    const user = await this.users.findByResetTokenHash(
      this.tokens.hash(cmd.token),
    );
    if (!user) throw new InvalidTokenError('That reset link is not valid');

    const now = this.clock.now();
    if (user.resetTokenIsExpired(now)) throw new TokenExpiredError();

    user.resetPassword(await this.passwords.hash(cmd.password));
    await this.users.save(user);

    // Whoever prompted the reset may already hold a session; end them all.
    await this.refreshTokens.revokeAllForUser(user.id, now);

    return CommandResponse.empty();
  }
}
