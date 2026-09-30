/**
 * The fixed things of a set that a story acts on, drawn by code in the
 * figure kit's hand: a gate that swings shut, a door someone goes out by,
 * a bench someone sits on or looks under, a goalpost someone stands by, a
 * bus or a car someone gets into. Drawn at the kit's own size (a grown person is
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
import type { SceneAffordancesDto, SceneVehicleDto } from '../../contracts';
import type { FeatureKind } from './scene-doings';
import { FIGURE_INK } from './scene-figure';
import { STYLE_PACKS, type StylePackId } from './scene-style-packs';
import {
  colourNamed,
  drawVehicleKit,
  vehicleKitKindOf,
  type VehicleKitKind,
  type VehicleLivery,
} from './scene-vehicles';

export { colourNamed };

/**
 * How a piece is drawn beyond its kind and name: the style pack of the
 * place it stands in (a gate, a wall and a road vehicle are drawn as that
 * place has them), and its own colour where one is given.
 */
export interface PieceLook {
  pack?: StylePackId | null;
  colour?: string | null;
  /** A city's look for its buses and cabs, where the story names the city (London's red buses). */
  livery?: VehicleLivery | null;
  /** It stands out of doors: a door there is a building's, drawn in its front. */
  outdoor?: boolean;
  /** It is in a vessel (a bus, a train, a boat): a door there slides in its side. */
  vessel?: boolean;
}

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
  /**
   * How it answers the world (studio-world-plan §5): a crown that bends as
   * someone brushes past, a bucket that swings, an awning that flaps; and
   * how long it is, in the kit's units, for how quickly it swings. Its
   * parts that move on their own are groups `data-seg` about `data-pivot`.
   */
  reacts?: { as: 'sway' | 'hang' | 'curtain' | 'flag'; len: number };
  /** Where birds may sit on it, in its own units. */
  roosts?: [number, number][];
  /**
   * What it offers the people who use it (studio-interactions-plan §1.1),
   * in its own units: handles, the doorway's line, seats, grips, steps and
   * rungs, what is laid over them, where one leans, what one operates,
   * what slides. Drawn by code, so its points are exact.
   */
  affordances?: SceneAffordancesDto;
  /** One up it stands in the middle of where things catch (its landing, a rung), not beside it: stairs, a ladder. */
  upMiddle?: true;
  /** A vehicle of the kit (scene-vehicles): what it is, its view, how it rides. */
  vehicle?: SceneVehicleDto;
  /**
   * The part of it people stand by and go through, across, in its own
   * units, where that is less than the whole: the doorway of a building's
   * front. Absent, all of it.
   */
  stand?: [number, number];
}

/**
 * Part of a piece that moves on its own as the world touches it: the
 * stage turns it about its pivot (its own units) by the group's order `k`.
 */
export const segment = (
  k: number,
  [px, py]: [number, number],
  markup: string,
) => `<g data-seg="${k}" data-pivot="${px} ${py}">${markup}</g>`;

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
  // Used by the people at them (studio-interactions-plan I2): sat at, leant
  // on, climbed, switched on, turned on.
  'table',
  'stairs',
  'ladder',
  'counter',
  'cupboard',
  'switch',
  'sink',
  'goalpost',
  'crate',
  'fence',
  'wall',
  'tree',
  'vehicle',
  'swing',
];

/**
 * The pieces one may stand up on, climbing or leaping (studio-world-plan
 * §4.5): each drawn with its `perch`, how high one up it stands (a wall's
 * 106, the steps' 66, a tree's 150, a palm's 270).
 */
export const PERCHED_KINDS: ReadonlySet<string> = new Set<FeatureKind>([
  'wall',
  'steps',
  'tree',
  'stairs',
  'ladder',
]);

/** How high one stands up a feature of a kind, in the kit's units; undefined for one no one stands up. */
export const perchOf = (kind: string, name = ''): number | undefined =>
  PERCHED_KINDS.has(kind)
    ? drawPiece(kind as FeatureKind, name).perch
    : undefined;

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

/**
 * A piece marked with how it was made and for which place's pack (a door's
 * boards, a wall's mud brick): the door check reads them, so a door or a
 * wall drawn as no place's, or another place's, is found (scene-door-check).
 */
const marked = (
  piece: SetPiece,
  make: string,
  pack: StylePackId | null,
): SetPiece => ({
  ...piece,
  svg: piece.svg.replace(
    /^<svg /u,
    `<svg data-make="${make}" data-pack="${pack ?? 'none'}" `,
  ),
});

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

/** The road vehicles the stage draws a feature of kind "vehicle" as, by what its name calls it: the kit (scene-vehicles) draws these and more. */
export const VEHICLE_KINDS = [
  'car',
  'taxi',
  'van',
  'truck',
  'bus',
  'danfo',
] as const;
export type VehicleKind = VehicleKitKind;

/**
 * Which vehicle a name says: a taxi, a van, a truck, a bus, a bicycle, a
 * canoe, a donkey cart by its own word, and a danfo only by its name or
 * as a West African town's bus. A name with none of the words is its
 * place's first vehicle (a car; an ancient place's cart), or a car.
 */
export const vehicleKindOf = (
  name: string,
  pack: StylePackId | null = null,
): VehicleKitKind => vehicleKitKindOf(name, pack);

/** The pack a set was built in, as its drawing (or its first layer) is marked; null for none. */
export function setPackOf(
  drawing:
    | { svg?: string; layered?: { layers?: { svg: string }[] } | null }
    | null
    | undefined,
): StylePackId | null {
  if (!drawing) return null;
  const marked = /data-style="([a-z-]+)"/u.exec(
    `${drawing.svg ?? ''} ${drawing.layered?.layers?.[0]?.svg ?? ''}`,
  )?.[1];
  return marked && marked in STYLE_PACKS ? (marked as StylePackId) : null;
}

/** The city look a set was built with, as its drawing is marked (London's buses); null for none. */
export function setLiveryOf(
  drawing:
    | { svg?: string; layered?: { layers?: { svg: string }[] } | null }
    | null
    | undefined,
): VehicleLivery | null {
  const marked = /data-livery="([a-z-]+)"/u.exec(
    `${drawing?.svg ?? ''} ${drawing?.layered?.layers?.[0]?.svg ?? ''}`,
  )?.[1];
  return marked === 'london' || marked === 'new-york' ? marked : null;
}

/** Whether a set's drawing is of a place out of doors (its data-place mark). */
export function setOutdoorOf(
  drawing:
    | { svg?: string; layered?: { layers?: { svg: string }[] } | null }
    | null
    | undefined,
): boolean {
  return /data-place="outdoor"/u.test(
    `${drawing?.svg ?? ''} ${drawing?.layered?.layers?.[0]?.svg ?? ''}`,
  );
}

