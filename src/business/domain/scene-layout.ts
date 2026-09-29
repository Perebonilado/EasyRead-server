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
  /** A Studio story's person: how far back they stand on the floor, 0 its back to 1 its front. */
  d?: number;
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
      /**
       * Someone who stands with people: its frame's height in the figure
       * kit's units; for one the kit draws, how high their hips are from
       * the ground once sat down, and how long they are head to foot, in
       * those units, so they sit on a seat and lie along a bed.
       */
      stands?: { units: number; seated?: number; length?: number };
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

// ── A Studio scene's stations ─────────────────────────────────────────────

/** Where the five spots stand across the stage, as shares of its width. */
export const STATION_SHARES = {
  left: 0.12,
  'centre-left': 0.31,
  centre: 0.5,
  'centre-right': 0.69,
  right: 0.88,
} as const;
export type StationShares = Record<keyof typeof STATION_SHARES, number>;

/**
 * The five spots for a scene whose largest group is `largest`: the two
 * either side of the middle as far out as a row of that many stands, so
 * two people talking stand as far apart as they always have, and four
 * still stand clear of each other.
 */
export function stationShares(largest: number): StationShares {
  const out = largest <= 2 ? 0.244 : largest === 3 ? 0.21 : 0.19;
  return {
    ...STATION_SHARES,
    'centre-left': 0.5 - out,
    'centre-right': 0.5 + out,
  };
}

/** How big a thing at the back of a set is drawn beside the people, and how far back it stands. */
export const BACK_DEPTH = 0.55;

/**
 * The floor's depth (studio-scenery-plan §4): d 0 is its back, just in
 * front of the stage's row; 1 its front edge, near the camera; 0.5 where
 * people have always stood. How big someone is at each, beside the
 * people at 0.5: the pinhole's own scale, as the set's feet go down it.
 */
export const FLOOR_BACK_K = 0.7;
export const FLOOR_FRONT_K = 1.15;
/** Depth words (§4.1): "in front" and "near the camera"; "at the back", "far off", "across the yard"; and otherwise. */
export const DEPTH_FRONT = 0.85;
export const DEPTH_BACK = 0.15;
export const DEPTH_MIDDLE = 0.5;

/** The depth someone as big as `k` beside the people at 0.5 stands at, held to the floor. */
export function depthOfK(k: number): number {
  const d =
    k <= 1
      ? ((k - FLOOR_BACK_K) / (1 - FLOOR_BACK_K)) * 0.5
      : 0.5 + ((k - 1) / (FLOOR_FRONT_K - 1)) * 0.5;
  return Math.round(Math.min(1, Math.max(0, d)) * 100) / 100;
}

/**
 * The floor of a stage at depth d: where the feet stand, and how big
 * someone is there beside the people at 0.5 (the set's pinhole,
 * scaleAtFeet: size grows as the feet come down from the eye line). The
 * floor's back-to-front lerp by d, in two stretches either side of
 * `floor`, where people have always stood; `eye` is the camera's eye
 * line, and the front edge is kept above `bottom`.
 */
export function floorAt(
  d: number,
  floor: number,
  eye: number,
  bottom: number,
): { feet: number; k: number } {
  const depth = Math.max(1, floor - eye);
  const front = Math.max(floor, Math.min(bottom, eye + FLOOR_FRONT_K * depth));
  const back = eye + FLOOR_BACK_K * depth;
  const at = Math.min(1, Math.max(0, d));
  const feet =
    at <= 0.5
      ? back + (floor - back) * (at / 0.5)
      : floor + (front - floor) * ((at - 0.5) / 0.5);
  return {
    feet: Math.round(feet * 10) / 10,
    k: Math.round(((feet - eye) / depth) * 1000) / 1000,
  };
}

/**
 * How big someone with their feet at `feet` is beside the people where
 * they have always stood (`floor`), by the set's pinhole about its eye
 * line: floorAt's own k, for feet anywhere on the ground, the floor's
 * back and beyond it too.
 */
export function pinholeK(feet: number, floor: number, eye: number): number {
  return Math.round(((feet - eye) / Math.max(1, floor - eye)) * 1000) / 1000;
}

