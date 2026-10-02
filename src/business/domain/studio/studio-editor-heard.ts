/**
 * What the producer hears of the editor's desk in the maker's own words,
 * by code, whatever the producer took them for (as studio-heard does for
 * the brief): which of the questions offered they pick, one of the plan's
 * episodes named by its title or its question, and "make it".
 */
import type {
  EditorAngle,
  EditorPlan,
  EditorPlanEpisode,
} from './studio-editor';
import { ANGLES_OFFERED } from './studio-editor';

const ORDINALS = ['first', 'second', 'third'];
const NUMBERS = ['one', 'two', 'three'];

/** Words that carry meaning, for matching what was said to what was offered. */
const LITTLE = new Set(
  'a an the of to in on at by for and or but so is are was were be it its this that what why how when where who which with from as did does do can could would should will'.split(
    ' ',
  ),
);
const keyWords = (said: string) =>
  said
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w.length > 2 && !LITTLE.has(w));

/** How much of `of`'s meaning `said` has, 0 to 1. */
function overlap(said: string, of: string): number {
  const words = keyWords(of);
  if (!words.length) return 0;
  const heard = new Set(keyWords(said));
  return words.filter((w) => heard.has(w)).length / words.length;
}

const LEFT_TO_US =
  /\b(?:you (?:choose|pick|decide)|up to you|leave it to (?:you|the studio)|let (?:the studio|you|it) (?:choose|pick|decide)|surprise me|(?:any|either) (?:one|is fine|will do)|whichever|dealer'?s choice|you know best)\b/iu;

/**
 * Which of the questions offered the maker's words pick: its place (from
 * 0), null for "you choose", undefined for words about none of them.
 */
export function angleHeard(
  words: string,
  angles: readonly Pick<EditorAngle, 'question'>[],
): number | null | undefined {
  const said = words.trim().toLowerCase();
  if (!said || !angles.length) return undefined;
  if (LEFT_TO_US.test(said)) return null;
  const offered = Math.min(ANGLES_OFFERED, angles.length);
  // A place said as a reply ("the second one", "go with the first"),
  // never a word in a sentence of its own ("who first counted the year?").
  const place =
    /(?:^|\bthe\s+|\bwith\s+(?:the\s+)?)(first|second|third)(?:\s+(?:one|question|angle|option))?(?:\s+please)?[.!]?$/u.exec(
      said,
    )?.[1] ??
    /\b(?:number|option|question|no\.?)\s*(one|two|three|[1-3])\b/u.exec(
      said,
    )?.[1] ??
    /^(?:the\s+)?([1-3])(?:st|nd|rd)?\b(?:\s*(?:one|please))?[.!]?$/u.exec(
      said,
    )?.[1];
  if (place) {
    const k = /^\d$/u.test(place)
      ? Number(place) - 1
      : Math.max(ORDINALS.indexOf(place), NUMBERS.indexOf(place));
    if (k >= 0 && k < offered) return k;
  }
  // The question itself, or most of it.
  let best = -1;
  let score = 0;
  angles.slice(0, offered).forEach((angle, k) => {
    const s = overlap(said, angle.question);
    if (s > score) [best, score] = [k, s];
  });
  return best >= 0 && score >= 0.6 ? best : undefined;
}

/**
 * The plan's episode the maker's words name, not begun yet: by its title
 * or its question (as the end card's chips and the producer's buttons say
 * them, "Episode 2: …" or not), or "the next one". Null for none.
 */
export function plannedHeard(
  words: string,
  plan: Pick<EditorPlan, 'episodes'> | null | undefined,
): EditorPlanEpisode | null {
  const waiting = (plan?.episodes ?? []).filter((e) => !e.episodeId);
  if (!waiting.length) return null;
  const said = words
    .trim()
    .replace(/^episode\s+\d+\s*[:.-]\s*/iu, '')
    .replace(/[.?!]+$/u, '')
    .toLowerCase();
  if (!said) return null;
  if (
    /^(?:(?:make|do|start|write|yes,?)\s+)?(?:the\s+)?next(?:\s+(?:one|episode|part))?(?:\s+please)?$/u.test(
      said,
    )
  )
    return waiting[0];
  const exact = waiting.find(
    (e) =>
      e.title.toLowerCase().replace(/[.?!]+$/u, '') === said ||
      e.question.toLowerCase().replace(/[.?!]+$/u, '') === said,
  );
  if (exact) return exact;
  let best: EditorPlanEpisode | null = null;
  let score = 0;
  for (const e of waiting) {
    const s = Math.max(overlap(said, e.title), overlap(said, e.question));
    if (s > score) [best, score] = [e, s];
  }
  return score >= 0.75 ? best : null;
}

/** Whether the maker's words ask for the episode to be made now: "Make it", "go ahead". */
export const makeHeard = (words: string) =>
  /^(?:(?:yes|ok(?:ay)?|great|perfect|lovely|good)[,!. ]+)?(?:please\s+)?(?:make it|make (?:the|this) (?:film|episode|video)|make it now|go ahead(?: and make it)?|let'?s make it)(?:\s+(?:please|now))?[.!]*$/iu.test(
    words.trim(),
  );
