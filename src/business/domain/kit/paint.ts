/**
 * How the kit's things are drawn (WP10: buildings, documents, objects,
 * machines and sets): a piece is built part by part from the few shapes
 * of shape.ts, each part a group of filled paths, in one of the show's
 * two looks (tech §11):
 *
 *  - editorial (the default): flat fills, no outlines; a lit face and a
 *    shaded side, the light from the upper left as on every piece; the
 *    colours of the thing pulled toward the paper, so it sits in the
 *    show's picture beside the map and the charts;
 *  - illustrated: the same shapes with a clean dark outline, and brighter
 *    flat colour (Richard's cartoon reference), the paper's pull lighter.
 *
 * Seeded variety (the same seed draws the same piece every time) uses
 * mulberry32, as the client's motion core and the people's kit do.
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import { type KitPiece, type RigPart, assemble, svgOf, tidy } from './rig';
import {
  type Pt,
  type Shape,
  boxOf,
  n1,
  rect,
  rounded,
  unionBox,
} from './shape';
import {
  type KitStyle,
  colourOf,
  hexOfOklab,
  luminance,
  mixOk,
  oklabOf,
  shadeOk,
} from './style';

// ── Seeded variety ────────────────────────────────────────────────────────

/** A seeded stream of numbers in [0, 1), with the few draws a generator needs. */
export interface Seeded {
  (): number;
  between(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
}

export function seeded(seed: number): Seeded {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Seeded;
  next.between = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (list) => list[Math.floor(next() * list.length) % list.length];
  next.chance = (p) => next() < p;
  return next;
}

/** A string's FNV-1a hash: a seed from words. */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mixed once more (murmur3's finish), so near words ("lights:1", "lights:2") land far apart.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// ── Colour in the look ────────────────────────────────────────────────────

/** A colour made more vivid (chroma raised in OKLab), its lightness kept: the illustrated look's flat colour. */
export function vivid(hex: string, k: number): string {
  const [L, A, B] = oklabOf(hex);
  return hexOfOklab([L, A * (1 + k), B * (1 + k)]);
}

/** A colour lightened toward white by `k` in OKLab, its hue kept. */
export const tint = (hex: string, k: number): string =>
  mixOk(hex, '#ffffff', k);

/**
 * A thing's natural colour as the look shows it: in the editorial look,
 * pulled a little toward the paper (and toward its ink on a dark paper),
 * so a brick wall is the show's brick; in the illustrated look, brighter
 * and less pulled.
 */
export function inLook(style: KitStyle, natural: string): string {
  const dark = luminance(style.paper) < 0.35;
  if (style.look === 'illustrated')
    return vivid(mixOk(natural, style.paper, dark ? 0.08 : 0.06), 0.18);
  return mixOk(natural, style.paper, dark ? 0.16 : 0.2);
}

/**
 * A piece's own colour: a side's (or a hex) when the board gave one, the
 * thing's natural colour otherwise. The ink and the muted ink are not a
 * side: a building given no side keeps its brick.
 */
export function wornColour(
  style: KitStyle,
  given: string | number | undefined,
  natural: string,
): { colour: string; side: boolean } {
  const name = typeof given === 'string' ? given.trim() : '';
  const isSide =
    !!name &&
    (Object.keys(style.sides).some(
      (s) => s.toLowerCase() === name.toLowerCase(),
    ) ||
      /^#[0-9a-f]{3,8}$/i.test(name) ||
      name === 'accent');
  return isSide
    ? { colour: colourOf(style, name), side: true }
    : { colour: inLook(style, natural), side: false };
}

/** The face turned from the light: darker, its hue kept. */
export const shadeOf = (hex: string, k = 0.16): string => shadeOk(hex, k);
/** The face toward the light: lighter. */
export const litOf = (hex: string, k = 0.12): string => tint(hex, k);

// ── Drawing a piece ───────────────────────────────────────────────────────

/** A shape and its fill, and how it is drawn: its own outline weight (the illustrated look), its opacity. */
export type Fill =
  readonly [Shape, string] | readonly [Shape, string, FillOpts];
export interface FillOpts {
  /** Drawn without an outline in the illustrated look (a highlight, a glow, a shadow). */
  bare?: boolean;
  opacity?: number;
}

/**
 * A piece being drawn: its parts in paint order (assemble() nests them as
 * their parents say), each one's box from its own shapes, so a part's box
 * is known without a renderer.
 */
export class Drawing {
  readonly parts: RigPart[] = [];
  private readonly values = new Map<string, number>();
  private readonly paths = new Map<string, string>();
  private readonly depths = new Map<string, number>();
  /** The outline's weight in the illustrated look, in the piece's units (0 in the editorial look). */
  readonly line: number;

  constructor(
    readonly style: KitStyle,
    /** The piece's size it is drawn at, in its units: its outline is a share of it. */
    size: number,
  ) {
    this.line =
      style.look === 'illustrated'
        ? Math.max(style.line, Math.round(size * 0.0075 * 10) / 10)
        : 0;
  }

  /** Paths for shapes with their fills: outlined in the illustrated look unless bare. */
  paint(fills: readonly Fill[]): string {
    return fills
      .filter(([s]) => s.d)
      .map(([s, fill, opts]) => {
        const o = opts?.opacity;
        const stroke =
          this.line > 0 && !opts?.bare
            ? ` stroke="${this.style.lineColour}" stroke-width="${n1(this.line)}" stroke-linejoin="round"`
            : '';
        return `<path d="${s.d}" fill="${fill}"${stroke}${o !== undefined && o < 1 ? ` opacity="${Math.round(o * 1000) / 1000}"` : ''}/>`;
      })
      .join('');
  }

  /** A part of filled shapes, under `parent`, turning about `pivot` (its box's foot when none). */
  part(
    id: string,
    parent: string | null,
    fills: readonly Fill[],
    options: { pivot?: Pt; attrs?: string; extra?: string; box?: ShotBox } = {},
  ): ShotBox {
    const drawn = fills.filter(([s]) => s.d);
    const box =
      options.box ??
      (drawn.length ? unionBox(drawn.map(([s]) => s.box)) : [0, 0, 0, 0]);
    this.parts.push({
      id,
      parent,
      markup: this.paint(drawn) + (options.extra ?? ''),
      box,
      pivot: options.pivot ?? [box[0] + box[2] / 2, box[1] + box[3]],
      ...(options.attrs ? { attrs: options.attrs } : {}),
    });
    return box;
  }

  /** An empty group that only holds other parts (its box is all it holds). */
  group(id: string, parent: string | null, pivot?: Pt): void {
    this.parts.push({ id, parent, markup: '', pivot: pivot ?? [0, 0] });
  }

  /** A point a recipe or the life layer starts from (a chimney's top, where smoke rises). */
  anchor(id: string, parent: string | null, at: Pt): void {
    this.parts.push({
      id,
      parent,
      markup: `<circle cx="${n1(at[0])}" cy="${n1(at[1])}" r="1" fill="none"/>`,
      box: [at[0] - 1, at[1] - 1, 2, 2],
      pivot: at,
    });
  }

  /** A part's number: a gear's ratio, a stack's count. */
  value(id: string, v: number): void {
    this.values.set(id, v);
  }

  /** A part's path, in the piece's units: a flow's way, a belt's run. */
  path(id: string, d: string): void {
    this.paths.set(id, d);
  }

  /** A part's parallax depth (sets only). */
  depth(id: string, d: number): void {
    this.depths.set(id, d);
  }

  /**
   * The piece put together: its parts nested and listed with their boxes,
   * pivots, values, paths and depths; its viewBox; its focal box.
   */
  piece(input: {
    id: string;
    box: ShotBox;
    focal: ShotBox;
    rig: ShotRigDto;
    colours: string[];
    notes?: string[];
    defs?: string;
  }): KitPiece {
    const { markup, parts } = assemble(this.parts);
    for (const [id, v] of this.values) if (parts[id]) parts[id].value = v;
    for (const [id, d] of this.paths) if (parts[id]) parts[id].path = d;
    for (const [id, d] of this.depths) if (parts[id]) parts[id].depth = d;
    const box = tidy(input.box);
    return {
      id: input.id,
      svg: svgOf(
        box,
        (input.defs ? `<defs>${input.defs}</defs>` : '') + markup,
      ),
      parts,
      rig: input.rig,
      focal: tidy(input.focal),
      box,
      colours: input.colours,
      ...(input.notes?.length ? { notes: input.notes } : {}),
    };
  }
}

// ── Shapes things are made of ─────────────────────────────────────────────

/** A closed polygon. */
export const poly = (points: readonly Pt[]): Shape => rounded(points, 0);

/** A rectangle by its edges. */
export const box = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r = 0,
): Shape =>
  rect(
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.abs(x1 - x0),
    Math.abs(y1 - y0),
    r,
  );

/** An open line drawn as a thin filled band (so it has a box and fills like the rest), `w` wide. */
export function band(a: Pt, b: Pt, w: number): Shape {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return poly([
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ]);
}

/** The upper half of an ellipse standing on y = `base`: a dome, a silo's cap, a hill. */
export function dome(
  cx: number,
  base: number,
  rx: number,
  ry: number,
  steps = 24,
): Shape {
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = Math.PI + (Math.PI * i) / steps;
    points.push([cx + rx * Math.cos(a), base + ry * Math.sin(a)]);
  }
  return poly(points);
}

