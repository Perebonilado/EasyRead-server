/**
 * The looks an explainer can play in (studio-explainer-plan, Ask 2): six
 * themes built from the same tokens, three light and three dark, each with
 * a twin of the other kind for a viewer who wants a dark picture.
 *
 * This file is the one source of the colours. The player keeps a copy
 * (easyread's src/lib/scene/themes.ts), and both print the same
 * `themesPrint()`, so the two cannot drift apart unnoticed.
 *
 * Nothing is drawn again for a theme. Every picture is made in the house
 * colours (the paper theme's), and recoloured where it is shown:
 *
 *  - what code draws (a chart, a plot, a timeline, a quotation, working)
 *    uses the paper theme's tokens, each mapped to the theme's own token;
 *  - what the artist draws uses the house palette in its prompt, each
 *    house colour mapped through the theme's `drawingMap`, and a colour
 *    near one (a lighter face, a darker side) moved as far as that one is,
 *    so its shading stays; anything else (blood red, a real leaf) is left;
 *  - on a dark theme a drawing keeps its dark outlines and is cut out with
 *    a light rim, a sticker, so no line is lost on the dark ground.
 *
 * Paper is today's look exactly: nothing on a paper stage is recoloured.
 */

// ── The tokens ───────────────────────────────────────────────────────────

