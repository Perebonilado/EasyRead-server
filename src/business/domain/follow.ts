/**
 * Follow-along: where in the simplified note the tutor is, moment by
 * moment, so the reader's eye can follow the voice.
 *
 * A track maps audio time to a place in the note: a block, and a sentence
 * within it when the alignment knows one. It is computed once per row from
 * the spoken words' measured times and the note's own sentences, and the
 * client only ever reads it against the audio clock. Nothing waits on a pen.
 */
import type { Block, LectureStyle, Level } from '../../contracts';
import { contentWords, estimateWordTimes, numbersAsWords } from './board';

export const FOLLOW_GENERATOR_VERSION = 'follow-2';

export interface FollowSpan {
  fromMs: number;
  toMs: number;
  /** Index of the block in the note the lecture was written from; null when the whole page is meant. */
  block: number | null;
  /** Sentence within the block, from 0, or null when only the block is known. */
  sentence: number | null;
}

export interface FollowTrack {
  version: 1;
  generator: string;
  /** The note level the track points into. */
  level: Level;
  /**
   * How the spans were timed: 'estimate' before alignment (the words'
   * content against the note, at a steady reading pace, by block),
   * 'moves' when the note gave nothing to match (the plan's blocks by
   * proportion), 'aligned' once the words are measured on the audio.
   */
  timing: 'moves' | 'estimate' | 'aligned';
  spans: FollowSpan[];
}

/** The note level a style teaches from: the slow learner reads the easiest note. */
export function noteLevelFor(style: LectureStyle): Level {
  return style === 'gentle' ? 'easiest' : 'standard';
}

/** A sentence of the note, with the block it sits in. */
export interface NoteUnit {
  block: number;
  sentence: number;
  text: string;
  words: string[];
}

/**
 * Splits prose into sentences the same way on the server and the client:
 * at a full stop, question mark or exclamation mark followed by space, so
 * both sides count the same sentences of the same block. Kept deliberately
 * simple; a shared fixture pins it on both sides.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[^a-z])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** The bold marks the note carries, dropped for matching and for splitting. */
const plainText = (text: string) => text.replace(/\*\*/g, '');

/**
 * The note as units the track can point at: every sentence of a
 * paragraph or bullet, a heading as one unit of its own. Tables, code and
 * equations have no sentences; a span can still name their block.
 */
export function noteUnits(blocks: Block[]): NoteUnit[] {
  const units: NoteUnit[] = [];
  blocks.forEach((block, index) => {
    if (
      block.type === 'table' ||
      block.type === 'code' ||
      block.type === 'math'
    ) {
      return;
    }
    const sentences =
      block.type === 'headingOne' || block.type === 'headingTwo'
        ? [plainText(block.text).trim()]
        : splitSentences(plainText(block.text));
    sentences.forEach((text, sentence) => {
      if (!text) return;
      units.push({
        block: index,
        sentence,
        text,
        words: contentWords(numbersAsWords(text)),
      });
    });
  });
  return units;
}

/**
 * How much a spoken sentence is about a note sentence: shared content
 * words over the smaller of the two, with a little extra for a shared
 * pair of words in order. 0 to about 1.2.
 */
export function similarity(spokenWords: string[], noteWords: string[]): number {
  if (!spokenWords.length || !noteWords.length) return 0;
  const note = new Set(noteWords);
  const shared = spokenWords.filter((word) => note.has(word)).length;
  const base = shared / Math.min(spokenWords.length, noteWords.length);
  let pairs = 0;
  for (let i = 1; i < spokenWords.length; i += 1) {
    const pair = `${spokenWords[i - 1]} ${spokenWords[i]}`;
    for (let j = 1; j < noteWords.length; j += 1) {
      if (`${noteWords[j - 1]} ${noteWords[j]}` === pair) {
        pairs += 1;
        break;
      }
    }
  }
  return base + Math.min(0.2, pairs * 0.05);
}

