/**
 * Every word on the stage set by code, where nothing can overlap it.
 *
 * A drawing's labels, lifted out of the drawing (scene-callouts), are set
 * beside it the way a textbook figure labels its parts: in a column on the
 * side each points from, sorted by where they point so no two leaders
 * cross, packed so no two touch, and kept off the arrows that run past.
 * An arrow's own label, its pill, goes on the arrow where it touches
 * nothing. The audit then checks each step as the learner will see it:
 * no words on words, on another thing's ink, on an arrow, or off the
 * stage. What the layout cannot promise by construction, the audit says.
 */
import { measureText } from './scene-font';
import type { Place, Rect } from './scene-layout';

export type Point = [number, number];
export type Segment = [Point, Point];

/** A label as the stage sets it at one step: its words, their box, and its leader. */
export interface LabelPlace {
  part: string;
  lines: string[];
  size: number;
  /** The words' box, in stage units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which edge the words hang from: the drawing's side of a column, or the middle in a band. */
  align: 'start' | 'middle' | 'end';
  /** From the words to the point on the part, or null when they sit on it. */
  leader: [number, number, number, number] | null;
}

/** An arrow's label: where along the arrow, which side, and its box's size. */
export interface PillPlace {
  /** How far along the arrow, 0 at its tail to 1 at its head. */
  t: number;
  /** Which side of the arrow: 1 above or right of it, -1 below or left. */
  side: 1 | -1;
  w: number;
  h: number;
  size: number;
}

export const LABEL = {
  min: 22,
  max: 34,
  /** Of the room's height. */
  share: 0.045,
  /** Between two labels in a column. */
  gap: 10,
  /** Between the drawing and its column, where the leaders run. */
  leaderRoom: 22,
  line: 1.2,
  /** The most of a room's width one column may take; a narrow room lets it take more. */
  column: 0.26,
  columnNarrow: 0.34,
} as const;

/** Where a drawing's labels go: in a band above or below it, when all fit in one row and there is room; else in columns beside it. */
export type LabelMode = 'above' | 'below' | 'sides';

/** The share of a room's width one column may take. */
const columnShare = (room: Rect) =>
  room.w < 700 ? LABEL.columnNarrow : LABEL.column;

/** An arrow's label, as the player sets it: its size and the room around its words. */
export const PILL = { size: 26, padX: 30, heightEm: 1.7, offset: 12 } as const;
/** How far short of the things it joins an arrow stops: at its tail and at its head. */
export const ARROW_GAP = { tail: 16, head: 26 } as const;

const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n));

/** The size labels are set at in a room: in proportion, within the bounds. */
export function labelSize(room: Rect): number {
  return Math.round(clamp(room.h * LABEL.share, LABEL.min, LABEL.max));
}

/** A label broken into at most two lines inside a width, smaller if it must be. */
export function labelLines(
  text: string,
  width: number,
  size: number,
): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let s = size; s >= LABEL.min; s -= 2) {
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
  // Still too long: two lines at the smallest, each cut short to fit.
  const s = LABEL.min;
  const cut = (text: string, ellipsis: boolean) => {
    if (measureText(text, s, 600) <= width && !ellipsis) return text;
    let kept = text;
    while (kept.length > 1 && measureText(`${kept}…`, s, 600) > width)
      kept = kept.slice(0, -1);
    return `${kept.trimEnd()}…`;
  };
  const first: string[] = [];
  const rest = [...words];
  while (
    rest.length &&
    measureText([...first, rest[0]].join(' '), s, 600) <= width
  )
    first.push(rest.shift()!);
  const lines = first.length
    ? [first.join(' '), ...(rest.length ? [cut(rest.join(' '), true)] : [])]
    : [cut(words.join(' '), true)];
  return { lines: lines.slice(0, 2), size: s };
}

/** How wide a label is set, broken to fit a width. */
export function labelWidth(text: string, width: number, size: number): number {
  const set = labelLines(text, width, size);
  return Math.max(...set.lines.map((l) => measureText(l, set.size, 600)));
}

/**
 * Which side of the drawing each label is set on: the side it points
 * from, then evened out so one side does not carry far more than the
 * other, moving those that point nearest the middle.
 */
