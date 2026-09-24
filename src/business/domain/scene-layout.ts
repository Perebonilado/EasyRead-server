/**
 * Where everything stands on the stage: seven templates, computed.
 *
 * The writer names a layout and the order things go in; nothing here
 * asks a model anything. Each template is a set of slots that do not
 * overlap by construction, for both stagings: the box (4:3) beside the
 * page and the wide (16:9) full screen. A thing is fitted inside its
 * slot, a drawing at its own proportions with its caption under it, so a
 * picture can never overlap another or leave the stage.
 */
import { measureText } from './scene-font';
import {
  LABEL,
  bandFor,
  gutters,
  labelSize,
  listHeight,
  type LabelMode,
  type LabelPlace,
} from './scene-labels';
import { figureFrame } from './scene-figure';
import type { SceneLayout } from './scene-script';

export const STAGINGS = {
  box: { w: 1200, h: 900, margin: 44 },
  wide: { w: 1600, h: 900, margin: 56 },
} as const;
export type StagingName = keyof typeof STAGINGS;

/** The room between slots: an arrow runs through it. */
export const SLOT_GAP = 72;
/** The caption under a drawing, at its largest and smallest. */
export const CAPTION_SIZE = { max: 38, min: 26 } as const;
const LINE = 1.2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where one thing stands at one step. */
export interface Place extends Rect {
  /** The size its main text is set at: a stat's number, words, a card. */
  size?: number;
  caption?: {
    x: number;
    /** The top of the caption's first line. */
    y: number;
    w: number;
    size: number;
    lines: string[];
  };
  /** The slot it was fitted in: the room its labels may use. Not sent to the player. */
  room?: Rect;
  /** A drawing's labels, set beside it at this step. */
  labels?: LabelPlace[];
  /** Where its labels go: the room kept for them when it was fitted. Not sent to the player. */
  labelsAt?: LabelMode;
  /** The size its labels are set at, when not the room's: a passage's notes, never larger than its words. Not sent to the player. */
  labelSize?: number;
}

/** What the layout needs to know of a thing. */
export type LaidThing =
  | {
      kind: 'drawing';
      aspect: number;
      caption: string | null;
      /** Labels the stage sets beside it, and the drawing's own frame they point into. */
      callouts?: {
        text: string;
        anchor: [number, number];
        ends?: { left: [number, number]; right: [number, number] };
      }[];
      viewBox?: [number, number, number, number];
      /** Drawn by code: working, a graph or a passage, set in the middle of its room. */
      source?: 'math' | 'plot' | 'quote' | 'timeline' | 'chart';
      /** A passage: the size of its words, in its own units. */
      words?: { size: number };
      /** Someone who stands with people: its frame's height in the figure kit's units. */
      stands?: { units: number };
    }
  | { kind: 'stat'; value: string; caption: string }
  | { kind: 'words'; text: string; style: 'title' | 'keyword' | 'card' };

const content = (staging: StagingName): Rect => {
  const { w, h, margin } = STAGINGS[staging];
  return { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 };
};

/**
 * Slots in a line, centred in the band given, the width shared by weight:
 * a wide drawing beside a round one gets the room it needs, where equal
 * shares made it a strip.
 */
function line(
  band: Rect,
  n: number,
  gap = SLOT_GAP,
  tallest = 1.3,
  weights?: number[],
): Rect[] {
  const shares = Array.from({ length: n }, (_, i) => weights?.[i] ?? 1);
  const total = shares.reduce((sum, w) => sum + w, 0) || n;
  const room = band.w - gap * (n - 1);
  const h = Math.min(band.h, Math.max((room / n) * tallest, band.h * 0.5));
  const y = band.y + (band.h - h) / 2;
  let x = band.x;
  return shares.map((share) => {
    const w = (room * share) / total;
    const slot = { x, y, w, h };
    x += w + gap;
    return slot;
  });
}

/**
 * Slots stacked in a column, as far apart as slots in a row: an arrow
 * between two of them runs down past the upper one's caption.
 */
function column(band: Rect, n: number, gap = SLOT_GAP): Rect[] {
  const h = (band.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({
    x: band.x,
    y: band.y + i * (h + gap),
    w: band.w,
    h,
  }));
}

/** Two lines, the first holding `top`, each centred. */
function twoLines(area: Rect, top: number, bottom: number): Rect[] {
  const gap = SLOT_GAP / 1.5;
  const h = (area.h - gap) / 2;
  const width = Math.max(top, bottom);
  const w = (area.w - SLOT_GAP * (width - 1)) / width;
  const row = (count: number, y: number) => {
    const span = count * w + (count - 1) * SLOT_GAP;
    const x0 = area.x + (area.w - span) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: x0 + i * (w + SLOT_GAP),
      y,
      w,
      h,
    }));
  };
  return [...row(top, area.y), ...row(bottom, area.y + h + gap)];
}

