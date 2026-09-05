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
import { scriptForTts as scriptForTtsLocal } from './lecture';

export const FOLLOW_GENERATOR_VERSION = 'follow-3';

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
  /** Whether the words' meaning went into the matching; false when the embedding service was unavailable, and worth building again. */
  meaning: boolean;
  /**
   * Where each block's sentences begin and end, as character ranges into
   * the block's stored text, by block. The client cuts its spans here, so
   * the sentence a span names is always a sentence on the page. Empty for
   * a block the track only ever names whole: a table, code, an equation.
   */
  cuts: [number, number][][];
}

/** The note level a style teaches from: the slow learner reads the easiest note. */
export function noteLevelFor(style: LectureStyle): Level {
  return style === 'gentle' ? 'easiest' : 'standard';
}

/** A sentence of the note, with the block it sits in. */
export interface NoteUnit {
  block: number;
  sentence: number;
  /** The sentence's range in the block's stored text, marks included. */
  start: number;
  end: number;
  /** The sentence's words for matching, without marks. */
  text: string;
  words: string[];
  /** The block as a whole: a table, code or an equation, matched but never lit sentence by sentence. */
  whole?: boolean;
}

/**
 * Where a sentence ends: a full stop, question mark or exclamation mark,
 * any closing quote, bracket or bold mark after it, then whitespace and
 * something other than a lowercase letter. A decimal, an abbreviation
 * followed by a lowercase word, and a mark inside a sentence are not
 * boundaries. The server is the only place this rule lives: the client
 * cuts its spans at the ranges the track carries.
 */
