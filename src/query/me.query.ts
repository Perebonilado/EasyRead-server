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

  /** Plan, period, the study clock and the voice wallet, in one read (§3.4). */
  async subscription(userId: string): Promise<SubscriptionResponse> {
    const [record, entitlements] = await Promise.all([
      this.subscriptions.findOne({ where: { userId } as never }),
      this.entitlements.forUser(userId),
    ]);

    const limits = entitlements.limits;
    const limitSeconds =
      limits.studyMinutesPerDay === null
        ? null
        : limits.studyMinutesPerDay * 60;

    return {
      plan: entitlements.plan,
      status: record?.status ?? null,
      interval: record?.interval ?? null,
      currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
      provider: record?.provider ?? null,
      usage: { documentsThisMonth: entitlements.usage.documentsThisMonth },
      studyTime: {
        usedSeconds: entitlements.usage.studySecondsToday,
        limitSeconds,
        remainingSeconds: entitlements.remainingStudySeconds(),
      },
      voice: {
        remainingSeconds: entitlements.remainingVoiceSeconds(),
        allowanceSeconds:
          limits.voiceMinutesPerMonth === null
            ? null
            : limits.voiceMinutesPerMonth * 60,
        usedThisMonthSeconds: entitlements.usage.voiceSecondsThisMonth,
        creditSeconds: entitlements.usage.voiceCreditSeconds,
      },
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
          priceUsdMonthly: plan.priceUsdMonthly,
          priceUsdYearly: plan.priceUsdYearly,
          limits: {
            documentsPerMonth: plan.documentsPerMonth,
            studyMinutesPerDay: plan.studyMinutesPerDay,
            voiceMinutesPerMonth: plan.voiceMinutesPerMonth,
            watermarkedExports: plan.watermarkedExports,
          },
        };
      },
    );
  }
}
