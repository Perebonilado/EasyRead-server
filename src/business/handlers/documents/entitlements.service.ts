import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlanCode } from '../../../contracts';
import { Entitlements } from '../../domain/entities/entitlements';
import { ValidationError } from '../../domain/errors/errors';
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
  USER_REPOSITORY,
  VOICE_CREDITS_REPOSITORY,
} from '../../repositories/tokens';
import type { UserRepository } from '../../repositories/user.repository';
import type {
  SubscriptionRepository,
  UsageRepository,
  VoiceCreditsRepository,
} from '../../repositories/billing.repository';

/** A heartbeat can bank at most this much, however broken the client. */
const MAX_HEARTBEAT_SECONDS = 120;

export interface StudyClockReading {
  usedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
}

export interface VoiceBalance {
  /** Seconds still usable right now: allowance remainder plus credits. */
  remainingSeconds: number | null;
  allowanceSeconds: number | null;
  usedThisMonthSeconds: number;
  creditSeconds: number;
}

/**
 * Resolves what a user may do, and books the usage when they do it.
 *
 * Plan comes from our own `subscriptions` row rather than a call to the payment
 * provider — the technical design calls that out as the fix for AI Examiner,
 * where every permission check hit the gateway (§3.4). No row means Free.
 *
 * Two meters live here. Study time banks in the user's own calendar day, so
 * the reset lands at their midnight: the client reports its UTC offset with
 * every heartbeat and the latest one is remembered per user. Losing that
 * memory on a restart merely means a few UTC-keyed heartbeats until the next
 * one arrives, on a meter whose job is conversion, not policing.
 */