/** A set piece of a kind, drawn; a tree as its name says (a palm), a road vehicle as its name says (a bus, a car), and a gate and a wall as its place has them. */
export function drawPiece(
  kind: FeatureKind,
  name = '',
  look: PieceLook = {},
): SetPiece {
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
          // Its fronds and coconuts one part, turning at the top of the trunk.
          segment(
            0,
            [28, -420],
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
          ),
        [-150, -490, 368, 496],
      ),
      // A child up it reaches the kite caught in its crown.
      perch: 270,
      crown: [28, -430],
      reacts: { as: 'sway', len: 490 },
      roosts: [
        [-40, -458],
        [28, -470],
        [96, -452],
      ],
    };
  switch (kind) {
    case 'gate':
      return marked(
        drawGate(look.pack ?? null),
        buildOf(look.pack ?? null),
        look.pack ?? null,
      );
    case 'wall':
      return drawWall(look.pack ?? null, name);
    case 'door':
      return drawDoor(name, look);
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
        affordances: {
          seats: [
            {
              id: 'seat',
              hip: [0, -58],
              feet: [
                [-10, 0],
                [10, 0],
              ],
              pose: 'bench',
            },
          ],
        },
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
        affordances: {
          seats: [
            {
              id: 'seat',
              hip: [0, -58],
              feet: [
                [-10, 0],
                [10, 0],
              ],
              pose: 'chair',
            },
          ],
          grips: [{ id: 'back', at: [-29, -112] }],
        },
      };
    case 'table':
      // A table seen from the front, a cloth over its front, and its chair
      // tucked in behind it: one who sits at it pulls the chair out (it
      // slides back and aside), sits, and tucks it in, and the table's
      // front is laid over their legs (studio-interactions-plan §2.2).
      return {
        ...framed(
          shadow(84) +
            `<g id="chair">` +
            rect(-26, -128, 8, 76, WOOD_DARK) +
            rect(18, -128, 8, 76, WOOD_DARK) +
            rect(-26, -124, 52, 10, PLANK, 3) +
            rect(-26, -104, 52, 10, PLANK, 3) +
            rect(-30, -58, 60, 9, PLANK, 3) +
            rect(-24, -50, 6, 42, WOOD_DARK) +
            rect(18, -50, 6, 42, WOOD_DARK) +
            `</g>` +
            `<g id="front">` +
            rect(-70, -70, 10, 70, WOOD_DARK) +
            rect(60, -70, 10, 70, WOOD_DARK) +
            `<path d="M-84,-74 L84,-74 L80,-24 Q60,-18 40,-24 Q20,-18 0,-24 Q-20,-18 -40,-24 Q-60,-18 -80,-24 Z" ${fill(WHITE)}/>` +
            line(
              'M-60,-70 L-58,-28 M0,-70 L0,-26 M60,-70 L58,-28',
              '#d9d4c8',
              2,
            ) +
            rect(-88, -84, 176, 12, PLANK, 4) +
            `</g>`,
          [-88, -128, 176, 134],
        ),
        opening: [-60, -68, 60, 0],
        seat: 52,
        affordances: {
          seats: [
            {
              id: 'chair',
              hip: [0, -54],
              feet: [
                [-10, 0],
                [10, 0],
              ],
              hands: [
                [-30, -84],
                [30, -84],
              ],
              pose: 'table',
            },
          ],
          grips: [{ id: 'chair-back', at: [0, -124] }],
          masks: [{ id: 'body-front', group: 'front' }],
          slides: [{ group: 'chair', by: [44, -6] }],
          side: 1,
        },
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
        affordances: {
          seats: [
            {
              id: 'edge',
              hip: [0, -54],
              feet: [
                [-10, 0],
                [10, 0],
              ],
              pose: 'bed',
            },
          ],
        },
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
        affordances: {
          seats: [
            {
              id: 'seat',
              hip: [0, -52],
              feet: [
                [-10, 0],
                [10, 0],
              ],
              pose: 'sofa',
            },
          ],
        },
      };
    case 'tree':
      return {
        ...framed(
          shadow(60) +
            line('M0,-130 L-44,-176', FIGURE_INK, 13) +
            line('M0,-130 L-44,-176', WOOD, 8) +
            rect(-17, -170, 34, 170, WOOD, 4) +
            // Its crown one part, turning at the top of the trunk.
            segment(
              0,
              [0, -170],
              `<circle cx="-54" cy="-214" r="58" ${fill(LEAF_DARK)}/>` +
                `<circle cx="54" cy="-210" r="60" ${fill(LEAF_DARK)}/>` +
                `<circle cx="0" cy="-262" r="74" ${fill(LEAF)}/>` +
                `<circle cx="-40" cy="-196" r="48" ${fill(LEAF)}/>` +
                `<circle cx="42" cy="-192" r="46" ${fill(LEAF)}/>`,
            ),
          [-112, -336, 224, 342],
        ),
        perch: 150,
        crown: [0, -250],
        reacts: { as: 'sway', len: 336 },
        roosts: [
          [-50, -300],
          [0, -336],
          [50, -296],
        ],
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
    case 'fence': {
      // A fence called a wall ("the low stone wall") is that wall; an old
      // place's or a farm's is a rail fence, a town's a picket one.
      if (/\bwalls?\b/iu.test(name)) return drawWall(look.pack ?? null, name);
      const build = buildOf(look.pack ?? null);
      if (build === 'stone' || build === 'rural')
        return marked(
          {
            ...framed(wallRun(-126, 252, 104, 'rural'), [-126, -104, 252, 104]),
            roosts: [
              [-56, -94],
              [56, -94],
            ],
          },
          'timber',
          look.pack ?? null,
        );
      const pickets = Array.from({ length: 9 }, (_, i) => {
        const x = -112 + i * 28;
        return `<path d="M${x - 9},0 L${x - 9},-92 L${x},-104 L${x + 9},-92 L${x + 9},0 Z" ${fill(PLANK)}/>`;
      }).join('');
      return marked(
        {
          ...framed(
            rect(-126, -78, 252, 10, WOOD) +
              rect(-126, -32, 252, 10, WOOD) +
              pickets,
            [-126, -104, 252, 104],
          ),
          roosts: [
            [-56, -104],
            [56, -104],
          ],
        },
        'picket',
        look.pack ?? null,
      );
    }
    case 'stall':
      return {
        ...framed(
          shadow(96) +
            rect(-84, -196, 8, 196, WOOD_DARK) +
            rect(76, -196, 8, 196, WOOD_DARK) +
            // Its awning, flapping in the wind from its back edge.
            segment(
              0,
              [0, -208],
              `<path d="M-104,-172 L-92,-208 L92,-208 L104,-172 Z" ${fill(WHITE)}/>` +
                line(
                  'M-60,-208 L-68,-172 M-20,-208 L-22,-172 M20,-208 L22,-172 M60,-208 L68,-172',
                  RED,
                  10,
                ),
            ) +
            rect(-90, -76, 180, 76, PLANK, 3) +
            rect(-96, -84, 192, 12, WOOD) +
            [-64, -40, -16, 8, 32, 56]
              .map((x) => `<circle cx="${x}" cy="-94" r="11" ${fill(RED)}/>`)
              .join(''),
          [-104, -208, 208, 214],
        ),
        opening: [-76, -196, 76, -84],
        reacts: { as: 'flag', len: 36 },
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
      // Drawn by the vehicle kit, from the side, as its place has it.
      const kit = drawVehicleKit(vehicleKindOf(name, look.pack ?? null), {
        name,
        pack: look.pack ?? null,
        colour: look.colour ?? null,
        livery: look.livery ?? null,
      });
      return {
        svg: kit.svg,
        viewBox: kit.viewBox,
        ...(kit.leaf ? { leaf: kit.leaf } : {}),
        ...(kit.opening ? { opening: kit.opening } : {}),
        affordances: kit.affordances,
        vehicle: kit.vehicle,
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
        // Seen from the front: one who climbs them goes up them away from
        // the camera, a foot on each tread in turn.
        affordances: {
          steps: [
            [0, -22],
            [0, -44],
            [0, -66],
          ],
        },
      };
    case 'stairs': {
      // A flight of stairs seen from the side, rising to the right to a
      // landing, with a rail: one who climbs it goes up a tread at a time,
      // and stands on the landing (its perch) at the top.
      const treads = [0, 1, 2, 3, 4].map((k) => ({
        x: -84 + 28 * k,
        y: -22 * (k + 1),
      }));
      const outline =
        `M-84,0 ` +
        treads.map((t) => `L${t.x},${t.y + 22} L${t.x},${t.y}`).join(' ') +
        ` L120,-110 L120,0 Z`;
      return {
        ...framed(
          shadow(100) +
            `<path d="${outline}" ${fill(CONCRETE)}/>` +
            line(
              treads.map((t) => `M${t.x},${t.y} L${t.x + 28},${t.y}`).join(' '),
              '#b8aa90',
              2,
            ) +
            line(
              'M-80,-22 L-80,-96 M28,-110 L28,-184 M116,-110 L116,-184',
              WOOD_DARK,
              5,
            ) +
            line('M-84,-92 L28,-180 L120,-180', WOOD, 6),
          [-84, -184, 204, 184],
        ),
        seat: 22,
        perch: 110,
        crown: [84, -150],
        upMiddle: true,
        affordances: {
          steps: [
            ...treads.map((t): [number, number] => [t.x + 14, t.y]),
            [84, -110],
          ],
          grips: [
            { id: 'rail-low', at: [-80, -94] },
            { id: 'rail-high', at: [28, -180] },
          ],
          side: -1,
        },
      };
    }
    case 'ladder': {
      // A wooden ladder standing against the wall, seen from the front:
      // one who climbs it goes up it facing it, a foot on each rung in
      // turn and their hands on the rungs above, and stands on its fourth.
      const rungs = [26, 52, 78, 104, 130, 156, 182];
      return {
        ...framed(
          shadow(34) +
            line('M-24,0 L-22,-200 M24,0 L22,-200', FIGURE_INK, 9) +
            line('M-24,0 L-22,-200 M24,0 L22,-200', WOOD, 5) +
            rungs.map((y) => rect(-23, -y - 3, 46, 6, PLANK, 2)).join(''),
          [-30, -204, 60, 204],
        ),
        perch: 104,
        crown: [0, -150],
        upMiddle: true,
        affordances: {
          rungs: rungs.map((y): [number, number] => [0, -y]),
          grips: [
            { id: 'rail-l', at: [-22, -150] },
            { id: 'rail-r', at: [22, -150] },
          ],
          side: -1,
        },
      };
    }
    case 'counter':
      // A kitchen counter seen from the front, a bowl and a jar on it:
      // one who leans on it has a hip against its end and a hand on its
      // top.
      return {
        ...framed(
          shadow(100) +
            rect(-96, -84, 192, 84, WOOD, 3) +
            rect(-84, -70, 80, 58, PLANK, 2) +
            rect(4, -70, 80, 58, PLANK, 2) +
            rect(-12, -44, 6, 14, WOOD_DARK, 2) +
            rect(10, -44, 6, 14, WOOD_DARK, 2) +
            rect(-102, -94, 204, 12, STONE, 3) +
            `<path d="M-64,-94 Q-50,-78 -36,-94 Z" ${fill(WHITE)}/>` +
            rect(40, -118, 22, 24, GLASS, 4) +
            rect(38, -122, 26, 6, WOOD_DARK, 2),
          [-102, -122, 204, 122],
        ),
        affordances: {
          leans: [
            { hip: [-98, -52], hand: [-84, -94] },
            { hip: [98, -52], hand: [84, -94] },
          ],
          grips: [{ id: 'top', at: [0, -94] }],
        },
      };
    case 'cupboard':
      // A tall cupboard: its door hinged on its left (a knob on its
      // right), a drawer below that pulls out toward the camera.
      return {
        ...framed(
          shadow(56) +
            rect(-50, -172, 100, 172, WOOD, 3) +
            rect(-44, -164, 88, 102, DARK, 0) +
            `<g id="leaf">` +
            rect(-44, -164, 88, 102, PLANK, 2) +
            rect(-36, -156, 72, 86, '#d4aa7d', 2) +
            `<circle cx="32" cy="-112" r="4.5" ${fill(WOOD_DARK)}/>` +
            `</g>` +
            `<g id="drawer">` +
            rect(-44, -56, 88, 44, PLANK, 2) +
            rect(-12, -38, 24, 7, WOOD_DARK, 3) +
            `</g>` +
            rect(-54, -178, 108, 10, WOOD_DARK, 2),
          [-54, -178, 108, 178],
        ),
        leaf: { id: 'leaf', hinge: [-44, -113] },
        opening: [-44, -164, 44, -62],
        affordances: {
          handles: [
            { id: 'knob', at: [32, -112], side: 'out' },
            { id: 'drawer', at: [0, -34], side: 'out' },
          ],
          slides: [{ group: 'drawer', by: [0, 7] }],
          side: 1,
        },
      };
    case 'switch':
      // A light switch on the wall, at a grown-up's shoulder: its rocker
      // down (off) as drawn, flicked up (on).
      return {
        ...framed(
          rect(-9, -124, 18, 26, WHITE, 3) +
            `<g id="toggle">` +
            rect(-3.5, -113, 7, 10, STONE, 2) +
            `</g>`,
          [-12, -130, 24, 130],
        ),
        affordances: {
          operates: [{ id: 'switch', at: [0, -111], does: 'switch' }],
          slides: [{ group: 'toggle', by: [0, -6] }],
          side: 1,
        },
      };
    case 'sink':
      // A sink on its cupboard, a tap over it: turned on, water runs from
      // the spout, and drips after.
      return {
        ...framed(
          shadow(64) +
            rect(-58, -78, 116, 78, WHITE, 3) +
            rect(-50, -64, 48, 54, '#e6e2d8', 2) +
            rect(2, -64, 48, 54, '#e6e2d8', 2) +
            rect(-64, -86, 128, 10, STONE, 3) +
            `<path d="M-40,-86 Q0,-72 40,-86 Z" ${fill('#bcd3df')}/>` +
            `<path d="M18,-86 L18,-110 Q18,-118 8,-118 L2,-118 L2,-110" fill="none" stroke="${FIGURE_INK}" stroke-width="7" stroke-linecap="round"/>` +
            `<path d="M18,-86 L18,-110 Q18,-118 8,-118 L2,-118 L2,-110" fill="none" stroke="${METAL}" stroke-width="3.4" stroke-linecap="round"/>` +
            `<g id="knob">` +
            rect(22, -106, 12, 6, METAL, 2) +
            `</g>` +
            `<g id="water" opacity="0">` +
            rect(0, -108, 4, 24, '#9cc7e4', 2) +
            `</g>` +
            `<g id="drip" opacity="0">` +
            `<circle cx="2" cy="-100" r="2.6" ${fill('#9cc7e4')}/>` +
            `</g>`,
          [-64, -120, 128, 120],
        ),
        affordances: {
          operates: [{ id: 'tap', at: [28, -103], does: 'tap' }],
          side: 1,
        },
      };
    case 'swing':
      return {
        ...framed(
          shadow(80) +
            line('M-92,0 L-70,-204 M92,0 L70,-204', FIGURE_INK, 10) +
            line('M-92,0 L-70,-204 M92,0 L70,-204', WOOD, 5.2) +
            rect(-84, -212, 168, 12, WOOD_DARK) +
            // Its ropes and seat, swinging from the bar.
            segment(
              0,
              [0, -200],
              line('M-26,-200 L-26,-60 M26,-200 L26,-60', FIGURE_INK, 2.4) +
                rect(-38, -62, 76, 10, PLANK, 3),
            ),
          [-96, -212, 192, 212],
        ),
        seat: 56,
        reacts: { as: 'hang', len: 140 },
        roosts: [[0, -212]],
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
            // Its bucket on its rope, swinging from the beam.
            segment(
              0,
              [0, -146],
              line('M0,-146 L0,-110', FIGURE_INK, 2) +
                rect(-10, -112, 20, 18, WOOD, 3),
            ),
          [-66, -186, 132, 186],
        ),
        reacts: { as: 'hang', len: 36 },
        roosts: [[0, -186]],
      };
  }
}

