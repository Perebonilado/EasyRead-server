/**
 * The fixed things of a set that a story acts on, drawn by code in the
 * figure kit's hand: a gate that swings shut, a door someone goes out by,
 * a bench someone sits on or looks under, a goalpost someone stands by, a
 * danfo someone jumps into. Drawn at the kit's own size (a grown person is
 * about 192 tall), standing on the ground at y = 0, their middle at x = 0,
 * so the stage stands them among the people at the people's own scale.
 *
 * What opens has a leaf of its own (the group "leaf"): it swings about its
 * hinge, or slides along, and the gap it leaves is the way through. What
 * is sat on says how high.
 *
 * The painter is told to leave out the pieces people act on and to draw
 * the rest (a tree, a stall, a well) as groups of their own; whatever the
 * painting has not got is drawn here, so nothing a sheet names is missing.
 */
import type { FeatureKind } from './scene-doings';
import { FIGURE_INK } from './scene-figure';

/** A set piece as the stage gets it. */
export interface SetPiece {
  svg: string;
  /** Its frame, in the kit's units: the ground at y = 0, its middle at x = 0. */
  viewBox: [number, number, number, number];
  /**
   * The part that opens, by its group's id: it swings about its hinge (its
   * width closing toward it, as a gate seen face on does), or with `slide`
   * moves that far along, as a bus's door does.
   */
  leaf?: { id: string; hinge: [number, number]; slide?: number };
  /** The way through or under it, in its own units: x0, y0, x1, y1. */
  opening?: [number, number, number, number];
  /** How high its seat is, for someone who sits on it. */
  seat?: number;
  /** It stands in front of the people by it, low before their legs: a canoe they stand in, a drum. */
  front?: true;
  /** Someone going by it goes in and is gone, as at a door: one of a show's own that opens. */
  enters?: true;
  /** How high one who climbs it stands: up a tree, on a wall, on the steps. */
  perch?: number;
  /** Where a thing caught up in it rests: a kite in a tree's crown. */
  crown?: [number, number];
  /**
   * Where someone lies along it, in its own units: its top (how high it
   * is, as a seat is), its head end and its foot end across; and where one
   * sitting up in it sits across, their back to the head end.
   */
  lies?: { top: number; head: number; foot: number; sits: number };
  /** The group that covers whoever is in it, drawn over them while they are: a bed's duvet. */
  cover?: string;
}

/**
 * The pieces people act on, which the stage always draws itself, in
 * place of any the painter drew: they open, are gone through, sat on,
 * hidden behind, stood by. The rest are the painter's to draw.
 */
export const ACTED_PIECES: readonly FeatureKind[] = [
  'gate',
  'door',
  'window',
  'bench',
  'chair',
  'sofa',
  'bed',
  'steps',
  'goalpost',
  'crate',
  'fence',
  'wall',
  'tree',
  'vehicle',
  'swing',
];

/** A painted set's group for a feature, by its id: "f-gate". */
export const featureGroup = (id: string) => `f-${id}`;

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

const METAL = '#4f7cac';
const CONCRETE = '#d8cbb3';
const WOOD = '#9a6b4b';
const WOOD_DARK = '#7a5238';
const PLANK = '#c79a6b';
const LEAF = '#6a9c3e';
const LEAF_DARK = '#557f31';
const DARK = '#3a3740';
const GLASS = '#cfe3ee';
const WHITE = '#f3f1ec';
const RED = '#e0463a';
const YELLOW = '#f2c14e';
const STONE = '#c9cdd3';
const SHADOW = `<ellipse cx="0" cy="0" rx="{rx}" ry="6" ${flat('#1d1a22')} fill-opacity="0.12"/>`;
const shadow = (rx: number) => SHADOW.replace('{rx}', String(rx));

/** Bars between x0 and x1 from y0 to y1, `n` of them. */
const bars = (x0: number, x1: number, y0: number, y1: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * (i + 1)) / (n + 1);
    return (
      line(`M${r1(x)},${y0} L${r1(x)},${y1}`, FIGURE_INK, 5.6) +
      line(`M${r1(x)},${y0} L${r1(x)},${y1}`, METAL, 2.6)
    );
  }).join('');

/** A palm's frond from its crown, out to one side and drooping: `dx` across, `dy` down at its tip. */
const frond = (dx: number, dy: number, colour: string) =>
  `<path d="M28,-424 Q${r1(28 + dx * 0.45)},${r1(-470 + dy * 0.2)} ${r1(28 + dx)},${r1(-424 + dy)} Q${r1(28 + dx * 0.5)},${r1(-438 + dy * 0.3)} 28,-412 Z" ${fill(colour)}/>`;

