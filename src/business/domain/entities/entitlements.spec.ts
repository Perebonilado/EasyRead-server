import { Entitlements } from './entitlements';
import { FileTooLargeError, LimitReachedError } from '../errors/errors';
import { MAX_UPLOAD_BYTES } from '../values';

const usage = (over: Partial<Entitlements['usage']> = {}) => ({
  documentsThisMonth: 0,
  studySecondsToday: 0,
  voiceSecondsThisMonth: 0,
  voiceCreditSeconds: 0,
  ...over,
});

describe('Entitlements', () => {
  describe('uploads', () => {
    it('allows the first three free documents and refuses the fourth', () => {
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

    it('never counts uploads against Pro', () => {
      expect(() =>
        new Entitlements(
          'pro',
          usage({ documentsThisMonth: 500 }),
        ).assertCanUpload(1_000),
      ).not.toThrow();
    });

    it('refuses an oversized file on any plan', () => {
      expect(() =>
        new Entitlements('pro', usage()).assertCanUpload(MAX_UPLOAD_BYTES + 1),
      ).toThrow(FileTooLargeError);
    });
  });

  describe('the study clock', () => {
    it('gives free 20 minutes a day and counts down', () => {
      const entitlements = new Entitlements(
        'free',
        usage({ studySecondsToday: 15 * 60 }),
      );
      expect(entitlements.remainingStudySeconds()).toBe(5 * 60);
      expect(() => entitlements.assertStudyTimeRemaining()).not.toThrow();
    });

    it('walls the free plan once the day is spent, and names the limit', () => {
      const spent = new Entitlements(
        'free',
        usage({ studySecondsToday: 20 * 60 }),
      );
      expect(spent.remainingStudySeconds()).toBe(0);
      try {
        spent.assertStudyTimeRemaining();
        fail('expected the wall');
      } catch (error) {
        expect(error).toBeInstanceOf(LimitReachedError);
        expect((error as LimitReachedError).details).toMatchObject({
          limit: 'study_time',
        });
      }
    });

    it('never walls Pro', () => {
      const pro = new Entitlements(
        'pro',
        usage({ studySecondsToday: 10 * 60 * 60 }),
      );
      expect(pro.remainingStudySeconds()).toBeNull();
      expect(() => pro.assertStudyTimeRemaining()).not.toThrow();
    });
  });

  describe('the voice wallet', () => {
    it('grants the free monthly allowance', () => {
      const fresh = new Entitlements('free', usage());
      expect(fresh.remainingVoiceSeconds()).toBe(15 * 60);
    });

    it('stacks purchased credits on top of what is left', () => {
      const topped = new Entitlements(
        'free',
        usage({ voiceSecondsThisMonth: 10 * 60, voiceCreditSeconds: 30 * 60 }),
      );
      expect(topped.remainingVoiceSeconds()).toBe(5 * 60 + 30 * 60);
    });

    it('does not let overuse of the allowance eat the credits twice', () => {
      // 20 of 15 allowance minutes used: the 5 extra already came out of
      // credits at spend time, so remaining is exactly the credit balance.
      const over = new Entitlements(
        'free',
        usage({ voiceSecondsThisMonth: 20 * 60, voiceCreditSeconds: 25 * 60 }),
      );
      expect(over.remainingVoiceSeconds()).toBe(25 * 60);
    });

    it('refuses to start a session on an empty wallet', () => {
      const empty = new Entitlements(
        'free',
        usage({ voiceSecondsThisMonth: 15 * 60 }),
      );
      expect(() => empty.assertVoiceAvailable()).toThrow(LimitReachedError);
    });

    it('gives Pro its 120 minutes and then its credits', () => {
      const pro = new Entitlements(
        'pro',
        usage({ voiceSecondsThisMonth: 60 * 60, voiceCreditSeconds: 10 * 60 }),
      );
      expect(pro.remainingVoiceSeconds()).toBe(60 * 60 + 10 * 60);
    });
  });

  it('watermarks free exports and not Pro ones', () => {
    expect(new Entitlements('free', usage()).exportsAreWatermarked()).toBe(
      true,
    );
    expect(new Entitlements('pro', usage()).exportsAreWatermarked()).toBe(
      false,
    );
  });

  it('the unlimited override lifts the meters without changing the plan', () => {
    const lifted = new Entitlements(
      'free',
      usage({ studySecondsToday: 10 * 60 * 60 }),
      { studyMinutesPerDay: null, voiceMinutesPerMonth: null },
    );
    expect(lifted.plan).toBe('free');
    expect(lifted.remainingStudySeconds()).toBeNull();
    expect(lifted.remainingVoiceSeconds()).toBeNull();
  });
});