export const THEME_IDS = [
  'paper',
  'cleanlab',
  'sunny',
  'chalkboard',
  'blueprint',
  'nightsky',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** The artist's palette, as the drawing prompt names it. */
export const HOUSE = {
  ink: '#1F2A37',
  coral: '#E0663A',
  amber: '#F2B33D',
  leaf: '#3FA66B',
  sky: '#3D8FD1',
  violet: '#8C6BC8',
  rose: '#D9577A',
  sand: '#E9D8B4',
  cloud: '#F4F1EA',
  slate: '#6B7785',
  white: '#FFFFFF',
} as const;
export type HouseColour = keyof typeof HOUSE;

export interface ExplainerTheme {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** Its partner of the other kind: the picture a viewer's dark (or light) setting swaps to. */
  twin: ThemeId;
  /** The ground, its edges (a card's line, the divider), and how much grain it has (0 to 0.04). */
  paper: string;
  paperEdge: string;
  grain: number;
  /** Words and marks on the ground. */
  ink: string;
  muted: string;
  /** A keyword card and the words on it. */
  card: string;
  cardInk: string;
  accent: string;
  accent2: string;
  /** A highlighter over key words. */
  highlight: string;
  /** Arrows and leaders. */
  line: string;
  /** A chart's or a plot's grid. */
  grid: string;
  /** A chart's colours, in order: told apart by colour-blind viewers too. */
  chart: [string, string, string, string, string, string];
  /** Right and wrong: never told by colour alone (a ✓ or ✗ and a word go with it). */
  good: string;
  bad: string;
  /** The artist's palette as this theme has it. */
  drawingMap: Record<HouseColour, string>;
  /** A dark theme's sticker rim round what the artist drew; null on a light theme. */
  rim: string | null;
  /** Which of the explainer sound kit's variants suits it (Ask 6). */
  sound: 'paper' | 'chalk' | 'digital' | 'playful';
  /** The face its titles are set in; words on the stage stay in the reading font. */
  font: 'jakarta' | 'rounded' | 'serif-display';
}

/**
 * The Okabe–Ito order (blue, orange, bluish green, vermillion, sky blue,
 * reddish purple), each moved in lightness until it is seen at 3:1 on
 * every light ground and every pair stays apart for colour-blind viewers
 * (theme-check.ts): the pure Okabe–Ito orange and sky are too pale for a
 * cream page, and its orange and purple meet under tritanopia.
 */
const OKABE_ITO: ExplainerTheme['chart'] = [
  '#0050BE',
  '#BB7907',
  '#28825A',
  '#A22700',
  '#1A99CE',
  '#733359',
];

/** The same hues for a dark ground: lighter, and as far apart. */
const OKABE_ITO_LIGHT: ExplainerTheme['chart'] = [
  '#1797DE',
  '#FFD137',
  '#00D49C',
  '#E1713B',
  '#C2F1FF',
  '#B5829E',
];

const houseAs = (
  changes: Partial<Record<HouseColour, string>>,
): Record<HouseColour, string> => ({ ...HOUSE, ...changes });

export const THEMES: Record<ThemeId, ExplainerTheme> = {
  paper: {
    id: 'paper',
    name: 'Paper',
    dark: false,
    twin: 'nightsky',
    paper: '#FBF7EF',
    paperEdge: '#E4DCCB',
    grain: 0,
    ink: '#1F2A37',
    muted: '#5B6675',
    card: '#FFFFFF',
    cardInk: '#1F2A37',
    accent: '#E0663A',
    accent2: '#3D8FD1',
    highlight: '#FFE08A',
    line: '#5B6675',
    grid: '#E9E1D1',
    chart: OKABE_ITO,
    good: '#1D7F54',
    bad: '#C0392B',
    drawingMap: houseAs({}),
    rim: null,
    sound: 'paper',
    font: 'jakarta',
  },
  cleanlab: {
    id: 'cleanlab',
    name: 'Clean Lab',
    dark: false,
    twin: 'blueprint',
    paper: '#F7F9FC',
    paperEdge: '#D9E0EB',
    grain: 0,
    ink: '#14213D',
    muted: '#4A5872',
    card: '#FFFFFF',
    cardInk: '#14213D',
    accent: '#2F6FDE',
    accent2: '#F28C28',
    highlight: '#FFE38A',
    line: '#4A5872',
    grid: '#E3E8F0',
    chart: OKABE_ITO,
    good: '#1D7F54',
    bad: '#C0392B',
    // Cooler: its blue, and cool greys for the pale ground colours; red stays red.
    drawingMap: houseAs({
      sky: '#2F6FDE',
      sand: '#E4DCCB',
      cloud: '#EEF2F8',
    }),
    rim: null,
    sound: 'digital',
    font: 'jakarta',
  },
  sunny: {
    id: 'sunny',
    name: 'Sunny',
    dark: false,
    twin: 'chalkboard',
    paper: '#FFF9E8',
    paperEdge: '#F0E0B4',
    grain: 0,
    ink: '#2A2350',
    muted: '#5A5378',
    card: '#FFFFFF',
    cardInk: '#2A2350',
    accent: '#E8543A',
    accent2: '#2BB3A3',
    highlight: '#FFD84D',
    line: '#5A5378',
    grid: '#F3E6C2',
    chart: OKABE_ITO,
    good: '#1D7F54',
    bad: '#C0392B',
    drawingMap: houseAs({
      coral: '#FF7A59',
      amber: '#FFC23D',
      sky: '#3FA4F0',
      violet: '#9A73E0',
      cloud: '#FFF3D6',
    }),
    rim: null,
    sound: 'playful',
    font: 'rounded',
  },
  chalkboard: {
    id: 'chalkboard',
    name: 'Chalkboard',
    dark: true,
    twin: 'sunny',
    paper: '#1F3B34',
    paperEdge: '#3A5F55',
    grain: 0.03,
    ink: '#F2F2EC',
    muted: '#B8C9C0',
    card: '#29493F',
    cardInk: '#F2F2EC',
    accent: '#F7D35C',
    accent2: '#8FD3F4',
    highlight: '#F7D35C',
    line: '#C9D6CF',
    grid: '#35574E',
    chart: OKABE_ITO_LIGHT,
    good: '#7FE0A8',
    bad: '#FF9A8A',
    drawingMap: houseAs({}),
    rim: '#F2F2EC',
    sound: 'chalk',
    font: 'rounded',
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint',
    dark: true,
    twin: 'cleanlab',
    paper: '#0F2744',
    paperEdge: '#2A4A72',
    grain: 0,
    ink: '#E6F0FF',
    muted: '#A9BEDC',
    card: '#173559',
    cardInk: '#E6F0FF',
    accent: '#56C7F2',
    accent2: '#FFB547',
    highlight: '#56C7F2',
    line: '#B8CBE6',
    grid: '#1F3F66',
    chart: OKABE_ITO_LIGHT,
    good: '#7FE0A8',
    bad: '#FF9A8A',
    drawingMap: houseAs({ sky: '#56C7F2', coral: '#FF8A5C' }),
    rim: '#E6F0FF',
    sound: 'digital',
    font: 'jakarta',
  },
  nightsky: {
    id: 'nightsky',
    name: 'Night Sky',
    dark: true,
    twin: 'paper',
    paper: '#111827',
    paperEdge: '#2E3A52',
    grain: 0,
    ink: '#F5F3FF',
    muted: '#B4B9CC',
    card: '#1E2638',
    cardInk: '#F5F3FF',
    accent: '#F59E0B',
    accent2: '#22D3EE',
    highlight: '#F59E0B',
    line: '#C3C7D6',
    grid: '#263049',
    chart: OKABE_ITO_LIGHT,
    good: '#7FE0A8',
    bad: '#FF9A8A',
    drawingMap: houseAs({ amber: '#F59E0B', sky: '#22B8E0' }),
    rim: '#F5F3FF',
    sound: 'paper',
    font: 'serif-display',
  },
};

export const PAPER = THEMES.paper;

/** A theme by its id; paper for anything else, as a scene made before themes plays. */
export function themeOf(id: string | null | undefined): ExplainerTheme {
  return (id && THEMES[id as ThemeId]) || PAPER;
}

export const isThemeId = (id: unknown): id is ThemeId =>
  typeof id === 'string' && (THEME_IDS as readonly string[]).includes(id);

/**
 * The theme a viewer sees: the maker's, or its twin when they ask for a
 * dark picture and the maker's is light.
 */
export function viewedTheme(id: ThemeId, darkPicture: boolean): ThemeId {
  const theme = themeOf(id);
  return darkPicture && !theme.dark ? theme.twin : theme.id;
}

/** The theme's tokens as CSS custom properties, set on the stage's root: `--t-ink` and the rest. */
export function themeVars(theme: ExplainerTheme): Record<string, string> {
  return {
    '--t-paper': theme.paper,
    '--t-paper-edge': theme.paperEdge,
    '--t-ink': theme.ink,
    '--t-muted': theme.muted,
    '--t-card': theme.card,
    '--t-card-ink': theme.cardInk,
    '--t-accent': theme.accent,
    '--t-accent2': theme.accent2,
    '--t-highlight': theme.highlight,
    '--t-line': theme.line,
    '--t-grid': theme.grid,
    '--t-good': theme.good,
    '--t-bad': theme.bad,
    '--t-drawing-ink': theme.drawingMap.ink,
    ...Object.fromEntries(theme.chart.map((c, i) => [`--t-chart-${i + 1}`, c])),
  };
}

// ── Colour ───────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

/** A hex colour as 0–255 channels, or null: #rgb, #rgba, #rrggbb, #rrggbbaa (the alpha set aside). */
export function hexRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3 || h.length === 4)
    return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as Rgb;
  if (h.length === 6 || h.length === 8)
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  return null;
}

