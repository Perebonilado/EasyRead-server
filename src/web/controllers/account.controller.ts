import { Body, Controller, Delete, Get, HttpCode, Patch } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type {
  LearnerProfileDto,
  PlanDto,
  SubscriptionResponse,
} from '../../contracts';
import { UpdateLearnerProfileHandler } from '../../business/handlers/documents/learning.handlers';
import { LEARNER_PROFILE_REPOSITORY } from '../../business/repositories/tokens';
import { Inject } from '@nestjs/common';
import {
  DEFAULT_LEARNER_PROFILE,
  type LearnerProfileRepository,
} from '../../business/repositories/learning.repository';
import { DeleteAccountHandler } from '../../business/handlers/identity/delete-account.handler';
import { MeQuery } from '../../query/me.query';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

class LearnerProfileDtoBody {
  @IsOptional()
  @IsIn(['slower', 'steady', 'faster'])
  pace?: LearnerProfileDto['pace'];

  @IsOptional()
  @IsIn(['lighter', 'standard', 'deeper'])
  depth?: LearnerProfileDto['depth'];

  @IsOptional()
  @IsIn(['less', 'standard', 'more'])
  interactivity?: LearnerProfileDto['interactivity'];

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}

@Controller()
export class AccountController {
  constructor(
    private readonly me: MeQuery,
    private readonly deleteAccount: DeleteAccountHandler,
    private readonly updateProfile: UpdateLearnerProfileHandler,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
  ) {}

  /** How this user learns — read into every lesson. */
  @Get('learner-profile')
  async learnerProfile(
    @CurrentUser('id') userId: string,
  ): Promise<LearnerProfileDto> {
    return (await this.profiles.find(userId)) ?? DEFAULT_LEARNER_PROFILE;
  }

  /** The adaptive loop's write channel — the tutor's tool lands here. */
  @Patch('learner-profile')
  async patchLearnerProfile(
    @CurrentUser('id') userId: string,
    @Body() body: LearnerProfileDtoBody,
  ): Promise<LearnerProfileDto> {
    const result = await this.updateProfile.handle({ userId, ...body });
    return result.data;
  }

  @Get('subscription')
  async subscription(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionResponse> {
    return this.me.subscription(userId);
  }

  /** Pricing is static, so the upgrade screen renders without a session. */
  @Public()
  @Get('plans')
  plans(): PlanDto[] {
    return this.me.plans();
  }

  @Delete('account')
  @HttpCode(204)
  async destroy(@CurrentUser('id') userId: string): Promise<void> {
    await this.deleteAccount.handle({ userId });
  }
}