/** The slots of a template, in the order the things were listed. */
export function slotsFor(
  layout: SceneLayout,
  count: number,
  staging: StagingName,
  /** How much of a row's width each thing wants, by its proportions. */
  weights?: number[],
): Rect[] {
  const area = content(staging);
  const wide = staging === 'wide';
  const n = Math.max(1, count);
  switch (layout) {
    case 'one':
      return [area];
    case 'row':
      if (!wide && n === 4) return twoLines(area, 2, 2);
      if (!wide && n === 5) return twoLines(area, 3, 2);
      return line(area, n, SLOT_GAP, 1.3, weights);
    case 'grid':
      return twoLines(area, 2, n - 2);
    case 'compare':
      return line(area, 2, SLOT_GAP * 1.4, 10);
    case 'focus': {
      const bigW = area.w * (wide ? 0.6 : 0.58);
      const big = { x: area.x, y: area.y, w: bigW, h: area.h };
      const side = {
        x: area.x + bigW + SLOT_GAP,
        y: area.y,
        w: area.w - bigW - SLOT_GAP,
        h: area.h,
      };
      return [big, ...column(side, n - 1)];
    }
    case 'hub': {
      // The centre, and the rest in a column either side of it: the arrows
      // run in from both sides and never cross the middle.
      const k = n - 1;
      const sideW = area.w * (wide ? 0.22 : 0.27);
      const left = Math.ceil(k / 2);
      const right = k - left;
      const centre = {
        x: area.x + sideW + SLOT_GAP,
        y: area.y + area.h * 0.12,
        w: area.w - (sideW + SLOT_GAP) * 2,
        h: area.h * 0.76,
      };
      const leftSlots = column(
        { x: area.x, y: area.y, w: sideW, h: area.h },
        left,
      );
      const rightSlots = right
        ? column(
            { x: area.x + area.w - sideW, y: area.y, w: sideW, h: area.h },
            right,
          )
        : [];
      return [centre, ...leftSlots, ...rightSlots];
    }
    case 'stack': {
      // A column, full width, each as tall as its share: working and
      // quotations, read top to bottom.
      const shares = Array.from({ length: n }, (_, i) => weights?.[i] ?? 1);
      const total = shares.reduce((sum, w) => sum + w, 0) || n;
      const gap = SLOT_GAP / 1.5;
      const room = area.h - gap * (n - 1);
      let y = area.y;
      return shares.map((share) => {
        const h = (room * share) / total;
        const slot = { x: area.x, y, w: area.w, h };
        y += h + gap;
        return slot;
      });
    }
    case 'cycle': {
      const w = area.w * (wide ? 0.22 : 0.3);
      const h = area.h * (n === 3 ? 0.36 : 0.3);
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2;
      const rx = area.w / 2 - w / 2;
      const ry = area.h / 2 - h / 2;
      return Array.from({ length: n }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return {
          x: cx + rx * Math.cos(angle) - w / 2,
          y: cy + ry * Math.sin(angle) - h / 2,
          w,
          h,
        };
      });
    }
  }
}

/** A caption broken into at most two lines inside a width, smaller if it must be. */
export function captionLines(
  text: string,
  width: number,
  size: number,
): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let s = size; s >= CAPTION_SIZE.min; s -= 2) {
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && measureText(next, s, 600) > width) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    if (
      lines.length <= 2 &&
      lines.every((l) => measureText(l, s, 600) <= width)
    )
      return { lines, size: s };
  }
  // Still too long at the smallest: two lines, the second cut short.
  const s = CAPTION_SIZE.min;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && measureText(next, s, 600) > width) {
      lines.push(current);
      current = word;
      if (lines.length === 2) break;
    } else current = next;
  }
  if (lines.length < 2 && current) lines.push(current);
  const last = lines.length - 1;
  while (
    lines[last].length > 1 &&
    measureText(`${lines[last]}…`, s, 600) > width
  )
    lines[last] = lines[last].slice(0, -1);
  if (lines.join(' ') !== words.join(' '))
    lines[last] = `${lines[last].trimEnd()}…`;
  return { lines: lines.slice(0, 2), size: s };
}

