/**
 * How the UI kit paints (explainer-animation-tech §11, WP18): a generic
 * app's colours worked out from the show's look, the few shapes every
 * screen is drawn from, and a small set of icons. Nothing here is a real
 * product's: no logo, no brand's colour, no app's name.
 *
 *  - Colours by role (the screen's background, a surface, a line, text,
 *    the app's own colour, success, error...), in both themes at once:
 *    every element is drawn in the theme the screen starts in and carries
 *    its colour in the other (`data-fill-light`, `data-fill-dark`), so a
 *    screen turning dark is the same screen changing its fills, never a
 *    second screen cut in (the client's swap recipe mixes them in OKLab).
 *  - The app's own colour is the show's accent turned well round the hue
 *    circle, so the screen's buttons never wear the colour the film keeps
 *    for its callouts and its cursor.
 *  - Words on a screen are the script's few (a title, a button's words, a
 *    list's labels); anything the script does not give is a grey bar, the
 *    way a designer's wireframe shows text, never words made up.
 */
import type { ShotBox } from '../../../contracts';
import { measureText } from '../scene-font';
import { hexOfOklab, mixOk, oklabOf } from './style';

export type UiTheme = 'light' | 'dark';
export const UI_THEMES: readonly UiTheme[] = ['light', 'dark'];

/** The colours a screen is drawn in, by what each is for. */
export const UI_ROLES = [
  'bg',
  'surface',
  'surface2',
  'line',
  'text',
  'text2',
  'text3',
  'bar',
  'app',
  'appText',
  'appSoft',
  'appDeep',
  'success',
  'successSoft',
  'error',
  'errorSoft',
  'hot',
  'star',
  'starOff',
  'knob',
  'track',
  'scrim',
  'shade',
  'key',
] as const;
export type UiRole = (typeof UI_ROLES)[number];
export type UiColours = Record<UiRole, string>;

/** A screen's colours in both themes, and the theme it is drawn in. */
export interface UiPalette {
  light: UiColours;
  dark: UiColours;
  theme: UiTheme;
}

