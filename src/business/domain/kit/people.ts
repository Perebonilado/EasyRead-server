/**
 * People as silhouettes (explainer-animation-plan §7.2; research §3.5):
 * the editorial look's people, anonymous and dignified. Each is one flat
 * fill (its side's colour, or the ink) with a lit edge on the side the
 * light comes from, and no face and no features: a person is a shape
 * that stands, walks, points, sits, speaks at a lectern, raises a hand,
 * holds up a sign or a banner, or carries a load.
 *
 *  - One: a figure rigged to the kit's standard (rig.ts), so the stage
 *    can walk it, point it at something and wave it.
 *  - A pair: facing each other, walking together, shaking hands.
 *  - A group of 3 to 12: varied heights, builds, postures, dress and
 *    spacing, never clones; standing, walking or marching in step.
 *  - A crowd in the dozens or hundreds, counted honestly: as many figures
 *    as the research's number, or one for every round number of people
 *    when that is too many to draw (its notes say how many each stands
 *    for). Its near rows are pieces of their own that shift a little;
 *    its far rows are a few shapes drawn once and used again, fading
 *    toward the paper with distance.
 *
 * An era changes what people wore, as outlines only: a hat many wore
 * then, the length of a coat or a skirt, a uniform's cap. Nothing here
 * dresses a people by its culture (no robe or wrap stands for a nation),
 * and nothing says where they are: that is the map's and the research's.
 * A silhouette never stands for a named person (that is a portrait or a
 * trace of them), and the audience is never on screen.
 *
 * A figure is designed standing at rest, facing right with its feet on
 * y = 0; posed by turns at its joints and by reaching its hands to a
 * point; set down so its lowest foot touches the ground; then placed in
 * the piece, mirrored when it faces left.
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import { ERA_IDS, type EraId } from './eras';
import type { KitEntry, KitParams } from './registry';
import {
  type Build,
  type FigurePart,
  type Joints,
  type KitPiece,
  type RigPart,
  GROWN_UP,
  JOINTS,
  assemble,
  figureParts,
  posed,
  reach,
  standingJoints,
  svgOf,
} from './rig';
import { rand, subSeed, type Rand } from './seed';
import {
  type Pt,
  type Shape,
  add,
  awayFrom,
  blob,
  capsule,
  circle,
  dist,
  ellipse,
  groundShadow,
  join,
  lerp,
  litShape,
  mapShape,
  n1,
  rect,
  rimFilter,
  rounded,
  scale,
  sub,
  turn,
  unionBox,
} from './shape';
import {
  type KitFills,
  type KitStyle,
  colourOf,
  fillsOf,
  hazed,
  mixOk,
} from './style';

// ── Who, and what they wear ───────────────────────────────────────────────

type Who = 'woman' | 'man' | 'child';
type Lower = 'trousers' | 'skirt' | 'long-skirt' | 'robe' | 'tunic';
type Upper = 'plain' | 'coat' | 'frock-coat';
type Hair = 'short' | 'long' | 'bun' | 'pony' | 'cropped';
type Hat =
  | 'none'
  | 'top-hat'
  | 'bowler'
  | 'flat-cap'
  | 'fedora'
  | 'cloche'
  | 'bonnet'
  | 'peaked-cap'
  | 'hard-hat';

interface Person {
  who: Who;
  build: Build;
  /** How broad they are, about 1. */
  bulk: number;
  lower: Lower;
  upper: Upper;
  hair: Hair;
  hat: Hat;
}

/** Whom a piece shows: everyone, or as the research says. */
export const WHO_VALUES = ['mixed', 'women', 'men', 'children'] as const;
type WhoSaid = (typeof WHO_VALUES)[number];
/** How they are dressed: as people were then, in a uniform, in work clothes. */
export const DRESS_VALUES = ['everyday', 'uniform', 'work'] as const;
type DressKind = (typeof DRESS_VALUES)[number];

/** Which hats a share of people wore in each era (everyday dress), for men and for women. */
const ERA_HATS: Readonly<
  Record<EraId, { man: [Hat, number][]; woman: [Hat, number][] }>
> = {
  ancient: { man: [['none', 1]], woman: [['none', 1]] },
  medieval: { man: [['none', 1]], woman: [['none', 1]] },
  '1500-1800': { man: [['none', 1]], woman: [['none', 1]] },
  '1800-1900': {
    man: [
      ['top-hat', 0.25],
      ['bowler', 0.25],
      ['flat-cap', 0.3],
      ['none', 0.2],
    ],
    woman: [
      ['bonnet', 0.45],
      ['none', 0.55],
    ],
  },
  '1900-1945': {
    man: [
      ['fedora', 0.35],
      ['flat-cap', 0.3],
      ['bowler', 0.1],
      ['none', 0.25],
    ],
    woman: [
      ['cloche', 0.35],
      ['none', 0.65],
    ],
  },
  '1945-1975': {
    man: [
      ['fedora', 0.25],
      ['none', 0.75],
    ],
    woman: [['none', 1]],
  },
  '1975-2000': { man: [['none', 1]], woman: [['none', 1]] },
  today: { man: [['none', 1]], woman: [['none', 1]] },
};

/** What a person wore below the waist and over the body in an era: outlines only. */
function clothesOf(
  who: Who,
  era: EraId,
  r: Rand,
): { lower: Lower; upper: Upper } {
  const woman = who === 'woman' || (who === 'child' && r.chance(0.5));
  switch (era) {
    case 'ancient':
    case 'medieval':
      return {
        lower: woman
          ? r.weighted<Lower>([
              ['robe', 0.6],
              ['long-skirt', 0.4],
            ])
          : r.weighted<Lower>([
              ['tunic', 0.55],
              ['robe', 0.25],
              ['trousers', 0.2],
            ]),
        upper: 'plain',
      };
    case '1500-1800':
    case '1800-1900':
      return woman
        ? { lower: 'long-skirt', upper: 'plain' }
        : {
            lower: 'trousers',
            upper: r.weighted<Upper>([
              ['frock-coat', era === '1500-1800' ? 0.55 : 0.45],
              ['coat', era === '1500-1800' ? 0 : 0.2],
              ['plain', 0.35],
            ]),
          };
    case '1900-1945':
      return woman
        ? {
            lower: r.weighted<Lower>([
              ['skirt', 0.85],
              ['trousers', 0.15],
            ]),
            upper: r.chance(0.3) ? 'coat' : 'plain',
          }
        : { lower: 'trousers', upper: r.chance(0.35) ? 'coat' : 'plain' };
    case '1945-1975':
      return woman
        ? {
            lower: r.weighted<Lower>([
              ['skirt', 0.6],
              ['trousers', 0.4],
            ]),
            upper: 'plain',
          }
        : { lower: 'trousers', upper: r.chance(0.2) ? 'coat' : 'plain' };
    default:
      return woman
        ? {
            lower: r.weighted<Lower>([
              ['trousers', 0.6],
              ['skirt', 0.4],
            ]),
            upper: r.chance(0.15) ? 'coat' : 'plain',
          }
        : { lower: 'trousers', upper: r.chance(0.12) ? 'coat' : 'plain' };
  }
}

/** One person: who they are drawn as, their build, and what they wear. */
function personOf(
  r: Rand,
  whoSaid: WhoSaid,
  era: EraId,
  dress: DressKind,
): Person {
  const who: Who =
    whoSaid === 'women'
      ? 'woman'
      : whoSaid === 'men'
        ? 'man'
        : whoSaid === 'children'
          ? 'child'
          : r.chance(0.5)
            ? 'woman'
            : 'man';
  const build: Build =
    who === 'child'
      ? {
          height: r.between(108, 142),
          heads: 6.1,
          legs: 0.47,
          shoulders: 0.24,
          hips: 0.19,
        }
      : who === 'woman'
        ? {
            ...GROWN_UP,
            height: Math.max(148, Math.min(180, r.about(163, 9))),
            shoulders: 0.235,
            hips: 0.2,
          }
        : {
            ...GROWN_UP,
            height: Math.max(160, Math.min(194, r.about(176, 10))),
            shoulders: 0.262,
            hips: 0.185,
          };
  const bulk = who === 'child' ? r.between(0.92, 1.02) : r.between(0.9, 1.16);
  const clothes = clothesOf(who, era, r);
  const hair: Hair =
    who === 'man'
      ? r.weighted<Hair>([
          ['short', 0.75],
          ['cropped', 0.25],
        ])
      : era === '1800-1900' || era === '1500-1800'
        ? r.weighted<Hair>([
            ['bun', 0.75],
            ['long', 0.25],
          ])
        : r.weighted<Hair>([
            ['long', 0.32],
            ['bun', 0.22],
            ['pony', 0.18],
            ['short', 0.28],
          ]);
  let hat: Hat =
    who === 'child'
      ? 'none'
      : r.weighted(ERA_HATS[era][who === 'woman' ? 'woman' : 'man']);
  let upper = clothes.upper;
  let lower = clothes.lower;
  if (dress === 'uniform' && who !== 'child') {
    hat = 'peaked-cap';
    lower = 'trousers';
    upper = r.chance(0.5) ? 'coat' : 'plain';
  } else if (dress === 'work' && who !== 'child') {
    const late = ERA_IDS.indexOf(era) >= ERA_IDS.indexOf('1945-1975');
    hat = r.chance(0.6) ? (late ? 'hard-hat' : 'flat-cap') : 'none';
    lower = 'trousers';
    upper = 'plain';
  }
  return { who, build, bulk, lower, upper, hair, hat };
}

