/**
 * An explainer's lines joined into one chain (Richard, 2026-10-01, from a
 * short science video he held up): "it can wiggle all on its own, because
 * they fit a computer on there. And what happens is you send light to this
 * part, which then moves the water..." Each line carries on from the one
 * before it, by a link word ("because", "so", "which then", "that's why")
 * or by picking up what the last one ended on ("...makes antibodies. Those
 * antibodies..."), so the learner follows one thread of cause and effect
 * instead of holding a list of separate facts.
 *
 * Measured by code: a line that starts cold, with no link to the lines
 * just before it, is counted; a scene where most of its lines do is told
 * so on its one send-back, if it has one (it rides along, never a send-
 * back of its own). Lines that need no link are left out of the count: the
 * first, a hook, a question, the answer after a question, and the first
 * line of a new idea (a long pause before it).
 *
 * English only, and lenient on purpose: any link word near the start, a
 * pronoun anywhere, or a word carried over from either of the two lines
 * before counts as a link, so a scene is only flagged when it plainly
 * reads as a list.
 *
 * Pure: no model, no I/O.
 */
import { plainStem } from '../lecture';
import type { SceneDelivery } from '../scene-script';
import type { SheetProblem } from './studio-check';
import { measurePlain, sentencesIn } from './studio-plain';

/** A line of a scene, as the chain is measured on it. */
interface ChainBeat {
  say: string;
  delivery: SceneDelivery;
  pause: 'short' | 'long';
}

/** The words of a line, lowercased, apostrophes kept ("that's", "it's"). */
const tokensOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);

/**
 * Words that tie a line to the one before when it opens on them: a cause
 * or a result, a turn, a next step, or a word pointing back at what was
 * just said.
 */
const LINK_WORDS = new Set(
  (
    "and but so because since then now which that that's this these those " +
    "it it's its they they're their them he she his her him there there's here here's " +
    'as once when whenever after before instead without still yet or if even ' +
    'next finally soon meanwhile also too otherwise however unlike both each ' +
    'same result reason means why therefore thus hence'
  ).split(/\s+/),
);

/** Link words that tie a line on even a word or two in ("The germ then...", "Your body, because..."). */
const LINK_INSIDE = new Set(
  'so because then which therefore thus hence also still instead now too'.split(
    ' ',
  ),
);

/** Openings of more than one word that tie a line to the one before. */
const LINK_OPENINGS =
  /^(?:in turn|in other words|in the same way|at the same time|on top of that|in fact|for example|for instance|what happens|the result|the reason|the answer|the same|the trick|the catch|the problem|the key|the secret)\b/;

/** Words that point back at something already said, wherever they come in a line. */
const POINTING_BACK = new Set([
  'it',
  "it's",
  'its',
  'itself',
  'they',
  "they're",
  'them',
  'their',
  'themselves',
  'this',
  'these',
  'those',
]);

/** Words too common to carry a thread from one line to the next. */
const COMMON = new Set(
  (
    'the a an and or but so of to in on at by for with from into onto up down out off over under ' +
    'is are was were be been being am has have had do does did will would can could should may might must ' +
    'what which who whom whose when where why how than then as if not no yes all any some each every ' +
    'more most much many very just also only even still you your yours we our us he she his her him ' +
    'i me my one two get gets got make makes made like about after before again now way ways thing things ' +
    'really lot lots too own same other another back because while through between without within around ' +
    'across once let lets go goes going went come comes came there here that this these those it its they ' +
    'them their see sees look looks something someone anything everything kind kinds part parts'
  ).split(/\s+/),
);

