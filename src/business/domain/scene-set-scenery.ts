/**
 * The scenery of a set that nobody acts on, drawn by code in the figure
 * kit's hand (studio-drawings-plan §7, D1): what a room has along its
 * walls (a bookshelf, a wardrobe, a whiteboard, curtains, a clock), what
 * stands about out of doors (a house, a hut, a cart, a bush, a lamppost,
 * a beach umbrella), and the rows of seats in a bus. Beside the pieces
 * people act on (scene-set-pieces), which the stage draws, these are the
 * set's own: a layout (scene-set-layout) places them, each at a share of
 * the width, a depth and a scale.
 *
 * Drawn as those are: at the kit's own size (a grown-up stands about 224
 * tall), standing on the ground at y = 0, their middle at x = 0, flat
 * colours from the house's own and the kit's outline round each shape. A
 * piece that hangs on a wall says how high its foot hangs above the
 * floor; one that lies on the floor (a rug) is flat, and is floor.
 */
import { FIGURE_INK, SET_COLOURS, KIT_EXTRAS, CLOTH, COATS } from './scene-ink';
import { segment, type SetPiece } from './scene-set-pieces';

/** The scenery code draws, by name. */
export const SCENERY_KINDS = [
  // A room's.
  'desk',
  'bookshelf',
  'shelf',
  'whiteboard',
  'blackboard',
  'noticeboard',
  'wardrobe',
  'rug',
  'lamp',
  'curtains',
  'picture',
  'clock',
  'bunting',
  'plant',
  'toybox',
  'fireplace',
  'counter',
  'cupboard',
  // Out of doors.
  'house',
  'hut',
  'cart',
  'bush',
  'rock',
  'flowers',
  'fern',
  'mushroom',
  'lamppost',
  'basket',
  'sack',
  'parasol',
  'boat',
  'pine',
  'hill',
  'sandcastle',
  // A vessel's.
  'seats',
] as const;
export type SceneryKind = (typeof SCENERY_KINDS)[number];

export const isSceneryKind = (kind: string): kind is SceneryKind =>
  (SCENERY_KINDS as readonly string[]).includes(kind);

/** A piece of scenery: a set piece, and where it goes in a set. */
export interface SceneryPiece extends SetPiece {
  /** It hangs on a wall: how high its foot is above the floor, in the kit's units. */
  hangs?: number;
  /** It lies flat on the floor, and is floor: people stand on it. */
  flat?: true;
  /** Someone could stand behind it, as at a stall: one of the set's "props". */
  counter?: true;
  /** It sways in the wind (a tree, a bush) or flickers (a fire): the stage's class for it. */
  lives?: 'sway' | 'flicker';
}

/** Which of them hang on a wall, lie on the floor, or are stood behind: known before one is drawn. */
export const HANGING: readonly SceneryKind[] = [
  'shelf',
  'whiteboard',
  'blackboard',
  'noticeboard',
  'curtains',
  'picture',
  'clock',
  'bunting',
];
export const FLAT: readonly SceneryKind[] = ['rug'];
export const COUNTERS: readonly SceneryKind[] = [
  'counter',
  'cart',
  'basket',
  'sack',
];

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
const circle = (x: number, y: number, r: number, colour: string) =>
  `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" ${fill(colour)}/>`;
const shape = (d: string, colour: string) => `<path d="${d}" ${fill(colour)}/>`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Drawn with the kit's outline, framed with room for it. */
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

const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const PLANK = KIT_EXTRAS.plank;
const LEAF = SET_COLOURS.leaves;
const LEAF_DARK = KIT_EXTRAS['dark leaf'];
const LEAF_DEEP = '#557f31';
const PAPER = KIT_EXTRAS.paper;
const WHITE = '#ffffff';
const METAL = KIT_EXTRAS.metal;
const STEEL = KIT_EXTRAS.steel;
const GLASS = KIT_EXTRAS.glass;
const STONE = SET_COLOURS.stone;
const EARTH = SET_COLOURS.earth;
const ROOF = SET_COLOURS.roofs;
const WALLS = SET_COLOURS.walls;
const GOLD = KIT_EXTRAS.gold;
const RED = KIT_EXTRAS['bright red'];
const SKY = SET_COLOURS.sky;
const GRASS = SET_COLOURS.grass;
const DARK = '#3a3740';
const STRAW = '#e2c27a';
const STRAW_DARK = '#c9a45b';
const CORK = '#c9975f';
const SAND = '#f1dcaa';
/** Books along a shelf, in turn. */
const BOOKS = [
  CLOTH.red,
  CLOTH.blue,
  CLOTH.yellow,
  CLOTH.green,
  CLOTH.purple,
  CLOTH.orange,
  CLOTH.teal,
];
const SHADOW = (rx: number) =>
  `<ellipse cx="0" cy="0" rx="${rx}" ry="6" ${flat('#1d1a22')} fill-opacity="0.12"/>`;

