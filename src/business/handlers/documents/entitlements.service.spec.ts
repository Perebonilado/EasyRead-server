import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from './entitlements.service';
import { LimitReachedError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import type { ClockPort } from '../../ports/clock.port';
import type {
  SubscriptionRepository,
  UsageRepository,
} from '../../repositories/billing.repository';

/**
 * The switch has to reach every gate. A version that lifted the document limit
 * but not the highlight limit would be worse than no switch at all — you'd
 * discover the gap mid-test.
 */
function build(unlimited: boolean, counts: Record<string, number> = {}) {
  const usage = {
    get: jest.fn((_user: string, metric: string) =>
      Promise.resolve(counts[metric] ?? 0),
    ),
    increment: jest.fn((_user: string, metric: string) =>
      Promise.resolve((counts[metric] ?? 0) + 1),
    ),
    decrement: jest.fn(() => Promise.resolve()),
  } as unknown as UsageRepository;

  const subscriptions = {
    findByUser: jest.fn(() => Promise.resolve(null)),
  } as unknown as SubscriptionRepository;

  const clock: ClockPort = { now: () => new Date('2026-08-13T12:00:00Z') };

  const config = {
    get: (key: string) =>
      key === 'FREE_PLAN_UNLIMITED' ? String(unlimited) : undefined,
  } as unknown as ConfigService;

  return new EntitlementsService(subscriptions, usage, clock, config);
}

describe('EntitlementsService', () => {
  describe('with the switch off', () => {
    it('still enforces the free document limit', async () => {
      const service = build(false, { [UsageMetric.DOCUMENTS_UPLOADED]: 3 });
      const entitlements = await service.forUser('u1');

      expect(entitlements.plan).toBe('free');
      expect(entitlements.limits.documentsPerMonth).toBe(3);
      expect(() => entitlements.assertCanUpload(1_000)).toThrow(
        LimitReachedError,
      );
    });

    it('still watermarks free exports', async () => {
      const service = build(false);
      expect((await service.forUser('u1')).exportsAreWatermarked()).toBe(true);
    });

    it('advertises the real limits', () => {
      expect(build(false).effectiveLimits('free')).toMatchObject({
        documentsPerMonth: 3,
        easiestPerMonth: 1,
        highlightsPerDay: 20,
        maxPages: 50,
        watermarkedExports: true,
      });
    });
  });

  describe('with the switch on', () => {
    it('lifts every gate at once', async () => {
      const service = build(true, {
        [UsageMetric.DOCUMENTS_UPLOADED]: 99,
        [UsageMetric.EASIEST_CONVERSIONS]: 99,
        [UsageMetric.HIGHLIGHT_ACTIONS]: 99,
      });
      const entitlements = await service.forUser('u1');

      expect(() => entitlements.assertCanUpload(1_000)).not.toThrow();
      expect(() => entitlements.assertCanConvertToEasiest()).not.toThrow();
      expect(() => entitlements.assertCanUseHighlight()).not.toThrow();
      expect(entitlements.exportsAreWatermarked()).toBe(false);
    });

    it('raises the page cap to the Pro ceiling', async () => {
      const entitlements = await build(true).forUser('u1');
      expect(() => entitlements.assertCanUpload(1_000, 300)).not.toThrow();
    });

    it('leaves the reported plan alone, so billing screens stay honest', async () => {
      expect((await build(true).forUser('u1')).plan).toBe('free');
    });

    it('advertises the lifted limits, so the UI draws no meter', () => {
      expect(build(true).effectiveLimits('free')).toMatchObject({
        documentsPerMonth: null,
        easiestPerMonth: null,
        highlightsPerDay: null,
        watermarkedExports: false,
      });
    });

    it('lets `consume` through where it would otherwise refuse', async () => {
      const service = build(true, { [UsageMetric.DOCUMENTS_UPLOADED]: 99 });
      await expect(
        service.consume('u1', UsageMetric.DOCUMENTS_UPLOADED, (e) =>
          e.assertCanUpload(1_000),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
