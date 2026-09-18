/**
 * A visual tutorial: the narration cut into moments, each one card the
 * app draws from a few fields and shows while its sentences are spoken.
 * The model names the card and fills the fields; it never places
 * anything. This file lays each card out on the stage and turns a
 * tutorial into the script the checks, the voice and the player take.
 */
import {
  CHIP_HEIGHT,
  LABEL_SIZE,
  STAGES,
  type Stage,
  boxOf,
  chipWidthOf,
  labelGrounded,
  textWidth,
  type Box,
  type VisualColor,
  type VisualCue,
  type VisualElement,
  type VisualMotion,
  type VisualScript,
} from './visual';
import {
  NAME,
  layoutScene,
  pictureBox,
  place,
  type VisualStructure,
} from './visual-layout';
import {
  FIGURE_ANCHORS,
  FIGURE_OUTLINES,
  figureAspect,
  figureWidth,
  resolveDrawing,
  type FigureManner,
  type FigureOutline,
  type FigurePart,
  type VisualFigure,
  chipIcon,
  figureHasAnchor,
  seedOf,
  mannersThatMove,
} from './visual-figures';
import {
  MECHANISMS,
  mechanismProblems,
  tidyMechanism,
  type MechanismAsk,
} from './visual-mechanisms';
import { LASTING } from './living.generated/motion';
import { pickPicture } from './visual-presets';

export const CARD_KINDS = [
  'title',
  'statement',
  'number',
  'chips',
  'list',
  'picture',
  'term',
  'compare',
  'flow',
  'hub',
  'chart',
  'scene',
  'timeline',
  'table',
  'rings',
  'overlap',
  'count',
  'mechanism',
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface CardItem {
  text: string;
  /** A preset's name from the library. */
  picture?: string;
}

export interface CardSide {
  label: string;
  picture?: string;
  items?: string[];
}

/** Where the second drawing of a composed picture sits on the first. */
export const COMPOSE_PLACES = ['over', 'beside', 'inside', 'badge'] as const;
export type ComposePlace = (typeof COMPOSE_PLACES)[number];
export interface VisualCompose {
  base: string;
  add: string;
  place: ComposePlace;
}

/** One moment: a card, its fields, and the sentences it covers. */
export interface Moment {
  /** First and last sentence, inclusive, zero-based. */
  from: number;
  to: number;
  card: CardKind;
  color?: VisualColor;
  eyebrow?: string;
  heading?: string;
  /** Statement: the sentence in big type. */
  text?: string;
  emphasis?: string[];
  /** Number: the figure and its caption. */
  figure?: string;
  caption?: string;
  bar?: {
    value: number;
    left?: string;
    right?: string;
    markers?: { at: number; text: string }[];
  };
  /** Chips, list and flow: the items, in order. */
  items?: CardItem[];
  /** Picture: the thing, its name, a line it says. */
  picture?: string;
  /** A picture made of two library drawings: the base and what is added to it, and where. */
  compose?: VisualCompose;
  /** The shape the thing takes, when the library has no drawing of it. */
  shape?: {
    outline?: FigureOutline;
    parts?: FigurePart[];
    manner?: FigureManner;
  };
  name?: string;
  bubble?: string;
  /** Term: the word and what it means. */
  term?: string;
  meaning?: string;
  /** Compare: the two sides. */
  left?: CardSide;
  right?: CardSide;
  /** Hub: the centre, what feeds it, what comes out. */
  centre?: CardItem;
  inputs?: CardItem[];
  outputs?: CardItem[];
  /** Chart: numbers from the page, drawn by the app. */
  chart?: {
    kind: 'bars' | 'line' | 'shares' | 'pair';
    series: { label: string; value: number }[];
    unit?: string;
  };
  /** Scene: two to four pictures composed on a ground line, each named. */
  pictures?: {
    picture: string;
    name: string;
    size?: 'big' | 'small';
    motion?: VisualMotion;
  }[];
  /** Picture: how the drawn thing moves once shown. */
  motion?: VisualMotion;
  /** Picture and mechanism: short lines that point at a part and follow it. */
  callouts?: { part: string; text: string }[];
  /** Mechanism: the machine, its numbers from the page, and the stages to show. */
  mechanism?: MechanismAsk;
  /** Timeline: points along a line, each a short label and a line of text. */
  points?: { label: string; text: string }[];
  /** Table: column headings and rows of short cells. */
  columns?: string[];
  rows?: string[][];
  /** Rings: layers from the innermost out. */
  layers?: string[];
  /** Overlap: what the two sides share. */
  shared?: string[];
  /** Parts that appear on a word rather than with the card. */
  reveals?: { part: number; sentence: number; word?: number }[];
  /** The narration's moment this came from, kept through tidying. */
  index?: number;
  /** What the moment must get across, from the narrator. */
  intent?: string;
  /** The director's reasoning and brief, kept with the page. */
  reasoning?: string;
  shouldSee?: string;
  confidence?: 'high' | 'low';
  /** Shipped as words after the judge said redo twice. */
  plain?: boolean;
}

export interface VisualTutorial {
  title: string;
  /** The narration, one sentence each. */
  sentences: string[];
  moments: Moment[];
  /** Poor when the page has too little to teach; the reason is shown to the student. */
  fit?: 'good' | 'poor';
  fitReason?: string;
}

/** Silence after a sentence, in seconds: a breath, more at a card change, a beat at a title, a hold at the end. */
export const PAUSE_S = {
  sentence: 0.35,
  card: 0.55,
  title: 0.9,
  afterStatement: 0.6,
  tail: 1.0,
} as const;

/**
 * The pause after each sentence, from the moments: the voice breathes
 * between sentences, waits a little longer where a new card comes in,
 * a beat where a title does, holds after a statement, and holds the
 * last card at the end.
 */
export function pausesFor(tutorial: VisualTutorial): number[] {
  const n = tutorial.sentences.length;
  const starts = new Map<number, Moment>();
  const ends = new Map<number, Moment>();
  for (const m of tutorial.moments) {
    starts.set(m.from, m);
    ends.set(m.to, m);
  }
  return tutorial.sentences.map((_, i) => {
    if (i === n - 1) return PAUSE_S.tail;
    const next = starts.get(i + 1);
    let pause: number = PAUSE_S.sentence;
    if (next) pause = next.card === 'title' ? PAUSE_S.title : PAUSE_S.card;
    if (ends.get(i)?.card === 'statement')
      pause = Math.max(pause, PAUSE_S.afterStatement);
    return pause;
  });
}

export const TUTORIAL_LIMITS = {
  minSentences: 8,
  maxSentences: 48,
  minMoments: 3,
  maxMoments: 40,
  maxSentencesPerMoment: 4,
  minWordsPerMoment: 10,
  minWords: 150,
  maxWords: 720,
  maxItems: 5,
  maxSide: 4,
  maxSeries: 6,
  maxPictures: 4,
  maxPoints: 6,
  maxColumns: 3,
  maxRows: 4,
  maxLayers: 5,
  maxShared: 3,
  maxChipChars: 30,
  maxHeadingChars: 40,
  maxEyebrowChars: 30,
  maxStatementWords: 14,
  maxStatementChars: 96,
  maxFigureChars: 12,
  maxCaptionChars: 40,
  maxListItemChars: 40,
  maxTermChars: 24,
  maxMeaningChars: 96,
  maxBubbleChars: 36,
  maxNameChars: 24,
  maxCalloutChars: 30,
  maxCallouts: 3,
  /** Characters of text one card carries before it reads as a wall. */
  maxInkChars: 190,
} as const;

/** What one card became: its elements, its parts in order, the arrows that go with a part, and the words each named thing is called by. */
interface Laid {
  elements: VisualElement[];
  parts: string[];
  arrowsOf: Map<string, string[]>;
  /** Element id → the words the narration would use for it, for finding its word. */
  named: Map<string, string>;
}

const STOP = new Set(
  'a an the of and or for to in on at with by from some any this that it its their his her is are was were be as into over under than then so if not no'.split(
    ' ',
  ),
);
const plain = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '');
/** A word's plain forms, so "servers" is found by "server" and "moved" by "move". */
function forms(word: string): string[] {
  const out = new Set([word]);
  for (const suffix of ['s', 'es', 'ed', 'ing', 'd']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3)
      out.add(word.slice(0, -suffix.length));
    out.add(`${word}${suffix}`);
  }
  if (word.endsWith('ies')) out.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('y')) out.add(`${word.slice(0, -1)}ies`);
  return [...out];
}

/**
 * The word of a sentence where a thing is named: the first sentence
 * word that is one of the thing's own content words, in any plain form.
 * Null when the sentence never names it.
 */
export function findWord(sentence: string, name: string): number | null {
  const wanted = contentForms(name);
  if (!wanted.size) return null;
  const words = sentence.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    if (wanted.has(plain(words[i]))) return i;
  }
  return null;
}

/** The content words of a name, in every plain form. */
function contentForms(name: string): Set<string> {
  return new Set(
    name
      .split(/\s+/)
      .map(plain)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .flatMap(forms),
  );
}

/**
 * The word of a sentence where one of several named things is named,
 * from a word on: a word that belongs to this thing alone comes first,
 * so "hidden layer" is found on "hidden" and not on the "layer" the
 * input layer shares with it; any of its content words is the fallback.
 */
export function findWordAmong(
  sentence: string,
  names: string[],
  index: number,
  from = 0,
): number | null {
  const own = contentForms(names[index] ?? '');
  if (!own.size) return null;
  const others = new Set<string>();
  names.forEach((name, i) => {
    if (i === index) return;
    for (const w of contentForms(name)) others.add(w);
  });
  const unique = new Set([...own].filter((w) => !others.has(w)));
  const words = sentence.split(/\s+/).filter(Boolean);
  for (const wanted of [unique, own]) {
    if (!wanted.size) continue;
    for (let i = Math.max(0, from); i < words.length; i += 1) {
      if (wanted.has(plain(words[i]))) return i;
    }
  }
  return null;
}

interface Beat {
  sentence: number;
  word: number;
}

/**
 * When each part of a card comes in. The model reveals some parts on
 * the sentences that name them; the app finds the word, fills in the
 * parts the model left out, and keeps the card's order, so a later part
 * never shows before an earlier one. Parts before the first revealed
 * one come with the card, as the model meant; a part after it that the
 * narration names waits for its word, and one it never names takes its
 * share of the words that are left.
 */
