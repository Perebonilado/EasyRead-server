import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { MeResponse, PlanDto, SubscriptionResponse } from '../contracts';
import { PLAN_LIMITS } from '../business/domain/values';
import { EntitlementsService } from '../business/handlers/documents/entitlements.service';
import {
  InstitutionMemberModel,
  InstitutionModel,
  SubscriptionModel,
  UserModel,
} from '../web/database/models';
import { publicShape } from '../business/handlers/institutions/institution.handlers';
import { SchoolAccessService } from '../business/handlers/institutions/school-access.service';

@Injectable()
export class MeQuery {
  constructor(
    @InjectModel(UserModel) private readonly users: typeof UserModel,
    @InjectModel(SubscriptionModel)
    private readonly subscriptions: typeof SubscriptionModel,
    @InjectModel(InstitutionMemberModel)
    private readonly members: typeof InstitutionMemberModel,
    private readonly entitlements: EntitlementsService,
    private readonly schoolAccess: SchoolAccessService,
  ) {}

  async execute(userId: string): Promise<MeResponse> {
    const user = await this.users.findByPk(userId);
    if (!user) throw new NotFoundException('User not found');

    // The school they belong to, with its public shape, so the library can
    // show the catalogue and the onboarding can ask what is not yet known.
    const member = await this.members.findOne({
      where: { userId } as never,
      include: [InstitutionModel],
    });
    const school = member?.institution;
    // Where they stand with the school's library: the band and Settings
    // read it from here, so nothing on the client fetches on its own.
    const standing =
      member && school
        ? await this.schoolAccess.standing(userId, school.id)
        : null;
    const membership: MeResponse['membership'] =
      member && school
        ? {
            institution: {
              ...publicShape({
                id: school.id,
                name: school.name,
                slug: school.slug,
                country: school.country ?? null,
                levelWord: school.levelWord,
                needsInviteCode: school.inviteCode !== null,
                emailDomains: school.emailDomains ?? [],
                verifyStudents: school.verifyStudents === true,
                inviteCode: school.inviteCode ?? null,
                memberCount: 0,
                documentCount: 0,
              }),
              passFreeUntil: school.passFreeUntil?.toISOString() ?? null,
            },
            departmentId: member.departmentId ?? null,
            levelId: member.levelId ?? null,
            role: member.role,
            schoolEmail: member.schoolEmail ?? null,
            access: standing?.access,
            pass: standing?.pass?.status
              ? {
                  status: standing.pass.status,
                  currentPeriodEnd:
                    standing.pass.currentPeriodEnd?.toISOString() ?? null,
                  cancelAtPeriodEnd: standing.pass.cancelAtPeriodEnd,
                }
              : null,
          }
        : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.emailVerifiedAt),
      defaultLevel: user.defaultLevel,
      plan: await this.entitlements.planFor(userId),
      role: user.role ?? 'learner',
      membership,
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