/** The largest size a run of text can be set at to fit a width, up to a ceiling. */
function sizeToFit(
  text: string,
  width: number,
  ceiling: number,
  weight: 600 | 700 = 700,
): number {
  const at100 = measureText(text, 100, weight) || 1;
  return Math.max(18, Math.min(ceiling, Math.floor((width / at100) * 100)));
}

/** A passage's notes are set at most this share of the size of its words. */
const NOTE_SHARE = 0.8;
/**
 * The smallest a passage's words may be set, in stage units, for its notes
 * to take a margin beside it: any smaller, and the notes are listed under
 * it instead, so the passage keeps its room's whole width.
 */
const READABLE_WORDS = 32;

type Callouts = NonNullable<
  Extract<LaidThing, { kind: 'drawing' }>['callouts']
>;

/**
 * Where a passage's notes go, and how large: in its right margin, beside
 * the lines they are about, while that leaves its words large enough to
 * read; else listed under it. Never larger than the words they are notes
 * on.
 */
function passageNotes(
  callouts: Callouts,
  viewBox: [number, number, number, number],
  wordSize: number,
  art: Rect,
  aspect: number,
  room: Rect,
): {
  mode: LabelMode;
  side: { left: number; right: number };
  below: number;
  size: number;
} {
  const most = labelSize(room);
  // The size of the passage's words on the stage, at a width.
  const words = (w: number) => (wordSize * w) / viewBox[2];
  const fits = (right: number, below: number) =>
    Math.min(art.w - right, (art.h - below) * aspect);
  const sized = (w: number) =>
    Math.round(Math.min(most, Math.max(LABEL.min, words(w) * NOTE_SHARE)));
  // In the margin: sized to the passage the room's own label size leaves,
  // then only as wide a margin as that size needs.
  const size = sized(fits(gutters(callouts, viewBox, room, most).right, 0));
  const right = gutters(callouts, viewBox, room, size).right;
  if (words(fits(right, 0)) >= READABLE_WORDS)
    return { mode: 'sides', side: { left: 0, right }, below: 0, size };
  // Listed under it, measured a little narrow: the passage may stand in
  // from the room's edge, and the list starts where it does.
  const texts = callouts.map((c) => c.text);
  const width = art.w * 0.85;
  const listed = sized(fits(0, listHeight(texts, width, most)));
  return {
    mode: 'list',
    side: { left: 0, right: 0 },
    below: listHeight(texts, width, listed),
    size: listed,
  };
}