export const rgbHex = (rgb: Rgb): string =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const linearRgb = (rgb: Rgb): Rgb => rgb.map(toLinear) as Rgb;
export const srgbOf = (linear: Rgb): Rgb =>
  linear.map((c) => fromLinear(Math.min(1, Math.max(0, c)))) as Rgb;

/** WCAG's relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = linearRgb(hexRgb(hex) ?? [0, 0, 0]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG's contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Lab = [number, number, number];

/** CIE L*a*b* (D65) of a colour. */
export function labOf(rgb: Rgb): Lab {
  const [r, g, b] = linearRgb(rgb);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Back from L*a*b* (D65) to 0–255 channels, clipped to what a screen shows. */
export function rgbOfLab([L, a, b]: Lab): Rgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) =>
    t ** 3 > 216 / 24389 ? t ** 3 : (t - 16 / 116) / (24389 / 27 / 116);
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  return srgbOf([
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ]);
}

/** How different two colours look: CIEDE2000. Under 1 is the same to the eye; over 10, plainly two colours. */
export function deltaE2000(one: Lab, two: Lab): number {
  const [L1, a1, b1] = one;
  const [L2, a2, b2] = two;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360;
    hpm /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * rad) +
    0.24 * Math.cos(2 * hpm * rad) +
    0.32 * Math.cos((3 * hpm + 6) * rad) -
    0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 +
      (dCp / Sc) ** 2 +
      (dHp / Sh) ** 2 +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// ── Recolouring ──────────────────────────────────────────────────────────