// ── Poses ─────────────────────────────────────────────────────────────────

export const POSES = [
  'standing',
  'walking',
  'pointing',
  'seated',
  'lectern',
  'raising-hand',
  'sign',
  'banner',
  'carrying',
] as const;
export type PersonPose = (typeof POSES)[number];

/** Poses that may face the camera; every other is drawn in profile. */
const FRONT_POSES = new Set<PersonPose>([
  'standing',
  'raising-hand',
  'sign',
  'banner',
]);

type Prop = 'none' | 'sign' | 'banner' | 'crate' | 'case' | 'bag';

/** How a figure is posed: its turns (degrees forward for a profile, on screen for one facing the camera), where its wrists reach, and what it holds. */
interface Posing {
  turns: Partial<Record<FigurePart, number>>;
  /** Where each wrist reaches, in the figure's own frame (feet at 0, facing right). */
  reachL?: Pt;
  reachR?: Pt;
  prop: Prop;
  seat?: boolean;
  lectern?: boolean;
}

/** A walk's stride at its phase: 0 the near foot striking the ground ahead, 0.5 the far one. */
export function strideTurns(
  phase: number,
): Partial<Record<FigurePart, number>> {
  // Each key's values for the near limb, then the far one.
  const contact = {
    thigh: [21, -15],
    shin: [-3, -16],
    foot: [-2, 10],
    arm: [-17, 17],
    forearm: [10, 24],
  };
  const passing = {
    thigh: [1, 10],
    shin: [-6, -48],
    foot: [5, 18],
    arm: [-3, 4],
    forearm: [8, 12],
  };
  // Four keys round the cycle: contact, passing, then both the other way about.
  const at = ((phase % 1) + 1) % 1;
  const k = Math.floor(at * 4);
  const u = at * 4 - k;
  const ease = u * u * (3 - 2 * u);
  const key = (i: number) => {
    const swap = i % 4 >= 2;
    const src = i % 2 === 0 ? contact : passing;
    const pick = (pair: number[]) => (swap ? [pair[1], pair[0]] : pair);
    return {
      thigh: pick(src.thigh),
      shin: pick(src.shin),
      foot: pick(src.foot),
      arm: pick(src.arm),
      forearm: pick(src.forearm),
    };
  };
  const a = key(k);
  const b = key(k + 1);
  const mix = (x: number[], y: number[], s: number) =>
    x[s] + (y[s] - x[s]) * ease;
  return {
    'thigh-l': mix(a.thigh, b.thigh, 0),
    'thigh-r': mix(a.thigh, b.thigh, 1),
    'shin-l': mix(a.shin, b.shin, 0),
    'shin-r': mix(a.shin, b.shin, 1),
    'foot-l': mix(a.foot, b.foot, 0),
    'foot-r': mix(a.foot, b.foot, 1),
    'arm-l': mix(a.arm, b.arm, 0),
    'arm-r': mix(a.arm, b.arm, 1),
    'forearm-l': mix(a.forearm, b.forearm, 0),
    'forearm-r': mix(a.forearm, b.forearm, 1),
    torso: 2,
  };
}

/** A pose's turns and reaches, in units of the figure's height. */
function posingOf(
  pose: PersonPose,
  front: boolean,
  H: number,
  r: Rand,
  phase: number,
): Posing {
  const P = (x: number, y: number): Pt => [x * H, -y * H];
  switch (pose) {
    case 'walking':
      return { turns: strideTurns(phase), prop: 'none' };
    case 'pointing':
      return {
        turns: {
          'arm-l': r.between(72, 88),
          'forearm-l': 6,
          'hand-l': 4,
          'arm-r': -4,
          'forearm-r': 8,
          'thigh-l': 6,
          'thigh-r': -6,
          torso: 2,
        },
        prop: 'none',
      };
    case 'seated':
      return {
        turns: {
          'thigh-l': 88,
          'shin-l': -86,
          'thigh-r': 84,
          'shin-r': -78,
          'arm-l': 16,
          'forearm-l': 64,
          'arm-r': 14,
          'forearm-r': 58,
          torso: 3,
        },
        prop: 'none',
        seat: true,
      };
    case 'lectern':
      return {
        turns: { 'arm-r': 10, 'forearm-r': 30, 'thigh-l': 3, 'thigh-r': -3 },
        reachL: P(0.2, 0.665),
        prop: 'none',
        lectern: true,
      };
    case 'raising-hand':
      return front
        ? {
            turns: { 'arm-l': -166, 'forearm-l': -6, 'arm-r': 4 },
            prop: 'none',
          }
        : {
            turns: {
              'arm-l': 168,
              'forearm-l': 8,
              'arm-r': -3,
              'forearm-r': 6,
            },
            prop: 'none',
          };
    case 'sign':
    case 'banner':
      return front
        ? {
            turns: {},
            reachL: P(0.04, pose === 'sign' ? 0.9 : 0.95),
            reachR: P(0.04, pose === 'sign' ? 0.74 : 0.78),
            prop: pose,
          }
        : {
            turns: { torso: -2 },
            reachL: P(0.17, pose === 'sign' ? 0.88 : 0.93),
            reachR: P(0.17, pose === 'sign' ? 0.72 : 0.76),
            prop: pose,
          };
    case 'carrying':
      return r.chance(0.5)
        ? {
            turns: { torso: -3, 'thigh-l': 8, 'thigh-r': -8 },
            reachL: P(0.27, 0.6),
            reachR: P(0.25, 0.62),
            prop: 'crate',
          }
        : {
            // A suitcase at the near side, its arm straight with the weight.
            turns: {
              'arm-l': -2,
              'forearm-l': 2,
              'arm-r': 8,
              'forearm-r': 14,
              torso: -1,
            },
            prop: 'case',
          };
    default:
      // At ease: arms loose, sometimes a hand on the hip or a bag.
      return front
        ? {
            turns: {
              'arm-l': -r.between(2, 6),
              'arm-r': r.between(2, 6),
              'forearm-l': -r.between(0, 6),
              'forearm-r': r.between(0, 6),
              'thigh-l': -r.between(0, 3),
              'thigh-r': r.between(0, 3),
            },
            ...(r.chance(0.25) ? { reachR: P(-0.105, 0.56) } : {}),
            prop: r.chance(0.18) ? 'bag' : 'none',
          }
        : {
            turns: {
              'arm-l': r.between(0, 8),
              'forearm-l': r.between(4, 14),
              'arm-r': -r.between(0, 6),
              'forearm-r': r.between(4, 12),
              'thigh-l': r.between(0, 5),
              'thigh-r': -r.between(0, 5),
            },
            prop: r.chance(0.18) ? 'bag' : 'none',
          };
  }
}

// ── Drawing a figure ──────────────────────────────────────────────────────

/** What a figure is drawn into: its colours, the light, and ids for its definitions. */
interface Canvas {
  style: KitStyle;
  fills: KitFills;
  /** A fresh id for a definition inside the piece. */
  id(): string;
  /** The id of the filter that lights a figure's outline at a depth (made once per depth). */
  rim(depth: number): string;
  /** The definitions made so far (the rim filters). */
  defs(): string;
}

/** A figure placed in its piece: where its feet are, which way it faces, its prefix and its parent part. */
interface Placing {
  at: Pt;
  facing: 1 | -1 | 0;
  prefix: string;
  parent: string | null;
  /** How far back it stands, 0 at the front: far figures fade toward the paper. */
  depth?: number;
}

interface DrawnFigure {
  parts: RigPart[];
  shadow: string;
  /** What it covers, its shadow aside. */
  box: ShotBox;
  joints: Joints;
  /** Where it stands: the middle of its feet, on its ground. */
  stands: Pt;
}

/** The map that takes a point of a part's rest frame (from a to b) to where the pose put it. */
function frameMap(ra: Pt, rb: Pt, pa: Pt, pb: Pt): (p: Pt) => Pt {
  const angle =
    Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) -
    Math.atan2(rb[1] - ra[1], rb[0] - ra[0]);
  return (p) => add(pa, turn(sub(p, ra), [0, 0], angle));
}

/**
 * Wrists reaching their points: of the two ways an elbow can bend, the
 * lower in a profile (an elbow points down and back), the outer facing
 * the camera (away from the body); the hand along the forearm.
 */
