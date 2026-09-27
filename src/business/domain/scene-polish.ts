/**
 * A drawing the model made, brought to the house style by code: the
 * kit's ink on every outline, the kit's line at stage size, flat fills (a
 * gradient becomes its middle colour; filters and patterns go), its
 * colours brought to the house palette where they are near one (two that
 * were different stay different), and stray strokes and specks taken
 * out. Run on every character, thing and place the artist draws, after
 * the gate and before measuring; never on what the kit draws itself.
 *
 * Nothing is moved or reshaped: only paint changes, and a stray mark
 * goes. So a drawing measured, rigged and joined before is measured,
 * rigged and joined the same after.
 */
import render from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { elements, removeNode, textOf, walk } from './scene-dom';
import { FIGURE_INK, HOUSE_PALETTE, KIT_LINE, LINE_SLACK } from './scene-ink';
import {
  IDENTITY,
  apply,
  multiply,
  parseTransform,
  type Matrix,
  type ViewBox,
} from './scene-joints';
import { renderSvg, type InkBox, type InkMap } from './scene-raster';
import { variant } from './scene-sheet-rig';
import type { GatedDrawing } from './scene-svg';

// ── Colours ───────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

/** The colour names a model writes, as CSS knows them. */
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
  gold: '#ffd700',
  silver: '#c0c0c0',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  crimson: '#dc143c',
  coral: '#ff7f50',
  salmon: '#fa8072',
  khaki: '#f0e68c',
  ivory: '#fffff0',
  lavender: '#e6e6fa',
  violet: '#ee82ee',
  indigo: '#4b0082',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  peru: '#cd853f',
  wheat: '#f5deb3',
  darkgreen: '#006400',
  darkblue: '#00008b',
  darkred: '#8b0000',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  dimgray: '#696969',
  dimgrey: '#696969',
  slategray: '#708090',
  slategrey: '#708090',
  skyblue: '#87ceeb',
  forestgreen: '#228b22',
  saddlebrown: '#8b4513',
  sandybrown: '#f4a460',
  goldenrod: '#daa520',
  orangered: '#ff4500',
  tomato: '#ff6347',
  hotpink: '#ff69b4',
  deeppink: '#ff1493',
  lightpink: '#ffb6c1',
  whitesmoke: '#f5f5f5',
  snow: '#fffafa',
  linen: '#faf0e6',
  burlywood: '#deb887',
  rosybrown: '#bc8f8f',
  firebrick: '#b22222',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  seagreen: '#2e8b57',
  olivedrab: '#6b8e23',
  yellowgreen: '#9acd32',
  darkorange: '#ff8c00',
  lightyellow: '#ffffe0',
  cornsilk: '#fff8dc',
  mintcream: '#f5fffa',
  honeydew: '#f0fff0',
  aliceblue: '#f0f8ff',
  ghostwhite: '#f8f8ff',
  floralwhite: '#fffaf0',
  antiquewhite: '#faebd7',
  peachpuff: '#ffdab9',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  bisque: '#ffe4c4',
  blanchedalmond: '#ffebcd',
  papayawhip: '#ffefd5',
  seashell: '#fff5ee',
  oldlace: '#fdf5e6',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  midnightblue: '#191970',
  darkolivegreen: '#556b2f',
};

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** A colour as written (#abc, #aabbcc, rgb(), a name), or null for none, a link, or what cannot be read. */
export function parseColour(value: string | undefined | null): Rgb | null {
  if (!value) return null;
  const said = value.trim().toLowerCase();
  const hex = NAMED[said] ?? said;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  if (short)
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ];
  const long =
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/.exec(hex);
  if (long)
    return [
      parseInt(long[1], 16),
      parseInt(long[2], 16),
      parseInt(long[3], 16),
    ];
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/.exec(hex);
  if (rgb)
    return [rgb[1], rgb[2], rgb[3]].map((part) =>
      clamp255(
        part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part),
      ),
    ) as Rgb;
  return null;
}

export const hexOf = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')}`;

