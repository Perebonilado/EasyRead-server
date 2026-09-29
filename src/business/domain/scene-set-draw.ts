/**
 * How a set's pieces are drawn, shared by the pieces L3 adds (scene-set-
 * kit, scene-set-buildings, scene-set-landmarks): the figure kit's hand,
 * at its own size (a grown-up stands 224 tall, about 1.7 m, so a metre is
 * about 132 of its units), standing on the ground at y = 0 with their
 * middle at x = 0; flat colours from the house's own, the kit's outline
 * round each shape (set once, on the group round a piece), and marks
 * with none.
 */
import { FIGURE_INK } from './scene-ink';
import type { SetPiece } from './scene-set-pieces';

/** The kit's units in a metre: a grown-up is 224 tall, about 1.7 m. */
export const KIT_M = 224 / 1.7;
/** Metres in the kit's units. */
export const m = (n: number): number => n * KIT_M;

export const LINE = 2.6;
export const r1 = (n: number): number => Math.round(n * 10) / 10;
export const fill = (colour: string): string => `fill="${colour}"`;
export const flat = (colour: string): string =>
  `fill="${colour}" stroke="none"`;
export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  round = 2,
): string =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${round}" ${fill(colour)}/>`;
/** A rectangle with no outline: a mark on a wall, a band. */
export const flatRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  round = 0,
): string =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${round ? ` rx="${round}"` : ''} ${flat(colour)}/>`;
export const circle = (
  x: number,
  y: number,
  r: number,
  colour: string,
): string =>
  `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" ${fill(colour)}/>`;
export const ellipse = (
  x: number,
  y: number,
  rx: number,
  ry: number,
  colour: string,
): string =>
  `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" ${fill(colour)}/>`;
export const shape = (d: string, colour: string): string =>
  `<path d="${d}" ${fill(colour)}/>`;
export const flatShape = (d: string, colour: string): string =>
  `<path d="${d}" ${flat(colour)}/>`;
/** A line, round at its ends: an ink line, or a coloured one. */
export const line = (d: string, colour: string, width: number): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A polygon's path from its points. */
export const poly = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L')} Z`;
/** The flat shadow a piece casts where it stands. */
export const shadowOf = (rx: number): string =>
  `<ellipse cx="0" cy="0" rx="${r1(rx)}" ry="6" ${flat('#1d1a22')} fill-opacity="0.12"/>`;

/** Drawn with the kit's outline, framed with room for it: its frame is its reach, for spacing it apart (what reaches past it, a pole's wires, is drawn all the same). */
export function framed(
  markup: string,
  [x, y, w, h]: [number, number, number, number],
): Pick<SetPiece, 'svg' | 'viewBox'> {
  const viewBox: [number, number, number, number] = [
    r1(x - 4),
    r1(y - 4),
    r1(w + 8),
    r1(h + 8),
  ];
  return {
    viewBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">${markup}</g></svg>`,
  };
}

/** A palm's crown of fronds about its top, drooping, and its coconuts or dates. */
export function palmCrown(
  cx: number,
  cy: number,
  k: number,
  leaf: string,
  dark: string,
  fruit: string,
): string {
  const frond = (dx: number, dy: number, colour: string) =>
    shape(
      `M${r1(cx)},${r1(cy)} Q${r1(cx + dx * 0.45 * k)},${r1(cy - 46 * k + dy * 0.2 * k)} ${r1(cx + dx * k)},${r1(cy + dy * k)} Q${r1(cx + dx * 0.5 * k)},${r1(cy - 14 * k + dy * 0.3 * k)} ${r1(cx)},${r1(cy + 12 * k)} Z`,
      colour,
    );
  return (
    frond(-170, 70, dark) +
    frond(180, 80, dark) +
    frond(-120, 130, leaf) +
    frond(140, 140, leaf) +
    frond(-60, -50, leaf) +
    frond(90, -40, leaf) +
    [
      [-8, 16],
      [10, 20],
      [0, 30],
    ]
      .map(([x, y]) => circle(cx + x * k, cy + y * k, 10 * k, fruit))
      .join('')
  );
}
