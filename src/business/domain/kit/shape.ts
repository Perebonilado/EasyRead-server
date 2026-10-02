/**
 * The kit's geometry (explainer-animation-tech §4.2): the few shapes every
 * piece is drawn from, as path data with the box each one covers, so a
 * piece knows its parts' boxes from its own drawing without a renderer.
 *
 * Every shape is closed and drawn with absolute commands only (M, L, C, Z),
 * circles and ellipses as four quarter cubics; a box is the hull of the
 * points and control points, which for these shapes is the shape's own
 * box or a hair larger. Numbers are kept to a tenth of a unit (a
 * millimetre in the kit's units, rig.ts UNITS_PER_METRE).
 *
 * The rim light is drawn here too: a part filled with its colour, a
 * crescent of a lighter one along the edge that faces the light, cut from
 * the part itself by a clip, so the edge is lit whatever is behind it.
 */
import type { ShotBox } from '../../../contracts';

/** A point in a piece's units: x to the right, y down. */
export type Pt = [number, number];

/** A shape: its path data and the box it covers. */
export interface Shape {
  d: string;
  box: ShotBox;
}

/** The cubic Bézier constant for a quarter circle. */
const KAPPA = 0.5522847498;

/** A number as path data keeps it: a tenth of a unit, no trailing zeros. */
export const n1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

const pt = (p: Pt) => `${n1(p[0])} ${n1(p[1])}`;

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const lerp = (a: Pt, b: Pt, u: number): Pt => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
];
export const dist = (a: Pt, b: Pt): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);
/** A unit vector at an angle (radians, screen: 0 to the right, π/2 down). */
export const dir = (angle: number): Pt => [Math.cos(angle), Math.sin(angle)];
/** A point turned about a centre by an angle (radians, clockwise on screen). */
export function turn(p: Pt, about: Pt, angle: number): Pt {
  const [dx, dy] = sub(p, about);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c];
}

/** The box round some points. */
export function boxOf(points: readonly Pt[]): ShotBox {
  if (!points.length) return [0, 0, 0, 0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return round4([x0, y0, x1 - x0, y1 - y0]);
}

/** The box round some boxes. */
export function unionBox(boxes: readonly ShotBox[]): ShotBox {
  const real = boxes.filter((b) => b[2] > 0 || b[3] > 0);
  if (!real.length) return [0, 0, 0, 0];
  return boxOf(
    real.flatMap(([x, y, w, h]): Pt[] => [
      [x, y],
      [x + w, y + h],
    ]),
  );
}

/** A box grown by a margin on every side. */
export const grow = ([x, y, w, h]: ShotBox, m: number): ShotBox =>
  round4([x - m, y - m, w + 2 * m, h + 2 * m]);

const round4 = (box: ShotBox): ShotBox =>
  box.map((v) => Math.round(v * 10) / 10) as ShotBox;

/** The cubic segments of a circular arc, at most a quarter turn each (angles in radians, either way round). */
function arcCubics(c: Pt, r: number, a0: number, a1: number): Pt[][] {
  const turns = Math.max(
    1,
    Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9),
  );
  const step = (a1 - a0) / turns;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Pt[][] = [];
  for (let i = 0; i < turns; i += 1) {
    const s = a0 + step * i;
    const e = s + step;
    const p0 = add(c, scale(dir(s), r));
    const p3 = add(c, scale(dir(e), r));
    const t0: Pt = [-Math.sin(s), Math.cos(s)];
    const t1: Pt = [-Math.sin(e), Math.cos(e)];
    out.push([p0, add(p0, scale(t0, k * r)), sub(p3, scale(t1, k * r)), p3]);
  }
  return out;
}