function reachHands(
  rest: Joints,
  joints: Joints,
  posing: Posing,
  front: boolean,
): Joints {
  const out = { ...joints };
  for (const side of ['l', 'r'] as const) {
    const target = side === 'l' ? posing.reachL : posing.reachR;
    if (!target) continue;
    const shoulder = out[`shoulder-${side}`];
    const upper = dist(rest[`shoulder-${side}`], rest[`elbow-${side}`]);
    const fore = dist(rest[`elbow-${side}`], rest[`wrist-${side}`]);
    const hand = dist(rest[`wrist-${side}`], rest[`fingers-${side}`]);
    const one = reach(shoulder, target, upper, fore, 1);
    const other = reach(shoulder, target, upper, fore, -1);
    const outward = side === 'l' ? 1 : -1;
    const elbow = front
      ? (one[0] - other[0]) * outward >= 0
        ? one
        : other
      : one[1] >= other[1]
        ? one
        : other;
    const toward = sub(target, elbow);
    const len = Math.max(1e-6, Math.hypot(toward[0], toward[1]));
    const wrist = add(elbow, scale(toward, fore / len));
    out[`elbow-${side}`] = elbow;
    out[`wrist-${side}`] = wrist;
    out[`fingers-${side}`] = add(wrist, scale(toward, hand / len));
  }
  return out;
}

/** The pose's joints set down: the lowest foot on the ground. */
function grounded(joints: Joints): Joints {
  const lowest = Math.max(
    joints['heel-l'][1],
    joints['toe-l'][1],
    joints['heel-r'][1],
    joints['toe-r'][1],
  );
  const out = {} as Joints;
  for (const j of JOINTS) out[j] = [joints[j][0], joints[j][1] - lowest];
  return out;
}

/** A point between the hips (t = 0) and the neck (t = 1), `x` of the height forward of the hips. */
const along = (rest: Joints, H: number, x: number, t: number): Pt => [
  rest.hip[0] + x * H,
  rest.hip[1] + t * (rest.neck[1] - rest.hip[1]),
];

/** The torso in profile, at rest: hips, back, nape, throat, chest and belly. */
function torsoSide(person: Person, rest: Joints): Shape {
  const H = person.build.height;
  const s = person.bulk;
  const pts: [number, number][] =
    person.who === 'woman'
      ? [
          [-0.064 * s, -0.1],
          [-0.073 * s, 0.07],
          [-0.045 * s, 0.31],
          [-0.049 * s, 0.57],
          [-0.043, 0.85],
          [-0.017, 1.0],
          [0.027, 0.98],
          [0.044, 0.86],
          [0.064 * s, 0.65],
          [0.049 * s, 0.49],
          [0.045 * s, 0.31],
          [0.054 * s, 0.1],
          [0.04, -0.11],
          [-0.02, -0.17],
        ]
      : [
          [-0.06 * s, -0.1],
          [-0.066 * s, 0.08],
          [-0.048 * s, 0.33],
          [-0.054 * s, 0.58],
          [-0.047, 0.85],
          [-0.018, 1.0],
          [0.03, 0.98],
          [0.05, 0.87],
          [0.064 * s, 0.62],
          [0.058 * s, 0.36],
          [0.055 * s, 0.11],
          [0.038, -0.11],
          [-0.02, -0.17],
        ];
  return blob(pts.map(([x, t]) => along(rest, H, x, t)));
}

/** The torso facing the camera, at rest: neck, shoulders, waist and hips, the same both sides. */
function torsoFront(person: Person, rest: Joints): Shape {
  const H = person.build.height;
  const s = person.bulk;
  const wide = person.build.shoulders / 0.25;
  const hips = person.build.hips / 0.19;
  const half: [number, number][] =
    person.who === 'woman'
      ? [
          [0.032, 1.0],
          [0.074 * wide, 0.96],
          [0.11 * wide, 0.915],
          [0.123 * wide, 0.84],
          [0.104 * wide, 0.7],
          [0.1 * s, 0.6],
          [0.084 * s, 0.44],
          [0.078 * s, 0.31],
          [0.108 * hips * s, 0.09],
          [0.1 * hips, -0.1],
          [0.022, -0.17],
        ]
      : [
          [0.034, 1.0],
          [0.082 * wide, 0.96],
          [0.122 * wide, 0.915],
          [0.137 * wide, 0.84],
          [0.118 * wide, 0.7],
          [0.1 * s, 0.48],
          [0.092 * s, 0.31],
          [0.1 * hips * s, 0.09],
          [0.094 * hips, -0.1],
          [0.022, -0.17],
        ];
  const right = half.map(([x, t]) => along(rest, H, x, t));
  const left = [...half].reverse().map(([x, t]) => along(rest, H, -x, t));
  return blob([...right, ...left]);
}

/** The head with its neck, its hair and its hat, at rest; `hs` is a head's height. */
function headShape(person: Person, rest: Joints, front: boolean): Shape {
  const H = person.build.height;
  const hs = H / person.build.heads;
  const P = (x: number, y: number): Pt => [
    rest.crown[0] + x * hs,
    rest.crown[1] + y * hs,
  ];
  const shapes: Shape[] = [];
  // Hair that falls behind the head is part of its outline.
  if (person.hair === 'long')
    shapes.push(
      front
        ? blob([
            P(0, -0.05),
            P(0.44, 0.08),
            P(0.52, 0.55),
            P(0.5, 1.2),
            P(0.28, 1.3),
            P(0, 1.05),
            P(-0.28, 1.3),
            P(-0.5, 1.2),
            P(-0.52, 0.55),
            P(-0.44, 0.08),
          ])
        : blob([
            P(0.22, 0.0),
            P(-0.2, -0.03),
            P(-0.46, 0.24),
            P(-0.5, 0.76),
            P(-0.44, 1.26),
            P(-0.24, 1.3),
            P(-0.12, 0.9),
            P(-0.04, 0.55),
          ]),
    );
  if (person.hair === 'bun')
    shapes.push(circle(front ? P(0, -0.08) : P(-0.42, 0.2), 0.17 * hs));
  if (person.hair === 'pony' && !front)
    shapes.push(capsule(P(-0.36, 0.34), 0.12 * hs, P(-0.56, 0.98), 0.065 * hs));
  // The neck, from inside the torso.
  shapes.push(
    capsule(
      [rest.neck[0], rest.neck[1] + 0.025 * H],
      0.16 * hs,
      front ? P(0, 0.86) : P(0.04, 0.84),
      0.15 * hs,
    ),
  );
  if (front) {
    shapes.push(ellipse(P(0, 0.48), 0.37 * hs, 0.48 * hs));
    shapes.push(
      blob([
        P(-0.34, 0.58),
        P(-0.25, 0.88),
        P(0, 1.0),
        P(0.25, 0.88),
        P(0.34, 0.58),
        P(0, 0.48),
      ]),
    );
  } else {
    shapes.push(
      ellipse(P(-0.03, 0.47), 0.42 * hs, 0.48 * hs, (-14 * Math.PI) / 180),
    );
    // The jaw and the line of the face: no features, only which way it looks.
    shapes.push(
      blob([
        P(-0.06, 0.86),
        P(0.17, 0.99),
        P(0.35, 0.97),
        P(0.42, 0.79),
        P(0.41, 0.6),
        P(0.2, 0.58),
      ]),
    );
  }
  const hat = hatShape(person.hat, front, P, hs);
  if (hat) shapes.push(hat);
  return join(...shapes);
}

/** A hat's outline, in the head's frame (in heads, from the crown). */
function hatShape(
  hat: Hat,
  front: boolean,
  P: (x: number, y: number) => Pt,
  hs: number,
): Shape | null {
  const sym = (pts: [number, number][]) =>
    blob([
      ...pts.map(([x, y]) => P(x, y)),
      ...[...pts].reverse().map(([x, y]) => P(-x, y)),
    ]);
  switch (hat) {
    case 'top-hat':
      return join(
        rounded(
          [P(-0.35, -0.78), P(0.37, -0.78), P(0.39, 0.14), P(-0.37, 0.14)],
          0.04 * hs,
        ),
        rounded(
          front
            ? [P(-0.56, 0.08), P(0.56, 0.08), P(0.56, 0.2), P(-0.56, 0.2)]
            : [P(-0.58, 0.07), P(0.62, 0.07), P(0.62, 0.19), P(-0.58, 0.19)],
          0.05 * hs,
        ),
      );
    case 'bowler':
      return join(
        ellipse(P(0.02, 0.17), 0.45 * hs, 0.36 * hs),
        ellipse(P(front ? 0 : 0.03, 0.3), 0.58 * hs, 0.075 * hs),
      );
    case 'flat-cap':
      return front
        ? ellipse(P(0, 0.12), 0.5 * hs, 0.2 * hs)
        : blob([
            P(-0.47, 0.32),
            P(-0.36, 0.02),
            P(0.1, -0.07),
            P(0.46, 0.12),
            P(0.68, 0.3),
            P(0.4, 0.34),
            P(0, 0.3),
          ]);
    case 'fedora':
      return join(
        front
          ? sym([
              [0, -0.27],
              [0.17, -0.33],
              [0.34, -0.28],
              [0.37, 0.24],
            ])
          : blob([
              P(-0.37, 0.26),
              P(-0.34, -0.28),
              P(0, -0.37),
              P(0.06, -0.27),
              P(0.36, -0.31),
              P(0.39, 0.26),
            ]),
        ellipse(
          P(front ? 0 : 0.02, 0.25),
          0.66 * hs,
          0.08 * hs,
          front ? 0 : (4 * Math.PI) / 180,
        ),
      );
    case 'cloche':
      return front
        ? sym([
            [0, -0.08],
            [0.3, -0.02],
            [0.48, 0.25],
            [0.5, 0.52],
            [0.32, 0.45],
          ])
        : blob([
            P(0.44, 0.45),
            P(0.47, 0.15),
            P(0.2, -0.08),
            P(-0.26, -0.07),
            P(-0.5, 0.25),
            P(-0.53, 0.62),
            P(-0.3, 0.55),
            P(0.1, 0.45),
          ]);
    case 'bonnet':
      return front
        ? sym([
            [0, -0.12],
            [0.36, -0.06],
            [0.56, 0.3],
            [0.56, 0.78],
            [0.42, 0.74],
            [0.4, 0.3],
            [0.2, 0.08],
            [0, 0.06],
          ])
        : blob([
            P(0.56, 0.64),
            P(0.6, 0.1),
            P(0.25, -0.13),
            P(-0.3, -0.09),
            P(-0.56, 0.3),
            P(-0.5, 0.76),
            P(-0.25, 0.7),
            P(0.0, 0.36),
            P(0.36, 0.56),
          ]);
    case 'peaked-cap':
      return front
        ? join(
            sym([
              [0, -0.1],
              [0.46, -0.08],
              [0.4, 0.28],
            ]),
            ellipse(P(0, 0.32), 0.3 * hs, 0.06 * hs),
          )
        : join(
            blob([
              P(-0.4, 0.28),
              P(-0.47, -0.08),
              P(0.43, -0.12),
              P(0.38, 0.28),
            ]),
            blob([P(0.28, 0.25), P(0.69, 0.35), P(0.64, 0.42), P(0.27, 0.36)]),
          );
    case 'hard-hat':
      return join(
        ellipse(P(front ? 0 : 0.03, 0.2), 0.48 * hs, 0.38 * hs),
        ellipse(P(front ? 0 : 0.06, 0.31), 0.6 * hs, 0.07 * hs),
      );
    default:
      return null;
  }
}

