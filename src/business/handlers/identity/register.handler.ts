import { Inject, Injectable } from '@nestjs/common';
import { frontendOrigin } from './frontend-origin';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../../../auth/password.service';
import { TokenGenerator } from '../../../auth/token-generator';
import { EmailInUseError } from '../../domain/errors/errors';
import { CLOCK, EMAIL, STARTER_LIBRARY } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { EmailPort } from '../../ports/email.port';
import type { StarterLibraryPort } from '../../ports/starter-library.port';
import {
  INSTITUTION_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type { UserRepository } from '../../repositories/user.repository';
import { admits } from '../../domain/institutions';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  /** Signed up through a school's own door: they belong to it from the start. */
  institutionSlug?: string;
  departmentId?: string;
  levelId?: string;
}

const VERIFICATION_TTL_HOURS = 24;

@Injectable()
export class RegisterHandler extends AbstractRequestHandlerTemplate<
  RegisterRequest,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
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

    // Through a school's door: a member from the first moment, placed in
    // the department and level they chose. A school that admits by email
    // domain refuses the rest; nothing else stands in the way.
    if (cmd.institutionSlug) {
      const school = await this.institutions.findBySlug(
        cmd.institutionSlug.toLowerCase(),
      );
      if (
        school &&
        admits(
          { inviteCode: null, emailDomains: school.emailDomains },
          { email, code: null },
        )
      ) {
        const department = cmd.departmentId
          ? await this.institutions.findDepartment(cmd.departmentId)
          : null;
        const level = cmd.levelId
          ? await this.institutions.findLevel(cmd.levelId)
          : null;
        await this.institutions.join({
          userId: user.id,
          institutionId: school.id,
          departmentId:
            department && department.institutionId === school.id
              ? department.id
              : null,
          levelId: level && level.institutionId === school.id ? level.id : null,
        });
      }
    }

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
        url: `${frontendOrigin(this.config)}/verify?token=${token}`,
      })
      .catch((error: Error) =>
        this.logger.error(
          `Verification email failed for ${user.id}: ${error.message}`,
        ),
      );

    return CommandResponse.empty();
  }
}
