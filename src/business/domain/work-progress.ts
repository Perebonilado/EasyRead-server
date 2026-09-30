/**
 * What the work in hand is doing now, told to whoever is following it,
 * without anyone passing a callback down. A job is followed by running it
 * inside `followWork`; anything it calls, however deep (a scene writer, a
 * table read, the adapter a model is asked through, a voice waiting its
 * turn), says what it is doing with `progressNow` or that a call failed and
 * is being tried again with `noticeRetry`. With no one following, both do
 * nothing, so code shared with the benches and the books never notices.
 *
 * The follower is carried by Node's AsyncLocalStorage: each job's awaits,
 * and every call made under them, find their own.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Who was asked: the writer (any text model), the voice, the artist, the picture checker. */
export type WorkService = 'writer' | 'voice' | 'artist' | 'judge';

/** A step of the work, said as it starts; `done` when it has finished. */
export interface WorkStep {
  /** What is being done, in the maker's words: "Reading the whole script". */
  says?: string;
  /** The scene it is about, from 0; none for the whole job. */
  scene?: number;
  /** A word for the scene's row: "Rewriting", "Shortening", "Fixing", "Checking". */
  short?: string;
  /** The step, or the scene's, is over: back to what the job was doing. */
  done?: boolean;
}

/** A call that failed and is tried again, or is waiting to be sent. */
export interface RetryNotice {
  service: WorkService;
  /**
   * The call it was, the same on each try of it: tries the AI SDK makes on
   * its own are counted this way, one call's apart from another's.
   */
  call?: string;
  /** The try about to be made, from 2; counted by the follower when not given. */
  attempt?: number;
  /** How many tries there are in all. */
  of?: number;
  /** How long before the next try, or before it is sent at all. */
  waitMs?: number;
  /** What went wrong: an error, or the status and body that came back. */
  error?: unknown;
  status?: number;
  body?: string;
  /** Held back before being sent (a rate kept to), not failed. */
  waiting?: boolean;
  /** No more tries of this call. */
  final?: boolean;
}

export interface WorkFollower {
  step(step: WorkStep): void;
  retry(notice: RetryNotice): void;
  /** A call answered: any trouble said about it (or its service) is over. */
  recovered(service: WorkService, call?: string): void;
}

const followers = new AsyncLocalStorage<WorkFollower>();

/** `work` run with `follower` told what it does. */
export function followWork<T>(
  follower: WorkFollower,
  work: () => Promise<T>,
): Promise<T> {
  return followers.run(follower, work);
}

/** Whether anyone is following the work this runs in. */
export const followed = () => followers.getStore() !== undefined;

// A follower that throws never breaks the work it follows.
const tell = (say: (follower: WorkFollower) => void) => {
  const follower = followers.getStore();
  if (!follower) return;
  try {
    say(follower);
  } catch {
    // only a report
  }
};

export const progressNow = (step: WorkStep) => tell((f) => f.step(step));
export const noticeRetry = (notice: RetryNotice) =>
  tell((f) => f.retry(notice));
export const noticeRecovered = (service: WorkService, call?: string) =>
  tell((f) => f.recovered(service, call));

/** What kind of trouble a failed call is in. */
export type Trouble =
  'credit' | 'capped' | 'busy' | 'slow' | 'down' | 'refused' | 'failed';

/** The status, words and name an error carries, the SDK's last try's first. */
function partsOf(error: unknown): {
  status?: number;
  said: string;
  name: string;
} {
  if (!error || typeof error !== 'object')
    return { said: typeof error === 'string' ? error : '', name: '' };
  const e = error as {
    lastError?: unknown;
    cause?: unknown;
    statusCode?: number;
    status?: number;
    message?: string;
    responseBody?: string;
    name?: string;
    code?: string;
  };
  const inner = e.lastError ?? null;
  const own = {
    status: e.statusCode ?? e.status,
    said: `${e.message ?? ''} ${e.responseBody ?? ''} ${e.code ?? ''}`,
    name: e.name ?? '',
  };
  if (inner) {
    const last = partsOf(inner);
    return {
      status: last.status ?? own.status,
      said: `${last.said} ${own.said}`,
      name: last.name || own.name,
    };
  }
  if (e.cause && typeof e.cause === 'object') {
    const cause = partsOf(e.cause);
    return {
      status: own.status ?? cause.status,
      said: `${own.said} ${cause.said}`,
      name: own.name || cause.name,
    };
  }
  return own;
}

