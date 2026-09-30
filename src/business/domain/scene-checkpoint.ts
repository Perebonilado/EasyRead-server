/**
 * A lesson's moments to stop and think (studio-explainer-plan, Ask 9,
 * ideas 1 and 2), as a scene carries them:
 *
 *  - A question put to the viewer may carry its answers (`choices`): two
 *    or three short ones, exactly one of them right, the right one said
 *    by the sentence after. The player can pause on it and show them as
 *    chips. Written by the lesson's writer in the same call as the rest,
 *    made sound here by code, and dropped (the question stays a plain
 *    one) when they cannot be.
 *  - Where each of a scene's small ideas (the outline's points) starts,
 *    found by code in its sentences: the player's scrubber marks each,
 *    and its back and forward go one idea at a time.
 *
 * Pure: no model, no I/O.
 */
import { wordKey } from './scene-ids';

/** One answer to a question, as a checkpoint shows it. */
export interface SceneChoice {
  text: string;
  right: boolean;
}

/** A question shows two or three answers. */
export const CHOICES = [2, 3] as const;
/** An answer is short: a chip, never a sentence. */
export const CHOICE_WORDS = 7;
export const CHOICE_CHARS = 48;

const clean = (text: unknown) =>
  typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';

/**
 * A question's answers made sound, or none: only on a question, two or
 * three distinct answers of a few words each, exactly one right. An answer
 * a little long is cut at its last whole word; one with nothing in it is
 * dropped; more than three keeps the right one and the first wrong ones.
 */
export function choicesOf(
  raw: unknown,
  delivery: string | undefined,
): SceneChoice[] | undefined {
  if (delivery !== 'question' || !Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const all: SceneChoice[] = [];
  for (const one of raw as unknown[]) {
    const said =
      one && typeof one === 'object' ? (one as Record<string, unknown>) : {};
    let text = clean(said.text).replace(/[.;:,]+$/, '');
    const words = text.split(' ').filter(Boolean);
    if (words.length > CHOICE_WORDS)
      text = words.slice(0, CHOICE_WORDS).join(' ');
    if (text.length > CHOICE_CHARS)
      text = text.slice(0, CHOICE_CHARS).replace(/\s+\S*$/, '');
    const key = wordKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push({ text, right: said.right === true });
  }
  const right = all.filter((c) => c.right);
  if (right.length !== 1) return undefined;
  const wrong = all.filter((c) => !c.right);
  if (!wrong.length) return undefined;
  // The right one stays where the writer put it among the first three.
  const kept = all.filter((c) => c.right || wrong.indexOf(c) < CHOICES[1] - 1);
  return kept.length >= CHOICES[0] ? kept : undefined;
}

// ── Where each idea starts ─────────────────────────────────────────────────

/** Words that say nothing of which idea a sentence is on. */
const PLAIN = new Set(
  (
    'a an the and or but so of to in on at by for from with as is are was ' +
    'were be been being it its this that these those there here then than ' +
    'what which who whom whose how why when where can could will would ' +
    'shall should may might must do does did done has have had not no yes ' +
    'we you your our us they their them he she his her i me my one two ' +
    'very more most much many some any each every all also just only into ' +
    'out up down over under about like show shows shown see seen make ' +
    'makes made get gets put puts let lets way thing things'
  ).split(' '),
);

/** A sentence's words that name things, each shortened to its stem. */
export function keysOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !PLAIN.has(w))
    .map((w) => w.replace(/(?:ing|ed|es|s)$/, '').slice(0, 7));
}

/** How much of what a point names a sentence says: 0 to 1. */
function overlap(point: string[], sentence: ReadonlySet<string>): number {
  if (!point.length) return 0;
  return point.filter((key) => sentence.has(key)).length / point.length;
}

/** A point matches a sentence that says at least this much of it. */
const MATCH = 0.25;
/** A sentence nearly as good as the best is as good: the first of them is taken. */
const NEAR = 0.8;
/** An idea's label, at most this long. */
export const IDEA_CHARS = 60;

/** A point said as a label: its idea, before what to show for it ("Newton's second law: the working…"). */
export function ideaLabel(point: string): string {
  const head = clean(point)
    .split(/\s*(?::|—|–| - |;|\()\s*/)[0]
    .replace(/[.,]+$/, '');
  const text = head || clean(point);
  if (text.length <= IDEA_CHARS) return text;
  return `${text.slice(0, IDEA_CHARS - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Where each of a scene's small ideas starts, by sentence, in order: each
 * point at the first sentence after the last idea's that says it nearly
 * as well as any (of the whole point, or of its idea before what to show),
 * the first idea always at the scene's first sentence. Without
 * points, or where too few are found, a new idea starts after each long
 * pause (where the writer changes idea), labelled by its first words.
 */
export function ideaStarts(
  beats: readonly { say: string; pause?: 'short' | 'long' }[],
  points: readonly string[],
  title = '',
): { beat: number; label: string }[] {
  if (!beats.length) return [];
  const said = beats.map((b) => new Set(keysOf(b.say)));
  const found: { beat: number; label: string; first?: boolean }[] = [];
  let from = 0;
  for (const point of points) {
    const keys = keysOf(point);
    const head = keysOf(ideaLabel(point));
    // How much of the point a sentence says: of all of it, or of its idea.
    const score = (k: number) =>
      Math.max(overlap(keys, said[k]), overlap(head, said[k]));
    let top = 0;
    for (let k = from; k < beats.length; k += 1) top = Math.max(top, score(k));
    if (top < MATCH) continue;
    // The first sentence from the last idea's on that says it nearly as
    // well as the best: where it is first taught, not a later echo.
    let best = from;
    while (score(best) < Math.max(MATCH, top * NEAR)) best += 1;
    found.push({
      beat: best,
      label: ideaLabel(point),
      first: found.length === 0 && point === points[0],
    });
    from = best + 1;
  }
  const enough = points.length > 0 && found.length * 2 >= points.length;
  const ideas: { beat: number; label: string }[] = enough
    ? found.map(({ beat, label }) => ({ beat, label }))
    : beats.flatMap((b, k) =>
        k === 0 || beats[k - 1].pause === 'long'
          ? [{ beat: k, label: ideaLabel(firstWords(b.say)) }]
          : [],
      );
  // The scene's start is always its first idea's: what comes before the
  // first idea found (a hook) leads into it.
  if (enough && found[0]?.first) ideas[0] = { ...ideas[0], beat: 0 };
  else if (!ideas.length || ideas[0].beat !== 0)
    ideas.unshift({
      beat: 0,
      label: ideaLabel(points[0] ?? (title || firstWords(beats[0].say))),
    });
  return ideas.filter((idea, i) => i === 0 || idea.beat !== ideas[i - 1].beat);
}

/** A sentence's opening, as a label. */
const firstWords = (say: string) => {
  const words = clean(say)
    .replace(/[.?!]+$/, '')
    .split(' ');
  return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : words.join(' ');
};
