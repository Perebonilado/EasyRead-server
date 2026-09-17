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
  type Box,
  boxOf,
  type VisualPoint,
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

export function chipWidth(text: string): number {
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
const CENTRE_WIDTH = 150;
const SMALL_PICTURE = 46;
/** The suffix on the id of the small name label under a picture. */
export const NAME = '_name';
/** Room between steps in a row, enough for an arrow to be seen. */
const STEP_GAP = 26;

/**
 * Places one item at a centre point as the elements it becomes: a chip,
 * a label, a picture (with its name in a small label under it when it has
 * one), or dots scattered in the centre's box.
 */
export function place(
  item: StructureItem,
  cx: number,
  cy: number,
  size: number,
  centreBox?: { x: number; y: number; w: number; h: number },
): VisualElement[] {
  // A chip in ink would be a plain box among coloured ones; it takes its role's colour.
  const color =
    item.kind === 'chip' && item.color === 'ink'
      ? ROLE_COLOR[item.role]
      : (item.color ?? ROLE_COLOR[item.role]);
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
          // A title takes the big size when it fits the width, else the next one down.
          size:
            item.role === 'title'
              ? textWidth(item.text, LABEL_SIZE.xl, true) <= W - 2 * M - 16
                ? 'xl'
                : 'lg'
              : item.role === 'note'
                ? 'sm'
                : 'md',
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
      return [{ id: item.id, type: 'dots', points, r: 5, color }];
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
    const plan = hubPlan(structure);
    if (!plan.centre.fits) {
      const wide = [...plan.spots]
        .sort((a, b) => b.box.w - a.box.w)
        .slice(0, 2)
        .map((spot) => `"${spot.item.id}" ("${spot.item.text}")`);
      problems.push(
        `The sides leave no room for the centre: shorten ${wide.join(' and ')} to one word each.`,
      );
    }
  }
  return problems;
}

/** Evenly spaced centres for `n` things along a span from `from` to `to`. */
export function spread(n: number, from: number, to: number): number[] {
  if (n <= 1) return [Math.round((from + to) / 2)];
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(from + i * step));
}

/** One side item and where it stands: which side, how far down the band, its picture size. */
interface SidePlace {
  item: StructureItem;
  side: 'left' | 'right';
  /** 0 at the top of the band, 1 at the bottom, 0.5 in the middle. */
  f: number;
  size: number;
}

/** A side item once it has a box: where it is drawn and the room it takes. */
interface SideSpot extends SidePlace {
  x: number;
  y: number;
  box: Box;
}

/** The hub once planned: the band, every side item boxed, the centre sized to what is left. */
interface HubPlan {
  top: number;
  bottom: number;
  spots: SideSpot[];
  centre: {
    w: number;
    /** The picture's box height, or the pill's, without its name. */
    h: number;
    /** The y the centre element is drawn at. */
    y: number;
    fits: boolean;
  };
}

/** Least room between a side item and the centre, either way. */
const CENTRE_GAP = 12;

/**
 * Which place each side item takes. Corners first, since a corner leaves
 * the middle free for a big centre; one thing on a side sits at its
 * middle; a third input borrows the top right corner when the outputs
 * leave it free, the way a sun, air and water sit around a leaf.
 */
function sidePlaces(
  inputs: StructureItem[],
  outputs: StructureItem[],
  band: number,
): SidePlace[] {
  const fractions = (n: number) =>
    n <= 1 ? [0.5] : Array.from({ length: n }, (_, i) => i / (n - 1));
  const spill = inputs.length === 3 && outputs.length <= 2;
  const left = spill ? inputs.slice(0, 2) : inputs;
  const right = spill ? [inputs[2], ...outputs] : outputs;
  const rightF = spill
    ? [0, ...[1, 0.5].slice(0, outputs.length)]
    : fractions(right.length);
  const leftF = fractions(left.length);
  const leftSize = sideSize(left, band);
  const rightSize = sideSize(right, band);
  return [
    ...left.map((item, i) => ({
      item,
      side: 'left' as const,
      f: leftF[i],
      size: leftSize,
    })),
    ...right.map((item, i) => ({
      item,
      side: 'right' as const,
      f: rightF[i],
      size: rightSize,
    })),
  ];
}

/** The picture size for one side: big when there are few, smaller until the side stands in the band. */
function sideSize(items: StructureItem[], band: number): number {
  for (const size of [56, SMALL_PICTURE, 38, 30, 26]) {
    const tall = items.reduce(
      (sum, item) => sum + itemHeight(item, size),
      6 * Math.max(0, items.length - 1),
    );
    if (tall <= band - 4) return size;
  }
  return 26;
}

