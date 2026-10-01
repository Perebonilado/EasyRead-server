/**
 * Things moving from one to another: money from the South to the North,
 * papers from a press to its readers, people from a village to a city.
 * Two labelled boxes, and tokens (coins, papers, people, dots) rising out
 * of the first, along an arc, and down into the second, over and over
 * while it is on the stage: the why of a cause shown as a flow.
 *
 * It may end shut ("shut", a state): the flow stops, its arc fades to a
 * dotted trace, and a lid snaps down on the second box.
 */
import { measureText } from './scene-font';
import {
  iconOf,
  iconSymbol,
  iconUse,
  isIconName,
  type IconName,
} from './scene-icon-set';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  escapeXml,
  fitWords,
  r1,
  roomOf,
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';

export interface TransferSpec {
  from: { label: string; colour: PaletteToken | null };
  to: { label: string; colour: PaletteToken | null };
  token: IconName;
  /** A word or two on the arc: "taxes", "petitions". */
  label: string | null;
  /** Whether it can end shut, the flow stopped and the second box closed. */
  shut: boolean;
  /** The tokens' colour. */
  colour: PaletteToken | null;
}

/** Things moving as the writer gives them. */
export interface TransferDraft {
  from: string | null;
  to: string | null;
  token: string | null;
  label: string | null;
  shut: boolean | null;
}

export const TRANSFER_SHUT = 'shut';
/** How many tokens are on the arc at once. */
export const TOKENS_ON_ARC = 5;
/** Seconds one token takes from the first box to the second. */
export const TRANSFER_SECONDS = 2.6;

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** Things moving made sound, or null without both ends. */
export function readTransfer(
  raw: TransferDraft | null | undefined,
  name: string,
  extra: { colour?: unknown } = {},
): TransferSpec | null {
  const from = clean(raw?.from, 32);
  const to = clean(raw?.to, 32);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  const label = clean(raw?.label, 24) || null;
  const token =
    (isIconName(raw?.token) ? raw.token : null) ??
    iconOf(raw?.token) ??
    iconOf(label) ??
    iconOf(name) ??
    'dot';
  return {
    from: { label: from, colour: null },
    to: { label: to, colour: null },
    token,
    label,
    shut: raw?.shut === true,
    colour: tokenOf(extra.colour),
  };
}

export const transferPartNames = (spec: TransferSpec): string[] => [
  spec.from.label,
  spec.to.label,
  'tokens',
  ...(spec.label ? [spec.label] : []),
];
export const transferStateNames = (spec: TransferSpec): string[] =>
  spec.shut ? [TRANSFER_SHUT, 'closed', 'stopped'] : [];