/** A colour this near a house colour (CIEDE2000) is a shade of it, and goes where it goes. */
export const SNAP_DE = 8;

const HOUSE_NAMES = Object.keys(HOUSE) as HouseColour[];
const HOUSE_LAB = HOUSE_NAMES.map(
  (name) => [name, labOf(hexRgb(HOUSE[name])!)] as const,
);
const NAMED: Record<string, string> = { white: '#FFFFFF', black: '#000000' };

/** The house colour a colour is, or is a shade of, and how far it is from it; null for anything else. */
export function houseColourOf(
  hex: string,
): { name: HouseColour; lab: Lab; from: Lab } | null {
  const rgb = hexRgb(hex);
  if (!rgb) return null;
  const lab = labOf(rgb);
  let best: { name: HouseColour; lab: Lab; from: Lab; d: number } | null = null;
  for (const [name, house] of HOUSE_LAB) {
    const d = deltaE2000(lab, house);
    if (d < SNAP_DE && (!best || d < best.d))
      best = { name, lab: house, from: lab, d };
  }
  return best && { name: best.name, lab: best.lab, from: best.from };
}

/** Where a paint value's colours are: a hex, or white or black; a url(#…) is matched whole, so its id is never taken for one. */
const COLOUR =
  /url\([^)]*\)|#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:white|black)\b/gi;