/** One thing fitted into its slot: the rectangle it is drawn in, and its caption. */
export function fitInSlot(
  thing: LaidThing,
  slot: Rect,
  captionOnTop = false,
): Place {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (thing.kind === 'drawing') {
    const base = Math.max(
      CAPTION_SIZE.min,
      Math.min(CAPTION_SIZE.max, slot.h * 0.11),
    );
    const caption = thing.caption
      ? captionLines(thing.caption, slot.w * 0.96, base)
      : null;
    const band = caption ? caption.lines.length * caption.size * LINE + 14 : 0;
    const art = {
      x: slot.x,
      y: captionOnTop ? slot.y + band : slot.y,
      w: slot.w,
      h: Math.max(slot.h * 0.3, slot.h - band),
    };
    const aspect = thing.aspect > 0 ? thing.aspect : 1;
    // Room for the labels the stage sets: a band in the room the drawing
    // leaves free when they all fit in one row there, else a column
    // beside it on each side they point from, which the drawing gives up.
    let mode: LabelMode | undefined;
    let side = { left: 0, right: 0 };
    let below = 0;
    let labelSize_: number | undefined;
    if (thing.callouts?.length && thing.viewBox && thing.words) {
      ({
        mode,
        side,
        below,
        size: labelSize_,
      } = passageNotes(
        thing.callouts,
        thing.viewBox,
        thing.words.size,
        art,
        aspect,
        slot,
      ));
    } else if (thing.callouts?.length && thing.viewBox) {
      const free = art.h - Math.min(art.w, art.h * aspect) / aspect;
      const band = bandFor(
        thing.callouts.map((c) => c.text),
        slot,
      );
      if (band && free >= band.h + LABEL.leaderRoom + 12)
        mode = captionOnTop ? 'below' : 'above';
      else {
        mode = 'sides';
        side = gutters(thing.callouts, thing.viewBox, slot);
      }
    }
    const w = Math.min(
      art.w - side.left - side.right,
      (art.h - below) * aspect,
    );
    const h = w / aspect;
    // Sat on its caption, so captions in a row line up and each hugs its
    // picture; in the middle, unless its labels need it moved over.
    const x = Math.min(
      Math.max(art.x + (art.w - w) / 2, art.x + side.left),
      art.x + art.w - side.right - w,
    );
    // Working and passages stand in the middle of their room: nothing
    // beside them needs its caption lined up with theirs.
    const y = captionOnTop
      ? art.y
      : thing.source && thing.source !== 'plot' && thing.source !== 'chart'
        ? art.y + (art.h - h - below) / 2
        : art.y + (art.h - h);
    const place: Place = { x: round(x), y: round(y), w: round(w), h: round(h) };
    if (mode) place.labelsAt = mode;
    if (labelSize_) place.labelSize = labelSize_;
    if (caption)
      place.caption = {
        x: round(slot.x + slot.w * 0.02),
        y: round(captionOnTop ? slot.y : y + h + 14),
        w: round(slot.w * 0.96),
        size: caption.size,
        lines: caption.lines,
      };
    return place;
  }
  if (thing.kind === 'stat') {
    const size = Math.min(
      sizeToFit(thing.value, slot.w * 0.9, 220),
      slot.h * 0.45,
    );
    const caption = captionLines(
      thing.caption,
      slot.w * 0.96,
      Math.min(CAPTION_SIZE.max + 4, slot.h * 0.12),
    );
    const band = caption.lines.length * caption.size * LINE;
    const block = size * 1.1 + 18 + band;
    const top = slot.y + (slot.h - block) / 2;
    // As wide as what it says, so an arrow reaches the words and not the
    // edge of an empty slot.
    const wide = Math.min(
      slot.w,
      Math.max(
        measureText(thing.value, size, 700),
        ...caption.lines.map((l) => measureText(l, caption.size, 600)),
      ) + 24,
    );
    const left = slot.x + (slot.w - wide) / 2;
    return {
      x: round(left),
      y: round(top),
      w: round(wide),
      h: round(size * 1.1),
      size: Math.round(size),
      caption: {
        x: round(left),
        y: round(top + size * 1.1 + 18),
        w: round(wide),
        size: caption.size,
        lines: caption.lines,
      },
    };
  }
  const share = thing.style === 'keyword' ? 0.8 : 0.86;
  const padding = thing.style === 'title' ? 0 : 0.6;
  // The largest size that fits across in two lines, then down if it is too tall.
  let lines = captionLines(
    thing.text,
    slot.w * share,
    thing.style === 'title' ? 120 : thing.style === 'card' ? 64 : 52,
  );
  for (let tries = 0; tries < 3; tries += 1) {
    const tall =
      lines.lines.length * lines.size * LINE + lines.size * padding * 2;
    if (tall <= slot.h) break;
    lines = captionLines(
      thing.text,
      slot.w * share,
      Math.floor((lines.size * slot.h) / tall),
    );
  }
  const textH = lines.lines.length * lines.size * LINE;
  const padX = thing.style === 'title' ? 0 : lines.size * 0.9;
  const padY = lines.size * padding;
  const widest = Math.max(
    ...lines.lines.map((l) => measureText(l, lines.size, 700)),
  );
  const w =
    thing.style === 'card'
      ? Math.min(slot.w, Math.max(slot.w * 0.7, widest + padX * 2))
      : Math.min(slot.w, widest + padX * 2);
  const h =
    thing.style === 'card'
      ? Math.min(slot.h, Math.max(slot.h * 0.55, textH + padY * 2))
      : textH + padY * 2;
  return {
    x: round(slot.x + (slot.w - w) / 2),
    y: round(slot.y + (slot.h - h) / 2),
    w: round(w),
    h: round(h),
    size: lines.size,
    caption: {
      x: round(slot.x + (slot.w - w) / 2),
      y: round(slot.y + (slot.h - h) / 2 + padY),
      w: round(w),
      size: lines.size,
      lines: lines.lines,
    },
  };
}

/** The share of a row a thing wants: a drawing by its proportions, words and numbers by their kind. */
function weightOf(thing: LaidThing | undefined): number {
  if (!thing) return 1;
  if (thing.kind === 'drawing')
    return Math.min(1.8, Math.max(0.6, thing.aspect));
  if (thing.kind === 'stat') return 1.2;
  return thing.style === 'title' ? 1.6 : thing.style === 'card' ? 1 : 0.9;
}

/** The slots a step's things are placed in: the template, a row shared out by what each wants. */
export function slotsOf(
  layout: SceneLayout,
  show: string[],
  things: ReadonlyMap<string, LaidThing>,
  staging: StagingName,
): Rect[] {
  return slotsFor(
    layout,
    show.length,
    staging,
    // A column shares its height: a wide thing needs less of it, and a
    // number or a card never less than its words need.
    show.map((id) => {
      const thing = things.get(id);
      if (layout !== 'stack') return weightOf(thing);
      if (thing?.kind === 'drawing')
        return Math.min(1.5, Math.max(0.5, 1 / (thing.aspect || 1)));
      return thing?.kind === 'stat' ? 0.9 : 0.7;
    }),
  );
}