// ── Gates and walls as their place has them ───────────────────────────────

/** How a place's gates and walls are built: a compound's concrete, a town's brick or plaster, a farm's timber, an old town's stone. */
type Build = 'compound' | 'town' | 'rural' | 'stone';
const buildOf = (pack: StylePackId | null): Build =>
  pack === 'west-african-town'
    ? 'compound'
    : pack === 'village-farm' || pack === 'nature'
      ? 'rural'
      : pack === 'ancient-near-east' || pack === 'biblical-village'
        ? 'stone'
        : 'town';

const BRICK = '#b8674f';
const BRICK_LINE = '#94503d';
const PLASTER = '#e8dcc6';
const STONE_WALL = '#cbbf9f';

/** A stretch of wall `w` wide from x, `h` high, as its place builds one. */
function wallRun(x: number, w: number, h: number, build: Build): string {
  if (build === 'rural') {
    // A timber rail fence: posts and two rails.
    const n = Math.max(2, Math.round(w / 56));
    const posts = Array.from({ length: n }, (_, i) =>
      rect(x + (i * (w - 10)) / (n - 1), -h + 10, 10, h - 10, WOOD_DARK, 1),
    ).join('');
    return (
      posts +
      rect(x, -h + 22, w, 9, WOOD, 1) +
      rect(x, -h * 0.45, w, 9, WOOD, 1)
    );
  }
  const colour =
    build === 'compound' ? CONCRETE : build === 'stone' ? STONE_WALL : BRICK;
  const joints =
    build === 'compound'
      ? `M${x},-74 L${x + w},-74 M${x},-38 L${x + w},-38 M${x + 60},-112 L${x + 60},-74 M${x + 120},-74 L${x + 120},-38 M${x + 40},-38 L${x + 40},0`
      : build === 'town'
        ? Array.from({ length: Math.floor(h / 18) }, (_, row) => {
            const y = -h + 12 + row * 18;
            const off = row % 2 ? 22 : 0;
            const verticals = Array.from(
              { length: Math.floor((w - off) / 44) },
              (_, k) =>
                `M${r1(x + off + k * 44)},${r1(y)} L${r1(x + off + k * 44)},${r1(y + 18)}`,
            ).join(' ');
            return `M${x},${r1(y)} L${x + w},${r1(y)} ${verticals}`;
          }).join(' ')
        : `M${x},${-Math.round(h * 0.66)} L${x + w},${-Math.round(h * 0.66)} M${x},${-Math.round(h * 0.33)} L${x + w},${-Math.round(h * 0.33)} M${x + Math.round(w * 0.35)},${-h + 8} L${x + Math.round(w * 0.35)},${-Math.round(h * 0.66)} M${x + Math.round(w * 0.7)},${-Math.round(h * 0.66)} L${x + Math.round(w * 0.7)},${-Math.round(h * 0.33)} M${x + Math.round(w * 0.24)},${-Math.round(h * 0.33)} L${x + Math.round(w * 0.24)},0`;
  return (
    rect(x, -h + 8, w, h - 8, colour, 0) +
    rect(x - 4, -h, w + 8, 10, build === 'town' ? PLASTER : '#c2b397') +
    line(
      joints,
      build === 'town' ? BRICK_LINE : '#a99a80',
      build === 'town' ? 1.6 : 2,
    )
  );
}

