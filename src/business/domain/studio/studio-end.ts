/**
 * How an explainer ends (studio-explainer-plan, Ask 9, ideas 3 and 5):
 *
 *  - Three recap cards, built by code from the lesson's key sentences
 *    (delivery "key") and the terms it taught, spread over the film.
 *  - "Now you explain it": the viewer's own words checked against the
 *    episode's points by one small call (studio_teach_back), which says
 *    kindly what they got and what is missing. What goes in and what
 *    comes out is held here.
 *  - "What next?": two or three questions a curious viewer might ask
 *    after it, written with the outline (no call of their own), each a
 *    next episode.
 *
 * Pure: no model, no I/O.
 */
import type { AudienceBand } from './studio-audience';
import { BAND_WORDS } from './studio-audience';
import { keysOf } from '../scene-checkpoint';
import type { ExplainerSheet, OutlineScene } from './studio';

// ── Recap cards ────────────────────────────────────────────────────────────

export interface RecapCard {
  /** The term or idea, in a few words. */
  title: string;
  /** What to remember of it, as the film said it. */
  text: string;
}

export const RECAP_CARDS = 3;
/** A card's words, at most. */
export const RECAP_WORDS = 22;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const capital = (text: string) =>
  text ? text[0].toUpperCase() + text.slice(1) : text;
const shortened = (text: string, most = RECAP_WORDS) => {
  const words = clean(text).split(' ');
  return words.length > most
    ? `${words.slice(0, most).join(' ')}…`
    : words.join(' ');
};
/**
 * Whether a sentence names a term: every word of it that names a thing,
 * with any ending ("The Earth spins" in "It is our Earth that spins").
 */
const names = (say: string, term: string) => {
  const wanted = keysOf(term);
  if (!wanted.length) return false;
  const said = new Set(keysOf(say));
  return wanted.every((key) => said.has(key));
};

/** A scene's key terms: its keyword cards first, then the show's pictures. */
function termsOf(sheet: ExplainerSheet, pictures: readonly string[]): string[] {
  const cards = sheet.draft.cast
    .filter((t) => t.kind === 'words' && t.style === 'keyword')
    .map((t) => clean(t.name))
    .filter((name) => name && name.split(' ').length <= 4);
  return [...cards, ...pictures];
}

/** Up to `n` of a list, spread over it: its first, its last and between. */
function spread<T>(list: readonly T[], n: number): T[] {
  if (list.length <= n) return [...list];
  if (n === 1) return [list[0]];
  return Array.from(
    { length: n },
    (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))],
  );
}

/**
 * The end card's recap: the film's key sentences, spread over it, each
 * under the term it names (else its scene's title); where there are too
 * few, the terms it taught, each with the sentence that first said it;
 * then its recap sentences. Never two cards on one term or one sentence.
 */
export function recapCards(
  scenes: readonly { sheet: ExplainerSheet }[],
  pictures: readonly string[] = [],
): RecapCard[] {
  type Line = { say: string; title: string; terms: string[] };
  const keys: Line[] = [];
  const recaps: Line[] = [];
  const all: Line[] = [];
  for (const { sheet } of scenes) {
    const terms = termsOf(sheet, pictures);
    for (const beat of sheet.draft.beats) {
      const say = clean(beat.say);
      if (!say) continue;
      // The fullest term it names: "The Earth spins" before "Earth".
      const term = [...terms]
        .sort((a, b) => keysOf(b).length - keysOf(a).length)
        .find((t) => names(say, t));
      const line = { say, title: term ?? sheet.title, terms };
      all.push(line);
      if (beat.delivery === 'key') keys.push(line);
      else if (beat.delivery === 'recap') recaps.push(line);
    }
  }
  const cards: RecapCard[] = [];
  const titles = new Set<string>();
  const texts = new Set<string>();
  const add = (title: string, say: string) => {
    const t = capital(clean(title));
    const key = t.toLowerCase();
    if (cards.length >= RECAP_CARDS || titles.has(key) || texts.has(say))
      return;
    titles.add(key);
    texts.add(say);
    cards.push({ title: t, text: shortened(say) });
  };
  for (const line of spread(keys, RECAP_CARDS)) add(line.title, line.say);
  for (const line of keys) add(line.title, line.say);
  // The terms it taught, each with the sentence that first named it.
  const taught = [...new Set(all.flatMap((l) => l.terms))];
  for (const term of taught) {
    const first = all.find((l) => names(l.say, term));
    if (first) add(term, first.say);
  }
  for (const line of recaps) add(line.title, line.say);
  return cards;
}

