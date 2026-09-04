/**
 * The lecture board: what the lecturer writes and draws while speaking.
 *
 * A board is a timeline of operations anchored to the spoken text of a
 * lecture row. Everything here is pure: the rules that keep a board a
 * teacher's board (terms and labels, never sentences; nothing the page
 * does not say; a budget per minute by style), the timing that puts each
 * stroke a breath before the voice and never after it, and the layout
 * that gives every item its line. Nothing here touches a model, a file or
 * a clock; the processors do that around it.
 *
 * Offsets are into the SPOKEN text of the row (what `scriptForTts`
 * produces), never the raw script: the voice and the aligner see the
 * spoken text, so that is the one coordinate system the board lives in.
 */
import type { LectureStyle } from '../../contracts';

export const BOARD_GENERATOR_VERSION = 'board-9';

export type BoardStatus = 'none' | 'pending' | 'done' | 'failed' | 'skipped';

export type FigureKind = 'process' | 'structure' | 'comparison' | 'none';

/** What a page's idea would be drawn as, decided by the planner. */
export interface BeatFigure {
  kind: FigureKind;
  /** One line naming what the drawing shows; null when there is none. */
  shows: string | null;
}

export type CueShape = 'underline' | 'circle' | 'box' | 'highlight';

/** A span of the spoken text an operation belongs to. */
export interface BoardAnchor {
  charStart: number;
  charEnd: number;
}

interface OpBase {
  id: string;
  boardId: string;
  anchor: BoardAnchor;
  /** Filled by the timer; null until the row is timed. */
  t0Ms: number | null;
  durMs: number | null;
  /** Hand-drawn jitter is seeded so every replay draws the same strokes. */
  seed: number;
  /** The line the item sits on; 0 is the heading, 100 the diagram region. */
  slot: number;
  /** Lower is kept longer when the pen runs out of time. */
  priority: number;
  /** Lines the item takes on the board, text and meaning together; 1 when absent. */
  lines?: number;
  /** The lecturer says these exact words while writing them: the pen follows the voice. */
  dictated?: boolean;
  /**
   * When each word of the item begins, in milliseconds from t0Ms, with the
   * end of the last word after them: one entry per word on the board plus
   * one. Set by the timer for a dictated item whose spoken words match
   * the written ones one for one.
   */
  pace?: number[];
}

export type BoardOp =
  | (OpBase & { kind: 'heading'; text: string })
  | (OpBase & {
      kind: 'term';
      text: string;
      meaning: string | null;
      /** The one thing to take away; written in the second colour. */
      important?: boolean;
    })
  | (OpBase & {
      kind: 'point';
      text: string;
      /** 2 is a detail under the point before it, written indented. */
      level?: 1 | 2;
      important?: boolean;
    })
  | (OpBase & { kind: 'figure'; text: string; important?: boolean })
  | (OpBase & {
      kind: 'relation';
      fromId: string;
      toId: string;
      label: string | null;
    })
  | (OpBase & { kind: 'diagram'; diagramId: string; elementOrder: string[] })
  | (OpBase & {
      kind: 'cue';
      targetId: string;
      shape: CueShape;
      offMs: number | null;
    })
  | (OpBase & { kind: 'board'; nextBoardId: string });

export type BoardOpKind = BoardOp['kind'];

export interface BoardSpec {
  id: string;
  heading: string;
  /** When the board opens; null until timed. */
  startsAtMs: number | null;
  /** True when this row's first ops draw onto a board an earlier row opened. */
  continues: boolean;
}

export type DiagramShape = 'box' | 'ellipse' | 'diamond' | 'cylinder' | 'note';

export interface DiagramNode {
  id: string;
  label: string;
  shape: DiagramShape;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: BoardAnchor;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string | null;
  points: [number, number][];
  arrow: 'end' | 'both' | 'none';
  anchor: BoardAnchor;
}

export interface DiagramGroup {
  id: string;
  label: string;
  memberIds: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A drawn diagram, laid out offline in a fixed space. */
export interface DiagramGeometry {
  id: string;
  title: string;
  kind: Exclude<FigureKind, 'none'>;
  space: { w: number; h: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
}

export type BoardTiming = 'none' | 'estimated' | 'aligned';

/**
 * A moment where the voice waits for the pen: at `atMs` of the audio the
 * playback pauses for `forMs` while the board keeps writing. Op times on
 * a timeline with holds are in board time: audio time plus the holds
 * before them.
 */
export interface BoardHold {
  atMs: number;
  forMs: number;
}

export interface BoardTimeline {
  version: 1;
  generator: string;
  timing: BoardTiming;
  spokenLength: number;
  boards: BoardSpec[];
  ops: BoardOp[];
  diagrams: DiagramGeometry[];
  /** Operations the timer had to drop because the pen ran out of time. */
  dropped: number;
  /** True when the speech writer placed the lines: the voice yields to the pen. */
  marked?: boolean;
  /** Where the voice waits for the pen, in audio time; empty when never. */
  holds?: BoardHold[];
}

/** Board time for an audio moment: the audio time plus every hold before it. */
export function boardTimeOf(
  timeline: Pick<BoardTimeline, 'holds'>,
  audioMs: number,
): number {
  let extra = 0;
  for (const hold of timeline.holds ?? []) {
    if (hold.atMs < audioMs) extra += hold.forMs;
  }
  return audioMs + extra;
}

/** The audio moment for a board time: the inverse, landing inside a hold at its start. */
export function audioTimeOf(
  timeline: Pick<BoardTimeline, 'holds'>,
  boardMs: number,
): number {
  let extra = 0;
  for (const hold of timeline.holds ?? []) {
    if (hold.atMs + extra >= boardMs) break;
    if (hold.atMs + extra + hold.forMs > boardMs) return hold.atMs;
    extra += hold.forMs;
  }
  return Math.max(0, boardMs - extra);
}

export type WordTimesSource =
  'echogarden-whisper' | 'echogarden-dtw' | 'estimate';

/**
 * Where each word of the spoken text is heard in the audio. Each entry is
 * `[charStart, charEnd, startMs, endMs]`; sentences likewise. Compact on
 * purpose: a page has a few hundred words and the client keeps a chapter
 * of these in memory.
 */
export interface WordTimes {
  version: 1;
  source: WordTimesSource;
  /** The audio these times were measured on; other audio makes them stale. */
  audioKey: string;
  words: number[][];
  sentences: number[][];
}

// ── Budgets and timing constants ─────────────────────────────────────────────

/**
 * The most a row writes, by pace. There is no ration: the board carries
 * every useful point, condensed. The cap is only what a pen can manage
 * while the voice speaks, and a slow learner's board is the fullest.
 */
export const MAX_WRITTEN: Record<LectureStyle, number> = {
  gentle: 24,
  steady: 18,
  brisk: 12,
};

/** Pen time an item takes on average, by pace, bounding what fits in a row's audio. */
export const PEN_MS_PER_ITEM: Record<LectureStyle, number> = {
  gentle: 3200,
  steady: 2600,
  brisk: 2200,
};

/** The written items a row may have: what the pen can manage in its audio. */
export function maxWrittenFor(style: LectureStyle, durationMs: number): number {
  return Math.max(
    4,
    Math.min(
      MAX_WRITTEN[style],
      Math.floor(Math.max(durationMs, 1) / PEN_MS_PER_ITEM[style]),
    ),
  );
}

/** A move of the page as a span of the spoken text, for coverage. */
export interface MoveSpan {
  label: string;
  charStart: number;
  charEnd: number;
}

/**
 * The moves as spans of the spoken text, from the offsets the writer
 * recorded where each begins. Offsets past the end are clamped.
 */
export function moveSpansOf(
  moves: string[],
  offsets: number[],
  spokenLength: number,
): MoveSpan[] {
  const starts = offsets
    .map((offset) => Math.max(0, Math.min(offset, spokenLength)))
    .sort((a, b) => a - b);
  return starts.map((charStart, index) => ({
    label: moves[index] ?? `move ${index + 1}`,
    charStart,
    charEnd: starts[index + 1] ?? spokenLength,
  }));
}

/** Fewer spoken words than this in a move, and it may pass without a note. */
export const COVERAGE_MIN_WORDS = 25;

/** How far ahead of the voice the pen starts, by style. */
export const LEAD_MS: Record<LectureStyle, number> = {
  gentle: 1200,
  steady: 900,
  brisk: 600,
};
/** An item must be finished this long after its word at the latest. */
export const LATE_MS = 1500;
/** The pen lifts between items. */
export const LIFT_MS = 250;
/** On a marked board the pen starts this much before the words it writes. */
export const MARKED_LEAD_MS = 300;
/** The longest the voice waits for the pen at one hold; past it the pen hurries. */
export const MAX_HOLD_MS = 2500;
export const CUE_DURATION_MS = 450;
export const CUE_TAIL_MS = 400;
export const BOUNDARY_MS = 400;
/** The least an item may be compressed to when the voice is ahead. */
export const MIN_COMPRESSION = 0.3;
/** The most a row may run past its audio. */
export const OVERRUN_MS = 500;

/**
 * How long writing takes: a base plus a per-character cost, by style. The
 * client draws each stroke to the duration the server assigned, so the
 * pen's speed on screen follows from these numbers.
 */
export const WRITING_COST: Record<
  LectureStyle,
  { baseMs: number; perCharMs: number }
> = {
  gentle: { baseMs: 180, perCharMs: 85 },
  steady: { baseMs: 150, perCharMs: 68 },
  brisk: { baseMs: 120, perCharMs: 50 },
};

/** Drawing a diagram element: the pen's time for a node and an edge. */
export const DIAGRAM_COST = { nodeMs: 900, edgeMs: 550, groupMs: 700 };

// ── Layout constants ─────────────────────────────────────────────────────────

export const BOARD_SPACE = { w: 1000, h: 620 };
/** Lines below the heading in the left column. */
export const BOARD_LINES = 10;
export const HEADING_SLOT = 0;
export const DIAGRAM_SLOT = 100;

/** Word limits per item kind. */
export const WORD_LIMITS = {
  heading: { min: 2, max: 5 },
  term: { min: 1, max: 4 },
  meaning: { min: 2, max: 18 },
  point: { min: 2, max: 18 },
  label: { min: 1, max: 3 },
} as const;

/** Lines a point or a meaning may wrap onto; a term's name and a heading stay on one. */
export const MAX_TEXT_LINES = 2;

/**
 * Characters a line of the board holds, by what it is. A point or a
 * meaning may wrap onto a second line; beyond that it is condensed the
 * way a teacher condenses, and never cut mid-phrase.
 */
export const CHAR_LIMITS = {
  heading: 42,
  term: 40,
  meaning: 54,
  point: 48,
  label: 20,
} as const;
export const FIGURE_MAX_TOKENS = 5;
export const FIGURE_MAX_TOKEN_CHARS = 12;
export const MAX_DRAFT_ITEMS = 30;

// ── Text helpers ─────────────────────────────────────────────────────────────

export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'it',
  'its',
  'this',
  'that',
  'with',
  'as',
  'by',
  'from',
  'into',
  'than',
  'then',
  'so',
  'not',
  'no',
  'but',
  'if',
  'when',
  'per',
  'each',
  'one',
  'two',
  'how',
  'what',
  'why',
  'which',
  'we',
  'you',
  'they',
  'he',
  'she',
  'i',
  'may',
  'can',
  'might',
  'could',
  'should',
  'must',
  'would',
  'will',
  'shall',
]);

/** Lowercased, punctuation-free, lightly stemmed content words. */
export function contentWords(text: string): string[] {
  return normalise(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
}

/** Lowercase, letters, digits and spaces only, single-spaced. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A light stem that lands the same for a word and its inflections:
 * confuses and confuse, moved and move, dropped and drops. The trailing e
 * and a doubled consonant go too, or the base form would never meet its
 * suffixed one.
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  // A step that would leave a single letter is not a stem ("ring" is not
  // "r", and must not meet "rely"); the word keeps its shape instead.
  const cut = (current: string, pattern: RegExp, to: string) => {
    const next = current.replace(pattern, to);
    return next.length >= 2 ? next : current;
  };
  let out = cut(word, /(ies)$/, 'y');
  out = cut(out, /(ing|ed|es|s)$/, '');
  out = cut(out, /(ly)$/, '');
  out = cut(out, /cy$/, 't');
  out = cut(out, /e$/, '');
  return cut(out, /([bdgmnprt])\1$/, '$1');
}

/** Sentence spans of a spoken text, as offsets into it. */
export function sentenceSpans(spoken: string): BoardAnchor[] {
  const spans: BoardAnchor[] = [];
  const pattern = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(spoken)) !== null) {
    if (!match[0].trim()) continue;
    const leading = match[0].length - match[0].trimStart().length;
    const charStart = match.index + leading;
    const charEnd = match.index + match[0].trimEnd().length;
    if (charEnd > charStart) spans.push({ charStart, charEnd });
  }
  return spans;
}

/**
 * Where a phrase occurs in the spoken text, at or after `from`, ignoring
 * case, punctuation and the exact whitespace. Returns the span in the
 * spoken text's own offsets, or null.
 */
/**
 * The spoken sentence a phrase belongs to when it is not said word for
 * word: the writer often anchors to the page or the plan, or to a whole
 * sentence with a word changed. The sentence holding most of the
 * phrase's content words stands in, one at or after `from` when there is
 * one; the anchor is the stretch from its first to its last matched word.
 */