export function sidesOf(
  callouts: { anchor: Point }[],
  viewBox: [number, number, number, number],
): ('left' | 'right')[] {
  const middle = viewBox[0] + viewBox[2] / 2;
  const sides = callouts.map((c) =>
    c.anchor[0] < middle ? ('left' as const) : ('right' as const),
  );
  const count = (side: 'left' | 'right') =>
    sides.filter((s) => s === side).length;
  for (;;) {
    const [heavy, light] =
      count('left') > count('right')
        ? (['left', 'right'] as const)
        : (['right', 'left'] as const);
    if (count(heavy) - count(light) <= 2) break;
    // The one pointing nearest the middle crosses over.
    let best = -1;
    sides.forEach((side, i) => {
      if (side !== heavy) return;
      if (
        best < 0 ||
        Math.abs(callouts[i].anchor[0] - middle) <
          Math.abs(callouts[best].anchor[0] - middle)
      )
        best = i;
    });
    sides[best] = light;
  }
  return sides;
}

/**
 * The room a drawing's labels need on each side of it in a room: the
 * widest label on that side, set to fit a column, and the leaders' run.
 */
export function gutters(
  callouts: { text: string; anchor: Point }[],
  viewBox: [number, number, number, number],
  room: Rect,
): { left: number; right: number } {
  const size = labelSize(room);
  const most = room.w * columnShare(room);
  const sides = sidesOf(callouts, viewBox);
  const want = (side: 'left' | 'right') => {
    const texts = callouts
      .filter((_, i) => sides[i] === side)
      .map((c) => c.text);
    if (!texts.length) return 0;
    const widest = Math.max(
      ...texts.map((t) => labelWidth(t, most - LABEL.leaderRoom, size)),
    );
    // A little over, so rounding a place to a tenth never breaks a label that fit.
    return Math.min(most, widest + LABEL.leaderRoom + 4);
  };
  return { left: want('left'), right: want('right') };
}

/**
 * A drawing's labels set in one row, if they fit across the room: each on
 * one line, or failing that on two, at the room's label size. Null when
 * they do not fit in one row.
 */
export function bandFor(
  texts: string[],
  room: Rect,
): { lines: string[][]; widths: number[]; size: number; h: number } | null {
  if (!texts.length) return null;
  const size = labelSize(room);
  const gaps = LABEL.gap * 2 * (texts.length - 1);
  const whole = (text: string) => text.trim().split(/\s+/).join(' ');
  for (const width of [room.w, room.w / texts.length - LABEL.gap * 2]) {
    const set = texts.map((text) =>
      labelLines(text, Math.max(40, width), size),
    );
    // Nothing cut short, and nothing set smaller than the room's size.
    if (
      set.some(
        (one, i) =>
          one.size !== size || one.lines.join(' ') !== whole(texts[i]),
      )
    )
      continue;
    const widths = set.map((one) =>
      Math.max(...one.lines.map((l) => measureText(l, size, 600))),
    );
    if (widths.reduce((sum, w) => sum + w, 0) + gaps > room.w) continue;
    const h = Math.max(
      ...set.map((one) => one.lines.length * size * LABEL.line),
    );
    return { lines: set.map((one) => one.lines), widths, size, h };
  }
  return null;
}