/** A foot's shoe in profile, at rest, round its ankle, its sole on the ground. */
function footSide(person: Person, rest: Joints, side: 'l' | 'r'): Shape {
  const H = person.build.height;
  const k = person.who === 'woman' ? 0.92 : 1;
  const a = rest[`ankle-${side}`];
  return rounded(
    [
      [a[0] - 0.036 * H * k, 0],
      [a[0] + 0.1 * H * k, 0],
      [a[0] + 0.118 * H * k, -0.012 * H],
      [a[0] + 0.11 * H * k, -0.024 * H],
      [a[0] + 0.055 * H * k, a[1] + 0.012 * H],
      [a[0] + 0.022 * H, a[1] - 0.022 * H],
      [a[0] - 0.022 * H, a[1] - 0.022 * H],
      [a[0] - 0.04 * H * k, -0.02 * H],
    ],
    0.012 * H,
  );
}

/** A skirt, a robe, a tunic or a coat's tail, at rest: from the waist to its hem. */
function skirtShape(
  person: Person,
  rest: Joints,
  front: boolean,
): Shape | null {
  const H = person.build.height;
  const s = person.bulk;
  const lower = person.lower;
  const coat = person.upper !== 'plain' && lower === 'trousers';
  if (lower === 'trousers' && !coat) return null;
  const knee = rest['knee-l'][1];
  const hipY = rest.hip[1];
  const waistY = hipY + 0.3 * (rest.neck[1] - hipY);
  const hem =
    lower === 'skirt'
      ? knee + 0.025 * H
      : lower === 'long-skirt'
        ? -0.03 * H
        : lower === 'robe'
          ? -0.04 * H
          : lower === 'tunic'
            ? knee - 0.06 * H
            : person.upper === 'frock-coat'
              ? knee - 0.01 * H
              : hipY + 0.55 * (knee - hipY);
  const flare =
    lower === 'long-skirt'
      ? 0.118
      : lower === 'skirt' || lower === 'robe'
        ? 0.088
        : lower === 'tunic'
          ? 0.078
          : 0.074;
  const hip = (person.who === 'woman' ? 0.075 : 0.066) * s;
  if (front)
    return blob(
      [
        [-0.078 * s * H, waistY],
        [0.078 * s * H, waistY],
        [(hip + 0.03) * H, hipY],
        [(flare + 0.035) * H, hem],
        [-(flare + 0.035) * H, hem],
        [-(hip + 0.03) * H, hipY],
      ],
      0.6,
    );
  const x = rest.hip[0];
  return blob(
    [
      [x - 0.047 * s * H, waistY],
      [x + 0.046 * s * H, waistY],
      [x + (hip - 0.008) * H, hipY],
      [x + (flare - 0.004) * H, hem],
      [x - flare * H, hem],
      [x - (hip + 0.004) * H, hipY - 0.02 * H],
    ],
    0.55,
  );
}

/** Each limb's width at its joints, as a share of height: trousers straight, bare legs tapering. */
function limbs(person: Person) {
  const s = person.bulk;
  const trousers = person.lower === 'trousers';
  return {
    hip: (trousers ? 0.062 : 0.056) * s,
    knee: (trousers ? 0.04 : 0.036) * Math.sqrt(s),
    ankle: trousers ? 0.029 : 0.022,
    shoulder: 0.035 * s,
    elbow: 0.027 * Math.sqrt(s),
    wrist: 0.019,
    hand: 0.025,
  };
}

/** Something a figure holds or stands by, before it is placed. */
interface Extra {
  id: string;
  /** The part it hangs from, '' for the figure's own group. */
  parent: string;
  shape: Shape;
  fill: string;
  pivot: Pt;
}

/** A figure's props: a sign or a banner on a pole, a crate, a suitcase, a bag; a lectern; a seat. */
function extrasOf(
  person: Person,
  posing: Posing,
  joints: Joints,
  canvas: Canvas,
  hipWidth: number,
): Extra[] {
  const { style } = canvas;
  const H = person.build.height;
  const P = (x: number, y: number): Pt => [x * H, -y * H];
  const out: Extra[] = [];
  const pale = mixOk(canvas.fills.body, style.paper, 0.68);
  if (posing.prop === 'sign' || posing.prop === 'banner') {
    const hands = [joints['wrist-l'], joints['wrist-r']];
    const x = (hands[0][0] + hands[1][0]) / 2;
    const top = posing.prop === 'sign' ? -1.3 * H : -1.46 * H;
    const pole = capsule(
      [x, Math.max(hands[0][1], hands[1][1]) + 0.1 * H],
      0.0085 * H,
      [x, top],
      0.0085 * H,
    );
    const cloth =
      posing.prop === 'sign'
        ? rect(x - 0.22 * H, top - 0.06 * H, 0.44 * H, 0.27 * H, 0.012 * H)
        : blob(
            [
              [x, top + 0.01 * H],
              [x - 0.3 * H, top + 0.01 * H],
              [x - 0.3 * H, top + 0.36 * H],
              [x - 0.22 * H, top + 0.3 * H],
              [x - 0.14 * H, top + 0.36 * H],
              [x, top + 0.34 * H],
            ],
            0.15,
          );
    out.push(
      {
        id: 'pole',
        parent: 'hand-l',
        shape: pole,
        fill: canvas.fills.body,
        pivot: joints['wrist-l'],
      },
      {
        id: 'prop',
        parent: 'pole',
        shape: cloth,
        fill:
          posing.prop === 'sign'
            ? pale
            : mixOk(canvas.fills.body, style.paper, 0.3),
        pivot: [x, top + 0.02 * H],
      },
    );
  }
  if (posing.prop === 'crate')
    out.push({
      id: 'prop',
      parent: 'body',
      shape: rect(0.1 * H, -0.77 * H, 0.27 * H, 0.24 * H, 0.01 * H),
      fill: mixOk(canvas.fills.body, style.paper, 0.5),
      pivot: P(0.24, 0.53),
    });
  if (posing.prop === 'case') {
    const hand = joints['fingers-l'];
    out.push({
      id: 'prop',
      parent: 'hand-l',
      shape: join(
        rect(
          hand[0] - 0.12 * H,
          hand[1] + 0.012 * H,
          0.24 * H,
          0.17 * H,
          0.014 * H,
        ),
        capsule(
          [hand[0] - 0.03 * H, hand[1] + 0.012 * H],
          0.008 * H,
          [hand[0] + 0.03 * H, hand[1] + 0.012 * H],
          0.008 * H,
        ),
      ),
      fill: mixOk(canvas.fills.body, style.paper, 0.42),
      pivot: [hand[0], hand[1] + 0.012 * H],
    });
  }
  if (posing.prop === 'bag') {
    const hand = joints['fingers-r'];
    out.push({
      id: 'prop',
      parent: 'hand-r',
      shape: rect(
        hand[0] - 0.045 * H,
        hand[1] - 0.01 * H,
        0.09 * H,
        0.1 * H,
        0.012 * H,
      ),
      fill: canvas.fills.shade,
      pivot: [hand[0], hand[1]],
    });
  }
  if (posing.lectern)
    out.push({
      id: 'lectern',
      parent: 'body',
      shape: rounded(
        [
          P(0.22, 0),
          P(0.38, 0),
          P(0.36, 0.56),
          P(0.45, 0.6),
          P(0.43, 0.645),
          P(0.15, 0.69),
          P(0.155, 0.64),
          P(0.25, 0.57),
        ],
        0.008 * H,
      ),
      fill: mixOk(style.muted, style.paper, 0.25),
      pivot: P(0.3, 0),
    });
  if (posing.seat) {
    const hip = joints.hip;
    const top = hip[1] + hipWidth * 0.85;
    out.push({
      id: 'seat',
      parent: '',
      shape: join(
        rect(hip[0] - 0.12 * H, top, 0.26 * H, 0.035 * H, 0.008 * H),
        rect(hip[0] - 0.1 * H, top, 0.022 * H, -top, 0.004 * H),
        rect(hip[0] + 0.1 * H, top, 0.022 * H, -top, 0.004 * H),
      ),
      fill: mixOk(style.muted, style.paper, 0.2),
      pivot: [hip[0], 0],
    });
  }
  return out;
}

