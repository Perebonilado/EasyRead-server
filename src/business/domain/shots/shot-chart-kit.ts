/**
 * What every full-frame chart of the shots engine shares
 * (explainer-animation-tech.md §4.1, work package 6): the frame of the
 * film's shape and the sizes its words are set at (from the rules file),
 * the show's look as colours by role, words measured and fitted, the book
 * of named parts, and the asset they all end as.
 *
 * An asset is the end state of its picture, still: every part present and
 * visible, in its own colour, with no keyframes, delays or SMIL. The
 * client's recipes do all the motion: they hide a part before its moment,
 * grow it from its pivot, count its number up, draw its path on, recolour
 * it. Colour is set once on the outermost group of a run of one colour,
 * so a recipe that recolours a part recolours everything in it.
 *
 * What a recipe draws itself (a stamp's ink, a line through words, a ring,
 * a label with its leader) is never drawn here: the asset gives the thing,
 * and the recipe the event.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotPartDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { measureText } from '../scene-font';
import { nameKey } from '../scene-palette';
import { STAGES } from '../scene-shape';
import { PAPER, THEMES } from '../scene-themes';
import { SAFE, TEXT } from '../studio/explainer-rules';

// ── Numbers ───────────────────────────────────────────────────────────────

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A box rounded to a tenth of a unit, as every box an asset sends is. */
export const boxR = (b: ShotBox): ShotBox => [
  r1(b[0]),
  r1(b[1]),
  r1(b[2]),
  r1(b[3]),
];

