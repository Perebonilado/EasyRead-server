/**
 * A show's colours (infographic-editor-plan §3, stage 6a): each recurring
 * thing (a region, a party, a side, a substance) keeps one colour in every
 * scene and in every look. A colour is named by its theme token, never by
 * a hex: code draws a token in the paper theme's colour for it, and the
 * player's recolouring (scene-themes codeColour) gives each theme its own
 * for the same token, so "the North is chart 1" holds on a dark board as
 * it does on paper.
 *
 * A palette is checked as theme-check checks a theme: no two things'
 * colours too close for a viewer with deuteranopia or protanopia (Machado,
 * Oliveira and Fernandes 2009), in any of the looks. Code picks colours
 * that stay apart, keeps one back for the payoff, and never gives a side
 * the colour of right or wrong.
 */
import {
  PAPER,
  THEMES,
  THEME_IDS,
  deltaE2000,
  hexRgb,
  labOf,
  type ExplainerTheme,
  type ThemeId,
} from './scene-themes';
import { CHART_APART, seenWith, type Deficiency } from './theme-check';

/** The theme tokens a thing may be coloured with: what a show's palette names. */
export const PALETTE_TOKENS = [
  'accent',
  'accent2',
  'chart0',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
  'good',
  'bad',
  'muted',
] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];

export const isPaletteToken = (value: unknown): value is PaletteToken =>
  typeof value === 'string' &&
  (PALETTE_TOKENS as readonly string[]).includes(value);

/**
 * A token as a writer or a show's world names it ("chart 2", "Chart-2",
 * "accent 2", "grey"), or null for anything that is not one. A hex is
 * never a token: a colour outside the theme would not change with it.
 */
export function tokenOf(value: unknown): PaletteToken | null {
  if (typeof value !== 'string') return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (isPaletteToken(key)) return key;
  const chart = /^(?:chart|colou?r|series)([0-5])$/.exec(key);
  if (chart) return `chart${chart[1]}` as PaletteToken;
  if (key === 'accent1' || key === 'primary') return 'accent';
  if (key === 'secondary') return 'accent2';
  if (key === 'grey' || key === 'gray' || key === 'neutral') return 'muted';
  return null;
}

/** A token's colour in a theme. */
export function tokenColour(
  token: PaletteToken,
  theme: ExplainerTheme = PAPER,
): string {
  const chart = /^chart([0-5])$/.exec(token);
  if (chart) return theme.chart[Number(chart[1])];
  return theme[token as 'accent' | 'accent2' | 'good' | 'bad' | 'muted'];
}

/**
 * The colour code draws a token in: the paper theme's, which every other
 * theme's recolouring turns into its own colour for the same token.
 */
export const paperColour = (token: PaletteToken): string =>
  tokenColour(token, PAPER);

/** A token's paper colour, or the fallback when there is no token. */
export const colourOr = (
  token: PaletteToken | null | undefined,
  fallback: string,
): string => (token ? paperColour(token) : fallback);

// ── A show's palette ───────────────────────────────────────────────────────

/**
 * A name reduced to its words, for matching ("The Northern Region" and
 * "northern region" are one): lower case, accents and marks gone, a
 * leading "the" dropped.
 */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  return words.join(' ');
}

/** One thing's colour in a show: its name as the show says it, and its token. */
export interface PaletteEntry {
  thing: string;
  token: PaletteToken;
}

/** The most things one show colours: past this, colours stop telling things apart. */
export const PALETTE_MOST = 8;

/**
 * A palette made sound from what a model or a stored show gave: each
 * entry a thing's name and a known token, the first entry for a name
 * kept, at most PALETTE_MOST.
 */
export function paletteOf(raw: unknown): PaletteEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PaletteEntry[] = [];
  const seen = new Set<string>();
  for (const one of raw) {
    if (!one || typeof one !== 'object') continue;
    const { thing, token } = one as { thing?: unknown; token?: unknown };
    const name =
      typeof thing === 'string' ? thing.replace(/\s+/g, ' ').trim() : '';
    const colour = tokenOf(token);
    const key = nameKey(name);
    if (!name || !colour || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ thing: name.slice(0, 60), token: colour });
    if (out.length >= PALETTE_MOST) break;
  }
  return out;
}