export function findAnchorLoose(
  spoken: string,
  phrase: string,
  from = 0,
): BoardAnchor | null {
  const wanted = contentWords(phrase);
  if (wanted.length < 2) return null;
  const needed = Math.max(2, Math.ceil(wanted.length * 0.6));
  let best: { span: BoardAnchor; hits: number; after: boolean } | null = null;
  for (const span of sentenceSpans(spoken)) {
    const words = contentWords(spoken.slice(span.charStart, span.charEnd));
    const hits = wanted.filter((word) => words.includes(word)).length;
    if (hits < needed) continue;
    const after = span.charStart >= from;
    if (
      !best ||
      (after && !best.after) ||
      (after === best.after && hits > best.hits)
    ) {
      best = { span, hits, after };
    }
  }
  if (!best) return null;
  const sentence = spoken.slice(best.span.charStart, best.span.charEnd);
  const tokens = /[A-Za-z0-9'\u2019]+/g;
  let first = -1;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(sentence)) !== null) {
    const stemmed = contentWords(match[0])[0];
    if (stemmed && wanted.includes(stemmed)) {
      if (first < 0) first = match.index;
      last = match.index + match[0].length;
    }
  }
  if (first < 0) return best.span;
  return {
    charStart: best.span.charStart + first,
    charEnd: best.span.charStart + last,
  };
}

/**
 * Where a draft item belongs. Its anchor phrase first; failing that, its
 * own words. A term is placed where the lecturer names it: a term written
 * before its word is spoken carries a definition the lecturer has not
 * given yet.
 */
/** The spoken words as the writer sees them: one numbered sentence a line. */
export function numberedSentences(spoken: string): string {
  return sentenceSpans(spoken)
    .map(
      (span, index) =>
        `${index + 1}. ${spoken.slice(span.charStart, span.charEnd).replace(/\s+/g, ' ')}`,
    )
    .join('\n');
}

/**
 * Where a sentence-keyed item belongs: its sentence, narrowed to the
 * item's own words within it when they are there, so the pen starts on
 * the phrase rather than the sentence. Null when the number is not a
 * sentence of the page.
 */
export function sentenceAnchor(
  item: BoardDraftItem,
  spoken: string,
): BoardAnchor | null {
  if (typeof item.sentence !== 'number' || !Number.isInteger(item.sentence)) {
    return null;
  }
  const spans = sentenceSpans(spoken);
  const span = spans[item.sentence - 1];
  if (!span) return null;
  const sentence = spoken.slice(span.charStart, span.charEnd);
  const own = [item.text, item.meaning].filter(Boolean).join(' ');
  const within = own
    ? (findAnchor(sentence, item.text ?? '') ??
      findAnchorLoose(sentence, own, 0))
    : null;
  if (!within) return span;
  return {
    charStart: span.charStart + within.charStart,
    charEnd: span.charStart + within.charEnd,
  };
}

/**
 * Where a draft item belongs. A sentence number first, the way the writer
 * now places notes. Failing that, its anchor phrase, then its own words. A
 * term is placed where the lecturer names it: a term written before its
 * word is spoken carries a definition the lecturer has not given yet.
 */
export function anchorForItem(
  item: BoardDraftItem,
  spoken: string,
  cursor: number,
): BoardAnchor | null {
  if (typeof item.at === 'number' && Number.isFinite(item.at)) {
    const charStart = Math.max(0, Math.min(Math.round(item.at), spoken.length));
    const until =
      typeof item.until === 'number' && item.until > charStart
        ? Math.min(Math.round(item.until), spoken.length)
        : charStart + 1;
    return { charStart, charEnd: Math.min(until, spoken.length) };
  }
  if (typeof item.sentence === 'number') return sentenceAnchor(item, spoken);
  const base =
    anchorFor(spoken, item.anchor ?? '', cursor) ??
    findAnchorLoose(
      spoken,
      [item.text, item.meaning].filter(Boolean).join(' '),
      cursor,
    );
  if (item.kind !== 'term' || !item.text) return base;
  const named =
    findAnchor(spoken, item.text, cursor) ?? findAnchor(spoken, item.text, 0);
  if (!named) return base;
  if (!base) return named;
  const span = sentenceSpans(spoken).find(
    (s) => base.charStart >= s.charStart && base.charStart < s.charEnd,
  );
  const sentence = span ? spoken.slice(span.charStart, span.charEnd) : '';
  return findAnchor(sentence, item.text) ? base : named;
}

/** Where an item belongs: said exactly from the cursor on, else anywhere, else nearly. */
export function anchorFor(
  spoken: string,
  phrase: string,
  cursor = 0,
): BoardAnchor | null {
  return (
    findAnchor(spoken, phrase, cursor) ??
    findAnchor(spoken, phrase, 0) ??
    findAnchorLoose(spoken, phrase, cursor)
  );
}

/**
 * The shapes a heading takes when a writer offers it as a note: a verb
 * of study with its object, or a label with "of". None of them says what
 * is true.
 */
const HEADING_VERBS =
  /^(?:understand(?:ing)?|defin(?:e|ing)|address(?:ing)?|discuss(?:ing)?|set|pin down|overview of|importance of|examples? of|introduction to|role of|roles of|need for|challenges? (?:of|with)|explain(?:ing)?|describ(?:e|ing)|consider(?:ing)?|identify(?:ing)?|focus on|learn(?:ing)?|look(?:ing)? at|think(?:ing)? about|talk(?:ing)? about)\b|\bas a solution$/i;
/** A label that ends in an abstract noun says nothing: "user experience consideration". */
const LABEL_ENDINGS =
  /\b(?:focus|flexibility|consideration|considerations|response|solution|process|importance|overview|challenges?|significance|aspects?|concerns?|situations?|problems?|issues?|matters|factors?|strategies|approach(?:es)?|methods?|techniques?)$/i;

export function readsAsHeading(text: string): boolean {
  const trimmed = text.trim();
  // A number, a list, or a named example is content whatever its shape.
  if (/\d/.test(trimmed)) return false;
  if ((trimmed.match(/,/g) ?? []).length >= 2) return false;
  if (/:|\be\.g\.|\blike\b|\bsuch as\b/i.test(trimmed)) return false;
  return HEADING_VERBS.test(trimmed) || LABEL_ENDINGS.test(trimmed);
}

/**
 * Whether a point only names what is being talked about (a move, the
 * heading) instead of saying what is true about it. "challenges with
 * auto_increment" is a topic; "auto_increment fails across servers" is a
 * note.
 */
export function namesTopic(
  text: string,
  labels: (string | null | undefined)[],
): boolean {
  const words = contentWords(text);
  if (!words.length) return false;
  return labels.some((label) => {
    const set = new Set(contentWords(label ?? ''));
    return set.size > 0 && words.every((word) => set.has(word));
  });
}

export function findAnchor(
  spoken: string,
  phrase: string,
  from = 0,
): BoardAnchor | null {
  const wanted = normalise(phrase);
  if (!wanted) return null;
  // Walk the spoken text keeping a map from normalised offsets to source
  // offsets, so the match lands on the real characters.
  const map: number[] = [];
  let out = '';
  let pendingSpace = false;
  for (let i = 0; i < spoken.length; i += 1) {
    const ch = spoken[i].toLowerCase();
    // Apostrophes vanish, as they do in the phrase; everything else that
    // is not a letter or a digit is a break between words.
    if (ch === "'" || ch === '’' || ch === '‘') continue;
    if (!/[a-z0-9]/.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out += ' ';
      map.push(i);
      pendingSpace = false;
    }
    out += ch;
    map.push(i);
  }
  let searchFrom = 0;
  while (searchFrom < map.length && map[searchFrom] < from) searchFrom += 1;
  let index = out.indexOf(wanted, searchFrom);
  // A match that starts mid-word is not the phrase.
  while (index > 0 && out[index - 1] !== ' ') {
    index = out.indexOf(wanted, index + 1);
  }
  if (index < 0) return null;
  const charStart = map[index];
  const charEnd = map[index + wanted.length - 1] + 1;
  return { charStart, charEnd };
}

// ── Figures ──────────────────────────────────────────────────────────────────

const FIGURE_PREFERENCE: Record<FigureKind, number> = {
  process: 0,
  structure: 1,
  comparison: 2,
  none: 9,
};

/**
 * At most one figure in every window of two pages and three per chapter.
 * The rest become `none`. A lecture that draws on every page is a slide
 * deck; the drawing effect lives in the few diagrams that carry structure.
 */
export function capFigures<T extends { figure?: BeatFigure | null }>(
  beats: T[],
): T[] {
  const kept = new Set<number>();
  const candidates = beats
    .map((beat, index) => ({ index, figure: beat.figure }))
    .filter(
      (entry): entry is { index: number; figure: BeatFigure } =>
        !!entry.figure && entry.figure.kind !== 'none',
    )
    .sort(
      (a, b) =>
        FIGURE_PREFERENCE[a.figure.kind] - FIGURE_PREFERENCE[b.figure.kind] ||
        a.index - b.index,
    );
  for (const entry of candidates) {
    if (kept.size >= 3) break;
    const neighbourKept = [...kept].some(
      (index) => Math.abs(index - entry.index) < 2,
    );
    if (neighbourKept) continue;
    kept.add(entry.index);
  }
  return beats.map((beat, index) =>
    kept.has(index) || !beat.figure
      ? beat
      : { ...beat, figure: { kind: 'none' as const, shows: null } },
  );
}

// ── The board writer's draft and its rules ───────────────────────────────────

export type DraftItemKind = 'term' | 'point' | 'figure' | 'relation' | 'cue';

export interface BoardDraftItem {
  kind: DraftItemKind;
  text?: string | null;
  meaning?: string | null;
  from?: string | null;
  to?: string | null;
  label?: string | null;
  target?: string | null;
  shape?: CueShape | null;
  /** 2 for a detail under the written item before it. */
  level?: 1 | 2 | null;
  /** The one thing to take away; at most one per page keeps it. */
  important?: boolean | null;
  /**
   * The spoken sentence the item belongs to, numbered from 1 as the
   * writer saw it. The way a note is placed now; the anchor phrase is the
   * older way and the fallback.
   */
  sentence?: number | null;
  /** An exact phrase of the spoken text the item belongs to (the older way). */
  anchor?: string | null;
  /**
   * An exact offset into the spoken text, from a write marker the speech
   * writer placed. The surest placing of all; the others are fallbacks.
   */
  at?: number | null;
  /**
   * Where the item's own words end in the spoken text, when the lecturer
   * says them as they are written: the pen then follows the voice.
   */
  until?: number | null;
}

export interface BoardDraft {
  heading: string | null;
  items: BoardDraftItem[];
}

export interface BoardContext {
  spoken: string;
  pageText: string;
  /** Lines from the plan the labels may draw words from. */
  planLines: string[];
  style: LectureStyle;
  durationMs: number;
  /** True when this row draws onto a board an earlier row opened. */
  continues: boolean;
  /** Bridges and light pages may write nothing. */
  light: boolean;
  /** For a row continuing a board: the first free line on it. */
  startLine?: number;
  /** The moves the page teaches: a point that only names one is refused. */
  moves?: string[];
  /** Where each move is spoken: a move with nothing written under it is a gap. */
  moveSpans?: MoveSpan[];
  /** The page's idea, for choosing the red line when the writer's choice fails. */
  goal?: string;
}

export interface BoardProblem {
  kind:
    | 'anchor_missing'
    | 'too_long'
    | 'too_short'
    | 'sentence'
    | 'ungrounded'
    | 'budget'
    | 'cue_density'
    | 'relation_targets'
    | 'heading_required'
    | 'heading_forbidden'
    | 'duplicate'
    | 'non_ascii'
    | 'incomplete'
    | 'topic_label'
    | 'coverage'
    | 'restates'
    | 'unknown_kind';
  detail: string;
  /** The offending item, or undefined for a draft-level problem. */
  index?: number;
}

/**
 * A teacher's abbreviations. The left side is matched whole, case
 * insensitively; the right is what goes on the board.
 */
export const ABBREVIATIONS: [RegExp, string][] = [
  [/\bconcentrations?\b/gi, 'conc'],
  [/\bapproximately\b/gi, 'approx'],
  [/\bmaximum\b/gi, 'max'],
  [/\bminimum\b/gi, 'min'],
  [/\baverage\b/gi, 'avg'],
  [/\bnumber of\b/gi, 'no. of'],
  [/\bversus\b/gi, 'vs'],
  [/\bwithout\b/gi, 'w/o'],
  [/\bwith\b/gi, 'w/'],
  [/\bpercentage\b/gi, '%'],
  [/\bper cent\b/gi, '%'],
  [/\bincreases?\b/gi, 'rise'],
  [/\bdecreases?\b/gi, 'fall'],
  [/\btemperatures?\b/gi, 'temp'],
  [/\binformation\b/gi, 'info'],
  [/\bdevelopment\b/gi, 'dev'],
  [/\benvironments?\b/gi, 'env'],
  [/\bespecially\b/gi, 'esp'],
  [/\bincluding\b/gi, 'incl'],
  [/\bfor example\b/gi, 'e.g.'],
  [/\bthat is\b/gi, 'i.e.'],
  [/\band\b/gi, '+'],
];

/**
 * Openings that say nothing on a board: a definition's throat-clearing.
 * "A technique to minimize data movement" is written "minimizes data
 * movement", because the term above it already says what it is.
 */
