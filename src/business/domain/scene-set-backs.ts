/**
 * Things of a set seen from behind (studio-views-plan §4.2): on a place's
 * reverse side the things on its floor are the same things, mirrored, seen
 * from their backs. Most of the kit's pieces are the same from either side
 * (a table, a stool, a crate, a pot, a tree) and are simply drawn again,
 * the other way round; those whose front is what they show (a bookshelf's
 * books, a wardrobe's doors, a counter's panels, a stall's wares, a desk's
 * shelf) have a back of their own here: the same size and outline, its
 * boards, and nothing of its front. What the artist drew is mirrored.
 */
import { FIGURE_INK, KIT_EXTRAS, SET_COLOURS } from './scene-ink';
import type { SetPiece } from './scene-set-pieces';

const LINE = 2.6;
const r1 = (n: number) => Math.round(n * 10) / 10;
const fill = (colour: string) => `fill="${colour}"`;
const flat = (colour: string) => `fill="${colour}" stroke="none"`;
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  round = 2,
) =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${round}" ${fill(colour)}/>`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const SHADOW = (rx: number) =>
  `<ellipse cx="0" cy="0" rx="${rx}" ry="6" ${flat('#1d1a22')} fill-opacity="0.12"/>`;

const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const PLANK = KIT_EXTRAS.plank;
const METAL = KIT_EXTRAS.metal;
const STEEL = KIT_EXTRAS.steel;
const PAPER = KIT_EXTRAS.paper;
const STONE = SET_COLOURS.stone;
const WHITE = '#ffffff';
/** The stall's awning stripes, as the kit draws them, so a stall's own colour takes to them. */
const STRIPE = '#e0463a';

/** Drawn with the kit's outline, framed with room for it, as the kit frames its pieces. */
function framed(
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

/** The seams between upright boards across a back from x0 to x1, from y0 down to y1. */
function boards(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  colour: string,
): string {
  const step = (x1 - x0) / n;
  return Array.from({ length: n - 1 }, (_, k) => {
    const x = x0 + step * (k + 1);
    return line(`M${r1(x)},${r1(y0)} L${r1(x)},${r1(y1)}`, colour, 2);
  }).join('');
}

/** The kinds that have a back of their own, drawn from behind. */
export const BACK_KINDS = [
  'bookshelf',
  'wardrobe',
  'cupboard',
  'counter',
  'desk',
  'stall',
  'sofa',
] as const;
export type BackKind = (typeof BACK_KINDS)[number];
export const hasBack = (kind: string): kind is BackKind =>
  (BACK_KINDS as readonly string[]).includes(kind);

/**
 * A thing of the set seen from behind, where its back differs from its
 * front: its frame the front's (so it stands where the front would, as
 * big, at the same real height), nothing on it that answers the world; `colour` its own where it has one. Null for a thing the same
 * from either side, which is drawn again as it is, mirrored.
 */
export function backOf(
  kind: string,
  colour: string | null = null,
): Pick<SetPiece, 'svg' | 'viewBox'> | null {
  switch (kind) {
    case 'bookshelf': {
      const wood = colour ?? WOOD;
      return framed(
        SHADOW(58) +
          rect(-54, -172, 108, 172, wood, 3) +
          boards(-54, 54, -168, -4, 4, WOOD_DARK) +
          rect(-54, -172, 108, 8, WOOD_DARK, 2),
        [-54, -172, 108, 172],
      );
    }
    case 'wardrobe': {
      const wood = colour ?? WOOD;
      return framed(
        SHADOW(66) +
          rect(-60, -8, 10, 8, WOOD_DARK, 1) +
          rect(50, -8, 10, 8, WOOD_DARK, 1) +
          rect(-62, -200, 124, 194, wood, 3) +
          boards(-62, 62, -196, -10, 5, WOOD_DARK) +
          rect(-68, -208, 136, 12, WOOD_DARK, 3),
        [-68, -208, 136, 208],
      );
    }
    case 'cupboard':
      // Its back to the room: a plain panel under its worktop, and what
      // stands on it seen from behind (a kettle's back, a box's).
      return framed(
        SHADOW(84) +
          rect(-80, -86, 160, 86, colour ?? PAPER, 3) +
          boards(-80, 80, -84, -4, 4, STONE) +
          rect(-86, -96, 172, 12, STONE, 2) +
          rect(-46, -126, 26, 30, WHITE, 4) +
          rect(26, -118, 34, 22, WHITE, 3),
        [-86, -126, 172, 126],
      );
    case 'counter':
      // The side the one serving stands at: open shelves under the top,
      // with a few jars and boxes on them.
      return {
        ...framed(
          SHADOW(104) +
            rect(-96, -84, 192, 84, colour ?? WOOD, 3) +
            rect(-86, -74, 172, 64, WOOD_DARK, 2) +
            rect(-86, -44, 172, 6, colour ?? WOOD, 1) +
            rect(-74, -70, 18, 26, '#e7c46a', 3) +
            rect(-50, -66, 26, 22, PAPER, 2) +
            rect(30, -40, 30, 28, '#9cc7d8', 3) +
            rect(-104, -94, 208, 14, PLANK, 3),
          [-104, -118, 208, 118],
        ),
      };
    case 'desk': {
      // From its front: the board under its top that hides one sitting at
      // it, between its legs.
      const top = colour ?? PLANK;
      return framed(
        SHADOW(60) +
          rect(-50, -66, 7, 66, METAL, 1) +
          rect(43, -66, 7, 66, METAL, 1) +
          rect(-46, -64, 92, 34, top, 2) +
          rect(-60, -76, 120, 12, top, 3) +
          rect(-40, -28, 80, 5, STEEL, 1),
        [-60, -110, 120, 110],
      );
    }
    case 'stall':
      // From behind: its posts and its awning, and the back of its counter
      // in boards, where the seller stands; none of its wares.
      return {
        ...framed(
          SHADOW(96) +
            rect(-84, -196, 8, 196, WOOD_DARK) +
            rect(76, -196, 8, 196, WOOD_DARK) +
            `<path d="M-104,-172 L-92,-208 L92,-208 L104,-172 Z" ${fill(WHITE)}/>` +
            line(
              'M-60,-208 L-68,-172 M-20,-208 L-22,-172 M20,-208 L22,-172 M60,-208 L68,-172',
              STRIPE,
              10,
            ) +
            rect(-90, -76, 180, 76, WOOD, 3) +
            boards(-90, 90, -72, -4, 6, WOOD_DARK) +
            rect(-96, -84, 192, 12, WOOD) +
            rect(-30, -48, 60, 10, PLANK, 2),
          [-104, -208, 208, 214],
        ),
      };
    case 'sofa':
      // Its back: the tall padded back and the ends of its arms.
      return framed(
        SHADOW(118) +
          rect(-124, -76, 24, 68, '#9a5240', 8) +
          rect(100, -76, 24, 68, '#9a5240', 8) +
          rect(-112, -104, 224, 96, '#b5654d', 10) +
          line('M-100,-60 L100,-60', '#9a5240', 3) +
          rect(-108, -10, 10, 10, WOOD_DARK) +
          rect(98, -10, 10, 10, WOOD_DARK),
        [-124, -104, 248, 104],
      );
    default:
      return null;
  }
}