/** A spoken sentence as the aligner timed it: its words and its moments. */
export interface SpokenSentence {
  words: string[];
  startMs: number;
  endMs: number;
}

/** The spoken sentences of a row from its word times and text. */
export function spokenSentences(
  spoken: string,
  sentences: number[][],
): SpokenSentence[] {
  return sentences
    .map(([charStart, charEnd, startMs, endMs]) => ({
      words: contentWords(numbersAsWords(spoken.slice(charStart, charEnd))),
      startMs,
      endMs,
    }))
    .filter((sentence) => sentence.endMs > sentence.startMs);
}

/** Below this a spoken sentence is explanation in the tutor's own words, not a new place. */
export const SIMILARITY_FLOOR = 0.25;
/** A span shorter than this is a flicker, absorbed by its neighbour; a spoken sentence is never this short. */
export const MIN_SPAN_MS = 700;
/** What it costs, per note sentence skipped, to jump ahead in the note. */
const SKIP_PENALTY = 0.08;

/**
 * The alignment: each spoken sentence is given the note sentence it is
 * about, in order (the tutor walks the note top to bottom), by dynamic
 * programming over similarity with a small cost for skipping note
 * sentences and none for staying on one. A spoken sentence too unlike
 * anything (the tutor's own example, an aside) stays where the tutor was.
 */
export function alignSentences(
  spoken: SpokenSentence[],
  units: NoteUnit[],
): number[] {
  if (!spoken.length || !units.length) return spoken.map(() => 0);
  const n = spoken.length;
  const m = units.length;
  const score = spoken.map((sentence) =>
    units.map((unit) => similarity(sentence.words, unit.words)),
  );
  // best[i][j]: the best total with spoken i on unit j; back[i][j]: the unit
  // spoken i-1 was on.
  const best: number[][] = [];
  const back: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    best.push(new Array<number>(m).fill(Number.NEGATIVE_INFINITY));
    back.push(new Array<number>(m).fill(-1));
    for (let j = 0; j < m; j += 1) {
      if (i === 0) {
        best[i][j] = score[i][j] - SKIP_PENALTY * j;
        continue;
      }
      let top = Number.NEGATIVE_INFINITY;
      let from = -1;
      for (let k = 0; k <= j; k += 1) {
        const skipped = j > k ? j - k - 1 : 0;
        const value = best[i - 1][k] - SKIP_PENALTY * skipped;
        if (value > top) {
          top = value;
          from = k;
        }
      }
      best[i][j] = top + score[i][j];
      back[i][j] = from;
    }
  }
  let j = 0;
  for (let k = 1; k < m; k += 1) if (best[n - 1][k] > best[n - 1][j]) j = k;
  const assigned = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    assigned[i] = j;
    j = back[i][j] >= 0 ? back[i][j] : j;
  }
  // Too unlike anything: the tutor is still on the last place.
  for (let i = 1; i < n; i += 1) {
    if (score[i][assigned[i]] < SIMILARITY_FLOOR) assigned[i] = assigned[i - 1];
  }
  return assigned;
}

/**
 * The track from measured word times: spoken sentences aligned to note
 * sentences, runs on the same sentence merged, flickers absorbed, the
 * first span starting at the audio's start.
 */
export function trackFromAlignment(
  spoken: string,
  sentences: number[][],
  blocks: Block[],
  level: Level,
): FollowTrack {
  const units = noteUnits(blocks);
  const said = spokenSentences(spoken, sentences);
  const assigned = alignSentences(said, units);
  const spans: FollowSpan[] = [];
  said.forEach((sentence, i) => {
    const unit = units[assigned[i]];
    const last = spans[spans.length - 1];
    if (
      last &&
      unit &&
      last.block === unit.block &&
      last.sentence === unit.sentence
    ) {
      last.toMs = sentence.endMs;
      return;
    }
    spans.push({
      fromMs: last ? last.toMs : 0,
      toMs: sentence.endMs,
      block: unit ? unit.block : null,
      sentence: unit ? unit.sentence : null,
    });
  });
  // A flicker is absorbed by the span before it.
  const settled: FollowSpan[] = [];
  for (const span of spans) {
    const previous = settled[settled.length - 1];
    if (previous && span.toMs - span.fromMs < MIN_SPAN_MS) {
      previous.toMs = span.toMs;
      continue;
    }
    settled.push({ ...span });
  }
  return {
    version: 1,
    generator: FOLLOW_GENERATOR_VERSION,
    level,
    timing: 'aligned',
    spans: settled,
  };
}

