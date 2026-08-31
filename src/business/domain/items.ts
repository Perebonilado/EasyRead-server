/**
 * What makes a generated item fit to show a student.
 *
 * Two failures matter, and prompts alone fix neither:
 *
 *  - **Ungrounded items**: a question whose answer isn't in the source, or
 *    is simply wrong. Caught by a second model pass (see the assessment
 *    port), not here.
 *  - **Test-wise items**: a question answerable without knowing anything,
 *    because the right option is the longest, or always in position B, or
 *    the distractors aren't really wrong. That is a *mechanical* property,
 *    so it is checked mechanically here rather than asked for politely in
 *    a prompt.
 *
 * Everything in this file is pure. An item either passes or is told exactly
 * why it didn't.
 */

export type ItemKind = 'mcq' | 'flashcard' | 'cloze' | 'true_false' | 'short';

export interface DraftItem {
  kind: ItemKind;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint: string | null;
  topicTitle: string | null;
}

export interface RejectedItem {
  item: DraftItem;
  reason: string;
}

/**
 * The longest option is a tell — but only when the gap is big enough to
 * see. Both conditions must hold, because a ratio alone is brutal on short
 * options ("Density gradients" is 1.7x "Solar wind" and gives away
 * nothing), while an absolute gap alone would miss padding among long ones.
 */
const MAX_LENGTH_RATIO = 1.6;
const MIN_LENGTH_GAP = 20;

/** Options that give the game away regardless of content. */
const BANNED_OPTIONS = [
  'all of the above',
  'none of the above',
  'both a and b',
  'all of these',
  'none of these',
];

const normalise = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');

const median = (numbers: number[]): number => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Is this item mechanically sound? Returns null when fine, or the reason.
 *
 * Deliberately strict about the correct answer being longest: it is the
 * single most exploited cue in multiple choice, and an item that leaks its
 * answer teaches nothing while still feeling like a test.
 */
export function inspectItem(item: DraftItem): string | null {
  if (!item.stem.trim()) return 'empty stem';
  if (!item.explanation.trim()) return 'no explanation';

  if (item.kind === 'flashcard' || item.kind === 'short') {
    return item.options.length === 1 && item.options[0].trim()
      ? null
      : 'needs exactly one answer';
  }

  if (item.options.length < 2) return 'too few options';
  if (item.correctIndex < 0 || item.correctIndex >= item.options.length) {
    return 'correct answer is not one of the options';
  }
  if (item.options.some((option) => !option.trim())) return 'blank option';

  const seen = new Set(item.options.map(normalise));
  if (seen.size !== item.options.length) return 'duplicate options';

  if (
    item.options.some((option) => BANNED_OPTIONS.includes(normalise(option)))
  ) {
    return 'uses an "all of the above" style option';
  }

  // True/false items are two fixed options; length cues cannot apply.
  if (item.kind !== 'true_false') {
    const lengths = item.options.map((option) => option.trim().length);
    const correctLength = lengths[item.correctIndex];
    const others = lengths.filter((_, index) => index !== item.correctIndex);
    const typical = median(others);
    if (
      correctLength > typical * MAX_LENGTH_RATIO &&
      correctLength - typical >= MIN_LENGTH_GAP
    ) {
      return 'correct answer is conspicuously longer than the distractors';
    }
  }

  return null;
}

export interface SiftResult {
  kept: DraftItem[];
  rejected: RejectedItem[];
}

/**
 * Filters a generated batch, then evens out where the answers sit.
 *
 * Models cluster correct answers in the same position, and a student who
 * notices scores well without reading. Rotating the correct option to a
 * balanced position afterwards is deterministic and costs nothing, which
 * beats asking the generator to vary it and hoping.
 */
export function siftItems(items: DraftItem[]): SiftResult {
  const kept: DraftItem[] = [];
  const rejected: RejectedItem[] = [];
  const seenStems = new Set<string>();

  for (const item of items) {
    const reason = inspectItem(item);
    if (reason) {
      rejected.push({ item, reason });
      continue;
    }
    const stem = normalise(item.stem);
    if (seenStems.has(stem)) {
      rejected.push({ item, reason: 'duplicate question' });
      continue;
    }
    seenStems.add(stem);
    kept.push(item);
  }

  return { kept: balanceAnswerPositions(kept), rejected };
}

/**
 * Rotates each item's options so correct answers spread evenly across
 * positions. Order within an item is arbitrary, so this changes nothing a
 * student could call unfair.
 */
export function balanceAnswerPositions(items: DraftItem[]): DraftItem[] {
  const counts = new Map<number, number>();

  return items.map((item) => {
    // Only shuffle where position is meaningful and free to change.
    if (item.options.length < 3) return item;

    let target = 0;
    let fewest = Infinity;
    for (let index = 0; index < item.options.length; index += 1) {
      const used = counts.get(index) ?? 0;
      if (used < fewest) {
        fewest = used;
        target = index;
      }
    }
    counts.set(target, (counts.get(target) ?? 0) + 1);

    const options = [...item.options];
    const [correct] = options.splice(item.correctIndex, 1);
    options.splice(target, 0, correct);
    return { ...item, options, correctIndex: target };
  });
}

/**
 * Item statistics, once enough people have answered.
 *
 * `pValue` is the proportion who got it right: the only honest measure of
 * difficulty, as against the adjective the generator was handed.
 *
 * `discrimination` is the point-biserial correlation between getting THIS
 * item right and doing well overall. A negative value means the students
 * who know the material are getting it wrong more often than those who
 * don't, which is the signature of a broken item — a wrong answer key, or
 * a stem that misleads precisely the people paying attention.
 */
export interface ItemStats {
  pValue: number;
  discrimination: number | null;
  n: number;
}

/** Below this, an item is actively misleading and should be retired. */
export const BROKEN_DISCRIMINATION = -0.1;
/** Statistics on fewer responses than this are noise. */
export const MIN_STATS_RESPONSES = 8;

export function itemStats(
  responses: { correct: boolean; overallScore: number }[],
): ItemStats {
  const n = responses.length;
  if (n === 0) return { pValue: 0, discrimination: null, n: 0 };

  const correct = responses.filter((r) => r.correct);
  const pValue = correct.length / n;

  if (n < MIN_STATS_RESPONSES || correct.length === 0 || correct.length === n) {
    return { pValue, discrimination: null, n };
  }

  // Point-biserial: how far the mean overall score of those who got it
  // right sits from everyone's mean, scaled by spread.
  const scores = responses.map((r) => r.overallScore);
  const mean = scores.reduce((sum, s) => sum + s, 0) / n;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd === 0) return { pValue, discrimination: null, n };

  const meanCorrect =
    correct.reduce((sum, r) => sum + r.overallScore, 0) / correct.length;
  const q = 1 - pValue;
  const discrimination = ((meanCorrect - mean) / sd) * Math.sqrt(pValue / q);

  return { pValue, discrimination, n };
}

/** Should this item stop being served? */
export function isBroken(stats: ItemStats): boolean {
  return (
    stats.n >= MIN_STATS_RESPONSES &&
    stats.discrimination !== null &&
    stats.discrimination < BROKEN_DISCRIMINATION
  );
}