/** Every thing on the stage at one step, placed. */
export function layoutStep(
  layout: SceneLayout,
  show: string[],
  things: ReadonlyMap<string, LaidThing>,
  staging: StagingName,
): Record<string, Place> {
  const slots = slotsOf(layout, show, things, staging);
  const out: Record<string, Place> = {};
  show.forEach((id, i) => {
    const thing = things.get(id);
    const slot = slots[i];
    if (!thing || !slot) return;
    out[id] = { ...fitInSlot(thing, slot, layout === 'compare'), room: slot };
  });
  return out;
}

/** The most of the stage's height a grown-up stands: a crowd of one is not a giant. */
export const TALLEST_ADULT = 0.7;

/**
 * People (and the animals among them) on the stage together stand as
 * people do. All at one scale, so a child is shorter than a grown-up
 * beside them and no one is drawn bigger for having a wider slot: a
 * line of the template shares one scale, and no one is taller than a
 * grown-up standing at most seven tenths of the stage. Each keeps their
 * feet where their slot's floor is, and in front of a set a single line
 * that floats in the middle of the stage is set down on its floor, the
 * ground the set is painted with. Changes the places in place.
 */
export function standTogether(
  places: Record<string, Place>,
  things: ReadonlyMap<string, LaidThing>,
  show: string[],
  staging: StagingName,
  grounded: boolean,
): void {
  const area = content(staging);
  const cap = (area.h * TALLEST_ADULT) / figureFrame('adult')[3];
  const units = (id: string) => {
    const thing = things.get(id);
    return thing?.kind === 'drawing' ? (thing.stands?.units ?? 0) : 0;
  };
  const standing = show.filter((id) => places[id] && units(id) > 0);
  if (!standing.length) return;
  const round = (n: number) => Math.round(n * 10) / 10;
  const lines = new Map<string, string[]>();
  for (const id of standing) {
    const room = places[id].room ?? places[id];
    const key = `${Math.round(room.y)}:${Math.round(room.h)}`;
    lines.set(key, [...(lines.get(key) ?? []), id]);
  }
  for (const ids of lines.values()) {
    const scale = Math.min(cap, ...ids.map((id) => places[id].h / units(id)));
    for (const id of ids) {
      const at = places[id];
      // The floor they stand on: over their caption, or their slot's foot.
      const floor =
        at.caption && at.caption.y > at.y
          ? at.caption.y - 14
          : at.room
            ? at.room.y + at.room.h
            : at.y + at.h;
      const h = units(id) * scale;
      const w = (h * at.w) / at.h;
      at.x = round(at.x + (at.w - w) / 2);
      at.y = round(floor - h);
      at.w = round(w);
      at.h = round(h);
    }
  }
  if (!grounded) return;
  const rooms = show.flatMap((id) =>
    places[id]?.room ? [places[id].room] : [],
  );
  if (!rooms.length) return;
  const oneLine = rooms.every(
    (room) =>
      Math.abs(room.y - rooms[0].y) < 1 && Math.abs(room.h - rooms[0].h) < 1,
  );
  const drop = area.y + area.h - (rooms[0].y + rooms[0].h);
  if (!oneLine || drop < 1) return;
  for (const id of show) {
    const at = places[id];
    if (!at) continue;
    at.y = round(at.y + drop);
    if (at.room) at.room = { ...at.room, y: round(at.room.y + drop) };
    if (at.caption)
      at.caption = { ...at.caption, y: round(at.caption.y + drop) };
  }
}

/** Whether two rectangles overlap by more than a hair. */
export function overlaps(a: Rect, b: Rect, slack = 0.5): boolean {
  return (
    a.x < b.x + b.w - slack &&
    b.x < a.x + a.w - slack &&
    a.y < b.y + b.h - slack &&
    b.y < a.y + a.h - slack
  );
}

/** The whole of what a place covers: the thing and its caption. */
export function extentOf(place: Place): Rect {
  if (!place.caption) return place;
  const c = place.caption;
  const bottom = c.y + c.lines.length * c.size * LINE;
  const x = Math.min(place.x, c.x);
  const y = Math.min(place.y, c.y);
  return {
    x,
    y,
    w: Math.max(place.x + place.w, c.x + c.w) - x,
    h: Math.max(place.y + place.h, bottom) - y,
  };
}