/** Where a line from a box's middle toward a point leaves the box, a gap short of it: the player's arrow ends. */
export function edgeToward(p: Rect, toward: Point, gap: number): Point {
  const c: Point = [p.x + p.w / 2, p.y + p.h / 2];
  const dx = toward[0] - c[0];
  const dy = toward[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx ? p.w / 2 / Math.abs(dx) : Infinity;
  const ty = dy ? p.h / 2 / Math.abs(dy) : Infinity;
  const k = Math.min(tx, ty);
  return [c[0] + dx * k + (dx / len) * gap, c[1] + dy * k + (dy / len) * gap];
}

/**
 * An arrow as the player draws it between two things: straight, or on a
 * ring bowed outward from the stage's middle; as points along it.
 */
export function arrowPath(
  from: Rect,
  to: Rect,
  curved: boolean,
  stage: { w: number; h: number },
  samples = 12,
): Point[] {
  const cf: Point = [from.x + from.w / 2, from.y + from.h / 2];
  const ct: Point = [to.x + to.w / 2, to.y + to.h / 2];
  const a = edgeToward(from, ct, ARROW_GAP.tail);
  const b = edgeToward(to, cf, ARROW_GAP.head);
  if (!curved) return [a, b];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  const out =
    (mid[0] - stage.w / 2) * nx + (mid[1] - stage.h / 2) * ny > 0 ? 1 : -1;
  const bow = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22 * out;
  const c: Point = [mid[0] + (nx / len) * bow, mid[1] + (ny / len) * bow];
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return [
      (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
      (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
    ] as Point;
  });
}

/**
 * A point on a path at parameter `t`, and the path's direction there. The
 * path is sampled evenly in its own parameter (a line's two ends, or a
 * curve's samples), so this is the player's t on the same arrow.
 */
export function along(path: Point[], t: number): { at: Point; dir: Point } {
  if (path.length < 2) return { at: path[0] ?? [0, 0], dir: [1, 0] };
  const index = clamp(t, 0, 1) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(index));
  const f = index - i;
  const [a, b] = [path[i], path[i + 1]];
  return {
    at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    dir: [b[0] - a[0], b[1] - a[1]],
  };
}

/**
 * The side of an arrow a pill is set on, as a unit vector: above an arrow
 * that runs across, to the right of one that runs down. The player uses
 * the same rule, so side 1 means the same on both.
 */
export function normalOf(dir: Point): Point {
  const len = Math.hypot(dir[0], dir[1]) || 1;
  let n: Point = [-dir[1] / len, dir[0] / len];
  if (Math.abs(dir[0]) >= Math.abs(dir[1])) {
    if (n[1] > 0) n = [-n[0], -n[1]];
  } else if (n[0] < 0) n = [-n[0], -n[1]];
  return n;
}

/** A pill's box on its arrow. */
export function pillBox(path: Point[], pill: PillPlace): Rect {
  const { at, dir } = along(path, pill.t);
  const n = normalOf(dir);
  const reach =
    Math.abs(n[0]) * (pill.w / 2) + Math.abs(n[1]) * (pill.h / 2) + PILL.offset;
  const cx = at[0] + n[0] * pill.side * reach;
  const cy = at[1] + n[1] * pill.side * reach;
  return { x: cx - pill.w / 2, y: cy - pill.h / 2, w: pill.w, h: pill.h };
}