/**
 * The track before alignment, from the words themselves: the script's
 * sentences at a steady reading pace, each given the note sentence it is
 * about, then coarsened to the block, because an estimated moment is good
 * to a few seconds and a sentence is not. Null when the note has nothing
 * to match against (a page of tables and code).
 */
export function trackFromEstimate(
  spoken: string,
  durationMs: number,
  blocks: Block[],
  level: Level,
): FollowTrack | null {
  if (!noteUnits(blocks).length) return null;
  const times = estimateWordTimes(spoken, durationMs, '');
  const fine = trackFromAlignment(spoken, times.sentences, blocks, level);
  const spans: FollowSpan[] = [];
  for (const span of fine.spans) {
    const last = spans[spans.length - 1];
    if (last && last.block === span.block) {
      last.toMs = span.toMs;
      continue;
    }
    spans.push({ ...span, sentence: null });
  }
  return { ...fine, timing: 'estimate', spans };
}

/**
 * The track before alignment: each move of the page over the stretch of
 * audio its words take, by proportion, pointing at the blocks the plan
 * gave the move, or at the whole page when the plan gave none.
 */
export function trackFromMoves(
  moveOffsets: number[],
  scriptLength: number,
  durationMs: number,
  moveBlocks: (number[] | null)[] | null,
  level: Level,
): FollowTrack {
  const offsets = moveOffsets.length ? moveOffsets : [0];
  const spans: FollowSpan[] = offsets.map((offset, index) => {
    const next = offsets[index + 1] ?? scriptLength;
    const blocks = moveBlocks?.[index] ?? null;
    return {
      fromMs: Math.round((offset / Math.max(1, scriptLength)) * durationMs),
      toMs: Math.round((next / Math.max(1, scriptLength)) * durationMs),
      block: blocks?.length ? blocks[0] : null,
      sentence: null,
    };
  });
  return {
    version: 1,
    generator: FOLLOW_GENERATOR_VERSION,
    level,
    timing: 'moves',
    spans,
  };
}

/** The span playing at a moment, or the last one before it. */
export function spanAt(track: FollowTrack, ms: number): FollowSpan | null {
  let found: FollowSpan | null = null;
  for (const span of track.spans) {
    if (span.fromMs <= ms) found = span;
    else break;
  }
  return found;
}

/** Whether a stored track was written by this generator. */
export function followIsCurrent(track: FollowTrack | null): boolean {
  return track?.generator === FOLLOW_GENERATOR_VERSION;
}

/** A block as one line of prose for the lecturer: tables, code and equations named, not read. */
function blockProse(block: Block): string {
  const text = plainText(block.text).replace(/\s+/g, ' ').trim();
  if (block.type === 'code') return `(a code sample: ${text.slice(0, 160)})`;
  if (block.type === 'math') return `(an equation: ${text.slice(0, 120)})`;
  if (block.type === 'table') return `(a table: ${text.slice(0, 200)})`;
  return text;
}

/** The note as the page the lecturer teaches from: its blocks as paragraphs. */
export function noteProse(blocks: Block[]): string {
  return blocks.map(blockProse).filter(Boolean).join('\n\n');
}

/**
 * The note with its blocks numbered, for the planner, so a move can name
 * the blocks it teaches: "[3] The number picks the server."
 */
export function noteNumbered(blocks: Block[]): string {
  return blocks
    .map((block, index) => `[${index}] ${blockProse(block)}`)
    .join('\n');
}