/**
 * How someone at each place of a group stands in depth when nothing says
 * (studio-scenery-plan §4.1): one or two (a conversation) at the depth
 * people have always stood; three with the middle one a step back; four
 * or more across the floor's depth as well as its width, nearer and
 * farther by turns.
 */
export function spreadDepth(i: number, n: number): number {
  if (n <= 2) return DEPTH_MIDDLE;
  if (n === 3) return i === 1 ? 0.38 : DEPTH_MIDDLE;
  return [0.62, 0.3, 0.58, 0.34, 0.66, 0.28][i % 6];
}

/** The scale a Studio scene's people stand at, and the ground they stand on. */
export interface StationScale {
  /** The stage's units to one of the kit's; null when no one stands with people. */
  unit: number | null;
  floor: number;
  /** The slot someone who does not stand with people is fitted in. */
  slot: Rect;
}

/**
 * The scale a Studio scene's people stand at: as large as its largest
 * group can stand side by side in a row, never larger than a grown-up at
 * seven tenths of the stage, and the same from its first step to its
 * last, so no one grows or shrinks as others come and go.
 */
export function stationScale(
  things: readonly LaidThing[],
  largest: number,
  staging: StagingName,
): StationScale {
  const area = content(staging);
  const [slot] = line(area, Math.max(2, largest));
  const cap = (area.h * TALLEST_ADULT) / figureFrame('adult')[3];
  const units = things.flatMap((thing) =>
    thing.kind === 'drawing' && thing.stands?.units
      ? [fitInSlot(thing, slot).h / thing.stands.units]
      : [],
  );
  return {
    unit: units.length ? Math.min(cap, ...units) : null,
    floor: area.y + area.h,
    slot,
  };
}

/** Where a feature stands across a stage: its middle and its width. */
export interface FeatureAcross {
  x: number;
  w: number;
  /** Its own ground, and how big someone is there beside the people: where one under or behind it stands; and where one up it stands, across and their feet's y. */
  way?: {
    y: number;
    k: number;
    perch?: number;
    upX?: number;
    /** One up it stands in the middle of where things catch (a landing, a rung), not beside it: stairs, a ladder. */
    upMiddle?: boolean;
    /**
     * The ground it stands on, where its feet are: where one beside it,
     * behind it or under it stands. Its way may be above it (a danfo's
     * door sill, a stall's counter), where one goes in, not where one
     * stands. Absent, its way's y.
     */
    ground?: number;
  };
  /** The y of its seat, for one who sits on it. */
  seat?: number;
  /** Where one lies along it: its top's y, its head end and its foot end across, and where one sitting up in it sits across. */
  lies?: { y: number; head: number; foot: number; sits: number };
  /** A body one stands beside, not before (a danfo, a stall, a well, a crate): one by it stands clear of it, at its side. */
  solid?: boolean;
}

/** The kinds of feature one by it stands clear of, at its side: its body is solid to the ground, and wide. */
export const SOLID_BESIDE: ReadonlySet<string> = new Set([
  'vehicle',
  'stall',
  'well',
  'crate',
]);
/** How far one behind a feature stands back of its ground, as a share of the stage's height: behind it, never beside it. */
export const BEHIND_BACK = 0.03;
/** How much of their width either side of someone's middle their body fills: the kit's shoulders and hem. */
export const BODY_HALF = 0.28;

/**
 * How far the player sinks the kit's hips sitting down, as a share of the
 * legs' length: its knees folded as far as a sit folds them (legsOf of
 * 0.72 on the player).
 */
export const SIT_SINKS = 0.474;

/** How high one the kit draws sits from the ground, in its units: their hips, once their legs fold. */
export function seatedHeight(legs: {
  r: [number, number][];
}): number | undefined {
  const [hip, , foot] = legs.r;
  if (!hip || !foot) return undefined;
  const leg = Math.abs(foot[1] - hip[1]);
  return Math.round((-hip[1] - SIT_SINKS * leg) * 10) / 10;
}

/**
 * A station on or in a feature: sitting on it ("on:bench"), sitting up in
 * it under its cover ("in:bed"), or lying along it ("on:sofa:lie",
 * "in:bed:lie"). Null for any other station.
 */
