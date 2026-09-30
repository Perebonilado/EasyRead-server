import {
  followWork,
  followed,
  noticeRecovered,
  noticeRetry,
  progressNow,
  retryWords,
  troubleOf,
  troubleWords,
  type RetryNotice,
  type WorkFollower,
  type WorkStep,
} from './work-progress';

const follower = () => {
  const seen = {
    steps: [] as WorkStep[],
    retries: [] as RetryNotice[],
    recovered: 0,
  };
  const f: WorkFollower = {
    step: (s) => seen.steps.push(s),
    retry: (n) => seen.retries.push(n),
    recovered: () => (seen.recovered += 1),
  };
  return { f, seen };
};

describe('work progress', () => {
  it('says nothing, and breaks nothing, with no one following', () => {
    expect(followed()).toBe(false);
    expect(() => {
      progressNow({ says: 'Reading the whole script' });
      noticeRetry({ service: 'writer' });
      noticeRecovered('writer');
    }).not.toThrow();
  });

  it('reaches the follower of the work it runs in, however deep and however late', async () => {
    const { f, seen } = follower();
    const deep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      progressNow({ says: 'Reading the whole script' });
      noticeRetry({ service: 'writer', status: 429 });
      noticeRecovered('writer');
    };
    await followWork(f, deep);
    expect(seen.steps).toEqual([{ says: 'Reading the whole script' }]);
    expect(seen.retries).toHaveLength(1);
    expect(seen.recovered).toBe(1);
  });

  it('keeps jobs run side by side apart', async () => {
    const one = follower();
    const two = follower();
    await Promise.all([
      followWork(one.f, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        progressNow({ says: 'one' });
      }),
      followWork(two.f, () => {
        progressNow({ says: 'two' });
        return Promise.resolve();
      }),
    ]);
    expect(one.seen.steps).toEqual([{ says: 'one' }]);
    expect(two.seen.steps).toEqual([{ says: 'two' }]);
  });

  it('a follower that throws never breaks the work', async () => {
    const f: WorkFollower = {
      step: () => {
        throw new Error('no');
      },
      retry: () => undefined,
      recovered: () => undefined,
    };
    await expect(
      followWork(f, () => {
        progressNow({ says: 'x' });
        return Promise.resolve(7);
      }),
    ).resolves.toBe(7);
  });
});

describe('the trouble a call is in, in the maker words', () => {
  it('DeepSeek out of balance is out of credit, even inside the SDK retry error', () => {
    const sdk = {
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts. Last error: Insufficient Balance',
      lastError: { statusCode: 402, message: 'Insufficient Balance' },
    };
    expect(troubleOf(sdk)).toBe('credit');
    expect(troubleWords('writer', troubleOf(sdk))).toBe(
      'The writing service is out of credit',
    );
  });

  it('a rate limit is busy; a timeout slow; a 5xx or a dropped line cannot be reached', () => {
    expect(troubleOf(undefined, 429)).toBe('busy');
    expect(troubleWords('writer', 'busy')).toBe('The writer is busy');
    expect(troubleWords('voice', 'busy')).toBe(
      'The voice service is at its limit',
    );
    expect(troubleOf(new Error('The Gemini voice is rate limited: x'))).toBe(
      'busy',
    );
    expect(troubleOf(new Error('The ElevenLabs voice is busy: y'))).toBe(
      'busy',
    );
    const timeout = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    });
    expect(troubleOf(timeout)).toBe('slow');
    expect(troubleWords('writer', 'slow')).toBe('The writer is slow to answer');
    expect(troubleOf(undefined, 503)).toBe('down');
    expect(troubleOf(new TypeError('fetch failed'))).toBe('down');
    expect(troubleWords('writer', 'down')).toBe("The writer can't be reached");
  });

  it("a day's quota is a limit for today, not credit; our own error is only that it did not work", () => {
    expect(
      troubleOf(
        undefined,
        429,
        'Quota exceeded for metric: generate_requests_per_model_per_day',
      ),
    ).toBe('capped');
    expect(troubleOf(new Error('Cannot read properties of undefined'))).toBe(
      'failed',
    );
    expect(troubleWords('writer', 'failed')).toBe('That did not work');
    expect(troubleOf(undefined, 400)).toBe('refused');
  });
});

describe('a retry in a line', () => {
  it('says the try and of how many', () => {
    expect(
      retryWords({ reason: 'The writer is busy', attempt: 2, of: 3 }),
    ).toBe('The writer is busy, trying again (2 of 3)');
  });

  it('says a wait before a try, and a wait to be sent', () => {
    expect(
      retryWords({
        reason: 'The writer is busy',
        attempt: 2,
        of: 2,
        waitMs: 20_000,
      }),
    ).toBe('The writer is busy, trying again in 20 s (2 of 2)');
    expect(
      retryWords({
        reason: 'The voice service is at its limit',
        waitMs: 40_000,
        waiting: true,
      }),
    ).toBe('The voice service is at its limit, waiting 40 s');
  });

  it('given up, says only why', () => {
    expect(
      retryWords({
        reason: 'The writing service is out of credit',
        final: true,
      }),
    ).toBe('The writing service is out of credit');
  });
});