/**
 * A palette as a lookup by name: the token of the thing a name means,
 * or null. A name is the thing when their words are the same, or when
 * one's words stand whole inside the other's ("the North" in "the North's
 * members", "Northern Region" for "the Northern Region (NPC)"); the
 * longest such match wins, so "North East" is not taken for "North".
 */
export function paletteLookup(
  palette: readonly { thing: string; token: string }[],
): (name: string | null | undefined) => PaletteToken | null {
  const keyed = palette.flatMap((entry) => {
    const token = tokenOf(entry.token);
    const key = nameKey(entry.thing);
    return token && key ? [{ key, token }] : [];
  });
  return (name) => {
    const key = nameKey(name ?? '');
    if (!key) return null;
    const exact = keyed.find((one) => one.key === key);
    if (exact) return exact.token;
    let best: { key: string; token: PaletteToken } | null = null;
    for (const one of keyed) {
      const inside =
        ` ${key} `.includes(` ${one.key} `) ||
        ` ${one.key} `.includes(` ${key} `);
      if (inside && (!best || one.key.length > best.key.length)) best = one;
    }
    return best?.token ?? null;
  };
}

// ── Telling colours apart ──────────────────────────────────────────────────

/** How a palette is looked at: with ordinary sight, and as the two red–green deficiencies see it. */
export const SIGHTS: ('normal' | Deficiency)[] = [
  'normal',
  'deuteranopia',
  'protanopia',
];

/** Two of a palette's colours that a viewer could take for one another. */
export interface PaletteClash {
  a: PaletteToken;
  b: PaletteToken;
  theme: ThemeId;
  seenAs: 'normal' | Deficiency;
  /** How far apart they look (CIEDE2000). */
  apart: number;
}

const labCache = new Map<string, ReturnType<typeof labOf>>();
/** A colour as a viewer sees it, in L*a*b*. */
function seen(hex: string, sight: 'normal' | Deficiency) {
  const key = `${hex}|${sight}`;
  const kept = labCache.get(key);
  if (kept) return kept;
  const lab = labOf(
    sight === 'normal' ? (hexRgb(hex) ?? [0, 0, 0]) : seenWith(hex, sight),
  );
  labCache.set(key, lab);
  return lab;
}

/**
 * The pairs of tokens a viewer could not tell apart in a theme: closer
 * than `least` (CIEDE2000; CHART_APART, as the chart colours are held to)
 * with ordinary sight, or as deuteranopia or protanopia sees them.
 */
export function tooClose(
  tokens: readonly PaletteToken[],
  theme: ExplainerTheme = PAPER,
  least = CHART_APART,
): PaletteClash[] {
  const out: PaletteClash[] = [];
  const uniq = [...new Set(tokens)];
  for (let i = 0; i < uniq.length; i += 1)
    for (let j = i + 1; j < uniq.length; j += 1) {
      const a = tokenColour(uniq[i], theme);
      const b = tokenColour(uniq[j], theme);
      for (const sight of SIGHTS) {
        const apart = deltaE2000(seen(a, sight), seen(b, sight));
        if (apart < least) {
          out.push({
            a: uniq[i],
            b: uniq[j],
            theme: theme.id,
            seenAs: sight,
            apart: Math.round(apart * 10) / 10,
          });
          break;
        }
      }
    }
  return out;
}

/** The pairs too close in any of the looks a show may play in. */
export function clashesInEveryTheme(
  tokens: readonly PaletteToken[],
  least = CHART_APART,
): PaletteClash[] {
  return THEME_IDS.flatMap((id) => tooClose(tokens, THEMES[id], least));
}

