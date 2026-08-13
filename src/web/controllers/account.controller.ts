import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import type { PlanDto, SubscriptionResponse } from '../../contracts';
import { DeleteAccountHandler } from '../../business/handlers/identity/delete-account.handler';
import { MeQuery } from '../../query/me.query';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

@Controller()
export class AccountController {
  constructor(
    private readonly me: MeQuery,
    private readonly deleteAccount: DeleteAccountHandler,
  ) {}

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
