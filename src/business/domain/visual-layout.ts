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
/** The suffix on the id of the small name label under a picture. */
export const NAME = '_name';
/** Room between steps in a row, enough for an arrow to be seen. */
const STEP_GAP = 30;
/** How many inputs or outputs stack down one side before the rest go in a row. */
const STACK = 5;

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
          id: `${item.id}${NAME}`,
          type: 'label',
          x: cx,
          y: cy + box.h / 2 + 10,
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

/** How wide an item stands, its name label included. */
function itemWidth(item: StructureItem, size: number): number {
  if (item.kind === 'chip') return chipWidth(item.text.slice(0, 22));
  if (item.kind === 'picture')
    return Math.max(
      pictureBox(item.picture ?? 'document', size).w,
      textWidth(item.text, 12, false),
    );
  return textWidth(item.text, 14, true);
}

/**
 * The rows a flow's steps take and the picture size at which they stand
 * in the band, trying smaller pictures before giving up.
 */
function fitFlow(
  steps: StructureItem[],
  band: number,
): { rows: StructureItem[][]; size: number; fits: boolean } {
  let last = { rows: [] as StructureItem[][], size: 30, fits: false };
  for (const size of [SMALL_PICTURE + 10, SMALL_PICTURE, 38, 30]) {
    const rows = packRows(steps, size, STEP_GAP);
    const tall = rows.reduce(
      (sum, row) => sum + Math.max(...row.map((i) => itemHeight(i, size))),
      10 * (rows.length - 1),
    );
    last = { rows, size, fits: tall <= band };
    if (last.fits) return last;
  }
  return last;
}