export function partBeats(
  m: Moment,
  laid: Laid,
  sentences: string[],
  from: number,
  to: number,
): Map<string, Beat> {
  const beats = new Map<string, Beat>();
  const asked = new Map<number, { sentence: number; word?: number }>();
  for (const r of m.reveals ?? []) if (laid.parts[r.part]) asked.set(r.part, r);
  // No reveals given: every part waits for the word that names it, and
  // one never named takes its share of the moment's words, so the card
  // follows the speech instead of arriving in one burst and sitting still.
  const auto = !asked.size;
  if (auto && laid.parts.filter(Boolean).length < 2) return beats;
  const first = auto ? 0 : Math.min(...asked.keys());
  const names = laid.parts.map((id) => (id ? (laid.named.get(id) ?? '') : ''));
  // Every word of the moment in order, so beats can be compared and spread.
  const flat: Beat[] = [];
  for (let s = from; s <= to; s += 1) {
    const n = words(sentences[s] ?? '').length;
    for (let w = 0; w < n; w += 1) flat.push({ sentence: s, word: w });
  }
  if (!flat.length) return beats;
  const indexOf = (b: Beat) =>
    flat.findIndex((f) => f.sentence === b.sentence && f.word === b.word);
  const sentenceStart = (sentence: number) =>
    flat.findIndex((f) => f.sentence === sentence);
  // A thing's own word from a flat index on, sentence by sentence.
  const search = (fromIndex: number, part: number, only?: number) => {
    let f = Math.max(0, fromIndex);
    while (f < flat.length) {
      const b = flat[f];
      if (only !== undefined && b.sentence !== only) return null;
      const found = findWordAmong(sentences[b.sentence], names, part, b.word);
      if (found !== null) return indexOf({ sentence: b.sentence, word: found });
      const next = flat.findIndex((g, j) => j > f && g.sentence > b.sentence);
      if (next < 0) return null;
      f = next;
    }
    return null;
  };
  const placed: (number | null)[] = laid.parts.map(() => null);
  let floor = -1;
  laid.parts.forEach((partId, i) => {
    if (!partId || i < first) return;
    const r = asked.get(i);
    let index: number | null = null;
    if (r) {
      const sentence = Math.max(from, Math.min(to, r.sentence));
      const start = sentenceStart(sentence);
      const found = search(Math.max(start, floor + 1), i, sentence);
      if (found !== null) index = found;
      else if (r.word !== undefined && r.word !== null) {
        const last = Math.max(0, words(sentences[sentence]).length - 1);
        index = indexOf({ sentence, word: Math.min(r.word, last) });
      } else index = start;
      // Never before the part before it.
      index = Math.max(index, floor + 1);
    } else index = search(floor + 1, i);
    if (index === null) return;
    index = Math.min(index, flat.length - 1);
    placed[i] = index;
    floor = index;
  });
  // The parts the narration never names take their share of the words
  // between the parts around them, in order.
  let i = first;
  while (i < laid.parts.length) {
    if (!laid.parts[i] || placed[i] !== null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < laid.parts.length && laid.parts[j] && placed[j] === null) j += 1;
    const before = i > first ? (placed[i - 1] ?? -1) : -1;
    const after =
      j < laid.parts.length && placed[j] !== null ? placed[j]! : flat.length;
    const run = j - i;
    for (let k = 0; k < run; k += 1) {
      const share = Math.round(
        before + ((after - before) * (k + 1)) / (run + 1),
      );
      placed[i + k] = Math.max(
        before + 1 + k,
        Math.min(after - (run - k), share),
      );
    }
    i = j;
  }
  laid.parts.forEach((partId, k) => {
    const index = placed[k];
    if (!partId || index === null) return;
    beats.set(partId, flat[Math.max(0, Math.min(flat.length - 1, index))]);
  });
  return beats;
}

