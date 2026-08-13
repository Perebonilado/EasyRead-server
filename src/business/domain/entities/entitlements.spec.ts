import { Entitlements } from './entitlements';
import { FileTooLargeError, LimitReachedError } from '../errors/errors';
import { MAX_UPLOAD_BYTES } from '../values';

const usage = (over: Partial<Entitlements['usage']> = {}) => ({
  documentsThisMonth: 0,
  easiestThisMonth: 0,
  highlightsToday: 0,
  ...over,
});

describe('Entitlements', () => {
  describe('free plan', () => {
    it('allows the first three documents and refuses the fourth', () => {
      expect(() =>
        new Entitlements(
          'free',
          usage({ documentsThisMonth: 2 }),
        ).assertCanUpload(1_000),
      ).not.toThrow();

      expect(() =>
        new Entitlements(
          'free',
          usage({ documentsThisMonth: 3 }),
        ).assertCanUpload(1_000),
      ).toThrow(LimitReachedError);
    });

    it('names the limit that was hit so the UI can explain it', () => {
      try {
        new Entitlements(
          'free',
          usage({ documentsThisMonth: 3 }),
        ).assertCanUpload(1_000);
        fail('expected a limit error');
      } catch (error) {
        expect((error as LimitReachedError).details).toMatchObject({
          limit: 'documents',
          used: 3,
          allowed: 3,
        });
      }
    });

    it('caps pages at 50', () => {
      const free = new Entitlements('free', usage());
      expect(() => free.assertCanUpload(1_000, 50)).not.toThrow();
      expect(() => free.assertCanUpload(1_000, 51)).toThrow(LimitReachedError);
    });

    it('allows one Easiest conversion a month', () => {
      expect(() =>
        new Entitlements('free', usage()).assertCanConvertToEasiest(),
      ).not.toThrow();
      expect(() =>
        new Entitlements(
          'free',
          usage({ easiestThisMonth: 1 }),
        ).assertCanConvertToEasiest(),
      ).toThrow(LimitReachedError);
    });

    it('allows twenty highlight actions a day', () => {
      expect(() =>
        new Entitlements(
          'free',
          usage({ highlightsToday: 19 }),
        ).assertCanUseHighlight(),
      ).not.toThrow();
      expect(() =>
        new Entitlements(
          'free',
          usage({ highlightsToday: 20 }),
        ).assertCanUseHighlight(),
      ).toThrow(LimitReachedError);
    });

    it('watermarks exports', () => {
      expect(new Entitlements('free', usage()).exportsAreWatermarked()).toBe(
        true,
      );
    });
  });

  describe('pro plan', () => {
    const heavy = usage({
      documentsThisMonth: 500,
      easiestThisMonth: 500,
      highlightsToday: 500,
    });

    it('has no monthly or daily ceilings', () => {
      const pro = new Entitlements('pro', heavy);
      expect(() => pro.assertCanUpload(1_000)).not.toThrow();
      expect(() => pro.assertCanConvertToEasiest()).not.toThrow();
      expect(() => pro.assertCanUseHighlight()).not.toThrow();
    });

    it('still caps pages at 300', () => {
      const pro = new Entitlements('pro', usage());
      expect(() => pro.assertCanUpload(1_000, 300)).not.toThrow();
      expect(() => pro.assertCanUpload(1_000, 301)).toThrow(LimitReachedError);
    });

    it('exports without a watermark', () => {
      expect(new Entitlements('pro', usage()).exportsAreWatermarked()).toBe(
        false,
      );
    });
  });

  it('rejects oversized files on every plan', () => {
    for (const plan of ['free', 'pro'] as const) {
      expect(() =>
        new Entitlements(plan, usage()).assertCanUpload(MAX_UPLOAD_BYTES + 1),
      ).toThrow(FileTooLargeError);
    }
  });
});
