/**
 * An explainer's cold open (studio-explainer-plan, Ask 9, idea 13), held
 * to by code: the first scene opens, within its first eight seconds, on a
 * question, a surprise or a situation the viewer knows. One that does not
 * is told so on its one send-back, if it has one.
 *
 * Pure: no model, no I/O.
 */
import type { SheetProblem } from './studio-check';
import type { ExplainerSheet } from './studio';

type DraftBeat = ExplainerSheet['draft']['beats'][number];

/** The first scene opens on its hook within this long. */
export const COLD_OPEN_MS = 8000;

/** A surprise: a fact said to astonish, or the words that promise one. */
const SURPRISE =
  /!|\b(?:imagine|did you know|guess what|believe it or not|what if|surpris\w*|amazing|incredible|strange|weird|secret|mystery|faster than|bigger than|smaller than|more than|every (?:second|minute|day|year)|millions?|billions?|trillions?)\b/i;

/**
 * A situation: the viewer, or someone, in a moment they know ("you drop a
 * ball", "Maya wakes up hot"): said to them, or in a moment of time.
 */
const SITUATION =
  /\b(?:you(?:'re|'ve|'d)?|your|we(?:'re)?|picture this|one (?:day|morning|night|evening)|last (?:night|week|summer)|this morning|when (?:you|we|she|he|they)|once upon|here is|meet)\b/i;

/**
 * Whether a lesson's first scene opens on a question, a surprise or a
 * situation within COLD_OPEN_MS, spoken at `wpm`: its sentences that
 * start within that time (the first always) looked at. A clip opening the
 * film is a situation by its nature. The problem to ride along if not.
 */
export function coldOpen(
  beats: readonly Pick<DraftBeat, 'say' | 'delivery'>[],
  wpm: number,
): SheetProblem | null {
  if (!beats.length) return null;
  const perMs = Math.max(60, wpm) / 60_000;
  let words = 0;
  for (const beat of beats) {
    if (words / perMs > COLD_OPEN_MS) break;
    const say = beat.say.trim();
    if (
      say.endsWith('?') ||
      beat.delivery === 'question' ||
      SURPRISE.test(say) ||
      SITUATION.test(say)
    )
      return null;
    words += say.split(/\s+/).filter(Boolean).length;
  }
  return {
    rule: 'cold-open',
    message:
      'Open the first scene, in its first sentence or two, on a question to the viewer, a surprising fact, or a small everyday situation they know, before explaining anything.',
    beat: 0,
    level: 'warning',
  };
}