/**
 * One figure drawn: posed, set on the ground, its parts' shapes from its
 * joints (the limbs) or carried from its rest frame (torso, head, feet,
 * skirt), placed and lit, with what it holds and its shadow.
 */
function drawFigure(
  person: Person,
  posing: Posing,
  front: boolean,
  place: Placing,
  canvas: Canvas,
): DrawnFigure {
  const { style } = canvas;
  const H = person.build.height;
  const view = front ? 'front' : 'side';
  const rest = standingJoints(person.build, view);
  const svgTurns: Partial<Record<FigurePart, number>> = {};
  for (const [part, deg] of Object.entries(posing.turns) as [
    FigurePart,
    number,
  ][])
    // Forward, for a profile facing right: a hanging limb turns
    // anticlockwise, the torso and the head (which point up) clockwise.
    svgTurns[part] = front
      ? deg
      : part === 'torso' || part === 'head'
        ? deg
        : -deg;
  const joints = grounded(
    reachHands(rest, posed(rest, { turns: svgTurns }), posing, front),
  );
  const w = limbs(person);
  const shapes: Record<string, Shape> = {};
  const carry = (a: keyof Joints, b: keyof Joints) =>
    frameMap(rest[a], rest[b], joints[a], joints[b]);
  shapes.torso = mapShape(
    front ? torsoFront(person, rest) : torsoSide(person, rest),
    carry('hip', 'neck'),
  );
  shapes.head = mapShape(
    headShape(person, rest, front),
    carry('neck', 'crown'),
  );
  const skirt = skirtShape(person, rest, front);
  for (const side of ['l', 'r'] as const) {
    const ankle = joints[`ankle-${side}`];
    shapes[`thigh-${side}`] = capsule(
      joints[`hip-${side}`],
      w.hip * H,
      joints[`knee-${side}`],
      w.knee * H,
    );
    shapes[`shin-${side}`] = capsule(
      joints[`knee-${side}`],
      w.knee * H * 0.97,
      ankle,
      w.ankle * H,
    );
    shapes[`foot-${side}`] = front
      ? capsule(
          ankle,
          0.021 * H,
          add(ankle, [(side === 'l' ? 1 : -1) * 0.008 * H, 0.02 * H]),
          0.024 * H,
        )
      : mapShape(
          footSide(person, rest, side),
          carry(`ankle-${side}`, `toe-${side}`),
        );
    shapes[`arm-${side}`] = capsule(
      joints[`shoulder-${side}`],
      w.shoulder * H,
      joints[`elbow-${side}`],
      w.elbow * H,
    );
    shapes[`forearm-${side}`] = capsule(
      joints[`elbow-${side}`],
      w.elbow * H * 0.95,
      joints[`wrist-${side}`],
      w.wrist * H,
    );
    const wrist = joints[`wrist-${side}`];
    const tip = joints[`fingers-${side}`];
    // A mitten: a short round hand, no fingers.
    shapes[`hand-${side}`] = ellipse(
      lerp(wrist, tip, 0.4),
      dist(wrist, tip) * 0.42 + 0.004 * H,
      w.hand * H,
      Math.atan2(tip[1] - wrist[1], tip[0] - wrist[0]),
    );
  }
  const extras: Extra[] = [
    ...(skirt
      ? [
          {
            id: 'skirt',
            parent: 'body',
            shape: mapShape(skirt, carry('hip', 'neck')),
            fill: canvas.fills.body,
            pivot: along(joints, H, 0, 0.3),
          },
        ]
      : []),
    ...extrasOf(person, posing, joints, canvas, w.hip * H),
  ];
  // Placed in the piece, and mirrored to face left.
  const flip = place.facing < 0 ? -1 : 1;
  const put = (p: Pt): Pt => [place.at[0] + flip * p[0], place.at[1] + p[1]];
  const placed = {} as Joints;
  for (const j of JOINTS) placed[j] = put(joints[j]);
  const depth = place.depth ?? 0;
  const tone = (c: string) => (depth > 0 ? hazed(style, c, depth) : c);
  const lit = (fill: string) => ({
    fill: tone(fill),
    rim: tone(mixOk(fill, style.rim.colour, style.rim.strength)),
    away: awayFrom(style.rim.angle, style.rim.width * H * (1 - depth * 0.5)),
  });
  // The figure's own parts are flat fills, the far limbs a shade darker;
  // its lit edge comes from one filter on its body, so only its outline
  // is lit, never the seams between its parts, however they are posed.
  const farSide = (part: string) => !front && /-r$/.test(part);
  const flat = (shape: Shape, fill: string) =>
    `<path d="${shape.d}" fill="${tone(fill)}"/>`;
  const drawing: Partial<Record<FigurePart, { markup: string; box: ShotBox }>> =
    {};
  const boxes: ShotBox[] = [];
  for (const [part, shape] of Object.entries(shapes)) {
    const at = mapShape(shape, put);
    boxes.push(at.box);
    drawing[part as FigurePart] = {
      markup: flat(at, farSide(part) ? canvas.fills.shade : canvas.fills.body),
      box: at.box,
    };
  }
  const extraParts: RigPart[] = extras.map((extra) => {
    const at = mapShape(extra.shape, put);
    boxes.push(at.box);
    // What the figure holds is lit with it; a seat or a lectern by itself.
    const own = extra.parent === '' || extra.id === 'lectern';
    return {
      id: `${place.prefix}${extra.id}`,
      parent: extra.parent ? `${place.prefix}${extra.parent}` : place.parent,
      markup: own
        ? litShape(canvas.id(), at, lit(extra.fill))
        : flat(at, extra.fill),
      box: at.box,
      pivot: put(extra.pivot),
    };
  });
  // Back to front: the far limbs, the body, the near limbs; a skirt over
  // the near leg, a crate or a lectern before the near arm (a case hangs
  // from the near hand); a seat behind everything.
  const order = front
    ? ['thigh-r', 'thigh-l', 'skirt', 'torso', 'arm-r', 'arm-l', 'head']
    : [
        'arm-r',
        'thigh-r',
        'torso',
        'head',
        'thigh-l',
        'skirt',
        'prop',
        'lectern',
        'arm-l',
      ];
  const seat = extraParts.filter((p) => p.id === `${place.prefix}seat`);
  const parts = [
    ...seat,
    ...figureParts(
      place.prefix,
      placed,
      drawing,
      view,
      place.parent,
      extraParts.filter((p) => !seat.includes(p)),
      order,
    ).map((part) =>
      part.id === `${place.prefix}body`
        ? { ...part, attrs: `filter="url(#${canvas.rim(depth)})"` }
        : part,
    ),
  ];
  // The shadow on the ground, as wide as the feet are apart.
  const xs = [
    placed['heel-l'],
    placed['toe-l'],
    placed['heel-r'],
    placed['toe-r'],
  ].map((p) => p[0]);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const rx =
    Math.max(0.14 * H, (hi - lo) / 2 + 0.07 * H) * (posing.seat ? 1.4 : 1);
  const middle = (lo + hi) / 2;
  const shadow = groundShadow(
    canvas.id(),
    [middle, place.at[1]],
    rx,
    rx * style.shadow.squash,
    style.shadow.colour,
    style.shadow.opacity * (1 - depth * 0.6),
  );
  return {
    parts,
    shadow,
    box: unionBox(boxes),
    joints: placed,
    stands: [middle, place.at[1]],
  };
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** A canvas for one piece: its fills from its colour, ids counted within it, and its rim filters. */
function canvasOf(style: KitStyle, colour: string, H = 172): Canvas {
  let k = 0;
  const rims = new Map<number, string>();
  let defs = '';
  return {
    style,
    fills: fillsOf(style, colour),
    id: () => `k${(k += 1)}`,
    rim(depth) {
      const key = Math.round(depth * 20) / 20;
      const known = rims.get(key);
      if (known) return known;
      const id = `rim${rims.size + 1}`;
      rims.set(key, id);
      defs += rimFilter(
        id,
        awayFrom(style.rim.angle, style.rim.width * H * (1 - key * 0.5)),
        style.rim.colour,
        style.rim.strength * (1 - key * 0.6),
      );
      return id;
    },
    defs: () => defs,
  };
}

const eraParam = (params: KitParams): EraId =>
  (ERA_IDS as readonly string[]).includes(String(params.era))
    ? (params.era as EraId)
    : 'today';
const whoParam = (params: KitParams): WhoSaid =>
  (WHO_VALUES as readonly string[]).includes(String(params.who))
    ? (params.who as WhoSaid)
    : 'mixed';
const dressParam = (params: KitParams): DressKind =>
  (DRESS_VALUES as readonly string[]).includes(String(params.dress))
    ? (params.dress as DressKind)
    : 'everyday';
const facingParam = (params: KitParams): 1 | -1 | 0 =>
  params.facing === 'left' ? -1 : params.facing === 'camera' ? 0 : 1;
/** A piece's colour: the side or role code gave it (never the board), else the ink. */
const colourParam = (style: KitStyle, params: KitParams): string =>
  colourOf(
    style,
    typeof params.colour === 'string' ? params.colour : undefined,
  );

/** A piece's box round what it draws: its feet on the bottom edge, a margin round the rest. */
function pieceBox(drawn: ShotBox, margin: number): ShotBox {
  const [x, y, w, h] = drawn;
  const top = y - margin;
  const bottom = Math.max(0, y + h);
  return [x - margin, top, w + 2 * margin, bottom - top].map(
    (v) => Math.round(v * 10) / 10,
  ) as ShotBox;
}

/** A piece put together from its parts and shadows. */
function piece(
  id: string,
  parts: RigPart[],
  shadows: string[],
  drawn: ShotBox,
  margin: number,
  rig: ShotRigDto,
  focal: ShotBox,
  options: { notes?: string[]; defs?: string; canvas?: Canvas } = {},
): KitPiece {
  const built = assemble(parts);
  const box = pieceBox(drawn, margin);
  const defs =
    options.defs || options.canvas?.defs()
      ? `<defs>${options.defs ?? ''}${options.canvas?.defs() ?? ''}</defs>`
      : '';
  return {
    id,
    svg: svgOf(box, `${defs}${shadows.join('')}${built.markup}`),
    parts: built.parts,
    rig,
    focal: focal.map((v) => Math.round(v * 10) / 10) as ShotBox,
    box,
    colours: ['side'],
    ...(options.notes?.length ? { notes: options.notes } : {}),
  };
}

/** The moves every figure can make; sitting and standing where there is a seat. */
const FIGURE_MOVES = [
  'enter',
  'exit',
  'walk',
  'leave',
  'turn',
  'point',
  'wave',
  'raise-hand',
];
const GROUP_MOVES = ['enter', 'exit', 'walk', 'leave', 'turn', 'wave'];

/** One person, as a silhouette. */
function personPiece(
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const r = rand(seed);
  const pose = (POSES as readonly string[]).includes(String(params.pose))
    ? (params.pose as PersonPose)
    : 'standing';
  const wanted = facingParam(params);
  const front = wanted === 0 && FRONT_POSES.has(pose);
  const facing: 1 | -1 | 0 = front ? 0 : wanted === -1 ? -1 : 1;
  const person = personOf(
    r,
    whoParam(params),
    eraParam(params),
    dressParam(params),
  );
  // One walker is drawn mid-stride, its legs apart: it reads as walking in a still.
  const posing = posingOf(
    pose,
    front,
    person.build.height,
    r,
    r.chance(0.5) ? 0 : 0.5,
  );
  const canvas = canvasOf(style, colourParam(style, params));
  const fig = drawFigure(
    person,
    posing,
    front,
    { at: [0, 0], facing, prefix: '', parent: null },
    canvas,
  );
  const states: ShotRigDto['states'] = { rest: {} };
  if (posing.seat) {
    // Standing up from the seat: thighs and shins straight again, the body lifted by a thigh's length.
    const f = facing < 0 ? -1 : 1;
    const thigh = dist(fig.joints['hip-l'], fig.joints['knee-l']);
    states.seated = {};
    states.standing = {
      body: { dy: -thigh * 0.97 },
      'thigh-l': { rotate: 88 * f },
      'shin-l': { rotate: -86 * f },
      'thigh-r': { rotate: 84 * f },
      'shin-r': { rotate: -78 * f },
      'arm-l': { rotate: 16 * f },
      'forearm-l': { rotate: 64 * f },
      'arm-r': { rotate: 14 * f },
      'forearm-r': { rotate: 58 * f },
    };
  }
  return piece(
    `people.person:${pose}`,
    fig.parts,
    [fig.shadow],
    fig.box,
    0.04 * person.build.height,
    {
      states,
      moves: posing.seat ? [...FIGURE_MOVES, 'sit', 'stand'] : FIGURE_MOVES,
      figures: [{ prefix: '', facing }],
    },
    fig.box,
    { canvas },
  );
}

/** Figures drawn into one piece: each in a group of its own (f1, f2…), with its facing. */
function figuresPiece(
  id: string,
  drawn: { k: number; fig: DrawnFigure; facing: 1 | -1 | 0 }[],
  H: number,
  moves: string[],
  idle: boolean,
  canvas: Canvas,
): KitPiece {
  const parts: RigPart[] = [];
  for (const { k, fig } of drawn)
    parts.push(
      {
        id: `f${k}`,
        parent: null,
        markup: '',
        // Where it stands, on its own outline.
        pivot: [
          fig.stands[0],
          Math.min(fig.stands[1], fig.box[1] + fig.box[3]),
        ],
      },
      ...fig.parts,
    );
  const box = unionBox(drawn.map((d) => d.fig.box));
  return piece(
    id,
    parts,
    drawn.map((d) => d.fig.shadow),
    box,
    0.05 * H,
    {
      states: { rest: {} },
      moves,
      figures: drawn
        .map(({ k, facing }) => ({ prefix: `f${k}.`, facing }))
        .sort((a, b) =>
          a.prefix.localeCompare(b.prefix, 'en', { numeric: true }),
        ),
      ...(idle ? { idle: drawn.map(({ k }) => `f${k}`) } : {}),
    },
    box,
    { canvas },
  );
}

/** Two people: facing each other, walking together, or shaking hands. */
function pairPiece(params: KitParams, style: KitStyle, seed: number): KitPiece {
  const r = rand(seed);
  const pose = ['facing', 'walking', 'handshake'].includes(String(params.pose))
    ? String(params.pose)
    : 'facing';
  const era = eraParam(params);
  const who = whoParam(params);
  const dress = dressParam(params);
  const a = personOf(rand(subSeed(seed, 1)), who, era, dress);
  const b = personOf(rand(subSeed(seed, 2)), who, era, dress);
  const canvas = canvasOf(style, colourParam(style, params));
  const H = (a.build.height + b.build.height) / 2;
  if (pose === 'walking') {
    const facing: 1 | -1 = facingParam(params) === -1 ? -1 : 1;
    const phase = r();
    const back = drawFigure(
      b,
      posingOf('walking', false, b.build.height, r, phase + 0.37),
      false,
      {
        at: [-0.2 * H * facing, -0.025 * H],
        facing,
        prefix: 'f2.',
        parent: 'f2',
        depth: 0.12,
      },
      canvas,
    );
    const ahead = drawFigure(
      a,
      posingOf('walking', false, a.build.height, r, phase),
      false,
      { at: [0, 0], facing, prefix: 'f1.', parent: 'f1' },
      canvas,
    );
    return figuresPiece(
      `people.pair:${pose}`,
      [
        { k: 2, fig: back, facing },
        { k: 1, fig: ahead, facing },
      ],
      H,
      GROUP_MOVES,
      false,
      canvas,
    );
  }
  const apart = pose === 'handshake' ? 0.25 * H : 0.33 * H;
  const meet: Pt = [0, -0.56 * H];
  const posingFor = (person: Person, x: number, facing: 1 | -1): Posing => {
    if (pose !== 'handshake')
      return posingOf('standing', false, person.build.height, r, 0);
    // Its near wrist toward the middle, in its own frame (facing right, feet at 0).
    const target: Pt = [
      (meet[0] - x) * facing - 0.035 * person.build.height,
      meet[1],
    ];
    return {
      turns: { 'arm-r': -4, 'forearm-r': 8 },
      reachL: target,
      prop: 'none',
    };
  };
  const left = drawFigure(
    a,
    posingFor(a, -apart, 1),
    false,
    { at: [-apart, 0], facing: 1, prefix: 'f1.', parent: 'f1' },
    canvas,
  );
  const right = drawFigure(
    b,
    posingFor(b, apart, -1),
    false,
    { at: [apart, 0], facing: -1, prefix: 'f2.', parent: 'f2' },
    canvas,
  );
  return figuresPiece(
    `people.pair:${pose}`,
    [
      { k: 1, fig: left, facing: 1 },
      { k: 2, fig: right, facing: -1 },
    ],
    H,
    GROUP_MOVES,
    true,
    canvas,
  );
}

/** A group of three to twelve: varied, never clones; standing, walking or marching in step. */
function groupPiece(
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const r = rand(seed);
  const count = Math.max(
    3,
    Math.min(12, Math.round(Number(params.count) || 5)),
  );
  const pose = ['standing', 'walking', 'marching'].includes(String(params.pose))
    ? String(params.pose)
    : 'standing';
  const era = eraParam(params);
  const who = whoParam(params);
  const dress = dressParam(params);
  const canvas = canvasOf(style, colourParam(style, params));
  const people = Array.from({ length: count }, (_, i) =>
    personOf(rand(subSeed(seed, i + 1)), who, era, dress),
  );
  const H = people.reduce((sum, p) => sum + p.build.height, 0) / count;
  const moving = pose !== 'standing';
  const facing: 1 | -1 = facingParam(params) === -1 ? -1 : 1;
  const rows = count > (moving ? 4 : 5) ? 2 : 1;
  const front = Math.ceil(count / rows);
  const step = moving ? (pose === 'marching' ? 0.44 : 0.4) * H : 0.31 * H;
  // Each figure's spot: rows of their own, the back row raised and set between the front row's.
  const spots = people.map((_, i) => {
    const row = rows === 2 && i >= front ? 1 : 0;
    const k = row ? i - front : i;
    const n = row ? count - front : front;
    const x =
      (k - (n - 1) / 2) * step +
      (row ? step / 2 : 0) +
      (pose === 'marching' ? 0 : r.between(-0.07, 0.07) * H);
    return { row, x, y: row ? -0.045 * H : -r.between(0, 0.012) * H };
  });
  const order = people
    .map((_, i) => i)
    .sort((a, b) => spots[b].row - spots[a].row || spots[a].x - spots[b].x);
  const phase = r();
  const drawn = order.map((i) => {
    const person = people[i];
    const spot = spots[i];
    const faces: 1 | -1 | 0 = moving
      ? facing
      : r.chance(0.7)
        ? 0
        : spot.x < 0
          ? 1
          : -1;
    const posing = moving
      ? posingOf(
          'walking',
          false,
          person.build.height,
          r,
          pose === 'marching'
            ? phase + (spot.row ? 0.5 : 0)
            : phase + r.between(0.15, 0.85),
        )
      : posingOf('standing', faces === 0, person.build.height, r, 0);
    const fig = drawFigure(
      person,
      posing,
      faces === 0,
      {
        at: [spot.x, spot.y],
        facing: faces,
        prefix: `f${i + 1}.`,
        parent: `f${i + 1}`,
        depth: spot.row * 0.14,
      },
      canvas,
    );
    return { k: i + 1, fig, facing: faces };
  });
  return figuresPiece(
    `people.group:${pose}:${count}`,
    drawn,
    H,
    GROUP_MOVES,
    !moving,
    canvas,
  );
}

// ── Crowds ────────────────────────────────────────────────────────────────

/** The most figures a crowd draws: past this, each stands for a round number of people. */
export const CROWD_MOST = 400;
/** The fewest people a crowd is: fewer is a group. */
export const CROWD_LEAST = 13;
/** How many a crowd draws when no number was given: a crowd, claiming none. */
const UNCOUNTED = 90;
const ROUND = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000,
  20000, 25000, 50000, 100000,
];

