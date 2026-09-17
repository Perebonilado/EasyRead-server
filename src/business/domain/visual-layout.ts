/**
 * The scene laid out by the app, not the model.
 *
 * The model says what is in the picture and how it is related: a
 * template, the elements with their roles, the arrows as from and to.
 * This module places it, the way the reference lesson's author placed
 * things by hand: one thing at the centre, what feeds it on one side,
 * what comes out on the other, steps in a row, a cycle in a ring, two
 * columns to compare, bands to stack. Every box is sized from the
 * measured font and the preset's own proportions, so nothing overlaps or
 * runs over the edge by construction, and the checker downstream is a
 * safety net rather than the main event.
 */
import {
  CHIP_HEIGHT,
  CHIP_MIN_WIDTH,
  CHIP_PAD,
  CHIP_TEXT_SIZE,
  LABEL_SIZE,
  VISUAL_MARGIN,
  VISUAL_SPACE,
  textWidth,
  type VisualColor,
  type VisualElement,
  type VisualIcon,
  type VisualScript,
  type VisualSegment,
} from './visual';
import { PRESET_INFO } from './visual-presets';

export const TEMPLATES = ['hub', 'flow', 'cycle', 'compare', 'layers'] as const;
export type Template = (typeof TEMPLATES)[number];

export type Role =
  | 'centre'
  | 'input'
  | 'output'
  | 'step'
  | 'left'
  | 'right'
  | 'layer'
  | 'note'
  | 'title';

/** One thing in the picture, before it has a place. */
export interface StructureItem {
  id: string;
  role: Role;
  /** A chip carries a word or two; a picture is a preset drawn by name; a label is a line of text; dots are scatter inside the centre. */
  kind: 'chip' | 'picture' | 'label' | 'dots';
  /** The chip's or label's words, or a picture's short name shown beside it (may be empty for a picture). */
  text: string;
  /** For a picture: the preset's name. */
  picture?: string;
  color?: VisualColor;
  /** For dots: how many. */
  count?: number;
}

export interface StructureArrow {
  id: string;
  from: string;
  to: string;
  color?: VisualColor;
  double?: boolean;
  /** Moving dashes along it once drawn; the cue decides when. */
  flow?: boolean;
}

/** What the model writes: the picture as structure, and the narration with its cues. */
export interface VisualStructure {
  title: string;
  template: Template;
  items: StructureItem[];
  arrows: StructureArrow[];
  segments: VisualSegment[];
}

const W = VISUAL_SPACE.w;
const H = VISUAL_SPACE.h;
const M = VISUAL_MARGIN;

/** A picture's box for a wanted width, keeping its proportions; falls back to a square. */
export function pictureBox(
  name: string,
  width: number,
): { w: number; h: number } {
  const aspect = PRESET_INFO[name]?.aspect ?? 1;
  const w = Math.round(width);
  return { w, h: Math.round(w / aspect) };
}

function chipWidth(text: string): number {
  return Math.max(
    CHIP_MIN_WIDTH,
    textWidth(text, CHIP_TEXT_SIZE, true) + CHIP_PAD,
  );
}

/** The colour a role takes when the model gave none. */
const ROLE_COLOR: Record<Role, VisualColor> = {
  centre: 'green',
  input: 'blue',
  output: 'orange',
  step: 'blue',
  left: 'blue',
  right: 'violet',
  layer: 'blue',
  note: 'muted',
  title: 'ink',
};

/** The picture size for a centre, and for a step or column entry. */
const CENTRE_WIDTH = 132;
const SMALL_PICTURE = 46;
/** The least clear space between a side item and the centre. */
const SIDE_GAP = 18;

/**
 * Places one item at a centre point as the elements it becomes: a chip,
 * a label, a picture (with its name in a small label under it when it has
 * one), or dots scattered in the centre's box.
 */