/** Books standing on a shelf from x0 to x1 with its top at y, as tall as `tall`. */
function books(x0: number, x1: number, y: number, tall: number, from = 0) {
  let out = '';
  let x = x0;
  let k = from;
  while (x < x1 - 8) {
    const w = 8 + ((k * 5) % 5);
    const h = tall * (0.78 + ((k * 7) % 4) * 0.07);
    out += rect(x, y - h, Math.min(w, x1 - x), h, BOOKS[k % BOOKS.length], 1);
    x += w + 1;
    k += 1;
    // A gap, and a book leaning, now and then.
    if (k % 6 === 5) x += 10;
  }
  return out;
}

/** A round crown of leaves, as the kit's trees have: circles over each other. */
const crown = (
  parts: [number, number, number][],
  colours: [string, string] = [LEAF_DARK, LEAF],
) =>
  parts
    .map(([x, y, r], k) =>
      circle(x, y, r, k < parts.length / 2 ? colours[0] : colours[1]),
    )
    .join('');

/**
 * A piece of scenery, drawn; `colour` is its own where it has one (a
 * rug's, a wardrobe's, a house's walls, the seats'), else its usual.
 */
export function drawScenery(kind: SceneryKind, colour?: string): SceneryPiece {
  switch (kind) {
    case 'desk': {
      // A school desk: its top, its legs and a shelf under it, a book and a
      // pot of pencils on it.
      const top = colour ?? PLANK;
      return {
        ...framed(
          SHADOW(60) +
            rect(-50, -66, 7, 66, METAL, 1) +
            rect(43, -66, 7, 66, METAL, 1) +
            rect(-46, -44, 92, 8, STEEL, 1) +
            rect(-60, -76, 120, 12, top, 3) +
            rect(-38, -86, 34, 10, CLOTH.blue, 1) +
            rect(18, -96, 16, 20, CLOTH.red, 3) +
            line(
              'M22,-96 L20,-108 M27,-96 L28,-110 M31,-96 L34,-106',
              FIGURE_INK,
              2,
            ),
          [-60, -110, 120, 110],
        ),
      };
    }
    case 'bookshelf': {
      const wood = colour ?? WOOD;
      const shelves = [-44, -86, -128];
      return framed(
        SHADOW(58) +
          rect(-54, -172, 108, 172, wood, 3) +
          rect(-46, -164, 92, 156, WOOD_DARK, 1) +
          books(-44, 44, -8, 34, 0) +
          shelves
            .map(
              (y, k) =>
                rect(-50, y - 4, 100, 8, wood, 1) +
                books(-44, 44, y - 4, 32, (k + 1) * 3),
            )
            .join(''),
        [-54, -172, 108, 172],
      );
    }
    case 'shelf':
      // A shelf on the wall: its board and brackets, books and a plant.
      return {
        ...framed(
          rect(-50, -8, 100, 8, colour ?? WOOD, 2) +
            shape('M-38,0 L-38,14 L-28,0 Z', WOOD_DARK) +
            shape('M38,0 L38,14 L28,0 Z', WOOD_DARK) +
            books(-44, 6, -8, 30, 2) +
            rect(18, -24, 18, 16, ROOF, 3) +
            shape(
              'M27,-24 Q16,-40 20,-48 Q28,-38 27,-24 Q30,-40 38,-46 Q38,-32 27,-24 Z',
              LEAF,
            ),
          [-50, -48, 100, 62],
        ),
        hangs: 118,
      };
    case 'whiteboard':
    case 'blackboard': {
      // A board on the wall with its tray: shapes on it, never words.
      const board = kind === 'whiteboard' ? WHITE : '#3f6b57';
      const chalk = kind === 'whiteboard' ? CLOTH.blue : PAPER;
      const marks =
        kind === 'whiteboard'
          ? circle(-80, -84, 12, CLOTH.yellow) +
            shape('M-30,-60 L-10,-96 L10,-60 Z', CLOTH.red) +
            rect(34, -94, 30, 30, CLOTH.green, 2)
          : line(
              'M-96,-90 L-50,-90 M-96,-74 L-62,-74 M-96,-58 L-40,-58',
              chalk,
              3,
            ) +
            line('M10,-60 L30,-96 L50,-60 Z', chalk, 3) +
            line(
              'M76,-78 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0',
              chalk,
              3,
            );
      return {
        ...framed(
          rect(-124, -128, 248, 120, STEEL, 4) +
            rect(-116, -120, 232, 104, board, 2) +
            marks +
            rect(-110, -10, 220, 10, STEEL, 2) +
            rect(-60, -16, 24, 6, CLOTH.red, 2) +
            rect(-30, -16, 24, 6, CLOTH.blue, 2),
          [-124, -128, 248, 128],
        ),
        hangs: 92,
      };
    }
    case 'noticeboard': {
      const papers: [number, number, number, number, string][] = [
        [-44, -76, 30, 36, PAPER],
        [-6, -70, 26, 30, CLOTH.yellow],
        [26, -78, 22, 28, PAPER],
        [-30, -34, 34, 22, CLOTH.pink],
        [14, -38, 30, 26, PAPER],
      ];
      return {
        ...framed(
          rect(-56, -86, 112, 86, WOOD, 3) +
            rect(-50, -80, 100, 74, CORK, 1) +
            papers
              .map(
                ([x, y, w, h, c]) =>
                  rect(x, y, w, h, c, 1) +
                  `<circle cx="${r1(x + w / 2)}" cy="${r1(y + 4)}" r="2.6" ${flat(RED)}/>`,
              )
              .join(''),
          [-56, -86, 112, 86],
        ),
        hangs: 104,
      };
    }
    case 'wardrobe': {
      const wood = colour ?? WOOD;
      return framed(
        SHADOW(66) +
          rect(-60, -8, 10, 8, WOOD_DARK, 1) +
          rect(50, -8, 10, 8, WOOD_DARK, 1) +
          rect(-62, -200, 124, 194, wood, 3) +
          rect(-68, -208, 136, 12, WOOD_DARK, 3) +
          rect(-54, -188, 52, 176, PLANK, 2) +
          rect(2, -188, 52, 176, PLANK, 2) +
          circle(-10, -100, 4, GOLD) +
          circle(10, -100, 4, GOLD),
        [-68, -208, 136, 208],
      );
    }
    case 'rug': {
      // A round rug on the floor, ring in ring: floor people stand on.
      const c = colour ?? CLOTH.pink;
      return {
        ...framed(
          `<ellipse cx="0" cy="-16" rx="110" ry="16" ${fill(c)}/>` +
            `<ellipse cx="0" cy="-16" rx="84" ry="11" ${fill(PAPER)}/>` +
            `<ellipse cx="0" cy="-16" rx="60" ry="7" ${fill(c)}/>`,
          [-110, -32, 220, 32],
        ),
        flat: true,
      };
    }
    case 'lamp':
      // Its shade wobbles on its pole when the room is bumped.
      return {
        ...framed(
          SHADOW(24) +
            `<ellipse cx="0" cy="-5" rx="22" ry="6" ${fill(DARK)}/>` +
            rect(-3, -142, 6, 138, DARK, 1) +
            segment(
              0,
              [0, -142],
              shape(
                'M-26,-136 L-16,-172 L16,-172 L26,-136 Z',
                colour ?? CLOTH.yellow,
              ),
            ),
          [-26, -172, 52, 172],
        ),
        reacts: { as: 'hang', len: 30 },
      };
    case 'curtains': {
      // A window on the wall with its curtains drawn back and its rail.
      const c = colour ?? CLOTH.red;
      return {
        ...framed(
          rect(-56, -112, 112, 104, WALLS, 3) +
            rect(-48, -104, 96, 88, SKY, 1) +
            shape(
              'M-48,-40 Q-20,-58 6,-44 Q26,-54 48,-46 L48,-16 L-48,-16 Z',
              GRASS,
            ) +
            circle(24, -82, 10, GOLD) +
            line('M0,-104 L0,-16 M-48,-60 L48,-60', FIGURE_INK, 3) +
            rect(-60, -12, 120, 10, PLANK, 2) +
            // Each curtain hangs from the rail, and billows on a draught.
            segment(
              0,
              [-59, -118],
              shape(
                'M-74,-118 L-44,-118 Q-40,-66 -50,-40 Q-44,-24 -40,-4 L-74,-4 Z',
                c,
              ),
            ) +
            segment(
              1,
              [59, -118],
              shape(
                'M74,-118 L44,-118 Q40,-66 50,-40 Q44,-24 40,-4 L74,-4 Z',
                c,
              ),
            ) +
            rect(-82, -124, 164, 8, WOOD_DARK, 4),
          [-82, -124, 164, 124],
        ),
        hangs: 84,
        reacts: { as: 'curtain', len: 114 },
      };
    }
    case 'picture':
      return {
        ...framed(
          rect(-28, -66, 56, 66, colour ?? WOOD, 3) +
            rect(-20, -58, 40, 50, SKY, 1) +
            shape(
              'M-20,-22 Q-4,-38 8,-26 Q14,-32 20,-28 L20,-8 L-20,-8 Z',
              GRASS,
            ) +
            circle(8, -46, 7, GOLD),
          [-28, -66, 56, 66],
        ),
        hangs: 140,
      };
    case 'clock':
      return {
        ...framed(
          circle(0, -26, 26, colour ?? CLOTH.red) +
            circle(0, -26, 20, WHITE) +
            line('M0,-26 L0,-40 M0,-26 L10,-22', FIGURE_INK, 3),
          [-26, -52, 52, 52],
        ),
        hangs: 236,
      };
    case 'bunting': {
      // Flags on a string across the wall, sagging a little.
      const flags = Array.from({ length: 9 }, (_, k) => {
        const x = -128 + k * 32;
        const y = -38 + Math.sin((k / 8) * Math.PI) * 16;
        // Each flag its own, turning where it hangs on the string.
        return segment(
          k,
          [x, r1(y)],
          shape(
            `M${r1(x - 11)},${r1(y)} L${r1(x + 11)},${r1(y + 1)} L${r1(x)},${r1(y + 26)} Z`,
            BOOKS[k % BOOKS.length],
          ),
        );
      }).join('');
      return {
        ...framed(
          line('M-148,-44 Q0,-4 148,-44', FIGURE_INK, 2.6) + flags,
          [-148, -48, 296, 48],
        ),
        hangs: 262,
        reacts: { as: 'flag', len: 26 },
      };
    }
    case 'plant':
      return {
        ...framed(
          SHADOW(22) +
            shape('M-20,-36 L20,-36 L15,0 L-15,0 Z', colour ?? ROOF) +
            rect(-23, -42, 46, 8, ROOF, 2) +
            // Its leaves bend from the pot as someone brushes by.
            segment(
              0,
              [0, -42],
              shape('M0,-42 Q-34,-70 -30,-96 Q-8,-80 0,-42 Z', LEAF) +
                shape('M0,-42 Q30,-74 26,-100 Q6,-80 0,-42 Z', LEAF_DARK) +
                shape('M0,-42 Q-8,-90 4,-114 Q12,-88 0,-42 Z', LEAF),
            ),
          [-32, -114, 64, 114],
        ),
        reacts: { as: 'sway', len: 114 },
      };
    case 'toybox': {
      const c = colour ?? CLOTH.teal;
      return framed(
        SHADOW(50) +
          circle(-18, -58, 14, CLOTH.red) +
          circle(22, -64, 10, COATS.brown) +
          circle(14, -72, 5, COATS.brown) +
          circle(30, -72, 5, COATS.brown) +
          rect(-46, -54, 92, 54, c, 4) +
          rect(-50, -58, 100, 12, c, 4) +
          rect(-8, -40, 16, 12, GOLD, 2),
        [-50, -86, 100, 86],
      );
    }
    case 'fireplace':
      return {
        ...framed(
          rect(-76, -128, 152, 128, colour ?? STONE, 3) +
            rect(-86, -140, 172, 14, WOOD_DARK, 3) +
            shape('M-44,0 L-44,-72 Q0,-100 44,-72 L44,0 Z', DARK) +
            rect(-30, -12, 60, 10, WOOD, 3) +
            `<g class="flicker">${shape('M-20,-12 Q-26,-40 -8,-58 Q-6,-40 2,-36 Q4,-60 16,-66 Q28,-40 20,-12 Z', '#f0924a')}${shape('M-8,-12 Q-10,-30 0,-40 Q10,-28 8,-12 Z', GOLD)}</g>`,
          [-86, -140, 172, 140],
        ),
        lives: 'flicker',
      };
    case 'counter':
      return {
        ...framed(
          SHADOW(104) +
            rect(-96, -84, 192, 84, colour ?? WOOD, 3) +
            rect(-104, -94, 208, 14, PLANK, 3) +
            rect(-84, -70, 80, 56, PLANK, 2) +
            rect(4, -70, 80, 56, PLANK, 2) +
            rect(40, -118, 36, 24, CLOTH.blue, 3) +
            circle(-50, -104, 10, CLOTH.orange) +
            circle(-30, -104, 10, CLOTH.red),
          [-104, -118, 208, 118],
        ),
        counter: true,
      };
    case 'cupboard':
      return framed(
        SHADOW(84) +
          rect(-80, -86, 160, 86, colour ?? PAPER, 3) +
          rect(-86, -96, 172, 12, STONE, 2) +
          rect(-72, -76, 68, 68, WALLS, 2) +
          rect(4, -76, 68, 68, WALLS, 2) +
          rect(-16, -48, 6, 16, DARK, 2) +
          rect(10, -48, 6, 16, DARK, 2) +
          rect(20, -126, 26, 30, CLOTH.teal, 4) +
          rect(-60, -118, 34, 22, WHITE, 3),
        [-86, -126, 172, 126],
      );
    case 'house': {
      // A house: its walls, its roof, a door and two windows.
      const walls = colour ?? WALLS;
      return {
        ...framed(
          SHADOW(118) +
            rect(-104, -168, 208, 168, walls, 2) +
            shape('M-124,-160 L0,-252 L124,-160 Z', ROOF) +
            rect(-22, -86, 44, 86, WOOD, 2) +
            circle(12, -42, 3.5, GOLD) +
            rect(-84, -132, 44, 40, GLASS, 2) +
            rect(40, -132, 44, 40, GLASS, 2) +
            line(
              'M-62,-132 L-62,-92 M-84,-112 L-40,-112 M62,-132 L62,-92 M40,-112 L84,-112',
              FIGURE_INK,
              2.4,
            ),
          [-124, -252, 248, 252],
        ),
        roosts: [
          [-48, -216],
          [0, -252],
          [48, -216],
        ],
      };
    }
    case 'hut':
      // A round hut: walls of earth and a thatched roof.
      return {
        ...framed(
          SHADOW(100) +
            rect(-86, -110, 172, 110, colour ?? EARTH, 6) +
            shape('M-24,0 L-24,-58 Q0,-78 24,-58 L24,0 Z', DARK) +
            shape('M-112,-96 L0,-208 L112,-96 Q0,-80 -112,-96 Z', STRAW) +
            line(
              'M-70,-110 L-20,-178 M-30,-102 L0,-196 M30,-102 L14,-190 M70,-110 L30,-170',
              STRAW_DARK,
              3,
            ),
          [-112, -208, 224, 208],
        ),
        roosts: [
          [-40, -168],
          [0, -208],
          [40, -168],
        ],
      };
    case 'cart': {
      // A hand cart piled with fruit, its two wheels and its handles.
      const wheel = (x: number) =>
        circle(x, -26, 26, WOOD_DARK) +
        circle(x, -26, 8, PLANK) +
        line(`M${x - 18},-26 L${x + 18},-26 M${x},-44 L${x},-8`, FIGURE_INK, 2);
      return {
        ...framed(
          SHADOW(96) +
            line('M84,-60 L128,-40', FIGURE_INK, 9) +
            line('M84,-60 L128,-40', WOOD, 4.6) +
            [-70, -46, -22, 2, 26, 50, -58, -34, -10, 14, 38]
              .map((x, k) =>
                circle(
                  x,
                  k < 6 ? -80 : -96,
                  13,
                  [CLOTH.orange, CLOTH.red, CLOTH.yellow, CLOTH.green][k % 4],
                ),
              )
              .join('') +
            rect(-90, -76, 180, 40, colour ?? WOOD, 3) +
            line('M-90,-56 L90,-56', WOOD_DARK, 2.4) +
            wheel(-52) +
            wheel(52),
          [-90, -109, 222, 109],
        ),
        counter: true,
      };
    }
    case 'bush':
      return {
        ...framed(
          SHADOW(62) +
            crown([
              [-34, -34, 32],
              [34, -32, 30],
              [0, -52, 40],
              [-12, -30, 30],
              [18, -26, 28],
            ]) +
            (colour
              ? circle(-20, -58, 6, colour) +
                circle(20, -46, 6, colour) +
                circle(-2, -30, 6, colour)
              : ''),
          [-66, -92, 132, 92],
        ),
        lives: 'sway',
        reacts: { as: 'sway', len: 92 },
        roosts: [[0, -92]],
      };
    case 'rock':
      return framed(
        SHADOW(46) +
          shape(
            'M-48,0 Q-52,-30 -24,-44 Q6,-58 30,-42 Q52,-28 48,0 Z',
            colour ?? STONE,
          ) +
          line('M-14,-30 Q0,-36 14,-30', '#a9a39a', 2.4),
        [-52, -58, 104, 58],
      );
    case 'flowers': {
      const c = colour ?? CLOTH.pink;
      return {
        ...framed(
          [-26, -8, 10, 28]
            .map(
              (x, k) =>
                line(
                  `M${x},0 L${x + (k % 2 ? 3 : -3)},${-22 - (k % 2) * 8}`,
                  LEAF_DEEP,
                  2.6,
                ) +
                circle(
                  x + (k % 2 ? 3 : -3),
                  -26 - (k % 2) * 8,
                  7,
                  k % 2 ? GOLD : c,
                ),
            )
            .join('') + shape('M-36,0 Q0,-14 36,0 Z', LEAF),
          [-36, -42, 72, 42],
        ),
        reacts: { as: 'sway', len: 42 },
      };
    }
    case 'fern':
      return {
        ...framed(
          [-60, -30, 0, 30, 60]
            .map((a) => {
              const rad = (a * Math.PI) / 180;
              const tx = Math.sin(rad) * 56;
              const ty = -Math.cos(rad) * 56;
              return shape(
                `M0,0 Q${r1(tx * 0.3 - 8)},${r1(ty * 0.7)} ${r1(tx)},${r1(ty)} Q${r1(tx * 0.3 + 8)},${r1(ty * 0.6)} 0,0 Z`,
                a % 60 ? LEAF_DARK : LEAF,
              );
            })
            .join(''),
          [-52, -58, 104, 58],
        ),
        lives: 'sway',
        reacts: { as: 'sway', len: 58 },
      };
    case 'mushroom':
      return framed(
        rect(-8, -24, 16, 24, PAPER, 4) +
          shape('M-26,-20 Q-26,-48 0,-48 Q26,-48 26,-20 Z', colour ?? RED) +
          `<circle cx="-10" cy="-34" r="4" ${flat(PAPER)}/><circle cx="8" cy="-40" r="3.5" ${flat(PAPER)}/><circle cx="14" cy="-28" r="3" ${flat(PAPER)}/>`,
        [-26, -48, 52, 48],
      );
    case 'lamppost':
      return {
        ...framed(
          SHADOW(22) +
            rect(-14, -16, 28, 16, colour ?? DARK, 3) +
            rect(-5, -276, 10, 262, colour ?? DARK, 2) +
            shape('M-20,-276 L20,-276 L14,-306 L-14,-306 Z', GOLD) +
            shape('M-24,-306 L24,-306 L0,-326 Z', colour ?? DARK),
          [-24, -326, 48, 326],
        ),
        roosts: [[0, -326]],
      };
    case 'basket':
      return {
        ...framed(
          SHADOW(34) +
            circle(-14, -36, 11, CLOTH.orange) +
            circle(8, -38, 11, CLOTH.green) +
            circle(-2, -44, 10, CLOTH.red) +
            circle(20, -32, 9, CLOTH.yellow) +
            shape('M-32,-32 L32,-32 L24,0 L-24,0 Z', colour ?? STRAW) +
            line('M-28,-20 L28,-20 M-26,-10 L26,-10', STRAW_DARK, 2.4),
          [-32, -55, 64, 55],
        ),
        counter: true,
      };
    case 'sack':
      // A sack of grain, tied at its neck, its cloth bunched above the tie.
      return {
        ...framed(
          SHADOW(32) +
            shape(
              'M-30,0 Q-36,-40 -16,-58 L16,-58 Q36,-40 30,0 Z',
              colour ?? '#d9c39a',
            ) +
            shape(
              'M-14,-58 Q-22,-74 -8,-70 Q0,-80 8,-70 Q22,-74 14,-58 Z',
              colour ?? '#d9c39a',
            ) +
            rect(-16, -62, 32, 7, WOOD_DARK, 3) +
            line('M-18,-30 Q0,-24 18,-30', '#b8a279', 2.4),
          [-36, -78, 72, 78],
        ),
        counter: true,
      };
    case 'parasol': {
      // A beach umbrella: its pole, and its canopy in segments, white and
      // its colour in turn.
      const c = colour ?? CLOTH.red;
      const segments = [-104, -62, -20, 22, 64]
        .map((x, k) =>
          shape(
            `M${x},-150 Q${x + 21},-${k === 2 ? 226 : k % 4 ? 214 : 186} ${x + 42},-150 Q${x + 21},-160 ${x},-150 Z`,
            k % 2 ? PAPER : c,
          ),
        )
        .join('');
      return {
        ...framed(
          SHADOW(40) +
            line('M0,0 L4,-176', FIGURE_INK, 9) +
            line('M0,0 L4,-176', PAPER, 4) +
            // Its canopy, lifting and flapping on the wind about its pole.
            segment(
              0,
              [4, -176],
              shape('M-104,-150 Q2,-238 106,-150 Q2,-166 -104,-150 Z', c) +
                segments +
                circle(2, -200, 6, c),
            ),
          [-104, -226, 210, 226],
        ),
        reacts: { as: 'flag', len: 60 },
      };
    }
    case 'boat':
      // A rowing boat drawn up on the shore.
      return framed(
        SHADOW(118) +
          shape(
            'M-122,-56 L122,-56 Q104,0 60,0 L-60,0 Q-104,0 -122,-56 Z',
            colour ?? CLOTH.blue,
          ) +
          rect(-122, -64, 244, 12, PAPER, 4) +
          line('M-100,-30 L100,-30', '#3a6ea8', 2.4) +
          line('M-40,-64 L60,-110', FIGURE_INK, 7) +
          line('M-40,-64 L60,-110', WOOD, 3),
        [-122, -112, 244, 112],
      );
    case 'pine':
      return {
        ...framed(
          SHADOW(56) +
            rect(-12, -64, 24, 64, WOOD, 2) +
            // Its crown, turning at the top of the trunk.
            segment(
              0,
              [0, -64],
              shape('M-80,-54 L0,-170 L80,-54 Z', LEAF_DARK) +
                shape('M-66,-130 L0,-240 L66,-130 Z', colour ?? LEAF) +
                shape('M-50,-200 L0,-296 L50,-200 Z', LEAF_DARK),
            ),
          [-80, -296, 160, 296],
        ),
        lives: 'sway',
        reacts: { as: 'sway', len: 296 },
        roosts: [[0, -292]],
      };
    case 'hill':
      return framed(
        shape(
          'M-300,0 Q-200,-150 0,-160 Q200,-150 300,0 Z',
          colour ?? SET_COLOURS.hills,
        ),
        [-300, -160, 600, 160],
      );
    case 'sandcastle':
      return framed(
        rect(-40, -30, 80, 30, SAND, 2) +
          rect(-30, -58, 22, 30, SAND, 2) +
          rect(8, -58, 22, 30, SAND, 2) +
          rect(-10, -76, 20, 48, SAND, 2) +
          line('M0,-76 L0,-98', FIGURE_INK, 2.4) +
          shape('M0,-98 L16,-92 L0,-86 Z', colour ?? RED) +
          shape('M-8,0 L-8,-14 Q0,-22 8,-14 L8,0 Z', '#d7bd85'),
        [-40, -98, 80, 98],
      );
    case 'seats': {
      // Two seats of a bus side by side, facing the viewer: their backs,
      // their cushions and their frames, and a grab handle on each.
      const c = colour ?? CLOTH.blue;
      const seat = (x: number) =>
        rect(x - 24, -44, 8, 44, DARK, 1) +
        rect(x + 16, -44, 8, 44, DARK, 1) +
        rect(x - 30, -118, 60, 72, c, 10) +
        rect(x - 34, -56, 68, 18, c, 6) +
        rect(x - 16, -126, 32, 10, STEEL, 4);
      return {
        ...framed(SHADOW(70) + seat(-34) + seat(34), [-68, -126, 136, 126]),
        seat: 46,
      };
    }
  }
}