/** A paint attribute, or an animation's values, and its value. */
const PAINT_ATTRIBUTE =
  /\b(fill|stroke|stop-color|flood-color|lighting-color|color|values|from|to)(\s*=\s*)(["'])([^"']*)\3/gi;
/** A paint property in CSS (a <style>, a style attribute), and its value. */
const PAINT_PROPERTY =
  /\b(fill|stroke|stop-color|flood-color|lighting-color|color)(\s*:\s*)([^;}"'<>]+)/gi;

/**
 * Every colour a drawing paints with, changed by `to` (a new hex, or null
 * to leave it): in its paint attributes, its animations' values, its
 * <style> and its style attributes. An alpha (#rrggbbaa) is kept.
 */
export function recolour(
  svg: string,
  to: (hex: string) => string | null,
): string {
  const swap = (value: string) =>
    value.replace(COLOUR, (found) => {
      if (found.startsWith('url(')) return found;
      const hex = NAMED[found.toLowerCase()] ?? found;
      const rgb = hexRgb(hex);
      if (!rgb) return found;
      const next = to(rgbHex(rgb));
      if (!next || next.toUpperCase() === rgbHex(rgb)) return found;
      const alpha = /^#[0-9a-f]{8}$/i.test(found)
        ? found.slice(7)
        : /^#[0-9a-f]{4}$/i.test(found)
          ? found[4].repeat(2)
          : '';
      return `${next}${alpha}`;
    });
  return svg
    .replace(
      PAINT_ATTRIBUTE,
      (_all, name: string, eq: string, quote: string, value: string) =>
        `${name}${eq}${quote}${swap(value)}${quote}`,
    )
    .replace(
      PAINT_PROPERTY,
      (_all, name: string, colon: string, value: string) =>
        `${name}${colon}${swap(value)}`,
    );
}

/**
 * The paper theme's tokens code draws with, and a chart's first colour as
 * it was before the palette (one sky blue): each a colour of its own, so
 * a code drawing's every colour says which token it is.
 */
const CODE_TOKENS = [
  'paper',
  'paperEdge',
  'ink',
  'muted',
  'card',
  'accent',
  'accent2',
  'grid',
  'good',
  'bad',
] as const;

/** The figure kit's ink (scene-ink's FIGURE_INK), which working's pictures are drawn in. */
const FIGURE_INK = '#2D2A32';

/** A colour code drew in the paper theme's tokens, as this theme has it; null for any other. */
export function codeColour(hex: string, theme: ExplainerTheme): string | null {
  const key = hex.toUpperCase();
  for (const token of CODE_TOKENS)
    if (PAPER[token].toUpperCase() === key) return theme[token];
  // Working's pictures write and outline in the figure kit's ink: the theme's ink.
  if (key === FIGURE_INK) return theme.ink;
  const i = PAPER.chart.findIndex((c) => c.toUpperCase() === key);
  return i >= 0 ? theme.chart[i] : null;
}

/**
 * A colour the artist drew in, as this theme has it: a house colour
 * through the theme's map, and a shade of one moved as far as its house
 * colour is (so a lighter face stays lighter); null to leave it.
 */
export function drawingColour(
  hex: string,
  theme: ExplainerTheme,
): string | null {
  const house = houseColourOf(hex);
  if (!house) return null;
  const target = theme.drawingMap[house.name];
  if (target.toUpperCase() === HOUSE[house.name].toUpperCase()) return null;
  const to = labOf(hexRgb(target)!);
  return rgbHex(
    rgbOfLab([
      to[0] + house.from[0] - house.lab[0],
      to[1] + house.from[1] - house.lab[1],
      to[2] + house.from[2] - house.lab[2],
    ]),
  );
}

/** The drawing's viewBox, or a square of 100. */
function viewBoxOf(svg: string): [number, number, number, number] {
  const m = /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i.exec(svg);
  const nums =
    m?.[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number) ?? [];
  return nums.length === 4 && nums.every(Number.isFinite)
    ? (nums as [number, number, number, number])
    : [0, 0, 100, 100];
}

/** The rim's width, as a share of the drawing's longer side: about 3 px on a phone. */
export const RIM_SHARE = 0.009;

/**
 * A drawing cut out with a rim of `colour` round everything it draws, as
 * a sticker is: its dark outlines stay, and show on a dark ground.
 */
export function withRim(svg: string, colour: string): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (!open || close < open.index + open[0].length) return svg;
  const [, , w, h] = viewBoxOf(svg);
  const r = Math.round(Math.max(w, h) * RIM_SHARE * 100) / 100;
  const at = open.index + open[0].length;
  const filter =
    `<defs><filter id="t-rim" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${r}" result="grown"/>` +
    `<feFlood flood-color="${colour}"/><feComposite in2="grown" operator="in" result="rim"/>` +
    `<feMerge><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  return `${svg.slice(0, at)}${filter}<g filter="url(#t-rim)">${svg.slice(at, close)}</g>${svg.slice(close)}`;
}

/** The fills a drawing paints with, each as often as it is used. */
function fillsOf(svg: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of svg.matchAll(/\bfill\s*[=:]\s*["']?(#[0-9a-f]{3,8})\b/gi)) {
    const rgb = hexRgb(m[1]);
    if (!rgb) continue;
    const hex = rgbHex(rgb);
    out.set(hex, (out.get(hex) ?? 0) + 1);
  }
  return out;
}

/** How far a light theme's drawing may fade into the ground: below this, it is rimmed too. */
export const DRAWING_CONTRAST = 3;

/**
 * Whether a drawing on a light theme stands off the ground: its three
 * most used fills are, on average, at least DRAWING_CONTRAST from the
 * paper, or it has a dark outline that is.
 */
export function standsOff(svg: string, theme: ExplainerTheme): boolean {
  const fills = [...fillsOf(svg)].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!fills.length) return true;
  const outlined = [
    ...svg.matchAll(/\bstroke\s*[=:]\s*["']?(#[0-9a-f]{3,8})\b/gi),
  ].some((m) => contrast(m[1], theme.paper) >= 4.5);
  if (outlined) return true;
  const mean =
    fills.reduce((sum, [hex]) => sum + contrast(hex, theme.paper), 0) /
    fills.length;
  return mean >= DRAWING_CONTRAST;
}

/** A drawing's colours as a theme has them (themedSvg's, for what the artist drew). */
export function themedDrawing(svg: string, theme: ExplainerTheme): string {
  if (theme.id === 'paper') return svg;
  const recoloured = recolour(svg, (hex) => drawingColour(hex, theme));
  if (theme.rim) return withRim(recoloured, theme.rim);
  return standsOff(recoloured, theme)
    ? recoloured
    : withRim(recoloured, theme.muted);
}

/** What code drew, in the theme's tokens: working (painted in the current colour) is given the theme's ink. */
export function themedCode(
  svg: string,
  theme: ExplainerTheme,
  source?: string,
): string {
  if (theme.id === 'paper') return svg;
  const out = recolour(svg, (hex) => codeColour(hex, theme));
  return source === 'math'
    ? out.replace(/<svg\b/i, `<svg color="${theme.ink}"`)
    : out;
}

/** What a drawing on the stage is, for recolouring it: what drew it, and whether it is a story's set. */
export interface ThemedThing {
  svg: string;
  source?: string;
  rig?: boolean;
  backdrop?: boolean;
  layers?: unknown;
}

const CACHE_MOST = 400;
const cache = new Map<string, string>();

/** A short hash of a drawing, for the cache's key (FNV-1a, 32 bits). */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${text.length}`;
}

/**
 * A thing's drawing as a theme shows it, made once per drawing and theme
 * and kept: what code drew in the theme's tokens; what the artist drew
 * recoloured, with its rim on a dark theme; a person the kit drew keeps
 * their own colours (a rim only); a story's set is never touched.
 */
export function themedSvg(thing: ThemedThing, theme: ExplainerTheme): string {
  if (theme.id === 'paper' || thing.backdrop || thing.layers) return thing.svg;
  const key = `${theme.id}|${thing.source ?? (thing.rig ? 'rig' : 'art')}|${hashOf(thing.svg)}`;
  const kept = cache.get(key);
  if (kept !== undefined) {
    // Kept as the latest used.
    cache.delete(key);
    cache.set(key, kept);
    return kept;
  }
  const made = thing.source
    ? themedCode(thing.svg, theme, thing.source)
    : thing.rig
      ? theme.rim
        ? withRim(thing.svg, theme.rim)
        : thing.svg
      : themedDrawing(thing.svg, theme);
  cache.set(key, made);
  // The one used longest ago let go.
  for (const oldest of cache.keys()) {
    if (cache.size <= CACHE_MOST) break;
    cache.delete(oldest);
  }
  return made;
}

/** How many themed drawings are kept: for tests. */
export const themedKept = (): number => cache.size;

/**
 * The table and the recolouring, printed: the player's copy must print
 * the same (easyread's themes.test.ts).
 */
export function themesPrint(): string {
  const sample =
    '<svg viewBox="0 0 200 100"><style>.a{fill:#e0663a}</style>' +
    '<rect fill="#1F2A37" stroke="#3D8FD1" width="10" height="10"/>' +
    '<circle fill="#E9D8B4" stroke="url(#fade)" r="3"/><path fill="#f06a3f80" d=""/><text fill="#2d2a32">6</text>' +
    '<animate attributeName="fill" values="#F2B33D;#b22222" dur="1s"/></svg>';
  const lines = THEME_IDS.flatMap((id) => {
    const theme = THEMES[id];
    return [
      JSON.stringify(theme),
      themedDrawing(sample, theme),
      themedCode(sample, theme, 'math'),
    ];
  });
  return hashOf(lines.join('\n'));
}