const SENTENCE_BOUNDARY = /(?<=[.!?]["')\]*]*)\s+(?=[^a-z])/g;

/**
 * The sentences of a block as ranges into its text exactly as stored,
 * bold marks and all, each trimmed of the whitespace around it. A range
 * whose words are only marks is left out.
 */
export function sentenceCuts(raw: string): [number, number][] {
  const cuts: [number, number][] = [];
  let start = 0;
  const push = (end: number) => {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(raw[from])) from += 1;
    while (to > from && /\s/.test(raw[to - 1])) to -= 1;
    if (to > from && plainText(raw.slice(from, to)).trim())
      cuts.push([from, to]);
  };
  for (const match of raw.matchAll(SENTENCE_BOUNDARY)) {
    push(match.index);
    start = match.index + match[0].length;
  }
  push(raw.length);
  return cuts;
}

/** The sentences of a piece of prose, whitespace collapsed. */
export function splitSentences(text: string): string[] {
  return sentenceCuts(text).map((cut) =>
    text.slice(cut[0], cut[1]).replace(/\s+/g, ' ').trim(),
  );
}

/** The bold marks the note carries, dropped for matching and for splitting. */
const plainText = (text: string) => text.replace(/\*\*/g, '');

const WHOLE_TYPES = new Set<Block['type']>(['table', 'code', 'math']);
const HEADING_TYPES = new Set<Block['type']>(['headingOne', 'headingTwo']);

/**
 * Where the client cuts each block into sentence spans: the ranges of
 * every paragraph, bullet and heading, and nothing for a block the track
 * only names whole.
 */
export function noteCuts(blocks: Block[]): [number, number][][] {
  return blocks.map((block) => {
    if (WHOLE_TYPES.has(block.type)) return [];
    if (HEADING_TYPES.has(block.type)) {
      const cut = sentenceCuts(block.text);
      return cut.length ? [[cut[0][0], cut[cut.length - 1][1]]] : [];
    }
    return sentenceCuts(block.text);
  });
}

/**
 * The note as units the track can point at: every sentence of a
 * paragraph or bullet, a heading as one unit, and a table, code sample or
 * equation as one unit for the whole block, so the tutor reading a table
 * lands on the table. Units and cuts come from the same ranges, so unit
 * n of a block is always the client's span n.
 */
export function noteUnits(blocks: Block[]): NoteUnit[] {
  const units: NoteUnit[] = [];
  const cuts = noteCuts(blocks);
  blocks.forEach((block, index) => {
    const wordsOf = (text: string) => contentWords(numbersAsWords(text));
    if (WHOLE_TYPES.has(block.type)) {
      const text = plainText(block.text).replace(/\s+/g, ' ').trim();
      if (!text) return;
      units.push({
        block: index,
        sentence: 0,
        start: 0,
        end: block.text.length,
        text,
        words: wordsOf(text),
        whole: true,
      });
      return;
    }
    cuts[index].forEach(([start, end], sentence) => {
      const text = plainText(block.text.slice(start, end))
        .replace(/\s+/g, ' ')
        .trim();
      units.push({
        block: index,
        sentence,
        start,
        end,
        text,
        words: wordsOf(text),
      });
    });
  });
  return units;
}

/**
 * Fewer shared words than this is weak evidence however short the unit:
 * a two-word heading that shares both its words with a sentence is not
 * thereby what the sentence is about. The score divides by at least this.
 */
export const MIN_MATCH_WORDS = 4;

/**
 * How much a spoken sentence is about a note sentence: shared content
 * words over the smaller of the two, never fewer than MIN_MATCH_WORDS,
 * with a little extra for a shared pair of words in order. 0 to about 1.2.
 */
export function similarity(spokenWords: string[], noteWords: string[]): number {
  if (!spokenWords.length || !noteWords.length) return 0;
  const note = new Set(noteWords);
  const shared = spokenWords.filter((word) => note.has(word)).length;
  const base =
    shared /
    Math.max(MIN_MATCH_WORDS, Math.min(spokenWords.length, noteWords.length));
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

/**
 * The note as the writer sees it: every block and sentence addressed, so
 * a section can say what it teaches. "[2.1]" is block 2, sentence 1; a
 * table, code sample or equation is one address for the block.
 */
export function noteAddressed(blocks: Block[]): string {
  const units = noteUnits(blocks);
  return blocks
    .map((block, index) => {
      const own = units.filter((unit) => unit.block === index);
      if (!own.length) return '';
      if (own[0].whole) return `[${index}] ${blockProse(block)}`;
      return own
        .map((unit) => `[${index}.${unit.sentence}] ${unit.text}`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * What the writer said one section teaches, kept with the row: the
 * section's first words, to find it in the spoken text again, and the
 * addresses that survived the checks.
 */
export interface SectionTag {
  /** The opening of the section as spoken, enough to find it. */
  head: string;
  /** Note addresses: "block.sentence", or "block" for the block as a whole. */
  teaches: string[];
}

/** How many characters of a section's opening are kept to find it again. */
const TAG_HEAD_CHARS = 60;
/** A section naming more sentences than this is not choosing; its tags say nothing. */
export const MAX_TAGS_PER_SECTION = 6;

/** An address as written by the writer, or null for anything else. */
function parseAddress(
  text: string,
): { block: number; sentence: number | null } | null {
  const match = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(text);
  if (!match) return null;
  return {
    block: Number(match[1]),
    sentence: match[2] === undefined ? null : Number(match[2]),
  };
}

/**
 * The writer's tags, checked against the note they were written for. An
 * address that names nothing in the note is dropped; so is one whose block
 * shares no word at all with the section, the writer having pointed at
 * the wrong place. A section that named too many is treated as untagged.
 * Advice to the matcher, never a gate on the script: the worst case is a
 * section with no tags, matched on its words alone.
 */
export function sectionTags(
  sections: { text: string; teaches?: string[] }[],
  units: NoteUnit[],
): SectionTag[] {
  return sections.map((section) => {
    const spoken = scriptForTtsLocal(section.text);
    const head = spoken.slice(0, TAG_HEAD_CHARS);
    const said = new Set(contentWords(numbersAsWords(spoken)));
    const addresses = (section.teaches ?? [])
      .map(parseAddress)
      .filter((address): address is NonNullable<typeof address> => !!address);
    if (!addresses.length || addresses.length > MAX_TAGS_PER_SECTION) {
      return { head, teaches: [] };
    }
    const kept: string[] = [];
    for (const address of addresses) {
      const own = units.filter((unit) => unit.block === address.block);
      if (!own.length) continue;
      if (
        address.sentence !== null &&
        !own.some((unit) => !unit.whole && unit.sentence === address.sentence)
      ) {
        continue;
      }
      const shares = own.some((unit) =>
        unit.words.some((word) => said.has(word)),
      );
      if (!shares) continue;
      const text =
        address.sentence === null
          ? `${address.block}`
          : `${address.block}.${address.sentence}`;
      if (!kept.includes(text)) kept.push(text);
    }
    return { head, teaches: kept };
  });
}

/**
 * The units each spoken sentence was tagged with, by the section it falls
 * in: the sections are found in the spoken text by their heads, in order,
 * and a sentence belongs to the last section that began at or before it.
 * Null for a sentence in no tagged section.
 */
export function taggedUnits(
  spoken: string,
  sentences: number[][],
  tags: SectionTag[] | null | undefined,
  units: NoteUnit[],
): (Set<number> | null)[] {
  if (!tags?.length) return sentences.map(() => null);
  const starts: { at: number; units: Set<number> }[] = [];
  let cursor = 0;
  for (const tag of tags) {
    const at = tag.head ? spoken.indexOf(tag.head, cursor) : -1;
    if (at < 0) continue;
    cursor = at + tag.head.length;
    const set = new Set<number>();
    for (const text of tag.teaches) {
      const address = parseAddress(text);
      if (!address) continue;
      units.forEach((unit, index) => {
        if (unit.block !== address.block) return;
        if (address.sentence !== null && unit.sentence !== address.sentence)
          return;
        set.add(index);
      });
    }
    starts.push({ at, units: set });
  }
  return sentences.map(([charStart]) => {
    let found: Set<number> | null = null;
    for (const start of starts) {
      if (start.at <= charStart) found = start.units;
      else break;
    }
    return found && found.size ? found : null;
  });
}

/** A spoken sentence as the aligner timed it: its words and its moments. */
export interface SpokenSentence {
  words: string[];
  startMs: number;
  endMs: number;
}

/** The spoken sentences of a row from its word times and text, one per stored sentence. */
export function spokenSentences(
  spoken: string,
  sentences: number[][],
): SpokenSentence[] {
  return sentences.map(([charStart, charEnd, startMs, endMs]) => ({
    words: contentWords(numbersAsWords(spoken.slice(charStart, charEnd))),
    startMs,
    endMs,
  }));
}

/** The size of vector the matcher asks for: enough to tell sentences apart, small enough to keep with a page. */
export const MEANING_DIMENSIONS = 256;
/**
 * What a sentence's meaning is worth next to its words. Meaning is
 * measured as how much more a unit is about the sentence than the page in
 * general, so a paraphrase moves the highlight and the page's shared
 * subject does not. Tuned on the labelled pages: sentence accuracy rose
 * with the weight until 3 and stayed there at 4, and the highlight ran
 * ahead of the voice less, not more, so 3 is the plateau, not a slope.
 */
export const MEANING_WEIGHT = 3;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

/**
 * How much more each unit is about each spoken sentence than the page in
 * general: the cosine to the unit, less the median cosine over every
 * unit, floored at nothing. Everything on a page is about one subject;
 * this is what stands out from it.
 */
export function meaningScores(
  spoken: number[][],
  units: number[][],
): number[][] {
  return spoken.map((vector) => {
    const raw = units.map((unit) => cosine(vector, unit));
    const sorted = [...raw].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return raw.map((value) => Math.max(0, value - median));
  });
}

/** The texts whose meaning the matcher compares: each spoken sentence, and each unit of the note. */
export function meaningTexts(
  spoken: string,
  sentences: number[][],
  units: NoteUnit[],
): { spoken: string[]; units: string[] } {
  return {
    spoken: sentences.map(([charStart, charEnd]) =>
      spoken.slice(charStart, charEnd).replace(/\s+/g, ' ').trim(),
    ),
    units: units.map((unit) => unit.text),
  };
}

/** Below this a spoken sentence is explanation in the tutor's own words, not a new place. */
export const SIMILARITY_FLOOR = 0.25;
/**
 * What the writer's own tag is worth: enough that a tagged sentence wins
 * over any untagged one the words alone would pick, unless the words say
 * the tag is a mistake. Not yet tuned on tagged pages; see the plan.
 */
export const TAG_BONUS = 0.6;
/** A tagged sentence sharing less than this with the words is a mistake, and the words decide. */
export const TAG_MIN_SIMILARITY = 0.1;
/** A span shorter than this is a flicker, absorbed by its neighbour; a spoken sentence is never this short. */
export const MIN_SPAN_MS = 700;
/** What it costs, per note sentence skipped, to jump ahead in the note. */
const SKIP_PENALTY = 0.08;
/**
 * Going back: a tutor does ("remember the formula from a moment ago"), but
 * rarely, so a step back costs a flat amount plus a little per sentence
 * of distance, and never reaches further than this many sentences. On the
 * labelled pages a cheap step back cost block accuracy and gained nothing,
 * and this price left every number as it was: the step fires only when a
 * tag or a strong match by meaning pays for it, which is the callback.
 */
export const BACK_STEP = { penalty: 1, perUnit: 0.1, maxUnits: 12 };

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
  options: {
    tagged?: (Set<number> | null)[];
    /** meaningScores for these sentences and units, when their meaning is known. */
    meaning?: number[][] | null;
    /** The cost of a step back; BACK_STEP unless a test is tuning it. */
    back?: { penalty: number; perUnit: number; maxUnits: number };
  } = {},
): number[] {
  const back_ = options.back ?? BACK_STEP;
  if (!spoken.length || !units.length) return spoken.map(() => 0);
  const n = spoken.length;
  const m = units.length;
  // The writer's tag is a bonus on the words' own score, and only where
  // the words do not flatly contradict it.
  const score = spoken.map((sentence, i) =>
    units.map((unit, j) => {
      const words = similarity(sentence.words, unit.words);
      const meaning = options.meaning?.[i]?.[j] ?? 0;
      const blended = words + MEANING_WEIGHT * meaning;
      const tagged = options.tagged?.[i]?.has(j) ?? false;
      return tagged && words >= TAG_MIN_SIMILARITY
        ? blended + TAG_BONUS
        : blended;
    }),
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
      // A step back, within reach, at its price.
      for (let k = j + 1; k < m && k - j <= back_.maxUnits; k += 1) {
        const value = best[i - 1][k] - back_.penalty - back_.perUnit * (k - j);
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
  tags: SectionTag[] | null = null,
  meaning: number[][] | null = null,
): FollowTrack {
  const units = noteUnits(blocks);
  const said = spokenSentences(spoken, sentences);
  const assigned = alignSentences(said, units, {
    tagged: taggedUnits(spoken, sentences, tags, units),
    meaning,
  });
  const spans: FollowSpan[] = [];
  said.forEach((sentence, i) => {
    const unit = units[assigned[i]];
    const block = unit ? unit.block : null;
    const at = unit && !unit.whole ? unit.sentence : null;
    const last = spans[spans.length - 1];
    if (last && unit && last.block === block && last.sentence === at) {
      last.toMs = sentence.endMs;
      return;
    }
    spans.push({
      fromMs: last ? last.toMs : 0,
      toMs: sentence.endMs,
      block,
      sentence: at,
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
    meaning: meaning !== null,
    cuts: noteCuts(blocks),
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
  tags: SectionTag[] | null = null,
  meaning: number[][] | null = null,
): FollowTrack | null {
  if (!noteUnits(blocks).length) return null;
  const times = estimateWordTimes(spoken, durationMs, '');
  const fine = trackFromAlignment(
    spoken,
    times.sentences,
    blocks,
    level,
    tags,
    meaning,
  );
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
    meaning: false,
    cuts: [],
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