const FILLER_PHRASES: [RegExp, string][] = [
  // "from an area of higher conc" is "from higher conc" on a board.
  [
    /\b(?:an?|the)\s+(?:area|areas|region|regions|state|states|amount|amounts|level|levels|group|groups|set|sets|kind|kinds|type|types|form|forms|piece|pieces)\s+of\s+/gi,
    '',
  ],
  [/\bin order to\b/gi, 'to'],
  [/\bsuch as\b/gi, 'e.g.'],
  [/\bas well as\b/gi, '+'],
  [/\bthat (?:is|are) \b/gi, ''],
  [/\bwhich (?:is|are) \b/gi, ''],
];

const EMPTY_OPENINGS = [
  /^(?:an?|the)\s+(?:technique|method|process|way|means|approach|function|system|state|condition|measure|form|type|kind|set|group|term|concept|idea|practice|procedure|mechanism)\s+(?:of|to|that|which|for|by|in)\s+/i,
  /^(?:an?|the)\s+/i,
  /^(?:refers?\s+to|means|describes|involves|is\s+defined\s+as|is|are)\s+/i,
];

/** Words a board line must not end on: the phrase would be cut off. */
const DANGLING = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'and',
  '+',
  'or',
  'with',
  'w/',
  'by',
  'from',
  'into',
  'than',
  'then',
  'when',
  'while',
  'that',
  'which',
  'is',
  'are',
  'was',
  'were',
  'be',
  'as',
  'but',
  'if',
  'so',
  'between',
  'through',
  'over',
  'under',
  'about',
  'per',
  'vs',
  'before',
  'after',
  'where',
  'while',
  'until',
  'since',
  'because',
  'although',
  'whether',
  'how',
  'what',
  'who',
  'into',
  'onto',
  'via',
  'toward',
  'towards',
  'against',
  'among',
  'within',
  'across',
  'during',
  'above',
  'below',
  'off',
  'out',
  'up',
  'down',
  'around',
  'beyond',
  'also',
  'very',
  'more',
  'most',
  'less',
  'such',
  'both',
  'either',
  'neither',
  'their',
  'its',
  'his',
  'her',
  'our',
  'your',
  'may',
  'can',
  'might',
  'could',
  'should',
  'must',
  'would',
  'will',
  'shall',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
]);

/** Verbs that leave a longer line hanging without their object. */
const HANGING_VERBS = new Set([
  'recognize',
  'recognise',
  'identify',
  'detect',
  'find',
  'use',
  'set',
  'make',
  'keep',
  'get',
  'put',
  'take',
  'include',
  'ensure',
  'avoid',
  'prevent',
  'allow',
  'provide',
  'minimize',
  'minimise',
  'maximize',
  'optimize',
  'handle',
  'manage',
  'distribute',
  'balance',
  'assign',
  'remap',
  'compute',
  'generate',
  'affect',
  'represent',
  'focus',
  'involve',
  'require',
  'spread',
  'realign',
  'improve',
  'reduce',
  'increase',
  'cause',
  'occur',
  'happen',
  'work',
  'apply',
  'depend',
  'relate',
  'refer',
  'consist',
  'contain',
  'support',
  'come',
  'go',
  'stick',
  'help',
  'need',
  'want',
  'try',
  'start',
  'stop',
  'become',
  'remain',
  'seem',
  'tend',
  'lead',
  'bring',
  'give',
  'show',
  'tell',
  'mean',
  'know',
  'think',
  'see',
  'call',
  'run',
  'turn',
  'hold',
  'add',
]);

const PREPOSITIONS = new Set([
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'w/',
  'by',
  'from',
  'into',
  'across',
  'through',
  'over',
  'under',
  'between',
  'about',
  'within',
  'without',
  'w/o',
]);

/** Whether a line ends mid-phrase, so it reads as cut off. */
/** The hanging verbs by stem, so an inflected form hangs the same. */
let hangingStems: Set<string> | null = null;
function hangs(word: string): boolean {
  if (!hangingStems) {
    hangingStems = new Set([...HANGING_VERBS].map((verb) => stem(verb)));
  }
  return HANGING_VERBS.has(word) || hangingStems.has(stem(word));
}

/** Words that open a clause: a single word after one is a clause cut short. */
const CLAUSE_OPENERS = new Set([
  'while',
  'when',
  'if',
  'because',
  'although',
  'whether',
  'before',
  'after',
  'until',
  'since',
  'unless',
  'though',
  'whereas',
  'so',
]);

export function endsMidPhrase(text: string): boolean {
  const words = wordsOf(asciiText(text)).map((word) =>
    word.toLowerCase().replace(/[^\w/+.%-]/g, ''),
  );
  if (!words.length) return false;
  const last = words[words.length - 1];
  const before = words.length > 1 ? words[words.length - 2] : '';
  if (DANGLING.has(last)) return true;
  if (words.length >= 3 && hangs(last)) return true;
  // "servers while minimizing": the clause the opener began never came.
  // "dropped when empty" is whole: the word after the opener stands alone.
  if (CLAUSE_OPENERS.has(before) && (/ing$/.test(last) || hangs(last)))
    return true;
  if (/ing$/.test(last) && last.length > 5 && DANGLING.has(before)) return true;
  return false;
}

/**
 * A long definition written the way a teacher writes it: the empty
 * opening dropped, the usual abbreviations applied, and cut only at a
 * phrase boundary, so the line always finishes what it started.
 */
export function shorten(
  text: string,
  maxWords: number,
  maxChars: number,
  /** The term this defines, when there is one: "X is ..." says nothing. */
  term?: string,
): string {
  let out = asciiText(text).trim().replace(/\s+/g, ' ');
  out = out.replace(/[.;:,]+$/, '');
  if (term?.trim()) {
    const head = asciiText(term.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const restated = new RegExp(
      `^(?:an?|the)?\\s*${head}s?\\s+(?:is|are|means|refers? to|is defined as|describes)\\s+`,
      'i',
    );
    const next = out.replace(restated, '');
    if (next !== out && wordsOf(next).length >= 2) out = next;
  }
  for (const [pattern, short] of FILLER_PHRASES) {
    out = out.replace(pattern, short);
  }
  out = out.replace(/\s+/g, ' ').trim();
  for (const opening of EMPTY_OPENINGS) {
    const next = out.replace(opening, '');
    if (next !== out && wordsOf(next).length >= 2) {
      out = next;
      break;
    }
  }
  // Only the first clause: a board writes one idea, not a sentence.
  const clause = out.split(/[;:]|\s+(?:because|although|however|whereas)\s+/i);
  if (wordsOf(clause[0]).length >= 3) out = clause[0].trim();
  const overLong = () =>
    wordsOf(out).length > maxWords || out.length > maxChars;
  for (const [pattern, short] of ABBREVIATIONS) {
    if (!overLong()) break;
    out = out.replace(pattern, short);
  }
  // A pair still written out is written the way a teacher writes it.
  if (overLong()) out = out.replace(/\b(\w+) or (\w+)\b/gi, '$1/$2');
  // "servers are added" is "servers added" once the room runs out.
  if (overLong())
    out = out.replace(/\b(?:is|are|was|were)\s+(?=\w+ed\b)/gi, '');
  out = out.replace(/\s+/g, ' ').trim();
  let words = wordsOf(out);
  while (
    words.length > maxWords ||
    words.join(' ').length > maxChars ||
    (words.length > 2 && endsMidPhrase(words.join(' ')))
  ) {
    if (words.length <= 2) break;
    words = words.slice(0, -1);
  }
  // A cut line must not trail a preposition and a word or two after it:
  // "from a region" says nothing. Back up to before the preposition.
  if (words.length < wordsOf(out).length) {
    const tail = words
      .slice(-3)
      .findIndex((word) => PREPOSITIONS.has(word.toLowerCase()));
    if (tail >= 0 && words.length - 3 + tail >= 2) {
      words = words.slice(0, words.length - 3 + tail);
    }
  }
  const result = words.join(' ').replace(/[,;:]+$/, '');
  return result || asciiText(text).trim();
}

/**
 * The board pen writes plain ASCII. Typographic quotes and dashes are
 * turned into their plain forms; anything else that is left is a problem.
 */
export function asciiText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00D7/g, 'x')
    .replace(/[\u00A0\u2009\u202F]/g, ' ');
}

export function isPlainAscii(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}

/** Whether a written item reads as a sentence rather than a label. */
export function readsAsSentence(text: string): boolean {
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) return true;
  // Length alone is the word limits' business; only a very long line
  // reads as a sentence by size.
  // A claim with a verb ("Nigeria has poor road networks") is exactly a
  // note; only the full stop and the length say sentence.
  return wordsOf(trimmed).length > WORD_LIMITS.meaning.max;
}

/** Whether every content word of a label is on the page, in the plan, or spoken. */
/** The text with the teacher's abbreviations applied, for grounding them. */
export function abbreviated(text: string): string {
  let out = text;
  for (const [pattern, short] of ABBREVIATIONS)
    out = out.replace(pattern, short);
  return out;
}

/**
 * The content words of a line the lecturer does not say. A term's name may
 * come from the page; its meaning, and every point, must be in the
 * lecturer's words, so a definition the page prints but the voice never
 * gives is not written.
 */
export function ungroundedWords(text: string, ctx: BoardContext): string[] {
  const source = [ctx.pageText, ctx.spoken, ...ctx.planLines].join(' ');
  const pool = new Set([
    ...contentWords(source),
    ...contentWords(abbreviated(source)),
  ]);
  const raw = wordsOf(text).filter(
    (word) => !STOP_WORDS.has(normalise(word)) && normalise(word).length > 1,
  );
  return raw.filter((word) => {
    const stemmed = contentWords(word)[0];
    return stemmed !== undefined && !pool.has(stemmed);
  });
}

export function grounded(
  text: string,
  ctx: BoardContext,
  strict = false,
): boolean {
  const words = contentWords(text);
  const misses = ungroundedWords(text, ctx).length;
  // One light rewording in a longer line does not cost the line; a
  // meaning gets no such slack, since an invented definition is the
  // worst thing a board can carry.
  return misses === 0 || (!strict && words.length >= 3 && misses <= 1);
}

/** Whether every number in a figure appears on the page. */
export function figuresOnPage(text: string, ctx: BoardContext): boolean {
  const numbers = text.match(/\d[\d,.]*/g) ?? [];
  const page = ctx.pageText + ' ' + ctx.spoken;
  return numbers.every((number) => page.includes(number));
}

/** Lines a text takes on the board, by its field's line width. */
export function linesOf(text: string, field: keyof typeof CHAR_LIMITS): number {
  const wraps = field === 'point' || field === 'meaning';
  const lines = Math.max(1, Math.ceil(text.trim().length / CHAR_LIMITS[field]));
  return wraps ? Math.min(MAX_TEXT_LINES, lines) : 1;
}

/** The most characters a field may run to: two lines for what wraps. */
export function charLimitOf(field: keyof typeof CHAR_LIMITS): number {
  const wraps = field === 'point' || field === 'meaning';
  return CHAR_LIMITS[field] * (wraps ? MAX_TEXT_LINES : 1);
}

function limitProblem(
  text: string | null | undefined,
  field: keyof typeof WORD_LIMITS,
  index: number,
): BoardProblem | null {
  const written = asciiText(text ?? '').trim();
  const count = wordsOf(written).length;
  const limit = WORD_LIMITS[field];
  if (written.length > charLimitOf(field)) {
    return {
      kind: 'too_long',
      detail: `${field} "${written}" is ${written.length} characters; at most ${charLimitOf(field)}: drop words or abbreviate, never cut a word short`,
      index,
    };
  }
  if (count >= limit.min && endsMidPhrase(written)) {
    return {
      kind: 'incomplete',
      detail: `${field} "${written}" stops mid-phrase; write a shorter complete one`,
      index,
    };
  }
  if (count < limit.min) {
    return {
      kind: 'too_short',
      detail: `${field} "${text ?? ''}" has ${count} words; at least ${limit.min}`,
      index,
    };
  }
  if (count > limit.max) {
    return {
      kind: 'too_long',
      detail: `${field} "${text}" has ${count} words; at most ${limit.max}`,
      index,
    };
  }
  return null;
}

/**
 * A written item's text as the board writes it: plain, and when it runs
 * past its limits, shortened the way a teacher shortens rather than
 * refused. Only what still does not fit after that is a problem.
 */
export function fittedText(kind: DraftItemKind, text: string): string {
  const plain = asciiText(text.trim()).replace(/\s+/g, ' ');
  const field = kind === 'term' ? 'term' : kind === 'point' ? 'point' : null;
  if (!field) return plain;
  // A term's name is never cut mid-way: whole when it fits the line.
  if (field === 'term' && plain.length <= CHAR_LIMITS.term) return plain;
  if (
    plain.length <= charLimitOf(field) &&
    wordsOf(plain).length <= WORD_LIMITS[field].max
  ) {
    return plain;
  }
  // A cut that would end mid-phrase is no cut: the whole line is handed
  // back over the limit, refused, and sent to the writer to condense.
  const short = shorten(plain, WORD_LIMITS[field].max, charLimitOf(field));
  // A list cut short is a prefix too: the writer splits it instead.
  const isList = (plain.match(/,/g) ?? []).length >= 2;
  if (isList && short.length < plain.length) return plain;
  return endsMidPhrase(short) || wordsOf(short).length < 2 ? plain : short;
}

export function fittedMeaning(meaning: string): string {
  const plain = asciiText(meaning.trim()).replace(/\s+/g, ' ');
  if (
    plain.length <= charLimitOf('meaning') &&
    wordsOf(plain).length <= WORD_LIMITS.meaning.max
  ) {
    return plain;
  }
  const short = shorten(plain, WORD_LIMITS.meaning.max, charLimitOf('meaning'));
  return endsMidPhrase(short) || wordsOf(short).length < 2 ? plain : short;
}