/**
 * A gate in its wall, as its place has one, its wall running off each
 * side beyond its frame, so it is a gateway, never a gate on its own:
 * going through it is going out. A West African compound's metal gate
 * between concrete posts; a town's garden gate between brick piers; a
 * farm's timber gate in a rail fence; an old town's wooden gate in a
 * stone wall. Its leaf is hinged on the left post, a latch on the right.
 */
/** A gate's affordances (interactions I1): its latch, both sides; the threshold; its posts the near frame; a knock. */
const GATE_AFFORDANCES = (latch: [number, number]): SceneAffordancesDto => ({
  handles: [
    { id: 'latch', at: latch, side: 'out' },
    { id: 'latch-in', at: latch, side: 'in' },
  ],
  threshold: {
    line: [
      [-76, 0],
      [76, 0],
    ],
    inside: 'behind',
  },
  masks: [{ id: 'frame-near', group: 'posts' }],
  operates: [{ id: 'knock', at: [30, -104], does: 'knock' }],
  side: 1,
});

function drawGate(pack: StylePackId | null): SetPiece {
  const build = buildOf(pack);
  if (build === 'compound') {
    // A compound's metal gate between two concrete posts, wider than it
    // is high and about a grown-up's shoulder high, as such gates are.
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
    return {
      ...framed(
        wallRun(-264, 170, 120, build) +
          wallRun(94, 170, 120, build) +
          shadow(90) +
          leaf +
          // Its posts are the near frame one going through passes behind.
          `<g id="posts">` +
          rect(-94, -146, 18, 146, CONCRETE) +
          rect(76, -146, 18, 146, CONCRETE) +
          rect(-98, -154, 26, 10, CONCRETE) +
          rect(72, -154, 26, 10, CONCRETE) +
          `</g>`,
        [-98, -154, 196, 160],
      ),
      leaf: { id: 'leaf', hinge: [-76, -70] },
      opening: [-76, -128, 76, 0],
      affordances: GATE_AFFORDANCES([63, -87]),
    };
  }
  const post =
    build === 'rural' ? WOOD_DARK : build === 'stone' ? STONE_WALL : BRICK;
  const cap =
    build === 'rural' ? WOOD : build === 'stone' ? '#b9ad8c' : PLASTER;
  const leafColour =
    build === 'town' ? WHITE : build === 'stone' ? WOOD : PLANK;
  // A town's picket gate; a farm's five-bar gate with its brace; an old
  // town's gate of planks.
  const body =
    build === 'town'
      ? Array.from({ length: 7 }, (_, i) => {
          const x = -70 + i * 22;
          return `<path d="M${x - 8},-16 L${x - 8},-104 L${x},-116 L${x + 8},-104 L${x + 8},-16 Z" ${fill(leafColour)}/>`;
        }).join('') +
        rect(-76, -92, 152, 9, leafColour, 2) +
        rect(-76, -40, 152, 9, leafColour, 2)
      : build === 'rural'
        ? [-118, -94, -70, -46, -22]
            .map((y) => rect(-76, y, 152, 9, leafColour, 2))
            .join('') +
          rect(-76, -122, 12, 110, leafColour, 2) +
          rect(64, -122, 12, 110, leafColour, 2) +
          line('M-66,-18 L66,-116', FIGURE_INK, 11) +
          line('M-66,-18 L66,-116', leafColour, 7)
        : Array.from({ length: 6 }, (_, i) =>
            rect(-76 + i * 25.4, -126, 25.4, 112, leafColour, 1),
          ).join('') +
          rect(-76, -104, 152, 10, WOOD_DARK, 1) +
          rect(-76, -44, 152, 10, WOOD_DARK, 1);
  const leaf = `<g id="leaf">` + body + rect(58, -84, 12, 10, METAL) + `</g>`;
  return {
    ...framed(
      wallRun(-264, 170, build === 'rural' ? 110 : 112, build) +
        wallRun(94, 170, build === 'rural' ? 110 : 112, build) +
        shadow(90) +
        leaf +
        `<g id="posts">` +
        rect(-94, -146, 18, 146, post) +
        rect(76, -146, 18, 146, post) +
        rect(-98, -154, 26, 10, cap) +
        rect(72, -154, 26, 10, cap) +
        `</g>`,
      [-98, -154, 196, 160],
    ),
    leaf: { id: 'leaf', hinge: [-76, -70] },
    opening: [-76, -128, 76, 0],
    affordances: GATE_AFFORDANCES([64, -79]),
  };
}