@Injectable()
export class EntitlementsService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementsService.name);
  private readonly tzOffsets = new Map<string, number>();

  /**
   * Whether this deployment sells anything at all.
   *
   * On unless explicitly switched off, so revenue can never stop by
   * omission — only by decision. With it off the product is wholly free:
   * every ceiling is lifted and the endpoints that move money refuse.
   */
  get billingEnabled(): boolean {
    return this.config.get<string>('BILLING_ENABLED') !== 'false';
  }

  /** Refuses the money-moving endpoints while the product is free. */
  assertBillingEnabled(): void {
    if (!this.billingEnabled) {
      throw new ValidationError(
        'EasiRead is free right now, so there is nothing to pay for',
      );
    }
  }

  /**
   * Testing switch: lifts every plan ceiling while leaving the plan itself
   * alone, so the app still reports "free" and the billing screens stay
   * honest. Off unless explicitly set, so it can't reach production by
   * omission — only by decision.
   *
   * A deployment with billing switched off is unlimited by definition:
   * there is no upgrade to sell, so there is nothing a ceiling could do
   * except stop someone using a product we are giving away.
   */
  private get unlimited(): boolean {
    return (
      !this.billingEnabled ||
      this.config.get<string>('FREE_PLAN_UNLIMITED') === 'true'
    );
  }

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    @Inject(VOICE_CREDITS_REPOSITORY)
    private readonly credits: VoiceCreditsRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Emails that bypass every plan ceiling: the team, testers, friends of
   * the product. UNLIMITED_EMAILS is comma-delimited like FRONTEND_URL;
   * matching is case-insensitive on the trimmed address, and an address
   * with no account simply never matches anything. Parsed once, since env
   * does not change while the process lives.
   */
  private bypassEmails: Set<string> | null = null;

  private get unlimitedEmails(): Set<string> {
    this.bypassEmails ??= new Set(
      (this.config.get<string>('UNLIMITED_EMAILS') ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    return this.bypassEmails;
  }

  /**
   * The ceilings lifted for THIS user, if any: the global testing switch
   * first (no lookup needed), the email bypass list second. An empty list
   * costs nothing; a populated one costs a primary-key user read at the
   * gates that resolve entitlements.
   */
  private async overridesFor(
    userId: string,
  ): Promise<Partial<PlanLimits> | undefined> {
    if (this.unlimited) return UNLIMITED_LIMITS;
    if (!this.unlimitedEmails.size) return undefined;
    const user = await this.users.findById(userId);
    const email = user?.email.trim().toLowerCase();
    return email && this.unlimitedEmails.has(email)
      ? UNLIMITED_LIMITS
      : undefined;
  }

  onModuleInit(): void {
    if (this.unlimitedEmails.size) {
      this.logger.log(
        `UNLIMITED_EMAILS grants full access to ${this.unlimitedEmails.size} address(es).`,
      );
    }
    if (!this.billingEnabled) {
      this.logger.warn(
        'BILLING_ENABLED=false — the product is free: every limit is lifted and checkout is refused.',
      );
    } else if (this.unlimited) {
      this.logger.warn(
        'FREE_PLAN_UNLIMITED=true — every plan limit is lifted. Testing only.',
      );
    }
  }

  monthKey(now = this.clock.now()): string {
    return now.toISOString().slice(0, 7); // YYYY-MM
  }

  /** The user's own calendar day, from the offset their client last sent. */
  dayKey(userId: string, now = this.clock.now()): string {
    const offset = this.tzOffsets.get(userId) ?? 0;
    return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10); // YYYY-MM-DD
  }

  rememberTimezone(userId: string, utcOffsetMinutes: number): void {
    if (
      Number.isFinite(utcOffsetMinutes) &&
      Math.abs(utcOffsetMinutes) <= 14 * 60
    ) {
      this.tzOffsets.set(userId, Math.round(utcOffsetMinutes));
    }
  }

  async planFor(userId: string): Promise<PlanCode> {
    const subscription = await this.subscriptions.findByUser(userId);
    if (!subscription) return 'free';
    /**
     * Only a live subscription grants Pro. `past_due` counts as live: the
     * gateway is still retrying the card, and locking someone out of a
     * document mid-retry over a bank blip is the wrong side to err on.
     * A cancellation stays `active` until the paid period ends, so
     * `cancelAtPeriodEnd` does not remove access on its own.
     */
    const live =
      subscription.status === 'active' ||
      subscription.status === 'trialing' ||
      subscription.status === 'past_due';
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
    const [
      plan,
      documentsThisMonth,
      studySecondsToday,
      voiceSecondsThisMonth,
      voiceCreditSeconds,
      overrides,
    ] = await Promise.all([
      this.planFor(userId),
      this.usage.get(userId, UsageMetric.DOCUMENTS_UPLOADED, this.monthKey()),
      this.usage.get(userId, UsageMetric.STUDY_SECONDS, this.dayKey(userId)),
      this.usage.get(userId, UsageMetric.VOICE_SECONDS, this.monthKey()),
      this.credits.balance(userId),
      this.overridesFor(userId),
    ]);

    return new Entitlements(
      plan,
      {
        documentsThisMonth,
        studySecondsToday,
        voiceSecondsThisMonth,
        voiceCreditSeconds,
      },
      overrides,
    );
  }

  // ── The study clock ────────────────────────────────────────────────────────

  /**
   * Banks active study seconds and answers with what is left, so the one
   * heartbeat call also drives the client's quiet warning and its wall.
   */
  async recordStudyTime(
    userId: string,
    seconds: number,
    utcOffsetMinutes?: number,
  ): Promise<StudyClockReading> {
    if (utcOffsetMinutes !== undefined) {
      this.rememberTimezone(userId, utcOffsetMinutes);
    }
    const banked = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, seconds));
    const day = this.dayKey(userId);
    const used =
      banked > 0
        ? await this.usage.incrementBy(
            userId,
            UsageMetric.STUDY_SECONDS,
            day,
            Math.round(banked),
          )
        : await this.usage.get(userId, UsageMetric.STUDY_SECONDS, day);

    const limits = {
      ...PLAN_LIMITS[await this.planFor(userId)],
      ...(await this.overridesFor(userId)),
    };
    const limitSeconds =
      limits.studyMinutesPerDay === null
        ? null
        : limits.studyMinutesPerDay * 60;
    return {
      usedSeconds: used,
      limitSeconds,
      remainingSeconds:
        limitSeconds === null ? null : Math.max(0, limitSeconds - used),
    };
  }

  /** The server-side backstop for study actions that spend money. */
  async assertStudyTime(userId: string): Promise<void> {
    (await this.forUser(userId)).assertStudyTimeRemaining();
  }

  // ── The voice wallet ───────────────────────────────────────────────────────

  async voiceBalance(userId: string): Promise<VoiceBalance> {
    const entitlements = await this.forUser(userId);
    const allowanceMinutes = entitlements.limits.voiceMinutesPerMonth;
    return {
      remainingSeconds: entitlements.remainingVoiceSeconds(),
      allowanceSeconds:
        allowanceMinutes === null ? null : allowanceMinutes * 60,
      usedThisMonthSeconds: entitlements.usage.voiceSecondsThisMonth,
      creditSeconds: entitlements.usage.voiceCreditSeconds,
    };
  }

  /**
   * Spends voice time: the monthly allowance first, purchased credits for
   * whatever spills past it. The usage counter records everything either
   * way, so "used this month" stays one honest number.
   */
  async recordVoiceSeconds(userId: string, seconds: number): Promise<void> {
    const spend = Math.max(0, Math.round(seconds));
    if (spend === 0) return;

    const entitlements = await this.forUser(userId);
    const allowanceMinutes = entitlements.limits.voiceMinutesPerMonth;

    const before = entitlements.usage.voiceSecondsThisMonth;
    await this.usage.incrementBy(
      userId,
      UsageMetric.VOICE_SECONDS,
      this.monthKey(),
      spend,
    );

    if (allowanceMinutes !== null) {
      const allowance = allowanceMinutes * 60;
      const beyondBefore = Math.max(0, before - allowance);
      const beyondAfter = Math.max(0, before + spend - allowance);
      const fromCredits = beyondAfter - beyondBefore;
      if (fromCredits > 0) await this.credits.deduct(userId, fromCredits);
    }
  }

  async addVoiceCredits(userId: string, seconds: number): Promise<void> {
    if (seconds > 0) await this.credits.add(userId, Math.round(seconds));
  }

  // ── Counted usage (documents) ──────────────────────────────────────────────

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
    const period = this.monthKey();
    const plan = await this.planFor(userId);
    const overrides = await this.overridesFor(userId);
    const after = await this.usage.increment(userId, metric, period);

    try {
      // Evaluate the limit as though this action had already been counted.
      check(
        new Entitlements(
          plan,
          {
            documentsThisMonth:
              metric === UsageMetric.DOCUMENTS_UPLOADED ? after - 1 : 0,
            studySecondsToday: 0,
            voiceSecondsThisMonth: 0,
            voiceCreditSeconds: 0,
          },
          overrides,
        ),
      );
    } catch (error) {
      await this.usage.decrement(userId, metric, period);
      throw error;
    }
  }

  /** Releases a reserved slot when the gated action fails after booking. */
  async release(userId: string, metric: UsageMetric): Promise<void> {
    await this.usage.decrement(userId, metric, this.monthKey());
  }
}
