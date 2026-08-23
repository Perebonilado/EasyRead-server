import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from './entitlements.service';
import {
  LimitReachedError,
  ValidationError,
} from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import type { ClockPort } from '../../ports/clock.port';
import type {
  SubscriptionRepository,
  UsageRepository,
  VoiceCreditsRepository,
} from '../../repositories/billing.repository';

/**
 * The switch has to reach every gate. A version that lifted the document limit
 * but not the study clock would be worse than no switch at all — you'd
 * discover the gap mid-test. The wallet math is covered here too, because
 * spend-past-the-allowance is the piece a race would silently break.
 */
function build(
  unlimited: boolean,
  counts: Record<string, number> = {},
  creditSeconds = 0,
  billingEnabled = true,
) {
  const deducted: number[] = [];
  const usage = {
    get: jest.fn((_user: string, metric: string) =>
      Promise.resolve(counts[metric] ?? 0),
    ),
    increment: jest.fn((_user: string, metric: string) =>
      Promise.resolve((counts[metric] ?? 0) + 1),
    ),
    incrementBy: jest.fn(
      (_user: string, metric: string, _p: string, n: number) =>
        Promise.resolve((counts[metric] ?? 0) + n),
    ),
    decrement: jest.fn(() => Promise.resolve()),
  } as unknown as UsageRepository;

  const credits = {
    balance: jest.fn(() => Promise.resolve(creditSeconds)),
    add: jest.fn(() => Promise.resolve()),
    deduct: jest.fn((_user: string, seconds: number) => {
      deducted.push(seconds);
      return Promise.resolve();
    }),
  } as unknown as VoiceCreditsRepository;

  const subscriptions = {
    findByUser: jest.fn(() => Promise.resolve(null)),
  } as unknown as SubscriptionRepository;

  const clock: ClockPort = { now: () => new Date('2026-08-13T12:00:00Z') };

  const config = {
    get: (key: string) => {
      if (key === 'FREE_PLAN_UNLIMITED') return String(unlimited);
      if (key === 'BILLING_ENABLED') return String(billingEnabled);
      return undefined;
    },
  } as unknown as ConfigService;

  const service = new EntitlementsService(
    subscriptions,
    usage,
    credits,
    clock,
    config,
  );
  return { service, deducted };
}