/**
 * The writer sometimes hands a definition over as a point with a
 * meaning. It is a term: the meaning would be lost otherwise.
 */
export function asDrafted(item: BoardDraftItem): BoardDraftItem {
  if (item.kind === 'point' && item.meaning?.trim()) {
    return { ...item, kind: 'term', level: null };
  }
  return item;
}

/**
 * Whether a term's meaning is the one the lecturer gives where the term
 * is named: most of its content words are in that sentence, the one
 * before or the one after. A glossary definition the page prints but the
 * voice never says is not written; the bare term is.
 */
export function meaningSpokenNear(
  meaning: string,
  spoken: string,
  anchor: BoardAnchor,
): boolean {
  const words = contentWords(meaning);
  if (!words.length) return false;
  const spans = sentenceSpans(spoken);
  const at = spans.findIndex(
    (s) => anchor.charStart >= s.charStart && anchor.charStart < s.charEnd,
  );
  if (at < 0) return false;
  const window = spans
    .slice(Math.max(0, at - 1), at + 3)
    .map((s) => spoken.slice(s.charStart, s.charEnd))
    .join(' ');
  const near = new Set([
    ...contentWords(window),
    ...contentWords(abbreviated(window)),
  ]);
  const hits = words.filter((word) => near.has(word)).length;
  return hits / words.length >= 0.4;
}

/**
 * Whether a line only says an earlier line again: every content word is
 * already there, or nearly every one is and it adds at most one new word.
 */
export function repeats(words: string[], earlier: Set<string>): boolean {
  if (!words.length || !earlier.size) return false;
  const hits = words.filter((word) => earlier.has(word)).length;
  return (
    hits === words.length ||
    (words.length >= 4 &&
      hits / words.length >= 0.6 &&
      words.length - hits <= 1)
  );
}

/** One planned line of a page, with where in the spoken text it is written. */
export interface MarkedLine {
  number: number;
  kind: 'term' | 'point' | 'figure';
  text: string;
  meaning: string | null;
  level: 1 | 2 | null;
  important: boolean | null;
  /** Offset into the spoken text where the writing starts. */
  at: number;
  /** Where the line's own words end in the speech, when the lecturer says them as written. */
  until?: number;
  /** How the line was placed: by its words in the speech, by the writer's mark, or at the start of its move. */
  placed: 'words' | 'mark' | 'move';
}

export interface PieceBoard {
  heading: string | null;
  lines: MarkedLine[];
  /** Where the speech comes back to a line: index into `lines`, and the offset. */
  cues: { line: number; at: number }[];
}

/** A planned line as the board writer returned it, before it is placed. */
export interface PlannedLine {
  number: number;
  move: number;
  kind: 'term' | 'point' | 'figure';
  text: string;
  meaning: string | null;
  level: 1 | 2 | null;
  important: boolean | null;
}

const MARK_PATTERN = /\[\s*(write|point)\s+(\d+)\s*\]/gi;

