/**
 * Reading dwell: turning "time on a page" into a comprehension judgement.
 *
 * The rule this file exists to enforce is that *nothing raw is stored*. A
 * visit arrives, is compared against how long that page should take, and is
 * either interpreted into a signal or dropped. There is no dwell table, no
 * reading timeline, nothing to mine later — the app keeps its opinion, not
 * your behaviour.
 */

/** Comfortable reading speed for simplified prose. */
const WORDS_PER_MINUTE = 200;

/** Below this, page length stops being informative. */
const MIN_EXPECTED_MS = 10_000;

/** How many times the expected duration counts as being stuck. */
export const LONG_DWELL_RATIO = 3;

/** How far back a page must be, and how long visited, to count as a reread. */
export const REREAD_GAP = 3;
export const REREAD_MIN_MS = 20_000;

/** Visits outside this band tell us nothing and are discarded. */
export const MIN_VISIT_MS = 3_000;
export const MAX_VISIT_MS = 300_000;

export interface DwellVisit {
  page: number;
  /** Words on that page, at the level the reader was actually reading. */
  words: number;
  ms: number;
}

export type DwellVerdict =
  | { kind: 'long_dwell'; page: number; ms: number; expected: number }
  | { kind: 'reread'; page: number; ms: number }
  | null;

export function expectedMs(words: number): number {
  return Math.max(MIN_EXPECTED_MS, (words / WORDS_PER_MINUTE) * 60_000);
}

/**
 * Judge one visit. `furthestPage` is how far the reader has ever got — going
 * back to something well behind it is a different act from reading on.
 */
export function judgeVisit(
  visit: DwellVisit,
  furthestPage: number,
): DwellVerdict {
  if (visit.ms < MIN_VISIT_MS) return null;
  const ms = Math.min(visit.ms, MAX_VISIT_MS);

  const expected = expectedMs(visit.words);
  if (ms / expected >= LONG_DWELL_RATIO) {
    return { kind: 'long_dwell', page: visit.page, ms, expected };
  }

  // A deliberate return to earlier material — not a glance at the page you
  // just left, which is why the gap matters as much as the duration.
  if (furthestPage - visit.page >= REREAD_GAP && ms >= REREAD_MIN_MS) {
    return { kind: 'reread', page: visit.page, ms };
  }

  return null;
}