/** An ellipse, turned by `angle` (radians). */
export function ellipse(c: Pt, rx: number, ry: number, angle = 0): Shape {
  const at = (x: number, y: number): Pt => turn(add(c, [x, y]), c, angle);
  const q = [
    [at(rx, 0), at(rx, KAPPA * ry), at(KAPPA * rx, ry), at(0, ry)],
    [at(0, ry), at(-KAPPA * rx, ry), at(-rx, KAPPA * ry), at(-rx, 0)],
    [at(-rx, 0), at(-rx, -KAPPA * ry), at(-KAPPA * rx, -ry), at(0, -ry)],
    [at(0, -ry), at(KAPPA * rx, -ry), at(rx, -KAPPA * ry), at(rx, 0)],
  ];
  const d = `M${pt(q[0][0])}${q.map((s) => `C${pt(s[1])} ${pt(s[2])} ${pt(s[3])}`).join('')}Z`;
  // The box of a turned ellipse, exactly.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = Math.sqrt(rx * rx * cos * cos + ry * ry * sin * sin);
  const hh = Math.sqrt(rx * rx * sin * sin + ry * ry * cos * cos);
  return { d, box: round4([c[0] - hw, c[1] - hh, 2 * hw, 2 * hh]) };
}

export const circle = (c: Pt, r: number): Shape => ellipse(c, r, r);

/**
 * A capsule from `a` (radius ra) to `b` (radius rb): two round ends joined
 * by the lines that touch both, as a limb is drawn. Its joints are round,
 * so a limb turned at a joint keeps meeting the next one.
 */
export function capsule(a: Pt, ra: number, b: Pt, rb: number): Shape {
  const d = dist(a, b);
  if (d <= Math.abs(ra - rb) + 1e-6)
    return circle(ra >= rb ? a : b, Math.max(ra, rb));
  // The touching lines leave each circle at θ ± α; the far end is rounded
  // through θ (2α of it shows), the near end through θ + π (the rest);
  // drawn clockwise on screen, as every shape of the kit is.
  const theta = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  const a1 = add(a, scale(dir(theta + alpha), ra));
  const a2 = add(a, scale(dir(theta - alpha), ra));
  const b2 = add(b, scale(dir(theta - alpha), rb));
  const endB = arcCubics(b, rb, theta - alpha, theta + alpha);
  const endA = arcCubics(a, ra, theta + alpha, theta - alpha + 2 * Math.PI);
  const cubic = (s: Pt[]) => `C${pt(s[1])} ${pt(s[2])} ${pt(s[3])}`;
  const path = `M${pt(a2)}L${pt(b2)}${endB.map(cubic).join('')}L${pt(a1)}${endA.map(cubic).join('')}Z`;
  return {
    d: path,
    box: unionBox([circle(a, ra).box, circle(b, rb).box]),
  };
}

/**
 * Points in clockwise order on screen (y down), as every shape of the
 * kit is drawn: shapes joined into one path then fill their overlaps
 * instead of cutting holes in each other.
 */
export function clockwise(points: readonly Pt[]): Pt[] {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum < 0 ? [...points].reverse() : [...points];
}

/**
 * A smooth closed shape through points (Catmull–Rom turned into cubics):
 * a torso, a coat, a hull. `tension` 0 is a polygon, 1 the full curve.
 */
export function blob(given: readonly Pt[], tension = 1): Shape {
  const points = clockwise(given);
  const n = points.length;
  if (n < 3) return { d: '', box: boxOf(points) };
  const all: Pt[] = [];
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1 = add(p1, scale(sub(p2, p0), tension / 6));
    const c2 = sub(p2, scale(sub(p3, p1), tension / 6));
    all.push(p1, c1, c2);
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return { d: `${d}Z`, box: boxOf(all) };
}

/**
 * A closed shape through points, each corner rounded by up to `r` (0 for
 * sharp): a placard, a carriage, a container. Corners are quadratic-like
 * cubics, so the shape stays a path of absolute commands.
 */