// ── "What next?" ───────────────────────────────────────────────────────────

export const NEXT_MOST = 3;
export const NEXT_CHARS = 90;

/** The outline's follow-up questions made sound: two or three short, distinct questions; none is none. */
export function nextQuestionsOf(raw: unknown, title = ''): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>([title.toLowerCase().replace(/\W+/g, '')]);
  const out: string[] = [];
  for (const one of raw) {
    if (typeof one !== 'string') continue;
    let q = clean(one).replace(/^[-•\d.)\s]+/, '');
    if (!q || q.length > NEXT_CHARS) continue;
    if (!q.endsWith('?')) q = `${q.replace(/[.!]+$/, '')}?`;
    const key = q.toLowerCase().replace(/\W+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= NEXT_MOST) break;
  }
  return out.length >= 2 ? out : [];
}

// ── "Now you explain it" ───────────────────────────────────────────────────

/** A viewer's own explanation: at least a few words, at most this many characters. */
export const TEACH_BACK_CHARS = 800;
export const TEACH_BACK_WORDS = 3;
/** The points it is checked against, at most. */
export const TEACH_BACK_POINTS = 12;

/** What the check is given: what the episode taught, whom for, and the viewer's words. */
export interface TeachBackAsk {
  topic: string;
  points: string[];
  answer: string;
  /** For whom it is said, in words ("Kids (8–11)"); null for anyone. */
  who: string | null;
}

/** What the check says: the points they got, those missing, and a kind reply. */
export interface TeachBackVerdict {
  got: string[];
  missing: string[];
  reply: string;
}

/** An explainer's points to check a viewer's words against: each lesson scene's, in its words. */
export function teachBackPoints(scenes: readonly OutlineScene[]): string[] {
  const points = scenes
    .filter((s) => s.kind !== 'clip')
    .flatMap((s) => (s.points.length ? s.points : s.teach ? [s.summary] : []))
    .map((p) => clean(p).slice(0, 200))
    .filter(Boolean);
  return [...new Set(points)].slice(0, TEACH_BACK_POINTS);
}

/** The check's input, or null when the words are too few or there is nothing to check them against. */
export function teachBackAsk(
  outline: { title: string; scenes: readonly OutlineScene[] } | null,
  answer: unknown,
  band: AudienceBand | null,
): TeachBackAsk | null {
  if (!outline || typeof answer !== 'string') return null;
  const words = clean(answer).slice(0, TEACH_BACK_CHARS);
  if (words.split(' ').filter(Boolean).length < TEACH_BACK_WORDS) return null;
  const points = teachBackPoints(outline.scenes);
  if (!points.length) return null;
  return {
    topic: outline.title,
    points,
    answer: words,
    who: band ? BAND_WORDS[band] : null,
  };
}

/** The check's answer made sound: the points by their numbers (from 1) as given, a reply of a few sentences. */
export function teachBackOf(
  raw: unknown,
  points: readonly string[],
): TeachBackVerdict {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .map((n) => (Number.isInteger(n) ? points[(n as number) - 1] : undefined))
      .filter((p): p is string => Boolean(p));
  const got = [...new Set(pick(said.got))];
  const missing = [...new Set(pick(said.missing))].filter(
    (p) => !got.includes(p),
  );
  const reply =
    typeof said.reply === 'string' && clean(said.reply)
      ? shortened(said.reply, 80)
      : missing.length
        ? 'Good start! Have another look at the parts you left out.'
        : 'Well explained!';
  return { got, missing, reply };
}