function place(
  item: StructureItem,
  cx: number,
  cy: number,
  size: number,
  centreBox?: { x: number; y: number; w: number; h: number },
): VisualElement[] {
  const color = item.color ?? ROLE_COLOR[item.role];
  switch (item.kind) {
    case 'chip':
      return [
        { id: item.id, type: 'chip', x: cx, y: cy, text: item.text, color },
      ];
    case 'label':
      return [
        {
          id: item.id,
          type: 'label',
          x: cx,
          y: cy,
          text: item.text,
          size:
            item.role === 'title' ? 'xl' : item.role === 'note' ? 'sm' : 'md',
          color: item.role === 'title' ? 'ink' : color,
        },
      ];
    case 'picture': {
      const name =
        item.picture && PRESET_INFO[item.picture] ? item.picture : 'document';
      const box = pictureBox(name, size);
      const elements: VisualElement[] = [
        {
          id: item.id,
          type: 'shape',
          x: cx,
          y: cy,
          w: box.w,
          h: box.h,
          kind: name,
          color,
          fill: 'tint',
        },
      ];
      if (item.text) {
        elements.push({
          id: `${item.id}Label`,
          type: 'label',
          x: cx,
          y: cy + box.h / 2 + 12,
          text: item.text,
          size: 'sm',
          color: 'muted',
        });
      }
      return elements;
    }
    case 'dots': {
      const box = centreBox ?? { x: cx - 30, y: cy - 20, w: 60, h: 40 };
      const count = Math.min(Math.max(item.count ?? 5, 1), 12);
      const points: [number, number][] = [];
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      for (let i = 0; i < count; i += 1) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        points.push([
          Math.round(box.x + box.w * (0.25 + (0.5 * (c + 0.5)) / cols)),
          Math.round(box.y + box.h * (0.25 + (0.5 * (r + 0.5)) / rows)),
        ]);
      }
      return [{ id: item.id, type: 'dots', points, r: 4, color }];
    }
    default:
      return [];
  }
}

/** Evenly spaced centres for `n` things along a span from `from` to `to`. */
function spread(n: number, from: number, to: number): number[] {
  if (n <= 1) return [Math.round((from + to) / 2)];
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(from + i * step));
}

/**
 * The hub: the centre in the middle, inputs down the left (the first
 * one or two above when there are many), outputs down the right, notes
 * along the bottom, the title along the top.
 */