export function rounded(given: readonly Pt[], r: number): Shape {
  const points = clockwise(given);
  const n = points.length;
  if (n < 3) return { d: '', box: boxOf(points) };
  if (r <= 0)
    return {
      d: `M${points.map(pt).join('L')}Z`,
      box: boxOf(points),
    };
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const p = points[i];
    const next = points[(i + 1) % n];
    const k1 = Math.min(r, dist(prev, p) / 2) / Math.max(1e-6, dist(prev, p));
    const k2 = Math.min(r, dist(p, next) / 2) / Math.max(1e-6, dist(p, next));
    const a = lerp(p, prev, k1);
    const b = lerp(p, next, k2);
    const c1 = lerp(a, p, 0.55);
    const c2 = lerp(b, p, 0.55);
    d += `${i === 0 ? 'M' : 'L'}${pt(a)}C${pt(c1)} ${pt(c2)} ${pt(b)}`;
  }
  return { d: `${d}Z`, box: boxOf(points) };
}

/** A rectangle with round corners (radius r). */
export function rect(x: number, y: number, w: number, h: number, r = 0): Shape {
  return rounded(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    Math.min(r, w / 2, h / 2),
  );
}

/** Several shapes as one: their paths together, their boxes joined. */
export function join(...shapes: readonly Shape[]): Shape {
  const real = shapes.filter((s) => s.d);
  return {
    d: real.map((s) => s.d).join(''),
    box: unionBox(real.map((s) => s.box)),
  };
}

/** A shape's points moved, every coordinate in its path data (for mirroring a whole drawing). */
export function mapShape(shape: Shape, f: (p: Pt) => Pt): Shape {
  const nums = shape.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2)
    pts.push(f([nums[i], nums[i + 1]]));
  let k = 0;
  const d = shape.d.replace(/-?\d+(?:\.\d+)?\s-?\d+(?:\.\d+)?/g, () =>
    pt(pts[k++]),
  );
  return { d, box: boxOf(pts) };
}

// ── Light ─────────────────────────────────────────────────────────────────

/** How a part is lit: its fill, the rim's colour, and how far (in units) the rim reaches in from the edge toward the light. */
export interface Lit {
  fill: string;
  rim: string;
  /** The offset that uncovers the rim: away from the light, as long as the rim is wide. */
  away: Pt;
}

/** The offset that uncovers a rim `width` wide, for light coming from `angle` (radians, the direction the light comes from). */
export const awayFrom = (angle: number, width: number): Pt =>
  scale(dir(angle + Math.PI), width);

/**
 * A part drawn lit: its shape filled, with a crescent of the rim's colour
 * along the edge that faces the light, cut from the shape itself. `id` is
 * the shape's id inside the piece (set-svg makes it unique per mount).
 * With no rim (width 0), the shape alone.
 */
export function litShape(id: string, shape: Shape, lit: Lit): string {
  if (!shape.d) return '';
  if (!lit.away[0] && !lit.away[1])
    return `<path d="${shape.d}" fill="${lit.fill}"/>`;
  return (
    `<defs><path id="${id}" d="${shape.d}"/><clipPath id="${id}-c"><use href="#${id}"/></clipPath></defs>` +
    `<g clip-path="url(#${id}-c)"><use href="#${id}" fill="${lit.rim}"/>` +
    `<use href="#${id}" fill="${lit.fill}" transform="translate(${n1(lit.away[0])} ${n1(lit.away[1])})"/></g>`
  );
}

/**
 * A soft shadow on the ground under a piece: an ellipse that fades from
 * its middle out (a radial gradient, no filter), so it reads on paper,
 * on a map and in a set alike.
 */
export function groundShadow(
  id: string,
  centre: Pt,
  rx: number,
  ry: number,
  colour: string,
  opacity: number,
): string {
  if (rx <= 0 || ry <= 0 || opacity <= 0) return '';
  return (
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${colour}" stop-opacity="${opacity}"/>` +
    `<stop offset="0.6" stop-color="${colour}" stop-opacity="${Math.round(opacity * 45) / 100}"/>` +
    `<stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="${n1(centre[0])}" cy="${n1(centre[1])}" rx="${n1(rx)}" ry="${n1(ry)}" fill="url(#${id})"/>`
  );
}