// ── Doors as their place has them ────────────────────────────────────────

/**
 * How a door is made, as its place and its name say: an old town's or a
 * farm's (and a stable's, a barn's, a cottage's) boards; a present-day
 * one's painted panels; a vessel's (a bus's, a train's) glass that
 * slides; a tent's cloth flap.
 */
export type DoorMake = 'plank' | 'panel' | 'sliding' | 'flap';

const FLAP_DOOR = /\b(?:tents?|flaps?|yurts?)\b/iu;
const PLANK_DOOR =
  /\b(?:stables?|barns?|byres?|sheds?|huts?|cabins?|shacks?|cottages?|farmhouses?|cellars?|castles?|towers?|arks?|inns?|planks?|sheepfolds?|pens?)\b/iu;
const SLIDING_DOOR =
  /\b(?:sliding|automatic|lifts?|elevators?|subways?|trains?|trams?|carriages?|bus(?:es)?|minibus(?:es)?|coach(?:es)?)\b/iu;
/** A door a visitor rings at: a home's or a building's way in, never a room's inside one. */
const FRONT_DOOR =
  /\b(?:front|main|entrance|apartment|flat|house|home|street|building|office|shop|store)\b/iu;

/** How a door of this name is made, where it stands. */
export function doorMakeOf(
  name: string,
  look: Pick<PieceLook, 'pack' | 'vessel'> = {},
): DoorMake {
  if (FLAP_DOOR.test(name)) return 'flap';
  if (PLANK_DOOR.test(name)) return 'plank';
  if (look.vessel || SLIDING_DOOR.test(name)) return 'sliding';
  const build = buildOf(look.pack ?? null);
  return build === 'stone' || build === 'rural' ? 'plank' : 'panel';
}

/** Whether a door has a bell beside it: only a present-day home's or building's way in. */
export const doorHasBell = (make: DoorMake, name: string) =>
  make === 'panel' && FRONT_DOOR.test(name);