export const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Whether a line segment passes through a box, which is grown by `pad` first. */
export function crosses(segment: Segment, box: Rect, pad = 0): boolean {
  const [[x1, y1], [x2, y2]] = segment;
  const b = {
    x: box.x - pad,
    y: box.y - pad,
    w: box.w + pad * 2,
    h: box.h + pad * 2,
  };
  // Liang–Barsky clipping of the segment to the box.
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const [p, q] of [
    [-dx, x1 - b.x],
    [dx, b.x + b.w - x1],
    [-dy, y1 - b.y],
    [dy, b.y + b.h - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

export const segmentsOf = (path: Point[]): Segment[] =>
  path.slice(1).map((p, i) => [path[i], p] as Segment);

/**
 * An arrow's label placed on its arrow where it touches nothing: the
 * middle first, then either side of it, then nearer the ends; the least
 * crowded when nowhere is clear.
 */
export function placePill(input: {
  label: string;
  path: Point[];
  avoid: { boxes: Rect[]; segments: Segment[] };
  stage: { w: number; h: number };
}): PillPlace | null {
  const w = Math.max(60, measureText(input.label, PILL.size, 600) + PILL.padX);
  const h = PILL.size * PILL.heightEm;
  let best: { pill: PillPlace; cost: number } | null = null;
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7])
    for (const side of [1, -1] as const) {
      const pill: PillPlace = { t, side, w, h, size: PILL.size };
      const box = pillBox(input.path, pill);
      let cost = 0;
      for (const other of input.avoid.boxes) cost += overlapArea(box, other);
      for (const segment of input.avoid.segments)
        if (crosses(segment, box, 4)) cost += w * h * 0.5;
      const off =
        Math.max(0, -box.x) +
        Math.max(0, -box.y) +
        Math.max(0, box.x + box.w - input.stage.w) +
        Math.max(0, box.y + box.h - input.stage.h);
      cost += off * h * 4;
      // Nearer the middle is better, all else equal.
      cost += Math.abs(t - 0.5) * 2;
      if (!best || cost < best.cost) best = { pill, cost };
      if (cost < 1) return pill;
    }
  // Nowhere clear on an arrow too short for it: better no label than one
  // on top of something.
  return best && best.cost < w * h * 0.05 ? best.pill : null;
}

/**
 * A drawing's labels set beside it at one step: each column packed down
 * from where its labels point, around whatever crosses it, then pulled
 * back up if it runs out of room.
 */
export function placeLabels(input: {
  /** The drawing's box. */
  place: Place;
  /** The room it has on the stage: its slot. */
  room: Rect;
  viewBox: [number, number, number, number];
  callouts: { part: string; text: string; anchor: Point }[];
  avoid: { boxes: Rect[]; segments: Segment[] };
}): LabelPlace[] {
  const { place, room, viewBox, callouts } = input;
  if (!callouts.length) return [];
  const s = place.w / viewBox[2];
  const onStage = (p: Point): Point => [
    place.x + (p[0] - viewBox[0]) * s,
    place.y + (p[1] - viewBox[1]) * s,
  ];
  if (place.labelsAt === 'above' || place.labelsAt === 'below') {
    const band = placeBand({ ...input, onStage, where: place.labelsAt });
    if (band) return band;
  }
  const sides = sidesOf(callouts, viewBox);
  const size = labelSize(room);
  // Each side's column: from a leader's run beside the drawing out to the
  // room's edge, and no wider than a column may be.
  const inner = {
    left: place.x - LABEL.leaderRoom,
    right: place.x + place.w + LABEL.leaderRoom,
  };
  const room_ = {
    left: Math.min(room.w * columnShare(room), inner.left - room.x),
    right: Math.min(room.w * columnShare(room), room.x + room.w - inner.right),
  };
  // A side with no room for words sends its labels to the other side.
  for (const [side, other] of [
    ['left', 'right'],
    ['right', 'left'],
  ] as const)
    if (room_[side] < 40 && room_[other] >= 40)
      sides.forEach((one, i) => {
        if (one === side) sides[i] = other;
      });
  // The column runs from the room's top to its caption.
  const caption = place.caption;
  const captionBelow = caption && caption.y >= place.y + place.h - 1;
  const top =
    caption && !captionBelow
      ? caption.y + caption.lines.length * caption.size * LABEL.line + 8
      : room.y;
  const bottom = captionBelow ? caption.y - 8 : room.y + room.h;
  const out: LabelPlace[] = [];
  for (const side of ['left', 'right'] as const) {
    const mine = callouts
      .map((c, i) => ({ ...c, at: onStage(c.anchor), i }))
      .filter((c) => sides[c.i] === side)
      .sort((a, b) => a.at[1] - b.at[1]);
    if (!mine.length) continue;
    const edge_ = inner[side];
    const width = Math.max(40, room_[side]);
    const x0 = side === 'left' ? edge_ - width : edge_;
    // What crosses the column, as bands it cannot use.
    const column = { x: x0, y: top, w: width, h: bottom - top };
    const blocked: [number, number][] = [];
    for (const segment of input.avoid.segments) {
      if (!crosses(segment, column)) continue;
      const ys = clippedYs(segment, column);
      if (ys) blocked.push([ys[0] - 10, ys[1] + 10]);
    }
    for (const box of input.avoid.boxes)
      if (box.x < x0 + width && box.x + box.w > x0)
        blocked.push([box.y - 6, box.y + box.h + 6]);
    blocked.sort((a, b) => a[0] - b[0]);
    const set = mine.map((c) => {
      const lines = labelLines(c.text, width, size);
      return { c, lines, h: lines.lines.length * lines.size * LABEL.line };
    });
    // Down from where each points, clear of the last and of the bands.
    const clearOf = (y: number, h: number, down: boolean) => {
      for (let tries = 0; tries < blocked.length + 1; tries += 1) {
        const band = blocked.find(([b0, b1]) => y < b1 && y + h > b0);
        if (!band) return y;
        y = down ? band[1] : band[0] - h;
      }
      return y;
    };
    let cursor = top;
    const tops = set.map(({ c, h }) => {
      const y = clearOf(Math.max(cursor, c.at[1] - h / 2), h, true);
      cursor = y + h + LABEL.gap;
      return y;
    });
    // Run out of room at the bottom: back up, from the last.
    let limit = bottom;
    for (let i = set.length - 1; i >= 0; i -= 1) {
      if (tops[i] + set[i].h > limit)
        tops[i] = clearOf(limit - set[i].h, set[i].h, false);
      limit = tops[i] - LABEL.gap;
    }
    set.forEach(({ c, lines, h }, i) => {
      const w = Math.max(
        ...lines.lines.map((l) => measureText(l, lines.size, 600)),
      );
      const x = side === 'left' ? edge_ - w : edge_;
      const y = Math.max(top, tops[i]);
      const edge: Point = [side === 'left' ? edge_ + 6 : edge_ - 6, y + h / 2];
      out.push({
        part: c.part,
        lines: lines.lines,
        size: lines.size,
        x: round(x),
        y: round(y),
        w: round(w),
        h: round(h),
        align: side === 'left' ? 'end' : 'start',
        leader: [
          round(edge[0]),
          round(edge[1]),
          round(c.at[0]),
          round(c.at[1]),
        ],
      });
    });
  }
  return out;
}

/**
 * A drawing's labels in one row in the room it leaves free above it (or
 * below, under a caption set on top): each as near over its part as the
 * row allows, packed along the row around whatever crosses it, with its
 * leader straight down to the part. Null when the row will not hold them.
 */
function placeBand(input: {
  place: Place;
  room: Rect;
  callouts: { part: string; text: string; anchor: Point }[];
  avoid: { boxes: Rect[]; segments: Segment[] };
  onStage: (p: Point) => Point;
  where: 'above' | 'below';
}): LabelPlace[] | null {
  const { place, room, callouts } = input;
  const set = bandFor(
    callouts.map((c) => c.text),
    room,
  );
  if (!set) return null;
  const top =
    input.where === 'above'
      ? place.y - LABEL.leaderRoom - set.h
      : place.y + place.h + LABEL.leaderRoom;
  if (top < room.y - 1 || top + set.h > room.y + room.h + 1) return null;
  const band = { x: room.x, y: top, w: room.w, h: set.h };
  // What crosses the band, as stretches of it that cannot be used.
  const blocked: [number, number][] = [];
  for (const segment of input.avoid.segments) {
    if (!crosses(segment, band)) continue;
    const xs = clippedXs(segment, band);
    if (xs) blocked.push([xs[0] - 10, xs[1] + 10]);
  }
  for (const box of input.avoid.boxes)
    if (box.y < band.y + band.h && box.y + box.h > band.y)
      blocked.push([box.x - 6, box.x + box.w + 6]);
  const clearOf = (x: number, w: number, right: boolean) => {
    for (let tries = 0; tries <= blocked.length; tries += 1) {
      const hit = blocked.find(([a, b]) => x < b && x + w > a);
      if (!hit) return x;
      x = right ? hit[1] : hit[0] - w;
    }
    return x;
  };
  const order = callouts
    .map((c, i) => ({ c, i, at: input.onStage(c.anchor) }))
    .sort((a, b) => a.at[0] - b.at[0]);
  // Along the row from the left, each as near over its part as it can be.
  let cursor = room.x;
  const lefts = order.map(({ i, at }) => {
    const w = set.widths[i];
    const x = clearOf(
      Math.max(cursor, Math.min(at[0] - w / 2, room.x + room.w - w)),
      w,
      true,
    );
    cursor = x + w + LABEL.gap * 2;
    return x;
  });
  // Off the right edge: back along the row from the right.
  let limit = room.x + room.w;
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const w = set.widths[order[k].i];
    if (lefts[k] + w > limit) lefts[k] = clearOf(limit - w, w, false);
    limit = lefts[k] - LABEL.gap * 2;
  }
  if (
    lefts.some(
      (x, k) =>
        x < room.x - 1 || x + set.widths[order[k].i] > room.x + room.w + 1,
    )
  )
    return null;
  return order.map(({ c, i, at }, k) => {
    const w = set.widths[i];
    const h = set.lines[i].length * set.size * LABEL.line;
    const x = lefts[k];
    const y = input.where === 'above' ? top + set.h - h : top;
    const from: Point = [
      x + w / 2,
      input.where === 'above' ? y + h + 4 : y - 4,
    ];
    return {
      part: c.part,
      lines: set.lines[i],
      size: set.size,
      x: round(x),
      y: round(y),
      w: round(w),
      h: round(h),
      align: 'middle' as const,
      leader: [round(from[0]), round(from[1]), round(at[0]), round(at[1])],
    };
  });
}

