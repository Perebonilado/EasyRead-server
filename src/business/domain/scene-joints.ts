/**
 * Whether the parts of a drawn character hold together, measured on
 * maps of their ink: how far a tail is from the body, where the two
 * meet, and how far to move it so they do.
 *
 * Every map of one drawing is rendered at the same size, so a cell in
 * one is the same place in another. Distances are given in the
 * drawing's own units, and how near counts as joined is set in those
 * units too, scaled to the sheet, never in cells: a thin tail on a big
 * sheet must read the same as on a small one.
 */
import type { InkBox, InkMap } from './scene-raster';

export type Point = [number, number];
export type ViewBox = [number, number, number, number];

/** How near a part may be and still be joined, in the drawing's units: two, or half a percent of the sheet's height. */
export const joinedWithin = (viewBox: ViewBox): number =>
  Math.max(2, viewBox[3] * 0.005);

/** One cell's size in the drawing's units, across and down. */
function cellOf(map: InkMap, viewBox: ViewBox): { kx: number; ky: number } {
  return { kx: viewBox[2] / map.cols, ky: viewBox[3] / map.rows };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A cell's centre, in the drawing's units. */
function unitsAt(map: InkMap, viewBox: ViewBox, i: number): Point {
  const { kx, ky } = cellOf(map, viewBox);
  const x = i % map.cols;
  const y = Math.floor(i / map.cols);
  return [
    round1(viewBox[0] + (x + 0.5) * kx),
    round1(viewBox[1] + (y + 0.5) * ky),
  ];
}

/**
 * How far every cell is from the nearest ink, in cells: a chamfer
 * distance in two passes, one step across or down, √2 diagonally.
 * Infinity everywhere when the map has no ink.
 */
export function distanceTo(map: InkMap): Float64Array {
  const { cols: W, rows: H, bits } = map;
  const d = new Float64Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i += 1) if (bits.charCodeAt(i) === 49) d[i] = 0;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - W] + a);
        if (x > 0) v = Math.min(v, d[i - W - 1] + b);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + b);
      }
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y -= 1)
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + a);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + a);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + b);
        if (x > 0) v = Math.min(v, d[i + W - 1] + b);
      }
      d[i] = v;
    }
  return d;
}

/** How a part meets the rest of the figure. */
export interface Relation {
  /** From the part's ink to the nearest of the rest's, in units; 0 when they overlap. */
  gap: number;
  /** How many of the part's cells are within joining distance of the rest. */
  seamCells: number;
  /** Where they meet: the middle of those cells, in units; null when they do not. */
  joint: Point | null;
  /** The part's ink nearest the rest, and the rest's nearest to that, in units. */
  nearestPart: Point | null;
  nearestTrunk: Point | null;
}

/**
 * How `part` meets `trunk`, both maps of the same drawing at the same
 * size. The distance to the trunk can be passed in when several parts
 * are measured against one trunk.
 */
export function relate(
  part: InkMap,
  trunk: InkMap,
  viewBox: ViewBox,
  toTrunk: Float64Array = distanceTo(trunk),
): Relation {
  const { kx, ky } = cellOf(part, viewBox);
  const k = (kx + ky) / 2;
  // The seam: cells of the part within joining distance, and never less
  // than a cell and a half, the width of an antialiased edge.
  const within = Math.max(1.5, joinedWithin(viewBox) / k);
  let min = Infinity;
  let at = -1;
  let seam = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < part.cols * part.rows; i += 1) {
    if (part.bits.charCodeAt(i) !== 49) continue;
    const d = toTrunk[i];
    if (d < min) {
      min = d;
      at = i;
    }
    if (d <= within) {
      seam += 1;
      sx += i % part.cols;
      sy += Math.floor(i / part.cols);
    }
  }
  if (at < 0 || !Number.isFinite(min))
    return {
      gap: Infinity,
      seamCells: 0,
      joint: null,
      nearestPart: null,
      nearestTrunk: null,
    };
  // The trunk's cell nearest the part's nearest: looked for only as far
  // out as the distance says it is.
  const px = at % part.cols;
  const py = Math.floor(at / part.cols);
  const reach = Math.ceil(min) + 1;
  let best = Infinity;
  let near = -1;
  for (
    let y = Math.max(0, py - reach);
    y <= Math.min(trunk.rows - 1, py + reach);
    y += 1
  )
    for (
      let x = Math.max(0, px - reach);
      x <= Math.min(trunk.cols - 1, px + reach);
      x += 1
    ) {
      const i = y * trunk.cols + x;
      if (trunk.bits.charCodeAt(i) !== 49) continue;
      const dd = (x - px) ** 2 + (y - py) ** 2;
      if (dd < best) {
        best = dd;
        near = i;
      }
    }
  const joint: Point | null = seam
    ? [
        round1(viewBox[0] + (sx / seam + 0.5) * kx),
        round1(viewBox[1] + (sy / seam + 0.5) * ky),
      ]
    : null;
  return {
    gap: round1(min * k),
    seamCells: seam,
    joint,
    nearestPart: unitsAt(part, viewBox, at),
    nearestTrunk: near >= 0 ? unitsAt(trunk, viewBox, near) : null,
  };
}

