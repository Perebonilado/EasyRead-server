/**
 * A visual tutorial: the narration cut into moments, each one card the
 * app draws from a few fields and shows while its sentences are spoken.
 * The model names the card and fills the fields; it never places
 * anything. This file lays each card out on the stage and turns a
 * tutorial into the script the checks, the voice and the player take.
 */
import {
  LABEL_SIZE,
  VISUAL_MARGIN,
  VISUAL_SPACE,
  boxOf,
  chipWidthOf,
  labelGrounded,
  textWidth,
  type Box,
  type VisualColor,
  type VisualCue,
  type VisualElement,
  type VisualScript,
} from './visual';
import {
  NAME,
  layoutScene,
  place,
  type VisualStructure,
} from './visual-layout';
import { pictureAspect, resolvePicture } from './visual-presets';

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
  pictures?: { picture: string; name: string; size?: 'big' | 'small' }[];
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
} as const;

const W = VISUAL_SPACE.w;
const H = VISUAL_SPACE.h;
const M = VISUAL_MARGIN;
const CX = W / 2;
const CY = H / 2;

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
  const wanted = new Set(
    name
      .split(/\s+/)
      .map(plain)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .flatMap(forms),
  );
  if (!wanted.size) return null;
  const words = sentence.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    if (wanted.has(plain(words[i]))) return i;
  }
  return null;
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

/** The drawing for the word the model used, when the library has one. */
const known = (picture?: string): string | undefined => resolvePicture(picture);