/** The widths a segment spans inside a box's rows. */
function clippedXs(segment: Segment, box: Rect): [number, number] | null {
  const [[x1, y1], [x2, y2]] = segment;
  const at = (y: number) =>
    y2 === y1 ? null : x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
  const ys = [
    Math.max(Math.min(y1, y2), box.y),
    Math.min(Math.max(y1, y2), box.y + box.h),
  ];
  if (ys[0] > ys[1]) return null;
  const xs = y2 === y1 ? [x1, x2] : ys.map((y) => at(y)!);
  return [Math.min(...xs), Math.max(...xs)];
}

/** The heights a segment spans inside a box's columns. */
function clippedYs(segment: Segment, box: Rect): [number, number] | null {
  const [[x1, y1], [x2, y2]] = segment;
  const at = (x: number) =>
    x2 === x1 ? null : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  const xs = [
    Math.max(Math.min(x1, x2), box.x),
    Math.min(Math.max(x1, x2), box.x + box.w),
  ];
  if (xs[0] > xs[1]) return null;
  const ys = x2 === x1 ? [y1, y2] : xs.map((x) => at(x)!);
  return [Math.min(...ys), Math.max(...ys)];
}

const round = (n: number) => Math.round(n * 10) / 10;

// ── The audit ──────────────────────────────────────────────────────────────