/** Things moving between two boxes, drawn: each box a part, the tokens a part, its end shut a state. */
export function renderTransfer(
  spec: TransferSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const tall = shape === 'tall';
  const width = room.w;
  const stroke = strokeOf(text);
  const boxW = tall ? width * 0.4 : Math.min(width * 0.28, text * 12);
  const boxH = tall ? text * 5.6 : text * 5.2;
  const arcH = tall ? text * 6.5 : text * 5.6;
  const top = arcH + text * 1.2;
  const ax = tall ? width * 0.03 : width * 0.08;
  const bx = width - ax - boxW;
  const fromColour = colourOr(spec.from.colour, PAPER.chart[0]);
  const toColour = colourOr(spec.to.colour, PAPER.chart[1]);
  const tokenColour = colourOr(spec.colour, PAPER.accent);
  const tokenSize = text * (tall ? 1.7 : 1.9);
  // The arc: up out of the first box, over, and down into the second.
  const start = { x: ax + boxW * 0.62, y: top + boxH * 0.35 };
  const end = { x: bx + boxW * 0.38, y: top + boxH * 0.35 };
  const c1 = { x: ax + boxW * 0.7, y: top - arcH * 1.25 };
  const c2 = { x: bx + boxW * 0.3, y: top - arcH * 1.25 };
  const arc = `M${r1(start.x)} ${r1(start.y)}C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(end.x)} ${r1(end.y)}`;
  // The tokens ride the arc centred: their own box's middle on it.
  const motion = `M${r1(start.x - tokenSize / 2)} ${r1(start.y - tokenSize / 2)}C${r1(c1.x - tokenSize / 2)} ${r1(c1.y - tokenSize / 2)} ${r1(c2.x - tokenSize / 2)} ${r1(c2.y - tokenSize / 2)} ${r1(end.x - tokenSize / 2)} ${r1(end.y - tokenSize / 2)}`;
  const arcTop = top - arcH * 0.95;
  const out: string[] = [
    styleOf({
      pop: 'transform-box:fill-box;transform-origin:center;animation:ig-pop .45s cubic-bezier(.2,.8,.3,1.2) both',
      show: 'animation:ig-show .35s ease-out both',
      lid: 'transform-box:fill-box;transform-origin:0 100%;animation:ig-close .5s cubic-bezier(.3,1.3,.5,1) both',
    }),
    `<defs>${iconSymbol(spec.token)}</defs>`,
  ];
  const parts: Record<string, string> = {};
  const states: Record<string, string> = {};
  // The path the tokens take, faint, there as it arrives.
  out.push(
    `<path class="show" style="${delayOf(0.45)}" d="${arc}" fill="none" stroke="${PAPER.grid}" stroke-width="${r1(stroke * 1.4)}" stroke-dasharray="${r1(text * 0.32)} ${r1(text * 0.32)}" stroke-linecap="round"/>`,
  );
  // The tokens: each rising out of the first box in turn, round and round.
  const tokens: string[] = [];
  for (let k = 0; k < TOKENS_ON_ARC; k += 1) {
    const begin = 0.9 + (k * TRANSFER_SECONDS) / TOKENS_ON_ARC;
    tokens.push(
      `<g opacity="0"><set attributeName="opacity" to="1" begin="${begin.toFixed(2)}s" fill="freeze"/>` +
        `<animateMotion dur="${TRANSFER_SECONDS}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite" path="${motion}" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 .05 .55 .95"/>` +
        iconUse(spec.token, 0, 0, tokenSize, tokenColour) +
        `</g>`,
    );
  }
  // Still, as a thumbnail or a picture with no motion shows it, the tokens
  // stand along the arc; once its motion runs they give way at once to
  // those that move.
  const bez = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a +
    3 * (1 - t) ** 2 * t * b +
    3 * (1 - t) * t ** 2 * c +
    t ** 3 * d;
  const still = [0.3, 0.5, 0.7]
    .map((t) =>
      iconUse(
        spec.token,
        bez(t, start.x, c1.x, c2.x, end.x) - tokenSize / 2,
        bez(t, start.y, c1.y, c2.y, end.y) - tokenSize / 2,
        tokenSize,
        tokenColour,
      ),
    )
    .join('');
  out.push(
    `<g id="transfer-tokens"><g><set attributeName="opacity" to="0" begin="0s" fill="freeze"/>${still}</g>${tokens.join('')}</g>`,
  );
  parts.tokens = 'transfer-tokens';
  // The boxes over the tokens' ends: what comes and goes is inside them.
  const box = (
    x: number,
    label: string,
    colour: string,
    id: string,
    delay: number,
  ) => {
    const words = fitWords(label, boxW * 0.84, text * 1.35, text, 2);
    const h = words.lines.length * words.size * 1.15;
    return (
      `<g id="${id}"><g class="pop" style="${delayOf(delay)}">` +
      `<rect x="${r1(x)}" y="${r1(top)}" width="${r1(boxW)}" height="${r1(boxH)}" rx="${r1(text * 0.55)}" fill="${PAPER.card}" stroke="${colour}" stroke-width="${r1(stroke * 1.6)}"/>` +
      textLines(
        words.lines,
        x + boxW / 2,
        top + (boxH - h) / 2 + words.size * 0.88,
        words.size,
        { leading: 1.15 },
      ) +
      `</g></g>`
    );
  };
  out.push(box(ax, spec.from.label, fromColour, 'transfer-from', 0.1));
  out.push(box(bx, spec.to.label, toColour, 'transfer-to', 0.3));
  parts[spec.from.label] = 'transfer-from';
  parts[spec.to.label] = 'transfer-to';
  if (spec.label) {
    // Its words on a patch of paper over the top of the arc.
    const size = text * 1.05;
    const w = measureText(spec.label, size, 700) + size * 1.2;
    const at = { x: width / 2, y: top - arcH * 0.95 };
    out.push(
      `<g id="transfer-label" class="show" style="${delayOf(0.9)}">` +
        `<rect x="${r1(at.x - w / 2)}" y="${r1(at.y - size * 0.85)}" width="${r1(w)}" height="${r1(size * 1.6)}" rx="${r1(size * 0.8)}" fill="${PAPER.paper}" stroke="${PAPER.grid}" stroke-width="${r1(stroke)}"/>` +
        `<text x="${r1(at.x)}" y="${r1(at.y + size * 0.35)}" font-size="${r1(size)}" font-weight="700" fill="${PAPER.ink}" text-anchor="middle">${escapeXml(spec.label)}</text></g>`,
    );
    parts[spec.label] = 'transfer-label';
  }
  if (spec.shut) {
    // Shut: the arc and its tokens covered, a dotted trace where they ran,
    // and a lid down on the second box.
    const coverTop = arcTop - tokenSize;
    const lidH = text * 0.9;
    states[TRANSFER_SHUT] = 'transfer-shut';
    states.closed = 'transfer-shut';
    states.stopped = 'transfer-shut';
    out.push(
      `<g id="transfer-shut">` +
        `<rect class="show" x="${r1(ax - stroke * 2)}" y="${r1(coverTop)}" width="${r1(bx + boxW - ax + stroke * 4)}" height="${r1(top - coverTop - stroke * 1.2)}" fill="${PAPER.paper}"/>` +
        `<rect class="show" x="${r1(ax + boxW + stroke * 1.2)}" y="${r1(top - stroke)}" width="${r1(bx - ax - boxW - stroke * 2.4)}" height="${r1(boxH + stroke * 2)}" fill="${PAPER.paper}"/>` +
        `<path class="show" d="${arc}" fill="none" stroke="${PAPER.grid}" stroke-width="${r1(stroke)}" stroke-dasharray="${r1(stroke)} ${r1(stroke * 2.6)}" stroke-linecap="round"/>` +
        `<g class="lid"><rect x="${r1(bx - stroke * 0.6)}" y="${r1(top - lidH)}" width="${r1(boxW + stroke * 1.2)}" height="${r1(lidH)}" rx="${r1(lidH * 0.35)}" fill="${toColour}"/></g>` +
        `</g>`,
    );
  }
  const viewBox: [number, number, number, number] = [
    0,
    r1(arcTop - tokenSize * 0.9),
    width,
    r1(top + boxH + stroke * 2 - (arcTop - tokenSize * 0.9)),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