/** A colour in CIE Lab (D65), for telling how far apart two colours look. */
export function labOf([r, g, b]: Rgb): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How far apart two colours look (CIE76 ΔE): under 2 the eye barely tells them apart. */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = labOf(a);
  const [l2, a2, b2] = labOf(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** How light a colour is, 0 (black) to 100 (white). */
export const lightness = (rgb: Rgb): number => labOf(rgb)[0];

/** How near a colour must be to one of the house's to be brought to it. */
export const SNAP_DELTA = 12;
/** A stroke darker than this is an ink line, whatever colour it was drawn in. */
const DARK_STROKE = 40;
/** A fill darker than this is the kit's ink: a pupil, a nose. */
const DARK_FILL = 12;
/** A stroke lighter than this is a highlight or a light edge, not an outline. */
const LIGHT_STROKE = 88;

/**
 * Colours brought to the house palette: each to the nearest house colour
 * within `most`, nearest pairs first, and never two to the same one, so
 * two colours that were different stay different. A colour with no house
 * colour near it, or whose nearest is taken, stays as it is.
 */
export function snapColours(
  colours: readonly string[],
  palette: readonly string[] = HOUSE_PALETTE.map((one) => one.hex),
  most = SNAP_DELTA,
): Map<string, string> {
  const unique = [...new Set(colours.map((c) => c.toLowerCase()))];
  const house = palette.map((hex) => ({ hex, rgb: parseColour(hex)! }));
  const pairs: { colour: string; to: string; d: number }[] = [];
  for (const colour of unique) {
    const rgb = parseColour(colour);
    if (!rgb) continue;
    for (const one of house) {
      const d = deltaE(rgb, one.rgb);
      if (d <= most) pairs.push({ colour, to: one.hex, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const pair of pairs) {
    if (out.has(pair.colour) || taken.has(pair.to)) continue;
    out.set(pair.colour, pair.to);
    taken.add(pair.to);
  }
  return out;
}

// ── Declarations ──────────────────────────────────────────────────────────

/** What paint a shape is drawn with: what polish reads and writes. */
const PAINT = [
  'fill',
  'stroke',
  'stroke-width',
  'fill-opacity',
  'stroke-opacity',
  'stroke-linejoin',
  'stroke-linecap',
  'filter',
] as const;

/** Elements whose contents are never drawn where they stand. */
const HIDDEN = new Set([
  'defs',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'lineargradient',
  'radialgradient',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
]);

/** Elements that put ink down, whose paint is read. */
const SHAPES = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'use',
]);

function styleMap(style: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const one of (style ?? '').split(';')) {
    const at = one.indexOf(':');
    if (at < 0) continue;
    const name = one.slice(0, at).trim().toLowerCase();
    const value = one.slice(at + 1).trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

const styleText = (map: Map<string, string>) =>
  [...map].map(([name, value]) => `${name}:${value}`).join(';');

/** A property as the element itself says it: its style over its attribute. */
function own(node: Element, prop: string): string | undefined {
  const inStyle = styleMap(node.attribs.style).get(prop);
  return inStyle ?? node.attribs[prop];
}

/** A property set on the element itself, where it says it: in its style if it says it there, else as an attribute. */
function setOwn(node: Element, prop: string, value: string | null): void {
  const style = styleMap(node.attribs.style);
  if (style.has(prop)) {
    if (value === null) style.delete(prop);
    else style.set(prop, value);
    if (style.size) node.attribs.style = styleText(style);
    else delete node.attribs.style;
    if (value === null) delete node.attribs[prop];
    return;
  }
  if (value === null) delete node.attribs[prop];
  else node.attribs[prop] = value;
}

/** Every place an element says a property: its attribute and its style, each rewritten by `change`. */
function rewrite(
  node: Element,
  prop: string,
  change: (value: string) => string | null,
): void {
  const said = node.attribs[prop];
  if (said !== undefined) {
    const next = change(said);
    if (next === null) delete node.attribs[prop];
    else node.attribs[prop] = next;
  }
  const style = styleMap(node.attribs.style);
  const inStyle = style.get(prop);
  if (inStyle !== undefined) {
    const next = change(inStyle);
    if (next === null) style.delete(prop);
    else style.set(prop, next);
    if (style.size) node.attribs.style = styleText(style);
    else delete node.attribs.style;
  }
}

const numberOf = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── CSS rules, as inline paint ────────────────────────────────────────────

interface CssBlock {
  head: string;
  body: string;
}

/** A style sheet's blocks at the top level, in order: rules and @-blocks. */
function cssBlocks(css: string): CssBlock[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssBlock[] = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('{', at);
    if (open < 0) break;
    let depth = 1;
    let end = open + 1;
    for (; end < text.length && depth; end += 1)
      if (text[end] === '{') depth += 1;
      else if (text[end] === '}') depth -= 1;
    out.push({
      head: text.slice(at, open).trim(),
      body: text.slice(open + 1, end - 1),
    });
    at = end;
  }
  return out;
}

const COMPOUND = /^(?:[a-zA-Z][\w-]*|\*)?(?:[.#][\w-]+)*$/;

/** A rule's selectors as compounds, or null when any is more than plain tags, classes, ids and descendants. */
function selectorsOf(head: string): string[][] | null {
  if (!head || head.startsWith('@')) return null;
  const out = head
    .split(',')
    .map((one) =>
      one.replace(/[>+~]/g, ' ').trim().split(/\s+/).filter(Boolean),
    );
  return out.every((compounds) => compounds.every((c) => COMPOUND.test(c)))
    ? out
    : null;
}

function isCompound(node: Element, compound: string): boolean {
  const tag = /^[a-zA-Z][\w-]*/.exec(compound)?.[0];
  if (tag && node.name.toLowerCase() !== tag.toLowerCase()) return false;
  const classes = (node.attribs.class ?? '').split(/\s+/);
  for (const m of compound.matchAll(/([.#])([\w-]+)/g))
    if (m[1] === '.' ? !classes.includes(m[2]) : node.attribs.id !== m[2])
      return false;
  return true;
}

function isSelected(node: Element, compounds: readonly string[]): boolean {
  if (!isCompound(node, compounds[compounds.length - 1])) return false;
  let k = compounds.length - 2;
  for (
    let at = node.parent as Element | null;
    at && k >= 0;
    at = at.parent as Element | null
  )
    if (at.attribs && isCompound(at, compounds[k])) k -= 1;
  return k < 0;
}

/**
 * The paint the drawing's own CSS sets, moved onto the shapes it sets it
 * on, as their own style, and out of the CSS: so every shape's paint is
 * said on it or on a group round it, where it can be read and changed.
 * What the CSS sets besides paint (motion) is left where it is. A rule
 * whose selector is more than tags, classes and ids keeps its paint.
 */
export function inlinePaint(root: Element): number {
  const sheets = [...walk(root)].filter(
    (node) => node.name.toLowerCase() === 'style',
  );
  if (!sheets.length) return 0;
  const nodes = [...walk(root)].filter(
    (node) => !HIDDEN.has(node.name.toLowerCase()),
  );
  // What each element said in its own style before: never overridden.
  const said = new Map(
    nodes.map((node) => [node, new Set(styleMap(node.attribs.style).keys())]),
  );
  let moved = 0;
  for (const sheet of sheets) {
    const blocks = cssBlocks(textOf(sheet));
    const kept: string[] = [];
    for (const block of blocks) {
      const selectors = selectorsOf(block.head);
      const declarations = styleMap(block.body.replace(/\n/g, ' '));
      const paint = [...declarations].filter(([name]) =>
        (PAINT as readonly string[]).includes(name),
      );
      if (!selectors || !paint.length) {
        kept.push(`${block.head}{${block.body}}`);
        continue;
      }
      for (const node of nodes) {
        if (!selectors.some((s) => isSelected(node, s))) continue;
        const style = styleMap(node.attribs.style);
        for (const [name, value] of paint)
          if (!said.get(node)?.has(name)) style.set(name, value);
        if (style.size) node.attribs.style = styleText(style);
        moved += 1;
      }
      const rest = [...declarations].filter(
        ([name]) => !(PAINT as readonly string[]).includes(name),
      );
      if (rest.length) kept.push(`${block.head}{${styleText(new Map(rest))}}`);
    }
    const text = new Text(kept.join(''));
    text.parent = sheet;
    sheet.children = [text];
  }
  return moved;
}

// ── Paint as it shows ─────────────────────────────────────────────────────

/** A shape's paint as it shows: its own, else what it takes from the groups round it. */
export interface Painted {
  node: Element;
  /** A colour, a link (url(#…)), or null for none. */
  fill: string | null;
  stroke: string | null;
  /** Its stroke's width in the drawing's own units, with every transform round it. */
  width: number;
  /** How much the transforms round it (and its own) scale it. */
  scale: number;
  /** The transform from its own units to the drawing's. */
  ctm: Matrix;
  /** Whether the element sits inside a named group of these, by id. */
  within: Set<string>;
}

const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const noPaint = (value: string | undefined) =>
  value === undefined ||
  value === 'none' ||
  value === 'transparent' ||
  value === '';

/**
 * Every shape's paint as it shows, in drawing order: the fill, the
 * stroke and its width each from the shape, else the nearest group round
 * it that says one, else SVG's own (a black fill, no stroke, a width of
 * one). Shapes inside definitions, masks and clips are not drawn where
 * they stand and are left out.
 */
export function paintOf(root: Element): Painted[] {
  const out: Painted[] = [];
  const visit = (
    node: Element,
    inherited: {
      fill: string;
      stroke: string;
      width: number;
      fillOpacity: number;
      strokeOpacity: number;
    },
    ctm: Matrix,
    within: Set<string>,
  ) => {
    const name = node.name.toLowerCase();
    if (HIDDEN.has(name)) return;
    const here = { ...inherited };
    const fill = own(node, 'fill');
    if (fill !== undefined) here.fill = fill.trim();
    const stroke = own(node, 'stroke');
    if (stroke !== undefined) here.stroke = stroke.trim();
    const width = numberOf(own(node, 'stroke-width'));
    if (width !== null) here.width = width;
    const fo = numberOf(own(node, 'fill-opacity'));
    if (fo !== null) here.fillOpacity = fo;
    const so = numberOf(own(node, 'stroke-opacity'));
    if (so !== null) here.strokeOpacity = so;
    const m = multiply(ctm, parseTransform(node.attribs.transform) ?? IDENTITY);
    const inside = node.attribs.id
      ? new Set([...within, node.attribs.id])
      : within;
    if (SHAPES.has(name)) {
      // A line has no inside to fill.
      const filled =
        name !== 'line' && !noPaint(here.fill) && here.fillOpacity > 0;
      const stroked =
        !noPaint(here.stroke) && here.strokeOpacity > 0 && here.width > 0;
      const scale = scaleOf(m);
      out.push({
        node,
        fill: filled ? here.fill : null,
        stroke: stroked ? here.stroke : null,
        width: stroked ? here.width * scale : 0,
        scale,
        ctm: m,
        within: inside,
      });
    }
    for (const child of elements(node.children)) visit(child, here, m, inside);
  };
  visit(
    root,
    {
      fill: '#000000',
      stroke: 'none',
      width: 1,
      fillOpacity: 1,
      strokeOpacity: 1,
    },
    IDENTITY,
    new Set(),
  );
  return out;
}

const sameColour = (a: string | null, b: string | null) => {
  const ca = parseColour(a);
  const cb = parseColour(b);
  return Boolean(ca && cb && ca.every((v, i) => Math.abs(v - cb[i]) <= 2));
};

/** Whether a shape's stroke is its outline: a stroke round a filled shape, in another colour, and not a light edge. */
export function isOutline(one: Painted): boolean {
  if (!one.fill || !one.stroke || one.stroke.startsWith('url(')) return false;
  if (sameColour(one.fill, one.stroke)) return false;
  const rgb = parseColour(one.stroke);
  return !rgb || lightness(rgb) < LIGHT_STROKE;
}

/** Whether a stroke is an ink line, whatever it outlines: dark enough to read as one. */
function isDark(value: string | null): boolean {
  const rgb = parseColour(value);
  return Boolean(rgb && lightness(rgb) < DARK_STROKE);
}

/**
 * The commonest of some widths, to the nearest half unit: the drawing's
 * line. Each counts by its weight (how much outline it draws), so a
 * body's outline outweighs a dozen spots.
 */
export function commonWidth(
  widths: readonly number[],
  weights: readonly number[] = [],
): number | null {
  const counts = new Map<number, number>();
  widths.forEach((w, i) => {
    if (w > 0) {
      const k = Math.round(w * 2) / 2 || 0.5;
      counts.set(k, (counts.get(k) ?? 0) + (weights[i] ?? 1));
    }
  });
  let best: number | null = null;
  let most = 0;
  for (const [w, n] of counts)
    if (n > most || (n === most && best !== null && w > best))
      [best, most] = [w, n];
  return best;
}

// ── Flat paint: gradients, patterns and filters ───────────────────────────

const LINK = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/;

function byIdMap(root: Element): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const node of walk(root))
    if (node.attribs.id && !out.has(node.attribs.id))
      out.set(node.attribs.id, node);
  return out;
}

/** A stop's offset, 0 to 1. */
function offsetOf(value: string | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, value.trim().endsWith('%') ? n / 100 : n));
}

/**
 * The colour half way along a gradient: its middle stop, or the mix of
 * the two either side of the middle. Stops it takes from another
 * gradient (href) are followed. Null when it has none to read.
 */
export function gradientMiddle(
  node: Element,
  ids: Map<string, Element>,
  depth = 0,
): string | null {
  const stops = elements(node.children).filter(
    (child) => child.name.toLowerCase() === 'stop',
  );
  if (!stops.length) {
    const href = node.attribs.href ?? node.attribs['xlink:href'];
    const target = href?.startsWith('#') ? ids.get(href.slice(1)) : undefined;
    return target && depth < 4 ? gradientMiddle(target, ids, depth + 1) : null;
  }
  const list = stops
    .map((stop) => ({
      at: offsetOf(own(stop, 'offset')),
      rgb: parseColour(own(stop, 'stop-color') ?? 'black'),
    }))
    .filter((one): one is { at: number; rgb: Rgb } => Boolean(one.rgb))
    .sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  const after = list.find((one) => one.at >= 0.5) ?? list[list.length - 1];
  const before = [...list].reverse().find((one) => one.at <= 0.5) ?? list[0];
  if (after === before || after.at === before.at) return hexOf(after.rgb);
  const t = (0.5 - before.at) / (after.at - before.at);
  return hexOf(
    before.rgb.map((v, i) => v + (after.rgb[i] - v) * t) as unknown as Rgb,
  );
}

/** A pattern's colour: the commonest fill of what it draws. */
function patternColour(node: Element): string | null {
  const counts = new Map<string, number>();
  for (const one of walk(node)) {
    if (one === node || !SHAPES.has(one.name.toLowerCase())) continue;
    const fill = own(one, 'fill');
    if (fill && parseColour(fill))
      counts.set(fill, (counts.get(fill) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [fill, n] of counts) if (n > most) [best, most] = [fill, n];
  return best;
}

/**
 * Gradients made flat (each fill or stroke that uses one takes its middle
 * colour), patterns made their commonest colour, and filters taken away,
 * with the definitions no longer used. Counts of each.
 */
export function flatPaint(root: Element): {
  gradients: number;
  patterns: number;
  filters: number;
} {
  const ids = byIdMap(root);
  let gradients = 0;
  let patterns = 0;
  let filters = 0;
  for (const node of walk(root))
    for (const prop of ['fill', 'stroke']) {
      rewrite(node, prop, (value) => {
        const link = LINK.exec(value);
        const target = link ? ids.get(link[1]) : undefined;
        if (!target) return value;
        const kind = target.name.toLowerCase();
        if (kind === 'lineargradient' || kind === 'radialgradient') {
          gradients += 1;
          return gradientMiddle(target, ids) ?? 'none';
        }
        if (kind === 'pattern') {
          patterns += 1;
          return patternColour(target) ?? 'none';
        }
        return value;
      });
    }
  for (const node of walk(root))
    if (own(node, 'filter') !== undefined) {
      rewrite(node, 'filter', () => null);
      filters += 1;
    }
  // Definitions nothing uses any more go: gradients, patterns and filters.
  const used = new Set<string>();
  for (const node of walk(root))
    for (const value of Object.values(node.attribs))
      for (const m of value.matchAll(/#([\w.:-]+)/g)) used.add(m[1]);
  for (const node of [...walk(root)]) {
    const kind = node.name.toLowerCase();
    if (kind === 'filter') {
      removeNode(node);
      continue;
    }
    if (
      (kind === 'lineargradient' ||
        kind === 'radialgradient' ||
        kind === 'pattern') &&
      !(node.attribs.id && used.has(node.attribs.id))
    )
      removeNode(node);
  }
  return { gradients, patterns, filters };
}

// ── Ink and line ──────────────────────────────────────────────────────────

/** The least a line may be against the outline: finer than this, it is lost on the stage. */
const THINNEST = 0.4;
/** The most a line may be against the shape it draws: a small shape's outline never swallows it. */
const WIDEST_SHARE = 0.3;

/** How much outline a shape draws, for weighing widths: half its box's perimeter. */
const reachOf = (one: Painted) => {
  const box = shapeBox(one);
  return box ? Math.max(1, box.width + box.height) : 1;
};

/**
 * Every outline in the kit's ink and the drawing's line brought to
 * `target`: dark strokes to the ink where they are said, every outline
 * round a filled shape to the ink on the shape, and every width scaled by
 * one factor, so the commonest outline is `target` and a detail line
 * keeps its weight beside it (never finer than a share of it). Joins and
 * caps round, as the kit's are.
 */
export function inkAndLine(
  root: Element,
  target: number,
): { inked: number; from: number | null; to: number } {
  let inked = 0;
  for (const node of walk(root)) {
    if (HIDDEN.has(node.name.toLowerCase())) continue;
    rewrite(node, 'stroke', (value) => {
      if (!isDark(value) || sameColour(value, FIGURE_INK)) return value;
      inked += 1;
      return FIGURE_INK;
    });
  }
  let painted = paintOf(root);
  for (const one of painted)
    if (isOutline(one) && !sameColour(one.stroke, FIGURE_INK)) {
      setOwn(one.node, 'stroke', FIGURE_INK);
      inked += 1;
    }
  painted = paintOf(root);
  const outlines = painted.filter(isOutline);
  const measured = outlines.length
    ? outlines
    : painted.filter((one) => one.stroke);
  const from = commonWidth(
    measured.map((one) => one.width),
    measured.map(reachOf),
  );
  if (from && target > 0 && Math.abs(from - target) / target > 0.03) {
    const factor = target / from;
    for (const node of walk(root))
      rewrite(node, 'stroke-width', (value) => {
        const n = numberOf(value);
        return n === null ? value : String(r2(n * factor));
      });
    // A shape that took SVG's own width of one takes the factor instead.
    if (own(root, 'stroke-width') === undefined)
      root.attribs['stroke-width'] = String(r2(factor));
  }
  if (target > 0)
    for (const one of paintOf(root)) {
      if (!one.stroke || one.scale <= 0) continue;
      let width = Math.max(one.width, target * THINNEST);
      // Never more than a share of the shape it draws: an eye's outline
      // never fills the eye, a brow is never a blot.
      const box = shapeBox(one);
      if (box) {
        const most =
          WIDEST_SHARE *
          (one.fill
            ? Math.min(box.width, box.height)
            : Math.max(box.width, box.height));
        if (most > 0) width = Math.min(width, most);
      }
      if (Math.abs(width - one.width) > 0.01)
        setOwn(one.node, 'stroke-width', String(r2(width / one.scale)));
    }
  if (own(root, 'stroke-linejoin') === undefined)
    root.attribs['stroke-linejoin'] = 'round';
  if (own(root, 'stroke-linecap') === undefined)
    root.attribs['stroke-linecap'] = 'round';
  return { inked, from, to: target };
}

// ── The palette ───────────────────────────────────────────────────────────

/**
 * Colours brought to the house palette where they are near one (never
 * two to the same), and a fill as dark as ink made the kit's ink. The
 * number of colours changed.
 */
export function snapPaint(root: Element): number {
  const said: string[] = [];
  for (const node of walk(root))
    for (const prop of ['fill', 'stroke', 'stop-color']) {
      const value = own(node, prop);
      if (value && parseColour(value) && !sameColour(value, FIGURE_INK))
        said.push(value.trim().toLowerCase());
    }
  const map = snapColours(said);
  const changed = new Set<string>();
  for (const node of walk(root))
    for (const prop of ['fill', 'stroke', 'stop-color'])
      rewrite(node, prop, (value) => {
        const key = value.trim().toLowerCase();
        const rgb = parseColour(key);
        if (!rgb || sameColour(key, FIGURE_INK)) return value;
        if (prop !== 'stroke' && lightness(rgb) < DARK_FILL) {
          changed.add(key);
          return FIGURE_INK;
        }
        const to = map.get(key);
        if (!to || sameColour(to, key)) return value;
        changed.add(key);
        return to;
      });
  return changed.size;
}

// ── Strays ────────────────────────────────────────────────────────────────

/** How many cells across the maps strays are read in. */
const STRAY_COLS = 240;
/** A shape with less ink than this share of the drawing's, touching nothing, is a speck. */
const SPECK = 0.002;
/** A stroke with at least this share of its ink off every filled shape is outside them. */
const OUTSIDE = 0.8;

/** The numbers of a path's points, absolute, for a rough box round it: its control points included. */
function pathPoints(d: string): [number, number][] {
  const tokens =
    d.match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points: [number, number][] = [];
  let cmd = 'M';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let k = 0;
  const num = () => Number(tokens[k++]);
  const counts: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  };
  while (k < tokens.length) {
    if (/[a-z]/i.test(tokens[k])) cmd = tokens[k++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const n = counts[lower];
    if (n === undefined) break;
    if (lower === 'z') {
      x = sx;
      y = sy;
      if (k < tokens.length && !/[a-z]/i.test(tokens[k])) k += 1;
      continue;
    }
    if (k + n > tokens.length) break;
    const v = Array.from({ length: n }, num);
    if (v.some((one) => !Number.isFinite(one))) break;
    const at = (px: number, py: number): [number, number] =>
      rel ? [x + px, y + py] : [px, py];
    switch (lower) {
      case 'h':
        x = rel ? x + v[0] : v[0];
        points.push([x, y]);
        break;
      case 'v':
        y = rel ? y + v[0] : v[0];
        points.push([x, y]);
        break;
      case 'a': {
        const [ex, ey] = at(v[5], v[6]);
        // The arc's radii round both ends: a box that holds it.
        points.push(
          [ex - v[0], ey - v[1]],
          [ex + v[0], ey + v[1]],
          [x - v[0], y - v[1]],
          [x + v[0], y + v[1]],
        );
        [x, y] = [ex, ey];
        break;
      }
      default: {
        for (let i = 0; i < n; i += 2) points.push(at(v[i], v[i + 1]));
        [x, y] = points[points.length - 1];
      }
    }
    if (lower === 'm') {
      [sx, sy] = [x, y];
      cmd = rel ? 'l' : 'L';
    }
  }
  return points;
}

/** A shape's box in the drawing's units, roughly, with its stroke: its points and control points, through its transforms. */
export function roughBox(one: Painted): InkBox | null {
  const box = shapeBox(one);
  return box
    ? {
        x: box.x - one.width / 2,
        y: box.y - one.width / 2,
        width: box.width + one.width,
        height: box.height + one.width,
      }
    : null;
}

/** A shape's box in the drawing's units, roughly, without its stroke. */
export function shapeBox(one: Painted): InkBox | null {
  const node = one.node;
  const a = (name: string) => numberOf(node.attribs[name]) ?? 0;
  let points: [number, number][] = [];
  switch (node.name.toLowerCase()) {
    case 'rect':
      points = [
        [a('x'), a('y')],
        [a('x') + a('width'), a('y') + a('height')],
      ];
      break;
    case 'circle':
      points = [
        [a('cx') - a('r'), a('cy') - a('r')],
        [a('cx') + a('r'), a('cy') + a('r')],
      ];
      break;
    case 'ellipse':
      points = [
        [a('cx') - a('rx'), a('cy') - a('ry')],
        [a('cx') + a('rx'), a('cy') + a('ry')],
      ];
      break;
    case 'line':
      points = [
        [a('x1'), a('y1')],
        [a('x2'), a('y2')],
      ];
      break;
    case 'polyline':
    case 'polygon': {
      const n = (node.attribs.points ?? '').match(/-?[\d.]+(?:e[-+]?\d+)?/gi);
      for (let i = 0; n && i + 1 < n.length; i += 2)
        points.push([Number(n[i]), Number(n[i + 1])]);
      break;
    }
    case 'path':
      points = pathPoints(node.attribs.d ?? '');
      break;
    default:
      return null;
  }
  if (!points.length) return null;
  // Every corner through the transforms, so a turned box is held.
  const xs: number[] = [];
  const ys: number[] = [];
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const maxY = Math.max(...points.map((p) => p[1]));
  for (const corner of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as [number, number][]) {
    const [x, y] = apply(one.ctm, corner);
    xs.push(x);
    ys.push(y);
  }
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

const at = (map: InkMap, c: number, r: number) =>
  c >= 0 && r >= 0 && c < map.cols && r < map.rows
    ? map.bits[r * map.cols + c] === '1'
    : false;

function cellsOf(map: InkMap): number {
  let n = 0;
  for (let i = 0; i < map.bits.length; i += 1) if (map.bits[i] === '1') n += 1;
  return n;
}

/** The inked cells' box, in cells, or null for none. */
function cellBox(
  map: InkMap,
): { c0: number; r0: number; c1: number; r1: number } | null {
  let c0 = Infinity;
  let r0 = Infinity;
  let c1 = -Infinity;
  let r1 = -Infinity;
  for (let r = 0; r < map.rows; r += 1)
    for (let c = 0; c < map.cols; c += 1)
      if (map.bits[r * map.cols + c] === '1') {
        c0 = Math.min(c0, c);
        r0 = Math.min(r0, r);
        c1 = Math.max(c1, c);
        r1 = Math.max(r1, r);
      }
  return c1 < 0 ? null : { c0, r0, c1, r1 };
}

/**
 * How one shape's ink lies against others: the share of it off `solid`
 * (a cell's reach round it counting as on), and whether any ink of
 * `other` lies in the ring `reach` cells round it (it touches something).
 */
function lies(
  part: InkMap,
  solid: InkMap,
  other: InkMap,
  reach = 2,
): { cells: number; outside: number; touchesSolid: boolean; touches: boolean } {
  let cells = 0;
  let off = 0;
  let touchesSolid = false;
  let touches = false;
  for (let r = 0; r < part.rows; r += 1)
    for (let c = 0; c < part.cols; c += 1) {
      if (!at(part, c, r)) continue;
      cells += 1;
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr += 1)
        for (let dc = -1; dc <= 1 && !near; dc += 1)
          if (at(solid, c + dc, r + dr)) near = true;
      if (!near) off += 1;
      if (touches && touchesSolid) continue;
      for (let dr = -reach; dr <= reach; dr += 1)
        for (let dc = -reach; dc <= reach; dc += 1) {
          if (!dr && !dc) continue;
          const c2 = c + dc;
          const r2c = r + dr;
          if (at(part, c2, r2c)) continue;
          if (at(solid, c2, r2c)) touchesSolid = true;
          if (at(other, c2, r2c)) touches = true;
        }
    }
  return { cells, outside: cells ? off / cells : 0, touchesSolid, touches };
}

/** Groups never taken out as strays, by what they are for: a face, the mouth's mark, a grip. */
export interface StrayOptions {
  /** A set: its whole frame painted, so only a line lying on its ground on its own is stray. */
  backdrop?: boolean;
  /** Group ids whose shapes are never strays. */
  protect?: readonly string[];
}

/**
 * The strays in a drawing: strokes with no shape under them that float,
 * or that lie along the bottom as a ground line; and specks, tiny shapes
 * touching nothing. In a set, whose sky and ground fill the frame, a
 * stroke lying on the lower part on its own, touching no shape that
 * stands there. Nothing that is all a named group has is ever one.
 */
export async function findStrays(
  root: Element,
  viewBox: ViewBox,
  named: readonly string[],
  options: StrayOptions = {},
): Promise<Element[]> {
  const painted = paintOf(root);
  const guarded = new Set(options.protect ?? []);
  const free = painted.filter(
    (one) => ![...one.within].some((id) => guarded.has(id)),
  );
  const [, , vw, vh] = viewBox;
  const boxes = new Map(painted.map((one) => [one, roughBox(one)]));
  const area = (one: Painted) => {
    const box = boxes.get(one);
    return box ? box.width * box.height : Infinity;
  };
  // A set's sky, its ground and its walls: big shapes everything lies on.
  const background = new Set(
    options.backdrop
      ? painted.filter((one) => one.fill && area(one) >= vw * vh * 0.25)
      : [],
  );
  const solid = painted.filter((one) => one.fill && !background.has(one));
  const strokes = free.filter((one) => !one.fill && one.stroke);
  // Tiny by their boxes: only those are measured, one by one.
  const specks = options.backdrop
    ? []
    : free.filter((one) => one.fill && area(one) <= vw * vh * SPECK * 4);
  if (!strokes.length && !specks.length) return [];
  const all = render(root, { xmlMode: true, selfClosingTags: true });
  const svgs = [
    all,
    variant(
      root,
      solid.map((one) => one.node),
      [],
    ),
    ...[...strokes, ...specks].map((one) => variant(root, [one.node], [])),
  ];
  const cols = Math.max(48, Math.round((STRAY_COLS * vw) / Math.max(vw, vh)));
  const { masks } = await renderSvg(all, undefined, {
    masks: { svgs, cols },
  });
  if (!masks || masks.length !== svgs.length) return [];
  const [whole, silhouette] = masks;
  const allCells = cellsOf(whole);
  const shape = cellBox(silhouette);
  const out: Element[] = [];
  strokes.forEach((one, k) => {
    const mask = masks[2 + k];
    const seen = lies(mask, silhouette, whole);
    if (!seen.cells || seen.outside < OUTSIDE) return;
    const box = cellBox(mask)!;
    const wide = box.c1 - box.c0 + 1;
    const high = box.r1 - box.r0 + 1;
    if (options.backdrop) {
      // A line on the ground on its own: low, long, flat, and touching
      // nothing that stands there.
      const low = (box.r0 + box.r1) / 2 >= mask.rows * 0.55;
      if (
        low &&
        !seen.touchesSolid &&
        wide >= mask.cols * 0.08 &&
        high <= wide * 0.25
      )
        out.push(one.node);
      return;
    }
    if (!seen.touches) {
      out.push(one.node);
      return;
    }
    // A ground line: along the bottom, as wide as half the drawing or more.
    if (
      shape &&
      wide >= (shape.c1 - shape.c0 + 1) * 0.5 &&
      high <= wide * 0.2 &&
      (box.r0 + box.r1) / 2 >= shape.r1 - (shape.r1 - shape.r0 + 1) * 0.12
    )
      out.push(one.node);
  });
  specks.forEach((one, k) => {
    const mask = masks[2 + strokes.length + k];
    const seen = lies(mask, silhouette, whole);
    if (seen.cells && seen.cells <= allCells * SPECK && !seen.touches)
      out.push(one.node);
  });
  // Never all a named group has: a part is never lost to this.
  const kept = new Set<Element>();
  for (const id of named) {
    const inGroup = painted.filter((one) => one.within.has(id));
    if (inGroup.length && inGroup.every((one) => out.includes(one.node)))
      for (const one of inGroup) kept.add(one.node);
  }
  return out.filter((node) => !kept.has(node));
}

// ── The whole polish ──────────────────────────────────────────────────────

export interface PolishOptions extends StrayOptions {
  /** The outline, in the drawing's own units: a number, or worked out from where its ink is (a thing drawn at its true size). */
  line: number | ((ink: InkBox) => number);
}

/** What polish changed, for the log. */
export interface PolishChanges {
  /** Outlines turned to the kit's ink. */
  inked: number;
  /** The commonest outline before and after, in the drawing's own units. */
  line: { from: number | null; to: number };
  gradients: number;
  patterns: number;
  filters: number;
  /** Colours brought to the house palette. */
  snapped: number;
  /** Strokes and specks taken out. */
  strays: number;
}

function parse(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    elements(doc.children).find((node) => node.name.toLowerCase() === 'svg') ??
    null
  );
}

/** What polish changed, said for the log: nothing when it changed nothing. */
export function describePolish(changes: PolishChanges): string {
  const out: string[] = [];
  if (changes.inked) out.push(`${changes.inked} outlines inked`);
  if (changes.line.from !== null && changes.line.from !== changes.line.to)
    out.push(`line ${changes.line.from} → ${changes.line.to}`);
  if (changes.gradients) out.push(`${changes.gradients} gradients made flat`);
  if (changes.patterns) out.push(`${changes.patterns} patterns made flat`);
  if (changes.filters) out.push(`${changes.filters} filters taken off`);
  if (changes.snapped) out.push(`${changes.snapped} colours to the palette`);
  if (changes.strays) out.push(`${changes.strays} strays taken out`);
  return out.join(', ');
}

/**
 * A drawing brought to the house style (see the top of this file). The
 * drawing as it was, and nothing changed, when it cannot be read. The
 * strays are found from where its ink is, so it is rendered once; a
 * render that fails leaves them where they are.
 */
export async function polishDrawing(
  drawing: GatedDrawing,
  options: PolishOptions,
): Promise<{ drawing: GatedDrawing; changes: PolishChanges }> {
  const none: PolishChanges = {
    inked: 0,
    line: { from: null, to: 0 },
    gradients: 0,
    patterns: 0,
    filters: 0,
    snapped: 0,
    strays: 0,
  };
  const root = parse(drawing.svg);
  if (!root) return { drawing, changes: none };
  inlinePaint(root);
  const flat = flatPaint(root);
  const named = [
    ...Object.values(drawing.parts),
    ...Object.values(drawing.states),
  ];
  let strays: Element[] = [];
  let ink: InkBox | null = null;
  try {
    strays = await findStrays(root, drawing.viewBox, named, options);
    for (const node of strays) removeNode(node);
    if (typeof options.line === 'function')
      ink = (await renderSvg(render(root, { xmlMode: true }))).ink;
  } catch {
    strays = [];
  }
  const target =
    typeof options.line === 'number'
      ? options.line
      : ink && ink.width > 0 && ink.height > 0
        ? options.line(ink)
        : 0;
  const line = inkAndLine(root, target);
  const snapped = snapPaint(root);
  return {
    drawing: {
      ...drawing,
      svg: render(root, { xmlMode: true, selfClosingTags: true }),
    },
    changes: {
      inked: line.inked,
      line: {
        from: line.from === null ? null : r2(line.from),
        to: r2(line.to),
      },
      ...flat,
      snapped,
      strays: strays.length,
    },
  };
}

// ── The house style, checked ──────────────────────────────────────────────

/** How a drawing stands against the house style (the scorecard's third line). */
export interface StyleReport {
  /** Outlines: strokes round filled shapes. */
  outlines: number;
  /** Of those, in the kit's ink. */
  inked: number;
  /** The commonest outline at stage size, in the kit's units; null with none. */
  line: number | null;
  /** The share of outlines within the kit's line's slack at stage size. */
  onLine: number;
  /** Fills and strokes that use a gradient, a pattern or a filter. */
  gradients: number;
  patterns: number;
  filters: number;
  /** Distinct fill colours, and the share of them the house's own. */
  colours: number;
  onPalette: number;
}

/**
 * A drawing's style against the house's: `kitPerUnit` is how many of the
 * kit's units one of the drawing's is on the stage (a medium animal on a
 * 780-tall frame: 130 / 780).
 */
export function styleReport(svg: string, kitPerUnit: number): StyleReport {
  const root = parse(svg);
  const empty: StyleReport = {
    outlines: 0,
    inked: 0,
    line: null,
    onLine: 0,
    gradients: 0,
    patterns: 0,
    filters: 0,
    colours: 0,
    onPalette: 0,
  };
  if (!root) return empty;
  inlinePaint(root);
  const ids = byIdMap(root);
  let gradients = 0;
  let patterns = 0;
  let filters = 0;
  for (const node of walk(root)) {
    for (const prop of ['fill', 'stroke']) {
      const link = LINK.exec(own(node, prop) ?? '');
      const kind = link ? ids.get(link[1])?.name.toLowerCase() : undefined;
      if (kind === 'lineargradient' || kind === 'radialgradient')
        gradients += 1;
      if (kind === 'pattern') patterns += 1;
    }
    if (own(node, 'filter') !== undefined && own(node, 'filter') !== 'none')
      filters += 1;
  }
  const painted = paintOf(root);
  const outlines = painted.filter(isOutline);
  const widths = outlines.map((one) => one.width * kitPerUnit);
  const reach = outlines.map(reachOf);
  const line = commonWidth(
    widths.map((w) => w * 10),
    reach,
  );
  const house = new Set(
    [...HOUSE_PALETTE.map((one) => one.hex), FIGURE_INK].map((hex) =>
      hex.toLowerCase(),
    ),
  );
  const colours = [
    ...new Set(
      painted
        .map((one) => one.fill)
        .filter((fill): fill is string => Boolean(parseColour(fill)))
        .map((fill) => hexOf(parseColour(fill)!)),
    ),
  ];
  return {
    outlines: outlines.length,
    inked: outlines.filter((one) => sameColour(one.stroke, FIGURE_INK)).length,
    line: line === null ? null : r2(line / 10),
    onLine: outlines.length
      ? widths.reduce(
          (sum, w, i) =>
            sum +
            (Math.abs(w - KIT_LINE) <= KIT_LINE * LINE_SLACK + 0.05
              ? reach[i]
              : 0),
          0,
        ) / reach.reduce((sum, n) => sum + n, 0)
      : 0,
    gradients,
    patterns,
    filters,
    colours: colours.length,
    onPalette: colours.length
      ? colours.filter((hex) => house.has(hex)).length / colours.length
      : 0,
  };
}

/** What falls short of the house style, in words: nothing when it is the house's. */
export function styleFaults(report: StyleReport): string[] {
  const out: string[] = [];
  if (report.outlines && report.inked / report.outlines < 0.95)
    out.push(
      `outlines not in the kit's ink (${Math.round((report.inked / report.outlines) * 100)}% are)`,
    );
  if (!report.outlines) out.push('no outlines');
  else if (
    report.line === null ||
    Math.abs(report.line - KIT_LINE) > KIT_LINE * LINE_SLACK + 0.05
  )
    out.push(
      `the outline is ${report.line ?? '?'} of the kit's units on the stage, not ${KIT_LINE}`,
    );
  if (report.gradients) out.push(`${report.gradients} gradients`);
  if (report.patterns) out.push(`${report.patterns} patterns`);
  if (report.filters) out.push(`${report.filters} filters`);
  return out;
}
