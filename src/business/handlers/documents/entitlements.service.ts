import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlanCode } from '../../../contracts';
import { Entitlements } from '../../domain/entities/entitlements';
import {
  PLAN_LIMITS,
  UNLIMITED_LIMITS,
  UsageMetric,
  type PlanLimits,
} from '../../domain/values';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import {
  SUBSCRIPTION_REPOSITORY,
  USAGE_REPOSITORY,
} from '../../repositories/tokens';
import type {
  SubscriptionRepository,
  UsageRepository,
} from '../../repositories/billing.repository';

/**
 * Resolves what a user may do, and books the usage when they do it.
 *
 * Plan comes from our own `subscriptions` row rather than a call to the payment
 * provider — the technical design calls that out as the fix for AI Examiner,
 * where every permission check hit the gateway (§3.4). No row means Free.
 */
@Injectable()
export class EntitlementsService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementsService.name);

  /**
   * Testing switch: lifts every plan ceiling while leaving the plan itself
   * alone, so the app still reports "free" and the billing screens stay
   * honest. Off unless explicitly set, so it can't reach production by
   * omission — only by decision.
   */
  private get unlimited(): boolean {
    return this.config.get<string>('FREE_PLAN_UNLIMITED') === 'true';
  }

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.unlimited) {
      this.logger.warn(
        'FREE_PLAN_UNLIMITED=true — every plan limit is lifted. Testing only.',
      );
    }
  }

  monthKey(now = this.clock.now()): string {
    return now.toISOString().slice(0, 7); // YYYY-MM
  }

  dayKey(now = this.clock.now()): string {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  async planFor(userId: string): Promise<PlanCode> {
    const subscription = await this.subscriptions.findByUser(userId);
    if (!subscription) return 'free';
    // Only a live subscription grants Pro; cancelled/expired fall back to Free.
    const live =
      subscription.status === 'active' ||
      subscription.status === 'non_renewing';
    return live ? subscription.planCode : 'free';
  }

  /**
   * The limits actually in force for a plan, override included.
   *
   * The API advertises these on `/plans`, so the meters the UI draws and the
   * gates the server enforces are read from one source — otherwise the switch
   * below would silently leave the UI counting down to a limit that no longer
   * exists.
   */
  effectiveLimits(plan: PlanCode): PlanLimits {
    return {
      ...PLAN_LIMITS[plan],
      ...(this.unlimited ? UNLIMITED_LIMITS : {}),
    };
  }

  async forUser(userId: string): Promise<Entitlements> {
    const [plan, documentsThisMonth, easiestThisMonth, highlightsToday] =
      await Promise.all([
        this.planFor(userId),
        this.usage.get(userId, UsageMetric.DOCUMENTS_UPLOADED, this.monthKey()),
        this.usage.get(
          userId,
          UsageMetric.EASIEST_CONVERSIONS,
          this.monthKey(),
        ),
        this.usage.get(userId, UsageMetric.HIGHLIGHT_ACTIONS, this.dayKey()),
      ]);

    return new Entitlements(
      plan,
      { documentsThisMonth, easiestThisMonth, highlightsToday },
      this.unlimited ? UNLIMITED_LIMITS : undefined,
    );
  }

  /**
   * Reserve-then-verify. The counter is incremented first and the returned
   * value checked against the limit, so two requests racing the last slot
   * can't both pass — one of them sees a count over the line and is rolled
   * back (§2.1).
   */
  async consume(
    userId: string,
    metric: UsageMetric,
    check: (entitlements: Entitlements) => void,
  ): Promise<void> {
    const period =
      metric === UsageMetric.HIGHLIGHT_ACTIONS
        ? this.dayKey()
        : this.monthKey();
    const plan = await this.planFor(userId);
    const after = await this.usage.increment(userId, metric, period);

    try {
      // Evaluate the limit as though this action had already been counted.
      check(
        new Entitlements(
          plan,
          this.snapshotWith(metric, after - 1),
          this.unlimited ? UNLIMITED_LIMITS : undefined,
        ),
      );
    } catch (error) {
      await this.usage.decrement(userId, metric, period);
      throw error;
    }
  }

  /** Releases a reserved slot when the gated action fails after booking. */
  async release(userId: string, metric: UsageMetric): Promise<void> {
    const period =
      metric === UsageMetric.HIGHLIGHT_ACTIONS
        ? this.dayKey()
        : this.monthKey();
    await this.usage.decrement(userId, metric, period);
  }

  private snapshotWith(metric: UsageMetric, value: number) {
    return {
      documentsThisMonth: metric === UsageMetric.DOCUMENTS_UPLOADED ? value : 0,
      easiestThisMonth: metric === UsageMetric.EASIEST_CONVERSIONS ? value : 0,
      highlightsToday: metric === UsageMetric.HIGHLIGHT_ACTIONS ? value : 0,
    };
  }
}