/** Words into lines no wider than the width, greedy. */
function wrap(
  text: string,
  size: number,
  bold: boolean,
  width: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const label = (
  id: string,
  x: number,
  y: number,
  text: string,
  size: NonNullable<Extract<VisualElement, { type: 'label' }>['size']>,
  color: VisualColor,
  extra: Partial<Extract<VisualElement, { type: 'label' }>> = {},
): VisualElement => ({ id, type: 'label', x, y, text, size, color, ...extra });

/**
 * One thing drawn at a point: the preset or icon of its name, else the
 * figure its words say it is, else the words themselves in a chip. The
 * name goes under it, as a picture's does. Returns how tall it stands.
 */
/**
 * The boxes of a composed picture: the base at the width, the added
 * drawing over it, inside it, beside it or as a badge at its corner.
 * Nothing when either name is not a library drawing.
 */
function composeBoxes(
  compose: VisualCompose,
  x: number,
  y: number,
  width: number,
): {
  base: { name: string; x: number; w: number };
  add: { name: string; x: number; y: number; w: number; h: number };
  height: number;
} | null {
  const base = pickPicture(compose.base);
  const add = pickPicture(compose.add);
  if (!base || !add) return null;
  const at = (name: string, w: number) => pictureBox(name, w);
  if (compose.place === 'beside') {
    const bw = Math.round(width * 0.58);
    const aw = Math.round(width * 0.42);
    const b = at(base, bw);
    const a = at(add, aw);
    return {
      base: { name: base, x: x - Math.round(width * 0.22), w: bw },
      add: { name: add, x: x + Math.round(width * 0.3), y, w: a.w, h: a.h },
      height: Math.max(b.h, a.h),
    };
  }
  const b = at(base, width);
  const share =
    compose.place === 'over' ? 0.5 : compose.place === 'inside' ? 0.38 : 0.45;
  const a = at(add, Math.round(width * share));
  const dx = compose.place === 'badge' ? Math.round(b.w * 0.3) : 0;
  const dy = compose.place === 'badge' ? Math.round(b.h * 0.3) : 0;
  return {
    base: { name: base, x, w: width },
    add: { name: add, x: x + dx, y: y + dy, w: a.w, h: a.h },
    height: b.h,
  };
}

function drawThing(input: {
  id: string;
  of: string;
  name: string;
  x: number;
  y: number;
  width: number;
  color: VisualColor;
  shape?: Partial<VisualFigure> | null;
  motion?: VisualMotion;
  /** Where an `along` thing goes. */
  motionTo?: { x: number; y: number };
  /** Two library drawings as one picture. */
  compose?: VisualCompose | null;
}): { elements: VisualElement[]; height: number } {
  const { id, of, name, x, y, width, color } = input;
  const composed = input.compose && composeBoxes(input.compose, x, y, width);
  if (composed) {
    const elements = place(
      {
        id,
        role: 'centre',
        kind: 'picture',
        text: name,
        picture: composed.base.name,
        color,
      },
      composed.base.x,
      y,
      composed.base.w,
    ).map((element) =>
      element.type === 'shape' && input.motion
        ? { ...element, motion: input.motion }
        : element,
    );
    elements.push({
      id: `${id}_add`,
      type: 'shape',
      x: composed.add.x,
      y: composed.add.y,
      w: composed.add.w,
      h: composed.add.h,
      kind: composed.add.name,
      color: color === 'violet' ? 'amber' : 'violet',
      fill: 'solid',
    });
    return { elements, height: composed.height };
  }
  const drawing = resolveDrawing(of, input.shape);
  if (!drawing) {
    return {
      elements: [{ id, type: 'chip', x, y, text: name || of, color }],
      height: CHIP_HEIGHT,
    };
  }
  if (drawing.kind === 'figure') {
    const height = Math.round(width / figureAspect(drawing.figure.outline));
    const elements: VisualElement[] = [
      {
        id,
        type: 'figure',
        x,
        y,
        w: width,
        h: height,
        of: drawing.figure.of,
        outline: drawing.figure.outline,
        parts: drawing.figure.parts,
        manner: drawing.figure.manner,
        seed: drawing.figure.seed,
        color,
        carry: drawing.figure.of.toLowerCase(),
      },
    ];
    if (name)
      elements.push({
        id: `${id}${NAME}`,
        type: 'label',
        x,
        y: y + height / 2 + 10,
        text: name,
        size: 'sm',
        color: 'muted',
      });
    return { elements, height };
  }
  const elements = place(
    {
      id,
      role: 'centre',
      kind: 'picture',
      text: name,
      picture: drawing.name,
      color,
    },
    x,
    y,
    width,
  ).map((element) =>
    element.type === 'shape' && input.motion
      ? {
          ...element,
          motion: input.motion,
          ...(input.motion === 'along' && input.motionTo
            ? { motionTo: input.motionTo }
            : {}),
        }
      : element,
  );
  return { elements, height: pictureBox(drawing.name, width).h };
}

/**
 * Short lines beside a drawn thing, each pointing at a part of it; a
 * label follows the part as the thing moves. Right of the thing first,
 * then left, then right again, spread down its height.
 */
function layoutCallouts(
  m: Moment,
  id: string,
  of: string,
  x: number,
  y: number,
  width: number,
  height: number,
  allowed: ((part: string) => boolean) | null,
  stage: Stage,
): VisualElement[] {
  const { W, M } = stage;
  const callouts = (m.callouts ?? [])
    .filter((c) => c.text?.trim() && (!allowed || allowed(c.part)))
    .slice(0, TUTORIAL_LIMITS.maxCallouts);
  if (!callouts.length) return [];
  const gap = 18;
  const size = LABEL_SIZE.sm;
  const widths = callouts.map((c) => textWidth(c.text, size, true) + 10);
  // Beside the thing when the widest line fits there; else in two
  // columns under it, the leaders running up to their parts.
  const beside =
    x + width / 2 + gap + Math.max(...widths) <= W - M &&
    x - width / 2 - gap - Math.max(...widths) >= M;
  if (beside) {
    const step = Math.min(34, Math.max(22, height / 3));
    const top = y - ((callouts.length - 1) * step) / 2;
    return callouts.map((c, i) => {
      const right = i % 2 === 0;
      return {
        id: `${id}_k${i}`,
        type: 'callout',
        x: Math.round(right ? x + width / 2 + gap : x - width / 2 - gap),
        y: Math.round(top + i * step),
        text: c.text.trim(),
        of,
        part: c.part,
        anchor: right ? 'start' : 'end',
        color: m.color ?? 'green',
      };
    });
  }
  const below = y + height / 2 + 24;
  return callouts.map((c, i) => {
    const right = i % 2 === 1;
    const row = Math.floor(i / 2);
    return {
      id: `${id}_k${i}`,
      type: 'callout',
      x: Math.round(
        right
          ? Math.min(W - M, x + 8 + widths[i])
          : Math.max(M, x - 8 - widths[i]),
      ),
      y: Math.round(below + row * 16),
      text: c.text.trim(),
      of,
      part: c.part,
      anchor: right ? 'end' : 'start',
      color: m.color ?? 'green',
    };
  });
}

/** How tall a thing stands at a width, before it is drawn. */
function thingHeight(
  of: string,
  width: number,
  shape?: Partial<VisualFigure> | null,
): number {
  const drawing = resolveDrawing(of, shape);
  if (!drawing) return CHIP_HEIGHT;
  return drawing.kind === 'figure'
    ? Math.round(width / figureAspect(drawing.figure.outline))
    : pictureBox(drawing.name, width).h;
}

function layoutTitle(m: Moment, id: string, stage: Stage): Laid {
  const { CX, CY } = stage;
  const out: VisualElement[] = [];
  const lines = wrap(m.heading ?? '', LABEL_SIZE.xl, true, 300).slice(0, 2);
  const eyebrow = m.eyebrow?.trim();
  const two = lines.length > 1;
  const top = eyebrow ? (two ? 96 : 106) : two ? 122 : CY;
  if (eyebrow)
    out.push(
      label(`${id}_e`, CX, top, eyebrow, 'eyebrow', 'muted', {
        accent: m.color ?? 'amber',
      }),
    );
  lines.forEach((line, i) =>
    out.push(
      label(
        `${id}_h${i}`,
        CX,
        (eyebrow ? top + 38 : top) + i * 26,
        line,
        'xl',
        'ink',
      ),
    ),
  );
  return { elements: out, parts: [], arrowsOf: new Map(), named: new Map() };
}

function layoutStatement(m: Moment, id: string, stage: Stage): Laid {
  const { CX, CY } = stage;
  const lines = wrap(m.text ?? '', LABEL_SIZE.lg, true, 296).slice(0, 3);
  const step = 26;
  const top = CY - ((lines.length - 1) * step) / 2;
  const elements = lines.map((line, i) =>
    label(`${id}_s${i}`, CX, top + i * step, line, 'lg', 'ink', {
      emphasis: m.emphasis,
      accent: m.color ?? 'amber',
    }),
  );
  return { elements, parts: [], arrowsOf: new Map(), named: new Map() };
}

function layoutNumber(
  m: Moment,
  id: string,
  stage: Stage,
  count = false,
): Laid {
  const { CX, CY } = stage;
  const out: VisualElement[] = [];
  const color = m.color ?? 'violet';
  const bar = m.bar;
  const caption = m.caption?.trim();
  const figureY = bar ? 92 : caption ? 120 : CY;
  out.push(
    label(
      `${id}_f`,
      CX,
      figureY,
      m.figure ?? '',
      'huge',
      color,
      count ? { count: true } : {},
    ),
  );
  if (caption)
    out.push(label(`${id}_c`, CX, figureY + 30, caption, 'md', 'muted'));
  if (bar)
    out.push({
      id: `${id}_b`,
      type: 'bar',
      x: CX,
      y: 184,
      w: 296,
      value: Math.max(0, Math.min(1, bar.value)),
      color,
      ...(bar.left ? { left: bar.left } : {}),
      ...(bar.right ? { right: bar.right } : {}),
      ...(bar.markers?.length ? { markers: bar.markers.slice(0, 4) } : {}),
    });
  const named = new Map<string, string>();
  if (m.figure) named.set(`${id}_f`, m.figure);
  return { elements: out, parts: [], arrowsOf: new Map(), named };
}

function layoutChips(m: Moment, id: string, stage: Stage): Laid {
  const { W, M, CX, CY } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 84, heading, 'md', 'ink'));
  const items = (m.items ?? []).slice(0, TUTORIAL_LIMITS.maxItems);
  const gap = 12;
  const widths = items.map((item) =>
    chipWidthOf(item.text, Boolean(chipIcon(item.picture))),
  );
  // Rows that fit the width, as few as they take.
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    if (row.length && used + gap + w > W - 2 * M) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length ? gap : 0) + w;
    row.push(i);
  });
  if (row.length) rows.push(row);
  const mid = heading ? CY + 12 : CY;
  const rowYs =
    rows.length === 1 ? [mid] : rows.map((_, r) => mid - 20 + r * 40);
  const parts: string[] = [];
  const named = new Map<string, string>();
  const colors: VisualColor[] = ['blue', 'violet', 'green', 'amber', 'orange'];
  rows.forEach((indexes, r) => {
    const total =
      indexes.reduce((sum, i) => sum + widths[i], 0) +
      gap * (indexes.length - 1);
    let x = CX - total / 2;
    for (const i of indexes) {
      const partId = `${id}_p${i}`;
      const icon = chipIcon(items[i].picture);
      out.push({
        id: partId,
        type: 'chip',
        x: Math.round(x + widths[i] / 2),
        y: rowYs[r],
        text: items[i].text,
        color: m.color ?? colors[i % colors.length],
        ...(icon ? { icon } : {}),
        carry: items[i].text.toLowerCase(),
      });
      parts[i] = partId;
      named.set(partId, items[i].text);
      x += widths[i] + gap;
    }
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutList(m: Moment, id: string, stage: Stage): Laid {
  const { M, CX, CY } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  const items = (m.items ?? []).slice(0, TUTORIAL_LIMITS.maxItems);
  const size = LABEL_SIZE.md;
  const widest =
    Math.max(0, ...items.map((item) => textWidth(item.text, size, false))) + 16;
  const left = Math.max(M, Math.round(CX - widest / 2));
  const step = 30;
  const total = (items.length - 1) * step;
  const mid = heading ? CY + 14 : CY;
  if (heading)
    out.push(label(`${id}_h`, CX, mid - total / 2 - 36, heading, 'md', 'ink'));
  const parts: string[] = [];
  const named = new Map<string, string>();
  items.forEach((item, i) => {
    const partId = `${id}_p${i}`;
    out.push(
      label(
        partId,
        left,
        Math.round(mid - total / 2 + i * step),
        item.text,
        'md',
        'ink',
        {
          anchor: 'start',
          tick: true,
          accent: m.color ?? 'green',
        },
      ),
    );
    parts.push(partId);
    named.set(partId, item.text);
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutPicture(m: Moment, id: string, stage: Stage): Laid {
  const { W, M, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'muted'));
  const of = m.compose?.base ?? m.picture ?? m.name ?? '';
  const bubble = m.bubble?.trim();
  const y = heading ? 150 : 142;
  // The bubble sits above the thing's top; a tall thing shrinks to leave it room.
  const bubbleFloor = heading ? 54 : M + 22;
  const drawn = resolveDrawing(of, m.shape);
  let width =
    drawn?.kind === 'figure' ? figureWidth(drawn.figure.outline) : 130;
  if (bubble) {
    const tall = thingHeight(of, width, m.shape);
    const room = 2 * (y - 26 - bubbleFloor);
    if (tall > room) width = Math.round(width * (room / tall));
  }
  // Callouts take the sides, so the thing stands narrower to leave them room.
  if (m.callouts?.length && width > 120) width = Math.round(width * 0.8);
  const thing = drawThing({
    id: `${id}_c`,
    of,
    name: m.name ?? '',
    x: CX,
    y,
    width,
    color: m.color ?? 'green',
    shape: m.shape,
    motion: m.motion,
    compose: m.compose,
  });
  out.push(...thing.elements);
  const figure = thing.elements.find((e) => e.type === 'figure');
  out.push(
    ...layoutCallouts(
      m,
      id,
      `${id}_c`,
      CX,
      y,
      width,
      thing.height,
      figure && figure.type === 'figure'
        ? (part) => figureHasAnchor(figure, part)
        : null,
      stage,
    ),
  );
  if (bubble) {
    const w = textWidth(bubble, 11.5, true) + 22;
    const top = y - thing.height / 2;
    out.push({
      id: `${id}_s`,
      type: 'bubble',
      x: Math.min(W - M - w / 2, Math.max(M + w / 2, CX + 58)),
      y: Math.max(bubbleFloor, top - 26),
      text: bubble,
      color: m.color ?? 'green',
      tail: 'left',
    });
  }
  const named = new Map<string, string>();
  if (m.name) named.set(`${id}_c`, m.name);
  // The callouts are the card's parts: each waits for the word that names
  // its part, or takes its share of the moment, rather than all arriving
  // with the picture.
  const parts: string[] = [];
  for (const element of out)
    if (element.type === 'callout') {
      parts.push(element.id);
      named.set(element.id, element.part);
    }
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutTerm(m: Moment, id: string, stage: Stage): Laid {
  const { CX } = stage;
  const out: VisualElement[] = [];
  const lines = wrap(m.meaning ?? '', LABEL_SIZE.md, false, 300).slice(0, 3);
  const termY = lines.length > 2 ? 98 : 108;
  out.push(label(`${id}_t`, CX, termY, m.term ?? '', 'xl', m.color ?? 'blue'));
  lines.forEach((line, i) =>
    out.push(
      label(`${id}_m${i}`, CX, termY + 38 + i * 20, line, 'md', 'muted'),
    ),
  );
  const named = new Map<string, string>();
  if (m.term) named.set(`${id}_t`, m.term);
  return { elements: out, parts: [], arrowsOf: new Map(), named };
}

/** Compare, flow and hub reuse the picture engine: the card becomes a structure it already lays out. */
function layoutStructured(m: Moment, id: string, stage: Stage): Laid {
  const heading = m.heading?.trim();
  const items: VisualStructure['items'] = [];
  const arrows: VisualStructure['arrows'] = [];
  const parts: string[] = [];
  const arrowsOf = new Map<string, string[]>();
  const named = new Map<string, string>();
  if (heading)
    items.push({ id: `${id}_h`, role: 'title', kind: 'label', text: heading });
  // A thing named for an item is drawn as the picture engine draws it:
  // a living thing as a figure, a thing the library has as its picture,
  // anything else as its words.
  const asItem = (
    item: CardItem,
    itemId: string,
    role: VisualStructure['items'][number]['role'],
  ) => {
    const drawing = resolveDrawing(item.picture);
    if (drawing?.kind === 'figure')
      return {
        id: itemId,
        role,
        kind: 'picture' as const,
        text: item.text,
        figure: drawing.figure,
        color: m.color,
      };
    return drawing
      ? {
          id: itemId,
          role,
          kind: 'picture' as const,
          text: item.text,
          picture: drawing.name,
          color: m.color,
        }
      : {
          id: itemId,
          role,
          kind: 'chip' as const,
          text: item.text,
          color: m.color,
        };
  };
  let template: VisualStructure['template'] = 'flow';
  if (m.card === 'flow') {
    const steps = (m.items ?? []).slice(0, TUTORIAL_LIMITS.maxItems);
    steps.forEach((step, i) => {
      const partId = `${id}_p${i}`;
      items.push(asItem(step, partId, 'step'));
      parts.push(partId);
      named.set(partId, step.text);
      if (i > 0) {
        const arrowId = `${id}_a${i}`;
        arrows.push({ id: arrowId, from: `${id}_p${i - 1}`, to: partId });
        arrowsOf.set(partId, [arrowId]);
      }
    });
  } else if (m.card === 'compare') {
    template = 'compare';
    const side = (
      s: CardSide | undefined,
      role: 'left' | 'right',
      offset: number,
    ) => {
      if (!s) return 0;
      const drawing = resolveDrawing(s.picture);
      items.push({
        id: `${id}_${role}`,
        role,
        kind: 'label',
        text: s.label,
        color: m.color ?? 'ink',
      });
      if (drawing)
        items.push({
          id: `${id}_${role}p`,
          role,
          kind: 'picture',
          text: '',
          ...(drawing.kind === 'figure'
            ? { figure: drawing.figure }
            : { picture: drawing.name }),
          color: m.color,
        });
      const list = (s.items ?? []).slice(0, TUTORIAL_LIMITS.maxSide);
      list.forEach((text, i) => {
        const partId = `${id}_p${offset + i}`;
        items.push({ id: partId, role, kind: 'chip', text, color: m.color });
        parts.push(partId);
        named.set(partId, text);
      });
      return list.length;
    };
    const n = side(m.left, 'left', 0);
    side(m.right, 'right', n);
  } else {
    template = 'hub';
    const centre = m.centre ?? { text: '' };
    items.push(asItem(centre, `${id}_c`, 'centre'));
    named.set(`${id}_c`, centre.text);
    const inputs = (m.inputs ?? []).slice(0, TUTORIAL_LIMITS.maxSide);
    const outputs = (m.outputs ?? []).slice(0, TUTORIAL_LIMITS.maxSide);
    inputs.forEach((input, i) => {
      const partId = `${id}_p${i}`;
      items.push(asItem(input, partId, 'input'));
      parts.push(partId);
      named.set(partId, input.text);
      const arrowId = `${id}_a${i}`;
      arrows.push({ id: arrowId, from: partId, to: `${id}_c` });
      arrowsOf.set(partId, [arrowId]);
    });
    outputs.forEach((output, j) => {
      const i = inputs.length + j;
      const partId = `${id}_p${i}`;
      items.push(asItem(output, partId, 'output'));
      parts.push(partId);
      named.set(partId, output.text);
      const arrowId = `${id}_a${i}`;
      arrows.push({ id: arrowId, from: `${id}_c`, to: partId });
      arrowsOf.set(partId, [arrowId]);
    });
  }
  const scene = layoutScene(
    { title: m.heading ?? '', template, items, arrows, segments: [] },
    stage,
  );
  return { elements: scene.elements, parts, arrowsOf, named };
}

function layoutChart(m: Moment, id: string, stage: Stage): Laid {
  const { H, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  const caption = m.caption?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 40, heading, 'md', 'ink'));
  const chart = m.chart ?? { kind: 'bars' as const, series: [] };
  const series = chart.series.slice(0, TUTORIAL_LIMITS.maxSeries);
  const top = heading ? 62 : 32;
  const bottom = caption ? H - 46 : H - 30;
  const h = bottom - top;
  const y = Math.round(top + h / 2);
  out.push({
    id: `${id}_c`,
    type: 'chart',
    x: CX,
    y,
    w: 300,
    h,
    kind: chart.kind,
    series,
    ...(chart.unit ? { unit: chart.unit } : {}),
    color: m.color ?? 'blue',
  });
  if (caption) out.push(label(`${id}_k`, CX, H - 26, caption, 'sm', 'muted'));
  return { elements: out, parts: [], arrowsOf: new Map(), named: new Map() };
}

function layoutSceneCard(m: Moment, id: string, stage: Stage): Laid {
  const { W, H, M, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'muted'));
  const pictures = (m.pictures ?? []).slice(0, TUTORIAL_LIMITS.maxPictures);
  // The ground line runs under the pictures' names.
  const ground = H - 40;
  out.push({
    id: `${id}_g`,
    type: 'line',
    from: [M + 20, ground],
    to: [W - M - 20, ground],
    color: 'muted',
  });
  // A tall figure (a person, a plant) is held to the height the ground leaves.
  const widths = pictures.map((p) => {
    const wanted = p.size === 'small' ? 56 : pictures.length > 3 ? 64 : 88;
    const drawn = resolveDrawing(p.picture);
    const aspect =
      drawn?.kind === 'figure' ? figureAspect(drawn.figure.outline) : 1;
    return Math.min(wanted, Math.round(96 * aspect));
  });
  const gap = 18;
  const total =
    widths.reduce((sum, w) => sum + w, 0) +
    gap * Math.max(0, pictures.length - 1);
  let x = CX - total / 2;
  const parts: string[] = [];
  const named = new Map<string, string>();
  const colors: VisualColor[] = ['green', 'blue', 'amber', 'violet'];
  // Each picture's centre, so a thing that goes along knows where the next one stands.
  const centres = pictures.map((p, i) => {
    const left = pictures
      .slice(0, i)
      .reduce((sum, _, k) => sum + widths[k] + gap, 0);
    const h = thingHeight(p.picture, widths[i]);
    return {
      x: Math.round(x + left + widths[i] / 2),
      y: ground - 24 - Math.round(h / 2),
    };
  });
  pictures.forEach((p, i) => {
    const partId = `${id}_p${i}`;
    const w = widths[i];
    const h = thingHeight(p.picture, w);
    out.push(
      ...drawThing({
        id: partId,
        of: p.picture,
        name: p.name,
        x: Math.round(x + w / 2),
        y: ground - 24 - Math.round(h / 2),
        width: w,
        color: m.color ?? colors[i % colors.length],
        motion: p.motion,
        motionTo: centres[i + 1],
      }).elements,
    );
    parts.push(partId);
    named.set(partId, p.name);
    x += w + gap;
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutTimeline(m: Moment, id: string, stage: Stage): Laid {
  const { W, M, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 40, heading, 'md', 'ink'));
  const points = (m.points ?? []).slice(0, TUTORIAL_LIMITS.maxPoints);
  const y = heading ? 142 : 132;
  out.push({
    id: `${id}_l`,
    type: 'line',
    from: [M + 16, y],
    to: [W - M - 16, y],
    color: m.color ?? 'blue',
  });
  const xs =
    points.length === 1
      ? [CX]
      : points.map((_, i) =>
          Math.round(M + 34 + (i * (W - 2 * M - 68)) / (points.length - 1)),
        );
  const parts: string[] = [];
  const named = new Map<string, string>();
  points.forEach((p, i) => {
    const partId = `${id}_p${i}`;
    out.push({
      id: partId,
      type: 'shape',
      x: xs[i],
      y,
      w: 14,
      h: 14,
      kind: 'circle',
      color: m.color ?? 'blue',
      fill: 'solid',
    });
    out.push(label(`${partId}_a`, xs[i], y - 22, p.label, 'sm', 'ink'));
    const lines = wrap(
      p.text,
      LABEL_SIZE.sm,
      false,
      Math.min(96, (W - 2 * M) / points.length - 6),
    ).slice(0, 2);
    lines.forEach((line, k) =>
      out.push(
        label(`${partId}_b${k}`, xs[i], y + 24 + k * 14, line, 'sm', 'muted'),
      ),
    );
    parts.push(partId);
    named.set(partId, `${p.label} ${p.text}`);
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutTable(m: Moment, id: string, stage: Stage): Laid {
  const { W, H, M, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'ink'));
  const columns = (m.columns ?? []).slice(0, TUTORIAL_LIMITS.maxColumns);
  const rows = (m.rows ?? []).slice(0, TUTORIAL_LIMITS.maxRows);
  const n = Math.max(1, columns.length);
  const xs = columns.map((_, i) =>
    Math.round(M + 20 + ((i + 0.5) * (W - 2 * M - 40)) / n),
  );
  const top = heading ? 70 : 52;
  columns.forEach((c, i) =>
    out.push(label(`${id}_c${i}`, xs[i], top, c, 'md', m.color ?? 'blue')),
  );
  out.push({
    id: `${id}_r`,
    type: 'line',
    from: [M + 16, top + 16],
    to: [W - M - 16, top + 16],
    color: 'muted',
  });
  const parts: string[] = [];
  const named = new Map<string, string>();
  const step = Math.min(
    38,
    Math.floor((H - top - 40) / Math.max(1, rows.length)),
  );
  rows.forEach((row, r) => {
    const partId = `${id}_p${r}`;
    row.slice(0, n).forEach((cell, c) => {
      out.push({
        id: c === 0 ? partId : `${partId}_c${c}`,
        type: 'chip',
        x: xs[c],
        y: top + 40 + r * step,
        text: cell,
        color: c === 0 ? (m.color ?? 'blue') : 'muted',
      });
    });
    parts.push(partId);
    named.set(partId, row.join(' '));
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutRings(m: Moment, id: string, stage: Stage): Laid {
  const { CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 32, heading, 'md', 'ink'));
  const layers = (m.layers ?? []).slice(0, TUTORIAL_LIMITS.maxLayers);
  const cy = heading ? 152 : 140;
  const most = heading ? 108 : 118;
  const parts: string[] = [];
  const named = new Map<string, string>();
  const colors: VisualColor[] = ['amber', 'green', 'blue', 'violet', 'orange'];
  // Drawn from the outside in, so the inner rings sit on top.
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const r = Math.round(
      28 + ((most - 28) * i) / Math.max(1, layers.length - 1),
    );
    const partId = `${id}_p${i}`;
    out.push({
      id: partId,
      type: 'shape',
      x: CX,
      y: cy,
      w: r * 2,
      h: r * 2,
      kind: 'circle',
      color: m.color ?? colors[i % colors.length],
      fill: 'tint',
    });
    parts[i] = partId;
    named.set(partId, layers[i]);
  }
  layers.forEach((text, i) => {
    const r = Math.round(
      28 + ((most - 28) * i) / Math.max(1, layers.length - 1),
    );
    const inner =
      i === 0
        ? 0
        : Math.round(
            28 + ((most - 28) * (i - 1)) / Math.max(1, layers.length - 1),
          );
    const y = i === 0 ? cy : cy - Math.round((r + inner) / 2);
    out.push(label(`${id}_p${i}_t`, CX, y, text, 'sm', 'ink'));
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutOverlap(m: Moment, id: string, stage: Stage): Laid {
  const { CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 32, heading, 'md', 'ink'));
  const cy = heading ? 152 : 142;
  // The circles overlap by half, so the lens holds a short line of text.
  const r = 68;
  const lx = CX - 32;
  const rx = CX + 32;
  // One element for both circles: the stage draws them overlapping by design.
  out.push({
    id: `${id}_o`,
    type: 'shape',
    x: CX,
    y: cy,
    w: rx - lx + r * 2,
    h: r * 2,
    kind: 'overlap',
    color: 'blue',
    fill: 'tint',
  });
  out.push(
    label(`${id}_lt`, lx - 20, cy - r - 12, m.left?.label ?? '', 'md', 'blue'),
  );
  out.push(
    label(
      `${id}_rt`,
      rx + 20,
      cy - r - 12,
      m.right?.label ?? '',
      'md',
      'violet',
    ),
  );
  const parts: string[] = [];
  const named = new Map<string, string>();
  const shared = (m.shared ?? []).slice(0, TUTORIAL_LIMITS.maxShared);
  shared.forEach((text, i) => {
    const partId = `${id}_p${i}`;
    out.push(
      label(
        partId,
        CX,
        cy - ((shared.length - 1) * 16) / 2 + i * 16,
        text,
        'sm',
        'ink',
      ),
    );
    parts.push(partId);
    named.set(partId, text);
  });
  (m.left?.items ?? [])
    .slice(0, 3)
    .forEach((text, i) =>
      out.push(
        label(`${id}_li${i}`, lx - 34, cy - 12 + i * 16, text, 'sm', 'ink'),
      ),
    );
  (m.right?.items ?? [])
    .slice(0, 3)
    .forEach((text, i) =>
      out.push(
        label(`${id}_ri${i}`, rx + 34, cy - 12 + i * 16, text, 'sm', 'ink'),
      ),
    );
  return { elements: out, parts, arrowsOf: new Map(), named };
}

/**
 * A mechanism: the machine in a box the canvas runs, its phases as chips
 * under it that are its parts, so each phase starts on the word that
 * names it, and callouts pointing at its named places.
 */
function layoutMechanism(m: Moment, id: string, stage: Stage): Laid {
  const { H, M, CX } = stage;
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  const ask: MechanismAsk = m.mechanism ?? { kind: 'bucket' };
  const mech = tidyMechanism(ask, null);
  const spec = MECHANISMS[mech.kind];
  const note = mech.assumed.length === spec.params.length;
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'ink'));
  if (note)
    out.push(
      label(`${id}_n`, M + 2, M + 8, 'example numbers', 'sm', 'muted', {
        anchor: 'start',
      }),
    );
  const top = heading ? 56 : 34;
  const chipsY = H - 30;
  const bottom = chipsY - 24;
  const most = stage.name === 'wide' ? 320 : 250;
  let h = Math.min(most / spec.aspect, bottom - top);
  let w = Math.round(h * spec.aspect);
  if (m.callouts?.length) {
    w = Math.round(w * 0.82);
    h = w / spec.aspect;
  }
  const y = Math.round(top + (bottom - top) / 2);
  const parts: string[] = [];
  const named = new Map<string, string>();
  const phaseIds = mech.stages.map((_, i) => `${id}_p${i}`);
  out.push({
    id: `${id}_m`,
    type: 'mechanism',
    x: CX,
    y,
    w,
    h: Math.round(h),
    kind: mech.kind,
    params: mech.params,
    stages: mech.stages,
    phaseIds,
    seed: seedOf(`${mech.kind} ${mech.texts.join(' ')}`),
    color: m.color ?? 'blue',
  });
  const gap = 12;
  const widths = mech.texts.map((text) => chipWidthOf(text));
  const total =
    widths.reduce((sum, v) => sum + v, 0) + gap * (widths.length - 1);
  let x = CX - total / 2;
  mech.texts.forEach((text, i) => {
    out.push({
      id: phaseIds[i],
      type: 'chip',
      x: Math.round(x + widths[i] / 2),
      y: chipsY,
      text,
      color: m.color ?? 'blue',
    });
    parts.push(phaseIds[i]);
    named.set(phaseIds[i], text);
    x += widths[i] + gap;
  });
  out.push(
    ...layoutCallouts(
      m,
      id,
      `${id}_m`,
      CX,
      y,
      w,
      h,
      (part) => spec.anchors.includes(part),
      stage,
    ),
  );
  return { elements: out, parts, arrowsOf: new Map(), named };
}

/** One moment as elements, with its parts and arrows named for the cues. */
export function layoutMoment(
  m: Moment,
  id: string,
  stage: Stage = STAGES.box,
): Laid {
  switch (m.card) {
    case 'chart':
      return layoutChart(m, id, stage);
    case 'scene':
      return layoutSceneCard(m, id, stage);
    case 'timeline':
      return layoutTimeline(m, id, stage);
    case 'table':
      return layoutTable(m, id, stage);
    case 'rings':
      return layoutRings(m, id, stage);
    case 'overlap':
      return layoutOverlap(m, id, stage);
    case 'count':
      return layoutNumber({ ...m, card: 'number' }, id, stage, true);
    case 'mechanism':
      return layoutMechanism(m, id, stage);
    case 'title':
      return layoutTitle(m, id, stage);
    case 'statement':
      return layoutStatement(m, id, stage);
    case 'number':
      return layoutNumber(m, id, stage);
    case 'chips':
      return layoutChips(m, id, stage);
    case 'list':
      return layoutList(m, id, stage);
    case 'picture':
      return layoutPicture(m, id, stage);
    case 'term':
      return layoutTerm(m, id, stage);
    default:
      return layoutStructured(m, id, stage);
  }
}

const entrance = (element: VisualElement): 'draw' | 'fade' =>
  element.type === 'shape' ||
  element.type === 'arrow' ||
  element.type === 'line'
    ? 'draw'
    : 'fade';

/**
 * A tutorial as the script the rest of the pipeline takes: every
 * moment's elements, and the sentences with their cues. A moment's parts
 * come in on its first word, or on the word a reveal names; the next
 * moment clears the stage on its own first word.
 */
export function layoutTutorial(
  tutorial: VisualTutorial,
  stage: Stage = STAGES.box,
): VisualScript {
  const elements: VisualElement[] = [];
  const cuesBySentence: VisualCue[][] = tutorial.sentences.map(() => []);
  const lastSentence = tutorial.sentences.length - 1;
  tutorial.moments.forEach((m, index) => {
    const id = `m${index}`;
    const from = Math.max(0, Math.min(lastSentence, m.from));
    const to = Math.max(from, Math.min(lastSentence, m.to));
    const laid = layoutMoment(m, id, stage);
    elements.push(...laid.elements);
    const ids = new Set(laid.elements.map((e) => e.id));
    const at = (
      sentence: number,
      word: number,
      element: VisualElement,
      /** The sentence at whose end a lasting motion rests: its own, or the moment's last for the card's own thing. */
      restAfter = sentence,
    ) => {
      cuesBySentence[sentence].push({
        at: word,
        do: entrance(element),
        target: element.id,
      });
      // A picture's name comes with it.
      if (ids.has(`${element.id}${NAME}`))
        cuesBySentence[sentence].push({
          at: word,
          do: 'fade',
          target: `${element.id}${NAME}`,
        });
      // A motion runs for its sentence, then the thing rests.
      if (
        element.type === 'shape' &&
        element.motion &&
        LASTING.has(element.motion)
      )
        cuesBySentence[restAfter].push({
          at: Math.max(0, words(tutorial.sentences[restAfter]).length - 1),
          do: 'settle',
          target: element.id,
        });
    };
    const byId = new Map(laid.elements.map((e) => [e.id, e] as const));
    const revealed = partBeats(m, laid, tutorial.sentences, from, to);
    if (index > 0)
      cuesBySentence[from].push({ at: 0, do: 'clear', target: '*' });
    const later = new Set<string>();
    for (const [partId] of revealed) {
      later.add(partId);
      for (const arrowId of laid.arrowsOf.get(partId) ?? []) later.add(arrowId);
    }
    for (const element of laid.elements) {
      if (element.id.endsWith(NAME) || later.has(element.id)) continue;
      at(from, 0, element, to);
    }
    for (const [partId, when] of revealed) {
      const part = byId.get(partId);
      if (part) at(when.sentence, when.word, part);
      for (const arrowId of laid.arrowsOf.get(partId) ?? []) {
        const arrow = byId.get(arrowId);
        if (!arrow) continue;
        at(when.sentence, when.word, arrow);
        // Its beads run from the word its step is named on.
        cuesBySentence[when.sentence].push({
          at: when.word,
          do: 'flow',
          target: arrowId,
        });
      }
    }
    // A thing that is on screen pulses on the word that names it.
    for (const [elementId, name] of laid.named) {
      if (revealed.has(elementId) || !byId.has(elementId)) continue;
      for (let sentence = from; sentence <= to; sentence += 1) {
        const word = findWord(tutorial.sentences[sentence], name);
        if (word === null || (sentence === from && word === 0)) continue;
        cuesBySentence[sentence].push({
          at: word,
          do: 'pulse',
          target: elementId,
        });
        // The arrows into a named step run their beads while it is named.
        for (const arrowId of laid.arrowsOf.get(elementId) ?? [])
          cuesBySentence[sentence].push({
            at: word,
            do: 'flow',
            target: arrowId,
          });
        break;
      }
    }
  });
  return {
    title: tutorial.title,
    elements,
    segments: tutorial.sentences.map((text, i) => ({
      text,
      cues: cuesBySentence[i],
    })),
  };
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * The small slips a model makes with indexes, put right before anything
 * is checked: a range past the last sentence is clamped, a moment that
 * starts inside the one before starts after it, and moments come in
 * order. Real faults are left for the checks.
 */
export function tidyTutorial(tutorial: VisualTutorial): VisualTutorial {
  const last = Math.max(0, tutorial.sentences.length - 1);
  const clamp = (v: number) => Math.max(0, Math.min(last, Math.round(v)));
  const moments = [...tutorial.moments]
    .map((m) => tidyStrings({ ...m, from: clamp(m.from), to: clamp(m.to) }))
    .sort((a, b) => a.from - b.from);
  let end = -1;
  const ranged: Moment[] = [];
  for (const m of moments) {
    // A moment with no sentence left past the one before is a slip too, and goes.
    if (m.from <= end && end >= last) continue;
    const from = m.from <= end ? end + 1 : m.from;
    const to = Math.max(from, m.to);
    end = to;
    ranged.push({ ...m, from, to });
  }
  // One item is no list: it becomes the line to remember.
  for (const m of ranged) {
    if (
      (m.card === 'list' || m.card === 'chips') &&
      (m.items?.length ?? 0) === 1
    ) {
      const only = m.items![0];
      m.card = 'statement';
      m.text = m.heading ? `${m.heading}: ${only.text}` : only.text;
      m.emphasis = [only.text.split(/\s+/)[0]];
      m.items = undefined;
      m.heading = undefined;
      m.reveals = undefined;
    }
  }
  // Two statements in a row are one: the first holds through both, when
  // the two fit one moment and neither is a moment shipped as words.
  for (let i = ranged.length - 1; i > 0; i -= 1) {
    const a = ranged[i - 1];
    const b = ranged[i];
    if (
      a.card === 'statement' &&
      b.card === 'statement' &&
      Boolean(a.plain) === Boolean(b.plain) &&
      b.to - a.from + 1 <= TUTORIAL_LIMITS.maxSentencesPerMoment
    ) {
      a.to = b.to;
      ranged.splice(i, 1);
    }
  }
  // The closing sentences belong to the last card when the model left them bare.
  const tail = ranged[ranged.length - 1];
  if (tail && tail.to < last) tail.to = last;
  // A reveal named outside its moment lands on the nearest edge of it.
  const tidy = ranged.map((m) =>
    m.reveals
      ? {
          ...m,
          reveals: m.reveals.map((r) => ({
            ...r,
            sentence: Math.max(m.from, Math.min(m.to, r.sentence)),
          })),
        }
      : m,
  );
  return { ...tutorial, moments: tidy };
}

/**
 * What is wrong with a tutorial in the model's own terms, before any
 * placing: the narration's length and cut, the moments' cover of it,
 * and each card's fields.
 */
/** Whether a chart's value is written on the page, as digits with or without commas. */
function numberInMaterial(value: number, material: string): boolean {
  if (!material) return true;
  const plain = String(value);
  const grouped = value.toLocaleString('en-US');
  return material.includes(plain) || material.includes(grouped);
}

/** Every text a card puts on the stage, each with what it is. */
export function cardTexts(m: Moment): { what: string; text: string }[] {
  const named = (what: string, text: string | undefined) =>
    text?.trim() ? [{ what, text: text.trim() }] : [];
  return [
    ...named('the heading', m.heading),
    ...named('the eyebrow', m.eyebrow),
    ...named('the statement', m.text),
    ...named('the figure', m.figure),
    ...named('the caption', m.caption),
    ...named('the name', m.name),
    ...named('the bubble', m.bubble),
    ...named('the term', m.term),
    ...named('the meaning', m.meaning),
    ...(m.items ?? []).flatMap((i, k) => named(`item ${k + 1}`, i.text)),
    ...named('the left label', m.left?.label),
    ...(m.left?.items ?? []).flatMap((t) => named('the left item', t)),
    ...named('the right label', m.right?.label),
    ...(m.right?.items ?? []).flatMap((t) => named('the right item', t)),
    ...named('the centre', m.centre?.text),
    ...(m.inputs ?? []).flatMap((i) => named('the input', i.text)),
    ...(m.outputs ?? []).flatMap((i) => named('the output', i.text)),
    ...(m.chart?.series ?? []).flatMap((p) =>
      named('the chart label', p.label),
    ),
    ...(m.pictures ?? []).flatMap((p) => named('the picture name', p.name)),
    ...(m.points ?? []).flatMap((p) => [
      ...named('the point label', p.label),
      ...named('the point text', p.text),
    ]),
    ...(m.columns ?? []).flatMap((c) => named('the column', c)),
    ...(m.rows ?? []).flat().flatMap((c) => named('the cell', c)),
    ...(m.layers ?? []).flatMap((l) => named('the layer', l)),
    ...(m.shared ?? []).flatMap((t) => named('the shared item', t)),
    ...(m.callouts ?? []).flatMap((c) => named('the callout', c.text)),
    ...(m.mechanism?.phases ?? []).flatMap((p) => named('the phase', p.text)),
    ...(m.bar?.markers ?? []).flatMap((k) => named('the marker', k.text)),
    ...named('the bar', m.bar?.left),
    ...named('the bar', m.bar?.right),
  ];
}

/** The characters of text a card puts on the stage, every field counted. */
export function inkOf(m: Moment): number {
  return cardTexts(m).reduce((sum, t) => sum + t.text.length, 0);
}

/**
 * Whether a text ends in a word cut short to fit: its last word is no
 * word of the page, but the start of one ("Livest" of "Livestock").
 */
export function cutShort(text: string, pool: Set<string>): boolean {
  const last = words(text).pop();
  if (!last) return false;
  const stem = plain(last);
  if (stem.length < 4 || STOP.has(stem) || pool.has(stem)) return false;
  // A word the page uses in another form is a whole word, not a cut one.
  if (forms(stem).some((form) => form !== stem && pool.has(form))) return false;
  for (const word of pool)
    if (word.length > stem.length && word.startsWith(stem)) return true;
  return false;
}

/** Every string in a card with its whitespace collapsed: a line break the model put in draws as nothing and measures as everything. */
function tidyStrings<T>(value: T): T {
  if (typeof value === 'string')
    // A model's string can carry control characters; a NUL once broke the judge's sheet.
    return value
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim() as unknown as T;
  if (Array.isArray(value)) return value.map(tidyStrings) as unknown as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        tidyStrings(v),
      ]),
    ) as T;
  return value;
}

/**
 * The narration with no sentence over the limit: an over-long sentence
 * is cut at its last comma, semicolon or "and" before the limit, else
 * at the limit, and the moments that follow move along with it.
 */
export function tidyNarration(narration: VisualNarration): VisualNarration {
  const most = 30;
  const sentences: string[] = [];
  const grew: number[] = [];
  narration.sentences.forEach((sentence, index) => {
    let rest = sentence.trim();
    let pieces = 0;
    while (words(rest).length > most) {
      const ws = words(rest);
      const head = ws.slice(0, most);
      let cut = -1;
      for (let i = head.length - 1; i >= 8; i -= 1) {
        if (/[,;]$/.test(head[i])) {
          cut = i + 1;
          break;
        }
        if (head[i] === 'and' || head[i] === 'but' || head[i] === 'so') {
          cut = i;
          break;
        }
      }
      if (cut < 0) cut = 24;
      const first = ws.slice(0, cut).join(' ').replace(/[,;]$/, '');
      sentences.push(/[.!?]$/.test(first) ? first : `${first}.`);
      rest = ws.slice(cut).join(' ');
      rest = rest.charAt(0).toUpperCase() + rest.slice(1);
      pieces += 1;
    }
    sentences.push(rest);
    grew[index] = pieces;
  });
  const shift = (i: number) => grew.slice(0, i).reduce((sum, n) => sum + n, 0);
  const moved = grew.some((n) => n > 0)
    ? narration.moments.map((m) => ({
        ...m,
        from: m.from + shift(m.from),
        to: m.to + shift(m.to) + (grew[m.to] ?? 0),
      }))
    : narration.moments;
  // A moment that covers more sentences than a card may is cut into
  // moments that fit, the same intent on each: the director cannot mend
  // a span, and a page must not fail on one.
  const most_sentences = TUTORIAL_LIMITS.maxSentencesPerMoment;
  const moments: VisualNarration['moments'] = [];
  for (const m of moved) {
    let from = m.from;
    while (m.to - from + 1 > most_sentences) {
      moments.push({ ...m, from, to: from + most_sentences - 1 });
      from += most_sentences;
    }
    moments.push({ ...m, from });
  }
  // A sentence too short to be a beat of its own (a "Yes." or a "Section
  // 16.") is folded into the sentence beside it: the one before, unless
  // it opens a moment, then the one after. The narrator cannot be asked
  // again for it, and a page must not fail on it.
  const folded = foldShortSentences(sentences, moments);
  const same =
    moments.length === narration.moments.length &&
    !grew.some((n) => n > 0) &&
    !folded.count;
  if (same) return narration;
  return { ...narration, sentences: folded.sentences, moments: folded.moments };
}

/** Fewer words than this and a sentence is not a beat of its own. */
const FEWEST_SENTENCE_WORDS = 4;

/** Short sentences folded into a neighbour, the moments moved along; how many were folded. */
function foldShortSentences(
  given: string[],
  givenMoments: VisualNarration['moments'],
): {
  sentences: string[];
  moments: VisualNarration['moments'];
  count: number;
} {
  const sentences = [...given];
  let moments = givenMoments.map((m) => ({ ...m }));
  let count = 0;
  let i = 0;
  while (i < sentences.length) {
    if (
      words(sentences[i]).length >= FEWEST_SENTENCE_WORDS ||
      sentences.length < 2
    ) {
      i += 1;
      continue;
    }
    const opens = moments.some((m) => m.from === i);
    const intoPrevious = i > 0 && !opens;
    if (!intoPrevious && i >= sentences.length - 1) {
      i += 1;
      continue;
    }
    const at = i;
    if (intoPrevious) {
      sentences[i - 1] = `${sentences[i - 1].trim()} ${sentences[i].trim()}`;
    } else {
      sentences[i + 1] = `${sentences[i].trim()} ${sentences[i + 1].trim()}`;
    }
    sentences.splice(at, 1);
    // A moment past the fold moves up one; one that held the sentence is one shorter; one left with nothing goes.
    moments = moments
      .map((m) => ({
        ...m,
        from: m.from > at ? m.from - 1 : m.from,
        to: m.to >= at ? m.to - 1 : m.to,
      }))
      .filter((m) => m.from <= m.to);
    count += 1;
    // The folded sentence may still be short: look at it again.
  }
  return { sentences, moments, count };
}

/** Drawings that are round enough to turn: a spin on anything else looks wrong. */
const ROUND =
  /(^|-)(gear|globe|clock|sun|star|wheel|planet|ball|compass|disc|record|orbit|target|cycle|circle|donut|cd|dvd|vinyl|cookie|pizza|clover|flower|fan|radio-button|spinner|aperture|lifebuoy|watch|timer|smiley)(-|$)/;
/** Words that say something is wrong or urgent, which a shake answers. */
const ALARM =
  /\b(danger|risk|fail|fails|failed|failure|wrong|stop|alarm|warning|warn|error|lost|loss|breach|crash|broken|attack|threat|overload|late|penalty|fine|void|invalid)\b/i;

/** What is wrong with a motion given to a thing: a spin on a thing that is not round, a shake with nothing to shake at. */
function motionProblems(
  who: string,
  of: string | null | undefined,
  motion: VisualMotion | null | undefined,
  color: VisualColor | null | undefined,
  words: (string | null | undefined)[],
  shape?: Moment['shape'],
): string[] {
  const out: string[] = [];
  const drawn = resolveDrawing(of ?? '', shape ?? undefined);
  if (
    drawn?.kind === 'figure' &&
    drawn.figure.manner !== 'still' &&
    !mannersThatMove(drawn.figure.outline).includes(drawn.figure.manner)
  )
    out.push(
      `${who}: a ${drawn.figure.outline} does not move as "${drawn.figure.manner}"; give it ${mannersThatMove(drawn.figure.outline).join(', ') || 'still'}.`,
    );
  if (!motion || !of) return out;
  if (motion === 'spin') {
    const name = drawn?.kind === 'picture' ? drawn.name : '';
    if (!name || !ROUND.test(name))
      out.push(
        `${who}: spin turns a round thing only (a gear, a globe, a clock, a coin, a wheel); "${of}" is not one. Give it hover, bounce, travel or grow.`,
      );
  }
  if (motion === 'shake') {
    const warm = color === 'red' || color === 'orange';
    const said = [of, ...words].some((w) => w && ALARM.test(w));
    if (!warm && !said)
      out.push(
        `${who}: shake is for alarm or failure; nothing here says one. Give "${of}" hover, bounce, travel or grow, or colour it red or orange and say what is wrong.`,
      );
  }
  return out;
}

export function tutorialProblems(
  tutorial: VisualTutorial,
  pool: Set<string> | null,
  /** The page's own length in words: a thin page is not asked for a long narration. */
  materialWords?: number,
  /** The page's text, for the numbers a chart shows. */
  materialText = '',
): string[] {
  const problems: string[] = [];
  const L = TUTORIAL_LIMITS;
  const n = tutorial.sentences.length;
  const least =
    materialWords === undefined
      ? L.minWords
      : Math.max(60, Math.min(L.minWords, Math.round(materialWords * 0.6)));
  const fewest = least < L.minWords ? 5 : L.minSentences;
  if (n < fewest || n > L.maxSentences)
    problems.push(
      `The narration is ${n} sentences; between ${fewest} and ${L.maxSentences}.`,
    );
  const total = tutorial.sentences.reduce((sum, s) => sum + words(s).length, 0);
  if (total < least || total > L.maxWords)
    problems.push(
      `The narration is ${total} words; between ${least} and ${L.maxWords}.`,
    );
  const moments = tutorial.moments;
  if (moments.length < L.minMoments || moments.length > L.maxMoments)
    problems.push(
      `There are ${moments.length} moments; between ${L.minMoments} and ${L.maxMoments}.`,
    );
  let expect = 0;
  moments.forEach((m, i) => {
    const who = `Moment ${i + 1} (${m.card})`;
    if (m.from !== expect)
      problems.push(
        `${who} has from ${m.from}; the moments cover the sentences in order without a gap, so its from is ${expect} (sentence indexes count from zero).`,
      );
    if (m.to < m.from)
      problems.push(`${who} has to ${m.to}, before its from ${m.from}.`);
    if (m.to > n - 1)
      problems.push(
        `${who} has to ${m.to}, but the last sentence index is ${n - 1} (sentence indexes count from zero).`,
      );
    if (m.to - m.from + 1 > L.maxSentencesPerMoment)
      problems.push(
        `${who} covers ${m.to - m.from + 1} sentences; at most ${L.maxSentencesPerMoment}.`,
      );
    expect = Math.max(expect, m.to + 1);
    // A name of one or two words must be the chapter's own; a phrase is
    // the model's, like the narration.
    const grounded = (what: string, text: string | undefined) => {
      if (!text || !pool) return;
      if (words(text).length > 2) return;
      if (!labelGrounded(text, pool))
        problems.push(
          `${who}: ${what} says "${text}", which is not built from the chapter's words.`,
        );
    };
    const short = (what: string, text: string | undefined, max: number) => {
      if (text && text.length > max)
        problems.push(
          `${who}: ${what} is ${text.length} characters; at most ${max}.`,
        );
    };
    // A heading is a phrase of the model's, like the narration; only the
    // short names on a card must be the chapter's own words.
    short('the heading', m.heading, L.maxHeadingChars);
    short('the eyebrow', m.eyebrow, L.maxEyebrowChars);
    const items = m.items ?? [];
    switch (m.card) {
      case 'title':
        if (!m.heading) problems.push(`${who} has no heading.`);
        break;
      case 'statement': {
        const text = m.text ?? '';
        if (!text) problems.push(`${who} has no text.`);
        if (
          words(text).length > L.maxStatementWords ||
          text.length > L.maxStatementChars
        )
          problems.push(
            `${who}: the statement is ${words(text).length} words; at most ${L.maxStatementWords}, and ${L.maxStatementChars} characters.`,
          );
        break;
      }
      case 'number':
        if (!m.figure) problems.push(`${who} has no figure.`);
        short('the figure', m.figure, L.maxFigureChars);
        short('the caption', m.caption, L.maxCaptionChars);
        if (m.bar) {
          if (m.bar.value < 0 || m.bar.value > 1)
            problems.push(
              `${who}: the bar's value is ${m.bar.value}; zero to one.`,
            );
          for (const marker of m.bar.markers ?? []) {
            if (marker.at < 0 || marker.at > 1)
              problems.push(
                `${who}: marker "${marker.text}" is at ${marker.at}; zero to one.`,
              );
            short(`marker "${marker.text}"`, marker.text, 14);
          }
          if ((m.bar.markers ?? []).length > 4)
            problems.push(`${who}: at most four markers on a bar.`);
        }
        break;
      case 'chips':
      case 'list':
      case 'flow': {
        const least = 2;
        if (items.length < least || items.length > L.maxItems)
          problems.push(
            `${who} has ${items.length} items; between ${least} and ${L.maxItems}.`,
          );
        items.forEach((item, k) => {
          const max = m.card === 'list' ? L.maxListItemChars : L.maxChipChars;
          short(`item ${k + 1}`, item.text, max);
          grounded(`item ${k + 1}`, item.text);
          if (
            /[,(]$|\b(e\.g\.|i\.e\.|or|and|a|the|of)$/i.test(item.text.trim())
          )
            problems.push(
              `${who}: item ${k + 1} "${item.text}" is a sentence cut into pieces; each item is a whole phrase of its own.`,
            );
        });
        break;
      }
      case 'picture': {
        const of = m.compose?.base ?? m.picture ?? m.name ?? '';
        if (!of) problems.push(`${who} names no thing to draw.`);

        if (m.compose) {
          for (const part of [m.compose.base, m.compose.add])
            if (!pickPicture(part))
              problems.push(
                `${who}: a composed picture names its two drawings by the library's names; "${part}" is not one.`,
              );
        } else if (of && !resolveDrawing(of, m.shape))
          problems.push(
            `${who}: nothing in the library draws "${of}", and its words do not say what shape it takes. Give the card a shape (outline ${FIGURE_OUTLINES.slice(0, 4).join(', ')} and so on, with its parts), or name a thing that can be drawn, or use another card.`,
          );
        problems.push(
          ...motionProblems(
            who,
            of,
            m.motion,
            m.color,
            [m.name, m.bubble, ...(m.callouts ?? []).map((c) => c.text)],
            m.shape,
          ),
        );
        short('the name', m.name, L.maxNameChars);
        grounded('the name', m.name);
        short('the bubble', m.bubble, L.maxBubbleChars);
        break;
      }
      case 'term':
        if (!m.term) problems.push(`${who} has no term.`);
        short('the term', m.term, L.maxTermChars);
        grounded('the term', m.term);
        short('the meaning', m.meaning, L.maxMeaningChars);
        break;
      case 'compare':
        for (const [name, side] of [
          ['left', m.left],
          ['right', m.right],
        ] as const) {
          if (!side) {
            problems.push(`${who} has no ${name} side.`);
            continue;
          }
          short(`the ${name} label`, side.label, L.maxChipChars);
          grounded(`the ${name} label`, side.label);
          if (!side.picture && !(side.items ?? []).length)
            problems.push(
              `${who}: the ${name} side has nothing under its label; give it a picture or one to four items.`,
            );
          if ((side.items ?? []).length > L.maxSide)
            problems.push(`${who}: at most ${L.maxSide} items on the ${name}.`);
          for (const text of side.items ?? []) {
            short(`the ${name} item "${text}"`, text, L.maxChipChars);
            grounded(`the ${name} item`, text);
          }
        }
        break;
      case 'chart': {
        const chart = m.chart;
        if (!chart) {
          problems.push(`${who} has no chart.`);
          break;
        }
        const n = chart.series.length;
        if (chart.kind === 'pair' ? n !== 2 : n < 2 || n > L.maxSeries)
          problems.push(
            `${who} has ${n} values; a pair has two, the rest two to ${L.maxSeries}.`,
          );
        for (const point of chart.series) {
          short(`the label "${point.label}"`, point.label, 18);
          if (!(point.value >= 0))
            problems.push(`${who}: "${point.label}" has no value.`);
          if (pool && !numberInMaterial(point.value, materialText))
            problems.push(
              `${who}: the value ${point.value} for "${point.label}" is not on the page; every number in a chart comes from the page.`,
            );
        }
        break;
      }
      case 'scene': {
        const pictures = m.pictures ?? [];
        pictures.forEach((p, k) =>
          problems.push(
            ...motionProblems(who, p.picture, p.motion, m.color, [p.name]),
          ),
        );
        if (pictures[0]?.motion === 'travel')
          problems.push(
            `${who}: the first picture of a scene has no room to travel in from the left; give it hover, bounce or grow.`,
          );
        const motions = pictures.map((p) => p.motion).filter(Boolean);
        if (new Set(motions).size < motions.length)
          problems.push(
            `${who}: two pictures move the same way; give each its own motion, or one of them none.`,
          );
        if (pictures.length < 2 || pictures.length > L.maxPictures)
          problems.push(
            `${who} has ${pictures.length} pictures; between 2 and ${L.maxPictures}.`,
          );
        for (const p of pictures) {
          short(`the name "${p.name}"`, p.name, L.maxNameChars);
          grounded(`the name "${p.name}"`, p.name);
          if (!resolveDrawing(p.picture))
            problems.push(
              `${who}: nothing in the library draws "${p.picture}". Name a thing that can be drawn, or drop it from the scene.`,
            );
        }
        break;
      }
      case 'timeline': {
        const points = m.points ?? [];
        if (points.length < 2 || points.length > L.maxPoints)
          problems.push(
            `${who} has ${points.length} points; between 2 and ${L.maxPoints}.`,
          );
        for (const p of points) {
          short(`the point "${p.label}"`, p.label, 14);
          short(`the text under "${p.label}"`, p.text, 40);
        }
        break;
      }
      case 'table': {
        const columns = m.columns ?? [];
        const rows = m.rows ?? [];
        if (columns.length < 2 || columns.length > L.maxColumns)
          problems.push(`${who} has ${columns.length} columns; two or three.`);
        if (rows.length < 1 || rows.length > L.maxRows)
          problems.push(`${who} has ${rows.length} rows; one to ${L.maxRows}.`);
        for (const c of columns) short(`the column "${c}"`, c, 16);
        for (const row of rows)
          for (const cell of row) short(`the cell "${cell}"`, cell, 16);
        break;
      }
      case 'rings': {
        const layers = m.layers ?? [];
        if (layers.length < 2 || layers.length > L.maxLayers)
          problems.push(
            `${who} has ${layers.length} layers; between 2 and ${L.maxLayers}.`,
          );
        for (const layer of layers) {
          short(`the layer "${layer}"`, layer, 18);
          grounded(`the layer "${layer}"`, layer);
        }
        break;
      }
      case 'overlap': {
        if (!m.left?.label || !m.right?.label)
          problems.push(`${who} needs a label on each side.`);
        short('the left label', m.left?.label, 16);
        short('the right label', m.right?.label, 16);
        if ((m.shared ?? []).length > L.maxShared)
          problems.push(`${who}: at most ${L.maxShared} shared items.`);
        for (const text of [
          ...(m.shared ?? []),
          ...(m.left?.items ?? []),
          ...(m.right?.items ?? []),
        ])
          short(`"${text}"`, text, 18);
        break;
      }
      case 'count':
        if (!m.figure) problems.push(`${who} has no figure.`);
        if (m.figure && !/\d/.test(m.figure))
          problems.push(`${who}: a count needs digits in its figure.`);
        short('the caption', m.caption, L.maxCaptionChars);
        break;
      case 'hub': {
        if (!m.centre) problems.push(`${who} has no centre.`);
        short('the centre', m.centre?.text, L.maxChipChars);
        grounded('the centre', m.centre?.text);
        const inputs = m.inputs ?? [];
        const outputs = m.outputs ?? [];
        if (inputs.length + outputs.length < 1)
          problems.push(`${who} needs at least one thing around the centre.`);
        if (inputs.length > L.maxSide)
          problems.push(
            `${who} has ${inputs.length} inputs; at most ${L.maxSide}.`,
          );
        if (outputs.length > L.maxSide)
          problems.push(
            `${who} has ${outputs.length} outputs; at most ${L.maxSide}.`,
          );
        for (const item of [...inputs, ...outputs]) {
          short(`"${item.text}"`, item.text, L.maxChipChars);
          grounded(`"${item.text}"`, item.text);
        }
        break;
      }
    }
    if (m.card === 'mechanism') {
      problems.push(...mechanismProblems(m.mechanism, who));
      for (const [name, value] of Object.entries(m.mechanism?.params ?? {})) {
        if (typeof value !== 'number') continue;
        if (pool && !numberInMaterial(value, materialText))
          problems.push(
            `${who}: the number ${value} for "${name}" is not on the page; every number in a mechanism comes from the page, or is left null for the kind's own.`,
          );
      }
    }
    const callouts = m.callouts ?? [];
    if (callouts.length) {
      if (m.card !== 'picture' && m.card !== 'mechanism')
        problems.push(
          `${who} has callouts; they belong on a picture or a mechanism card.`,
        );
      if (callouts.length > L.maxCallouts)
        problems.push(`${who}: at most ${L.maxCallouts} callouts.`);
      const drawn =
        m.card === 'picture'
          ? resolveDrawing(m.picture ?? m.name ?? '', m.shape)
          : null;
      for (const c of callouts) {
        short(`the callout "${c.text}"`, c.text, L.maxCalloutChars);
        if (drawn?.kind === 'figure' && !figureHasAnchor(drawn.figure, c.part))
          problems.push(
            `${who}: a callout points at "${c.part}", which the ${drawn.figure.outline} has no place for; point at one of ${[...drawn.figure.parts, ...FIGURE_ANCHORS[drawn.figure.outline]].join(', ')}.`,
          );
        if (
          m.card === 'mechanism' &&
          m.mechanism &&
          MECHANISMS[m.mechanism.kind] &&
          !MECHANISMS[m.mechanism.kind].anchors.includes(c.part)
        )
          problems.push(
            `${who}: a callout points at "${c.part}", which a ${m.mechanism.kind} has no place for; point at one of ${MECHANISMS[m.mechanism.kind].anchors.join(', ')}.`,
          );
      }
    }
    if (pool)
      for (const { what, text } of cardTexts(m))
        if (cutShort(text, pool))
          problems.push(
            `${who}: ${what} "${text}" ends in a word cut short. Use whole words, fewer of them.`,
          );
    const ink = inkOf(m);
    if (ink > L.maxInkChars)
      problems.push(
        `${who} carries ${ink} characters of text; a card reads at up to ${L.maxInkChars}. Cut words, or split it into two moments.`,
      );
    const partCount =
      m.card === 'compare'
        ? (m.left?.items?.length ?? 0) + (m.right?.items?.length ?? 0)
        : m.card === 'hub'
          ? (m.inputs?.length ?? 0) + (m.outputs?.length ?? 0)
          : m.card === 'scene'
            ? (m.pictures?.length ?? 0)
            : m.card === 'timeline'
              ? (m.points?.length ?? 0)
              : m.card === 'table'
                ? (m.rows?.length ?? 0)
                : m.card === 'rings'
                  ? (m.layers?.length ?? 0)
                  : m.card === 'overlap'
                    ? (m.shared?.length ?? 0)
                    : m.card === 'mechanism'
                      ? (m.mechanism?.phases?.length ?? 0)
                      : items.length;
    for (const reveal of m.reveals ?? []) {
      if (reveal.part < 0 || reveal.part >= partCount)
        problems.push(
          `${who}: a reveal names part ${reveal.part + 1}, and the card has ${partCount}.`,
        );
      if (reveal.sentence < m.from || reveal.sentence > m.to)
        problems.push(
          `${who}: a reveal names sentence ${reveal.sentence}, outside the moment's from ${m.from} to ${m.to}.`,
        );
    }
  });
  moments.forEach((m, i) => {
    const before = moments[i - 1];
    if (
      before &&
      before.card === 'statement' &&
      m.card === 'statement' &&
      !before.plain &&
      !m.plain
    )
      problems.push(
        `Moments ${i} and ${i + 1} are both statements; never two in a row. Make one of them another card, or fold them into one.`,
      );
    if (before && before.card === 'title' && m.card === 'title')
      problems.push(
        `Moments ${i} and ${i + 1} are both titles; a title only where a section starts.`,
      );
    const thing = (x: Moment) =>
      (x.picture ?? x.name ?? '').trim().toLowerCase();
    if (
      before &&
      before.card === 'picture' &&
      m.card === 'picture' &&
      thing(m) &&
      thing(m) === thing(before)
    )
      problems.push(
        `Moments ${i} and ${i + 1} both draw "${thing(m)}" as a picture; fold them into one moment, or show the second in another way.`,
      );
  });
  if (moments.length && expect !== n)
    problems.push(
      `The last moment has to ${expect - 1}; the narration has ${n} sentences, indexes 0 to ${n - 1}, so the last moment's to is ${n - 1}.`,
    );
  return problems;
}

/**
 * Advice for the mend rounds, not faults: a thing the library has no
 * drawing for is drawn as a chip, and the model may name it another way.
 */
export function tutorialWarnings(tutorial: VisualTutorial): string[] {
  const out: string[] = [];
  tutorial.moments.forEach((m, i) => {
    const who = `Moment ${i + 1} (${m.card})`;
    const spoken = tutorial.sentences
      .slice(m.from, m.to + 1)
      .reduce((sum, s) => sum + words(s).length, 0);
    if (spoken < TUTORIAL_LIMITS.minWordsPerMoment)
      out.push(
        `${who} is spoken over ${spoken} words; a card needs at least ${TUTORIAL_LIMITS.minWordsPerMoment} to hold on screen. Give it more of the narration or fold it into a neighbour.`,
      );
    const names = [
      m.picture,
      ...(m.items ?? []).map((item) => item.picture),
      m.left?.picture,
      m.right?.picture,
      m.centre?.picture,
      ...(m.inputs ?? []).map((item) => item.picture),
      ...(m.outputs ?? []).map((item) => item.picture),
      ...(m.pictures ?? []).map((item) => item.picture),
    ].filter((name): name is string => Boolean(name));
    for (const name of names)
      if (!resolveDrawing(name))
        out.push(
          `${who}: no drawing was found for "${name}"; it is set as words instead. Name a thing near it that can be drawn, or move it to a picture card and give that card a shape.`,
        );
    const reveals = [...(m.reveals ?? [])].sort((a, b) => a.part - b.part);
    for (let k = 1; k < reveals.length; k += 1) {
      const a = reveals[k - 1];
      const b = reveals[k];
      if (
        b.sentence < a.sentence ||
        (b.sentence === a.sentence && (b.word ?? 0) < (a.word ?? 0))
      ) {
        out.push(
          `${who}: the reveals run against the card's order (part ${b.part + 1} before part ${a.part + 1}); the app showed the parts in order. Reveal every part, in order, or none.`,
        );
        break;
      }
    }
  });
  return out;
}

/** The stage's boxes of a laid card, for the gallery and tests. */
export function cardBoxes(laid: Laid): Box[] {
  return laid.elements.map((e) => boxOf(e)).filter((b): b is Box => Boolean(b));
}

/** What the narrator writes: the sentences, cut into moments with an intent each. */
export interface VisualNarration {
  title: string;
  fit?: 'good' | 'poor';
  fitReason?: string | null;
  sentences: string[];
  moments: { from: number; to: number; intent: string }[];
}

/** One of the director's decisions: the card for a moment, with the reasoning written first. */
export type VisualDecision = Omit<
  Moment,
  'from' | 'to' | 'index' | 'intent' | 'plain'
> & {
  index: number;
  reasoning: string;
  shouldSee: string;
  confidence: 'high' | 'low';
};

export interface VisualDecisions {
  moments: VisualDecision[];
}

/**
 * A moment shipped as words: the shortest of its own sentences that
 * fits a statement, else its intent, in big type.
 */
export function plainMoment(
  from: number,
  to: number,
  intent: string,
  index: number,
  sentences: string[] = [],
): Moment {
  const own = sentences
    .slice(from, to + 1)
    .filter(
      (s) =>
        words(s).length <= TUTORIAL_LIMITS.maxStatementWords &&
        s.length <= TUTORIAL_LIMITS.maxStatementChars,
    )
    .sort((a, b) => a.length - b.length)[0];
  const text =
    own ??
    words(intent)
      .slice(0, TUTORIAL_LIMITS.maxStatementWords)
      .join(' ')
      .slice(0, TUTORIAL_LIMITS.maxStatementChars);
  return { from, to, card: 'statement', text, index, intent, plain: true };
}

/**
 * The narration and the director's decisions as one tutorial: each
 * narration moment takes its decision by index; one with no decision
 * ships plain. Nulls the model wrote for unused fields are dropped.
 */
export function assembleTutorial(
  narration: VisualNarration,
  decisions: VisualDecisions,
): VisualTutorial {
  const byIndex = new Map(decisions.moments.map((d) => [d.index, d] as const));
  const moments = narration.moments.map((m, index) => {
    const decision = byIndex.get(index);
    if (!decision)
      return plainMoment(m.from, m.to, m.intent, index, narration.sentences);
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(decision))
      if (value !== null && value !== undefined) fields[key] = value;
    return {
      ...(fields as Omit<VisualDecision, 'index'>),
      from: m.from,
      to: m.to,
      index,
      intent: m.intent,
    } as Moment;
  });
  return {
    title: narration.title,
    fit: narration.fit,
    fitReason: narration.fitReason ?? undefined,
    sentences: narration.sentences,
    moments,
  };
}

/** The decisions with some moments replaced by the director's redo, or by a plain card. */
export function mergeDecisions(
  decisions: VisualDecisions,
  redo: VisualDecisions,
  only: number[],
): VisualDecisions {
  const fresh = new Map(redo.moments.map((d) => [d.index, d] as const));
  const kept = decisions.moments.filter(
    (d) => !only.includes(d.index) || !fresh.has(d.index),
  );
  const changed = only
    .map((i) => fresh.get(i))
    .filter((d): d is VisualDecision => Boolean(d));
  return { moments: [...kept, ...changed].sort((a, b) => a.index - b.index) };
}

/**
 * Which tutorial moments the problems name, by position: "Moment 3" in a
 * card problem, "m2_p1" in a layout problem. Empty when a problem is the
 * whole page's, such as the narration's length.
 */
export function momentsNamed(problems: string[]): number[] {
  const out = new Set<number>();
  for (const problem of problems) {
    const card = /Moment (\d+)/.exec(problem);
    if (card) out.add(Number(card[1]) - 1);
    for (const match of problem.matchAll(/"m(\d+)(?:_[a-z0-9_]*)?"/g))
      out.add(Number(match[1]));
  }
  return [...out].sort((a, b) => a - b);
}