/** How many people each figure stands for: the smallest round number that keeps a crowd of `count` to CROWD_MOST figures. */
export function perFigure(count: number): number {
  const need = Math.max(1, count) / CROWD_MOST;
  return ROUND.find((n) => n >= need) ?? Math.ceil(need);
}

/** How many figures a crowd of `count` people draws. */
export const figuresFor = (count: number): number =>
  Math.max(1, Math.round(Math.max(1, count) / perFigure(count)));

/** How far the crowd's rows go back: each row smaller by this share per row, and how much higher it stands, in heights. */
const ROW_SHRINK = 0.17;
const ROW_RISE = 0.3;
/** How far apart two people stand in a row, in units. */
const SPACING = 50;

/**
 * A crowd's rows for `total` figures: each row smaller, higher and fuller
 * across than the one before, as many rows as bring the crowd nearest
 * the shape the frame wants (about 3 wide to 1 high; deeper when tall).
 */
export function crowdRows(
  total: number,
  tall: boolean,
  H = 172,
): {
  width: number;
  rows: { k: number; scale: number; y: number; n: number }[];
} {
  const want = tall ? 1.3 : 3.2;
  let best: {
    width: number;
    rows: { k: number; scale: number; y: number; n: number }[];
  } | null = null;
  let bestErr = Infinity;
  for (let K = 1; K <= 40; K += 1) {
    const scales = Array.from(
      { length: K },
      (_, k) => 1 / (1 + ROW_SHRINK * k),
    );
    const across = scales.reduce((sum, s) => sum + 1 / (SPACING * s), 0);
    const width = total / across;
    let y = 0;
    const ys = scales.map((s, k) => {
      if (k > 0) y -= ROW_RISE * H * scales[k - 1];
      return y;
    });
    const height = -ys[K - 1] + H * scales[K - 1];
    const err = Math.abs(Math.log(width / height / want));
    if (err < bestErr) {
      bestErr = err;
      // Whole people per row, the last taking what is left.
      let left = total;
      const rows = scales.map((scale, k) => {
        const n =
          k === K - 1
            ? left
            : Math.min(
                left,
                Math.max(1, Math.round(width / (SPACING * scale))),
              );
        left -= n;
        return { k, scale, y: ys[k], n };
      });
      best = { width, rows: rows.filter((row) => row.n > 0) };
    }
  }
  return best!;
}