describe('EntitlementsService', () => {
  describe('with the switch off', () => {
    it('still enforces the free document limit', async () => {
      const { service } = build(false, {
        [UsageMetric.DOCUMENTS_UPLOADED]: 3,
      });
      const entitlements = await service.forUser('u1');

      expect(entitlements.plan).toBe('free');
      expect(entitlements.limits.documentsPerMonth).toBe(3);
      expect(() => entitlements.assertCanUpload(1_000)).toThrow(
        LimitReachedError,
      );
    });

    it('walls a spent study day and reports zero remaining', async () => {
      const { service } = build(false, {
        [UsageMetric.STUDY_SECONDS]: 20 * 60,
      });
      await expect(service.assertStudyTime('u1')).rejects.toThrow(
        LimitReachedError,
      );

      const reading = await service.recordStudyTime('u1', 0);
      expect(reading).toMatchObject({
        usedSeconds: 20 * 60,
        limitSeconds: 20 * 60,
        remainingSeconds: 0,
      });
    });

    it('banks heartbeats but never a fraudulent one', async () => {
      const { service } = build(false, { [UsageMetric.STUDY_SECONDS]: 60 });
      const reading = await service.recordStudyTime('u1', 3600);
      // Clamped to the heartbeat ceiling, not the hour the client claimed.
      expect(reading.usedSeconds).toBe(60 + 120);
    });

    it('spends the allowance first and only the spill from credits', async () => {
      const { service, deducted } = build(
        false,
        { [UsageMetric.VOICE_SECONDS]: 14 * 60 },
        600,
      );
      // 120s spent from minute 14 of a 15-minute allowance: 60 in, 60 over.
      await service.recordVoiceSeconds('u1', 120);
      expect(deducted).toEqual([60]);
    });

    it('still watermarks free exports', async () => {
      const { service } = build(false);
      expect((await service.forUser('u1')).exportsAreWatermarked()).toBe(true);
    });

    it('advertises the real limits', () => {
      expect(build(false).service.effectiveLimits('free')).toMatchObject({
        documentsPerMonth: 3,
        studyMinutesPerDay: 20,
        voiceMinutesPerMonth: 15,
        watermarkedExports: true,
      });
    });
  });

  describe('with the switch on', () => {
    it('lifts every gate at once', async () => {
      const { service } = build(true, {
        [UsageMetric.DOCUMENTS_UPLOADED]: 99,
        [UsageMetric.STUDY_SECONDS]: 10 * 60 * 60,
        [UsageMetric.VOICE_SECONDS]: 10 * 60 * 60,
      });
      const entitlements = await service.forUser('u1');

      expect(() => entitlements.assertCanUpload(1_000)).not.toThrow();
      expect(() => entitlements.assertStudyTimeRemaining()).not.toThrow();
      expect(() => entitlements.assertVoiceAvailable()).not.toThrow();
      expect(entitlements.exportsAreWatermarked()).toBe(false);
    });

    it('leaves the reported plan alone, so billing screens stay honest', async () => {
      expect((await build(true).service.forUser('u1')).plan).toBe('free');
    });

    it('advertises the lifted limits, so the UI draws no meter', () => {
      expect(build(true).service.effectiveLimits('free')).toMatchObject({
        documentsPerMonth: null,
        studyMinutesPerDay: null,
        voiceMinutesPerMonth: null,
        watermarkedExports: false,
      });
    });
  });

  describe('with billing switched off', () => {
    it('is unlimited without anyone setting the testing switch', async () => {
      const { service } = build(
        false,
        {
          [UsageMetric.DOCUMENTS_UPLOADED]: 99,
          [UsageMetric.STUDY_SECONDS]: 10 * 60 * 60,
          [UsageMetric.VOICE_SECONDS]: 10 * 60 * 60,
        },
        0,
        false,
      );
      const entitlements = await service.forUser('u1');

      expect(() => entitlements.assertCanUpload(1_000)).not.toThrow();
      expect(() => entitlements.assertStudyTimeRemaining()).not.toThrow();
      expect(() => entitlements.assertVoiceAvailable()).not.toThrow();
      expect(entitlements.exportsAreWatermarked()).toBe(false);
    });

    it('refuses anything that would take money', () => {
      const { service } = build(false, {}, 0, false);
      expect(service.billingEnabled).toBe(false);
      expect(() => service.assertBillingEnabled()).toThrow(ValidationError);
    });

    it('advertises no ceilings, so the UI draws no meter', () => {
      expect(build(false, {}, 0, false).service.effectiveLimits('free'))
        .toMatchObject({
          documentsPerMonth: null,
          studyMinutesPerDay: null,
          voiceMinutesPerMonth: null,
        });
    });
  });

  it('sells by default, so revenue never stops by omission', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new EntitlementsService(
      { findByUser: () => Promise.resolve(null) } as never,
      {} as never,
      {} as never,
      { now: () => new Date() },
      config,
    );
    expect(service.billingEnabled).toBe(true);
    expect(() => service.assertBillingEnabled()).not.toThrow();
    expect(service.effectiveLimits('free').studyMinutesPerDay).toBe(20);
  });

  it('keys the study day to the timezone the client last reported', async () => {
    const { service } = build(false);
    // Lagos, UTC+1: at 23:30 UTC it is already tomorrow there.
    service.rememberTimezone('u1', 60);
    expect(service.dayKey('u1', new Date('2026-08-13T23:30:00Z'))).toBe(
      '2026-08-14',
    );
    // An unknown user falls back to the UTC day.
    expect(service.dayKey('u2', new Date('2026-08-13T23:30:00Z'))).toBe(
      '2026-08-13',
    );
  });
});
