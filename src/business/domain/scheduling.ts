/**
 * When should this come back?
 *
 * An implementation of FSRS (Free Spaced Repetition Scheduler), which models
 * memory as two quantities per item per person:
 *
 *  - **stability**: how many days until recall probability falls to 90%.
 *  - **difficulty**: 1..10, how hard this particular item is for this person.
 *
 * Chosen over SM-2 because SM-2 only ever multiplies a fixed ease factor,
 * which handles a missed week badly and cannot tell a genuinely hard item
 * from an unlucky one. FSRS derives the interval from a decay curve, so a
 * review that arrives late is *more* informative, not a scheduling error.
 *
 * Deliberately pure: no clock, no database. `now` is passed in, and every
 * output is a value. That is what makes the whole thing testable without
 * waiting days for an interval to elapse.
 */

/** How the answer went. Maps onto the four-button FSRS grade scale. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Memory {
  stability: number;
  difficulty: number;
  state: CardState;
  reps: number;
  lapses: number;
  /** Days since the last review; 0 for a card seen today or never. */
  elapsedDays: number;
}

export interface Scheduled extends Memory {
  /** Days until this should next be shown. */
  intervalDays: number;
  dueAt: Date;
}

/**
 * The published FSRS-5 default weights, from the reference implementation's
 * fitted parameters. Named rather than inlined so a future per-user fit has
 * an obvious seam to replace.
 */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

/** Recall probability the scheduler aims for at the moment of review. */
const REQUEST_RETENTION = 0.9;
/** Beyond roughly this, intervals stop meaning anything useful. */
const MAX_INTERVAL_DAYS = 365 * 2;
const DECAY = -0.5;
const FACTOR = 19 / 81;

const GRADE: Record<Rating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

const clampDifficulty = (d: number): number => Math.min(10, Math.max(1, d));

/** Recall probability of an item `elapsed` days after a review. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** The interval at which retrievability decays to the target retention. */
function intervalFor(stability: number): number {
  const raw =
    (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(raw)));
}

function initialStability(rating: Rating): number {
  return Math.max(0.1, W[GRADE[rating] - 1]);
}

function initialDifficulty(rating: Rating): number {
  return clampDifficulty(W[4] - Math.exp(W[5] * (GRADE[rating] - 1)) + 1);
}

function nextDifficulty(difficulty: number, rating: Rating): number {
  const delta = -W[6] * (GRADE[rating] - 3);
  const damped = difficulty + delta * ((10 - difficulty) / 9);
  // Mean reversion towards the difficulty an "easy" first answer implies,
  // so a long tail of "good"s cannot drift an item to trivial forever.
  const reverted = W[7] * initialDifficulty('easy') + (1 - W[7]) * damped;
  return clampDifficulty(reverted);
}

function stabilityOnSuccess(
  difficulty: number,
  stability: number,
  r: number,
  rating: Rating,
): number {
  const hardPenalty = rating === 'hard' ? W[15] : 1;
  const easyBonus = rating === 'easy' ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - difficulty) *
    Math.pow(stability, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return stability * (1 + growth);
}

function stabilityOnLapse(
  difficulty: number,
  stability: number,
  r: number,
): number {
  return (
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r))
  );
}

export const NEW_MEMORY: Memory = {
  stability: 0,
  difficulty: 0,
  state: 'new',
  reps: 0,
  lapses: 0,
  elapsedDays: 0,
};

/**
 * The whole scheduler: memory in, memory out, plus when to come back.
 *
 * A lapse never sends an item back to zero — it keeps a reduced stability
 * and enters `relearning`, because someone who has known a fact for months
 * and blanks once has not lost it the way a first-time learner has.
 */
export function schedule(memory: Memory, rating: Rating, now: Date): Scheduled {
  const failed = rating === 'again';

  if (memory.state === 'new' || memory.stability <= 0) {
    const stability = initialStability(rating);
    const difficulty = initialDifficulty(rating);
    // A failed first attempt comes back inside the same session rather than
    // tomorrow: nothing has been learned yet to space out.
    const intervalDays = failed ? 0 : intervalFor(stability);
    return {
      stability,
      difficulty,
      state: failed ? 'learning' : 'review',
      reps: memory.reps + 1,
      lapses: memory.lapses + (failed ? 1 : 0),
      elapsedDays: 0,
      intervalDays,
      dueAt: addDays(now, intervalDays),
    };
  }

  const r = retrievability(memory.elapsedDays, memory.stability);
  const difficulty = nextDifficulty(memory.difficulty, rating);
  const stability = failed
    ? stabilityOnLapse(difficulty, memory.stability, r)
    : stabilityOnSuccess(difficulty, memory.stability, r, rating);

  const safeStability = Math.max(0.1, stability);
  const intervalDays = failed ? 0 : intervalFor(safeStability);

  return {
    stability: safeStability,
    difficulty,
    state: failed ? 'relearning' : 'review',
    reps: memory.reps + 1,
    lapses: memory.lapses + (failed ? 1 : 0),
    elapsedDays: 0,
    intervalDays,
    dueAt: addDays(now, intervalDays),
  };
}

/**
 * Rating from a graded answer, so callers never hand-roll one.
 *
 * Confidence matters: getting something right while guessing is weaker
 * evidence than getting it right while sure, and FSRS has no other way to
 * hear that. A confident wrong answer is the strongest signal of all that
 * the item needs to come back soon, which `again` already delivers.
 */
export function ratingFor(correct: boolean, confidence?: number): Rating {
  if (!correct) return 'again';
  if (confidence === undefined) return 'good';
  if (confidence <= 0.35) return 'hard';
  if (confidence >= 0.9) return 'easy';
  return 'good';
}

export function addDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  // A same-day repeat lands ten minutes out: far enough not to be the very
  // next card, close enough to still be this session.
  if (days <= 0) {
    next.setMinutes(next.getMinutes() + 10);
    return next;
  }
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days between two instants, floored at zero. */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
