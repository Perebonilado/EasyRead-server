/**
 * The house style as the artist is told it (PROMPTS.castDraw): samples
 * cut from what code draws (a face on the kit's own rig, a thing and a
 * set piece of the kit's own), the house palette by name, and the line
 * and the least sizes asked for on a canvas. Kept apart from scene-ink,
 * which the kit itself is drawn from, so nothing here is ever loaded
 * before the kit.
 */
import { FIGURE_INK, HOUSE_PALETTE, KIT_LINE } from './scene-ink';
import { rigOf } from './scene-figure';
import { drawProp } from './scene-props';
import { drawPiece } from './scene-set-pieces';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A shadow under a piece: never asked of the artist, so never shown to it. */
const SHADOW = /<ellipse[^>]*fill-opacity="[^"]*"[^>]*\/>/g;

/**
 * A face as the kit draws one, on its own rig: a head, two big white
 * eyes with dot pupils, the neutral face's own group, and where the
 * mouth goes marked, since code draws the mouth.
 */
function faceSample(): string {
  const R = rigOf('adult');
  const { y, dx, rx, ry } = R.eyes;
  const cy = R.cy;
  const top = cy - 46;
  const eye = (side: number) =>
    `<ellipse cx="${r1(side * dx)}" cy="${r1(y)}" rx="${rx}" ry="${ry}" fill="#ffffff"/>` +
    `<circle cx="${r1(side * dx)}" cy="${r1(y + 2)}" r="3.4" fill="${FIGURE_INK}" stroke="none"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-52 ${r1(top - 6)} 104 ${r1(96)}">`,
    `<g stroke="${FIGURE_INK}" stroke-width="${KIT_LINE}" stroke-linejoin="round" stroke-linecap="round">`,
    `<g id="head"><ellipse cx="0" cy="${r1(cy)}" rx="46" ry="40" fill="#e6b893"/></g>`,
    `<g id="neutral">${eye(-1)}${eye(1)}</g>`,
    `<g id="mouth-at"><circle cx="0" cy="${r1(R.mouthY)}" r="4" fill="none"/></g>`,
    '</g></svg>',
  ].join('');
}

/** Samples of the house style, each a small SVG the kit draws: a face, a thing someone carries, a set piece. */
export function houseSamples(): string[] {
  return [
    faceSample(),
    drawProp('bag').svg,
    drawPiece('crate').svg.replace(SHADOW, ''),
  ];
}

/** The house palette in words, for the artist: "brown coat #8b5e3c, …". */
export function paletteWords(): string {
  return HOUSE_PALETTE.map((one) => `${one.name} ${one.hex}`).join(', ');
}

/** What the artist is asked for on a canvas: the outline, and how small eyes and parts may be. */
export interface Asked {
  /** The outline's width, in the canvas's units. */
  line: number;
  /** The least an eye may be across. */
  eyes: number;
  /** The least any part may be across. */
  least: number;
}

/**
 * The kit's eye is 30 of its units across; an animal's reads on the stage
 * down to about half that.
 */
const EYE_UNITS = 15;

/**
 * What to ask for on a canvas `drawnTall` units tall that stands
 * `unitsTall` of the kit's units tall on the stage: the kit's line there,
 * eyes that read beside people's, and no part thinner than four lines.
 */
export function askedFor(drawnTall: number, unitsTall: number): Asked {
  const k = drawnTall / unitsTall;
  const line = r1(KIT_LINE * k);
  return { line, eyes: Math.round(EYE_UNITS * k), least: Math.round(line * 4) };
}