/**
 * The trouble a call is in, from its error or from the status and body
 * that came back: out of credit, a day's limit reached, busy (a rate
 * limit), slow (a timeout), down (a 5xx, a dropped connection), refused
 * (any other 4xx), or simply failed (anything else, our own code's).
 */
export function troubleOf(
  error?: unknown,
  status?: number,
  body?: string,
): Trouble {
  const parts = partsOf(error);
  const code = status ?? parts.status;
  const said = `${parts.said} ${body ?? ''}`;
  if (
    code === 402 ||
    /insufficient[_ ]balance|out of credit|credit balance|billing|prepay|payment required/i.test(
      said,
    )
  )
    return 'credit';
  if (/per[_ ]?day|daily|day's quota/i.test(said) && /quota|limit/i.test(said))
    return 'capped';
  if (
    code === 429 ||
    code === 529 ||
    /rate.?limit|too many requests|overloaded|resource_exhausted|quota|at capacity|\bbusy\b/i.test(
      said,
    )
  )
    return 'busy';
  if (
    code === 408 ||
    code === 504 ||
    /TimeoutError|AbortError/.test(parts.name) ||
    /timed? ?out|timeout|ETIMEDOUT/i.test(said)
  )
    return 'slow';
  if (
    (code !== undefined && code >= 500) ||
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network|terminated/i.test(
      said,
    )
  )
    return 'down';
  if (code !== undefined && code >= 400) return 'refused';
  return 'failed';
}

const WHO: Record<WorkService, { name: string; service: string }> = {
  writer: { name: 'The writer', service: 'The writing service' },
  voice: { name: 'The voice service', service: 'The voice service' },
  artist: { name: 'The artist', service: 'The drawing service' },
  judge: { name: 'The picture check', service: 'The picture check' },
};

/** Why a call failed, in the maker's words: "The writer is busy". */
export function troubleWords(service: WorkService, trouble: Trouble): string {
  const { name, service: whole } = WHO[service];
  switch (trouble) {
    case 'credit':
      return `${whole} is out of credit`;
    case 'capped':
      return `${whole} has reached its limit for today`;
    case 'busy':
      return service === 'voice'
        ? `${name} is at its limit`
        : `${name} is busy`;
    case 'slow':
      return `${name} is slow to answer`;
    case 'down':
      return `${name} can't be reached`;
    case 'refused':
      return `${name} turned the request down`;
    case 'failed':
      return 'That did not work';
  }
}

/** Seconds, as a person would say them: "40 s", "2 min". */
export const waitWords = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
};

/**
 * A retry in a line: "The writer is busy, trying again (2 of 3)", "The
 * voice service is at its limit, waiting 40 s", or, given up, the reason
 * alone.
 */
export function retryWords(retry: {
  reason: string;
  attempt?: number;
  of?: number;
  waitMs?: number;
  final?: boolean;
  waiting?: boolean;
}): string {
  if (retry.final) return retry.reason;
  const count =
    retry.attempt !== undefined && retry.of !== undefined
      ? ` (${retry.attempt} of ${retry.of})`
      : '';
  if (retry.waiting && retry.waitMs)
    return `${retry.reason}, waiting ${waitWords(retry.waitMs)}`;
  if (retry.waitMs && retry.waitMs >= 5_000)
    return `${retry.reason}, trying again in ${waitWords(retry.waitMs)}${count}`;
  return `${retry.reason}, trying again${count}`;
}