/** The smallest box holding every box given. */
export function union(...boxes: (ShotBox | null | undefined)[]): ShotBox {
  const kept = boxes.filter((b): b is ShotBox => Boolean(b));
  if (!kept.length) return [0, 0, 0, 0];
  const x0 = Math.min(...kept.map((b) => b[0]));
  const y0 = Math.min(...kept.map((b) => b[1]));
  const x1 = Math.max(...kept.map((b) => b[0] + b[2]));
  const y1 = Math.max(...kept.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

/** A box grown on every side. */
export const grow = (b: ShotBox, by: number): ShotBox => [
  b[0] - by,
  b[1] - by,
  b[2] + by * 2,
  b[3] + by * 2,
];

/** A box kept inside another, cut where it reaches past it. */
export function within(b: ShotBox, frame: ShotBox): ShotBox {
  const x0 = Math.max(b[0], frame[0]);
  const y0 = Math.max(b[1], frame[1]);
  const x1 = Math.min(b[0] + b[2], frame[0] + frame[2]);
  const y1 = Math.min(b[1] + b[3], frame[1] + frame[3]);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

/** A number written as it is read, grouped by thousands: "1,500,000", "3.5". */
export function grouped(value: number, places = 0): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** How many places a number is written with, as given (3.50 keeps none it was not given). */
export const placesOf = (value: number) =>
  Math.min(3, (/\.(\d+)/.exec(String(value))?.[1] ?? '').length);

// ── The frame ─────────────────────────────────────────────────────────────

/** An area of the frame by its edges. */
export interface Edges {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The frame a chart fills, and the sizes its words are set at, for a film's shape. */
export interface Frame {
  shape: FilmShape;
  W: number;
  H: number;
  /**
   * Where words sit: the shape's safe area, and in a tall frame above its
   * caption band (research §3.8; explainer-rules SAFE).
   */
  text: Edges;
  /** How far the picture reaches: the frame less a margin, clear of a tall frame's buttons. */
  pic: Edges;
  /** Text sizes in the frame's units: the rules' fractions of its height. */
  size: { hero: number; title: number; label: number; chip: number };
}

/** The frame of a shape: 1600 × 900 wide, 900 × 1600 tall (scene-shape STAGES). */
export function frameOf(shape: FilmShape): Frame {
  const { w: W, h: H } = STAGES[shape];
  const size = {
    hero: r1(TEXT.hero * H),
    title: r1(TEXT.title * H),
    label: r1(TEXT.mustRead * H),
    chip: r1(TEXT.chip * H),
  };
  if (shape === 'tall') {
    const s = SAFE.tall;
    return {
      shape,
      W,
      H,
      size,
      text: {
        x0: r1(s.x0 * W),
        x1: r1(s.x1 * W),
        y0: r1(s.y0 * H),
        y1: r1(s.captionY0 * H),
      },
      pic: { x0: 40, x1: W - 40, y0: 110, y1: H - 110 },
    };
  }
  const s = SAFE.wide;
  return {
    shape,
    W,
    H,
    size,
    text: {
      x0: r1(s.x0 * W),
      x1: r1(s.x1 * W),
      y0: r1(s.y0 * H),
      y1: r1(s.y1 * H),
    },
    pic: { x0: 64, x1: W - 64, y0: 40, y1: H - 40 },
  };
}

/** An area's width and height. */
export const widthOf = (e: Edges) => e.x1 - e.x0;
export const heightOf = (e: Edges) => e.y1 - e.y0;

// ── Colour ────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

/** A colour read: #rgb, #rrggbb (any alpha dropped) or rgb(…); null for anything else. */
export function rgbOf(colour: string): Rgb | null {
  const c = colour.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4)
      return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as Rgb;
    if (h.length === 6 || h.length === 8)
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n)) as Rgb;
  return null;
}

const hexOf = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/** Two colours mixed, `t` of the way from the first to the second. */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return t < 0.5 ? a : b;
  return hexOf([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(colour: string): number {
  const c = rgbOf(colour);
  if (!c) return 0.5;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A side of the show's palette: its name as the look gives it, matched loosely. */
interface Side {
  name: string;
  key: string;
  colour: string;
}

/** The look's colours by role, and what the charts draw with them. */
export interface Paint {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  held: string | null;
  sides: Side[];
  /** A dark ground: words and sheets are drawn the other way round. */
  dark: boolean;
  /** Hairlines on the paper: a chart's grid, a rule. */
  rule: string;
  /** Where something will be: an empty seat, a track not yet travelled. */
  faint: string;
  /** A sheet laid on the paper: a page, a calendar, a step's box. */
  sheet: string;
  /** Its edge. */
  edge: string;
  /** Colours for things the show gives none, told apart by colour-blind viewers too. */
  series: readonly string[];
  /** One display face and one text face, as font-family lists. */
  display: string;
  text: string;
  /** The display face's tabular figure, as a share of its size. */
  figure: number;
}

/** A face as a font-family list, ending in a generic family so something always draws. */
function familyOf(face: string | undefined, generic: string): string {
  const said = (face ?? '').replace(/[<>]/g, '').trim();
  if (!said) return generic;
  return /\b(?:serif|sans-serif|monospace|system-ui|cursive)\s*$/i.test(said)
    ? said
    : `${said}, ${generic}`;
}

/** The look as the charts paint it: its colours by role, a colour that will not read falling back to the paper theme's. */
export function paintOf(look: ShotLookDto): Paint {
  const p = look.palette;
  const colour = (said: string | undefined, fallback: string) =>
    said && rgbOf(said) ? said : fallback;
  const paper = colour(p.paper, PAPER.paper);
  const dark = luminance(paper) < 0.3;
  const ink = colour(p.ink, dark ? '#F2F2EC' : PAPER.ink);
  const muted = colour(p.muted, dark ? '#B8C9C0' : PAPER.muted);
  const accent = colour(p.accent, PAPER.accent);
  const held = p.held && rgbOf(p.held) ? p.held : null;
  const sides = Object.entries(p.sides ?? {})
    .filter(([name, c]) => name.trim() && rgbOf(c))
    .map(([name, c]) => ({ name, key: nameKey(name), colour: c }));
  const display = familyOf(look.fonts?.display, 'serif');
  return {
    paper,
    ink,
    muted,
    accent,
    held,
    sides,
    dark,
    rule: mix(paper, muted, dark ? 0.32 : 0.24),
    faint: mix(paper, muted, dark ? 0.28 : 0.2),
    sheet: dark ? mix(paper, ink, 0.07) : mix(paper, '#FFFFFF', 0.7),
    edge: mix(paper, muted, dark ? 0.4 : 0.3),
    series: dark ? THEMES.chalkboard.chart : PAPER.chart,
    display,
    text: familyOf(look.fonts?.text, 'sans-serif'),
    figure: figureShareOf(display),
  };
}

/** A colour and the role the client knows it by. */
export interface Colour {
  colour: string;
  role?: string;
}

/** The side a name is, when the show's palette names it: the same name, or one inside the other as whole words. */
export function sideFor(paint: Paint, name: string | null | undefined) {
  const key = nameKey(name ?? '');
  if (!key) return null;
  const exact = paint.sides.find((s) => s.key === key);
  if (exact) return exact;
  const words = (k: string) => ` ${k} `;
  return (
    paint.sides.find(
      (s) =>
        s.key.length >= 3 &&
        (words(key).includes(words(s.key)) ||
          words(s.key).includes(words(key))),
    ) ?? null
  );
}

/**
 * The colour of one of several things (a bar, a party, a side): the show's
 * side of its name; else a token the writer gave (accent, muted, a chart
 * colour); else the next colour the show has not given, in order.
 */
export function colourOf(
  paint: Paint,
  name: string | null | undefined,
  token: unknown,
  i: number,
): Colour {
  const side = sideFor(paint, name);
  if (side) return { colour: side.colour, role: side.name };
  const t = typeof token === 'string' ? token.toLowerCase() : '';
  if (t === 'accent' || t === 'accent1')
    return { colour: paint.accent, role: 'accent' };
  if (t === 'muted') return { colour: paint.muted, role: 'muted' };
  if (t === 'ink') return { colour: paint.ink, role: 'ink' };
  const chart = /^chart([0-5])$/.exec(t);
  if (chart) return { colour: paint.series[Number(chart[1])] };
  if (t === 'bad') return { colour: paint.dark ? '#FF9A8A' : PAPER.bad };
  if (t === 'good') return { colour: paint.dark ? '#7FE0A8' : PAPER.good };
  // The show's own sides first, then the series, none of them twice.
  const used = new Set<string>();
  const order = [
    ...paint.sides.map((s) => s.colour),
    ...paint.series.filter((c) => contrast(c, paint.paper) >= 2.2),
  ].filter((c) => {
    const k = c.toUpperCase();
    if (used.has(k)) return false;
    used.add(k);
    return true;
  });
  return { colour: order[i % order.length] ?? paint.accent };
}

/** One colour for a whole picture: a token the writer gave, else the accent. */
export function mainColour(paint: Paint, token: unknown): Colour {
  const t = typeof token === 'string' ? token.toLowerCase() : '';
  if (!t || t === 'accent' || t === 'accent2')
    return { colour: paint.accent, role: 'accent' };
  return colourOf(paint, null, t, 0);
}

/** The words colour that reads on a fill: the ink or the paper, whichever stands further from it. */
export const wordsOn = (paint: Paint, fill: string) =>
  contrast(paint.ink, fill) >= contrast(paint.paper, fill)
    ? paint.ink
    : paint.paper;

// ── Words ─────────────────────────────────────────────────────────────────

/**
 * How much wider than the reading font a face may set the same words. The
 * widths are the house font's (scene-font), and a show's display face may
 * be wider: everything is fitted as if it were this much wider.
 */
const SPREAD = { text: 1.06, display: 1.12 } as const;
export type Face = keyof typeof SPREAD;

/**
 * One figure's width in tabular figures (every digit as wide as the
 * widest), as a share of the size, by the face a look names first: the
 * faces the themes and the bibles use, measured once; 0.6 for any other.
 * Layouts set what follows a number from its own right edge (text-anchor
 * end), so only its left edge rests on this.
 */
const FIGURES: [RegExp, number][] = [
  [/jakarta/i, 0.64],
  [/helvetica|arial|liberation|avenir|sf pro|-apple-system|system-ui/i, 0.56],
  [/charter|georgia|new york|ui-serif|times/i, 0.56],
  [/inter|ibm plex|work sans|dm sans|libre franklin|archivo/i, 0.6],
  [/fraunces|literata|source serif|playfair|crimson|instrument serif/i, 0.57],
  [/space grotesk|bricolage|atkinson|nunito|rounded/i, 0.6],
];
/** A face's figure width: the display face a look names first, or the first of its list that is known. */
export function figureShareOf(family: string): number {
  const first = family.split(',')[0] ?? '';
  return (
    FIGURES.find(([pattern]) => pattern.test(first))?.[1] ??
    FIGURES.find(([pattern]) => pattern.test(family))?.[1] ??
    0.6
  );
}

/** How wide words are set, at a size, in a face. */
export function wordsWidth(
  text: string,
  size: number,
  weight: 600 | 700 = 700,
  face: Face = 'text',
): number {
  return measureText(text, size, weight) * SPREAD[face];
}

/** How wide a number is set in tabular figures, each `share` of its size wide; the rest as they are. */
export function figuresWidth(text: string, size: number, share = 0.6): number {
  let w = 0;
  for (const ch of text)
    w += /\d/.test(ch)
      ? size * share
      : measureText(ch, size, 700) * SPREAD.display;
  return w;
}

/** Words broken into lines no wider than a width, or null when a word alone is wider or more lines are needed. */
export function wrap(
  text: string,
  width: number,
  size: number,
  most: number,
  weight: 600 | 700 = 700,
  face: Face = 'text',
): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    if (wordsWidth(word, size, weight, face) > width) return null;
    const next = current ? `${current} ${word}` : word;
    if (current && wordsWidth(next, size, weight, face) > width) {
      out.push(current);
      current = word;
    } else current = next;
  }
  if (current) out.push(current);
  return out.length <= most ? out : null;
}

/**
 * Words set as large as fit a width on at most `most` lines, between the
 * largest and the least size; at the least, any word too long is cut
 * short and the lines past the last are folded into it with an ellipsis.
 * Never smaller than the least: the floor a viewer must be able to read.
 */
export function fit(
  text: string,
  width: number,
  largest: number,
  least: number,
  most: number,
  weight: 600 | 700 = 700,
  face: Face = 'text',
): { size: number; lines: string[] } {
  const said = text.replace(/\s+/g, ' ').trim();
  for (let size = largest; size >= least; size -= Math.max(0.5, size * 0.03)) {
    const lines = wrap(said, width, size, most, weight, face);
    if (lines) return { size: r1(size), lines };
  }
  const size = least;
  const words = said.split(' ').map((word) => {
    if (wordsWidth(word, size, weight, face) <= width) return word;
    let cut = word;
    while (cut.length > 1 && wordsWidth(`${cut}…`, size, weight, face) > width)
      cut = cut.slice(0, -1);
    return `${cut}…`;
  });
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && wordsWidth(next, size, weight, face) > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  if (lines.length > most) {
    let last = lines.slice(most - 1).join(' ');
    while (
      last.length > 1 &&
      wordsWidth(`${last}…`, size, weight, face) > width
    )
      last = last.slice(0, -1);
    lines.splice(most - 1, lines.length, `${last.trimEnd()}…`);
  }
  return { size: r1(size), lines };
}

/** How far above its baseline a line's capitals and figures reach, and below it its descenders, as shares of its size. */
export const ASCENT = 0.78;
export const DESCENT = 0.24;

/** The box of lines of text, the first's baseline at y. */
export function linesBox(
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  anchor: 'start' | 'middle' | 'end' = 'start',
  leading = 1.15,
  weight: 600 | 700 = 700,
  face: Face = 'text',
  figures = 0,
): ShotBox {
  const w = Math.max(
    0,
    ...lines.map((line) =>
      figures
        ? figuresWidth(line, size, figures)
        : wordsWidth(line, size, weight, face),
    ),
  );
  const x0 = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
  const top = y - size * ASCENT;
  const bottom = y + (lines.length - 1) * size * leading + size * DESCENT;
  return [x0, top, w, bottom - top];
}

const ATTR = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Text made safe to write in markup: what the research or a model wrote is never markup. */
export const esc = ATTR;

/** What one text element is set in. */
export interface TextLook {
  size: number;
  fill: string;
  family: string;
  weight?: 400 | 500 | 600 | 700 | 800;
  anchor?: 'start' | 'middle' | 'end';
  leading?: number;
  /** Tabular figures: a number that counts keeps its width. */
  tabular?: boolean;
  italic?: boolean;
  spacing?: number;
  opacity?: number;
}

/** One text element of one or more lines, the first's baseline at y. */
export function textSvg(
  lines: readonly string[],
  x: number,
  y: number,
  look: TextLook,
  part?: string,
): string {
  const {
    size,
    fill,
    family,
    weight = 700,
    anchor = 'start',
    leading = 1.15,
    tabular = false,
    italic = false,
    spacing,
    opacity,
  } = look;
  const attrs =
    `${part ? ` data-part="${ATTR(part)}"` : ''} x="${r1(x)}" y="${r1(y)}"` +
    ` font-family="${ATTR(family)}" font-size="${r1(size)}" font-weight="${weight}"` +
    ` fill="${ATTR(fill)}"` +
    (anchor !== 'start' ? ` text-anchor="${anchor}"` : '') +
    (italic ? ' font-style="italic"' : '') +
    (spacing ? ` letter-spacing="${r1(spacing)}"` : '') +
    (opacity !== undefined && opacity < 1 ? ` opacity="${opacity}"` : '') +
    (tabular ? ' style="font-variant-numeric:tabular-nums lining-nums"' : '');
  if (lines.length === 1) return `<text${attrs}>${ATTR(lines[0])}</text>`;
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${r1(x)}" y="${r1(y + i * size * leading)}">${ATTR(line)}</tspan>`,
    )
    .join('');
  return `<text${attrs}>${spans}</text>`;
}

// ── Parts ─────────────────────────────────────────────────────────────────

/**
 * A name made into the stem of a part's id: "Northern Region" is
 * "northern-region", "São Paulo" "sao-paulo"; a name in another script
 * keeps its letters ("東京"). Empty for a name with no letter or figure.
 */
export function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * The parts of an asset as they are named: each id once, its box (and its
 * path, value and role where it has them) in the asset's units.
 */
export class PartBook {
  readonly parts: Record<string, ShotPartDto> = {};
  private readonly used = new Set<string>();

  /** An id from a stem, unique in the asset: "bar-north", then "bar-north-2". */
  id(stem: string): string {
    let id = stem || 'part';
    for (let k = 2; this.used.has(id); k += 1) id = `${stem}-${k}`;
    this.used.add(id);
    return id;
  }

  /** An id for a named thing: its prefix and its name's slug, or its place when its name gives none. */
  named(prefix: string, name: string, place: number): string {
    return this.id(`${prefix}-${slugOf(name) || String(place)}`);
  }

  /** A part's box and what else it carries, rounded. */
  add(id: string, part: ShotPartDto): string {
    this.used.add(id);
    this.parts[id] = {
      box: boxR(part.box),
      ...(part.pivot ? { pivot: part.pivot } : {}),
      ...(part.path ? { path: part.path } : {}),
      ...(part.value !== undefined && Number.isFinite(part.value)
        ? { value: part.value }
        : {}),
      ...(part.role ? { role: part.role } : {}),
    };
    return id;
  }
}

/** A part's group: what it draws, named for the recipes. */
export const partSvg = (id: string, inner: string, attrs = '') =>
  `<g data-part="${ATTR(id)}"${attrs}>${inner}</g>`;

// ── The asset ─────────────────────────────────────────────────────────────

/**
 * An asset from what a kind drew: the paper under everything, the frame's
 * box (or a longer one, for a tall list the camera travels down), every
 * part, and its focal box.
 */
export function assetOf(
  frame: Frame,
  paint: Paint,
  body: string,
  book: PartBook,
  focal: ShotBox,
  box: ShotBox = [0, 0, frame.W, frame.H],
): ShotSvgAssetDto {
  const [x, y, w, h] = boxR(box);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ATTR(paint.paper)}"/>` +
    body +
    `</svg>`;
  return {
    kind: 'svg',
    svg,
    box: [x, y, w, h],
    parts: book.parts,
    focal: boxR(within(focal, [x, y, w, h])),
  };
}