/** The bracketed markers and stage directions out, spacing normalised. */
function withoutMarks(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The board of a piece whose lines were planned before the speech. The
 * lecturer says each line as it is written, so a line is placed where
 * its words are said: the spoken sentence holding most of them, at or
 * after the line before. A line whose words are not found takes the
 * writer's "[write n]" mark when there is one, placed by the words that
 * follow it (or precede it at a section's end), found in the spoken text
 * from a moving cursor; failing both, the start of the section of its
 * move. Null for a piece with no lines.
 */
export function boardMarks(
  script: string,
  spoken: string,
  sections: { move?: number; text: string }[],
  board: { heading: string | null; lines: PlannedLine[] },
): PieceBoard | null {
  if (!board.lines.length) return null;
  const placeWords = (raw: string, from: number): number | null => {
    const words = withoutMarks(raw).split(' ').filter(Boolean).slice(0, 4);
    if (!words.length) return null;
    const found =
      findAnchor(spoken, words.join(' '), from) ??
      findAnchor(spoken, words.slice(0, 2).join(' '), from);
    return found ? found.charStart : null;
  };

  // Where each section begins in the spoken text, by its first words.
  const sectionStarts = new Map<number, number>();
  let rawCursor = 0;
  let spokenCursor = 0;
  sections.forEach((section, index) => {
    const text = section.text.trim();
    const start = text ? script.indexOf(text, rawCursor) : -1;
    if (start >= 0) rawCursor = start + text.length;
    const at = text ? placeWords(text, spokenCursor) : null;
    if (at !== null) spokenCursor = Math.max(spokenCursor, at);
    sectionStarts.set(section.move ?? index, at ?? spokenCursor);
  });

  // Every mark in the piece, in order, placed by the words around it.
  const marks = new Map<number, number>();
  const points: { number: number; at: number }[] = [];
  spokenCursor = 0;
  for (const match of script.matchAll(MARK_PATTERN)) {
    const kind = match[1].toLowerCase();
    const n = Number(match[2]);
    const after = script.slice(match.index + match[0].length);
    const before = script.slice(0, match.index);
    let at = placeWords(after, spokenCursor);
    if (at === null) {
      const tail = withoutMarks(before).split(' ').filter(Boolean).slice(-3);
      const found = tail.length
        ? findAnchor(spoken, tail.join(' '), spokenCursor)
        : null;
      at = found ? found.charEnd : null;
    }
    if (at === null) continue;
    spokenCursor = Math.max(spokenCursor, at);
    if (kind === 'write') {
      if (!marks.has(n)) marks.set(n, at);
    } else {
      points.push({ number: n, at });
    }
  }

  const lines: MarkedLine[] = [];
  let lastAt = 0;
  for (const line of board.lines) {
    // Said with its meaning, else by its opening words (a paraphrase
    // keeps those), else by the whole of its text. A figure is numbers,
    // which a loose match ignores, so it is placed only where it is said
    // exactly.
    const said =
      line.kind === 'figure'
        ? findAnchor(spoken, line.text, lastAt)
        : (findAnchorLoose(
            spoken,
            `${line.text} ${line.meaning ?? ''}`,
            lastAt,
          ) ??
          findAnchorLoose(
            spoken,
            wordsOf(line.text).slice(0, 4).join(' '),
            lastAt,
          ) ??
          findAnchorLoose(spoken, line.text, lastAt));
    const mark = marks.get(line.number);
    const placed: MarkedLine['placed'] = said
      ? 'words'
      : mark !== undefined
        ? 'mark'
        : 'move';
    const at =
      said?.charStart ?? mark ?? sectionStarts.get(line.move) ?? lastAt;
    // The lecturer says the line as written: its words in the speech are
    // the span the pen follows. Exact from the placing, else the loose
    // span the words were found in.
    const exact = findAnchor(
      spoken,
      [line.text, line.meaning].filter(Boolean).join(' '),
      at,
    );
    const until =
      exact && exact.charStart - at <= 80
        ? exact.charEnd
        : said && said.charEnd > at
          ? said.charEnd
          : undefined;
    lines.push({
      number: line.number,
      kind: line.kind,
      text: line.text,
      meaning: line.meaning ?? null,
      level: line.level ?? null,
      important: line.important ?? null,
      at,
      ...(until !== undefined ? { until } : {}),
      placed,
    });
    lastAt = Math.max(lastAt, at);
  }
  // In the order they are written, which the speech decides.
  const ordered = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.at - b.line.at || a.index - b.index)
    .map((entry) => entry.line);
  const cues: { line: number; at: number }[] = [];
  for (const point of points) {
    const index = ordered.findIndex((line) => line.number === point.number);
    if (index >= 0) cues.push({ line: index, at: point.at });
  }
  return { heading: board.heading, lines: ordered, cues };
}

/** A line's text as the pen writes it: no full stop at the end of a note. */
function noteText(text: string): string {
  return text
    .trim()
    .replace(/[.;:,]+$/, '')
    .trim();
}

/** The draft the rules and the builder take, from a marked board. */
export function markedDraft(board: PieceBoard): BoardDraft {
  const items: BoardDraftItem[] = board.lines.map((line) => ({
    kind: line.kind,
    text: noteText(line.text),
    meaning: line.meaning ? noteText(line.meaning) : null,
    level: line.level,
    important: line.important,
    at: line.at,
    ...(line.until !== undefined ? { until: line.until } : {}),
  }));
  for (const cue of board.cues) {
    const target = board.lines[cue.line];
    if (!target) continue;
    items.push({
      kind: 'cue',
      target: noteText(target.text),
      shape: 'underline',
      at: cue.at,
    });
  }
  items.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return { heading: board.heading, items };
}

/** A located draft item: where it belongs and whether the rules keep it. */
interface LocatedItem {
  item: BoardDraftItem;
  index: number;
  anchor: BoardAnchor | null;
  sentence: number;
  valid: boolean;
}

function locateItems(draft: BoardDraft, ctx: BoardContext): LocatedItem[] {
  const spans = sentenceSpans(ctx.spoken);
  const bad = new Set(
    boardProblems(draft, ctx)
      .filter((problem) => problem.index !== undefined)
      .map((problem) => problem.index as number),
  );
  let cursor = 0;
  return draft.items.map((raw, index) => {
    const item = asDrafted(raw);
    const anchor = anchorForItem(item, ctx.spoken, cursor);
    if (anchor) cursor = Math.max(cursor, anchor.charStart);
    const sentence = anchor
      ? spans.findIndex(
          (span) =>
            anchor.charStart >= span.charStart &&
            anchor.charStart < span.charEnd,
        )
      : -1;
    return {
      item,
      index,
      anchor,
      sentence,
      valid: !bad.has(index) && !!anchor,
    };
  });
}

const isWritten = (kind: DraftItemKind) =>
  kind === 'term' || kind === 'point' || kind === 'figure';

/**
 * The two drafts merged by spoken sentence, so the retry can only add.
 * Every item of the first draft the rules keep stays. Where a first-draft
 * item failed, the second draft's kept item for the same sentence stands
 * in. Then the second draft's kept items for sentences the first left
 * bare are added. Duplicates by text go; the rest is put in spoken order.
 */
export function mergeDrafts(
  first: BoardDraft,
  second: BoardDraft,
  ctx: BoardContext,
): BoardDraft {
  const a = locateItems(first, ctx);
  const b = locateItems(second, ctx);
  const merged: LocatedItem[] = [];
  const seen = new Set<string>();
  const keyOf = (item: BoardDraftItem) =>
    normalise(
      item.text ??
        `${item.kind}:${item.target ?? item.from ?? ''}:${item.to ?? ''}`,
    );
  const take = (entry: LocatedItem) => {
    const key = keyOf(entry.item);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    merged.push(entry);
    return true;
  };
  const used = new Set<number>();
  for (const entry of a) {
    if (entry.valid) {
      take(entry);
      continue;
    }
    if (!isWritten(entry.item.kind) || entry.sentence < 0) continue;
    const stand = b.find(
      (other) =>
        other.valid &&
        isWritten(other.item.kind) &&
        other.sentence === entry.sentence &&
        !used.has(other.index) &&
        !seen.has(keyOf(other.item)),
    );
    if (stand && take(stand)) used.add(stand.index);
  }
  const covered = new Set(
    merged.filter((entry) => isWritten(entry.item.kind)).map((e) => e.sentence),
  );
  for (const entry of b) {
    if (!entry.valid || used.has(entry.index)) continue;
    if (isWritten(entry.item.kind) && covered.has(entry.sentence)) continue;
    if (take(entry)) {
      used.add(entry.index);
      if (isWritten(entry.item.kind)) covered.add(entry.sentence);
    }
  }
  merged.sort(
    (x, y) => (x.anchor?.charStart ?? 0) - (y.anchor?.charStart ?? 0),
  );
  const headingProblem = first.heading?.trim()
    ? limitProblem(first.heading, 'heading', -1)
    : null;
  const heading =
    first.heading?.trim() && !headingProblem
      ? first.heading
      : (second.heading ?? first.heading);
  return { heading, items: merged.map((entry) => entry.item) };
}

/** A line the rules refused that no draft replaced, with the reason, for a repair. */
export interface LostItem {
  kind: DraftItemKind;
  text: string;
  meaning: string | null;
  reason: string;
}

/**
 * The written lines both drafts lost: refused by the rules in the draft
 * they came from, with no kept line for the same spoken sentence in the
 * merge. These go back to the writer once more, to be rewritten as the
 * lecturer's claim rather than left off.
 */
export function lostItems(
  drafts: BoardDraft[],
  merged: BoardDraft,
  ctx: BoardContext,
): LostItem[] {
  const covered = new Set(
    locateItems(merged, ctx)
      .filter((entry) => entry.valid && isWritten(entry.item.kind))
      .map((entry) => entry.sentence),
  );
  const lost: LostItem[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const reasons = new Map<number, string>();
    for (const problem of boardProblems(draft, ctx)) {
      if (problem.index === undefined) continue;
      reasons.set(
        problem.index,
        [reasons.get(problem.index), problem.detail].filter(Boolean).join('; '),
      );
    }
    for (const entry of locateItems(draft, ctx)) {
      if (entry.valid || !isWritten(entry.item.kind) || !entry.item.text)
        continue;
      if (entry.sentence >= 0 && covered.has(entry.sentence)) continue;
      const key = normalise(entry.item.text);
      if (seen.has(key)) continue;
      seen.add(key);
      lost.push({
        kind: entry.item.kind,
        text: entry.item.text,
        meaning: entry.item.meaning ?? null,
        reason: reasons.get(entry.index) ?? 'not placed in the spoken words',
      });
    }
  }
  return lost;
}

/**
 * The writer's repairs folded into the merged draft: each repair that the
 * rules keep, for a sentence the board still leaves bare, in spoken order.
 */
export function mergeRepairs(
  merged: BoardDraft,
  repairs: BoardDraft,
  ctx: BoardContext,
): BoardDraft {
  const base = locateItems(merged, ctx);
  const covered = new Set(
    base
      .filter((entry) => entry.valid && isWritten(entry.item.kind))
      .map((entry) => entry.sentence),
  );
  const seen = new Set(base.map((entry) => normalise(entry.item.text ?? '')));
  const said = base
    .filter((entry) => entry.valid && isWritten(entry.item.kind))
    .map(
      (entry) =>
        new Set(
          contentWords(`${entry.item.text ?? ''} ${entry.item.meaning ?? ''}`),
        ),
    );
  const added: LocatedItem[] = [];
  for (const entry of locateItems(repairs, ctx)) {
    if (!entry.valid || !isWritten(entry.item.kind)) continue;
    const key = normalise(entry.item.text ?? '');
    if (!key || seen.has(key)) continue;
    // A repair for a sentence the board already covers still goes on
    // when it says something new; only a repeat is left off.
    const words = contentWords(
      `${entry.item.text ?? ''} ${entry.item.meaning ?? ''}`,
    );
    if (said.some((earlier) => repeats(words, earlier))) continue;
    seen.add(key);
    covered.add(entry.sentence);
    said.push(new Set(words));
    added.push(entry);
  }
  if (!added.length) return merged;
  const all = [...base, ...added].sort(
    (x, y) => (x.anchor?.charStart ?? 0) - (y.anchor?.charStart ?? 0),
  );
  return { heading: merged.heading, items: all.map((entry) => entry.item) };
}

/**
 * Everything wrong with a draft, by item. The processor sends the reasons
 * back once; the second draft is filtered by the same rules rather than
 * refused, so a page never loses its board to a stubborn model.
 */
export function boardProblems(
  draft: BoardDraft,
  ctx: BoardContext,
): BoardProblem[] {
  const problems: BoardProblem[] = [];
  if (ctx.continues) {
    if (draft.heading?.trim()) {
      problems.push({
        kind: 'heading_forbidden',
        detail: 'This page continues a board that already has its heading',
      });
    }
  } else if (!draft.heading?.trim()) {
    problems.push({
      kind: 'heading_required',
      detail: 'A fresh board needs a heading of two to five words',
    });
  } else {
    const problem = limitProblem(draft.heading, 'heading', -1);
    if (problem) problems.push({ ...problem, index: undefined });
  }

  const seenText = new Set<string>();
  const namesSoFar: string[] = [];
  const cuesBySentence = new Map<number, number>();
  const spans = sentenceSpans(ctx.spoken);
  /** Where each written item lands, for coverage of the moves. */
  const placedAt: number[] = [];
  /** The content words of every written line so far: nothing is said twice. */
  const linesSoFar: Set<string>[] = [];
  /** The heading's words: a point that only repeats them says nothing; a term may name them. */
  const headingWords = new Set(contentWords(draft.heading ?? ''));
  let cursor = 0;

  draft.items.forEach((raw, index) => {
    const item = asDrafted(raw);
    const kind = item.kind;
    if (!['term', 'point', 'figure', 'relation', 'cue'].includes(kind)) {
      problems.push({ kind: 'unknown_kind', detail: `"${kind}"`, index });
      return;
    }
    const anchor = anchorForItem(item, ctx.spoken, cursor);
    if (!anchor) {
      problems.push({
        kind: 'anchor_missing',
        detail:
          typeof item.sentence === 'number'
            ? `sentence ${item.sentence} does not exist; the page has ${sentenceSpans(ctx.spoken).length} sentences`
            : `"${item.anchor ?? ''}" is not said on this page`,
        index,
      });
    } else {
      cursor = Math.max(cursor, anchor.charStart);
      if (kind === 'term' || kind === 'point' || kind === 'figure') {
        placedAt.push(anchor.charStart);
      }
    }

    const text = fittedText(kind, item.text ?? '');
    const meaning =
      kind === 'term' && item.meaning ? fittedMeaning(item.meaning) : null;
    if (
      (kind === 'term' || kind === 'point' || kind === 'figure') &&
      !isPlainAscii(`${text} ${meaning ?? ''}`)
    ) {
      problems.push({
        kind: 'non_ascii',
        detail: `"${text}" uses characters the board pen cannot write; plain letters, digits and punctuation only`,
        index,
      });
    }
    if (kind === 'term' || kind === 'point') {
      const problem = limitProblem(text, kind, index);
      if (problem) problems.push(problem);
      for (const value of [text, meaning]) {
        const cut = value ? cutWordAtEnd(value, ctx) : null;
        if (cut) {
          problems.push({
            kind: 'incomplete',
            detail: `"${value}" ends on the cut word "${cut}"; write the whole word or leave it out, never cut a word short`,
            index,
          });
        }
      }
      if (
        kind === 'point' &&
        text &&
        (readsAsHeading(text) ||
          namesTopic(text, [...(ctx.moves ?? []), draft.heading]))
      ) {
        problems.push({
          kind: 'topic_label',
          detail: `"${text}" is a heading, not a note; write the lecturer's claim about it, with its verb`,
          index,
        });
      }
      // A line says something no line before it says: the reason, the
      // example, the number, the condition. Saying an earlier line again
      // in other words costs a line and teaches nothing.
      if (text) {
        const words = contentWords(`${text} ${meaning ?? ''}`);
        const against =
          kind === 'term' || !headingWords.size
            ? linesSoFar
            : [...linesSoFar, headingWords];
        if (against.some((earlier) => repeats(words, earlier))) {
          problems.push({
            kind: 'restates',
            detail: `"${text}" only says a line already on the board again; write the reason, example, number or condition the lecturer gave instead`,
            index,
          });
        }
      }
      if (readsAsSentence(text)) {
        problems.push({
          kind: 'sentence',
          detail: `"${text}" reads as a sentence, not a label`,
          index,
        });
      }
      if (text && !grounded(text, ctx)) {
        const missing = ungroundedWords(text, ctx);
        problems.push({
          kind: 'ungrounded',
          detail: `"${text}": the words ${missing.map((w) => `"${w}"`).join(', ')} are not said on this page; use the lecturer's own word for each`,
          index,
        });
      }
      if (kind === 'term' && meaning) {
        const problem = limitProblem(meaning, 'meaning', index);
        if (problem) problems.push(problem);
        if (!grounded(meaning, ctx, true)) {
          const missing = ungroundedWords(meaning, ctx);
          problems.push({
            kind: 'ungrounded',
            detail: `meaning "${meaning}": the words ${missing.map((w) => `"${w}"`).join(', ')} are not what the lecturer says; a meaning uses only the lecturer's words on this page`,
            index,
          });
        }
      }
      const key = normalise(text);
      if (key && seenText.has(key)) {
        problems.push({ kind: 'duplicate', detail: `"${text}" twice`, index });
      }
      seenText.add(key);
      namesSoFar.push(key);
      linesSoFar.push(new Set(contentWords(`${text} ${meaning ?? ''}`)));
    } else if (kind === 'figure') {
      const tokens = wordsOf(text);
      if (
        !tokens.length ||
        tokens.length > FIGURE_MAX_TOKENS ||
        tokens.some((token) => token.length > FIGURE_MAX_TOKEN_CHARS)
      ) {
        problems.push({
          kind: 'too_long',
          detail: `figure "${text}" is not a short number or formula`,
          index,
        });
      }
      if (!figuresOnPage(text, ctx)) {
        problems.push({
          kind: 'ungrounded',
          detail: `figure "${text}" is not on the page`,
          index,
        });
      }
      seenText.add(normalise(text));
      namesSoFar.push(normalise(text));
    } else if (kind === 'relation') {
      const from = normalise(item.from ?? '');
      const to = normalise(item.to ?? '');
      if (!namesSoFar.includes(from) || !namesSoFar.includes(to)) {
        problems.push({
          kind: 'relation_targets',
          detail: `relation "${item.from}" to "${item.to}" names something not written before it`,
          index,
        });
      }
      if (item.label) {
        const problem = limitProblem(item.label, 'label', index);
        if (problem) problems.push(problem);
      }
    } else {
      const target = normalise(item.target ?? '');
      if (!namesSoFar.includes(target)) {
        problems.push({
          kind: 'relation_targets',
          detail: `cue on "${item.target}", which is not written before it`,
          index,
        });
      }
      if (anchor) {
        const sentence = spans.findIndex(
          (span) =>
            anchor.charStart >= span.charStart &&
            anchor.charStart < span.charEnd,
        );
        const count = (cuesBySentence.get(sentence) ?? 0) + 1;
        cuesBySentence.set(sentence, count);
        if (count > 1) {
          problems.push({
            kind: 'cue_density',
            detail: 'more than one cue in one sentence',
            index,
          });
        }
      }
    }
  });

  const written = draft.items.filter((item) =>
    ['term', 'point', 'figure'].includes(item.kind),
  ).length;
  const maxItems = maxWrittenFor(ctx.style, ctx.durationMs);
  if (written > maxItems) {
    problems.push({
      kind: 'budget',
      detail: `${written} written items; the pen can manage ${maxItems} on this page, so keep the ones that matter most`,
    });
  }
  // Coverage: every move the page spends real words on has a note under
  // it. A board that skips a move is not one a student can follow from.
  if (!ctx.light) {
    for (const span of ctx.moveSpans ?? []) {
      const said = ctx.spoken.slice(span.charStart, span.charEnd);
      if (wordsOf(said).length < COVERAGE_MIN_WORDS) continue;
      const covered = placedAt.some(
        (at) => at >= span.charStart && at < span.charEnd,
      );
      if (!covered) {
        problems.push({
          kind: 'coverage',
          detail: `nothing is written while "${span.label}" is taught ("${wordsOf(said).slice(0, 8).join(' ')}..."); write what it establishes`,
        });
      }
    }
  }
  return problems;
}

/**
 * The last word of a line when it is a word cut short: not a word of the
 * page, the speech or the plan, but the start of one ("remo" for
 * "removed"). A writer asked to condense sometimes cuts letters instead
 * of words, and a cut word on a board is worse than a missing one.
 */
export function cutWordAtEnd(text: string, ctx: BoardContext): string | null {
  const tail = /[A-Za-z]+$/.exec(asciiText(text).trim());
  if (!tail) return null;
  const last = tail[0].toLowerCase();
  if (last.length < 3 || STOP_WORDS.has(last)) return null;
  const source = [ctx.pageText, ctx.spoken, ...ctx.planLines].join(' ');
  const pool = new Set([
    ...normalise(source).split(' '),
    ...normalise(abbreviated(source)).split(' '),
  ]);
  if (pool.has(last) || pool.has(stem(last))) return null;
  const longer = [...pool].some(
    (word) => word.length > last.length && word.startsWith(last),
  );
  return longer ? tail[0] : null;
}

/** The line without its cut last word, and without the slash or comma left hanging. */
export function withoutCutWord(text: string): string {
  return text
    .trim()
    .replace(/[A-Za-z]+$/, '')
    .trim()
    .replace(/[/,;:-]+$/, '')
    .trim();
}

/**
 * A draft with cut words mended: a text or meaning that ends on a word
 * cut short loses that word, when what is left still finishes a phrase.
 * Otherwise the line is left as it is, for the rules to refuse.
 */
export function repairCutWords(
  draft: BoardDraft,
  ctx: BoardContext,
): BoardDraft {
  const mend = (
    value: string | null | undefined,
  ): string | null | undefined => {
    if (!value) return value;
    const cut = cutWordAtEnd(value, ctx);
    if (!cut) return value;
    const rest = withoutCutWord(value);
    return wordsOf(rest).length >= 2 && !endsMidPhrase(rest) ? rest : value;
  };
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.kind === 'term' || item.kind === 'point' || item.kind === 'figure'
        ? {
            ...item,
            text: mend(item.text) ?? null,
            meaning: mend(item.meaning) ?? null,
          }
        : item,
    ),
  };
}

/** A line as the board planner returned it, before it is numbered. */
export interface PlanLineDraft {
  move: number;
  kind: 'term' | 'point' | 'figure';
  text: string;
  meaning: string | null;
  level: 1 | 2 | null;
  important: boolean | null;
}

/**
 * The rules a planned board is held to before the speech exists: every
 * line a short, complete, plain note that says something true, nothing
 * said twice, every move named one the page has. Grounding is against
 * the page and the plan here, with the usual slack; the spoken words
 * check every line again once they exist, and the lecturer is asked to
 * say each line as it is written, so a planned line is rarely lost then.
 */
