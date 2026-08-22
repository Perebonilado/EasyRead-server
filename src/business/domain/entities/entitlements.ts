import type { PlanCode } from '../../../contracts';
import { FileTooLargeError, LimitReachedError } from '../errors/errors';
import { MAX_UPLOAD_BYTES, PLAN_LIMITS, type PlanLimits } from '../values';

export interface UsageSnapshot {
  documentsThisMonth: number;
  /** Active study seconds banked so far today, in the user's own day. */
  studySecondsToday: number;
  /** Voice seconds used this month, allowance and credits combined. */
  voiceSecondsThisMonth: number;
  /** Purchased voice credit balance, in seconds, on top of the allowance. */
  voiceCreditSeconds: number;
}

/**
 * What a user is allowed to do right now.
 *
 * Resolved from our own `subscriptions` row (kept current by webhooks and a
 * daily reconcile) rather than by calling the gateway on every check.
 *
 * The model is metered, not gated: every feature is open on Free, and what
 * runs out is time. Study time resets daily, the voice allowance monthly,
 * and purchased credits never expire.
 */
export class Entitlements {
  constructor(
    readonly plan: PlanCode,
    readonly usage: UsageSnapshot,
    /**
     * Lifts specific ceilings without changing which plan the user is on.
     * Used by the `FREE_PLAN_UNLIMITED` testing switch, and deliberately
     * applied here so every gate below reads the overridden values — there is
     * no second code path that could disagree with the first.
     */
    private readonly overrides?: Partial<PlanLimits>,
  ) {}

  get limits(): PlanLimits {
    return { ...PLAN_LIMITS[this.plan], ...this.overrides };
  }

  /** Throws with the specific limit that was hit, so the UI can name it. */
  assertCanUpload(sizeBytes: number): void {
    if (sizeBytes > MAX_UPLOAD_BYTES)
      throw new FileTooLargeError(MAX_UPLOAD_BYTES);

    const monthly = this.limits.documentsPerMonth;
    if (monthly !== null && this.usage.documentsThisMonth >= monthly) {
      throw new LimitReachedError(
        `That's your ${this.ordinal(monthly)} document this month`,
        {
          limit: 'documents',
          used: this.usage.documentsThisMonth,
          allowed: monthly,
        },
      );
    }
  }

  /** Seconds of study left today; null when the plan has no ceiling. */
  remainingStudySeconds(): number | null {
    const minutes = this.limits.studyMinutesPerDay;
    if (minutes === null) return null;
    return Math.max(0, minutes * 60 - this.usage.studySecondsToday);
  }

  /**
   * The wall. Guards the study actions that spend money (explanations,
   * conversions, chat); passive re-reading is walled by the client, which
   * is honest enough for a meter whose point is conversion, not policing.
   */
  assertStudyTimeRemaining(): void {
    const remaining = this.remainingStudySeconds();
    if (remaining !== null && remaining <= 0) {
      const minutes = this.limits.studyMinutesPerDay ?? 0;
      throw new LimitReachedError(
        `That's ${minutes} minutes of studying today`,
        {
          limit: 'study_time',
          allowed: minutes * 60,
          used: this.usage.studySecondsToday,
        },
      );
    }
  }

  /**
   * Voice seconds still available: whatever is left of the monthly
   * allowance, plus purchased credits. Never negative.
   */
  remainingVoiceSeconds(): number | null {
    const allowanceMinutes = this.limits.voiceMinutesPerMonth;
    if (allowanceMinutes === null) return null;
    const allowance = allowanceMinutes * 60;
    const left = allowance - this.usage.voiceSecondsThisMonth;
    return Math.max(0, left) + this.usage.voiceCreditSeconds;
  }

  assertVoiceAvailable(minimumSeconds = 30): void {
    const remaining = this.remainingVoiceSeconds();
    if (remaining !== null && remaining < minimumSeconds) {
      throw new LimitReachedError('You are out of voice minutes', {
        limit: 'voice',
        remainingSeconds: remaining,
      });
    }
  }

  /** Free-plan exports carry a watermark (PRD §3, engineering-fixed). */
  exportsAreWatermarked(): boolean {
    return this.limits.watermarkedExports;
  }

  private ordinal(n: number): string {
    const suffix =
      ['th', 'st', 'nd', 'rd'][(n % 100) - 20 === 1 ? 1 : n % 10] ?? 'th';
    return `${n}${n > 3 && n < 21 ? 'th' : suffix}`;
  }
}