/** A line's own words that could carry a thread, as stems, in order. */
const contentStems = (tokens: readonly string[]): string[] =>
  tokens
    .filter((w) => w.length >= 3 && !COMMON.has(w) && !/^\d/.test(w))
    .map((w) => plainStem(w.replace(/'s$/, '')));

/** Whether a line opens with a link word or a linking phrase. */
export function opensWithLink(sentence: string): boolean {
  const tokens = tokensOf(sentence);
  if (LINK_OPENINGS.test(tokens.join(' '))) return true;
  if (tokens[0] && LINK_WORDS.has(tokens[0])) return true;
  return tokens.slice(1, 3).some((w) => LINK_INSIDE.has(w));
}

/**
 * Whether a line carries on from the lines before it: a link word near
 * its start, a word pointing back anywhere in it, or a word one of the
 * two lines before it said (not the same subject opening both, which is
 * a list: "The heart has... The heart pumps...").
 */
export function carriesOn(
  sentence: string,
  before: readonly string[],
): boolean {
  if (opensWithLink(sentence)) return true;
  const tokens = tokensOf(sentence);
  if (tokens.some((w) => POINTING_BACK.has(w))) return true;
  const mine = contentStems(tokens);
  if (!mine.length) return true;
  return before.slice(-2).some((earlier) => {
    const theirs = contentStems(tokensOf(earlier));
    const shared = new Set(theirs);
    // The same subject opening both lines is a list, not a chain.
    if (theirs[0] && theirs[0] === mine[0]) shared.delete(mine[0]);
    return mine.some((stem) => shared.has(stem));
  });
}

/** How well a scene's lines are joined into one chain. */
export interface ChainMeasure {
  /** Lines that ought to carry on from the one before. */
  counted: number;
  /** Those that start cold, by their beat and their words. */
  cold: { beat: number; say: string }[];
  /** Cold over counted; 0 when none is counted. */
  share: number;
}

/** A scene's lines measured for how they join, a sentence at a time. */
export function measureChain(beats: readonly ChainBeat[]): ChainMeasure {
  const said: string[] = [];
  const cold: ChainMeasure['cold'] = [];
  let counted = 0;
  let lastQuestion = false;
  beats.forEach((beat, b) => {
    const newIdea = b > 0 && beats[b - 1].pause === 'long';
    const sentences = sentencesIn(beat.say);
    sentences.forEach((sentence, s) => {
      const first = s === 0;
      const exempt =
        said.length === 0 ||
        lastQuestion ||
        sentence.trim().endsWith('?') ||
        (first &&
          (newIdea ||
            beat.delivery === 'hook' ||
            beat.delivery === 'question'));
      if (!exempt) {
        counted += 1;
        if (!carriesOn(sentence, said)) cold.push({ beat: b, say: sentence });
      }
      said.push(sentence);
      lastQuestion =
        sentence.trim().endsWith('?') ||
        (beat.delivery === 'question' && s === sentences.length - 1);
    });
  });
  return {
    counted,
    cold,
    share: counted ? Math.round((cold.length / counted) * 100) / 100 : 0,
  };
}

/** The fewest cold lines a scene is told about: a short scene is left alone. */
export const COLD_LEAST = 3;
/** More than this share of its lines cold, and a scene reads as a list. */
export const COLD_SHARE = 0.5;

/**
 * A scene whose lines mostly start cold, as a problem to ride along on
 * its one send-back; null when it reads as a chain, is too short to tell,
 * or is not in English.
 */
export function chainProblem(beats: readonly ChainBeat[]): SheetProblem | null {
  const text = beats.map((b) => b.say).join(' ');
  if (!measurePlain(text).english) return null;
  const chain = measureChain(beats);
  if (chain.cold.length < COLD_LEAST || chain.share <= COLD_SHARE) return null;
  const quoted = chain.cold
    .slice(0, 3)
    .map(({ beat, say }) => {
      const words = say.split(/\s+/);
      return `line ${beat + 1} ("${words.slice(0, 6).join(' ')}${words.length > 6 ? '…' : ''}")`;
    })
    .join(', ');
  return {
    rule: 'chain',
    message: `The lines read as separate facts, not one chain: ${chain.cold.length} of ${chain.counted} start cold, with nothing joining them to the line before, such as ${quoted}. Join each line to the last the way a cause leads to its effect: pick up what the line before ended on ("…makes antibodies. Those antibodies…"), or begin with a link ("so", "because", "which then", "that's why", "and that means").`,
    beat: chain.cold[0].beat,
    level: 'warning',
  };
}