/** A set piece of a kind, drawn; a tree as its name says (a palm). */
export function drawPiece(kind: FeatureKind, name = ''): SetPiece {
  if (kind === 'tree' && /\b(?:palms?|coconut|date palm)\b/iu.test(name))
    // A tall palm, as on a beach: its trunk ringed and leaning a little,
    // its fronds and coconuts at the top, about two and a half grown-ups
    // tall.
    return {
      ...framed(
        shadow(46) +
          `<path d="M-18,0 Q-8,-230 20,-420 L38,-416 Q16,-228 16,0 Z" ${fill(WOOD)}/>` +
          line(
            [60, 120, 180, 240, 300, 360]
              .map((y) => {
                const x = -1 + (y / 420) * 28;
                return `M${r1(x - 14)},${-y} L${r1(x + 13)},${-y - 5}`;
              })
              .join(' '),
            WOOD_DARK,
            2.4,
          ) +
          frond(-170, 70, LEAF_DARK) +
          frond(180, 80, LEAF_DARK) +
          frond(-120, 130, LEAF) +
          frond(140, 140, LEAF) +
          frond(-60, -50, LEAF) +
          frond(90, -40, LEAF) +
          [
            [20, -404],
            [38, -400],
            [28, -390],
          ]
            .map(
              ([x, y]) =>
                `<circle cx="${x}" cy="${y}" r="10" ${fill(WOOD_DARK)}/>`,
            )
            .join(''),
        [-150, -490, 368, 496],
      ),
      // A child up it reaches the kite caught in its crown.
      perch: 270,
      crown: [28, -430],
    };
  switch (kind) {
    case 'gate': {
      // A compound's metal gate between two concrete posts, wider than it
      // is high and about a grown-up's shoulder high, as such gates are:
      // its leaf hinged on the left post, a latch on the right.
      const leaf =
        `<g id="leaf">` +
        rect(-76, -128, 152, 10, METAL) +
        rect(-76, -22, 152, 10, METAL) +
        rect(-76, -128, 10, 116, METAL) +
        rect(66, -128, 10, 116, METAL) +
        rect(-76, -76, 152, 8, METAL) +
        bars(-66, 66, -118, -22, 7) +
        rect(56, -92, 14, 10, YELLOW) +
        `</g>`;
      // The compound's wall runs off each side of it, beyond its frame, so
      // it is a gateway in a wall, never a gate on its own; going through
      // it is going out.
      const wall = (x: number) =>
        rect(x, -112, 170, 112, CONCRETE, 0) +
        rect(x - 4, -120, 178, 10, '#c2b397') +
        line(
          `M${x},-74 L${x + 170},-74 M${x},-38 L${x + 170},-38 M${x + 60},-112 L${x + 60},-74 M${x + 120},-74 L${x + 120},-38 M${x + 40},-38 L${x + 40},0`,
          '#a99a80',
          2,
        );
      return {
        ...framed(
          wall(-264) +
            wall(94) +
            shadow(90) +
            leaf +
            rect(-94, -146, 18, 146, CONCRETE) +
            rect(76, -146, 18, 146, CONCRETE) +
            rect(-98, -154, 26, 10, CONCRETE) +
            rect(72, -154, 26, 10, CONCRETE),
          [-98, -154, 196, 160],
        ),
        leaf: { id: 'leaf', hinge: [-76, -70] },
        opening: [-76, -128, 76, 0],
      };
    }
    case 'door': {
      // A doorway in a stretch of wall: the dark room beyond, the door
      // hinged on its left.
      return {
        ...framed(
          rect(-80, -236, 160, 236, CONCRETE, 0) +
            rect(-86, -244, 172, 12, '#c2b397') +
            rect(-48, -204, 96, 204, DARK, 0) +
            `<g id="leaf">` +
            rect(-48, -204, 96, 204, WOOD, 0) +
            rect(-36, -190, 72, 80, PLANK, 3) +
            rect(-36, -98, 72, 84, PLANK, 3) +
            `<circle cx="32" cy="-100" r="5" ${fill(YELLOW)}/>` +
            `</g>` +
            rect(-56, -212, 112, 10, WOOD_DARK),
          [-86, -244, 172, 244],
        ),
        leaf: { id: 'leaf', hinge: [-48, -102] },
        opening: [-48, -204, 48, 0],
      };
    }
    case 'window': {
      // A window in the wall, framed, with its sill: the wall below it is
      // the painter's, never a panel down to the floor before the room.
      return {
        ...framed(
          rect(-62, -194, 124, 118, CONCRETE, 4) +
            rect(-50, -180, 100, 90, GLASS, 0) +
            line('M0,-180 L0,-90 M-50,-135 L50,-135', FIGURE_INK, 3) +
            `<g id="leaf">` +
            rect(-50, -180, 100, 90, '#7fa6c9', 0) +
            line(
              'M-40,-170 L40,-170 M-40,-155 L40,-155 M-40,-140 L40,-140 M-40,-125 L40,-125 M-40,-110 L40,-110',
              FIGURE_INK,
              2,
            ) +
            `</g>` +
            rect(-58, -90, 116, 10, '#c2b397'),
          [-84, -220, 168, 220],
        ),
        leaf: { id: 'leaf', hinge: [-50, -135] },
        opening: [-50, -180, 50, -90],
      };
    }
    case 'bench':
      return {
        ...framed(
          shadow(92) +
            rect(-80, -52, 10, 52, WOOD_DARK) +
            rect(70, -52, 10, 52, WOOD_DARK) +
            rect(-80, -104, 10, 50, WOOD_DARK) +
            rect(70, -104, 10, 50, WOOD_DARK) +
            rect(-96, -104, 192, 14, PLANK, 4) +
            rect(-96, -84, 192, 12, PLANK, 4) +
            rect(-100, -58, 200, 12, PLANK, 4),
          [-100, -104, 200, 110],
        ),
        seat: 50,
        lies: { top: 58, head: -80, foot: 88, sits: 0 },
        opening: [-70, -46, 70, 0],
      };
    case 'chair':
      return {
        ...framed(
          shadow(38) +
            rect(-30, -52, 8, 52, WOOD_DARK) +
            rect(22, -52, 8, 52, WOOD_DARK) +
            rect(-34, -124, 9, 70, WOOD_DARK) +
            rect(-34, -118, 12, 12, PLANK) +
            rect(-34, -96, 12, 12, PLANK) +
            rect(-36, -58, 72, 10, PLANK, 4),
          [-36, -124, 72, 130],
        ),
        seat: 52,
      };
    case 'table':
      return {
        ...framed(
          shadow(84) +
            rect(-70, -70, 10, 70, WOOD_DARK) +
            rect(60, -70, 10, 70, WOOD_DARK) +
            rect(-86, -80, 172, 12, PLANK, 4),
          [-86, -80, 172, 86],
        ),
        opening: [-60, -68, 60, 0],
      };
    case 'bed':
      // A bed long enough for a grown-up to lie on, its head to the left:
      // the frame (a headboard, a footboard, the mattress and the pillow)
      // and the duvet over it apart, which is drawn again over whoever is
      // in the bed while they are, and hangs over its near side.
      return {
        ...framed(
          `<g id="frame">` +
            shadow(128) +
            rect(-134, -126, 16, 126, WOOD) +
            rect(-138, -132, 24, 12, WOOD_DARK) +
            rect(118, -70, 14, 70, WOOD) +
            rect(-118, -34, 236, 20, WOOD_DARK, 3) +
            rect(-116, -14, 10, 14, WOOD_DARK) +
            rect(106, -14, 10, 14, WOOD_DARK) +
            rect(-118, -54, 236, 22, '#e8edf3', 7) +
            `<ellipse cx="-92" cy="-60" rx="28" ry="13" ${fill(WHITE)}/>` +
            `</g>` +
            // From the pillow to the foot, a little above the mattress, so
            // one sitting up in the bed is under it to the waist.
            `<g id="cover">` +
            `<path d="M-116,-60 Q-84,-68 -40,-64 Q40,-60 118,-58 L124,-22 Q30,-14 -114,-22 Z" ${fill('#6f93c7')}/>` +
            line('M-104,-50 Q-20,-44 100,-50', '#5a7cb0', 2.4) +
            `</g>`,
          [-138, -132, 270, 132],
        ),
        seat: 54,
        lies: { top: 54, head: -100, foot: 104, sits: -78 },
        cover: 'cover',
      };
    case 'sofa':
      // A sofa: its back, two arms and the cushions, long enough to lie on.
      return {
        ...framed(
          shadow(118) +
            rect(-112, -104, 224, 56, '#b5654d', 10) +
            rect(-124, -76, 24, 68, '#9a5240', 8) +
            rect(100, -76, 24, 68, '#9a5240', 8) +
            rect(-100, -58, 100, 20, '#c97a60', 6) +
            rect(0, -58, 100, 20, '#c97a60', 6) +
            rect(-110, -40, 220, 30, '#a95c47', 4) +
            rect(-108, -10, 10, 10, WOOD_DARK) +
            rect(98, -10, 10, 10, WOOD_DARK),
          [-124, -104, 248, 104],
        ),
        seat: 50,
        lies: { top: 50, head: -92, foot: 92, sits: -40 },
      };
    case 'tree':
      return {
        ...framed(
          shadow(60) +
            line('M0,-130 L-44,-176', FIGURE_INK, 13) +
            line('M0,-130 L-44,-176', WOOD, 8) +
            rect(-17, -170, 34, 170, WOOD, 4) +
            `<circle cx="-54" cy="-214" r="58" ${fill(LEAF_DARK)}/>` +
            `<circle cx="54" cy="-210" r="60" ${fill(LEAF_DARK)}/>` +
            `<circle cx="0" cy="-262" r="74" ${fill(LEAF)}/>` +
            `<circle cx="-40" cy="-196" r="48" ${fill(LEAF)}/>` +
            `<circle cx="42" cy="-192" r="46" ${fill(LEAF)}/>`,
          [-112, -336, 224, 342],
        ),
        perch: 150,
        crown: [0, -250],
      };
    case 'goalpost': {
      // Two white posts and a bar, half again as wide as they are high as
      // a children's goal is, and the net behind them.
      const net = Array.from(
        { length: 9 },
        (_, i) => `M${-134 + i * 33.5},-160 L${-118 + i * 29.5},-20`,
      ).join(' ');
      return {
        ...framed(
          line(
            `${net} M-134,-116 L134,-116 M-128,-68 L128,-68 M-122,-20 L122,-20`,
            '#8d8f96',
            1.6,
          ) +
            rect(-146, -170, 12, 170, WHITE) +
            rect(134, -170, 12, 170, WHITE) +
            rect(-150, -176, 300, 12, WHITE),
          [-150, -176, 300, 176],
        ),
        opening: [-134, -164, 134, 0],
      };
    }
    case 'wall':
      return {
        ...framed(
          rect(-124, -96, 248, 96, CONCRETE, 0) +
            rect(-130, -106, 260, 12, '#c2b397') +
            line(
              'M-124,-64 L124,-64 M-124,-32 L124,-32 M-60,-94 L-60,-64 M40,-94 L40,-64 M-10,-64 L-10,-32 M90,-64 L90,-32 M-80,-32 L-80,0 M30,-32 L30,0',
              '#a99a80',
              2,
            ),
          [-130, -106, 260, 106],
        ),
        perch: 106,
      };
    case 'fence': {
      const pickets = Array.from({ length: 9 }, (_, i) => {
        const x = -112 + i * 28;
        return `<path d="M${x - 9},0 L${x - 9},-92 L${x},-104 L${x + 9},-92 L${x + 9},0 Z" ${fill(PLANK)}/>`;
      }).join('');
      return {
        ...framed(
          rect(-126, -78, 252, 10, WOOD) +
            rect(-126, -32, 252, 10, WOOD) +
            pickets,
          [-126, -104, 252, 104],
        ),
      };
    }
    case 'stall':
      return {
        ...framed(
          shadow(96) +
            rect(-84, -196, 8, 196, WOOD_DARK) +
            rect(76, -196, 8, 196, WOOD_DARK) +
            `<path d="M-104,-172 L-92,-208 L92,-208 L104,-172 Z" ${fill(WHITE)}/>` +
            line(
              'M-60,-208 L-68,-172 M-20,-208 L-22,-172 M20,-208 L22,-172 M60,-208 L68,-172',
              RED,
              10,
            ) +
            rect(-90, -76, 180, 76, PLANK, 3) +
            rect(-96, -84, 192, 12, WOOD) +
            [-64, -40, -16, 8, 32, 56]
              .map((x) => `<circle cx="${x}" cy="-94" r="11" ${fill(RED)}/>`)
              .join(''),
          [-104, -208, 208, 214],
        ),
        opening: [-76, -196, 76, -84],
      };
    case 'crate':
      return {
        ...framed(
          shadow(40) +
            rect(-36, -52, 72, 52, PLANK, 2) +
            line('M-36,-34 L36,-34 M-36,-17 L36,-17', WOOD_DARK, 2.4) +
            [-22, -6, 10, 26]
              .map((x) => `<circle cx="${x}" cy="-58" r="9" ${fill(RED)}/>`)
              .join(''),
          [-36, -67, 72, 73],
        ),
      };
    case 'vehicle': {
      // A danfo: a yellow minibus side on, its black stripe and windows,
      // and its side door, which slides back to let people in and out.
      return {
        ...framed(
          `<ellipse cx="0" cy="0" rx="220" ry="8" ${flat('#1d1a22')} fill-opacity="0.12"/>` +
            `<path d="M-236,-34 L-236,-168 Q-236,-200 -204,-200 L176,-200 Q214,-200 226,-160 L240,-110 L240,-34 Z" ${fill(YELLOW)}/>` +
            rect(-236, -104, 476, 12, DARK, 0) +
            [-214, -150, -86]
              .map((x) => rect(x, -186, 54, 52, GLASS, 4))
              .join('') +
            `<path d="M130,-186 L180,-186 Q206,-186 214,-160 L222,-134 L130,-134 Z" ${fill(GLASS)}/>` +
            rect(4, -190, 108, 156, DARK, 3) +
            `<g id="leaf">` +
            rect(4, -190, 108, 156, YELLOW, 3) +
            rect(14, -182, 88, 46, GLASS, 4) +
            rect(4, -104, 108, 12, DARK, 0) +
            rect(88, -86, 16, 6, WHITE) +
            `</g>` +
            [-150, 160]
              .map(
                (x) =>
                  `<circle cx="${x}" cy="-30" r="32" ${fill(DARK)}/><circle cx="${x}" cy="-30" r="13" ${fill(STONE)}/>`,
              )
              .join(''),
          [-240, -200, 480, 202],
        ),
        leaf: { id: 'leaf', hinge: [4, -112], slide: -100 },
        opening: [4, -190, 112, -34],
      };
    }
    case 'steps':
      return {
        ...framed(
          rect(-64, -22, 128, 22, CONCRETE, 1) +
            rect(-56, -44, 112, 22, CONCRETE, 1) +
            rect(-48, -66, 96, 22, CONCRETE, 1),
          [-64, -66, 128, 66],
        ),
        seat: 44,
        perch: 66,
      };
    case 'swing':
      return {
        ...framed(
          shadow(80) +
            line('M-92,0 L-70,-204 M92,0 L70,-204', FIGURE_INK, 10) +
            line('M-92,0 L-70,-204 M92,0 L70,-204', WOOD, 5.2) +
            rect(-84, -212, 168, 12, WOOD_DARK) +
            line('M-26,-200 L-26,-60 M26,-200 L26,-60', FIGURE_INK, 2.4) +
            rect(-38, -62, 76, 10, PLANK, 3),
          [-96, -212, 192, 212],
        ),
        seat: 56,
      };
    case 'well':
      return {
        ...framed(
          shadow(58) +
            rect(-46, -150, 8, 90, WOOD_DARK) +
            rect(38, -150, 8, 90, WOOD_DARK) +
            `<path d="M-66,-146 L0,-186 L66,-146 Z" ${fill('#b0553a')}/>` +
            rect(-54, -72, 108, 72, STONE, 4) +
            `<ellipse cx="0" cy="-72" rx="54" ry="10" ${fill('#a9adb4')}/>` +
            line('M0,-146 L0,-110', FIGURE_INK, 2) +
            rect(-10, -112, 20, 18, WOOD, 3),
          [-66, -186, 132, 186],
        ),
      };
  }
}

/** Whether the stage draws a feature itself: always one people act on; any other, where the painting has not got it. */
export const drawnByStage = (kind: FeatureKind, painted: boolean): boolean =>
  ACTED_PIECES.includes(kind) || !painted;

/**
 * What stands for one of a show's own features whose drawing could not be
 * made: something under a cloth, about as big as a bench, so what a scene
 * names is never missing from its stage.
 */
export function coveredPiece(): SetPiece {
  return framed(
    shadow(70) +
      `<path d="M-72,0 Q-76,-58 -34,-82 Q0,-98 36,-80 Q78,-58 72,0 Z" ${fill('#9aa68a')}/>` +
      line('M-40,-8 Q-44,-44 -18,-70 M22,-6 Q30,-46 10,-76', '#7f8a70', 2.4),
    [-78, -98, 156, 98],
  );
}
