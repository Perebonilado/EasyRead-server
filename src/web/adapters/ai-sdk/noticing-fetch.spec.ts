import {
  followWork,
  type RetryNotice,
  type WorkFollower,
} from '../../../business/domain/work-progress';
import { noticingFetch, triedAgain } from './noticing-fetch';

const follower = () => {
  const retries: RetryNotice[] = [];
  const recovered: (string | undefined)[] = [];
  const f: WorkFollower = {
    step: () => undefined,
    retry: (n) => retries.push(n),
    recovered: (_service, call) => recovered.push(call),
  };
  return { f, retries, recovered };
};

const answer = (
  status: number,
  body = '',
  headers: Record<string, string> = {},
) => new Response(body, { status, headers });

describe('the fetch the models are asked through', () => {
  it('tells of a rate limit the SDK will try again, and of the answer that ends it, by call', async () => {
    const { f, retries, recovered } = follower();
    const replies = [
      answer(429, '{"error":"rate limit"}', { 'retry-after': '4' }),
      answer(200, '{}'),
    ];
    const send = jest.fn(() => Promise.resolve(replies.shift()!));
    const fetch = noticingFetch('writer', 3, send);
    const init = { method: 'POST', body: '{"a":1}' };
    await followWork(f, async () => {
      await fetch('https://api.deepseek.com/chat', init);
      await fetch('https://api.deepseek.com/chat', init);
    });
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({
      service: 'writer',
      status: 429,
      of: 3,
      waitMs: 4000,
      final: false,
    });
    // The same call, both tries.
    expect(recovered).toEqual([retries[0].call]);
  });

  it('a refusal the SDK will not try again is said as given up', async () => {
    const { f, retries } = follower();
    const send = jest.fn(() =>
      Promise.resolve(
        answer(402, '{"error":{"message":"Insufficient Balance"}}'),
      ),
    );
    const fetch = noticingFetch('writer', 3, send);
    const response = await followWork(f, () =>
      fetch('https://api.deepseek.com/chat', { body: '{}' }),
    );
    // Passed on as it came, its body still to read.
    expect(response.status).toBe(402);
    await expect(response.text()).resolves.toContain('Insufficient Balance');
    expect(retries[0]).toMatchObject({ status: 402, final: true });
    expect(retries[0].body).toContain('Insufficient Balance');
  });

  it('a dropped connection is told and thrown on', async () => {
    const { f, retries } = follower();
    const send = jest.fn(() => Promise.reject(new TypeError('fetch failed')));
    const fetch = noticingFetch('writer', 3, send);
    await expect(
      followWork(f, () => fetch('https://x', { body: '{}' })),
    ).rejects.toThrow('fetch failed');
    expect(retries[0]).toMatchObject({ final: false });
  });

  it('with no one following, only passes the request on', async () => {
    const send = jest.fn(() => Promise.resolve(answer(500)));
    const fetch = noticingFetch('writer', 3, send);
    const response = await fetch('https://x');
    expect(response.status).toBe(500);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('knows which statuses the SDK tries again', () => {
    expect([408, 409, 429, 500, 503].every(triedAgain)).toBe(true);
    expect([400, 401, 402, 404].some(triedAgain)).toBe(false);
  });
});