export function restingAt(
  station: string,
): { feature: string; in: boolean; lie: boolean } | null {
  const m = /^(on|in):([^:]+)(?::(lie))?$/.exec(station);
  return m ? { feature: m[2], in: m[1] === 'in', lie: Boolean(m[3]) } : null;
}

/**
 * A Studio scene's people, step by step, each at their station: a spot's
 * own place across the stage, beside a feature ("by:gate:-1", its left),
 * behind one ("behind:tree"), or a point on the ground ("@0.62"). One scale for everyone, all their
 * feet on the ground. Someone keeps exactly where they stand until their
 * station changes, whoever comes or goes; one who comes beside a feature
 * where someone already stands takes its other side. No one comes to
 * stand where someone already is, nor in a gateway or a doorway unless
 * they go by it: the nearest place clear of them instead.
 */
export function layoutStations(input: {
  steps: readonly {
    show: readonly string[];
    at?: Readonly<Record<string, string>>;
    /** How far back each stands where the words or the sheet say (0 back to 1 front); the rest as the stager spreads them. */
    depth?: Readonly<Record<string, number>>;
  }[];
  things: ReadonlyMap<string, LaidThing>;
  staging: StagingName;
  scale: StationScale;
  features: ReadonlyMap<string, FeatureAcross>;
  /** The ways through (a gate, a door) standing on the people's ground, where they stand across it: kept clear of. */
  pieces?: readonly FeatureAcross[];
  /** Where the spots stand, as the scene's largest group has them. */
  shares?: StationShares;
  /** The floor's depth: the camera's eye line on this stage, and how low the floor's front edge may come. Absent, everyone on one line, as before. */
  floor?: { eye: number; bottom: number };
}): Record<string, Place>[] {
  const { w: W, margin } = STAGINGS[input.staging];
  const { unit, floor, slot } = input.scale;
  const depthed = input.floor;
  const round = (n: number) => Math.round(n * 10) / 10;
  /** How one the kit draws sits and lies, in its units. */
  const standsOf = (id: string) => {
    const thing = input.things.get(id);
    return thing?.kind === 'drawing' ? thing.stands : undefined;
  };
  const sizeOf = (id: string): { w: number; h: number } | null => {
    const thing = input.things.get(id);
    if (!thing) return null;
    if (thing.kind === 'drawing' && thing.stands?.units && unit) {
      const h = thing.stands.units * unit;
      return { w: h * (thing.aspect > 0 ? thing.aspect : 1), h };
    }
    const fit = fitInSlot(thing, slot);
    return { w: fit.w, h: fit.h };
  };
  const across = (station: string, w: number, flip = false): number => {
    const shares: Record<string, number> = input.shares ?? STATION_SHARES;
    let x = W / 2;
    const rests = restingAt(station);
    const on = rests ? input.features.get(rests.feature) : undefined;
    if (station in shares) x = shares[station] * W;
    else if (station.startsWith('@')) x = (Number(station.slice(1)) || 0.5) * W;
    else if (rests) {
      // Sitting up in it against its head end; on it, in its middle.
      if (on) x = rests.in && on.lies ? on.lies.sits : on.x;
      return x;
    } else if (/^(?:behind|under|up):/.test(station)) {
      // Behind it, under it or up it: where it stands.
      const feature = input.features.get(station.replace(/^\w+:/, ''));
      if (feature) x = feature.x;
    } else {
      const by = /^by:(.+):(-1|1)$/.exec(station);
      const feature = by ? input.features.get(by[1]) : undefined;
      if (by && feature) {
        const side = Number(by[2]) * (flip ? -1 : 1);
        // At its end: over its edge a little, clear of its middle; by a
        // solid body (a danfo), at its side, their body clear of it.
        const reach = feature.solid
          ? Math.max(
              feature.w * 0.35 + w * 0.2,
              feature.w / 2 + w * (BODY_HALF - 0.02),
            )
          : feature.w * 0.35 + w * 0.2;
        x = feature.x + side * reach;
      }
    }
    return Math.min(W - margin - w * 0.3, Math.max(margin + w * 0.3, x));
  };
  /** Where each one stands now, and by what station, at what depth: kept while it is. */
  const kept = new Map<
    string,
    { station: string; x: number; d?: number; asked?: number }
  >();
  return input.steps.map((step) => {
    const out: Record<string, Place> = {};
    const placed: { id: string; x: number; w: number; low?: boolean }[] = [];
    // Those who stay put first, then whoever moves, around them.
    const order = [...step.show].sort(
      (a, b) =>
        Number(kept.get(a)?.station !== step.at?.[a]) -
        Number(kept.get(b)?.station !== step.at?.[b]),
    );
    order.forEach((id, i) => {
      const size = sizeOf(id);
      if (!size) return;
      const station =
        step.at?.[id] ??
        Object.keys(STATION_SHARES)[
          Math.min(4, Math.round(((i + 0.5) / order.length) * 4))
        ];
      const was = kept.get(id);
      const asked = step.depth?.[id];
      let x: number;
      if (was?.station === station && was.asked === asked) x = was.x;
      else {
        x = across(station, size.w);
        // Going to a feature, or to a thing on the ground, they go there.
        const byOrBehind = /^(?:by:|behind:|under:|up:|on:|in:|@)/.test(
          station,
        );
        // Where someone stands already (behind a feature or under it, at
        // its own depth, no one is in the way), or, at a spot of their
        // own, in a gateway; or before one under a feature, who is seen.
        // On it or in it, it is theirs: no one else is in their way.
        const hidden = /^(?:behind|under|up|on|in):/.test(station);
        const crowded = (at: number) =>
          (!hidden &&
            placed.some(
              (p) =>
                Math.abs(p.x - at) <
                (p.low ? (p.w + size.w) * 0.4 : Math.min(p.w, size.w) * 0.55),
            )) ||
          (!byOrBehind &&
            (input.pieces ?? []).some(
              (p) => Math.abs(p.x - at) < p.w * 0.4 + size.w * 0.2,
            )) ||
          overBody(at);
        // Beside a solid body (a danfo), never over it: held to the stage's
        // edge, its far side may be on it.
        const beside = /^by:([^:]+)/.exec(station)?.[1];
        const body = beside ? input.features.get(beside) : undefined;
        function overBody(at: number): boolean {
          if (!body?.solid) return false;
          const half = size!.w * BODY_HALF;
          return (
            Math.min(at + half, body.x + body.w / 2) -
              Math.max(at - half, body.x - body.w / 2) >
            size!.w * 0.08
          );
        }
        // Beside a feature where someone stands already: its other side.
        if (station.startsWith('by:') && crowded(x)) {
          const other = across(station, size.w, true);
          if (!crowded(other)) x = other;
        }
        // Else the nearest place clear of them all, if there is one.
        if (crowded(x)) {
          const least = margin + size.w * 0.3;
          const most = W - margin - size.w * 0.3;
          const step = Math.max(8, size.w * 0.2);
          for (let d = step; d < W; d += step) {
            const clear = [x - d, x + d].find(
              (at) => at >= least && at <= most && !crowded(at),
            );
            if (clear === undefined) continue;
            x = clear;
            break;
          }
        }
      }
      // Under or behind a feature: on its ground, as big as they are there;
      // up it, where one who climbs it stands, beside where things catch.
      // On a floor with depth, beside one too: at its own depth.
      const at = depthed
        ? /^(?:behind|under|up|on|in|by):([^:]+)/.exec(station)
        : /^(?:behind|under|up|on|in):([^:]+)/.exec(station);
      const feature = at ? input.features.get(at[1]) : undefined;
      const way = feature?.way;
      const up = station.startsWith('up:') && way?.perch !== undefined;
      // Anywhere else, at the depth asked, or kept, or as the stager
      // spreads the group across the floor.
      const d =
        depthed && !way
          ? (asked ??
            (was?.station === station && was.asked === asked
              ? was.d
              : undefined) ??
            spreadDepth(step.show.indexOf(id), step.show.length))
          : undefined;
      const onFloor =
        depthed && d !== undefined
          ? floorAt(d, floor, depthed.eye, depthed.bottom)
          : null;
      kept.set(id, {
        station,
        x,
        ...(d !== undefined ? { d } : {}),
        ...(asked !== undefined ? { asked } : {}),
      });
      const low = Boolean(at) && station.startsWith('under:');
      if (up && way?.upX !== undefined)
        x = way.upX - (way.upMiddle ? 0 : size.w * 0.3);
      // Beside it, behind it or under it: on the ground it stands on (not
      // up at its way, a danfo's sill), behind it a step back of it; on a
      // floor with depth, as big as the floor makes them there, as anyone
      // walking there is.
      const beside = way && !up && /^(?:by|behind|under):/.test(station);
      const ground = beside
        ? (way.ground ?? way.y) -
          (station.startsWith('behind:') && way.ground !== undefined
            ? STAGINGS[input.staging].h * BEHIND_BACK
            : 0)
        : undefined;
      const k =
        ground !== undefined && depthed && way?.ground !== undefined
          ? pinholeK(ground, floor, depthed.eye)
          : (way?.k ?? onFloor?.k ?? 1);
      let feet = up ? way.perch! : (ground ?? way?.y ?? onFloor?.feet ?? floor);
      // On a seat or in a bed: their hips where it is sat on, their legs
      // hanging before it (or under its cover); lying, along it from its
      // foot end, their head at its head.
      const rests = restingAt(station);
      const stands = sizeOf(id) && unit ? standsOf(id) : undefined;
      if (rests && feature && unit) {
        const seatY = rests.in || rests.lie ? feature.lies?.y : feature.seat;
        const top = seatY ?? feature.seat ?? feet;
        if (rests.lie && feature.lies) {
          const long = (stands?.length ?? size.h / unit) * unit * k;
          const way = feature.lies.head < feature.lies.foot ? 1 : -1;
          x =
            feature.lies.head +
            way *
              Math.min(
                long * 0.96,
                Math.abs(feature.lies.foot - feature.lies.head),
              );
          // Lying on their side from their feet: the body's half its
          // width above them, under the cover as far again below.
          feet = top - (rests.in ? 0.04 : 0.14) * size.h * k;
          kept.set(id, { station, x });
        } else {
          const seated = (stands?.seated ?? (size.h / unit) * 0.12) * unit * k;
          feet = Math.min(floor, top + seated);
        }
      }
      placed.push({ id, x, w: size.w * k, ...(low ? { low } : {}) });
      out[id] = {
        x: round(x - (size.w * k) / 2),
        y: round(feet - size.h * k),
        w: round(size.w * k),
        h: round(size.h * k),
        ...(depthed ? { d: d ?? depthOfK(k) } : {}),
      };
    });
    for (const id of [...kept.keys()])
      if (!step.show.includes(id)) kept.delete(id);
    return out;
  });
}