/** What the kit is drawn from: the show's look in a few colours, and its faces. */
export interface UiLook {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  /** The text face and the display face, as the look names them. */
  text: string;
  display: string;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** A colour from OKLCH: lightness 0–1, chroma, hue in degrees. */
export function lch(L: number, C: number, h: number): string {
  const a = (h * Math.PI) / 180;
  return hexOfOklab([L, C * Math.cos(a), C * Math.sin(a)]);
}

/** A colour's hue in degrees (OKLCH), and its chroma. */
export function hueOf(hex: string): { h: number; c: number } {
  const [, a, b] = oklabOf(hex);
  return {
    h: ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360,
    c: Math.hypot(a, b),
  };
}

/**
 * The app's own colour: the show's accent turned 150° round the hue
 * circle, at a lightness that carries white words (light) or reads on a
 * dark screen (dark). A grey accent gives a calm blue.
 */
export function appColour(accent: string, theme: UiTheme): string {
  const { h, c } = hueOf(accent);
  const hue = c < 0.03 ? 255 : (h + 150) % 360;
  return theme === 'light' ? lch(0.53, 0.15, hue) : lch(0.7, 0.13, hue);
}

/** A screen's colours from the show's look: a white screen and a near-black one, the look's ink and the app's colour. */
export function uiPalette(look: UiLook, theme: UiTheme = 'light'): UiPalette {
  const appL = appColour(look.accent, 'light');
  const appD = appColour(look.accent, 'dark');
  const { h } = hueOf(appL);
  const inkHue = hueOf(look.ink);
  // Text is the show's ink, kept dark enough to read on white.
  const text =
    oklabOf(look.ink)[0] > 0.35 ? lch(0.24, 0.02, inkHue.h) : look.ink;
  const light: UiColours = {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: lch(0.965, 0.005, inkHue.h),
    line: lch(0.9, 0.008, inkHue.h),
    text,
    text2: mixOk(text, '#FFFFFF', 0.38),
    text3: mixOk(text, '#FFFFFF', 0.58),
    bar: lch(0.88, 0.008, inkHue.h),
    app: appL,
    appText: '#FFFFFF',
    appSoft: mixOk(appL, '#FFFFFF', 0.86),
    appDeep: mixOk(appL, '#000000', 0.18),
    success: lch(0.62, 0.15, 150),
    successSoft: lch(0.95, 0.04, 150),
    error: lch(0.58, 0.19, 25),
    errorSoft: lch(0.95, 0.03, 25),
    hot: lch(0.6, 0.2, 18),
    star: lch(0.8, 0.16, 80),
    starOff: lch(0.9, 0.01, 80),
    knob: '#FFFFFF',
    track: lch(0.9, 0.008, inkHue.h),
    scrim: '#0B0D12',
    shade: '#0B0D12',
    key: '#FFFFFF',
  };
  const dark: UiColours = {
    bg: lch(0.17, 0.01, inkHue.h),
    surface: lch(0.22, 0.012, inkHue.h),
    surface2: lch(0.27, 0.012, inkHue.h),
    line: lch(0.32, 0.012, inkHue.h),
    text: lch(0.96, 0.005, inkHue.h),
    text2: lch(0.76, 0.01, inkHue.h),
    text3: lch(0.6, 0.012, inkHue.h),
    bar: lch(0.36, 0.012, inkHue.h),
    app: appD,
    appText: lch(0.16, 0.02, h),
    appSoft: mixOk(appD, lch(0.17, 0.01, inkHue.h), 0.78),
    appDeep: mixOk(appD, '#FFFFFF', 0.15),
    success: lch(0.72, 0.15, 150),
    successSoft: lch(0.3, 0.05, 150),
    error: lch(0.68, 0.17, 25),
    errorSoft: lch(0.3, 0.06, 25),
    hot: lch(0.66, 0.19, 18),
    star: lch(0.82, 0.15, 80),
    starOff: lch(0.4, 0.01, 80),
    knob: '#FFFFFF',
    track: lch(0.36, 0.012, inkHue.h),
    scrim: '#000000',
    shade: '#000000',
    key: lch(0.42, 0.012, inkHue.h),
  };
  return { light, dark, theme };
}

// ── Numbers and words ─────────────────────────────────────────────────────

export const r1 = (n: number): number => Math.round(n * 10) / 10;
export const f1 = (n: number): string => {
  const v = r1(n);
  return Object.is(v, -0) ? '0' : String(v);
};

/** Text made safe for markup: what a model wrote is never markup. */
export const esc = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A name made into the stem of a part's id: "Dark mode" is "dark-mode". */
export function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

/** How wide words are set at a size (the reading face's advances). */
export function widthOf(
  text: string,
  size: number,
  weight: 600 | 700 = 600,
): number {
  return measureText(text, size, weight) * 1.02;
}

/** Words cut to fit a width at a size: whole words first, a word's own letters only when one alone is too long. */
export function fitWords(
  text: string,
  width: number,
  size: number,
  weight: 600 | 700 = 600,
): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (widthOf(next, size, weight) > width) break;
    out = next;
  }
  if (out || !words.length) return out;
  let cut = words[0];
  while (cut.length > 1 && widthOf(`${cut}…`, size, weight) > width)
    cut = cut.slice(0, -1);
  return `${cut}…`;
}

// ── Painting by role ──────────────────────────────────────────────────────

/** A paint attribute (fill or stroke) by role: the screen's theme's colour, and both themes' when they differ. */
export function paint(
  pal: UiPalette,
  role: UiRole,
  what: 'fill' | 'stroke' = 'fill',
): string {
  const now = pal[pal.theme][role];
  const l = pal.light[role];
  const d = pal.dark[role];
  return l === d
    ? `${what}="${now}"`
    : `${what}="${now}" data-${what}-light="${l}" data-${what}-dark="${d}"`;
}

/** A rounded rectangle by role. */
export function rect(
  pal: UiPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  role: UiRole,
  extra = '',
): string {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}"${rr ? ` rx="${f1(rr)}"` : ''} ${paint(pal, role)}${extra ? ` ${extra}` : ''}/>`;
}

/** A rounded rectangle's outline by role. */
export function outline(
  pal: UiPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  role: UiRole,
  width: number,
  extra = '',
): string {
  const rr = clamp(r, 0, Math.min(w, h) / 2);
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"${rr ? ` rx="${f1(rr)}"` : ''} fill="none" ${paint(pal, role, 'stroke')} stroke-width="${f1(width)}"${extra ? ` ${extra}` : ''}/>`;
}

export function circle(
  pal: UiPalette,
  cx: number,
  cy: number,
  r: number,
  role: UiRole,
  extra = '',
): string {
  return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" ${paint(pal, role)}${extra ? ` ${extra}` : ''}/>`;
}