export function planProblems(
  plan: { heading: string; lines: PlanLineDraft[] },
  ctx: {
    pageText: string;
    planLines: string[];
    moves: string[];
    /** A slow learner's meanings are in everyday words, so they are not held to the page's. */
    style?: LectureStyle;
  },
): BoardProblem[] {
  const problems: BoardProblem[] = [];
  const pool: BoardContext = {
    spoken: '',
    pageText: ctx.pageText,
    planLines: ctx.planLines,
    style: 'gentle',
    durationMs: 0,
    continues: false,
    light: false,
    moves: ctx.moves,
  };
  const headingProblem = limitProblem(plan.heading, 'heading', -1);
  if (headingProblem) problems.push({ ...headingProblem, index: undefined });
  const headingWords = new Set(contentWords(plan.heading));
  const seen = new Set<string>();
  const linesSoFar: Set<string>[] = [];
  const moveCount = Math.max(1, ctx.moves.length);
  plan.lines.forEach((line, index) => {
    const kind = line.kind;
    const text = fittedText(kind, line.text ?? '');
    const meaning =
      kind === 'term' && line.meaning ? fittedMeaning(line.meaning) : null;
    if (
      !Number.isInteger(line.move) ||
      line.move < 0 ||
      line.move >= moveCount
    ) {
      problems.push({
        kind: 'anchor_missing',
        detail: `"${text}" names move ${line.move}; the page has moves 0 to ${moveCount - 1}`,
        index,
      });
    }
    if (!isPlainAscii(`${text} ${meaning ?? ''}`)) {
      problems.push({
        kind: 'non_ascii',
        detail: `"${text}" uses characters the board pen cannot write; plain letters, digits and punctuation only`,
        index,
      });
    }
    if (kind === 'figure') {
      const tokens = wordsOf(text);
      if (
        !tokens.length ||
        tokens.length > FIGURE_MAX_TOKENS ||
        tokens.some((token) => token.length > FIGURE_MAX_TOKEN_CHARS)
      ) {
        problems.push({
          kind: 'too_long',
          detail: `figure "${text}" is not a short number or formula`,
          index,
        });
      }
      if (!figuresOnPage(text, pool)) {
        problems.push({
          kind: 'ungrounded',
          detail: `figure "${text}" is not on the page`,
          index,
        });
      }
      seen.add(normalise(text));
      return;
    }
    const problem = limitProblem(text, kind, index);
    if (problem) problems.push(problem);
    for (const value of [text, meaning]) {
      const cut = value ? cutWordAtEnd(value, pool) : null;
      if (cut) {
        problems.push({
          kind: 'incomplete',
          detail: `"${value}" ends on the cut word "${cut}"; write the whole word or leave it out, never cut a word short`,
          index,
        });
      }
    }
    if (
      kind === 'point' &&
      text &&
      (readsAsHeading(text) || namesTopic(text, [...ctx.moves, plan.heading]))
    ) {
      problems.push({
        kind: 'topic_label',
        detail: `"${text}" is a heading, not a note; write the lecturer's claim about it, with its verb`,
        index,
      });
    }
    if (text) {
      const words = contentWords(`${text} ${meaning ?? ''}`);
      const against =
        kind === 'term' || !headingWords.size
          ? linesSoFar
          : [...linesSoFar, headingWords];
      if (against.some((earlier) => repeats(words, earlier))) {
        problems.push({
          kind: 'restates',
          detail: `"${text}" only says a line already on the board again; write the reason, example, number or condition instead`,
          index,
        });
      }
    }
    if (readsAsSentence(text)) {
      problems.push({
        kind: 'sentence',
        detail: `"${text}" reads as a sentence, not a note`,
        index,
      });
    }
    // A slow learner's points are in everyday words, said aloud by the
    // lecturer and checked as speech; a term's name is always the page's.
    const held = ctx.style !== 'gentle' || kind === 'term';
    if (text && held && !grounded(text, pool)) {
      const missing = ungroundedWords(text, pool);
      problems.push({
        kind: 'ungrounded',
        detail: `"${text}": the words ${missing.map((w) => `"${w}"`).join(', ')} are not on the page; use the page's own word for each`,
        index,
      });
    }
    if (kind === 'term' && meaning) {
      const meaningProblem = limitProblem(meaning, 'meaning', index);
      if (meaningProblem) problems.push(meaningProblem);
      // A slow learner hears the meaning as one short sentence, so it is
      // a short phrase on the board too.
      if (ctx.style === 'gentle' && wordsOf(meaning).length > 12) {
        problems.push({
          kind: 'too_long',
          detail: `meaning "${meaning}" has ${wordsOf(meaning).length} words; for a slow learner a meaning is a short phrase of at most twelve words`,
          index,
        });
      }
      // A meaning in everyday words uses words the page does not; the
      // lecturer says it aloud, and the verifier checks the speech.
      if (ctx.style !== 'gentle' && !grounded(meaning, pool)) {
        const missing = ungroundedWords(meaning, pool);
        problems.push({
          kind: 'ungrounded',
          detail: `meaning "${meaning}": the words ${missing.map((w) => `"${w}"`).join(', ')} are not on the page; a meaning uses the page's own words`,
          index,
        });
      }
    }
    const key = normalise(text);
    if (key && seen.has(key)) {
      problems.push({ kind: 'duplicate', detail: `"${text}" twice`, index });
    }
    seen.add(key);
    linesSoFar.push(new Set(contentWords(`${text} ${meaning ?? ''}`)));
  });
  return problems;
}

/**
 * Two plans for the same page, merged so a retry can only add: every kept
 * line of the first stays, and a kept line of the second joins when no
 * line already says it (by text, or by the words it carries). Lines are
 * put in move order, each draft's own order within a move.
 */
export function mergePlanLines(
  first: PlanLineDraft[],
  second: PlanLineDraft[],
): PlanLineDraft[] {
  const merged = [...first];
  const seen = new Set(merged.map((line) => normalise(line.text)));
  const said = merged.map(
    (line) => new Set(contentWords(`${line.text} ${line.meaning ?? ''}`)),
  );
  for (const line of second) {
    const key = normalise(line.text);
    if (!key || seen.has(key)) continue;
    const words = contentWords(`${line.text} ${line.meaning ?? ''}`);
    if (said.some((earlier) => repeats(words, earlier))) continue;
    merged.push(line);
    seen.add(key);
    said.push(new Set(words));
  }
  return merged
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.move - b.line.move || a.index - b.index)
    .map((entry) => entry.line);
}

/**
 * The planned lines a stored board carries, read back from its own ops,
 * so a board from an older writer can be built again without a model
 * call: the heading from its first board, each written op a line in
 * order. Null for a board with nothing written.
 */
export function linesOfTimeline(timeline: BoardTimeline): {
  heading: string | null;
  lines: (PlanLineDraft & { number: number })[];
} | null {
  const lines = timeline.ops
    .filter(
      (op): op is Extract<BoardOp, { kind: 'term' | 'point' | 'figure' }> =>
        op.kind === 'term' || op.kind === 'point' || op.kind === 'figure',
    )
    .map((op, index) => ({
      number: index + 1,
      move: 0,
      kind: op.kind,
      text: op.text,
      meaning: op.kind === 'term' ? (op.meaning ?? null) : null,
      level: op.kind === 'point' ? (op.level ?? null) : null,
      important: op.important ?? null,
    }));
  if (!lines.length) return null;
  const heading = timeline.boards.find((board) => !board.continues)?.heading;
  return { heading: heading?.trim() || null, lines };
}

/** A stable seed from a string, for deterministic jitter. */
export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface BuiltBoard {
  boards: BoardSpec[];
  ops: BoardOp[];
}

/**
 * Turns an accepted draft into operations: anchors resolved to offsets,
 * items that still break a rule dropped, the budget enforced by dropping
 * the lowest priority from the end, ids and seeds assigned, lines given
 * out with a fresh board when the column is full.
 */
export function buildBoardOps(
  draft: BoardDraft,
  ctx: BoardContext,
  rowKey: string,
  boardIdPrefix: string,
): BuiltBoard {
  const problems = boardProblems(draft, ctx);
  const bad = new Set(
    problems
      .filter((problem) => problem.index !== undefined)
      .map((problem) => problem.index as number),
  );
  const items = draft.items
    .map((item, index) => ({ item: asDrafted(item), index }))
    .filter(({ index }) => !bad.has(index));

  // The cap: drop written items from the end. One item keeps its
  // importance, the first the writer marked; the rest are ordinary. The
  // draft index rides along so a detail can tell whether its parent
  // survived.
  const maxItems = maxWrittenFor(ctx.style, ctx.durationMs);
  const kept: { item: BoardDraftItem; index: number }[] = [];
  let written = 0;
  let importantSeen = false;
  for (const { item, index } of items) {
    if (['term', 'point', 'figure'].includes(item.kind)) {
      if (written >= maxItems) continue;
      written += 1;
    }
    const important = Boolean(item.important) && !importantSeen;
    if (important) importantSeen = true;
    kept.push({ item: { ...item, important }, index });
  }

  const boards: BoardSpec[] = [];
  const ops: BoardOp[] = [];
  let boardIndex = 0;
  let boardId = `${boardIdPrefix}-${boardIndex}`;
  let line = ctx.continues ? Math.max(1, ctx.startLine ?? 1) : 1;
  let cursor = 0;
  const idByName = new Map<string, string>();
  const headingText = ctx.continues ? null : (draft.heading?.trim() ?? 'Notes');

  const openBoard = (heading: string, continues: boolean) => {
    boards.push({ id: boardId, heading, startsAtMs: null, continues });
  };
  if (ctx.continues) {
    openBoard('', true);
  } else {
    openBoard(headingText ?? 'Notes', false);
    ops.push({
      id: `${rowKey}-heading`,
      kind: 'heading',
      boardId,
      anchor: { charStart: 0, charEnd: 0 },
      t0Ms: null,
      durMs: null,
      seed: seedOf(`${rowKey}-heading`),
      slot: HEADING_SLOT,
      priority: 1,
      text: headingText ?? 'Notes',
    });
  }

  let counter = 0;
  /** The written item before this one, to hang a detail under. */
  let prevWritten: {
    index: number;
    kind: DraftItemKind;
    text: string;
  } | null = null;
  /** The last term or level-1 point: what a detail on a fresh board hangs under. */
  let lastParent: { kind: 'term' | 'point'; text: string } | null = null;
  for (let k = 0; k < kept.length; k += 1) {
    const { item, index } = kept[k];
    const anchor = anchorForItem(item, ctx.spoken, cursor);
    if (!anchor) continue;
    cursor = Math.max(cursor, anchor.charStart);
    counter += 1;
    const id = `${rowKey}-${item.kind}-${counter}`;
    const base = {
      id,
      boardId,
      anchor,
      t0Ms: null,
      durMs: null,
      seed: seedOf(id + (item.text ?? '')),
    };
    if (
      item.kind === 'term' ||
      item.kind === 'point' ||
      item.kind === 'figure'
    ) {
      const fitted = fittedText(item.kind, item.text ?? '');
      const fittedMeaningText =
        item.kind === 'term' && item.meaning ? fittedMeaning(item.meaning) : '';
      const lines =
        item.kind === 'term'
          ? 1 + (fittedMeaningText ? linesOf(fittedMeaningText, 'meaning') : 0)
          : linesOf(fitted, 'point');
      // A term keeps its first detail with it: if the two would straddle
      // the bottom of the column, the fresh board opens before the term.
      const following = kept[k + 1];
      const withChild =
        item.kind === 'term' &&
        following &&
        following.index === index + 1 &&
        following.item.kind === 'point' &&
        following.item.level === 2
          ? 1
          : 0;
      if (line + lines + withChild - 1 > BOARD_LINES) {
        // The column is full: a fresh board, same heading, and on we go.
        boardIndex += 1;
        const nextBoardId = `${boardIdPrefix}-${boardIndex}`;
        ops.push({
          id: `${rowKey}-board-${boardIndex}`,
          kind: 'board',
          boardId,
          anchor,
          t0Ms: null,
          durMs: null,
          seed: seedOf(`${rowKey}-board-${boardIndex}`),
          slot: HEADING_SLOT,
          priority: 1,
          nextBoardId,
        });
        boardId = nextBoardId;
        openBoard(boards[boards.length - 1].heading || 'Notes', false);
        line = 1;
        base.boardId = boardId;
        // A detail that lands on the fresh board brings its parent's name
        // with it, so the new board does not open with an orphan.
        if (item.kind === 'point' && item.level === 2 && lastParent !== null) {
          const echoId = `${rowKey}-echo-${counter}`;
          const echo = {
            id: echoId,
            boardId,
            anchor,
            t0Ms: null,
            durMs: null,
            seed: seedOf(echoId),
            slot: 1,
            priority: 4,
            text: lastParent.text,
            important: false,
          };
          if (lastParent.kind === 'term') {
            ops.push({ ...echo, kind: 'term', meaning: null });
          } else {
            ops.push({ ...echo, kind: 'point', level: 1 });
          }
          prevWritten = {
            index: index - 1,
            kind: lastParent.kind,
            text: lastParent.text,
          };
          line = 2;
        }
      }
      const slot = line;
      line += lines;
      const text = fitted;
      idByName.set(normalise(text), id);
      const important = Boolean(item.important);
      // Said as written: the pen will follow the voice through these words.
      const dictated =
        typeof item.until === 'number' && item.until > (item.at ?? 0)
          ? { dictated: true }
          : {};
      if (item.kind === 'term') {
        ops.push({
          ...base,
          ...dictated,
          kind: 'term',
          slot,
          lines,
          priority: 2,
          text,
          meaning:
            item.meaning && meaningSpokenNear(item.meaning, ctx.spoken, anchor)
              ? fittedMeaning(item.meaning) || null
              : null,
          important,
        });
      } else if (item.kind === 'point') {
        // A detail belongs under the item written just before it. When
        // that item was dropped, or this is the first line of a board, the
        // detail stands at the margin: a flat point is merely less
        // structured, a point under the wrong parent teaches a wrong
        // association.
        const level: 1 | 2 =
          item.level === 2 &&
          slot > 1 &&
          prevWritten !== null &&
          prevWritten.index === index - 1 &&
          prevWritten.kind !== 'figure'
            ? 2
            : 1;
        ops.push({
          ...base,
          ...dictated,
          kind: 'point',
          slot,
          lines,
          priority: important ? 2 : level === 2 ? 6 : 5,
          text,
          level,
          important,
        });
      } else {
        ops.push({
          ...base,
          ...dictated,
          kind: 'figure',
          slot,
          lines,
          priority: 3,
          text,
          important,
        });
      }
      prevWritten = { index, kind: item.kind, text };
      if (item.kind === 'term' || (item.kind === 'point' && item.level !== 2)) {
        lastParent = { kind: item.kind, text };
      }
    } else if (item.kind === 'relation') {
      const fromId = idByName.get(normalise(item.from ?? ''));
      const toId = idByName.get(normalise(item.to ?? ''));
      if (!fromId || !toId) continue;
      ops.push({
        ...base,
        kind: 'relation',
        slot: 0,
        priority: 4,
        fromId,
        toId,
        label: item.label?.trim() || null,
      });
    } else {
      const targetId = idByName.get(normalise(item.target ?? ''));
      if (!targetId) continue;
      ops.push({
        ...base,
        kind: 'cue',
        slot: 0,
        priority: 6,
        targetId,
        shape: item.shape ?? 'underline',
        offMs: null,
      });
    }
  }
  // A page always has its one red line, and it is the claim the page
  // exists to make: scored by its words against the page's idea, later in
  // the page over earlier, a point over a term, never the first thing
  // written. The writer's own mark stands unless it fell on the opening
  // line while a better claim is on the board.
  const writtenOps = ops.filter(
    (op): op is Extract<BoardOp, { kind: 'term' | 'point' | 'figure' }> =>
      op.kind === 'term' || op.kind === 'point' || op.kind === 'figure',
  );
  if (writtenOps.length) {
    const goalWords = new Set(
      contentWords([ctx.goal ?? '', ...(ctx.moves ?? [])].join(' ')),
    );
    const spans = sentenceSpans(ctx.spoken);
    const firstSentenceEnd = spans[0]?.charEnd ?? 0;
    // The closing stretch: the last sentence, and the one before it on a
    // page long enough to have a sign-off of two.
    const lastSentenceStart =
      spans.length >= 6
        ? spans[spans.length - 2].charStart
        : spans.length > 1
          ? spans[spans.length - 1].charStart
          : ctx.spoken.length;
    const textOf = (op: (typeof writtenOps)[number]) =>
      op.kind === 'term' ? `${op.text} ${op.meaning ?? ''}` : op.text;
    const emphasis =
      /\b(?:key|crucial|essential|critical|must|the point|important|remember|minimi[sz]es?|prevents?|never|always)\b/i;
    const sentenceOf = (at: number) => {
      const span = spans.find((s) => at >= s.charStart && at < s.charEnd);
      return span ? ctx.spoken.slice(span.charStart, span.charEnd) : '';
    };
    const score = (op: (typeof writtenOps)[number]) => {
      let value = contentWords(textOf(op)).filter((w) =>
        goalWords.has(w),
      ).length;
      if (emphasis.test(sentenceOf(op.anchor.charStart))) value += 2;
      if (op.anchor.charStart >= ctx.spoken.length * 0.85) value -= 3;
      if (
        op.anchor.charStart >= (ctx.spoken.length * 2) / 3 &&
        op.anchor.charStart < lastSentenceStart
      ) {
        value += 1;
      }
      if (op.anchor.charStart < firstSentenceEnd) value -= 2;
      // The closing sentence is a transition more often than the claim.
      if (op.anchor.charStart >= lastSentenceStart) value -= 2;
      if (op.kind === 'term') value -= 4;
      if (op.kind === 'point' && op.level === 2) value -= 1;
      return value;
    };
    // A point, and not one in the closing stretch, whenever the board has
    // one: the filters are hard, the score only ranks what is left.
    const inClose = (op: (typeof writtenOps)[number]) =>
      op.anchor.charStart >= lastSentenceStart ||
      op.anchor.charStart >= ctx.spoken.length * 0.85;
    const points = writtenOps.filter((op) => op.kind === 'point');
    const pool =
      points.filter((op) => !inClose(op)).length > 0
        ? points.filter((op) => !inClose(op))
        : points.length
          ? points
          : writtenOps;
    let best = pool[0];
    for (const op of pool) if (score(op) >= score(best)) best = op;
    const marked = writtenOps.find((op) => op.important);
    const veto =
      marked !== undefined &&
      marked === writtenOps[0] &&
      best !== marked &&
      score(best) > score(marked);
    if (!marked || veto) {
      if (marked) {
        marked.important = false;
        if (marked.kind === 'point')
          marked.priority = marked.level === 2 ? 6 : 5;
      }
      best.important = true;
      if (best.kind === 'point') best.priority = 2;
    }
  }
  return { boards, ops };
}

