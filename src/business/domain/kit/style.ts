/**
 * The kit's style tokens (explainer-animation-tech §4.2): how a piece is
 * drawn in the show's look, from the look's own colours, so a silhouette,
 * a vehicle or a character belongs to the same picture as the map and the
 * charts beside it.
 *
 *  - Line: none for the editorial look (flat shapes, no outlines); a
 *    clean dark outline for the illustrated one (its characters, WP17).
 *  - Fills by role, worked out from one colour (a side's, or the ink):
 *    the body, a darker shade for what is further from the light, the
 *    rim's lighter edge, glass, the dark of a tyre, metal, a lamp's light.
 *  - A rim light: a lighter edge on the side the light comes from, the
 *    same direction on every piece of a film (the upper left by default).
 *  - The air: far things fade into it a little (a crowd's back rows): the
 *    paper on a page or a map, a drawn set's low sky; the paper's own
 *    grain lies over everything on the stage.
 *  - Corner radius, and a soft shadow on the ground under each piece.
 *
 * Colours are mixed in OKLab, so a tint keeps its hue.
 */
import type { FilmShape, ShotLookDto } from '../../../contracts';

/** The two looks a show can have (tech §11): editorial silhouettes, or illustrated characters. */
export type KitLook = 'editorial' | 'illustrated';
export const KIT_LOOKS: readonly KitLook[] = ['editorial', 'illustrated'];

export interface KitStyle {
  look: KitLook;
  /** The frame the film is made in first: a piece may lay itself out for it (a crowd deeper in a tall frame). */
  shape: FilmShape;
  /** The look's text face, for a piece that sets words (a device's screen, ui.ts). */
  face?: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  /** Each side's colour by name (a region, a party), from the look. */
  sides: Record<string, string>;
  /** An outline's weight, in units, for a piece a person tall; 0 draws none. */
  line: number;
  /** The outline's colour. */
  lineColour: string;
  /** The rim light: where it comes from (radians on screen: π is from the left, 3π/2 from above), its width (a share of a person's height), its colour and how far it lightens. */
  rim: { angle: number; width: number; colour: string; strength: number };
  /** The ground shadow: its colour, how dark at its middle, and how flat (its height over its width). */
  shadow: { colour: string; opacity: number; squash: number };
  /** Round corners on boxy things, as a share of their shorter side. */
  radius: number;
  /** How far the farthest things of a piece fade into the air, 0 to 1. */
  haze: number;
  /**
   * The air far things fade into, and the gap that shows between people
   * one behind another: the paper on a page or a map, the low sky of a
   * drawn set (a dusk's mauve, a night's blue).
   */
  air: string;
}

/** The light comes from the upper left, as on most of the house's stills. */
const LIGHT_ANGLE = (225 * Math.PI) / 180;

/**
 * The style a piece is drawn in, from the shot's look. `light` turns the
 * rim's colour (a warm one at dusk), `look` picks the line.
 */
export function kitStyle(
  look: ShotLookDto,
  options: {
    look?: KitLook;
    shape?: FilmShape;
    light?: string;
    air?: string;
  } = {},
): KitStyle {
  const kind = options.look ?? 'editorial';
  const p = look.palette;
  const dark = luminance(p.paper) < 0.35;
  return {
    look: kind,
    shape: options.shape ?? 'wide',
    ...(look.fonts?.text ? { face: look.fonts.text } : {}),
    paper: p.paper,
    ink: p.ink,
    muted: p.muted,
    accent: p.accent,
    sides: { ...p.sides },
    line: kind === 'illustrated' ? 1.6 : 0,
    lineColour: dark
      ? mixOk(p.ink, '#000000', 0.2)
      : mixOk(p.ink, '#000000', 0.35),
    rim: {
      angle: LIGHT_ANGLE,
      width: 0.011,
      colour: options.light ?? (dark ? '#fff1d6' : '#fff6e8'),
      strength: dark ? 0.42 : 0.3,
    },
    shadow: {
      colour: dark ? '#000000' : mixOk(p.ink, '#000000', 0.4),
      opacity: dark ? 0.45 : 0.22,
      squash: 0.16,
    },
    radius: 0.12,
    haze: dark ? 0.35 : 0.42,
    air: options.air ?? p.paper,
  };
}

/** The colours a piece is filled with, all from one: its side's, or the ink. */
export interface KitFills {
  /** The part nearest the light, and most of it. */
  body: string;
  /** What lies further back: the far arm and leg, a carriage's side in shadow. */
  shade: string;
  /** The lit edge. */
  rim: string;
  /** Windows: a pale tint of the paper. */
  glass: string;
  /** Tyres, a hull's waterline, soot. */
  dark: string;
  /** Wheels' hubs, rails, a funnel's band. */
  metal: string;
  /** A lamp, a lit window at dusk. */
  light: string;
}

/** A colour by a side's name or a role ("ink", "muted", "accent"), the ink when it is neither. */
export function colourOf(style: KitStyle, name: string | undefined): string {
  if (!name) return style.ink;
  if (name === 'ink') return style.ink;
  if (name === 'muted') return style.muted;
  if (name === 'accent') return style.accent;
  if (name === 'paper') return style.paper;
  const side = Object.keys(style.sides).find(
    (s) => s.toLowerCase() === name.toLowerCase(),
  );
  return side
    ? style.sides[side]
    : /^#[0-9a-f]{3,8}$/i.test(name)
      ? name
      : style.ink;
}

/** The fills worked out from a piece's colour. */
export function fillsOf(style: KitStyle, colour: string): KitFills {
  const l = luminance(colour);
  const dark = luminance(style.paper) < 0.35;
  return {
    body: colour,
    shade: l < 0.06 ? mixOk(colour, style.paper, 0.12) : shadeOk(colour, 0.16),
    rim: mixOk(colour, style.rim.colour, style.rim.strength),
    glass: dark
      ? mixOk(style.paper, '#9fb4c8', 0.55)
      : mixOk(style.paper, '#c9d8e4', 0.6),
    dark: dark
      ? mixOk(style.ink, style.paper, 0.75)
      : mixOk(style.ink, '#000000', 0.25),
    metal: mixOk(style.muted, style.paper, 0.25),
    light: '#ffe8a8',
  };
}

/** A colour faded into the air by depth: 0 at the front, the style's haze at the back. */
export const hazed = (style: KitStyle, colour: string, depth: number): string =>
  mixOk(colour, style.air, Math.max(0, Math.min(1, depth)) * style.haze);

// ── Colour ────────────────────────────────────────────────────────────────

/** A hex colour's channels, 0–1; black for anything unreadable. */
export function rgbOf(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '');
  const full =
    h.length === 3 || h.length === 4
      ? h
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function hexOf([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(1, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** WCAG's relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type Lab = [number, number, number];

export function oklabOf(hex: string): Lab {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function hexOfOklab([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return hexOf([
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** A colour `k` of the way to another, in OKLab. */
export function mixOk(a: string, b: string, k: number): string {
  const x = oklabOf(a);
  const y = oklabOf(b);
  const u = Math.max(0, Math.min(1, k));
  return hexOfOklab([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * u) as Lab);
}

/** A colour darkened by `k` of its lightness, its hue kept. */
export function shadeOk(hex: string, k: number): string {
  const [L, A, B] = oklabOf(hex);
  return hexOfOklab([L * (1 - k), A * (1 - k * 0.3), B * (1 - k * 0.3)]);
}
