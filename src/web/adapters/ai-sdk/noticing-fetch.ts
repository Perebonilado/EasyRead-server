/**
 * The fetch every model provider is made with: it passes each request
 * through as it is, and tells whoever follows the work (work-progress)
 * when one fails and the AI SDK is about to try it again, when it gives
 * up, and when a call answers. The SDK's own retries (maxRetries) say
 * nothing as they happen; this is where they can be seen.
 *
 * Each try of a call is sent with the same body, so tries are counted by
 * the call they belong to: calls made side by side are kept apart.
 */
import { createHash } from 'node:crypto';
import {
  followed,
  noticeRecovered,
  noticeRetry,
  type WorkService,
} from '../../../business/domain/work-progress';

/** The statuses the AI SDK tries again (APICallError's isRetryable). */
export const triedAgain = (status: number) =>
  status === 408 || status === 409 || status === 429 || status >= 500;

/** A fetch as the providers call it. */
type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** The same call's every try: its address and its body. */
function callOf(input: string | URL | Request, init?: RequestInit): string {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const body = typeof init?.body === 'string' ? init.body : '';
  return createHash('sha1').update(url).update(body).digest('hex');
}

/** How long the answer says to wait before trying again, in ms, when it says. */
function waitOf(response: Response): number | undefined {
  const ms = Number(response.headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(response.headers.get('retry-after'));
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return undefined;
}

/**
 * A fetch that tells of trouble. `tries` is how many tries the SDK makes
 * of a call in all (maxRetries + 1).
 */
export function noticingFetch(
  service: WorkService,
  tries: number,
  send: Fetch = (input, init) => globalThis.fetch(input, init),
): Fetch {
  return async (input, init) => {
    if (!followed()) return send(input, init);
    const call = callOf(input, init);
    let response: Response;
    try {
      response = await send(input, init);
    } catch (error) {
      // Aborted by the caller (a time limit of its own): not tried again.
      const aborted =
        init?.signal?.aborted === true ||
        (error as Error)?.name === 'AbortError';
      noticeRetry({ service, call, of: tries, error, final: aborted });
      throw error;
    }
    if (response.ok) {
      noticeRecovered(service, call);
      return response;
    }
    const body = await response
      .clone()
      .text()
      .then((text) => text.slice(0, 600))
      .catch(() => '');
    noticeRetry({
      service,
      call,
      of: tries,
      status: response.status,
      body,
      waitMs: waitOf(response),
      final: !triedAgain(response.status),
    });
    return response;
  };
}