/** A feature as a stage stands it: the box it is drawn in, and where one goes through or by it. */
export interface FeaturePlace extends Rect {
  /** Where its feet stand: the people nearer the camera are drawn over it, those farther off under it. */
  feet: number;
  /** Where someone goes in or out by it, or stands at it: the middle of its way, the ground there, and how big they are there beside the people (less than 1 farther back). */
  way: { x: number; y: number; k: number };
  /** Up in it: where a thing caught up in it rests (a kite in a tree's crown), and how high one who climbs it stands, their feet's y. */
  up: { x: number; y: number; perch: number };
  /** The y of its seat, for one who sits on it. */
  seat?: number;
  /** Where one lies along it: its top's y, its head end and its foot end across, and where one sitting up in it sits. */
  lies?: { y: number; head: number; foot: number; sits: number };
}

/** A show's own feature, drawn by the artist, is sat on at this share of its height: a log, a drum, a rock. */
export const OWN_SEAT = 0.45;

/**
 * Where a feature of a set stands on a stage. A piece the stage draws
 * stands on the people's ground at their scale, at its spot (a vehicle,
 * and anything at the back, farther off: smaller, and higher), or where
 * the painter drew it, as large as it was drawn there. One only painted
 * is where the painter drew it.
 */
export function placeFeature(input: {
  staging: StagingName;
  spot: string;
  /** The stage's own drawing of it: its frame and its way through, in the kit's units. */
  piece?: {
    viewBox: [number, number, number, number];
    opening?: [number, number, number, number];
    perch?: number;
    crown?: [number, number];
    seat?: number;
    lies?: { top: number; head: number; foot: number; sits: number };
  };
  /** One of a show's own, drawn by the artist: sat on at a share of its height. */
  own?: boolean;
  /** Where the painter drew it, on this stage. */
  painted?: Rect | null;
  /** Stands at the back, farther off than the people. */
  back: boolean;
  unit: number;
  floor: number;
  /** The set's horizon on this stage. */
  horizon: number;
  /** Where the spots stand, as the scene's largest group has them. */
  shares?: StationShares;
}): FeaturePlace {
  const { w: W, margin } = STAGINGS[input.staging];
  const round = (n: number) => Math.round(n * 10) / 10;
  const depth = (feet: number) =>
    Math.min(
      1,
      Math.max(0.2, (feet - input.horizon) / (input.floor - input.horizon)),
    );
  const shares: Record<string, number> = input.shares ?? STATION_SHARES;
  const painted = input.painted ?? null;
  if (!input.piece) {
    // Only painted: where it is; else, unseen, at its spot.
    const box = painted ?? {
      x: (shares[input.spot] ?? 0.5) * W - 40,
      y: input.floor - 160,
      w: 80,
      h: 160,
    };
    const feet = box.y + box.h;
    return {
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h),
      feet: round(feet),
      way: {
        x: round(box.x + box.w / 2),
        y: round(feet),
        k: Math.round(depth(feet) * 100) / 100,
      },
      // Up in what is painted: high in its upper part.
      up: {
        x: round(box.x + box.w / 2),
        y: round(box.y + box.h * 0.25),
        perch: round(box.y + box.h * 0.45),
      },
    };
  }
  const [vx, vy, vw, vh] = input.piece.viewBox;
  let u: number;
  let feet: number;
  let middle: number;
  // Painted far smaller than it stands among the people (a tall palm
  // painted small on the horizon): stood at the back, where it was
  // painted across, as big as it is there.
  const painter = painted ? painted.h / Math.max(1, -vy) : 0;
  const small = painted !== null && painter < input.unit * BACK_DEPTH * 0.8;
  if (painted && !small) {
    // As large as the painter drew it, where it was drawn.
    u = painter || input.unit;
    feet = painted.y + painted.h;
    middle = painted.x + painted.w / 2;
  } else if (painted) {
    u = input.unit * BACK_DEPTH;
    feet = input.horizon + BACK_DEPTH * (input.floor - input.horizon);
    middle = painted.x + painted.w / 2;
  } else {
    const k = input.back ? BACK_DEPTH : 1;
    u = input.unit * k;
    feet = input.horizon + k * (input.floor - input.horizon);
    const w = vw * u;
    // Something wide keeps its way through on the stage, and the rest of
    // it runs off the side it stands on.
    middle = Math.min(
      W - margin - w * 0.25,
      Math.max(margin + w * 0.25, (shares[input.spot] ?? 0.5) * W),
    );
  }
  const opening = input.piece.opening;
  const wayX = opening ? (opening[0] + opening[2]) / 2 : 0;
  const wayY = opening ? Math.min(0, opening[3]) : 0;
  // Up in it: its own crown and perch; else high in its upper part.
  const crown = input.piece.crown ?? [vx + vw / 2, vy + vh * 0.25];
  const perch = input.piece.perch ?? -vy * 0.55;
  // Sat on at its seat; one of a show's own at a share of its height.
  const seat = input.piece.seat ?? (input.own ? -vy * OWN_SEAT : undefined);
  const lies = input.piece.lies;
  return {
    x: round(middle + vx * u),
    y: round(feet + vy * u),
    w: round(vw * u),
    h: round(vh * u),
    feet: round(feet),
    way: {
      x: round(middle + wayX * u),
      y: round(feet + wayY * u),
      k: Math.round(Math.min(1, u / input.unit) * 100) / 100,
    },
    up: {
      x: round(middle + crown[0] * u),
      y: round(feet + crown[1] * u),
      perch: round(feet - perch * u),
    },
    ...(seat !== undefined ? { seat: round(feet - seat * u) } : {}),
    ...(lies
      ? {
          lies: {
            y: round(feet - lies.top * u),
            head: round(middle + lies.head * u),
            foot: round(middle + lies.foot * u),
            sits: round(middle + lies.sits * u),
          },
        }
      : {}),
  };
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