/** Words on the stage at one step, with whose they are. */
export interface Words {
  owner: string;
  what: string;
  box: Rect;
}

/** Where a drawing has ink on the stage at one step: its cells, as boxes. */
export interface Ink {
  owner: string;
  boxes: Rect[];
}

export interface Collision {
  kind: 'words-words' | 'words-ink' | 'words-arrow' | 'words-off';
  a: string;
  b: string;
}

/**
 * Everything wrong with one step as it will be seen: words on words, words
 * on a drawing's ink (a label on its own drawing's ink included; its
 * leader is not words), words across an arrow they do not belong to, and
 * words off the stage. A hair of overlap is not counted.
 */
export function auditStep(input: {
  words: Words[];
  inks: Ink[];
  arrows: { id: string; segments: Segment[] }[];
  stage: { w: number; h: number };
}): Collision[] {
  const out: Collision[] = [];
  const { words } = input;
  const area = (b: Rect) => b.w * b.h;
  for (let i = 0; i < words.length; i += 1) {
    const a = words[i];
    for (let j = i + 1; j < words.length; j += 1) {
      const b = words[j];
      const shared = overlapArea(a.box, b.box);
      if (shared > Math.min(area(a.box), area(b.box)) * 0.02 && shared > 20)
        out.push({
          kind: 'words-words',
          a: `${a.owner}:${a.what}`,
          b: `${b.owner}:${b.what}`,
        });
    }
    for (const ink of input.inks) {
      // A card or a caption belongs to its thing; a drawing's own labels sit beside its ink.
      if (ink.owner === a.owner && !a.what.startsWith('label')) continue;
      const covered = ink.boxes.reduce(
        (sum, cell) => sum + overlapArea(a.box, cell),
        0,
      );
      if (covered > area(a.box) * 0.06)
        out.push({
          kind: 'words-ink',
          a: `${a.owner}:${a.what}`,
          b: ink.owner,
        });
    }
    for (const arrow of input.arrows) {
      if (a.owner === arrow.id) continue;
      if (arrow.segments.some((s) => crosses(s, a.box, -2)))
        out.push({
          kind: 'words-arrow',
          a: `${a.owner}:${a.what}`,
          b: arrow.id,
        });
    }
    const b = a.box;
    if (
      b.x < -1 ||
      b.y < -1 ||
      b.x + b.w > input.stage.w + 1 ||
      b.y + b.h > input.stage.h + 1
    )
      out.push({ kind: 'words-off', a: `${a.owner}:${a.what}`, b: 'stage' });
  }
  return out;
}