/** Several shapes as one path (their boxes joined), for many small things of one colour (windows, rivets). */
export function many(shapes: readonly Shape[]): Shape {
  const real = shapes.filter((s) => s.d);
  return {
    d: real.map((s) => s.d).join(''),
    box: real.length ? unionBox(real.map((s) => s.box)) : [0, 0, 0, 0],
  };
}

/** A shape's box as a box shape (for a group that must report a box but draw nothing). */
export const boxOfPoints = (points: readonly Pt[]): ShotBox => boxOf(points);

/** Escape words for SVG text: the only text the kit draws comes from the research, and is escaped. */
export const escapeText = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** A box held inside another (for a part reported inside a set). */
export function clipBox(b: ShotBox, frame: ShotBox): ShotBox {
  // Each edge held inside the frame, so a box wholly outside it comes to its edge with no size.
  const hold = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const x0 = hold(b[0], frame[0], frame[0] + frame[2]);
  const y0 = hold(b[1], frame[1], frame[1] + frame[3]);
  const x1 = hold(b[0] + b[2], frame[0], frame[0] + frame[2]);
  const y1 = hold(b[1] + b[3], frame[1], frame[1] + frame[3]);
  return [
    Math.round(x0 * 10) / 10,
    Math.round(y0 * 10) / 10,
    Math.round(Math.max(0, x1 - x0) * 10) / 10,
    Math.round(Math.max(0, y1 - y0) * 10) / 10,
  ];
}
