/**
 * The animal kit's shapes (scene-animal): smooth closed outlines through a
 * few points, limbs drawn as the kit draws arms (an ink stroke and its
 * colour over it, so a bend shows no seam), and the small sums that put a
 * point where a joint says. Kept apart so every body plan draws with the
 * same hand.
 */
import { FIGURE_INK, KIT_LINE, line } from './scene-ink';

export type P = [number, number];

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const pt = ([x, y]: P) => `${r1(x)},${r1(y)}`;

export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
export const lerp = (a: P, b: P, t: number): P => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const RAD = Math.PI / 180;

/** A point `len` from `at`, `deg` above the horizontal to the right (y is down). */
export const polar = (at: P, len: number, deg: number): P => [
  at[0] + len * Math.cos(deg * RAD),
  at[1] - len * Math.sin(deg * RAD),
];

/** A point turned `deg` about `about`, clockwise on the page, as SVG's rotate turns it. */
export function turn(p: P, about: P, deg: number): P {
  const a = deg * RAD;
  const [x, y] = sub(p, about);
  return [
    about[0] + x * Math.cos(a) - y * Math.sin(a),
    about[1] + x * Math.sin(a) + y * Math.cos(a),
  ];
}

/** Points moved and turned: a shape set where a pose puts it. */
export const moved = (points: P[], by: P, about?: P, deg = 0): P[] =>
  points.map((p) => add(about && deg ? turn(p, about, deg) : p, by));

/**
 * A smooth closed outline through points (a Catmull-Rom spline, as cubic
 * curves): a body, a head, a wing. `tension` below 1 rounds it less.
 */
export function blob(points: P[], tension = 1): string {
  const n = points.length;
  if (n < 3) return '';
  const at = (i: number) => points[(i + n) % n];
  const k = tension / 6;
  const parts = [`M${pt(at(0))}`];
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    parts.push(`C${pt(c1)} ${pt(c2)} ${pt(p2)}`);
  }
  return `${parts.join(' ')} Z`;
}

/** A smooth open curve through points: a tail, a neck's edge. */
export function curve(points: P[], tension = 1): string {
  const n = points.length;
  if (n < 2) return '';
  const at = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  const k = tension / 6;
  const parts = [`M${pt(at(0))}`];
  for (let i = 0; i < n - 1; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    parts.push(`C${pt(c1)} ${pt(c2)} ${pt(p2)}`);
  }
  return parts.join(' ');
}

/** A straight line through points. */
export const poly = (points: P[]) => `M${points.map(pt).join(' L')}`;

/** A shape of points round a middle, by angle (degrees, 0 to the right, up positive) and reach. */
export const around = (at: P, spokes: [number, number][]): P[] =>
  spokes.map(([deg, len]) => polar(at, len, deg));

/** An ellipse's points, `n` of them, turned `deg`: to bend into a blob. */
export function ellipsePoints(
  at: P,
  rx: number,
  ry: number,
  deg = 0,
  n = 8,
): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return turn([at[0] + rx * Math.cos(a), at[1] + ry * Math.sin(a)], at, deg);
  });
}

/**
 * A limb as the kit draws an arm: its outline, a stroke of ink as wide as
 * it and a line either side, then its colour over it. Round at its ends
 * and at every bend, so a knee or an elbow shows no seam.
 */
export const limb = (d: string, colour: string, width: number): string =>
  line(d, FIGURE_INK, r2(width + KIT_LINE * 2)) + line(d, colour, r2(width));

/** Just a limb's outline, or just its colour: a limb drawn in two passes round what goes between. */
export const limbInk = (d: string, width: number): string =>
  line(d, FIGURE_INK, r2(width + KIT_LINE * 2));
export const limbFill = (d: string, colour: string, width: number): string =>
  line(d, colour, r2(width));

/** A shape's attributes: an ellipse, turned about its middle. */
export const ellipse = (
  at: P,
  rx: number,
  ry: number,
  paint: string,
  deg = 0,
): string =>
  `<ellipse cx="${r1(at[0])}" cy="${r1(at[1])}" rx="${r1(rx)}" ry="${r1(ry)}"${deg ? ` transform="rotate(${r1(deg)} ${r1(at[0])} ${r1(at[1])})"` : ''} ${paint}/>`;

