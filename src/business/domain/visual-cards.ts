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
import { PRESET_INFO } from './visual-presets';

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
  /** Parts that appear on a word rather than with the card. */
  reveals?: { part: number; sentence: number; word: number }[];
}

export interface VisualTutorial {
  title: string;
  /** The narration, one sentence each. */
  sentences: string[];
  moments: Moment[];
}

export const TUTORIAL_LIMITS = {
  minSentences: 8,
  maxSentences: 48,
  minMoments: 3,
  maxMoments: 40,
  maxSentencesPerMoment: 4,
  minWords: 150,
  maxWords: 720,
  maxItems: 5,
  maxSide: 4,
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

/** What one card became: its elements, its parts in order, and the arrows that go with a part. */
interface Laid {
  elements: VisualElement[];
  parts: string[];
  arrowsOf: Map<string, string[]>;
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

const known = (picture?: string): string | undefined =>
  picture && PRESET_INFO[picture] ? picture : undefined;

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
  return { elements: out, parts: [], arrowsOf: new Map() };
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
  return { elements, parts: [], arrowsOf: new Map() };
}

function layoutNumber(m: Moment, id: string): Laid {
  const out: VisualElement[] = [];
  const color = m.color ?? 'violet';
  const bar = m.bar;
  const caption = m.caption?.trim();
  const figureY = bar ? 92 : caption ? 120 : CY;
  out.push(label(`${id}_f`, CX, figureY, m.figure ?? '', 'huge', color));
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
  return { elements: out, parts: [], arrowsOf: new Map() };
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
      x += widths[i] + gap;
    }
  });
  return { elements: out, parts, arrowsOf: new Map() };
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
  });
  return { elements: out, parts, arrowsOf: new Map() };
}

function layoutPicture(m: Moment, id: string): Laid {
  const out: VisualElement[] = [];
  const heading = m.heading?.trim();
  if (heading) out.push(label(`${id}_h`, CX, 36, heading, 'md', 'muted'));
  const picture = known(m.picture) ?? 'document';
  const aspect = PRESET_INFO[picture]?.aspect ?? 1;
  const width = Math.min(130, Math.round(150 * aspect));
  const y = heading ? 150 : 142;
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
  const bubble = m.bubble?.trim();
  if (bubble) {
    const w = textWidth(bubble, 11.5, true) + 22;
    const top = y - Math.round(width / aspect) / 2;
    out.push({
      id: `${id}_s`,
      type: 'bubble',
      x: Math.min(W - M - w / 2, Math.max(M + w / 2, CX + 58)),
      y: Math.max(M + 20, top - 16),
      text: bubble,
      color: m.color ?? 'green',
      tail: 'left',
    });
  }
  return { elements: out, parts: [], arrowsOf: new Map() };
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
  return { elements: out, parts: [], arrowsOf: new Map() };
}