/** The door's own parts, the same in a room's wall and a building's front: the dark beyond. */
const DOOR_DARK = `<g id="dark">` + rect(-48, -204, 96, 204, DARK, 0) + `</g>`;
/** Where a door's handle is, by how it is made: a knob, a ring, a latch. */
const HANDLE: [number, number] = [32, -100];
const BELL_AT: [number, number] = [66.5, -126];

/** A painted door of panels with its knob: a present-day one. */
const panelLeaf = (colour: string) =>
  `<g id="leaf">` +
  rect(-48, -204, 96, 204, colour, 0) +
  rect(-36, -190, 72, 80, shadeOf(colour, 1.18), 3) +
  rect(-36, -98, 72, 84, shadeOf(colour, 1.18), 3) +
  `<circle cx="${HANDLE[0]}" cy="${HANDLE[1]}" r="5" ${fill(YELLOW)}/>` +
  `</g>`;

/** A door of boards, two battens across and an iron ring: an old place's, a farm's, a stable's. */
const plankLeaf = (colour: string) =>
  `<g id="leaf">` +
  rect(-48, -204, 96, 204, colour, 0) +
  line(
    'M-24,-204 L-24,0 M0,-204 L0,0 M24,-204 L24,0',
    shadeOf(colour, 0.78),
    2,
  ) +
  rect(-48, -176, 96, 14, shadeOf(colour, 0.82), 1) +
  rect(-48, -50, 96, 14, shadeOf(colour, 0.82), 1) +
  `<circle cx="${HANDLE[0]}" cy="${HANDLE[1]}" r="7" fill="none" stroke="${FIGURE_INK}" stroke-width="3"/>` +
  `</g>`;

/** A vessel's door: glass in a metal frame, sliding aside. */
const slidingLeaf = () =>
  `<g id="leaf">` +
  rect(-48, -204, 96, 204, '#9aa3ad', 0) +
  rect(-38, -192, 76, 110, GLASS, 2) +
  rect(-38, -74, 76, 60, '#b9c1c9', 2) +
  rect(HANDLE[0] - 4, -130, 8, 56, '#6d7580', 3) +
  `</g>`;

/** A darker or paler colour, `k` times as bright. */
function shadeOf(colour: string, k: number): string {
  const n = /^#([0-9a-f]{6})$/iu.exec(colour)?.[1];
  if (!n) return colour;
  const c = [0, 2, 4].map((i) =>
    Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * k))),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A door's affordances: its handle both sides, the threshold, the near frame, a knock, and a bell where it has one. */
const doorAffordances = (bell: boolean): SceneAffordancesDto => ({
  handles: [
    { id: 'knob', at: HANDLE, side: 'out' },
    { id: 'knob-in', at: HANDLE, side: 'in' },
  ],
  threshold: {
    line: [
      [-48, 0],
      [48, 0],
    ],
    inside: 'behind',
  },
  masks: [{ id: 'frame-near', group: 'frame' }],
  dark: 'dark',
  operates: [
    { id: 'knock', at: [16, -128], does: 'knock' },
    ...(bell ? [{ id: 'bell', at: BELL_AT, does: 'bell' as const }] : []),
  ],
  side: 1,
});

/** The bell push beside a door. */
const BELL =
  rect(61, -133, 11, 14, WHITE, 2) +
  `<circle cx="${BELL_AT[0]}" cy="${BELL_AT[1]}" r="3.2" ${fill(STONE)}/>`;

/** An old place's stone, a mud-brick town's brick, as a doorway's jambs are built. */
const MUD_BRICK = '#c9a27a';

/**
 * The doorway's surround as its place builds one: an old town's stone
 * jambs under a timber lintel (a mud-brick town's, of its bricks), a
 * farm's or a stable's timber posts, a present-day door's painted
 * architrave, a vessel's metal frame. Only the doorway: the wall it is in
 * is the room's own, never a stretch of another wall round it.
 */
function doorway(make: DoorMake, pack: StylePackId | null): string {
  if (make === 'sliding')
    return (
      rect(-60, -216, 12, 216, '#7d8691', 0) +
      rect(48, -216, 12, 216, '#7d8691', 0) +
      rect(-60, -216, 120, 12, '#7d8691', 1)
    );
  const build = buildOf(pack);
  if (make === 'plank' && build === 'stone') {
    const stone = pack === 'ancient-near-east' ? MUD_BRICK : STONE_WALL;
    const blocks = [0, 1, 2, 3]
      .map((k) => {
        const y = -204 + k * 51;
        const wide = k % 2 ? 16 : 20;
        return (
          rect(-48 - wide, y, wide, 51, stone, 1) +
          rect(48, y, wide, 51, stone, 1)
        );
      })
      .join('');
    return blocks + rect(-72, -224, 144, 20, WOOD_DARK, 2);
  }
  if (make === 'plank')
    return (
      rect(-60, -214, 12, 214, WOOD_DARK, 1) +
      rect(48, -214, 12, 214, WOOD_DARK, 1) +
      rect(-66, -224, 132, 14, WOOD_DARK, 2)
    );
  const trim = pack ? (STYLE_PACKS[pack].palette.trims[0] ?? WHITE) : WHITE;
  return (
    rect(-58, -214, 10, 214, trim, 0) +
    rect(48, -214, 10, 214, trim, 0) +
    rect(-62, -222, 124, 12, trim, 2)
  );
}

/**
 * A door as its place has one (never the same door everywhere): out of
 * doors a building's (its front drawn round it); a tent's flap; else a
 * doorway in the room's own wall, made as its place and its name say
 * (boards in an old town's stone, a farm's timber; painted panels in a
 * present-day room; glass that slides in a vessel), with a bell only by a
 * present-day home's way in. The dark room beyond is its own group,
 * behind the leaf; the doorway's surround is the near frame, laid over
 * one going through, so they pass through it, not in front of it.
 */
function drawDoor(name: string, look: PieceLook): SetPiece {
  const pack = look.pack ?? null;
  const make = doorMakeOf(name, look);
  if (make === 'flap')
    return marked(drawTentFlap(look.colour ?? colourNamed(name)), make, pack);
  if (look.outdoor && !look.vessel)
    return marked(drawBuildingDoor(pack, name, make), 'front', pack);
  const colour =
    look.colour ??
    colourNamed(name) ??
    (make === 'panel' && pack ? STYLE_PACKS[pack].palette.doors[0] : null) ??
    WOOD;
  const bell = doorHasBell(make, name);
  const leaf =
    make === 'sliding'
      ? slidingLeaf()
      : make === 'plank'
        ? plankLeaf(colour)
        : panelLeaf(colour);
  const piece: SetPiece = {
    ...framed(
      DOOR_DARK +
        leaf +
        `<g id="frame">` +
        doorway(make, pack) +
        (bell ? BELL : '') +
        `</g>`,
      [-72, -224, 144, 224],
    ),
    leaf:
      make === 'sliding'
        ? { id: 'leaf', hinge: [-48, -102], slide: -92 }
        : { id: 'leaf', hinge: [-48, -102] },
    opening: [-48, -204, 48, 0],
    affordances: doorAffordances(bell),
  };
  return marked(piece, make, pack);
}