/** A grey bar where words would be: the wireframe's text. */
export function bar(
  pal: UiPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  role: UiRole = 'bar',
): string {
  return rect(pal, x, y, w, h, h / 2, role);
}

/** One line of words by role, its baseline at y. */
export function words(
  pal: UiPalette,
  x: number,
  y: number,
  text: string,
  size: number,
  weight: 400 | 500 | 600 | 700 | 800,
  role: UiRole,
  anchor: 'start' | 'middle' | 'end' = 'start',
  extra = '',
): string {
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(size)}" font-weight="${weight}" ${paint(pal, role)}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${extra ? ` ${extra}` : ''}>${esc(text)}</text>`;
}

/** The box a line of words covers, its baseline at y. */
export function wordsBox(
  x: number,
  y: number,
  text: string,
  size: number,
  weight: 600 | 700,
  anchor: 'start' | 'middle' | 'end' = 'start',
): ShotBox {
  const w = widthOf(text, size, weight);
  const left = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
  return [r1(left), r1(y - 0.78 * size), r1(w), r1(size)];
}

/** A soft shadow under a rounded card, drawn as a few faint layers (no filter, so the camera moves it for free). */
export function softShadow(
  pal: UiPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  depth: number,
  strength = 1,
): string {
  const layers = [
    { grow: depth * 0.9, dy: depth * 0.9, o: 0.035 },
    { grow: depth * 0.5, dy: depth * 0.55, o: 0.05 },
    { grow: depth * 0.2, dy: depth * 0.25, o: 0.06 },
  ];
  const dark = pal.theme === 'dark';
  return layers
    .map(
      (one) =>
        `<rect x="${f1(x - one.grow)}" y="${f1(y - one.grow + one.dy)}" width="${f1(w + 2 * one.grow)}" height="${f1(h + 2 * one.grow)}" rx="${f1(r + one.grow)}" fill="#0B0D12" opacity="${Math.round(Math.min(1, one.o * strength * (dark ? 2 : 1)) * 1000) / 1000}"/>`,
    )
    .join('');
}

// ── Icons ─────────────────────────────────────────────────────────────────

/**
 * The kit's icons: plain strokes on a 24-unit grid (round ends), the
 * common marks of any interface, none of them a brand's.
 */