/** A crowd person as one outline facing the camera, its feet at its spot: body, head, legs, arms; a raised arm or a sign. */
function crowdPerson(
  person: Person,
  at: Pt,
  H: number,
  raise: 'none' | 'arm' | 'sign',
): Shape {
  const sized: Person = { ...person, build: { ...person.build, height: H } };
  const rest = standingJoints(sized.build, 'front');
  const s = person.bulk;
  const moved = (p: Pt): Pt => [p[0] + at[0], p[1] + at[1]];
  const P = (x: number, y: number): Pt => [at[0] + x * H, at[1] - y * H];
  const shapes: Shape[] = [
    mapShape(torsoFront(sized, rest), moved),
    mapShape(headShape(sized, rest, true), moved),
  ];
  const skirt = skirtShape(sized, rest, true);
  if (skirt) shapes.push(mapShape(skirt, moved));
  const shoulderX = 0.105 * (person.build.shoulders / 0.25);
  for (const side of [1, -1]) {
    shapes.push(
      capsule(
        P(0.055 * side, 0.52),
        0.05 * s * H,
        P(0.05 * side, 0.27),
        0.031 * H,
      ),
      capsule(P(0.05 * side, 0.27), 0.03 * H, P(0.052 * side, 0.03), 0.022 * H),
    );
    if (raise !== 'none' && side === 1) {
      // An arm up: bent a little at the elbow, a round hand at its top.
      const shoulder = P(shoulderX, 0.79);
      const elbow = raise === 'sign' ? P(0.13, 0.9) : P(0.2, 0.93);
      const hand = raise === 'sign' ? P(0.06, 1.0) : P(0.2, 1.08);
      shapes.push(
        capsule(shoulder, 0.034 * H, elbow, 0.026 * H),
        capsule(elbow, 0.025 * H, hand, 0.02 * H),
        circle(hand, 0.03 * H),
      );
      if (raise === 'sign')
        shapes.push(
          capsule(P(0.06, 0.92), 0.008 * H, P(0.06, 1.28), 0.008 * H),
          rect(
            at[0] - 0.12 * H,
            at[1] - 1.42 * H,
            0.36 * H,
            0.22 * H,
            0.01 * H,
          ),
        );
    } else {
      shapes.push(
        capsule(
          P(shoulderX * side, 0.8),
          0.03 * s * H,
          P(0.118 * side, 0.43),
          0.018 * H,
        ),
      );
    }
  }
  return join(...shapes);
}

/**
 * A far person, one of the few shapes a crowd's far rows use: what a
 * crowd shows of them, a head and round shoulders over a body that
 * narrows to the feet, with their hair and the hat of their era.
 */
function farShape(person: Person, H: number): Shape {
  const s = person.bulk;
  const sh = (person.who === 'woman' ? 0.112 : 0.126) * H * s;
  const hs = (H / person.build.heads) * 1.06;
  const crown: Pt = [0, -H];
  const P = (x: number, y: number): Pt => [
    crown[0] + x * hs,
    crown[1] + y * hs,
  ];
  const shapes: Shape[] = [
    blob(
      [
        [-0.07 * H * s, 0],
        [-0.08 * H * s, -0.42 * H],
        [-0.092 * H * s, -0.6 * H],
        [-sh, -0.735 * H],
        [-sh * 0.8, -0.795 * H],
        [-0.04 * H, -0.82 * H],
        [0.04 * H, -0.82 * H],
        [sh * 0.8, -0.795 * H],
        [sh, -0.735 * H],
        [0.092 * H * s, -0.6 * H],
        [0.08 * H * s, -0.42 * H],
        [0.07 * H * s, 0],
      ],
      0.7,
    ),
    ellipse(P(0, 0.5), 0.39 * hs, 0.5 * hs),
  ];
  if (person.hair === 'long')
    shapes.push(
      blob([
        P(0, -0.04),
        P(0.46, 0.12),
        P(0.5, 0.9),
        P(0.3, 1.2),
        P(-0.3, 1.2),
        P(-0.5, 0.9),
        P(-0.46, 0.12),
      ]),
    );
  if (person.hair === 'bun') shapes.push(circle(P(0, -0.06), 0.18 * hs));
  const hat = hatShape(person.hat, true, P, hs);
  if (hat) shapes.push(hat);
  return join(...shapes);
}