/**
 * The order colours are given to a show's things. The chart's six are the
 * only colours every look keeps apart for colour-blind viewers (each
 * theme's accent is near one of them somewhere: cleanlab's is a blue,
 * nightsky's an amber), so things get five of them; grey, the second
 * accent and the accent come only past five things, when some confusion
 * cannot be helped. Right and wrong's colours (good, bad) never stand for
 * a side.
 */
export const GIVE_ORDER: readonly PaletteToken[] = [
  'chart0',
  'chart1',
  'chart2',
  'chart4',
  'chart5',
  'muted',
  'accent2',
  'accent',
];

/**
 * The colour a show keeps back for its payoff: the chart's sixth, its red,
 * apart from the other five in every look, so the payoff stands out from
 * every side, and no side is ever the red one.
 */
export const HELD_TOKEN: PaletteToken = 'chart3';

/**
 * The colours a show's other groups may take (a bar, a bloc of seats, a
 * side) when the palette does not name them: those it has not given to a
 * thing, never the held one, in the chart's order.
 */
export function freeTokens(
  palette: readonly { token: string }[],
  held: PaletteToken = HELD_TOKEN,
): PaletteToken[] {
  const used = new Set(palette.map((entry) => entry.token));
  const free = GIVE_ORDER.filter((t) => t !== held && !used.has(t));
  return free.length ? free : GIVE_ORDER.filter((t) => t !== held);
}

/**
 * Colours for a show's things, in the order they are named: each the
 * first of GIVE_ORDER still free that no colour already given could be
 * taken for, in any look; where none is left, the least confusable. One
 * colour is held back for the payoff and given to nothing. Things already
 * coloured (`keep`) keep theirs, so a new episode never recolours what
 * the last one showed.
 */
export function pickPalette(
  things: readonly string[],
  options: { held?: PaletteToken; keep?: readonly PaletteEntry[] } = {},
): { palette: PaletteEntry[]; held: PaletteToken } {
  const held = options.held ?? HELD_TOKEN;
  const palette: PaletteEntry[] = [...(options.keep ?? [])];
  const lookup = paletteLookup(palette);
  for (const thing of things) {
    const name = thing.replace(/\s+/g, ' ').trim();
    if (!name || lookup(name) || palette.length >= PALETTE_MOST) continue;
    const used = palette.map((entry) => entry.token);
    const free = GIVE_ORDER.filter((t) => t !== held && !used.includes(t));
    const token =
      free.find((t) => !clashesInEveryTheme([...used, t]).length) ??
      [...free].sort(
        (x, y) =>
          clashesInEveryTheme([...used, x]).length -
          clashesInEveryTheme([...used, y]).length,
      )[0] ??
      GIVE_ORDER[palette.length % GIVE_ORDER.length];
    palette.push({ thing: name.slice(0, 60), token });
  }
  return { palette, held };
}

/**
 * A palette mended without a word (Richard: fixes stay silent): the held
 * colour, right and wrong's colours and any colour a viewer could take for
 * one given before it are each given the next free colour instead; the
 * first thing to have a colour keeps it.
 */
export function mendPalette(
  palette: readonly PaletteEntry[],
  held: PaletteToken = HELD_TOKEN,
): { palette: PaletteEntry[]; held: PaletteToken; mended: string[] } {
  const out: PaletteEntry[] = [];
  const mended: string[] = [];
  for (const entry of palette.slice(0, PALETTE_MOST)) {
    const used = out.map((one) => one.token);
    const wrong =
      entry.token === held ||
      entry.token === 'good' ||
      entry.token === 'bad' ||
      used.includes(entry.token) ||
      clashesInEveryTheme([...used, entry.token]).length > 0;
    if (!wrong) {
      out.push(entry);
      continue;
    }
    const free = GIVE_ORDER.filter((t) => t !== held && !used.includes(t));
    const token =
      free.find((t) => !clashesInEveryTheme([...used, t]).length) ??
      free[0] ??
      entry.token;
    if (token !== entry.token)
      mended.push(`${entry.thing}: ${entry.token} is now ${token}`);
    out.push({ thing: entry.thing, token });
  }
  return { palette: out, held, mended };
}