/** Steps into rows that fit the width, in order, as few rows as they take. */
function packRows(
  items: StructureItem[],
  size: number,
  gap: number,
): StructureItem[][] {
  const rows: StructureItem[][] = [];
  let row: StructureItem[] = [];
  let used = 0;
  for (const item of items) {
    const w = itemWidth(item, size);
    if (row.length && used + gap + w > W - 2 * M) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length ? gap : 0) + w;
    row.push(item);
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Centres for one row's items, side by side with a gap, the row centred. */
function rowXs(row: StructureItem[], size: number, gap: number): number[] {
  const widths = row.map((i) => itemWidth(i, size));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
  let x = (W - total) / 2;
  return widths.map((w) => {
    const centre = Math.round(x + w / 2);
    x += w + gap;
    return centre;
  });
}

/** Row centres between `top` and `bottom` for rows of the given heights, evenly spaced. */
function stackRows(heights: number[], top: number, bottom: number): number[] {
  if (heights.length === 1) return [Math.round((top + bottom) / 2)];
  const total = heights.reduce((a, b) => a + b, 0);
  const gap = Math.max(10, (bottom - top - total) / (heights.length - 1));
  let y = top;
  return heights.map((h) => {
    const centre = Math.round(y + h / 2 - (h > 26 ? 8 : 0));
    y += h + gap;
    return centre;
  });
}

/** How many of the items, in order, stand in a band of the height with room between. */
function stacks(items: StructureItem[], size: number, band: number): number {
  let used = 0;
  let n = 0;
  for (const item of items) {
    const h = itemHeight(item, size) + (n ? 6 : 0);
    if (used + h > band - 8) break;
    used += h;
    n += 1;
    if (n >= STACK) break;
  }
  return n;
}

/**
 * The picture size at which the whole side stands in the band, trying
 * smaller pictures before giving up, and how many stand at that size.
 */
function fitStack(
  items: StructureItem[],
  band: number,
): { n: number; size: number } {
  for (const size of [SMALL_PICTURE, 38, 30, 26]) {
    const n = stacks(items, size, band);
    if (n >= items.length) return { n, size };
  }
  return { n: stacks(items, 26, band), size: 26 };
}

/** How tall an item stands, its name label included. */
function itemHeight(item: StructureItem, size: number): number {
  if (item.kind === 'picture')
    return pictureBox(item.picture ?? 'document', size).h + 16;
  if (item.kind === 'chip') return 26;
  return 18;
}

/**
 * Centres for a stack of items between `top` and `bottom`: each sits
 * below the one before with the same gap, the whole stack centred in the
 * band, so tall pictures and short chips never run into each other.
 */
function stackYs(
  items: StructureItem[],
  size: number,
  top: number,
  bottom: number,
): number[] {
  if (!items.length) return [];
  const heights = items.map((i) => itemHeight(i, size));
  const total = heights.reduce((a, b) => a + b, 0);
  const band = bottom - top - 8;
  const gap =
    items.length > 1
      ? Math.max(6, Math.min(40, (band - total) / (items.length - 1)))
      : 0;
  let y = top + 4 + Math.max(0, (band - total - gap * (items.length - 1)) / 2);
  return heights.map((h) => {
    const centre = Math.round(y + h / 2 - (h > 26 ? 8 : 0));
    y += h + gap;
    return centre;
  });
}

/**
 * What is wrong with a structure in the model's own terms, before any
 * placing: text too long for its kind, a picture the library does not
 * have, an arrow to nothing, a role the template has no place for.
 */
export function structureProblems(structure: VisualStructure): string[] {
  const problems: string[] = [];
  const ids = new Set(structure.items.map((i) => i.id));
  const allowed: Record<VisualStructure['template'], Role[]> = {
    hub: ['centre', 'input', 'output', 'note', 'title'],
    flow: ['step', 'note', 'title'],
    cycle: ['step', 'centre', 'title'],
    compare: ['left', 'right', 'note', 'title'],
    layers: ['layer', 'title'],
  };
  const seen = new Set<string>();
  for (const item of structure.items) {
    if (seen.has(item.id))
      problems.push(`Item id "${item.id}" is used twice; ids are unique.`);
    seen.add(item.id);
    if (item.id.endsWith(NAME))
      problems.push(
        `"${item.id}" ends in ${NAME}, which is kept for the name under a picture; use another id.`,
      );
    if (!allowed[structure.template].includes(item.role))
      problems.push(
        `"${item.id}" has role ${item.role}, which the ${structure.template} template has no place for; give it a role of ${allowed[structure.template].join(', ')}.`,
      );
    if (item.kind === 'chip' && item.text.length > 22)
      problems.push(
        `Chip "${item.id}" says "${item.text}", ${item.text.length} characters; at most twenty-two, one or two words.`,
      );
    if (item.kind === 'picture') {
      if (!item.picture || !PRESET_INFO[item.picture])
        problems.push(
          `Picture "${item.id}" names "${item.picture ?? ''}", which is not in the library; use a name from the catalogue or make it a chip.`,
        );
      if (item.text.length > 24 || item.text.split(/\s+/).length > 4)
        problems.push(
          `Picture "${item.id}" is named "${item.text}"; its name is one to three words, at most twenty-four characters.`,
        );
    }
    if (item.kind === 'label' && item.text.length > 40)
      problems.push(
        `Label "${item.id}" is ${item.text.length} characters; at most forty.`,
      );
  }
  for (const arrow of structure.arrows) {
    for (const end of [arrow.from, arrow.to])
      if (!ids.has(end))
        problems.push(
          `Arrow "${arrow.id}" points at "${end}", which is not an item.`,
        );
    if (arrow.from === arrow.to)
      problems.push(
        `Arrow "${arrow.id}" points from "${arrow.from}" to itself.`,
      );
  }
  const count = (role: Role) =>
    structure.items.filter((i) => i.role === role).length;
  const most: Array<[VisualStructure['template'], Role, number]> = [
    ['flow', 'step', 6],
    ['cycle', 'step', 6],
    ['compare', 'left', 4],
    ['compare', 'right', 4],
    ['layers', 'layer', 5],
    ['hub', 'input', 4],
    ['hub', 'output', 4],
  ];
  for (const [template, role, limit] of most)
    if (structure.template === template && count(role) > limit)
      problems.push(
        `A ${template} holds at most ${limit} items with role ${role}; there are ${count(role)}. Keep the ones that matter most.`,
      );
  if (structure.template === 'flow') {
    const stepItems = structure.items.filter((i) => i.role === 'step');
    const steps = stepItems.map((i) => i.id);
    for (const arrow of structure.arrows) {
      const from = steps.indexOf(arrow.from);
      const to = steps.indexOf(arrow.to);
      if (from >= 0 && to >= 0 && to !== from + 1)
        problems.push(
          `Arrow "${arrow.id}" goes from step ${from + 1} to step ${to + 1}; in a flow each arrow goes to the next step. A loop back is a cycle template.`,
        );
    }
    const { rows, fits } = fitFlow(stepItems, H - 40 - 58);
    if (!fits)
      problems.push(
        `The flow's steps take ${rows.length} rows, more than fit; use fewer or shorter steps.`,
      );
  }
  if (structure.template === 'hub') {
    const centres = structure.items.filter(
      (i) => i.role === 'centre' && i.kind !== 'dots',
    );
    if (centres.length !== 1)
      problems.push(
        `A hub has exactly one centre; there are ${centres.length}. One thing in the middle, the rest as inputs and outputs.`,
      );
    const centre = centres[0];
    for (const arrow of structure.arrows)
      if (centre && arrow.from !== centre.id && arrow.to !== centre.id)
        problems.push(
          `Arrow "${arrow.id}" joins "${arrow.from}" to "${arrow.to}"; in a hub every arrow starts or ends at the centre, "${centre.id}".`,
        );
    const size = SMALL_PICTURE;
    const inputs = structure.items.filter((i) => i.role === 'input');
    const outputs = structure.items.filter((i) => i.role === 'output');
    const band = H - 2 * M - 58 - 32;
    const fitIn = fitStack(inputs, band).n;
    const fitOut = fitStack(outputs, band).n;
    if (fitIn < inputs.length)
      problems.push(
        `Only ${fitIn} inputs fit down the left; there are ${inputs.length}. Keep the ${fitIn} that matter most.`,
      );
    if (fitOut < outputs.length)
      problems.push(
        `Only ${fitOut} outputs fit down the right; there are ${outputs.length}. Keep the ${fitOut} that matter most.`,
      );
    const widest = (side: StructureItem[]) =>
      Math.max(0, ...side.map((i) => itemWidth(i, size)));
    const room = W - 2 * M - widest(inputs) - widest(outputs) - 2 * SIDE_GAP;
    if (room < 64) {
      const wide = [...inputs, ...outputs]
        .sort((a, b) => itemWidth(b, size) - itemWidth(a, size))
        .slice(0, 2)
        .map((i) => `"${i.id}" ("${i.text}")`);
      problems.push(
        `The sides leave no room for the centre: shorten ${wide.join(' and ')} to one word each.`,
      );
    }
  }
  return problems;
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
  const dots = items.filter((i) => i.kind === 'dots' && i !== centre);
  const out: VisualElement[] = [];
  const size = SMALL_PICTURE;
  // Half the width a side item takes, label and all.
  const half = (item: StructureItem, sz = size) => itemWidth(item, sz) / 2;
  // The bands, top to bottom: the title, the middle (stacks either side
  // of the centre), the notes.
  let top = M + 8;
  let bottom = H - M - 8;
  if (title) {
    out.push(...place(title, W / 2, 32, 0));
    top = 58;
  }
  if (notes.length) {
    const xs = spread(notes.length, M + 80, W - M - 80);
    notes.forEach((item, i) => out.push(...place(item, xs[i], bottom - 8, 0)));
    bottom -= 26;
  }
  // Each side stacks what stands in the band; more than that is sent back
  // to the model by the structure checks, so nothing is placed twice.
  const fitIn = fitStack(inputs, bottom - top);
  const fitOut = fitStack(outputs, bottom - top);
  // Everything is placed, even a side too full to fit; the structure
  // checks send that back to the model rather than leave cues pointing
  // at nothing.
  const stackedIn = inputs;
  const stackedOut = outputs;
  const cy = Math.round((top + bottom) / 2);
  // The sides claim their own width first; the centre takes what is left,
  // so a long chip on the left never runs under the picture.
  const widest = (side: StructureItem[], sz: number) =>
    Math.max(0, ...side.map((i) => half(i, sz) * 2));
  const leftW = widest(stackedIn, fitIn.size);
  const rightW = widest(stackedOut, fitOut.size);
  // The centre sits midway between the two stacks, not the canvas.
  const cx = Math.round((M + leftW + (W - M - rightW)) / 2);
  const room = W - 2 * M - leftW - rightW - 2 * SIDE_GAP;
  const tall = bottom - top - 2 * 12 - 18;
  const aspect =
    centre?.kind === 'picture'
      ? (PRESET_INFO[centre.picture ?? '']?.aspect ?? 1)
      : 1;
  const centreWidth = Math.max(
    64,
    Math.min(CENTRE_WIDTH, room, Math.round(tall * aspect)),
  );
  let centreBox = {
    x: cx - centreWidth / 2,
    y: cy - 40,
    w: centreWidth,
    h: 80,
  };
  if (centre) {
    const placed = place(
      centre,
      cx,
      cy,
      centre.kind === 'picture' ? centreWidth : 0,
    );
    const shape = placed[0];
    if (shape?.type === 'shape')
      centreBox = {
        x: shape.x - shape.w / 2,
        y: shape.y - shape.h / 2,
        w: shape.w,
        h: shape.h,
      };
    if (shape?.type === 'chip') {
      // A chip at the centre is drawn as a rounded box the size of a picture.
      const w = Math.max(
        chipWidth(centre.text.slice(0, 22)),
        Math.min(120, centreWidth),
      );
      out.push({
        id: centre.id,
        type: 'shape',
        x: cx,
        y: cy,
        w,
        h: 70,
        kind: 'roundRect',
        text: centre.text.slice(0, 22),
        color: centre.color ?? ROLE_COLOR.centre,
        fill: 'tint',
      });
      centreBox = { x: cx - w / 2, y: cy - 35, w, h: 70 };
    } else {
      out.push(...placed);
    }
  }
  for (const d of dots) out.push(...place(d, cx, cy, 0, centreBox));
  // Stacks share the edge that faces the centre, so every arrow leaves
  // from the same line and never crosses the item below it.
  const inYs = stackYs(stackedIn, fitIn.size, top, bottom);
  stackedIn.forEach((item, i) =>
    out.push(
      ...place(item, M + leftW - half(item, fitIn.size), inYs[i], fitIn.size),
    ),
  );
  const outYs = stackYs(stackedOut, fitOut.size, top, bottom);
  stackedOut.forEach((item, i) =>
    out.push(
      ...place(
        item,
        W - M - rightW + half(item, fitOut.size),
        outYs[i],
        fitOut.size,
      ),
    ),
  );
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
  const bottom = notes.length ? H - 40 : H - M - 8;
  if (title) out.push(...place(title, W / 2, 32, 0));
  const { rows, size } = fitFlow(steps, bottom - top);
  const tallest = (row: StructureItem[]) =>
    Math.max(...row.map((i) => itemHeight(i, size)));
  const ys = stackRows(rows.map(tallest), top, bottom);
  rows.forEach((row, r) => {
    // Every other row runs back the other way, so the turn is one short drop.
    const ordered = r % 2 === 0 ? row : [...row].reverse();
    const xs = rowXs(ordered, size, STEP_GAP);
    ordered.forEach((item, i) => out.push(...place(item, xs[i], ys[r], size)));
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
  const notes = items.filter((i) => i.role === 'note');
  const out: VisualElement[] = [];
  if (title) out.push(...place(title, W / 2, 32, 0));
  const top = title ? 58 : M + 8;
  const bottom = notes.length ? H - 40 : H - M - 8;
  // Each column is as wide as its widest entry; the two share the width.
  const widest = (list: StructureItem[]) =>
    Math.max(80, ...list.map((i) => itemWidth(i, SMALL_PICTURE)));
  const lw = widest(left);
  const rw = widest(right);
  const spare = Math.max(0, W - 2 * M - lw - rw);
  const lx = Math.round(M + spare / 3 + lw / 2);
  const rx = Math.round(W - M - spare / 3 - rw / 2);
  const column = (list: StructureItem[], x: number) => {
    const ys = stackYs(list, SMALL_PICTURE, top, bottom);
    list.forEach((item, i) =>
      out.push(...place(item, x, ys[i], SMALL_PICTURE)),
    );
  };
  column(left, lx);
  column(right, rx);
  const noteXs = spread(notes.length, M + 80, W - M - 80);
  notes.forEach((item, i) => out.push(...place(item, noteXs[i], H - 22, 0)));
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
      bend: structure.template === 'cycle' ? -14 : 0,
      color: a.color ?? placed.find((e) => e.id === a.from)?.color ?? 'muted',
      ...(a.double ? { double: true } : {}),
    }));
  // A picture's name rides with the picture: whatever shows, hides or
  // dims the picture does the same to its label, on the same word.
  const labelled = new Set(
    placed
      .filter((e) => e.type === 'label' && e.id.endsWith(NAME))
      .map((e) => e.id.slice(0, -NAME.length)),
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
              target: `${cue.target}${NAME}`,
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