/**
 * A tent's way in: its front of cloth, the doorway a slit up the middle,
 * and the flap that covers it drawn back to the side as it opens.
 */
function drawTentFlap(colour: string | null): SetPiece {
  const cloth = colour ?? '#d9c9a3';
  const edge = shadeOf(cloth, 0.8);
  return {
    ...framed(
      shadow(150) +
        `<g id="dark"><path d="M-56,0 L-10,-212 L10,-212 L56,0 Z" ${fill(DARK)}/></g>` +
        `<g id="leaf"><path d="M-56,0 L-10,-212 L10,-212 L56,0 Z" ${fill(cloth)}/>` +
        line('M0,-212 L0,0', edge, 2) +
        `<circle cx="${HANDLE[0]}" cy="${HANDLE[1]}" r="4" ${fill(edge)}/></g>` +
        `<g id="frame">` +
        `<path d="M-160,0 L-12,-252 L12,-252 L160,0 L56,0 L10,-212 L-10,-212 L-56,0 Z" ${fill(cloth)}/>` +
        line('M-110,0 L-8,-230 M110,0 L8,-230', edge, 2) +
        rect(-6, -268, 12, 24, WOOD_DARK, 2) +
        `</g>`,
      [-160, -268, 320, 268],
    ),
    leaf: { id: 'leaf', hinge: [-48, -102] },
    opening: [-48, -204, 48, 0],
    affordances: doorAffordances(false),
    stand: [-60, 60],
  };
}

/** Half a building front's width, and its height, in the kit's units: about four metres by four and a half, two storeys. */
const FRONT_HALF = 220;
const FRONT_TALL = 500;
/** A hut's, a shed's, a stable's front: one storey, narrower. */
const HUT_HALF = 150;
const HUT_TALL = 290;
const HUT = /\b(?:huts?|sheds?|cabins?|shacks?|stables?|barns?|byres?|kiosks?|sheepfolds?)\b/iu;

/** The joints of a wall's face within a box: a town's brick courses, an old town's stone blocks, a farm's boards. */
function faceJoints(
  [x0, y0, x1, y1]: [number, number, number, number],
  build: Build,
): string {
  if (build === 'rural') {
    const out: string[] = [];
    for (let x = x0 + 28; x < x1; x += 28)
      out.push(`M${r1(x)},${r1(y0)} L${r1(x)},${r1(y1)}`);
    return out.join(' ');
  }
  const course = build === 'town' ? 18 : build === 'stone' ? 40 : 60;
  const brick = build === 'town' ? 44 : build === 'stone' ? 70 : 120;
  const out: string[] = [];
  for (let row = 0, y = y1 - course; y > y0; row += 1, y -= course) {
    out.push(`M${r1(x0)},${r1(y)} L${r1(x1)},${r1(y)}`);
    const off = row % 2 ? brick / 2 : 0;
    for (let x = x0 + off + brick; x < x1; x += brick)
      out.push(`M${r1(x)},${r1(y)} L${r1(x)},${r1(Math.min(y1, y + course))}`);
  }
  return out.join(' ');
}

/** A window of a building's front: its surround, its glass and its sill. */
const frontWindow = (
  x: number,
  y: number,
  w: number,
  h: number,
  trim: string,
) =>
  rect(x - 6, y - 6, w + 12, h + 12, trim, 2) +
  rect(x, y, w, h, GLASS, 0) +
  line(`M${r1(x + w / 2)},${r1(y)} L${r1(x + w / 2)},${r1(y + h)}`, trim, 5) +
  rect(x - 10, y + h + 4, w + 20, 9, trim, 2);

/** An old place's window: a small dark opening under a timber lintel, no glass. */
const oldWindow = (x: number, y: number, w: number, h: number) =>
  rect(x, y, w, h, DARK, 0) + rect(x - 8, y - 12, w + 16, 12, WOOD_DARK, 1);

/**
 * A door out of doors, as the way into a building (never a door on its
 * own in a street): the building's front drawn round it, as its place
 * builds one (a town's brick with plaster trim, a compound's plastered
 * block, a farm's boards, an old town's stone), two storeys with windows
 * beside it and above it; a hut's, a shed's or a stable's one storey of
 * boards. Its door is made as its place makes doors (boards in an old
 * town or on a farm, painted panels in a town), with a bell only by a
 * present-day one. The whole front is the near frame: one going in passes
 * behind it, into the building. People stand by its doorway, not by the
 * whole front (stand).
 */