/** The box an item takes, centred on x, its top edge at `top`. */
function itemBoxAt(
  item: StructureItem,
  x: number,
  top: number,
  size: number,
): { box: Box; y: number } {
  const w = itemWidth(item, size);
  const h = itemHeight(item, size);
  const box = { x: x - w / 2, y: top, w, h };
  // The element's own y: a chip's or label's middle, a picture's middle
  // (its name hangs below it).
  const y =
    item.kind === 'picture'
      ? top + pictureBox(item.picture ?? 'document', size).h / 2
      : top + h / 2;
  return { box, y: Math.round(y) };
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * The hub laid out: the title along the top, notes along the bottom,
 * the side items at their places flush to the edges, and the centre as
 * big as the space between them allows, down to a floor.
 */
function hubPlan(structure: VisualStructure): HubPlan {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const centre = items.find((i) => i.role === 'centre' && i.kind !== 'dots');
  const inputs = items.filter((i) => i.role === 'input');
  const outputs = items.filter((i) => i.role === 'output');
  const notes = items.filter((i) => i.role === 'note');
  const top = title ? 58 : M + 8;
  const bottom = notes.length ? H - 40 : H - M - 8;
  const band = bottom - top;
  const spots: SideSpot[] = sidePlaces(inputs, outputs, band).map((place) => {
    const w = itemWidth(place.item, place.size);
    const h = itemHeight(place.item, place.size);
    const x = place.side === 'left' ? M + 2 + w / 2 : W - M - 2 - w / 2;
    const boxTop = Math.round(top + 2 + place.f * (band - 4 - h));
    const at = itemBoxAt(place.item, Math.round(x), boxTop, place.size);
    return { ...place, x: Math.round(x), y: at.y, box: at.box };
  });
  // The centre: the widest that keeps clear of every side item, tried
  // from the most a picture may take down to the least it can be.
  const mid = (top + bottom) / 2;
  const aspect =
    centre?.kind === 'picture'
      ? (PRESET_INFO[centre.picture ?? '']?.aspect ?? 1)
      : 1;
  const isPicture = centre?.kind === 'picture';
  const least = isPicture
    ? 64
    : Math.max(64, chipWidth((centre?.text ?? '').slice(0, 22)));
  const most = isPicture
    ? Math.min(CENTRE_WIDTH, Math.round((band - 16 - 8) * aspect))
    : Math.max(least, 120);
  const footprint = (w: number): { box: Box; h: number; y: number } => {
    if (isPicture) {
      const h = Math.round(w / aspect);
      const total = h + 16;
      const y0 = Math.round(mid - total / 2);
      return {
        box: { x: W / 2 - w / 2, y: y0, w, h: total },
        h,
        y: y0 + h / 2,
      };
    }
    const h = 70;
    return { box: { x: W / 2 - w / 2, y: mid - h / 2, w, h }, h, y: mid };
  };
  let chosen = footprint(least);
  let fits = false;
  for (let w = most; w >= least; w -= 2) {
    const candidate = footprint(w);
    if (!spots.some((spot) => overlaps(spot.box, candidate.box, CENTRE_GAP))) {
      chosen = candidate;
      fits = true;
      break;
    }
  }
  return {
    top,
    bottom,
    spots,
    centre: {
      w: chosen.box.w,
      h: chosen.h,
      y: Math.round(chosen.y),
      fits,
    },
  };
}

function layoutHub(structure: VisualStructure): VisualElement[] {
  const items = structure.items;
  const title = items.find((i) => i.role === 'title');
  const centre = items.find((i) => i.role === 'centre' && i.kind !== 'dots');
  const notes = items.filter((i) => i.role === 'note');
  const dots = items.filter((i) => i.kind === 'dots');
  const plan = hubPlan(structure);
  const out: VisualElement[] = [];
  if (title) out.push(...place(title, W / 2, 32, 0));
  if (notes.length) {
    const xs = spread(notes.length, M + 80, W - M - 80);
    notes.forEach((item, i) => out.push(...place(item, xs[i], H - 22, 0)));
  }
  for (const spot of plan.spots)
    out.push(...place(spot.item, spot.x, spot.y, spot.size));
  let centreBox: Box = {
    x: W / 2 - plan.centre.w / 2,
    y: plan.centre.y - plan.centre.h / 2,
    w: plan.centre.w,
    h: plan.centre.h,
  };
  if (centre?.kind === 'picture') {
    out.push(...place(centre, W / 2, plan.centre.y, plan.centre.w));
  } else if (centre) {
    // A chip or a label at the centre is drawn as a rounded box the size
    // of a picture, so the middle still reads as the one thing.
    out.push({
      id: centre.id,
      type: 'shape',
      x: W / 2,
      y: plan.centre.y,
      w: plan.centre.w,
      h: plan.centre.h,
      kind: 'roundRect',
      text: centre.text.slice(0, 22),
      color: centre.color ?? ROLE_COLOR.centre,
      fill: 'tint',
    });
  } else {
    centreBox = { x: W / 2 - 40, y: plan.centre.y - 25, w: 80, h: 50 };
  }
  for (const d of dots)
    out.push(...place(d, W / 2, plan.centre.y, 0, centreBox));
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
  // A side's label heads its column; the rest stack below it.
  const column = (list: StructureItem[], x: number) => {
    const head = list.find((i) => i.kind === 'label');
    const rest = list.filter((i) => i !== head);
    if (head) out.push(...place(head, x, top + 14, 0));
    const from = head ? top + 36 : top;
    const ys = stackYs(rest, SMALL_PICTURE, from, bottom);
    rest.forEach((item, i) =>
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
  const byId = new Map(placed.map((e) => [e.id, e] as const));
  const middle = (id: string): VisualPoint | null => {
    const element = byId.get(id);
    const box = element ? boxOf(element) : null;
    return box ? [box.x + box.w / 2, box.y + box.h / 2] : null;
  };
  // A ring bends so it reads as one; a hub's arrows bow gently outward,
  // away from the middle, the way lines are drawn by hand; the rest run
  // straight.
  const bendOf = (from: string, to: string): number => {
    if (structure.template === 'cycle') return -14;
    if (structure.template !== 'hub') return 0;
    const a = middle(from);
    const b = middle(to);
    if (!a || !b) return 0;
    const dy = b[1] - a[1];
    if (Math.abs(dy) < 12) return 0;
    const mx = (a[0] + b[0]) / 2;
    return 7 * (mx < W / 2 ? Math.sign(dy) : -Math.sign(dy));
  };
  const arrows: VisualElement[] = structure.arrows
    .filter((a) => ids.has(a.from) && ids.has(a.to) && a.from !== a.to)
    .map((a) => ({
      id: a.id,
      type: 'arrow',
      from: a.from,
      to: a.to,
      bend: bendOf(a.from, a.to),
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