export const circle = (at: P, r: number, paint: string): string =>
  `<circle cx="${r1(at[0])}" cy="${r1(at[1])}" r="${r1(r)}" ${paint}/>`;

export const path = (d: string, paint: string): string =>
  `<path d="${d}" ${paint}/>`;

/** A group turned about a point by the rig: its class and its pivot, in the drawing's units. */
export const pivoted = (className: string, at: P, markup: string): string =>
  `<g class="${className}" style="transform-origin:${r1(at[0])}px ${r1(at[1])}px">${markup}</g>`;

/** A group moved, and turned about a point, for a pose: nothing when it does neither. */
export function placed(markup: string, by: P, about?: P, deg = 0): string {
  const parts: string[] = [];
  if (by[0] || by[1]) parts.push(`translate(${r1(by[0])} ${r1(by[1])})`);
  if (about && deg)
    parts.push(`rotate(${r1(deg)} ${r1(about[0])} ${r1(about[1])})`);
  return parts.length
    ? `<g transform="${parts.join(' ')}">${markup}</g>`
    : markup;
}

/**
 * Points along a smooth closed outline, as `blob` draws it: to find how
 * low or how far it really goes, its curves bulging past the points it
 * passes through.
 */
export function blobSamples(points: P[], tension = 1, steps = 8): P[] {
  const n = points.length;
  if (n < 3) return points;
  const at = (i: number) => points[(i + n) % n];
  const k = tension / 6;
  const out: P[] = [];
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([
        w[0] * p1[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * p2[0],
        w[0] * p1[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * p2[1],
      ]);
    }
  }
  return out;
}

/** An SVG transform, as its six numbers: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];
const SAME: Matrix = [1, 0, 0, 1, 0, 0];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, [x, y]: P): P => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** A transform attribute's translates and rotates (all the kit writes), as one matrix. */
function matrixOf(transform: string): Matrix {
  let m = SAME;
  for (const [, name, args] of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = args
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (name === 'translate') m = times(m, [1, 0, 0, 1, n[0], n[1] ?? 0]);
    else if (name === 'rotate') {
      const a = n[0] * RAD;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      const [c, s] = [Math.cos(a), Math.sin(a)];
      m = times(m, [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]);
    } else if (name === 'scale') m = times(m, [n[0], 0, 0, n[1] ?? n[0], 0, 0]);
  }
  return m;
}

/** A path's points: every point its commands name (a curve keeps within its own). */
function pathPoints(d: string): P[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: P[] = [];
  let at: P = [0, 0];
  let command = 'M';
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) {
      command = tokens[i];
      i += 1;
      if (command === 'Z' || command === 'z') continue;
    }
    const take = (k: number) => tokens.slice(i, i + k).map(Number);
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const point = (x: number, y: number): P =>
      relative ? [at[0] + x, at[1] + y] : [x, y];
    if (upper === 'H' || upper === 'V') {
      const [v] = take(1);
      i += 1;
      at =
        upper === 'H'
          ? [relative ? at[0] + v : v, at[1]]
          : [at[0], relative ? at[1] + v : v];
      out.push(at);
    } else if (upper === 'A') {
      const [rx, ry, , , , x, y] = take(7);
      i += 7;
      const end = point(x, y);
      const r = Math.max(rx, ry);
      out.push(at, end, add(end, [r, r]), add(end, [-r, -r]));
      out.push(add(at, [r, r]), add(at, [-r, -r]));
      at = end;
    } else {
      const k = upper === 'C' ? 6 : upper === 'S' || upper === 'Q' ? 4 : 2;
      const n = take(k);
      i += k;
      const pts: P[] = [];
      for (let j = 0; j + 1 < n.length; j += 2) pts.push(point(n[j], n[j + 1]));
      // A curve by points along it, not its handles, which reach past it.
      const from = at;
      const along = (t: number): P => {
        const u = 1 - t;
        if (pts.length === 3) {
          const [c1, c2, end] = pts;
          const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
          return [
            w[0] * from[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * end[0],
            w[0] * from[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * end[1],
          ];
        }
        const [c, end] = pts;
        return [
          u * u * from[0] + 2 * u * t * c[0] + t * t * end[0],
          u * u * from[1] + 2 * u * t * c[1] + t * t * end[1],
        ];
      };
      if (
        (upper === 'C' && pts.length === 3) ||
        (upper === 'Q' && pts.length === 2)
      )
        for (let t = 1; t <= 8; t += 1) out.push(along(t / 8));
      else out.push(...pts);
      if (pts.length) at = pts[pts.length - 1];
      if (upper === 'M') command = relative ? 'l' : 'L';
    }
    if (!tokens.length || i >= tokens.length) break;
  }
  return out;
}