/**
 * A crowd: honestly counted, in rows going back. The near rows are
 * pieces (each person a part that shifts a little on its own); the far
 * rows are a few shapes used again, each row a part, fading toward the
 * paper. A tall frame gets a deeper, narrower crowd.
 */
function crowdPiece(
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const r = rand(seed);
  // A crowd no number was given for is not counted: it draws a crowd, and claims no number.
  const said = Math.round(Number(params.count) || 0);
  const counted = said >= CROWD_LEAST;
  const count = counted ? said : UNCOUNTED;
  const per = perFigure(count);
  const total = figuresFor(count);
  const era = eraParam(params);
  const who = whoParam(params);
  const dress = dressParam(params);
  const pose = ['standing', 'cheering', 'protest'].includes(String(params.pose))
    ? String(params.pose)
    : 'standing';
  const canvas = canvasOf(style, colourParam(style, params));
  const H = 172;
  const { width, rows } = crowdRows(total, style.shape === 'tall', H);
  const nearRows = Math.min(rows.length, total > 150 ? 1 : total > 40 ? 2 : 3);
  const shadows: string[] = [];
  const parts: RigPart[] = [];
  const idle: string[] = [];
  const boxes: ShotBox[] = [];
  // The far rows' shapes, drawn once: the crowd's own few people, dressed as the near ones are.
  const shapes = Array.from({ length: 6 }, (_, i) =>
    farShape(personOf(rand(subSeed(seed, 900 + i)), who, era, dress), H),
  );
  const defs = shapes
    .map(
      (shape, i) =>
        `<symbol id="far-${i}" overflow="visible"><path d="${shape.d}"/></symbol>`,
    )
    .join('');
  let drawn = 0;
  // Back to front, the near rows over the far.
  for (const row of [...rows].reverse()) {
    const depth = rows.length > 1 ? row.k / (rows.length - 1) : 0;
    const rowH = H * row.scale;
    const step = width / row.n;
    if (row.k >= nearRows) {
      const fill = hazed(
        style,
        canvas.fills.body,
        Math.min(1, 0.2 + depth * 0.8),
      );
      const own: ShotBox[] = [];
      let uses = '';
      for (let i = 0; i < row.n; i += 1) {
        const x = -width / 2 + step * (i + 0.5) + r.between(-0.38, 0.38) * step;
        const y = row.y + r.between(-0.09, 0.09) * rowH;
        const sc = row.scale * r.between(0.88, 1.1);
        uses += `<use href="#far-${Math.floor(r() * shapes.length)}" transform="translate(${n1(x)} ${n1(y)}) scale(${Math.round(sc * 1000) / 1000})"/>`;
        own.push([
          x - 0.15 * H * sc,
          y - 1.02 * H * sc,
          0.3 * H * sc,
          1.02 * H * sc,
        ]);
      }
      const box = unionBox(own);
      boxes.push(box);
      drawn += row.n;
      const id = `row-${row.k}`;
      // A thin cut of the air round each far person (its stroke under its
      // fill, so only the outer edge shows), so a head reads against the row behind it.
      parts.push({
        id,
        parent: null,
        markup: `<g fill="${fill}" stroke="${style.air}" stroke-width="${n1(0.032 * H)}" stroke-linejoin="round" paint-order="stroke">${uses}</g>`,
        box,
        pivot: [box[0] + box[2] / 2, box[1] + box[3]],
      });
      idle.push(id);
      continue;
    }
    for (let i = 0; i < row.n; i += 1) {
      const person = personOf(
        rand(subSeed(seed, row.k * 1000 + i)),
        who,
        era,
        dress,
      );
      const x = -width / 2 + step * (i + 0.5) + r.between(-0.32, 0.32) * step;
      const y = row.y - r.between(0, row.k === 0 ? 0.015 : 0.08) * rowH;
      const h = rowH * (person.build.height / 172);
      const raise =
        pose === 'cheering' && r.chance(0.35)
          ? 'arm'
          : pose === 'protest' && r.chance(0.22)
            ? 'sign'
            : 'none';
      const shape = crowdPerson(person, [x, y], h, raise);
      const fill =
        depth > 0
          ? hazed(style, canvas.fills.body, depth * 0.5)
          : canvas.fills.body;
      const id = `p-${row.k}-${i + 1}`;
      parts.push({
        id,
        parent: null,
        markup: litShape(canvas.id(), shape, {
          fill,
          rim: mixOk(fill, style.rim.colour, style.rim.strength),
          away: awayFrom(style.rim.angle, style.rim.width * h),
        }),
        box: shape.box,
        pivot: [x, Math.min(y, shape.box[1] + shape.box[3])],
      });
      if (row.k === 0)
        shadows.push(
          groundShadow(
            canvas.id(),
            [x, y],
            0.15 * h,
            0.15 * h * style.shadow.squash,
            style.shadow.colour,
            style.shadow.opacity,
          ),
        );
      boxes.push(shape.box);
      idle.push(id);
      drawn += 1;
    }
  }
  const box = unionBox(boxes);
  const near = parts.filter((p) => p.id.startsWith('p-')).map((p) => p.box!);
  const notes = !counted
    ? [`${drawn} figures: a crowd, no number given, none claimed`]
    : per > 1
      ? [`${drawn} figures for ${count} people: 1 figure = ${per} people`]
      : [`${drawn} figures, one for each of ${count} people`];
  return piece(
    `people.crowd:${pose}:${counted ? count : 'uncounted'}`,
    parts,
    shadows,
    box,
    0.04 * H,
    { states: { rest: {} }, moves: ['enter', 'exit', 'cheer'], idle },
    near.length ? unionBox(near) : box,
    { notes, defs },
  );
}

// ── The registry's entries ────────────────────────────────────────────────

const ERA_PARAM = {
  values: ERA_IDS,
  default: 'today',
  about: 'when, from the list’s dates',
} as const;
const WHO_PARAM = {
  values: WHO_VALUES,
  default: 'mixed',
  about: 'only as the research says',
} as const;
const DRESS_PARAM = {
  values: DRESS_VALUES,
  default: 'everyday',
  about: 'uniform only for a uniformed group the research names',
} as const;

export const PEOPLE_KIT: Readonly<Record<string, KitEntry>> = {
  'people.person': {
    family: 'people',
    looks: ['editorial'],
    about:
      'one unnamed person as a silhouette, for a role the line speaks of (a worker, a voter); never a named person.',
    params: {
      pose: { values: POSES, default: 'standing', about: 'what they do' },
      facing: {
        values: ['right', 'left', 'camera'],
        default: 'right',
        about: 'camera only standing, raising a hand or holding a sign',
      },
      era: ERA_PARAM,
      who: WHO_PARAM,
      dress: DRESS_PARAM,
    },
    moves: [...FIGURE_MOVES, 'sit', 'stand'],
    people: true,
    make: personPiece,
  },
  'people.pair': {
    family: 'people',
    looks: ['editorial'],
    about:
      'two unnamed people: facing each other, walking together, or shaking hands on an agreement.',
    params: {
      pose: {
        values: ['facing', 'walking', 'handshake'],
        default: 'facing',
        about: 'what they do',
      },
      era: ERA_PARAM,
      who: WHO_PARAM,
      dress: DRESS_PARAM,
    },
    moves: GROUP_MOVES,
    people: true,
    make: pairPiece,
  },
  'people.group': {
    family: 'people',
    looks: ['editorial'],
    about:
      'a group of 3 to 12 people in their side’s colour: standing, walking, or marching in step.',
    params: {
      pose: {
        values: ['standing', 'walking', 'marching'],
        default: 'standing',
        about: 'what they do',
      },
      count: {
        range: [3, 12],
        default: 5,
        about: 'only a number the list or the line gives',
      },
      era: ERA_PARAM,
      who: WHO_PARAM,
      dress: DRESS_PARAM,
    },
    moves: GROUP_MOVES,
    people: true,
    counts: true,
    make: groupPiece,
  },
  'people.crowd': {
    family: 'people',
    looks: ['editorial'],
    about:
      'a crowd of dozens to millions in their side’s colour, counted honestly (a figure each, or each for a round number when there are too many).',
    params: {
      pose: {
        values: ['standing', 'cheering', 'protest'],
        default: 'standing',
        about: 'what they do',
      },
      count: {
        range: [0, 10_000_000],
        default: 0,
        about: 'only a number the list or the line gives; 0 when none is',
      },
      era: ERA_PARAM,
      who: WHO_PARAM,
      dress: DRESS_PARAM,
    },
    moves: ['enter', 'exit', 'cheer'],
    people: true,
    counts: true,
    make: crowdPiece,
  },
};
