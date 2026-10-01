/**
 * Words struck out and replaced: a decision changed, a promise rewritten
 * ("IF" becomes "HOW"; "1956" becomes "AS SOON AS PRACTICABLE"). The words
 * that stood come on first; on the cue (the state "replaced"), a line
 * strikes through them, they dim, and the new words are written under
 * them in the show's colour, as an editor corrects a page.
 */
import { measureText } from './scene-font';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  fitWords,
  r1,
  roomOf,
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';

export interface StrikeSpec {
  /** The words that stood. */
  from: string;
  /** The words that replace them. */
  to: string;
  /** A few words over them, small: "The motion", "The plan". */
  label: string | null;
  colour: PaletteToken | null;
}

/** Words struck out as the writer gives them. */
export interface StrikeDraft {
  from: string | null;
  to: string | null;
  label: string | null;
}

/** The state that strikes the words out and writes the new ones. */
export const STRIKE_REPLACED = 'replaced';

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** Words struck out made sound, or null without both. */
export function readStrike(
  raw: StrikeDraft | null | undefined,
  extra: { colour?: unknown } = {},
): StrikeSpec | null {
  const from = clean(raw?.from, 40);
  const to = clean(raw?.to, 40);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  return {
    from,
    to,
    label: clean(raw?.label, 32) || null,
    colour: tokenOf(extra.colour),
  };
}

export const strikePartNames = (spec: StrikeSpec): string[] => [
  spec.from,
  'old',
  ...(spec.label ? ['label'] : []),
];
/** Its state, by its own name or by the new words. */
export const strikeStateNames = (spec: StrikeSpec): string[] => [
  STRIKE_REPLACED,
  spec.to,
  'new',
];

/** Words struck out and replaced, drawn: the old words a part, the new a state. */
export function renderStrike(
  spec: StrikeSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const width = room.w;
  const colour = colourOr(spec.colour, PAPER.accent);
  const tall = shape === 'tall';
  const labelH = spec.label ? text * 1.9 : 0;
  // The two lines share the room: the old words as large as fit, the new
  // ones as large or larger, each at most three lines.
  const share = (room.h - labelH) / 2.2;
  const old = fitWords(
    spec.from,
    width * 0.9,
    Math.min(share * 0.9, tall ? 150 : 190),
    text * 1.4,
    3,
  );
  const fresh = fitWords(
    spec.to,
    width * 0.9,
    Math.min(share * 0.95, tall ? 160 : 200),
    text * 1.4,
    3,
  );
  const oldH = old.lines.length * old.size * 1.1;
  const freshH = fresh.lines.length * fresh.size * 1.1;
  const gap = text * 0.8;
  const top = labelH;
  const out: string[] = [
    styleOf({
      rise: 'animation:ig-rise .45s cubic-bezier(.2,.8,.3,1) both',
      show: 'animation:ig-show .3s ease-out both',
      dim: 'animation:ig-dim .35s ease-out both',
      strike: 'animation:ig-draw .4s cubic-bezier(.6,0,.4,1) both',
      write: 'animation:ig-wipe .55s cubic-bezier(.4,0,.2,1) both',
    }),
  ];
  const parts: Record<string, string> = {};
  if (spec.label) {
    parts.label = 'strike-label';
    out.push(
      `<g id="strike-label" class="show" style="${delayOf(0.1)}">${textLines([spec.label.toUpperCase()], width / 2, text * 1.05, text, { weight: 700, fill: PAPER.muted, spacing: text * 0.08 })}</g>`,
    );
  }
  const oldTop = top;
  out.push(
    `<g id="strike-old"><g class="rise" style="${delayOf(0.15)}">${textLines(old.lines, width / 2, oldTop + old.size * 0.86, old.size, { fill: PAPER.ink, leading: 1.1 })}</g></g>`,
  );
  parts[spec.from] = 'strike-old';
  parts.old = 'strike-old';
  // The strike: one line through each of the old words' lines, drawn across.
  const stroke = Math.max(strokeOf(text) * 1.6, old.size * 0.085);
  const strikes = old.lines
    .map((line, i) => {
      const w = measureText(line, old.size, 700) + old.size * 0.2;
      const y = oldTop + old.size * 0.86 + i * old.size * 1.1 - old.size * 0.3;
      const x = (width - w) / 2;
      const length = Math.ceil(w) + 4;
      return `<path class="strike" style="--l:${length};stroke-dasharray:${length} ${length};${delayOf(0.05 + i * 0.12)}" d="M${r1(x)} ${r1(y + stroke * 0.3)}L${r1(x + w)} ${r1(y - stroke * 0.3)}" stroke="${PAPER.bad}" stroke-width="${r1(stroke)}" stroke-linecap="round"/>`;
    })
    .join('');
  const freshTop = oldTop + oldH + gap;
  const oldW =
    Math.max(...old.lines.map((l) => measureText(l, old.size, 700))) +
    old.size * 0.4;
  out.push(
    `<g id="strike-new">` +
      // The old words dimmed: the paper over them (no wider), part seen through.
      `<rect class="dim" style="--dim:.5" opacity="0.5" x="${r1((width - oldW) / 2)}" y="${r1(oldTop)}" width="${r1(oldW)}" height="${r1(oldH + old.size * 0.1)}" fill="${PAPER.paper}"/>` +
      strikes +
      `<g class="write" style="${delayOf(0.45)}">${textLines(fresh.lines, width / 2, freshTop + fresh.size * 0.86, fresh.size, { fill: colour, leading: 1.1 })}</g>` +
      `</g>`,
  );
  const states: Record<string, string> = {
    [STRIKE_REPLACED]: 'strike-new',
    [spec.to]: 'strike-new',
    new: 'strike-new',
  };
  const bottom = freshTop + freshH + text * 0.3;
  const viewBox: [number, number, number, number] = [
    0,
    r1(-text * 0.3),
    width,
    r1(bottom + text * 0.3),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