function layoutHub(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const centre = items.find((i) => i.role === 'centre');
  const inputs = items.filter((i) => i.role === 'input');
  const outputs = items.filter((i) => i.role === 'output');
  const notes = items.filter((i) => i.role === 'note');
  const dots = items.filter((i) => i.kind === 'dots');
  const out: VisualElement[] = [];
  const top = title ? 58 : M + 8;
  const bottom = notes.length ? H - 40 : H - M - 8;
  const cy = Math.round((top + bottom) / 2);
  if (title) out.push(...place(title, W / 2, 32, 0));
  // The sides claim their own width first; the centre takes what is left,
  // so a long chip on the left never runs under the picture.
  const half = (item: StructureItem, size: number) =>
    item.kind === 'chip'
      ? chipWidth(item.text) / 2
      : item.kind === 'picture'
        ? Math.max(
            pictureBox(item.picture ?? 'document', size).w,
            textWidth(item.text, 12, false),
          ) / 2
        : textWidth(item.text, 14, true) / 2;
  const widest = (side: StructureItem[]) =>
    Math.max(0, ...side.slice(0, 4).map((i) => half(i, SMALL_PICTURE) * 2));
  const room = W - 2 * M - widest(inputs) - widest(outputs) - 2 * SIDE_GAP;
  const centreWidth = Math.max(72, Math.min(CENTRE_WIDTH, room));
  let centreBox = {
    x: W / 2 - centreWidth / 2,
    y: cy - 40,
    w: centreWidth,
    h: 80,
  };
  if (centre) {
    const placed = place(
      centre,
      W / 2,
      cy,
      centre.kind === 'picture' ? centreWidth : 0,
    );
    const shape = placed[0];
    if (shape.type === 'shape')
      centreBox = {
        x: shape.x - shape.w / 2,
        y: shape.y - shape.h / 2,
        w: shape.w,
        h: shape.h,
      };
    if (shape.type === 'chip') {
      // A chip at the centre is drawn as a rounded box the size of a picture.
      const w = Math.max(chipWidth(centre.text), Math.min(120, centreWidth));
      out.push({
        id: centre.id,
        type: 'shape',
        x: W / 2,
        y: cy,
        w,
        h: 70,
        kind: 'roundRect',
        text: centre.text.slice(0, 22),
        color: centre.color ?? ROLE_COLOR.centre,
        fill: 'tint',
      });
      centreBox = { x: W / 2 - w / 2, y: cy - 35, w, h: 70 };
    } else {
      out.push(...placed);
    }
  }
  for (const d of dots) out.push(...place(d, W / 2, cy, 0, centreBox));
  // Sides: up to four each; the fifth and sixth go along the top corners.
  const sideYs = (n: number) => spread(Math.min(n, 4), top + 18, bottom - 18);
  const leftX = M + 62;
  const rightX = W - M - 62;
  inputs.forEach((item, i) => {
    const size = SMALL_PICTURE;
    if (i < 4) {
      out.push(
        ...place(
          item,
          M + 2 + half(item, size),
          sideYs(inputs.length)[i],
          size,
        ),
      );
    } else {
      out.push(
        ...place(
          item,
          spread(inputs.length - 4, leftX + 70, W / 2 - 40)[i - 4],
          top + 10,
          size,
        ),
      );
    }
  });
  outputs.forEach((item, i) => {
    const size = SMALL_PICTURE;
    if (i < 4) {
      out.push(
        ...place(
          item,
          W - M - 2 - half(item, size),
          sideYs(outputs.length)[i],
          size,
        ),
      );
    } else {
      out.push(
        ...place(
          item,
          spread(outputs.length - 4, W / 2 + 40, rightX - 70)[i - 4],
          bottom - 10,
          size,
        ),
      );
    }
  });
  const noteXs = spread(notes.length, M + 80, W - M - 80);
  notes.forEach((item, i) => out.push(...place(item, noteXs[i], H - 22, 0)));
  return out;
}

/** Steps in a row left to right, or two rows snaking when there are more than four. */
function layoutFlow(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const steps = items.filter((i) => i.role === 'step');
  const notes = items.filter((i) => i.role === 'note');
  const out: VisualElement[] = [];
  const top = title ? 58 : M + 8;
  if (title) out.push(...place(title, W / 2, 32, 0));
  const rows = steps.length > 4 ? 2 : 1;
  const perRow = Math.ceil(steps.length / rows);
  const ys = rows === 1 ? [Math.round((top + H - 40) / 2)] : [top + 40, H - 70];
  steps.forEach((item, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const xs = spread(perRow, M + 60, W - M - 60);
    out.push(...place(item, xs[col], ys[row], SMALL_PICTURE + 10));
  });
  const noteXs = spread(notes.length, M + 80, W - M - 80);
  notes.forEach((item, i) => out.push(...place(item, noteXs[i], H - 22, 0)));
  return out;
}

/** Steps around a ring, clockwise from the top, with the centre in the middle when there is one. */
function layoutCycle(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const centre = items.find((i) => i.role === 'centre');
  const steps = items.filter((i) => i.role === 'step');
  const out: VisualElement[] = [];
  if (title) out.push(...place(title, W / 2, 32, 0));
  const cx = W / 2;
  const cy = title ? 152 : 138;
  const r = 84;
  if (centre) out.push(...place(centre, cx, cy, 70));
  steps.forEach((item, i) => {
    const a = (i / steps.length) * Math.PI * 2 - Math.PI / 2;
    out.push(
      ...place(
        item,
        Math.round(cx + Math.cos(a) * r),
        Math.round(cy + Math.sin(a) * r),
        SMALL_PICTURE,
      ),
    );
  });
  return out;
}