const ICONS: Record<string, { d: string; fill?: boolean }> = {
  back: { d: 'M15 5l-7 7 7 7' },
  forward: { d: 'M9 5l7 7-7 7' },
  more: { d: 'M5 12h.01M12 12h.01M19 12h.01' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  menu: { d: 'M4 7h16M4 12h16M4 17h16' },
  search: {
    d: 'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5L20 20',
  },
  heart: {
    d: 'M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.8 6.4 4.5c2-.2 3.6 1 4.6 2.6 1-1.6 2.6-2.8 4.6-2.6 3.4.3 5.2 3.8 3.6 6.9C19 15.6 12 20 12 20z',
  },
  heartFill: {
    d: 'M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.8 6.4 4.5c2-.2 3.6 1 4.6 2.6 1-1.6 2.6-2.8 4.6-2.6 3.4.3 5.2 3.8 3.6 6.9C19 15.6 12 20 12 20z',
    fill: true,
  },
  star: {
    d: 'M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.4 2.85 1-6L3.3 9.6l6-.9z',
    fill: true,
  },
  check: { d: 'M5 12.5l4.2 4.2L19 7' },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  bell: {
    d: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  },
  home: { d: 'M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5' },
  user: {
    d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.7 3.8-5.5 7.5-5.5s6.7 1.8 7.5 5.5',
  },
  gear: {
    d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
  },
  chart: { d: 'M5 19V11M10 19V6M15 19v-9M20 19V14M3 19.5h18' },
  chevron: { d: 'M9.5 6l6 6-6 6' },
  lock: { d: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' },
  cart: { d: 'M3.5 4.5h2.5l2.2 10.5h9.6l2-7.5H7M9.5 20h.01M17 20h.01' },
  send: { d: 'M4 12l16-8-6 16-2.5-6.5z' },
  truck: {
    d: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 19zM17.5 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  },
  leaf: { d: 'M5 19c0-8 5-14 15-14 0 9-6 14-13 14zM5 19l8-8' },
  drop: { d: 'M12 3.5s6 6.7 6 10.6a6 6 0 0 1-12 0c0-3.9 6-10.6 6-10.6z' },
  globe: {
    d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z',
  },
  comment: {
    d: 'M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.4A7.5 7.5 0 1 1 20 12z',
  },
  share: { d: 'M12 4v11M8 8l4-4 4 4M5 13v6h14v-6' },
  bookmark: { d: 'M7 4h10v16l-5-3.5L7 20z' },
  moon: { d: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z' },
  sun: {
    d: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  },
  mail: { d: 'M3.5 6h17v12h-17zM4 6.5l8 6.5 8-6.5' },
  play: { d: 'M8 5.5v13l10.5-6.5z', fill: true },
  wifi: {
    d: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0M12 19h.01',
  },
  bolt: { d: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z', fill: true },
  tag: { d: 'M3.5 12.5V4.5h8l9 9-8 8zM8 8.5h.01' },
  percent: {
    d: 'M18 6L6 18M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
  alert: { d: 'M12 8v5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
  eye: {
    d: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  },
  sliders: { d: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5' },
  grid: { d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  folder: { d: 'M3.5 6.5h6l2 2h9v10h-17z' },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8.5 3.5v4M15.5 3.5v4' },
  image: { d: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01' },
};

export const ICON_NAMES = Object.keys(ICONS);

/** An icon by name, `size` units square with its top left at (x, y), in a role's colour. */
export function icon(
  pal: UiPalette,
  name: string,
  x: number,
  y: number,
  size: number,
  role: UiRole,
  weight = 2,
  extra = '',
): string {
  const found = ICONS[name] ?? ICONS.more;
  const k = size / 24;
  const style = found.fill
    ? `${paint(pal, role)} stroke="none"`
    : `fill="none" ${paint(pal, role, 'stroke')} stroke-width="${f1(weight)}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<path d="${found.d}" transform="translate(${f1(x)} ${f1(y)}) scale(${Math.round(k * 1000) / 1000})" ${style}${extra ? ` ${extra}` : ''}/>`;
}

/**
 * An image's place on a screen: no photograph, a calm placeholder in the
 * app's colours (a soft wash, a mountain and a sun), the way design tools
 * show a picture still to come. It wears the same colours in both themes.
 */
export function placeholder(
  pal: UiPalette,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  seed: number,
): { defs: string; markup: string } {
  const app = pal.light.app;
  const { h: hue } = hueOf(app);
  // Each placeholder its own wash: the app's hue, turned a little by its seed.
  const turnBy = ((seed % 7) - 3) * 9;
  const top = lch(0.9, 0.05, hue + turnBy);
  const low = lch(0.78, 0.09, hue + turnBy + 20);
  const glyph = lch(0.97, 0.02, hue + turnBy);
  const far = lch(0.84, 0.07, hue + turnBy + 10);
  const grad = `${id}-wash`;
  const defs = `<linearGradient id="${grad}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient>`;
  const s = Math.min(w, h);
  const cx = x + w / 2;
  const base = y + h * 0.74;
  // Two hills and a sun, as a picture's sign.
  const hills = `<path d="M${f1(x)} ${f1(base + s * 0.08)} Q${f1(x + w * 0.28)} ${f1(base - s * 0.3)} ${f1(x + w * 0.52)} ${f1(base + s * 0.02)} T${f1(x + w)} ${f1(base - s * 0.08)} V${f1(y + h)} H${f1(x)} Z" fill="${far}"/>`;
  const near = `<path d="M${f1(x)} ${f1(base + s * 0.2)} Q${f1(x + w * 0.42)} ${f1(base - s * 0.12)} ${f1(x + w)} ${f1(base + s * 0.16)} V${f1(y + h)} H${f1(x)} Z" fill="${glyph}" opacity="0.55"/>`;
  const sun = `<circle cx="${f1(cx + w * 0.2)}" cy="${f1(y + h * 0.32)}" r="${f1(s * 0.09)}" fill="${glyph}" opacity="0.9"/>`;
  const clip = `${id}-clip`;
  const clipDef = `<clipPath id="${clip}"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"${r ? ` rx="${f1(r)}"` : ''}/></clipPath>`;
  return {
    defs: defs + clipDef,
    markup: `<g clip-path="url(#${clip})"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="url(#${grad})"/>${hills}${near}${sun}</g>`,
  };
}