/**
 * Every point a drawing's markup reaches, near enough: each path's points,
 * each circle's and ellipse's edges, each widened by half its line, and
 * moved as its groups move it. What is clipped, and what is only defined,
 * is left out. To find how far a part goes when it turns, or a pose goes.
 */
export function reachOf(markup: string, line = KIT_LINE): P[] {
  const out: P[] = [];
  const stack: { m: Matrix; width: number; skip: boolean }[] = [
    { m: SAME, width: line, skip: false },
  ];
  for (const [tag, closing, name, attrs, ends] of markup.matchAll(
    /<(\/?)([a-zA-Z]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g,
  )) {
    void tag;
    const top = stack[stack.length - 1];
    const group = name === 'g' || name === 'defs' || name === 'clipPath';
    if (closing) {
      if (group && stack.length > 1) stack.pop();
      continue;
    }
    const attr = (key: string) =>
      new RegExp(`(?:^|\\s)${key}="([^"]*)"`).exec(attrs)?.[1];
    const own = attr('transform');
    const m = own ? times(top.m, matrixOf(own)) : top.m;
    const width = Number(attr('stroke-width') ?? top.width);
    const unseen = attr('stroke') === 'none';
    if (group) {
      if (!ends)
        stack.push({
          m,
          width,
          skip: top.skip || name !== 'g' || attr('clip-path') !== undefined,
        });
      continue;
    }
    if (top.skip) continue;
    const pad = unseen ? 0 : width / 2;
    let points: P[] = [];
    if (name === 'path') points = pathPoints(attr('d') ?? '');
    else if (name === 'circle' || name === 'ellipse') {
      const c: P = [Number(attr('cx') ?? 0), Number(attr('cy') ?? 0)];
      const rx = Number(attr('rx') ?? attr('r') ?? 0);
      const ry = Number(attr('ry') ?? attr('r') ?? 0);
      points = ellipsePoints(c, rx, ry, 0, 24);
    } else if (name === 'rect') {
      const [x, y] = [Number(attr('x') ?? 0), Number(attr('y') ?? 0)];
      const [w, h] = [Number(attr('width') ?? 0), Number(attr('height') ?? 0)];
      points = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    }
    for (const p of points)
      for (const q of pad ? ellipsePoints(p, pad, pad, 0, 8) : [p])
        if (Number.isFinite(q[0]) && Number.isFinite(q[1]))
          out.push(apply(m, q));
  }
  return out;
}

/**
 * A shape round a line through points, as wide as `w0` at its start and
 * `w1` at its end, rounded at the end: a trunk, a tail lying on the ground,
 * a neck. Its start is left open-ended, to sit inside what it grows from.
 */
export function tapered(points: P[], w0: number, w1: number): string {
  const n = points.length;
  if (n < 2) return '';
  const side = (i: number, sign: number): P => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const normal: P = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const w = w0 + ((w1 - w0) * i) / (n - 1);
    return add(points[i], mul(normal, (sign * w) / 2));
  };
  const last = points[n - 1];
  const before = points[n - 2];
  const len = Math.hypot(last[0] - before[0], last[1] - before[1]) || 1;
  const cap = add(last, mul(sub(last, before), (w1 * 0.55) / len));
  const left = points.map((_, i) => side(i, 1));
  const right = points.map((_, i) => side(i, -1)).reverse();
  return blob([...left, cap, ...right], 0.9);
}