/** Written items a built board carries: what a second draft must match to replace the first. */
export function writtenCount(built: BuiltBoard): number {
  return built.ops.filter(
    (op) => op.kind === 'term' || op.kind === 'point' || op.kind === 'figure',
  ).length;
}

// ── Deterministic boards for the segments around a chapter ───────────────────

/** The words a slow learner hears first: one term per plan term, as said. */
export function termsDraft(
  chapterTitle: string,
  terms: { term: string; meaning: string }[],
): BoardDraft {
  return {
    heading: wordsOf(chapterTitle).slice(0, 5).join(' ') || 'Words first',
    items: terms.map((entry) => ({
      kind: 'term' as const,
      text: shorten(entry.term, WORD_LIMITS.term.max, CHAR_LIMITS.term),
      // The plan's meaning is a sentence; the board writes the same thing
      // in a teacher's shorthand, finished rather than cut.
      meaning: shorten(
        entry.meaning,
        WORD_LIMITS.meaning.max,
        charLimitOf('meaning'),
      ),
      anchor: entry.term,
    })),
  };
}

const QUESTION_LEAD = new Set([
  'what',
  'why',
  'how',
  'which',
  'when',
  'where',
  'who',
  'does',
  'do',
  'did',
  'is',
  'are',
  'was',
  'were',
  'can',
  'could',
  'would',
  'should',
  'the',
  'a',
  'an',
  'this',
  'that',
  'it',
]);

/**
 * The check of what stuck: each question's own words, in a teacher's
 * shorthand (the question words and the small words dropped), as it is
 * asked. "What does the refill rate set?" is written "refill rate set".
 */
