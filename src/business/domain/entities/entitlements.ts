import type { PlanCode } from '../../../contracts';
import { FileTooLargeError, LimitReachedError } from '../errors/errors';
import { MAX_UPLOAD_BYTES, PLAN_LIMITS, type PlanLimits } from '../values';

export interface UsageSnapshot {
  documentsThisMonth: number;
  easiestThisMonth: number;
  highlightsToday: number;
}

/**
 * What a user is allowed to do right now.
 *
 * Resolved from our own `subscriptions` row (kept current by webhooks and a
 * daily reconcile) rather than by calling Paystack on every check — the
 * technical design calls that out explicitly as a fix for AI Examiner, where
 * every permission check hit the payment provider (§3.4).
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
  assertCanUpload(sizeBytes: number, estimatedPages?: number): void {
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

    if (estimatedPages !== undefined && estimatedPages > this.limits.maxPages) {
      throw new LimitReachedError(
        `Documents are limited to ${this.limits.maxPages} pages on your plan`,
        { limit: 'pages', allowed: this.limits.maxPages },
      );
    }
  }

  assertCanConvertToEasiest(): void {
    const allowed = this.limits.easiestPerMonth;
    if (allowed !== null && this.usage.easiestThisMonth >= allowed) {
      throw new LimitReachedError(
        "You've used this month's Easiest conversion",
        {
          limit: 'easiest',
          used: this.usage.easiestThisMonth,
          allowed,
        },
      );
    }
  }

  assertCanUseHighlight(): void {
    const allowed = this.limits.highlightsPerDay;
    if (allowed !== null && this.usage.highlightsToday >= allowed) {
      throw new LimitReachedError(`That's ${allowed} explanations today`, {
        limit: 'highlights',
        used: this.usage.highlightsToday,
        allowed,
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
