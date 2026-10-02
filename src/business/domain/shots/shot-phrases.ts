/**
 * The words a shot's changes land on (research §3.2: each change on the
 * exact words that cause it). A scene's narration is read as words, and
 * a phrase the board gives is found in it whatever its case, accents,
 * punctuation or quotes; a phrase that is not quite there is snapped to
 * the words nearest it; and a phrase said twice in a scene is made long
 * enough to be said once, so the timing (shot-time), or anything else
 * that looks for its first time, finds the place the board meant.
 *
 * Words are matched in any script: letters and digits of every language
 * are words, everything else parts them, an apostrophe joins ("don’t" is
 * one word) and a possessive is its name ("Nigeria’s" is Nigeria).
 */
import type { EditorialRow } from '../studio/studio-editorial';

/** A scene's narration as words. */
export interface Narration {
  /** Each word as matched: no case, no accents, no punctuation. */
  keys: string[];
  /** For each key, the place in `words` of the word it comes from ("self-government" is two keys of one word). */
  of: number[];
  /** The text's words as written, with their punctuation: a phrase is trimmed at its two ends only. */
  words: string[];
}

/**
 * A word's keys: "Nigeria’s" is ["nigeria"] (a possessive is its name),
 * "don’t" ["dont"], "self-government" ["self", "government"], "1,500"
 * ["1", "500"].
 */
export function keysOf(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]s\b/gu, '')
    .replace(/['’‘`]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** A text read as words, each with its keys. */
export function narrationOf(text: string): Narration {
  const out: Narration = { keys: [], of: [], words: [] };
  for (const raw of text.split(/\s+/u)) {
    const keys = keysOf(raw);
    if (!keys.length) continue;
    const at = out.words.length;
    out.words.push(raw);
    for (const key of keys) {
      out.keys.push(key);
      out.of.push(at);
    }
  }
  return out;
}

/** A scene's narration: its lines said one after another. */
export const sceneNarration = (rows: readonly Pick<EditorialRow, 'say'>[]) =>
  rows.map((r) => r.say).join(' ');

/** Where each line's words are among the scene's, as [first key, key after its last]. */
export function lineSpans(
  rows: readonly Pick<EditorialRow, 'say'>[],
): [number, number][] {
  let at = 0;
  return rows.map((row) => {
    const n = narrationOf(row.say).keys.length;
    const span: [number, number] = [at, at + n];
    at += n;
    return span;
  });
}

/**
 * Where a phrase's words start in the narration, looking from `from` up
 * to (not past) `to`; -1 when they are not there.
 */
export function phraseAt(
  n: Narration,
  phrase: string,
  from = 0,
  to = n.keys.length,
): number {
  const want = keysOf(phrase);
  if (!want.length) return -1;
  for (let at = Math.max(0, from); at + want.length <= to; at += 1) {
    let k = 0;
    while (k < want.length && n.keys[at + k] === want[k]) k += 1;
    if (k === want.length) return at;
  }
  return -1;
}

/**
 * The narration's own words for keys `at` to `at + length`, as the board
 * may write them: as written inside ("In 1961, Berlin"), without the
 * punctuation at the phrase's two ends.
 */
export function phraseText(n: Narration, at: number, length: number): string {
  if (length <= 0 || at < 0 || at >= n.keys.length) return '';
  const first = n.of[at];
  const last = n.of[Math.min(n.keys.length, at + length) - 1];
  return n.words
    .slice(first, last + 1)
    .join(' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, '');
}

/** A word without the ending a plural or a verb adds: "borders" is "border", "matches" "match". */
const stem = (key: string) =>
  key.length > 4 && /(?:ches|shes|sses|xes)$/u.test(key)
    ? key.slice(0, -2)
    : key.length > 3 && key.endsWith('s') && !key.endsWith('ss')
      ? key.slice(0, -1)
      : key;

/** Words too common to place a phrase by themselves. */
const COMMON = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'from',
  'with',
  'and',
  'or',
  'but',
  'so',
  'is',
  'was',
  'were',
  'are',
  'be',
  'been',
  'it',
  'its',
  'that',
  'this',
  'as',
  'into',
  'then',
  'than',
]);

/**
 * The narration's words nearest a phrase that is not in it, between
 * `from` and `to`: the run of about its length that shares the most of
 * its words (half of them at least, one not a common word), trimmed to
 * the words they share; null when none is that near.
 */
export function nearestPhrase(
  n: Narration,
  phrase: string,
  from = 0,
  to = n.keys.length,
): { at: number; length: number } | null {
  const want = keysOf(phrase);
  if (!want.length) return null;
  const hasContent = want.some((k) => !COMMON.has(k));
  let best: { at: number; length: number } | null = null;
  let score = 0;
  for (
    let length = Math.max(1, want.length - 1);
    length <= want.length + 1;
    length += 1
  )
    for (let at = Math.max(0, from); at + length <= to; at += 1) {
      const pool = n.keys.slice(at, at + length).map(stem);
      let shared = 0;
      let content = 0;
      for (const key of want) {
        const i = pool.indexOf(stem(key));
        if (i < 0) continue;
        pool.splice(i, 1);
        shared += 1;
        if (!COMMON.has(key)) content += 1;
      }
      const s = shared / Math.max(want.length, length);
      if (s > score && (content > 0 || !hasContent)) {
        best = { at, length };
        score = s;
      }
    }
  if (!best || score < 0.5) return null;
  // Tight to the words it shares: none it does not at either end.
  const wanted = new Set(want.map(stem));
  while (best.length > 1 && !wanted.has(stem(n.keys[best.at]))) {
    best.at += 1;
    best.length -= 1;
  }
  while (
    best.length > 1 &&
    !wanted.has(stem(n.keys[best.at + best.length - 1]))
  )
    best.length -= 1;
  return best;
}

/** The longest phrase the board's words are made into: a few words, never a sentence. */
export const PHRASE_MOST = 8;

/**
 * A phrase made long enough to be said once before it: the words at `at`
 * with the next ones added (or, at the narration's end, the ones before)
 * until the first time they are said is here, up to PHRASE_MOST words.
 */
export function uniquePhrase(
  n: Narration,
  at: number,
  length: number,
): { at: number; length: number } {
  let start = at;
  let size = Math.max(1, length);
  const said = () => phraseAt(n, n.keys.slice(start, start + size).join(' '));
  while (said() !== start && size < PHRASE_MOST) {
    if (start + size < n.keys.length) size += 1;
    else if (start > 0) {
      start -= 1;
      size += 1;
    } else break;
  }
  return { at: start, length: size };
}

/** The first few words of the narration from a key: where a shot that starts a line starts. */
export function wordsFrom(n: Narration, at: number, most = 3): string {
  return phraseText(n, at, Math.min(most, n.keys.length - at));
}
