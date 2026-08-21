import { Inject, Injectable } from '@nestjs/common';
import { PasswordService } from '../../../auth/password.service';
import {
  EmailUnverifiedError,
  InvalidCredentialsError,
} from '../../domain/errors/errors';
import { USER_REPOSITORY } from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import {
  SessionService,
  type IssuedSession,
  type SessionContext,
} from './session.service';

export interface LoginRequest extends SessionContext {
  email: string;
  password: string;
}

@Injectable()
export class LoginHandler extends AbstractRequestHandlerTemplate<
  LoginRequest,
  IssuedSession
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: LoginRequest,
  ): Promise<CommandResponse<IssuedSession>> {
    const user = await this.users.findByEmail(cmd.email.trim().toLowerCase());

    // Burn equivalent time when the account doesn't exist, so response timing
    // can't be used to discover which emails are registered.
    if (!user || !user.props.passwordHash) {
      await this.passwords.fakeCompare();
      throw new InvalidCredentialsError();
    }
    if (!user.canLogin()) throw new InvalidCredentialsError();
    if (
      !(await this.passwords.compare(cmd.password, user.props.passwordHash))
    ) {
      throw new InvalidCredentialsError();
    }
    // A ghost account never gets in: an email signup must confirm its
    // address before its first session. Only AFTER the password matched,
    // so this error never leaks which emails exist. Google accounts come
    // pre-verified by Google.
    if (!user.isVerified && !user.props.googleId) {
      throw new EmailUnverifiedError();
    }

    const session = await this.sessions.issue(user, {
      userAgent: cmd.userAgent,
      ip: cmd.ip,
    });
    return CommandResponse.of(session);
  }
}