export function checkDraft(spoken: string): BoardDraft {
  const questions = sentenceSpans(spoken)
    .map((span) => spoken.slice(span.charStart, span.charEnd))
    .filter((sentence) => sentence.trim().endsWith('?'));
  return {
    heading: 'What stuck',
    items: questions
      .slice(0, 5)
      .map((question) => {
        const words = wordsOf(question.replace(/[?]+$/, ''));
        const kept = words.map((word) => word.replace(/[^\w'-]+$/g, ''));
        let start = 0;
        while (
          start < kept.length - 1 &&
          QUESTION_LEAD.has(kept[start].toLowerCase())
        ) {
          start += 1;
        }
        const text = shorten(
          kept.slice(start, start + 5).join(' '),
          WORD_LIMITS.point.max,
          CHAR_LIMITS.point,
        );
        return {
          kind: 'point' as const,
          text,
          anchor: words.slice(0, 4).join(' '),
        };
      })
      .filter((item) => item.text.length > 0),
  };
}

// ── Cost, timing and word times ──────────────────────────────────────────────

/** How long the pen takes to write a text, by style. */
export function writingCostMs(text: string, style: LectureStyle): number {
  const cost = WRITING_COST[style];
  return Math.round(cost.baseMs + cost.perCharMs * text.trim().length);
}

/** How long the pen would take for an operation, uncompressed. */
export function naturalCostMs(
  op: BoardOp,
  diagrams: DiagramGeometry[],
  style: LectureStyle,
): number {
  switch (op.kind) {
    case 'heading':
    case 'point':
    case 'figure':
      return writingCostMs(op.text, style);
    case 'term':
      return writingCostMs(
        op.text + (op.meaning ? ' ' + op.meaning : ''),
        style,
      );
    case 'relation':
      return writingCostMs(op.label ?? 'xxxx', style);
    case 'diagram': {
      const geometry = diagrams.find((entry) => entry.id === op.diagramId);
      if (!geometry) return 0;
      return (
        geometry.nodes.length * DIAGRAM_COST.nodeMs +
        geometry.edges.length * DIAGRAM_COST.edgeMs +
        geometry.groups.length * DIAGRAM_COST.groupMs
      );
    }
    case 'cue':
      return CUE_DURATION_MS;
    case 'board':
      return BOUNDARY_MS;
  }
}

/** Evenly spread word times from the spoken text alone. */
export function estimateWordTimes(
  spoken: string,
  durationMs: number,
  audioKey: string,
): WordTimes {
  const words: number[][] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  const perChar = durationMs / Math.max(spoken.length, 1);
  while ((match = pattern.exec(spoken)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    words.push([
      start,
      end,
      Math.round(start * perChar),
      Math.round(end * perChar),
    ]);
  }
  return {
    version: 1,
    source: 'estimate',
    audioKey,
    words,
    sentences: sentencesFromWords(spoken, words),
  };
}

function sentencesFromWords(spoken: string, words: number[][]): number[][] {
  return sentenceSpans(spoken).map((span) => {
    const inside = words.filter(
      (word) => word[0] >= span.charStart && word[1] <= span.charEnd,
    );
    const first = inside[0];
    const last = inside[inside.length - 1];
    return [
      span.charStart,
      span.charEnd,
      first ? first[2] : 0,
      last ? last[3] : first ? first[3] : 0,
    ];
  });
}

/** One entry of an aligner's word timeline, as the adapter hands it over. */
export interface AlignedWord {
  text: string;
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
}

/**
 * Word times from an aligner's output, or null when the output does not
 * pass the sanity checks: starts must not go backwards, the words must
 * cover nearly all of the text, the total must match the audio, and no
 * word may drag on for seconds. Words the aligner skipped take the time
 * between their neighbours.
 */
export function wordTimesFromAligned(
  aligned: AlignedWord[],
  spoken: string,
  durationMs: number,
  audioKey: string,
  source: Exclude<WordTimesSource, 'estimate'>,
): WordTimes | null {
  const expected = spoken.match(/\S+/g) ?? [];
  if (!aligned.length || !expected.length) return null;
  let last = -1;
  for (const word of aligned) {
    if (word.startMs < last - 50) return null;
    if (word.endMs - word.startMs > 3000) return null;
    last = Math.max(last, word.startMs);
  }
  if (aligned.length < expected.length * 0.9) return null;
  const spoken_end = aligned[aligned.length - 1].endMs;
  if (Math.abs(spoken_end - durationMs) > Math.max(durationMs * 0.15, 1500)) {
    return null;
  }
  const words: number[][] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  while ((match = pattern.exec(spoken)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // The aligned word that covers this offset, if any.
    while (cursor < aligned.length && aligned[cursor].charEnd <= start) {
      cursor += 1;
    }
    const hit = aligned[cursor];
    if (hit && hit.charStart <= start && hit.charEnd >= end - 1) {
      words.push([start, end, hit.startMs, hit.endMs]);
    } else {
      words.push([start, end, -1, -1]);
    }
  }
  // Fill the gaps between neighbours.
  for (let i = 0; i < words.length; i += 1) {
    if (words[i][2] >= 0) continue;
    let prev = i - 1;
    while (prev >= 0 && words[prev][2] < 0) prev -= 1;
    let next = i + 1;
    while (next < words.length && words[next][2] < 0) next += 1;
    const prevEnd = prev >= 0 ? words[prev][3] : 0;
    const nextStart = next < words.length ? words[next][2] : durationMs;
    const span = Math.max(nextStart - prevEnd, 0);
    const count = next - prev - 1;
    const position = i - prev;
    words[i][2] = Math.round(prevEnd + (span * (position - 1)) / count);
    words[i][3] = Math.round(prevEnd + (span * position) / count);
  }
  return {
    version: 1,
    source,
    audioKey,
    words,
    sentences: sentencesFromWords(spoken, words),
  };
}

/** The start of the word at or after a character offset. */
export function wordStartAt(times: WordTimes, charStart: number): number {
  const words = times.words;
  let lo = 0;
  let hi = words.length - 1;
  let answer = words.length ? words[words.length - 1][2] : 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid][1] > charStart) {
      answer = words[mid][2];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return answer;
}

/** When the word ending at or before `charEnd` finishes; the audio start when none does. */
export function wordEndAt(times: WordTimes, charEnd: number): number {
  let answer = 0;
  for (const word of times.words) {
    if (word[0] >= charEnd) break;
    answer = word[3];
  }
  return answer;
}

/**
 * The moments the words of a dictated item begin, from its start, with
 * the end of the last after them. The spoken words over the item's span
 * are matched to the written ones in order, so a small paraphrase ("is a
 * method" for ": a method") still paces the pen; a written word the
 * voice skips takes its time from its neighbours. Null when fewer than
 * six in ten written words are found, and the pen keeps an even pace.
 */
export function paceOf(
  op: BoardOp,
  times: WordTimes,
  fromMs: number,
  toMs: number,
  spoken?: string,
): number[] | null {
  if (op.kind !== 'term' && op.kind !== 'point' && op.kind !== 'figure') {
    return null;
  }
  const written = [
    ...wordsOf(op.text),
    ...(op.kind === 'term' && op.meaning ? wordsOf(op.meaning) : []),
  ].map((word) => normalise(word).replace(/ /g, ''));
  const said = times.words
    .filter(
      (word) => word[0] >= op.anchor.charStart && word[0] < op.anchor.charEnd,
    )
    .map((word) => ({
      key: spoken
        ? normalise(spoken.slice(word[0], word[1])).replace(/ /g, '')
        : '',
      startMs: word[2],
      endMs: word[3],
    }));
  if (written.length < 2 || said.length < 2) return null;
  // In-order greedy match, each written word to the next spoken word
  // equal to it within a short reach. Without the text, the words are
  // matched by position when there are as many of each.
  const matched: (number | null)[] = [];
  if (!spoken) {
    if (said.length !== written.length) return null;
    written.forEach((_, i) => matched.push(i));
  } else {
    let cursor = 0;
    for (const word of written) {
      let hit: number | null = null;
      for (let j = cursor; j < Math.min(said.length, cursor + 5); j += 1) {
        if (said[j].key && said[j].key === word) {
          hit = j;
          break;
        }
      }
      matched.push(hit);
      if (hit !== null) cursor = hit + 1;
    }
  }
  const hits = matched.filter((index) => index !== null).length;
  if (hits < Math.max(2, Math.ceil(written.length * 0.6))) return null;
  const starts: number[] = written.map((_, i) => {
    const index = matched[i];
    return index === null
      ? Number.NaN
      : Math.max(0, said[index].startMs - fromMs);
  });
  // Unmatched words take their time from the nearest matched neighbours.
  for (let i = 0; i < starts.length; i += 1) {
    if (!Number.isNaN(starts[i])) continue;
    let before = i - 1;
    while (before >= 0 && Number.isNaN(starts[before])) before -= 1;
    let after = i + 1;
    while (after < starts.length && Number.isNaN(starts[after])) after += 1;
    const from = before >= 0 ? starts[before] : 0;
    const lastIndex = matched[matched.length - 1];
    const to =
      after < starts.length
        ? starts[after]
        : Math.max(
            from,
            (lastIndex !== null ? said[lastIndex].endMs : toMs) - fromMs,
          );
    const span = after - before;
    starts[i] = from + ((to - from) * (i - before)) / span;
  }
  const lastMatched = [...matched].reverse().find((index) => index !== null);
  const end = Math.max(
    starts[starts.length - 1],
    (lastMatched !== null && lastMatched !== undefined
      ? said[lastMatched].endMs
      : toMs) - fromMs,
  );
  const pace = [...starts, end];
  for (let i = 1; i < pace.length; i += 1) {
    if (pace[i] < pace[i - 1]) pace[i] = pace[i - 1];
  }
  return pace.map((value) => Math.round(value));
}

/** The sentence containing an offset, or the last one. */
export function sentenceAt(
  times: WordTimes,
  charStart: number,
): number[] | null {
  const hit = times.sentences.find(
    (sentence) => charStart >= sentence[0] && charStart < sentence[1],
  );
  return hit ?? times.sentences[times.sentences.length - 1] ?? null;
}

/** The sentence a moment of the audio falls in, as an index, or -1. */
export function sentenceIndexAtMs(times: WordTimes, ms: number): number {
  for (let i = 0; i < times.sentences.length; i += 1) {
    const sentence = times.sentences[i];
    if (ms >= sentence[2] && ms < sentence[3]) return i;
    if (ms < sentence[2]) return Math.max(0, i - 1);
  }
  return times.sentences.length - 1;
}

/**
 * Gives every operation its time.
 *
 * The pen starts a breath before the word (the lead, by style), never
 * late, and one pen writes one thing at a time; when the voice gets
 * ahead, an item is compressed, and when even that cannot save it, the
 * least important items go rather than the board trailing the voice.
 * Cues are a second, instant hand and never hold the pen up.
 */
export function timeBoard(
  timeline: BoardTimeline,
  wordTimes: WordTimes,
  durationMs: number,
  style: LectureStyle,
  /** The spoken text the times are of, so a dictated line can pace by its words. */
  spoken?: string,
): BoardTimeline {
  const timed: BoardOp[] = [];
  let penFreeAt = 0;
  let dropped = 0;
  const startedBoards = new Map<string, number>();
  const ordered = [...timeline.ops].sort(
    (a, b) => a.anchor.charStart - b.anchor.charStart || priorityOrder(a, b),
  );
  // On a marked timeline the voice waits for the pen: times are board
  // time, audio time plus the holds so far, and a line the pen cannot
  // finish by the end of its sentence adds a hold there.
  const marked = timeline.marked === true;
  const holds: BoardHold[] = [];
  let held = 0;
  const holdAt = (audioMs: number, forMs: number) => {
    if (forMs <= 0) return;
    const last = holds[holds.length - 1];
    if (last && last.atMs === audioMs) last.forMs += forMs;
    else holds.push({ atMs: audioMs, forMs });
    held += forMs;
  };
  const end = () => durationMs + held + OVERRUN_MS;

  for (const op of ordered) {
    const anchorMs = wordStartAt(wordTimes, op.anchor.charStart) + held;
    if (op.kind === 'cue') {
      const sentence = sentenceAt(wordTimes, op.anchor.charStart);
      const onMs = Math.max(
        (sentence ? sentence[2] : anchorMs - held) + held,
        0,
      );
      const offMs = Math.min(
        (sentence ? sentence[3] : anchorMs - held + 2000) + held + CUE_TAIL_MS,
        end(),
      );
      if (offMs < onMs + 600) {
        dropped += 1;
        timed.push({ ...op, t0Ms: null, durMs: null, offMs: null });
        continue;
      }
      timed.push({ ...op, t0Ms: onMs, durMs: CUE_DURATION_MS, offMs });
      continue;
    }
    if (op.kind === 'board') {
      const t0 = Math.max(anchorMs - BOUNDARY_MS, penFreeAt);
      timed.push({ ...op, t0Ms: t0, durMs: BOUNDARY_MS });
      penFreeAt = t0 + BOUNDARY_MS;
      startedBoards.set(op.nextBoardId, t0);
      continue;
    }
    const natural = naturalCostMs(op, timeline.diagrams, style);
    if (
      marked &&
      op.dictated === true &&
      op.anchor.charEnd > op.anchor.charStart + 1
    ) {
      // The lecturer says these words as they are written: the pen starts
      // with the first word and finishes with the last, each word as it
      // is said. No lead, no hold, no hurry: the voice is the pace.
      const first = wordStartAt(wordTimes, op.anchor.charStart) + held;
      const last = wordEndAt(wordTimes, op.anchor.charEnd) + held;
      const t0 = Math.max(penFreeAt, first);
      const dur = Math.max(300, last - t0);
      const pace = paceOf(op, wordTimes, t0 - held, last - held, spoken);
      timed.push({ ...op, t0Ms: t0, durMs: dur, ...(pace ? { pace } : {}) });
      penFreeAt = t0 + dur + LIFT_MS;
      if (!startedBoards.has(op.boardId)) startedBoards.set(op.boardId, t0);
      continue;
    }
    if (marked && op.kind !== 'heading') {
      // The pen starts as the words start and writes at its natural pace;
      // if it is still writing when the sentence ends, the voice waits.
      const t0 = Math.max(penFreeAt, anchorMs - MARKED_LEAD_MS);
      const sentence = sentenceAt(wordTimes, op.anchor.charStart);
      const sentenceEndAudio = sentence
        ? sentence[3]
        : wordStartAt(wordTimes, op.anchor.charStart) + 2000;
      const sentenceEnd = sentenceEndAudio + held;
      let dur = natural;
      if (t0 + natural > sentenceEnd) {
        // The voice waits, but only for a breath: past MAX_HOLD_MS the
        // pen hurries instead, as a teacher's does, and never below the
        // pace the eye can still follow.
        const over = t0 + natural - sentenceEnd;
        const hold = Math.min(over, MAX_HOLD_MS);
        dur = Math.max(
          Math.round(natural * MIN_COMPRESSION),
          natural - (over - hold),
        );
        holdAt(sentenceEndAudio, hold);
      }
      // The row ends before the pen would: the line is written fast
      // rather than left half-written when the tape moves on.
      if (t0 + dur > end()) {
        if (t0 >= end()) {
          dropped += 1;
          timed.push({ ...op, t0Ms: null, durMs: null });
          continue;
        }
        dur = Math.max(Math.round(natural * MIN_COMPRESSION), end() - t0);
      }
      timed.push({ ...op, t0Ms: t0, durMs: dur });
      penFreeAt = t0 + dur + LIFT_MS;
      if (!startedBoards.has(op.boardId)) startedBoards.set(op.boardId, t0);
      continue;
    }
    const lead = LEAD_MS[style];
    let t0 = Math.max(penFreeAt, anchorMs - Math.min(lead, natural));
    if (op.kind === 'heading') t0 = Math.max(0, Math.min(t0, anchorMs));
    const deadline = anchorMs + LATE_MS;
    let dur = natural;
    if (t0 + natural > deadline) {
      dur = Math.max(Math.round(natural * MIN_COMPRESSION), deadline - t0);
    }
    if (t0 >= deadline) {
      // Late: written fast rather than left off. A board that lags the
      // voice by a breath is a teacher's board; one with holes is not.
      dur = Math.round(natural * MIN_COMPRESSION);
    }
    if (t0 + dur > end()) {
      if (t0 >= end()) {
        // The audio is over. The item stays in the list, untimed, so a
        // later timing on measured words can still place it.
        dropped += 1;
        timed.push({ ...op, t0Ms: null, durMs: null });
        continue;
      }
      dur = end() - t0;
    }
    timed.push({ ...op, t0Ms: t0, durMs: dur });
    penFreeAt = t0 + dur + LIFT_MS;
    if (!startedBoards.has(op.boardId)) startedBoards.set(op.boardId, t0);
  }

  timed.sort(
    (a, b) =>
      (a.t0Ms ?? Number.POSITIVE_INFINITY) -
        (b.t0Ms ?? Number.POSITIVE_INFINITY) || priorityOrder(a, b),
  );
  return {
    ...timeline,
    timing: wordTimes.source === 'estimate' ? 'estimated' : 'aligned',
    boards: timeline.boards.map((board) => ({
      ...board,
      startsAtMs: startedBoards.get(board.id) ?? 0,
    })),
    ops: timed,
    dropped,
    ...(marked ? { marked: true, holds } : {}),
  };
}

function priorityOrder(a: BoardOp, b: BoardOp): number {
  return a.priority - b.priority;
}

/** The first free line after a timeline's items, for a row that continues its board. */
export function nextFreeLine(timeline: BoardTimeline): number {
  let line = 1;
  for (const op of timeline.ops) {
    if (op.kind === 'term' || op.kind === 'point' || op.kind === 'figure') {
      const lines = op.lines ?? (op.kind === 'term' && op.meaning ? 2 : 1);
      line = Math.max(line, op.slot + lines);
    }
  }
  return line;
}

/** An empty timeline for a row that writes nothing. */
export function emptyTimeline(spokenLength: number): BoardTimeline {
  return {
    version: 1,
    generator: BOARD_GENERATOR_VERSION,
    timing: 'none',
    spokenLength,
    boards: [],
    ops: [],
    diagrams: [],
    dropped: 0,
  };
}

/** Whether a stored timeline was written by the current generator. */
export function boardIsCurrent(
  timeline: BoardTimeline | null | undefined,
): boolean {
  return (
    timeline?.version === 1 && timeline.generator === BOARD_GENERATOR_VERSION
  );
}

/**
 * The board as text for the tutor: every item written by a moment of the
 * audio, one line each, so a question mid-lecture can refer to what the
 * learner is looking at.
 */
export function boardLinesAt(
  timeline: BoardTimeline,
  audioMs: number,
): string[] {
  const lines: string[] = [];
  const boards = new Map(timeline.boards.map((board) => [board.id, board]));
  const atMs = boardTimeOf(timeline, audioMs);
  let current: string | null = null;
  for (const op of timeline.ops) {
    if (op.t0Ms === null || op.t0Ms > atMs) continue;
    if (op.boardId !== current) {
      current = op.boardId;
      const board = boards.get(op.boardId);
      if (board?.heading) lines.push(`Board: ${board.heading}`);
    }
    switch (op.kind) {
      case 'term':
        lines.push(
          `${op.id} | term | ${op.text}${op.meaning ? `: ${op.meaning}` : ''}`,
        );
        break;
      case 'point':
      case 'figure':
        lines.push(
          `${op.id} | ${op.kind === 'point' && op.level === 2 ? 'sub-point' : op.kind} | ${op.text}${op.important ? ' | important' : ''}`,
        );
        break;
      case 'relation':
        lines.push(
          `${op.id} | arrow | ${op.fromId} -> ${op.toId}${op.label ? ` (${op.label})` : ''}`,
        );
        break;
      case 'diagram': {
        const geometry = timeline.diagrams.find(
          (entry) => entry.id === op.diagramId,
        );
        if (geometry) {
          lines.push(
            `${op.id} | diagram | ${geometry.title}: ${geometry.nodes
              .map((node) => node.label)
              .join(', ')}`,
          );
        }
        break;
      }
      case 'cue':
        if (op.offMs !== null && op.offMs > atMs) {
          lines.push(`${op.id} | cue | ${op.shape} on ${op.targetId}`);
        }
        break;
      default:
        break;
    }
  }
  return lines;
}
