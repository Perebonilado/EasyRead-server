/**
 * An explainer's moments to stop and think (studio-explainer-plan, Ask 9,
 * ideas 1 and 13), held to by code:
 *
 *  - Pause-and-think checkpoints. The scenes the audience's recipe spaces
 *    checks into (studio-audience checksAt) ask the viewer one question,
 *    with two or three answers to pick; the player pauses there and shows
 *    them. Only those scenes keep answers, and each keeps one question's:
 *    how often the film stops is the recipe's, never the writer's. A check
 *    scene whose question came without answers is asked for them only on
 *    the one send-back it already has (they ride along, never a call of
 *    their own).
 *  - Whether the player pauses by default: on for children, off for
 *    grown-ups; the viewer's own setting wins.
 *  - A cold open: the first scene opens, within its first eight seconds,
 *    on a question, a surprise or a situation the viewer knows. One that
 *    does not is told so on its one send-back, if it has one.
 *
 * Pure: no model, no I/O.
 */
import type { AudienceBand } from './studio-audience';
import type { SheetProblem } from './studio-check';
import type { ExplainerSheet } from './studio';
import { choicesOf } from '../scene-checkpoint';

// ── Whether the player pauses ──────────────────────────────────────────────

/** The bands the player pauses for by default: children, up to about fourteen. */
export const PAUSING_BANDS: ReadonlySet<AudienceBand> = new Set([
  'early-years',
  'primary-lower',
  'primary-upper',
  'secondary-lower',
]);

/** Whether a film for this audience pauses for its questions unless the viewer says otherwise. */
export const pausesFor = (band: AudienceBand | null | undefined): boolean =>
  band ? PAUSING_BANDS.has(band) : false;

// ── A check scene's one question ───────────────────────────────────────────

type DraftBeat = ExplainerSheet['draft']['beats'][number];

/** Whether a sentence carries answers the stage could show: sound, and a sentence after it to answer. */
const answerable = (beats: readonly DraftBeat[], k: number) =>
  k < beats.length - 1 &&
  Boolean(choicesOf(beats[k].choices, beats[k].delivery));

/**
 * A scene's answers as its audience's checks have them: a scene that is
 * no check keeps none (its questions are said and answered as they are);
 * a check scene keeps its first answerable question's, and no other's.
 * With a check scene that has none, what its one send-back asks for.
 */
export function keepCheckpoint(
  sheet: ExplainerSheet,
  check: boolean,
): {
  sheet: ExplainerSheet;
  kept: number | null;
  problem: SheetProblem | null;
} {
  const beats = sheet.draft.beats;
  const at = check ? beats.findIndex((_, k) => answerable(beats, k)) : -1;
  const changed = beats.some((b, k) => k !== at && b.choices);
  const out: ExplainerSheet = changed
    ? {
        ...sheet,
        draft: {
          ...sheet.draft,
          beats: beats.map((b, k) =>
            k !== at && b.choices ? { ...b, choices: null } : b,
          ),
        },
      }
    : sheet;
  return {
    sheet: out,
    kept: at >= 0 ? at : null,
    problem:
      check && at < 0
        ? {
            rule: 'checkpoint',
            message:
              'Give the question to the viewer its choices: two or three short answers, one of them right, and say the right answer in the sentence after it.',
            beat: null,
            level: 'warning',
          }
        : null,
  };
}

// ── The cold open ──────────────────────────────────────────────────────────

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