function drawBuildingDoor(
  pack: StylePackId | null,
  name = '',
  make: DoorMake = doorMakeOf(name, { pack }),
): SetPiece {
  const hut = HUT.test(name);
  const build: Build = hut ? 'rural' : buildOf(pack);
  const wall =
    build === 'compound'
      ? PLASTER
      : build === 'stone'
        ? pack === 'ancient-near-east'
          ? MUD_BRICK
          : STONE_WALL
        : build === 'rural'
          ? PLANK
          : BRICK;
  const joint =
    build === 'town' ? BRICK_LINE : build === 'rural' ? WOOD_DARK : '#a99a80';
  const trim =
    build === 'rural' ? WOOD_DARK : build === 'town' ? PLASTER : '#c2b397';
  const old = build === 'stone' || build === 'rural';
  const H = hut ? HUT_HALF : FRONT_HALF;
  const T = hut ? HUT_TALL : FRONT_TALL;
  const bell = !old && doorHasBell('panel', `front ${name}`);
  const leaf =
    make === 'plank' || old ? plankLeaf(WOOD) : panelLeaf(colourNamed(name) ?? WOOD);
  // The front with its doorway cut out, so the door and the dark show.
  const face =
    `<path d="M${-H},${-T} L${H},${-T} L${H},0 L56,0 L56,-212 L-56,-212 L-56,0 L${-H},0 Z" ${fill(wall)}/>` +
    line(
      [
        faceJoints([-H, -T + 16, -60, 0], build),
        faceJoints([60, -T + 16, H, 0], build),
        faceJoints([-60, -T + 16, 60, -250], build),
      ].join(' '),
      joint,
      1.6,
    );
  const storey = -270;
  const windows = hut
    ? oldWindow(-128, -176, 44, 52) + oldWindow(84, -176, 44, 52)
    : old
      ? oldWindow(-170, -176, 56, 64) +
        oldWindow(114, -176, 56, 64) +
        [-150, -28, 94].map((x) => oldWindow(x, -420, 56, 72)).join('')
      : frontWindow(-176, -186, 76, 96, trim) +
        frontWindow(100, -186, 76, 96, trim) +
        [-170, -38, 94].map((x) => frontWindow(x, -438, 76, 110, trim)).join('');
  return {
    ...framed(
      shadow(H - 10) +
        DOOR_DARK +
        leaf +
        `<g id="frame">` +
        face +
        // A band between the storeys and a cornice along the top (a hut's
        // eaves); an old front's plain.
        (hut || old ? '' : rect(-H, storey, 2 * H, 10, trim, 1)) +
        rect(-H - 8, -T - 14, 2 * H + 16, 18, trim, 2) +
        windows +
        // The doorway's surround and lintel, and its bell where it has one.
        (old ? '' : rect(-86, -244, 172, 12, trim)) +
        rect(-56, -212, 8, 212, WOOD_DARK, 0) +
        rect(48, -212, 8, 212, WOOD_DARK, 0) +
        rect(-56, -212, 112, 10, WOOD_DARK) +
        (bell ? BELL : '') +
        // A step before it, the pavement's edge of the building.
        rect(-70, -8, 140, 8, old ? shadeOf(wall, 0.85) : '#b9b2a4', 1) +
        `</g>`,
      [-H - 8, -T - 14, 2 * H + 16, T + 14],
    ),
    leaf: { id: 'leaf', hinge: [-48, -102] },
    opening: [-48, -204, 48, 0],
    affordances: doorAffordances(bell),
    stand: [-86, 86],
    roosts: [
      [-H + 20, -T - 14],
      [H - 20, -T - 14],
    ],
  };
}

// ── Walls as their place builds them, and as they are called ────────────

/** What a stretch of wall is made of. */
export type WallMaterial =
  | 'brick'
  | 'stone'
  | 'mud'
  | 'concrete'
  | 'timber'
  | 'hedge'
  | 'zinc';

/** What a wall's name says it is made of; null where it says nothing. */
export function wallMaterialNamed(name: string): WallMaterial | null {
  if (/\bhedges?\b/iu.test(name)) return 'hedge';
  if (/\b(?:corrugated|zinc|tin|iron|metal|sheet)\b/iu.test(name))
    return 'zinc';
  if (/\b(?:mud|adobe|clay|earth(?:en)?)\b/iu.test(name)) return 'mud';
  if (/\b(?:concrete|cement|breeze ?block|cinder ?block|block)\b/iu.test(name))
    return 'concrete';
  if (/\b(?:brick|bricks)\b/iu.test(name)) return 'brick';
  if (/\b(?:stone|rock|rocks|dry ?stone|cobble)\b/iu.test(name))
    return 'stone';
  if (/\b(?:wood(?:en)?|timber|plank|log)\b/iu.test(name)) return 'timber';
  return null;
}

/** What a place's walls are made of when their name says nothing: its pack's. */
export function wallMaterialOf(
  pack: StylePackId | null,
  name = '',
): WallMaterial {
  const named = wallMaterialNamed(name);
  if (named) return named;
  if (pack === 'ancient-near-east') return 'mud';
  const build = buildOf(pack);
  // A farm's wall is a dry stone wall, never its rail fence: one climbs up on it.
  return build === 'compound'
    ? 'concrete'
    : build === 'stone' || build === 'rural'
      ? 'stone'
      : 'brick';
}

/** A stretch of wall as its place builds one, or as its name says (a hedge, a brick wall), to stand by or climb up on. */
function drawWall(pack: StylePackId | null, name = ''): SetPiece {
  const made = wallMaterialOf(pack, name);
  const body =
    made === 'concrete'
      ? rect(-124, -96, 248, 96, CONCRETE, 0) +
        rect(-130, -106, 260, 12, '#c2b397') +
        line(
          'M-124,-64 L124,-64 M-124,-32 L124,-32 M-60,-94 L-60,-64 M40,-94 L40,-64 M-10,-64 L-10,-32 M90,-64 L90,-32 M-80,-32 L-80,0 M30,-32 L30,0',
          '#a99a80',
          2,
        )
      : made === 'hedge'
        ? `<path d="M-128,0 L-128,-78 Q-120,-106 -86,-100 Q-64,-116 -34,-102 Q-4,-118 26,-102 Q56,-116 84,-100 Q118,-106 128,-78 L128,0 Z" ${fill(LEAF)}/>` +
          line(
            'M-96,-70 Q-84,-80 -72,-70 M-30,-58 Q-18,-68 -6,-58 M40,-74 Q52,-84 64,-74 M88,-40 Q100,-50 112,-40 M-70,-30 Q-58,-40 -46,-30',
            LEAF_DARK,
            2.4,
          )
        : made === 'zinc'
          ? rect(-124, -106, 248, 106, '#a7adb3', 0) +
            line(
              Array.from(
                { length: 15 },
                (_, i) => `M${-116 + i * 16},-106 L${-116 + i * 16},0`,
              ).join(' '),
              '#868c93',
              2,
            ) +
            line('M-124,-80 L124,-80 M-124,-24 L124,-24', '#c0763f', 1.6)
          : made === 'timber'
            ? wallRun(-124, 248, 106, 'rural')
            : made === 'mud'
              ? rect(-124, -98, 248, 98, MUD_BRICK, 0) +
                `<path d="M-128,-98 Q-100,-110 -60,-104 Q0,-112 60,-104 Q100,-110 128,-98 Z" ${fill(shadeOf(MUD_BRICK, 1.08))}/>` +
                line(
                  'M-124,-66 L124,-66 M-124,-33 L124,-33 M-80,-98 L-80,-66 M10,-98 L10,-66 M90,-98 L90,-66 M-40,-66 L-40,-33 M50,-66 L50,-33 M-100,-33 L-100,0 M-10,-33 L-10,0 M80,-33 L80,0',
                  shadeOf(MUD_BRICK, 0.82),
                  2,
                )
              : wallRun(-124, 248, 106, made === 'stone' ? 'stone' : 'town');
  // A hedge's and a mud wall's tops bulge a little above the rest.
  const tall = made === 'hedge' || made === 'mud' ? 110 : 106;
  return marked(
    {
      ...framed(body, [-130, -tall, 260, tall]),
      perch: 106,
      roosts: [
        [-80, -106],
        [0, -106],
        [80, -106],
      ],
    },
    made,
    pack,
  );
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