function layoutTitle(m: Moment, id: string): Laid {
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

function layoutStatement(m: Moment, id: string): Laid {
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

function layoutNumber(m: Moment, id: string, count = false): Laid {
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

function layoutChips(m: Moment, id: string): Laid {
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 84, heading, 'md', 'ink'));
  const items = (m.items ?? []).slice(0, TUTORIAL_LIMITS.maxItems);
  const gap = 12;
  const widths = items.map((item) =>
    chipWidthOf(item.text, Boolean(known(item.picture))),
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
      const icon = known(items[i].picture);
      out.push({
        id: partId,
        type: 'chip',
        x: Math.round(x + widths[i] / 2),
        y: rowYs[r],
        text: items[i].text,
        color: m.color ?? colors[i % colors.length],
        ...(icon ? { icon } : {}),
      });
      parts[i] = partId;
      named.set(partId, items[i].text);
      x += widths[i] + gap;
    }
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutList(m: Moment, id: string): Laid {
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

function layoutPicture(m: Moment, id: string): Laid {
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'muted'));
  const picture = known(m.picture) ?? 'document';
  const aspect = pictureAspect(picture);
  const bubble = m.bubble?.trim();
  const y = heading ? 150 : 142;
  // The bubble sits above the picture's top; a tall picture shrinks to leave it room.
  const bubbleFloor = heading ? 54 : M + 22;
  let width = Math.min(130, Math.round(150 * aspect));
  if (bubble) {
    const tallest = 2 * (y - 26 - bubbleFloor);
    width = Math.min(width, Math.round(tallest * aspect));
  }
  out.push(
    ...place(
      {
        id: `${id}_c`,
        role: 'centre',
        kind: 'picture',
        text: m.name ?? '',
        picture,
        color: m.color ?? 'green',
      },
      CX,
      y,
      width,
    ),
  );
  if (bubble) {
    const w = textWidth(bubble, 11.5, true) + 22;
    const top = y - Math.round(width / aspect) / 2;
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
  return { elements: out, parts: [], arrowsOf: new Map(), named };
}

function layoutTerm(m: Moment, id: string): Laid {
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
function layoutStructured(m: Moment, id: string): Laid {
  const heading = m.heading?.trim();
  const items: VisualStructure['items'] = [];
  const arrows: VisualStructure['arrows'] = [];
  const parts: string[] = [];
  const arrowsOf = new Map<string, string[]>();
  const named = new Map<string, string>();
  if (heading)
    items.push({ id: `${id}_h`, role: 'title', kind: 'label', text: heading });
  const asItem = (
    item: CardItem,
    itemId: string,
    role: VisualStructure['items'][number]['role'],
  ) => {
    const picture = known(item.picture);
    return picture
      ? {
          id: itemId,
          role,
          kind: 'picture' as const,
          text: item.text,
          picture,
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
      const picture = known(s.picture);
      items.push({
        id: `${id}_${role}`,
        role,
        kind: 'label',
        text: s.label,
        color: m.color ?? 'ink',
      });
      if (picture)
        items.push({
          id: `${id}_${role}p`,
          role,
          kind: 'picture',
          text: '',
          picture,
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
  const scene = layoutScene({
    title: m.heading ?? '',
    template,
    items,
    arrows,
    segments: [],
  });
  return { elements: scene.elements, parts, arrowsOf, named };
}

function layoutChart(m: Moment, id: string): Laid {
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

function layoutSceneCard(m: Moment, id: string): Laid {
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
  const widths = pictures.map((p) =>
    p.size === 'small' ? 56 : pictures.length > 3 ? 64 : 88,
  );
  const gap = 18;
  const total =
    widths.reduce((sum, w) => sum + w, 0) +
    gap * Math.max(0, pictures.length - 1);
  let x = CX - total / 2;
  const parts: string[] = [];
  const named = new Map<string, string>();
  const colors: VisualColor[] = ['green', 'blue', 'amber', 'violet'];
  pictures.forEach((p, i) => {
    const partId = `${id}_p${i}`;
    const picture = known(p.picture) ?? 'document';
    const w = widths[i];
    const h = Math.round(w / pictureAspect(picture));
    out.push(
      ...place(
        {
          id: partId,
          role: 'centre',
          kind: 'picture',
          text: p.name,
          picture,
          color: m.color ?? colors[i % colors.length],
        },
        Math.round(x + w / 2),
        ground - 24 - Math.round(h / 2),
        w,
      ),
    );
    parts.push(partId);
    named.set(partId, p.name);
    x += w + gap;
  });
  return { elements: out, parts, arrowsOf: new Map(), named };
}

function layoutTimeline(m: Moment, id: string): Laid {
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

function layoutTable(m: Moment, id: string): Laid {
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

function layoutRings(m: Moment, id: string): Laid {
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

function layoutOverlap(m: Moment, id: string): Laid {
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 32, heading, 'md', 'ink'));
  const cy = heading ? 152 : 142;
  const r = 66;
  const lx = CX - 44;
  const rx = CX + 44;
  out.push({
    id: `${id}_l`,
    type: 'shape',
    x: lx,
    y: cy,
    w: r * 2,
    h: r * 2,
    kind: 'circle',
    color: 'blue',
    fill: 'tint',
  });
  out.push({
    id: `${id}_r`,
    type: 'shape',
    x: rx,
    y: cy,
    w: r * 2,
    h: r * 2,
    kind: 'circle',
    color: 'violet',
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
        label(`${id}_li${i}`, lx - 30, cy - 12 + i * 16, text, 'sm', 'blue'),
      ),
    );
  (m.right?.items ?? [])
    .slice(0, 3)
    .forEach((text, i) =>
      out.push(
        label(`${id}_ri${i}`, rx + 30, cy - 12 + i * 16, text, 'sm', 'violet'),
      ),
    );
  return { elements: out, parts, arrowsOf: new Map(), named };
}

/** One moment as elements, with its parts and arrows named for the cues. */
export function layoutMoment(m: Moment, id: string): Laid {
  switch (m.card) {
    case 'chart':
      return layoutChart(m, id);
    case 'scene':
      return layoutSceneCard(m, id);
    case 'timeline':
      return layoutTimeline(m, id);
    case 'table':
      return layoutTable(m, id);
    case 'rings':
      return layoutRings(m, id);
    case 'overlap':
      return layoutOverlap(m, id);
    case 'count':
      return layoutNumber({ ...m, card: 'number' }, id, true);
    case 'title':
      return layoutTitle(m, id);
    case 'statement':
      return layoutStatement(m, id);
    case 'number':
      return layoutNumber(m, id);
    case 'chips':
      return layoutChips(m, id);
    case 'list':
      return layoutList(m, id);
    case 'picture':
      return layoutPicture(m, id);
    case 'term':
      return layoutTerm(m, id);
    default:
      return layoutStructured(m, id);
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
export function layoutTutorial(tutorial: VisualTutorial): VisualScript {
  const elements: VisualElement[] = [];
  const cuesBySentence: VisualCue[][] = tutorial.sentences.map(() => []);
  const lastSentence = tutorial.sentences.length - 1;
  tutorial.moments.forEach((m, index) => {
    const id = `m${index}`;
    const from = Math.max(0, Math.min(lastSentence, m.from));
    const to = Math.max(from, Math.min(lastSentence, m.to));
    const laid = layoutMoment(m, id);
    elements.push(...laid.elements);
    const ids = new Set(laid.elements.map((e) => e.id));
    const at = (sentence: number, word: number, element: VisualElement) => {
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
    };
    const byId = new Map(laid.elements.map((e) => [e.id, e] as const));
    const revealed = new Map<string, { sentence: number; word: number }>();
    for (const reveal of m.reveals ?? []) {
      const partId = laid.parts[reveal.part];
      if (!partId) continue;
      const sentence = Math.max(from, Math.min(to, reveal.sentence));
      // The app finds the word the part is named by; the model's count is
      // the fallback, since it is often a word or two off.
      const found = findWord(
        tutorial.sentences[sentence],
        laid.named.get(partId) ?? '',
      );
      revealed.set(partId, {
        sentence,
        word: found ?? Math.max(0, reveal.word ?? 0),
      });
    }
    if (index > 0)
      cuesBySentence[from].push({ at: 0, do: 'clear', target: '*' });
    const later = new Set<string>();
    for (const [partId] of revealed) {
      later.add(partId);
      for (const arrowId of laid.arrowsOf.get(partId) ?? []) later.add(arrowId);
    }
    for (const element of laid.elements) {
      if (element.id.endsWith(NAME) || later.has(element.id)) continue;
      at(from, 0, element);
    }
    for (const [partId, when] of revealed) {
      const part = byId.get(partId);
      if (part) at(when.sentence, when.word, part);
      for (const arrowId of laid.arrowsOf.get(partId) ?? []) {
        const arrow = byId.get(arrowId);
        if (arrow) at(when.sentence, when.word, arrow);
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
    .map((m) => ({ ...m, from: clamp(m.from), to: clamp(m.to) }))
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
  // Two statements in a row are one: the first holds through both.
  for (let i = ranged.length - 1; i > 0; i -= 1) {
    if (ranged[i].card === 'statement' && ranged[i - 1].card === 'statement') {
      ranged[i - 1].to = ranged[i].to;
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
        });
        break;
      }
      case 'picture':
        if (!m.picture) problems.push(`${who} names no picture.`);
        short('the name', m.name, L.maxNameChars);
        grounded('the name', m.name);
        short('the bubble', m.bubble, L.maxBubbleChars);
        break;
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
        if (pictures.length < 2 || pictures.length > L.maxPictures)
          problems.push(
            `${who} has ${pictures.length} pictures; between 2 and ${L.maxPictures}.`,
          );
        for (const p of pictures) {
          short(`the name "${p.name}"`, p.name, L.maxNameChars);
          grounded(`the name "${p.name}"`, p.name);
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
    if (before && before.card === 'statement' && m.card === 'statement')
      problems.push(
        `Moments ${i} and ${i + 1} are both statements; never two in a row. Make one of them another card, or fold them into one.`,
      );
    if (before && before.card === 'title' && m.card === 'title')
      problems.push(
        `Moments ${i} and ${i + 1} are both titles; a title only where a section starts.`,
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
      if (!resolvePicture(name))
        out.push(
          `${who}: no drawing was found for "${name}"; it is drawn as words. Name the thing another way, or a thing near it (a building, a person, a tool).`,
        );
  });
  return out;
}

/** The stage's boxes of a laid card, for the gallery and tests. */
export function cardBoxes(laid: Laid): Box[] {
  return laid.elements.map((e) => boxOf(e)).filter((b): b is Box => Boolean(b));
}