/** Whether a part is joined: near enough, and meeting the rest somewhere. */
export const joined = (relation: Relation, viewBox: ViewBox): boolean =>
  relation.seamCells > 0 && relation.gap <= joinedWithin(viewBox);

/** How many cells of a map are ink. */
export function inkCells(map: InkMap): number {
  let n = 0;
  for (let i = 0; i < map.bits.length; i += 1)
    if (map.bits.charCodeAt(i) === 49) n += 1;
  return n;
}

/** The box round a map's ink, in the drawing's units; null when it has none. */
export function inkBoxOf(map: InkMap, viewBox: ViewBox): InkBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < map.cols * map.rows; i += 1) {
    if (map.bits.charCodeAt(i) !== 49) continue;
    const x = i % map.cols;
    const y = Math.floor(i / map.cols);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const { kx, ky } = cellOf(map, viewBox);
  return {
    x: round1(viewBox[0] + x0 * kx),
    y: round1(viewBox[1] + y0 * ky),
    width: round1((x1 - x0 + 1) * kx),
    height: round1((y1 - y0 + 1) * ky),
  };
}

/**
 * How far to move a part that floats so it overlaps the rest a little:
 * from its nearest ink toward the rest's, the gap and then some, a
 * little more for a thick part than a thin one. Null when there is no
 * way to say.
 */
export function mendVector(relation: Relation, partBox: InkBox): Point | null {
  const { nearestPart: from, nearestTrunk: to, gap } = relation;
  if (!from || !to || !Number.isFinite(gap)) return null;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!length) return [0, 0];
  const overlap = Math.min(
    20,
    Math.max(6, 0.12 * Math.min(partBox.width, partBox.height)),
  );
  const move = gap + overlap;
  return [round1((dx / length) * move), round1((dy / length) * move)];
}

/** An SVG transform as a matrix [a b c d e f]. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` then `n`: n applied in m's space, as nested groups apply. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

/** The matrix undone; null when it flattens everything. */
export function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det || !Number.isFinite(det)) return null;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}

export const apply = (m: Matrix, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/**
 * A transform attribute read as a matrix: translate, scale, rotate (about
 * a point too), skewX, skewY and matrix, in order. Null when it cannot
 * be read, so nothing is placed by a guess.
 */
export function parseTransform(value: string | undefined): Matrix | null {
  if (!value?.trim()) return IDENTITY;
  let out = IDENTITY;
  const calls = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let read = 0;
  for (let call = calls.exec(value); call; call = calls.exec(value)) {
    if (value.slice(read, call.index).replace(/[\s,]/g, '')) return null;
    read = call.index + call[0].length;
    const n = (call[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (!n.every(Number.isFinite)) return null;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    let m: Matrix;
    switch (call[1]) {
      case 'matrix':
        if (n.length !== 6) return null;
        m = n as Matrix;
        break;
      case 'translate':
        m = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale':
        m = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [deg = 0, cx = 0, cy = 0] = n;
        const cos = Math.cos(rad(deg));
        const sin = Math.sin(rad(deg));
        m = multiply(
          multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
          [1, 0, 0, 1, -cx, -cy],
        );
        break;
      }
      case 'skewX':
        m = [1, 0, Math.tan(rad(n[0] ?? 0)), 1, 0, 0];
        break;
      case 'skewY':
        m = [1, Math.tan(rad(n[0] ?? 0)), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    out = multiply(out, m);
  }
  if (value.slice(read).replace(/[\s,]/g, '')) return null;
  return out;
}