/** An id for what a drawing defines (a clip, a symbol) that no other asset on the stage shares: from what it draws. */
export function defsPrefix(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `c${(h >>> 0).toString(36)}`;
}

// ── Reading a spec ────────────────────────────────────────────────────────

/** A spec's own fields: under its kind's name ({ counter: {…} }) or as it is. */
export function bodyOf(
  kind: string,
  spec: Record<string, unknown>,
): Record<string, unknown> {
  const own = spec[kind];
  return own && typeof own === 'object' && !Array.isArray(own)
    ? (own as Record<string, unknown>)
    : spec;
}

/** A field as text, tidied and cut short; '' for anything not text. */
export function said(value: unknown, most = 120): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, most)
    : '';
}

/** What a spec gives about itself beside its kind's fields: its colour token, its source, its name. */
export function extraOf(
  kind: string,
  spec: Record<string, unknown>,
): { colour: unknown; source: string | null; name: string } {
  const body = bodyOf(kind, spec);
  return {
    colour: spec.colour ?? body.colour ?? null,
    source: said(spec.source ?? body.source, 90) || null,
    name: said(spec.name ?? body.name, 60),
  };
}

/** A source as its line reads: "Source: K.W.J. Post, 1963"; one that says where it is from is kept as written. */
export function sourceLine(raw: string | null | undefined): string | null {
  const text = said(raw, 90);
  if (!text) return null;
  return /^(sources?|data|from|via|after|figures?)\b/i.test(text)
    ? text
    : `Source: ${text}`;
}

/**
 * A source line: small, in the muted ink, at the chip's size, set from a
 * point, cut short to its width. A part, "source".
 */
export function sourceSvg(
  book: PartBook,
  paint: Paint,
  frame: Frame,
  text: string,
  x: number,
  y: number,
  width: number,
  anchor: 'start' | 'middle' | 'end' = 'start',
): { svg: string; box: ShotBox } {
  const size = frame.size.chip;
  let line = text;
  while (line.length > 8 && wordsWidth(line, size, 600) > width)
    line = `${line.slice(0, -2).trimEnd()}…`.replace(/……$/, '…');
  const box = linesBox([line], x, y, size, anchor, 1.15, 600);
  book.add('source', { box, role: 'muted' });
  return {
    svg: textSvg(
      [line],
      x,
      y,
      { size, fill: paint.muted, family: paint.text, weight: 600, anchor },
      'source',
    ),
    box,
  };
}
