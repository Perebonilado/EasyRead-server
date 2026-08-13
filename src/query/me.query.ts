import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { MeResponse, PlanDto, SubscriptionResponse } from '../contracts';
import { PLAN_LIMITS } from '../business/domain/values';
import { EntitlementsService } from '../business/handlers/documents/entitlements.service';
import { SubscriptionModel, UserModel } from '../web/database/models';

@Injectable()
export class MeQuery {
  constructor(
    @InjectModel(UserModel) private readonly users: typeof UserModel,
    @InjectModel(SubscriptionModel)
    private readonly subscriptions: typeof SubscriptionModel,
    private readonly entitlements: EntitlementsService,
  ) {}

  async execute(userId: string): Promise<MeResponse> {
    const user = await this.users.findByPk(userId);
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.emailVerifiedAt),
      defaultLevel: user.defaultLevel,
      plan: await this.entitlements.planFor(userId),
    };
  }

  /** Plan, period and the three counters the usage meters render (§3.4). */
  async subscription(userId: string): Promise<SubscriptionResponse> {
    const [record, entitlements] = await Promise.all([
      this.subscriptions.findOne({ where: { userId } as never }),
      this.entitlements.forUser(userId),
    ]);

    return {
      plan: entitlements.plan,
      status: record?.status ?? null,
      currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
      usage: entitlements.usage,
    };
  }

  /** Static pricing table — no gateway call to render the upgrade screen. */
  plans(): PlanDto[] {
    return (Object.keys(PLAN_LIMITS) as (keyof typeof PLAN_LIMITS)[]).map(
      (code) => {
        // Effective, not nominal: with the testing switch on, the UI must not
        // draw a meter counting down to a limit the server no longer enforces.
        const plan = this.entitlements.effectiveLimits(code);
        return {
          code,
          name: plan.name,
          priceNgn: plan.priceNgn,
          limits: {
            documentsPerMonth: plan.documentsPerMonth,
            maxPages: plan.maxPages,
            easiestPerMonth: plan.easiestPerMonth,
            highlightsPerDay: plan.highlightsPerDay,
            watermarkedExports: plan.watermarkedExports,
          },
        };
      },
    );
  }
}