/** Compare, flow and hub reuse the picture engine: the card becomes a structure it already lays out. */
function layoutStructured(m: Moment, id: string): Laid {
  const heading = m.heading?.trim();
  const items: VisualStructure['items'] = [];
  const arrows: VisualStructure['arrows'] = [];
  const parts: string[] = [];
  const arrowsOf = new Map<string, string[]>();
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
      });
      return list.length;
    };
    const n = side(m.left, 'left', 0);
    side(m.right, 'right', n);
  } else {
    template = 'hub';
    const centre = m.centre ?? { text: '' };
    items.push(asItem(centre, `${id}_c`, 'centre'));
    const inputs = (m.inputs ?? []).slice(0, TUTORIAL_LIMITS.maxSide);
    const outputs = (m.outputs ?? []).slice(0, TUTORIAL_LIMITS.maxSide);
    inputs.forEach((input, i) => {
      const partId = `${id}_p${i}`;
      items.push(asItem(input, partId, 'input'));
      parts.push(partId);
      const arrowId = `${id}_a${i}`;
      arrows.push({ id: arrowId, from: partId, to: `${id}_c` });
      arrowsOf.set(partId, [arrowId]);
    });
    outputs.forEach((output, j) => {
      const i = inputs.length + j;
      const partId = `${id}_p${i}`;
      items.push(asItem(output, partId, 'output'));
      parts.push(partId);
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
  return { elements: scene.elements, parts, arrowsOf };
}

/** One moment as elements, with its parts and arrows named for the cues. */
export function layoutMoment(m: Moment, id: string): Laid {
  switch (m.card) {
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
      revealed.set(partId, { sentence, word: Math.max(0, reveal.word) });
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
 * What is wrong with a tutorial in the model's own terms, before any
 * placing: the narration's length and cut, the moments' cover of it,
 * and each card's fields.
 */
export function tutorialProblems(
  tutorial: VisualTutorial,
  pool: Set<string> | null,
): string[] {
  const problems: string[] = [];
  const L = TUTORIAL_LIMITS;
  const n = tutorial.sentences.length;
  if (n < L.minSentences || n > L.maxSentences)
    problems.push(
      `The narration is ${n} sentences; between ${L.minSentences} and ${L.maxSentences}.`,
    );
  const total = tutorial.sentences.reduce((sum, s) => sum + words(s).length, 0);
  if (total < L.minWords || total > L.maxWords)
    problems.push(
      `The narration is ${total} words; between ${L.minWords} and ${L.maxWords}.`,
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
        `${who} starts at sentence ${m.from + 1}; the moments cover the narration in order without a gap, so it starts at sentence ${expect + 1}.`,
      );
    if (m.to < m.from) problems.push(`${who} ends before it starts.`);
    if (m.to - m.from + 1 > L.maxSentencesPerMoment)
      problems.push(
        `${who} covers ${m.to - m.from + 1} sentences; at most ${L.maxSentencesPerMoment}.`,
      );
    expect = Math.max(expect, m.to + 1);
    const grounded = (what: string, text: string | undefined) => {
      if (text && pool && !labelGrounded(text, pool))
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
    const pictureKnown = (what: string, picture: string | undefined) => {
      if (picture && !PRESET_INFO[picture])
        problems.push(
          `${who}: ${what} names the picture "${picture}", which is not in the library; use a name from the catalogue or none.`,
        );
    };
    short('the heading', m.heading, L.maxHeadingChars);
    grounded('the heading', m.heading);
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
          const max = m.card === 'list' ? L.maxListItemChars : 22;
          short(`item ${k + 1}`, item.text, max);
          grounded(`item ${k + 1}`, item.text);
          pictureKnown(`item ${k + 1}`, item.picture);
        });
        break;
      }
      case 'picture':
        if (!m.picture) problems.push(`${who} names no picture.`);
        pictureKnown('the picture', m.picture);
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
          short(`the ${name} label`, side.label, 22);
          grounded(`the ${name} label`, side.label);
          pictureKnown(`the ${name} side`, side.picture);
          if (!side.picture && !(side.items ?? []).length)
            problems.push(
              `${who}: the ${name} side has nothing under its label; give it a picture or one to four items.`,
            );
          if ((side.items ?? []).length > L.maxSide)
            problems.push(`${who}: at most ${L.maxSide} items on the ${name}.`);
          for (const text of side.items ?? []) {
            short(`the ${name} item "${text}"`, text, 22);
            grounded(`the ${name} item`, text);
          }
        }
        break;
      case 'hub': {
        if (!m.centre) problems.push(`${who} has no centre.`);
        short('the centre', m.centre?.text, 22);
        grounded('the centre', m.centre?.text);
        pictureKnown('the centre', m.centre?.picture);
        const inputs = m.inputs ?? [];
        const outputs = m.outputs ?? [];
        if (inputs.length + outputs.length < 2)
          problems.push(`${who} needs at least two things around the centre.`);
        if (inputs.length > L.maxSide)
          problems.push(
            `${who} has ${inputs.length} inputs; at most ${L.maxSide}.`,
          );
        if (outputs.length > L.maxSide)
          problems.push(
            `${who} has ${outputs.length} outputs; at most ${L.maxSide}.`,
          );
        for (const item of [...inputs, ...outputs]) {
          short(`"${item.text}"`, item.text, 22);
          grounded(`"${item.text}"`, item.text);
          pictureKnown(`"${item.text}"`, item.picture);
        }
        break;
      }
    }
    const partCount =
      m.card === 'compare'
        ? (m.left?.items?.length ?? 0) + (m.right?.items?.length ?? 0)
        : m.card === 'hub'
          ? (m.inputs?.length ?? 0) + (m.outputs?.length ?? 0)
          : items.length;
    for (const reveal of m.reveals ?? []) {
      if (reveal.part < 0 || reveal.part >= partCount)
        problems.push(
          `${who}: a reveal names part ${reveal.part + 1}, and the card has ${partCount}.`,
        );
      if (reveal.sentence < m.from || reveal.sentence > m.to)
        problems.push(
          `${who}: a reveal is on sentence ${reveal.sentence + 1}, outside the moment's sentences ${m.from + 1} to ${m.to + 1}.`,
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
      `The moments end at sentence ${expect}; the narration has ${n}, so the last moment ends at sentence ${n}.`,
    );
  return problems;
}

/** The stage's boxes of a laid card, for the gallery and tests. */
export function cardBoxes(laid: Laid): Box[] {
  return laid.elements.map((e) => boxOf(e)).filter((b): b is Box => Boolean(b));
}