/** Two columns side by side, each headed by its picture or name. */
function layoutCompare(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const left = items.filter((i) => i.role === 'left');
  const right = items.filter((i) => i.role === 'right');
  const out: VisualElement[] = [];
  if (title) out.push(...place(title, W / 2, 32, 0));
  const top = title ? 64 : M + 14;
  const column = (list: StructureItem[], x: number) => {
    const ys = spread(list.length, top + 14, H - M - 24);
    list.forEach((item, i) =>
      out.push(...place(item, x, ys[i], SMALL_PICTURE)),
    );
  };
  column(left, W * 0.28);
  column(right, W * 0.72);
  return out;
}

/** Bands stacked top to bottom, each a wide rounded box with its words. */
function layoutLayers(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const layers = items.filter((i) => i.role === 'layer');
  const out: VisualElement[] = [];
  if (title) out.push(...place(title, W / 2, 32, 0));
  const top = title ? 56 : M + 6;
  const gap = 8;
  const h = Math.min(
    44,
    Math.floor(
      (H - M - top - gap * (layers.length - 1)) / Math.max(layers.length, 1),
    ),
  );
  layers.forEach((item, i) => {
    const y = top + i * (h + gap) + h / 2;
    out.push({
      id: item.id,
      type: 'shape',
      x: W / 2,
      y,
      w: W - 2 * M - 40,
      h,
      kind: 'roundRect',
      text: item.text.slice(0, 22),
      color: item.color ?? ROLE_COLOR.layer,
      fill: 'tint',
    });
  });
  return out;
}

/**
 * The structure as a script the checks, the timing and the client all
 * read: every item placed by its template, every arrow attached by id,
 * and the narration as it was.
 */
export function layoutScene(structure: VisualStructure): VisualScript {
  const placed: VisualElement[] =
    structure.template === 'flow'
      ? layoutFlow(structure)
      : structure.template === 'cycle'
        ? layoutCycle(structure)
        : structure.template === 'compare'
          ? layoutCompare(structure)
          : structure.template === 'layers'
            ? layoutLayers(structure)
            : layoutHub(structure);
  const ids = new Set(placed.map((e) => e.id));
  const arrows: VisualElement[] = structure.arrows
    .filter((a) => ids.has(a.from) && ids.has(a.to) && a.from !== a.to)
    .map((a) => ({
      id: a.id,
      type: 'arrow',
      from: a.from,
      to: a.to,
      // Straight lines fan out cleanly; a ring needs the bend to read as one.
      bend: structure.template === 'cycle' ? -22 : 0,
      color: a.color ?? placed.find((e) => e.id === a.from)?.color ?? 'muted',
      ...(a.double ? { double: true } : {}),
    }));
  // A picture's name rides with the picture: whatever shows, hides or
  // dims the picture does the same to its label, on the same word.
  const labelled = new Set(
    placed
      .filter((e) => e.type === 'label' && e.id.endsWith('Label'))
      .map((e) => e.id.slice(0, -'Label'.length)),
  );
  const segments = structure.segments.map((segment) => ({
    ...segment,
    cues: segment.cues.flatMap((cue) =>
      labelled.has(cue.target) &&
      ['draw', 'fade', 'hide', 'dim', 'undim'].includes(cue.do)
        ? [
            cue,
            {
              ...cue,
              do: cue.do === 'draw' ? ('fade' as const) : cue.do,
              target: `${cue.target}Label`,
            },
          ]
        : [cue],
    ),
  }));
  return {
    title: structure.title,
    elements: [...placed, ...arrows],
    segments,
  };
}

/** For the prompt: the icon names still accepted, mapped onto presets. */
export const ICON_TO_PRESET: Record<VisualIcon, string> = {
  person: 'person',
  people: 'people',
  clock: 'clock',
  book: 'book',
  money: 'money',
  heart: 'heart',
  building: 'building',
  globe: 'globe',
  gear: 'gear',
  bulb: 'bulb',
  warning: 'warning',
  check: 'check',
  question: 'question',
  scale: 'scale',
  arrows: 'arrows',
  star: 'star',
};

export { LABEL_SIZE, CHIP_HEIGHT };
