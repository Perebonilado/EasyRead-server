/**
 * The animal kit's bodies (scene-animal): each species drawn over one of
 * six plans, facing right, in the kit's units, its feet on the ground at
 * y = 0. A plan draws each pose it has (standing, sitting, lying down,
 * curled up) as its own group of legs, tail, neck and body, and the head
 * once, to be moved to where each pose carries it: so the head, with its
 * faces and mouths, is drawn one time and every pose shares it.
 *
 * Every part that moves is drawn in a group of its own about its joint,
 * with the artist rig's classes: rig-leg-a and rig-leg-b (the legs that
 * step together), rig-tail, rig-ear, rig-flap (a wing), rig-head (the neck
 * and head, about the neck), rig-breathe (all that rises as it breathes).
 * The pivots are written here, exactly: nothing is measured.
 */
import {
  ANIMAL_PAINT,
  SPECIES,
  animalTall,
  featuresOf,
  type AnimalEars,
  type AnimalPattern,
  type AnimalSpec,
  type AnimalSpecies,
  type BodyPlan,
} from './scene-animal';
import { CLOTH, KIT_EXTRAS, flat, inked, line, shade } from './scene-ink';
import { FIGURE_INK } from './scene-ink';
import {
  add,
  blob,
  circle,
  curve,
  ellipse,
  ellipsePoints,
  lerp,
  limb,
  limbFill,
  limbInk,
  mul,
  blobSamples,
  reachOf,
  path,
  pivoted,
  placed,
  polar,
  poly,
  pt,
  sub,
  tapered,
  turn,
  type P,
} from './scene-animal-shapes';

export const ANIMAL_POSES = ['stand', 'sit', 'lie', 'curl'] as const;
export type AnimalPose = (typeof ANIMAL_POSES)[number];

/** How it goes when it goes somewhere: steps, waddles, hops, swims or slithers; a creature may float. */
export type Gait = 'walk' | 'waddle' | 'hop' | 'swim' | 'slither' | 'float';

/** How its mouth is drawn: the kit's on a muzzle, a beak that opens, a fish's lips. */
export type MouthKind = 'muzzle' | 'beak' | 'fish';

/** A beak: where it is hinged, how long and deep each half is, and its shape. */
export interface Beak {
  hinge: P;
  /** How long it reaches forward from the hinge, and how deep each half is at the hinge. */
  len: number;
  upper: number;
  lower: number;
  /** Which way it points, degrees below the horizontal. */
  down: number;
  kind: 'pointed' | 'flat' | 'hooked' | 'small';
  colour: string;
}

/** What a plan draws: each pose's body, and the head that every pose shares. */
export interface Built {
  plan: BodyPlan;
  /** Each pose's legs, tail, neck and body, and what is worn on them. Standing always. */
  poses: Partial<Record<AnimalPose, string>>;
  /** Where each pose carries the head (and the neck with it) from where it stands: moved, and turned about the neck. */
  headAt: Partial<Record<AnimalPose, { by: P; turn: number }>>;
  /** The head: behind its shape (a far ear, a mane), its shape and muzzle, and before it (a near ear, a hat). */
  head: string;
  /** What is drawn over its eyes, on its head: a creature's glasses. */
  over?: string;
  /** Where the head turns about; null when it keeps still (a fish's). */
  neck: P | null;
  /** How far the head dips either way, in degrees. */
  dip: number;
  /**
   * The kit's face on it: its middle, its scale, the colour of the face
   * round the eyes, and the eyes' outline; how many eyes (two, unless a
   * creature has one or three).
   */
  face: {
    at: P;
    s: number;
    skin: string;
    eyeLine: number;
    dx: number;
    count?: 1 | 2 | 3;
  };
  /** Its mouth: where, how large, and how drawn. */
  mouth: { at: P; s: number; kind: MouthKind; wide: number; beak?: Beak };
  /** How far it reaches each way as it stands, and its top: its frame. */
  bounds: { left: number; right: number; top: number };
  anchors: { head: P; body: P; legs: P };
  /** Each leg's hip and foot as it stands, and which of the two that step together it is in. */
  legs: { hip: P; foot: P; step: 'a' | 'b' }[];
  tail: P | null;
  ears: P[];
  /** Its arms' shoulders (a climber): each turns as the kit's people's do. */
  arms: P[];
  /** Its wings' shoulders (a bird). */
  wings: P[];
  gait: Gait;
  /** How far its head drops lying down, in its units: the stage lowers what it carries by as much. */
  sink: number;
}

/** An animal's colours and what it has, as drawn. */
export interface Look {
  spec: AnimalSpec;
  coat: string;
  /** The second colour, or the coat's own a shade lighter when it has none. */
  second: string;
  pattern: AnimalPattern;
  ears: AnimalEars | null;
  tail: ReturnType<typeof featuresOf>['tail'];
  mane: ReturnType<typeof featuresOf>['mane'];
  horns: ReturnType<typeof featuresOf>['horns'];
  /** Its far legs, a shade darker: behind the near ones. */
  far: string;
  /** Its nose and hooves. */
  dark: string;
  /** Inside its ears. */
  inner: string;
  /** Its mane and a horse's tail. */
  hair: string;
  /** Its muzzle: the second colour on a belly-marked one, else the coat a shade lighter. */
  muzzle: string;
  /** What it wears. */
  wear: string;
  /** Unique to this drawing: its clip paths' ids. */
  id: string;
}

export const LINE = 2.6;
const BONE = '#f1e2c4';
const HOOF = '#4a3f45';
const NOSE = '#3a3740';
const PINK = '#f1b3ae';
const GOLD = KIT_EXTRAS.gold;

/** How light a colour is, 0 to 1. */
function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  );
}

/** An animal's colours and features, resolved from its spec. */
export function lookOf(spec: AnimalSpec, id: string): Look {
  const own = featuresOf(spec);
  const coat = ANIMAL_PAINT[spec.coat];
  const second = spec.second ? ANIMAL_PAINT[spec.second] : shade(coat, 1.25);
  const light = lightness(coat);
  return {
    spec,
    coat,
    second,
    pattern: spec.second ? spec.pattern : 'plain',
    ears: own.ears,
    tail: own.tail,
    mane: own.mane,
    horns: own.horns,
    far: shade(coat, light > 0.8 ? 0.86 : 0.8),
    dark: NOSE,
    inner: light > 0.75 || spec.coat === 'pink' ? PINK : shade(coat, 1.35),
    hair:
      spec.species === 'zebra'
        ? NOSE
        : spec.species === 'lion'
          ? shade(coat, 0.72)
          : shade(coat, light < 0.3 ? 1.5 : light > 0.8 ? 0.84 : 0.55),
    muzzle:
      spec.second && spec.pattern === 'belly'
        ? ANIMAL_PAINT[spec.second]
        : shade(coat, light > 0.8 ? 0.94 : 1.22),
    wear: spec.wearColour ? CLOTH[spec.wearColour] : CLOTH.red,
    id,
  };
}

// ── Four legs ──────────────────────────────────────────────────────────────

type Muzzle = 'snout' | 'short' | 'pig' | 'long' | 'trunk' | 'croc' | 'beaky';
type Foot = 'paw' | 'hoof' | 'pad' | 'claw';
type Build = 'lean' | 'barrel' | 'round' | 'wool' | 'shell' | 'low';

/** A four-legged species' shape at its middle size, in the kit's units. */
interface QuadShape {
  /** From the body's underside to the ground. */
  leg: number;
  len: number;
  depth: number;
  build: Build;
  /** How much higher its withers are than its rump. */
  slope?: number;
  legW: number;
  footW: number;
  foot: Foot;
  /** How far the hind leg's hock bends back. */
  hock: number;
  neck: { len: number; angle: number; w: number };
  /** The head's half-height; its length to height; how far its long axis points down, degrees. */
  head: { r: number; long: number; angle: number; snout?: number };
  muzzle: { kind: Muzzle; len: number; w: number };
  /** The face: the kit's eyes at this scale, where on the head (shares of r), and how far apart. */
  eye: number;
  eyeAt: P;
  eyeDx?: number;
  ear: number;
  tail: number;
  tailW: number;
  /** Legs out to the sides and low: a lizard, a crocodile. */
  sprawl?: boolean;
  dip: number;
}

const Q = (shape: QuadShape) => shape;

/** Each four-legged species, and the long ones with legs (a lizard, a crocodile, a turtle). */
const QUADS: Partial<Record<AnimalSpecies, QuadShape>> = {
  dog: Q({
    leg: 25,
    len: 56,
    depth: 28,
    build: 'lean',
    legW: 10,
    footW: 8.5,
    foot: 'paw',
    hock: 4,
    neck: { len: 10, angle: 68, w: 17 },
    head: { r: 18, long: 1.05, angle: 0 },
    muzzle: { kind: 'snout', len: 17, w: 13 },
    eye: 0.42,
    eyeAt: [0.1, -0.14],
    ear: 1,
    tail: 22,
    tailW: 5.5,
    dip: 30,
  }),
  cat: Q({
    leg: 15,
    len: 38,
    depth: 17,
    build: 'lean',
    legW: 6.5,
    footW: 5.5,
    foot: 'paw',
    hock: 3,
    neck: { len: 5, angle: 70, w: 11 },
    head: { r: 13, long: 1.08, angle: 0 },
    muzzle: { kind: 'short', len: 5, w: 8 },
    eye: 0.32,
    eyeAt: [0.08, -0.1],
    ear: 1,
    tail: 22,
    tailW: 4,
    dip: 30,
  }),
  horse: Q({
    leg: 78,
    len: 122,
    depth: 52,
    build: 'barrel',
    slope: 2,
    legW: 17,
    footW: 11,
    foot: 'hoof',
    hock: 7,
    neck: { len: 52, angle: 58, w: 38 },
    head: { r: 17, long: 2.5, angle: 42, snout: 0.6 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.38,
    eyeAt: [0.05, -0.34],
    eyeDx: 12.5,
    ear: 1,
    tail: 60,
    tailW: 7,
    dip: 45,
  }),
  donkey: Q({
    leg: 52,
    len: 92,
    depth: 44,
    build: 'barrel',
    legW: 14,
    footW: 10,
    foot: 'hoof',
    hock: 6,
    neck: { len: 34, angle: 52, w: 28 },
    head: { r: 16, long: 2.3, angle: 38, snout: 0.62 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.36,
    eyeAt: [0.05, -0.34],
    eyeDx: 12.5,
    ear: 1.1,
    tail: 44,
    tailW: 5,
    dip: 40,
  }),
  cow: Q({
    leg: 48,
    len: 118,
    depth: 58,
    build: 'barrel',
    legW: 16,
    footW: 12,
    foot: 'hoof',
    hock: 5,
    neck: { len: 18, angle: 38, w: 36 },
    head: { r: 19, long: 1.95, angle: 30, snout: 0.78 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.44,
    eyeAt: [0.08, -0.3],
    eyeDx: 12.5,
    ear: 1,
    tail: 48,
    tailW: 4.5,
    dip: 35,
  }),
  goat: Q({
    leg: 32,
    len: 62,
    depth: 30,
    build: 'lean',
    legW: 10,
    footW: 7.5,
    foot: 'hoof',
    hock: 4,
    neck: { len: 18, angle: 62, w: 16 },
    head: { r: 12.5, long: 2.2, angle: 36, snout: 0.5 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.32,
    eyeAt: [0.05, -0.32],
    eyeDx: 12.5,
    ear: 0.9,
    tail: 10,
    tailW: 5,
    dip: 35,
  }),
  sheep: Q({
    leg: 26,
    len: 64,
    depth: 40,
    build: 'wool',
    legW: 8,
    footW: 7,
    foot: 'hoof',
    hock: 2,
    neck: { len: 12, angle: 45, w: 18 },
    head: { r: 13, long: 1.9, angle: 26, snout: 0.58 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.36,
    eyeAt: [0.1, -0.3],
    eyeDx: 12.5,
    ear: 0.9,
    tail: 9,
    tailW: 6,
    dip: 30,
  }),
  pig: Q({
    leg: 16,
    len: 70,
    depth: 40,
    build: 'barrel',
    legW: 10,
    footW: 8,
    foot: 'hoof',
    hock: 2,
    neck: { len: 4, angle: 30, w: 30 },
    head: { r: 19, long: 1.15, angle: 5 },
    muzzle: { kind: 'pig', len: 7, w: 14 },
    eye: 0.45,
    eyeAt: [0.05, -0.2],
    ear: 1,
    tail: 16,
    tailW: 2.8,
    dip: 25,
  }),
  lion: Q({
    leg: 40,
    len: 90,
    depth: 40,
    build: 'lean',
    legW: 15,
    footW: 13,
    foot: 'paw',
    hock: 5,
    neck: { len: 14, angle: 62, w: 28 },
    head: { r: 24, long: 1.02, angle: 0 },
    muzzle: { kind: 'short', len: 8, w: 15 },
    eye: 0.52,
    eyeAt: [0.08, -0.12],
    ear: 0.8,
    tail: 50,
    tailW: 4.5,
    dip: 30,
  }),
  tiger: Q({
    leg: 38,
    len: 94,
    depth: 38,
    build: 'lean',
    legW: 15,
    footW: 13,
    foot: 'paw',
    hock: 5,
    neck: { len: 14, angle: 62, w: 26 },
    head: { r: 22, long: 1.05, angle: 0 },
    muzzle: { kind: 'short', len: 8, w: 14 },
    eye: 0.5,
    eyeAt: [0.08, -0.12],
    ear: 0.85,
    tail: 52,
    tailW: 6,
    dip: 30,
  }),
  bear: Q({
    leg: 36,
    len: 96,
    depth: 58,
    build: 'round',
    legW: 20,
    footW: 18,
    foot: 'paw',
    hock: 2,
    neck: { len: 12, angle: 45, w: 34 },
    head: { r: 25, long: 1.05, angle: 6 },
    muzzle: { kind: 'snout', len: 20, w: 18 },
    eye: 0.5,
    eyeAt: [0.02, -0.18],
    ear: 0.9,
    tail: 8,
    tailW: 8,
    dip: 30,
  }),
  elephant: Q({
    leg: 84,
    len: 170,
    depth: 108,
    build: 'round',
    legW: 34,
    footW: 32,
    foot: 'pad',
    hock: 0,
    neck: { len: 12, angle: 30, w: 70 },
    head: { r: 50, long: 1.1, angle: 12 },
    muzzle: { kind: 'trunk', len: 90, w: 22 },
    eye: 0.72,
    eyeAt: [-0.1, -0.22],
    ear: 1,
    tail: 44,
    tailW: 5,
    dip: 22,
  }),
  giraffe: Q({
    leg: 132,
    len: 100,
    depth: 58,
    build: 'lean',
    slope: 18,
    legW: 14,
    footW: 10,
    foot: 'hoof',
    hock: 6,
    neck: { len: 128, angle: 72, w: 30 },
    head: { r: 14, long: 2.3, angle: 28, snout: 0.55 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.36,
    eyeAt: [0.05, -0.34],
    eyeDx: 12.5,
    ear: 0.9,
    tail: 56,
    tailW: 4,
    dip: 32,
  }),
  zebra: Q({
    leg: 64,
    len: 110,
    depth: 50,
    build: 'barrel',
    legW: 16,
    footW: 10.5,
    foot: 'hoof',
    hock: 7,
    neck: { len: 46, angle: 56, w: 32 },
    head: { r: 16, long: 2.4, angle: 42, snout: 0.58 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.38,
    eyeAt: [0.05, -0.34],
    eyeDx: 12.5,
    ear: 1,
    tail: 52,
    tailW: 5,
    dip: 40,
  }),
  fox: Q({
    leg: 16,
    len: 42,
    depth: 19,
    build: 'lean',
    legW: 6.5,
    footW: 5.5,
    foot: 'paw',
    hock: 3,
    neck: { len: 7, angle: 64, w: 12 },
    head: { r: 12.5, long: 1.05, angle: 0 },
    muzzle: { kind: 'snout', len: 15, w: 9 },
    eye: 0.32,
    eyeAt: [0.08, -0.12],
    ear: 1.15,
    tail: 34,
    tailW: 11,
    dip: 30,
  }),
  wolf: Q({
    leg: 30,
    len: 64,
    depth: 30,
    build: 'lean',
    legW: 10.5,
    footW: 9,
    foot: 'paw',
    hock: 4,
    neck: { len: 12, angle: 64, w: 19 },
    head: { r: 17, long: 1.05, angle: 0 },
    muzzle: { kind: 'snout', len: 21, w: 12 },
    eye: 0.4,
    eyeAt: [0.08, -0.14],
    ear: 1.1,
    tail: 40,
    tailW: 14,
    dip: 30,
  }),
  deer: Q({
    leg: 74,
    len: 88,
    depth: 40,
    build: 'lean',
    legW: 11,
    footW: 7,
    foot: 'hoof',
    hock: 6,
    neck: { len: 38, angle: 64, w: 20 },
    head: { r: 13.5, long: 2.2, angle: 34, snout: 0.48 },
    muzzle: { kind: 'long', len: 0, w: 0 },
    eye: 0.36,
    eyeAt: [0.05, -0.32],
    eyeDx: 12.5,
    ear: 1.05,
    tail: 12,
    tailW: 6,
    dip: 38,
  }),
  mouse: Q({
    leg: 6.5,
    len: 26,
    depth: 16,
    build: 'round',
    legW: 3.6,
    footW: 3.4,
    foot: 'paw',
    hock: 1,
    neck: { len: 2, angle: 40, w: 10 },
    head: { r: 11.5, long: 1.1, angle: 8 },
    muzzle: { kind: 'snout', len: 9, w: 7 },
    eye: 0.25,
    eyeAt: [0.02, -0.12],
    // Apart, not run together into a mask on its small head.
    eyeDx: 20,
    ear: 1.2,
    tail: 26,
    tailW: 1.4,
    dip: 20,
  }),
  lizard: Q({
    leg: 4,
    len: 30,
    depth: 11,
    build: 'low',
    legW: 3.4,
    footW: 3,
    foot: 'claw',
    hock: 0,
    neck: { len: 4, angle: 25, w: 8 },
    head: { r: 7.5, long: 1.45, angle: 10 },
    muzzle: { kind: 'croc', len: 0, w: 0 },
    eye: 0.22,
    eyeAt: [-0.1, -0.35],
    eyeDx: 14,
    ear: 0,
    tail: 28,
    tailW: 6,
    sprawl: true,
    dip: 18,
  }),
  crocodile: Q({
    leg: 10,
    len: 58,
    depth: 26,
    build: 'low',
    legW: 7,
    footW: 6,
    foot: 'claw',
    hock: 0,
    neck: { len: 6, angle: 20, w: 18 },
    head: { r: 11, long: 3.0, angle: 4 },
    muzzle: { kind: 'croc', len: 0, w: 0 },
    eye: 0.34,
    eyeAt: [-0.34, -0.55],
    eyeDx: 14,
    ear: 0,
    tail: 40,
    tailW: 14,
    sprawl: true,
    dip: 14,
  }),
  turtle: Q({
    leg: 5,
    len: 42,
    depth: 22,
    build: 'shell',
    legW: 7,
    footW: 6.5,
    foot: 'pad',
    hock: 0,
    neck: { len: 10, angle: 35, w: 8 },
    head: { r: 8.5, long: 1.3, angle: 6 },
    muzzle: { kind: 'beaky', len: 0, w: 0 },
    eye: 0.27,
    eyeAt: [0.05, -0.2],
    eyeDx: 20,
    ear: 0,
    tail: 6,
    tailW: 4,
    dip: 20,
  }),
};

/** How slim or stout it is: its body's depth, and its legs' width. */
const BUILD_GIRTH = { slim: 0.88, average: 1, stout: 1.14 } as const;

/**
 * How much a head is scaled for an animal scaled by `k`: a small one's
 * head (a puppy's, a duckling's) shrinks less than its body, as a young
 * animal's does, so the kit's eyes and their line still leave its face
 * showing round them; a large one's grows with it.
 */
export const headScale = (k: number): number => (k < 1 ? k ** 0.4 : k);

/** A shape scaled to a size: every length by `k`, the body's depth and the legs' width by its build, the head by `headScale`. */
function sized(shape: QuadShape, k: number, girth: number): QuadShape {
  const kh = headScale(k);
  return {
    ...shape,
    leg: shape.leg * k,
    len: shape.len * k,
    depth: shape.depth * k * girth,
    slope: (shape.slope ?? 0) * k,
    legW: shape.legW * k * Math.sqrt(girth),
    footW: shape.footW * k * Math.sqrt(girth),
    hock: shape.hock * k,
    neck: {
      len: shape.neck.len * k,
      angle: shape.neck.angle,
      w: shape.neck.w * k * Math.sqrt(girth),
    },
    head: { ...shape.head, r: shape.head.r * kh },
    muzzle: {
      ...shape.muzzle,
      len: shape.muzzle.len * kh,
      w: shape.muzzle.w * kh,
    },
    eye: shape.eye * kh,
    tail: shape.tail * k,
    tailW: shape.tailW * k,
  };
}

/** Where a quadruped's parts are as it stands: its body's outline and every joint. */
interface QuadFrame {
  body: P[];
  /** Each leg: its hip, and its joints down to the foot, with which step it takes; near legs first. */
  legs: { near: boolean; front: boolean; joints: P[] }[];
  tail: P;
  neck: [P, P];
  head: P;
}

function quadFrame(s: QuadShape): QuadFrame {
  const { leg: L, len: B, depth: D } = s;
  const slope = s.slope ?? 0;
  const yb = -L;
  const yt = -(L + D);
  // The outline: withers, chest, brisket, belly, flank, rump, croup, back.
  const body: P[] =
    s.build === 'round' || s.build === 'wool' || s.build === 'shell'
      ? ellipsePoints([0, (yb + yt) / 2], B / 2, D / 2, 0, 10)
      : s.build === 'low'
        ? [
            [B * 0.4, yt + D * 0.05],
            [B / 2, yt + D * 0.55],
            [B * 0.36, yb + D * 0.02],
            [0, yb + D * 0.06],
            [-B * 0.36, yb],
            [-B / 2, yt + D * 0.6],
            [-B * 0.36, yt + D * 0.08],
            [0, yt],
          ]
        : [
            [B / 2 - D * 0.32, yt - slope * 0.5],
            [B / 2, yt + D * 0.48],
            [B / 2 - D * 0.28, yb + D * (s.build === 'barrel' ? 0.04 : 0.02)],
            [0, yb - D * (s.build === 'barrel' ? -0.02 : 0.08)],
            [-B / 2 + D * 0.34, yb - D * (s.build === 'barrel' ? 0.02 : 0.1)],
            [-B / 2, yt + D * 0.45 + slope * 0.5],
            [-B / 2 + D * 0.3, yt + slope * 0.5],
            [0, yt + D * 0.07],
          ];
  const xf = B / 2 - D * 0.36;
  const xh = -B / 2 + D * 0.4;
  const hipY = yb - D * 0.28;
  // Each foot's bottom on the ground: a hoof's, a paw's, a pad's.
  const footY =
    s.foot === 'hoof'
      ? -s.footW * 0.62
      : s.foot === 'pad'
        ? -s.footW * 0.4
        : s.foot === 'claw'
          ? -1.5
          : -s.footW * 0.52;
  const legs: QuadFrame['legs'] = [];
  for (const near of [false, true]) {
    const dy = near ? 0 : -1.8;
    if (s.sprawl) {
      // Out to the side and down: the elbow above the body's line.
      const out = near ? 1 : -0.6;
      for (const front of [true, false]) {
        const x = (front ? xf : xh) + (near ? 0 : s.legW * 0.5);
        legs.push({
          near,
          front,
          joints: [
            [x, hipY + D * 0.1],
            // The elbow out and down, its round bend kept off the ground.
            [
              x + (front ? 3 : -3) * out,
              Math.min(yb + 2 + dy * 0.5, -(s.legW / 2 + LINE / 2) + dy),
            ],
            [x + (front ? 5 : -2), -(s.footW / 2 + LINE) + dy],
          ],
        });
      }
      continue;
    }
    // Seen a little from the front: the far legs a stride from the near,
    // the front one ahead and the hind one behind, so all four show.
    const fx = near ? 0 : s.legW * 0.9;
    const hx = near ? 0 : -s.legW * 0.65;
    // Every bend above the foot, however short the leg (a turtle's).
    const bend = (y: number) => Math.min(y, footY + dy - s.footW * 0.5);
    legs.push({
      near,
      front: true,
      joints: [
        [xf + fx * 0.4, hipY],
        [xf + fx * 0.75 + 1, bend(yb + L * 0.52 + dy * 0.5)],
        [xf + fx, footY + dy],
      ],
    });
    legs.push({
      near,
      front: false,
      joints: [
        [xh + hx * 0.4, hipY],
        [xh + hx * 0.7 + s.hock * 0.6, bend(yb + L * 0.3)],
        [xh + hx - s.hock, bend(-L * 0.3 + dy * 0.5)],
        [xh + hx - s.hock * 0.5, footY + dy],
      ],
    });
  }
  const tail: P = [-B / 2 + D * 0.16, yt + D * 0.28 + slope * 0.4];
  const n0: P = [B / 2 - D * 0.3, yt + D * 0.34 - slope * 0.4];
  const n1 = polar(n0, s.neck.len, s.neck.angle);
  const r = s.head.r;
  // A round head sits on its neck; a long one hangs from it, its cheek
  // over the neck's end; a crocodile's lies out before it.
  const head: P = longHead(s)
    ? add(n1, turn([r * 0.3, -r * 0.3], [0, 0], s.head.angle))
    : s.head.long > 1.3
      ? add(n1, polar([0, 0], r * s.head.long * 0.42, -s.head.angle))
      : add(n1, [r * 0.18, -r * 0.42]);
  return { body, legs, tail, neck: [n0, n1], head };
}

/** Whether a head is long: a round cheek and a muzzle with the nose between them, pointing down and forward (a horse's, a cow's). */
const longHead = (s: QuadShape) =>
  s.head.long > 1.3 && s.muzzle.kind === 'long';

/** A long head's muzzle: how far its middle is from the cheek's, and its reach, in shares of r. */
const snoutOf = (s: QuadShape) => {
  const m = s.head.snout ?? 0.6;
  return { m, d: s.head.long - m };
};

/**
 * A point on a long head, in its own frame: from the cheek's middle,
 * forward toward the muzzle and down across it, in shares of r.
 */
const onHead = (s: QuadShape, at: P, x: number, y: number): P =>
  turn(add(at, [s.head.r * x, s.head.r * y]), at, s.head.angle);

/** A head's outline: round; long, a cheek and a muzzle; or a crocodile's, long and flat. */
function headOutline(s: QuadShape, at: P): P[] {
  const r = s.head.r;
  if (s.head.long <= 1.3)
    return ellipsePoints(at, r * s.head.long, r, s.head.angle, 8);
  if (longHead(s)) {
    const { m, d } = snoutOf(s);
    return (
      [
        [-1, 0.05],
        [-0.74, -0.7],
        [0.05, -1],
        [d * 0.55, -(1 + m) / 2 - 0.04],
        [d + 0.08 * m, -m],
        [d + m, -0.04],
        [d + 0.4 * m, m * 0.92],
        [d * 0.55, (0.95 + m) / 2 - 0.02],
        [0.05, 0.96],
        [-0.72, 0.7],
      ] as P[]
    ).map(([x, y]) => onHead(s, at, x, y));
  }
  const L = r * s.head.long;
  const local: P[] = [
    [-L * 0.5, 0],
    [-L * 0.42, -r * 0.95],
    [-L * 0.05, -r * 0.96],
    [L * 0.34, -r * 0.7],
    [L * 0.52, -r * 0.2],
    [L * 0.48, r * 0.46],
    [L * 0.2, r * 0.72],
    [-L * 0.22, r * 0.95],
  ];
  return local.map((p) => turn(add(at, p), at, s.head.angle));
}

/** A point on a crocodile's head, given along its axis and across it (shares of its half-length and of r). */
const alongHead = (s: QuadShape, at: P, along: number, across: number): P =>
  turn(
    add(at, [s.head.r * s.head.long * 0.5 * along, s.head.r * across]),
    at,
    s.head.long > 1.3 ? s.head.angle : 0,
  );

/** An ear, by its kind, from its base: behind the head, or before it. */
/** A sheep's face, ears and legs: its second colour, else dark grey; its wool is only on its body. */
const sheepFace = (look: Look): string | null =>
  look.spec.species === 'sheep'
    ? look.spec.second
      ? look.second
      : '#5f5d66'
    : null;

function earOf(
  kind: AnimalEars,
  base: P,
  size: number,
  lean: number,
  look: Look,
  near: boolean,
): string {
  const bare = sheepFace(look);
  const colour = bare
    ? near
      ? bare
      : shade(bare, 0.85)
    : near
      ? look.coat
      : look.far;
  switch (kind) {
    case 'pointed': {
      const tip = polar(base, size * 1.25, 90 + lean);
      const a = polar(base, size * 0.55, 180 + lean * 0.5);
      const b = polar(base, size * 0.55, lean * 0.5);
      const outer = blob(
        [a, lerp(a, tip, 0.55), tip, lerp(b, tip, 0.5), b, base],
        0.55,
      );
      const inner = blob(
        [
          lerp(a, base, 0.35),
          lerp(lerp(a, tip, 0.55), base, 0.25),
          lerp(tip, base, 0.22),
          lerp(lerp(b, tip, 0.5), base, 0.3),
          lerp(b, base, 0.4),
        ],
        0.55,
      );
      return path(outer, inked(colour)) + path(inner, flat(look.inner));
    }
    case 'round': {
      const at = polar(base, size * 0.55, 90 + lean);
      return (
        circle(at, size * 0.62, inked(colour)) +
        circle(lerp(at, base, 0.18), size * 0.36, flat(look.inner))
      );
    }
    case 'long': {
      const tip = polar(base, size * 2.2, 90 + lean);
      const mid = lerp(base, tip, 0.55);
      const side = polar([0, 0], size * 0.5, lean);
      const outer = blob(
        [
          sub(base, mul(side, 0.8)),
          sub(mid, side),
          tip,
          add(mid, side),
          add(base, mul(side, 0.8)),
        ],
        0.8,
      );
      const inner = blob(
        [
          sub(lerp(base, tip, 0.2), mul(side, 0.35)),
          sub(mid, mul(side, 0.5)),
          lerp(mid, tip, 0.7),
          add(mid, mul(side, 0.5)),
          add(lerp(base, tip, 0.2), mul(side, 0.35)),
        ],
        0.8,
      );
      return path(outer, inked(colour)) + path(inner, flat(look.inner));
    }
    default: {
      // Floppy: hanging down beside the head from its base.
      const tip = polar(base, size * 1.6, -90 + lean);
      const side = polar([0, 0], size * 0.55, lean);
      return path(
        blob(
          [
            sub(base, mul(side, 0.5)),
            sub(lerp(base, tip, 0.55), side),
            tip,
            add(lerp(base, tip, 0.5), mul(side, 0.9)),
            add(base, mul(side, 0.6)),
          ],
          0.9,
        ),
        inked(near ? shade(look.coat, 0.84) : shade(look.coat, 0.74)),
      );
    }
  }
}

/** The tail, by its kind, from its base on the rump. */
function tailOf(s: QuadShape, look: Look, base: P, lying = false): string {
  const len = s.tail;
  const w = s.tailW;
  const species = look.spec.species;
  const equine =
    species === 'horse' || species === 'donkey' || species === 'zebra';
  // None of it goes into the ground: sitting or lying, what would rests on
  // it. An outline's points kept `half` above it, a line's by half its width.
  const above = (pts: P[], half = 1): P[] =>
    pts.map(([x, y]): P => [x, Math.min(y, -half)]);
  const thick = w / 2 + LINE / 2;
  switch (look.tail) {
    case 'none':
      return '';
    case 'short':
      return path(
        blob(
          above([
            add(base, [2, 2]),
            add(base, [-len * 0.5, -len * 0.55]),
            add(base, [-len * 0.95, -len * 0.4]),
            add(base, [-len * 0.6, len * 0.2]),
          ]),
        ),
        inked(
          species === 'deer' || species === 'rabbit' ? look.second : look.coat,
        ),
      );
    case 'bushy': {
      const tip = add(
        base,
        lying ? [-len * 0.9, len * 0.5] : [-len * 0.8, len * 0.45],
      );
      const pts: P[] = above([
        add(base, [3, -w * 0.2]),
        add(base, [-len * 0.35, -w * 0.55]),
        add(lerp(base, tip, 0.7), [0, -w * 0.62]),
        tip,
        add(lerp(base, tip, 0.72), [w * 0.2, w * 0.55]),
        add(base, [-len * 0.2, w * 0.45]),
      ]);
      const end = pts[3];
      const tipPart = [lerp(pts[2], end, 0.35), end, lerp(pts[4], end, 0.3)];
      return (
        path(blob(pts, 0.9), inked(look.coat)) +
        (look.spec.second
          ? path(
              blob(
                [...tipPart, lerp(lerp(pts[2], pts[4], 0.5), end, 0.45)],
                0.9,
              ),
              flat(look.second),
            )
          : '')
      );
    }
    case 'curly': {
      // A curl open enough to read as one, not a knot as thick as it is wide.
      const r = Math.max(len * 0.22, (w + LINE) * 1.25);
      const c = add(base, [-r * 1.6, -r * 0.4]);
      const spiral: P[] = [base];
      for (let k = 0; k <= 10; k += 1) {
        const a = Math.PI * 0.2 + k * 0.62;
        const rr = r * (1 - k * 0.06);
        spiral.push([c[0] - Math.cos(a) * rr, c[1] - Math.sin(a) * rr]);
      }
      return limb(curve(above(spiral, thick)), look.coat, w);
    }
    case 'tufted': {
      const end = add(
        base,
        lying ? [-len * 0.9, len * 0.35] : [-len * 0.28, len * 0.85],
      );
      const mid = add(
        base,
        lying ? [-len * 0.45, len * 0.25] : [-len * 0.2, len * 0.3],
      );
      const tuft = ellipsePoints(
        end,
        w * 1.1,
        w * 1.7,
        lying ? -70 : -12,
        6,
      ).map((p, i) => (i % 2 ? lerp(p, end, 0.25) : p));
      return (
        limb(curve(above([base, mid, end], thick)), look.coat, w) +
        path(blob(above(tuft), 0.9), inked(look.hair))
      );
    }
    default: {
      if (equine) {
        // A horse's tail: its hair falling from the dock.
        const drop = lying
          ? [-len * 0.95, len * 0.3]
          : [-len * 0.32, len * 0.95];
        const end = add(base, drop as P);
        const pts: P[] = [
          add(base, [3, -3]),
          add(base, [-w * 1.6, -w * 0.6]),
          add(lerp(base, end, 0.55), [-w * 1.5, 0]),
          add(end, [-w * 0.6, 0]),
          add(end, [w * 0.8, -w * 0.2]),
          add(lerp(base, end, 0.5), [w * 0.6, 0]),
        ];
        return path(blob(above(pts), 0.9), inked(look.hair));
      }
      if (s.build === 'low') {
        const pts: P[] = [
          add(base, [3, 0]),
          add(base, [-len * 0.3, s.depth * 0.3]),
          add(base, [-len * 0.65, s.depth * 0.6]),
          [base[0] - len, -(w * 0.16 + 0.3)],
        ];
        return path(tapered(pts, w * 1.35, w * 0.32), inked(look.coat));
      }
      // Long and thin, up and over, or out along the ground lying down.
      const pts: P[] = lying
        ? [
            base,
            add(base, [-len * 0.35, len * 0.25]),
            add(base, [-len * 0.7, len * 0.4]),
            add(base, [-len, len * 0.3]),
          ]
        : species === 'mouse'
          ? [
              base,
              add(base, [-len * 0.4, len * 0.15]),
              add(base, [-len * 0.75, -len * 0.05]),
              add(base, [-len, -len * 0.3]),
            ]
          : [
              base,
              add(base, [-len * 0.3, -len * 0.25]),
              add(base, [-len * 0.45, -len * 0.7]),
              add(base, [-len * 0.3, -len]),
            ];
      return limb(curve(above(pts, thick)), look.coat, w);
    }
  }
}

/** A foot at the end of a leg: a paw, a hoof, an elephant's pad, a lizard's claws. */
function footOf(
  s: QuadShape,
  at: P,
  colour: string,
  flatDown: boolean,
): string {
  const w = s.footW;
  switch (s.foot) {
    case 'hoof':
      return path(
        `M${pt(add(at, [-w * 0.55, -w * 0.2]))} L${pt(add(at, [w * 0.55, -w * 0.2]))} L${pt(add(at, [w * 0.7, w * 0.62]))} L${pt(add(at, [-w * 0.62, w * 0.62]))} Z`,
        inked(HOOF),
      );
    case 'pad':
      return (
        ellipse(add(at, [0, w * 0.1]), w * 0.62, w * 0.3, inked(colour)) +
        [-0.3, 0, 0.3]
          .map((dx) =>
            ellipse(
              add(at, [w * dx + w * 0.1, w * 0.12]),
              w * 0.1,
              w * 0.08,
              inked(BONE, 1.4),
            ),
          )
          .join('')
      );
    case 'claw': {
      // Toes spread on the ground before the foot.
      const ground: P = [at[0], -1];
      return [-18, 0, 18]
        .map((deg) =>
          line(
            poly([
              add(ground, [0, 0]),
              polar(ground, w * 0.95, deg * (flatDown ? 0.5 : 1)),
            ]),
            FIGURE_INK,
            1.8,
          ),
        )
        .join('');
    }
    default:
      return ellipse(
        add(at, [w * 0.2, w * 0.1]),
        w * 0.72,
        w * 0.42,
        inked(colour),
      );
  }
}

/** A leg along its joints: its upper part, then its lower part, its foot, and the upper's colour over the knee. */
function legOf(
  s: QuadShape,
  joints: P[],
  colour: string,
  lower: string,
  look: Look,
  flatDown = false,
): string {
  const upper = poly(joints.slice(0, 2));
  const foot = joints[joints.length - 1];
  const knee = joints[joints.length - 2];
  // A leg standing on the ground ends where its round end stays inside
  // the foot, not showing under it: drawn up the leg from the foot by as
  // much as it would go past the ground.
  const ended = (w: number): P => {
    const over = foot[1] + w / 2 + LINE / 2;
    const [dx, dy] = sub(foot, knee);
    return over > 0 && dy > Math.hypot(dx, dy) * 0.5
      ? sub(foot, mul([dx, dy], Math.min(0.8, over / dy)))
      : foot;
  };
  const rest = poly([...joints.slice(1, -1), ended(s.footW)]);
  const boot = look.spec.wear.feet === 'boots';
  return [
    limbInk(upper, s.legW),
    limbInk(rest, s.footW),
    limbFill(rest, lower, s.footW),
    boot
      ? limb(
          poly([lerp(knee, foot, 0.55), ended(s.footW * 1.12)]),
          look.wear,
          s.footW * 1.12,
        ) +
        ellipse(
          add(foot, [s.footW * 0.25, 0]),
          s.footW * 0.78,
          s.footW * 0.42,
          inked(look.wear),
        )
      : footOf(s, foot, lower, flatDown),
    limbFill(upper, colour, s.legW),
  ].join('');
}

/** The body's own markings, clipped to it: patches, spots, stripes, a paler belly. */
function markings(
  s: QuadShape,
  look: Look,
  outline: P[],
  clipId: string,
): { defs: string; markup: string } {
  if (
    look.pattern === 'plain' ||
    look.pattern === 'socks' ||
    look.pattern === 'blaze'
  )
    return { defs: '', markup: '' };
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const w = x1 - x0;
  const h = y1 - y0;
  const c = look.second;
  const shapes: string[] = [];
  const seeded = seededOf(`${look.id}:${look.spec.species}`);
  switch (look.pattern) {
    case 'belly': {
      // The body's own lower edge, and a curve across above it: a paler
      // belly and chest that never reach past the body.
      const mid = y0 + h * 0.58;
      const lower = outline
        .filter((p) => p[1] > mid)
        .sort((a, b) => b[0] - a[0]);
      if (lower.length >= 2) {
        const [front, back] = [lower[0], lower[lower.length - 1]];
        shapes.push(
          path(
            blob(
              [
                ...lower,
                [back[0] + w * 0.08, mid - h * 0.02],
                [x0 + w * 0.5, mid - h * 0.1],
                [front[0] - w * 0.06, mid - h * 0.16],
              ],
              0.9,
            ),
            flat(c),
          ),
        );
      }
      break;
    }
    case 'patches':
      if (look.spec.species === 'giraffe') {
        const within = ([x, y]: P) =>
          ((x - (x0 + w / 2)) / (w / 2)) ** 2 +
            ((y - (y0 + h / 2)) / (h / 2)) ** 2 <
          1.15;
        shapes.push(...tiles([x0, y0, w, h], h * 0.34, c, seeded, within));
        break;
      }
      for (let k = 0; k < 5; k += 1) {
        const at: P = [
          x0 + w * (0.12 + k * 0.19 + seeded() * 0.06),
          y0 + h * (0.22 + seeded() * 0.5),
        ];
        const r = h * (0.13 + seeded() * 0.1);
        shapes.push(
          path(
            blob(
              ellipsePoints(
                at,
                r * (1 + seeded() * 0.4),
                r,
                seeded() * 40,
                7,
              ).map((p) => lerp(at, p, 0.75 + seeded() * 0.4)),
            ),
            flat(c),
          ),
        );
      }
      break;
    case 'spots': {
      const n = look.spec.species === 'giraffe' ? 11 : 9;
      for (let k = 0; k < n; k += 1) {
        const at: P = [
          x0 + w * (0.1 + (k / n) * 0.85),
          y0 + h * (0.2 + seeded() * 0.6),
        ];
        const r =
          h *
          (look.spec.species === 'giraffe' ? 0.14 : 0.09) *
          (0.8 + seeded() * 0.4);
        shapes.push(ellipse(at, r * 1.15, r, flat(c), seeded() * 60));
      }
      break;
    }
    case 'stripes': {
      const n = Math.max(4, Math.round(w / (h * 0.3)));
      for (let k = 0; k < n; k += 1) {
        const x = x0 + w * ((k + 0.6) / (n + 0.4));
        const bend = (seeded() - 0.5) * h * 0.15;
        shapes.push(
          path(
            blob(
              [
                [x - h * 0.05, y0 - 2],
                [x + h * 0.06, y0 - 2],
                [x + h * 0.04 + bend, y0 + h * 0.45],
                [x + h * 0.02, y0 + h * (0.72 + seeded() * 0.2)],
                [x - h * 0.03 + bend, y0 + h * 0.45],
              ],
              0.8,
            ),
            flat(c),
          ),
        );
      }
      break;
    }
  }
  void s;
  return {
    defs: `<clipPath id="${clipId}"><path d="${blob(outline)}"/></clipPath>`,
    markup: `<g clip-path="url(#${clipId})">${shapes.join('')}</g>`,
  };
}

/** A giraffe's patches: rounded tiles in rows across a box, a thin gap of the coat between them. */
function tiles(
  [x0, y0, w, h]: [number, number, number, number],
  size: number,
  colour: string,
  seeded: () => number,
  /** Only where the shape is: a tile whose middle is outside it is left out. */
  within: (at: P) => boolean = () => true,
): string[] {
  const out: string[] = [];
  for (let row = 0; row * size < h + size; row += 1)
    for (let col = 0; col * size < w + size; col += 1) {
      const at: P = [
        x0 +
          col * size +
          (row % 2 ? size / 2 : 0) +
          (seeded() - 0.5) * size * 0.2,
        y0 + row * size * 0.9 + (seeded() - 0.5) * size * 0.2,
      ];
      if (!within(at)) continue;
      const r = size * 0.4;
      out.push(
        path(
          blob(
            ellipsePoints(
              at,
              r * (0.95 + seeded() * 0.2),
              r * (0.85 + seeded() * 0.2),
              seeded() * 90,
              6,
            ).map((p) => lerp(at, p, 0.9 + seeded() * 0.2)),
            0.8,
          ),
          flat(colour),
        ),
      );
    }
  return out;
}

/** A small stable sequence from a name: markings in the same place in every make. */
function seededOf(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** What is worn on the back: a saddle blanket, a saddle, a cape; and the outline it sits on. */
function backWear(s: QuadShape, look: Look, outline: P[]): string {
  const worn = look.spec.wear.back;
  if (!worn) return '';
  const ys = outline.map((p) => p[1]);
  const xs = outline.map((p) => p[0]);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2 + s.len * 0.04;
  const h = bottom - top;
  const half = s.len * 0.2;
  const topAt = (x: number) => {
    // The back's line where the blanket lies: the outline's top near x.
    const near = outline
      .filter((p) => p[1] < top + h * 0.4)
      .sort((a, b) => Math.abs(a[0] - x) - Math.abs(b[0] - x))[0];
    return near ? near[1] : top;
  };
  const colour = look.wear;
  if (worn === 'cape') {
    const from: P = [mid + half * 1.3, topAt(mid + half) - 2];
    return path(
      blob(
        [
          from,
          [mid - half * 1.4, topAt(mid - half) - 1],
          [mid - half * 1.9, top + h * 0.72],
          [mid - half * 0.4, top + h * 0.62],
          [mid + half * 0.9, top + h * 0.5],
        ],
        0.9,
      ),
      inked(colour),
    );
  }
  const drop = top + h * (worn === 'saddle' ? 0.36 : 0.62);
  const blanket = blob(
    [
      [mid - half, topAt(mid - half) - 1.5],
      [mid, top - 2.2],
      [mid + half, topAt(mid + half) - 1.5],
      [mid + half * 1.02, drop - h * 0.1],
      [mid + half * 0.9, drop],
      [mid - half * 0.9, drop],
      [mid - half * 1.02, drop - h * 0.1],
    ],
    0.55,
  );
  const trim = line(
    `M${pt([mid - half * 0.88, drop - h * 0.1])} L${pt([mid + half * 0.88, drop - h * 0.1])}`,
    shade(colour, 1.45),
    Math.max(2, h * 0.05),
  );
  if (worn === 'saddle blanket') return path(blanket, inked(colour)) + trim;
  // A saddle: a leather seat on a small blanket, a girth and a stirrup.
  const seat = blob(
    [
      [mid - half * 0.75, top - 5],
      [mid - half * 0.4, top + 1],
      [mid + half * 0.35, top + 1],
      [mid + half * 0.75, top - 6],
      [mid + half * 0.55, top + h * 0.18],
      [mid - half * 0.55, top + h * 0.18],
    ],
    0.7,
  );
  return (
    path(blanket, inked(colour)) +
    trim +
    line(
      poly([
        [mid, top + h * 0.15],
        [mid, bottom - 1],
      ]),
      '#6b4a2f',
      3,
    ) +
    path(seat, inked('#8a5a3b')) +
    line(
      poly([
        [mid, top + h * 0.2],
        [mid, top + h * 0.5],
      ]),
      FIGURE_INK,
      1.6,
    ) +
    path(
      `M${pt([mid - 3, top + h * 0.5])} L${pt([mid + 3, top + h * 0.5])} L${pt([mid + 2.2, top + h * 0.6])} L${pt([mid - 2.2, top + h * 0.6])} Z`,
      inked(KIT_EXTRAS.steel, 1.6),
    )
  );
}

/** Wool: a cloud of bumps round the body, their inner edges covered. */
function woolOf(outline: P[], colour: string, bump: number): string {
  const n = outline.length;
  const bumps: string[] = [];
  const fill: P[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    for (const t of [0, 0.5]) {
      const p = lerp(a, b, t);
      bumps.push(circle(p, bump, inked(colour)));
      fill.push(p);
    }
  }
  return bumps.join('') + path(blob(fill), flat(colour));
}

/** A shell: its dome, its rim and its plates. */
function shellOf(outline: P[], look: Look): string {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const cx = (x0 + x1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  const shell = look.spec.second ? look.second : shade(look.coat, 0.7);
  const dome = blob([
    [x0, y1 - h * 0.2],
    [x0 + w * 0.12, y0 + h * 0.2],
    [cx, y0 - h * 0.1],
    [x1 - w * 0.12, y0 + h * 0.2],
    [x1, y1 - h * 0.2],
  ]);
  const plates = [
    [cx, y0 + h * 0.18],
    [cx - w * 0.26, y0 + h * 0.34],
    [cx + w * 0.26, y0 + h * 0.34],
  ]
    .map(([x, y]) =>
      path(
        `M${ellipsePoints([x, y], w * 0.12, h * 0.17, 0, 6)
          .map(pt)
          .join(' L')} Z`,
        `fill="${shade(shell, 1.18)}" stroke-width="1.8"`,
      ),
    )
    .join('');
  const rim = path(
    blob([
      [x0 - 2, y1 - h * 0.22],
      [cx, y1 - h * 0.34],
      [x1 + 2, y1 - h * 0.22],
      [x1 - 2, y1 - h * 0.08],
      [cx, y1 - h * 0.16],
      [x0 + 2, y1 - h * 0.08],
    ]),
    inked(shade(shell, 1.3)),
  );
  return path(dome, inked(shell)) + plates + rim;
}

/** A mane: along a long neck's top (a horse's, a zebra's), or round the head (a lion's, behind it). */
function maneOnNeck(s: QuadShape, look: Look, n0: P, n1: P): string {
  if (look.mane === 'none') return '';
  const w0 = s.neck.w;
  const w1 = s.head.long > 1.3 ? w0 * 0.62 : w0 * 0.8;
  const dir = sub(n1, n0);
  const len = Math.hypot(dir[0], dir[1]);
  const u: P = [dir[0] / len, dir[1] / len];
  // The crest: the neck's upper side, where the mane grows.
  const back: P = [u[1], -u[0]];
  const along = (t: number, out: number): P =>
    add(add(n0, mul(dir, t)), mul(back, (w0 + (w1 - w0) * t) / 2 + out));
  const long = look.mane === 'long';
  const k = s.neck.w / 34;
  const pts: P[] = [
    along(1.1, -3 * k),
    along(1.02, (long ? 9 : 6) * k),
    along(0.66, (long ? 11 : 7) * k),
    along(0.33, (long ? 10 : 6) * k),
    along(0.02, (long ? 6 : 4) * k),
    along(0.06, -4 * k),
    along(0.55, -3 * k),
  ];
  const mane = path(blob(pts, 0.8), inked(look.hair));
  if (look.spec.species !== 'zebra') return mane;
  // A zebra's mane stands up, striped.
  const stripes = [0.2, 0.45, 0.7, 0.92]
    .map((t) =>
      line(
        poly([along(t, -1), along(t, (long ? 8 : 5.5) * k)]),
        '#f7f4ee',
        2.4,
      ),
    )
    .join('');
  return mane + stripes;
}

/** Horns, by their kind, on top of the head: a pair of small ones, curled ones, antlers, a giraffe's knobs. */
function hornsOf(s: QuadShape, look: Look, head: P, near: boolean): string {
  const r = s.head.r;
  const long = s.head.long > 1.3;
  const top = long
    ? onHead(s, head, near ? -0.36 : 0.08, near ? -0.9 : -1.0)
    : add(head, [near ? -r * 0.35 : r * 0.25, -r * 0.9]);
  let k = r / 14;
  if (look.spec.species === 'giraffe')
    return (
      limb(poly([top, add(top, [near ? -2 : 1, -9 * k])]), look.coat, 3.6 * k) +
      circle(add(top, [near ? -2 : 1, -10 * k]), 2.8 * k, inked(NOSE))
    );
  switch (look.horns) {
    case 'small':
      return limb(
        curve([
          top,
          add(top, [near ? -4 * k : 3 * k, -4 * k]),
          add(top, [near ? -3 * k : 6 * k, -8 * k]),
        ]),
        BONE,
        3.8 * k,
      );
    case 'curled': {
      if (!near)
        return limb(
          curve([top, add(top, [3 * k, -7 * k]), add(top, [-1 * k, -11 * k])]),
          BONE,
          3.4 * k,
        );
      const c = add(top, [-6 * k, 2 * k]);
      const spiral: P[] = [];
      for (let i = 0; i <= 9; i += 1) {
        const a = -Math.PI * 0.35 - i * 0.62;
        const rr = 8 * k * (1 - i * 0.07);
        spiral.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
      }
      return limb(curve([top, ...spiral]), shade(BONE, 0.9), 4.6 * k);
    }
    case 'antlers': {
      const base = top;
      k *= 1.55;
      const stem: P[] = [
        base,
        add(base, [near ? -4 * k : 3 * k, -10 * k]),
        add(base, [near ? -8 * k : 7 * k, -22 * k]),
      ];
      const tines = [
        [
          add(stem[1], [0, -2 * k]),
          add(stem[1], [near ? 5 * k : 8 * k, -10 * k]),
        ],
        [
          add(lerp(stem[1], stem[2], 0.6), [0, 0]),
          add(lerp(stem[1], stem[2], 0.6), [near ? 4 * k : 9 * k, -8 * k]),
        ],
        [
          add(lerp(stem[1], stem[2], 0.4), [0, 0]),
          add(lerp(stem[1], stem[2], 0.4), [near ? -9 * k : -3 * k, -7 * k]),
        ],
      ];
      const colour = '#c9a074';
      return (
        limb(curve(stem), colour, 3.2 * k) +
        tines.map((t) => limb(poly(t), colour, 2.6 * k)).join('')
      );
    }
    default:
      return '';
  }
}

/** Whether a point is inside an outline (its points, taken as a polygon). */
function inside(p: P, outline: P[]): boolean {
  let within = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      within = !within;
  }
  return within;
}

/** A collar's front, from its middle: what hangs from it hangs here. */
const throatOf = (at: P, w: number, deg: number): P =>
  polar(at, w * 0.5, deg - 90);

/** The way a neck points, from the body up to the head, as `polar` takes it. */
const upNeck = (body: P, head: P) =>
  (Math.atan2(body[1] - head[1], head[0] - body[0]) * 180) / Math.PI;

/**
 * What is worn round the neck, drawn first in the head's group: over the
 * body, under the head, turning with it. It goes from inside the head on
 * down the neck (from `head` towards `body`) to the first place where its
 * middle and its front, where a tag or a bell hangs, are both clear of the
 * head's outline, and a little beyond: just below the head, where it shows.
 */
function neckWearBelow(
  look: Look,
  outline: P[],
  head: P,
  body: P,
  w: number,
  r: number,
): string {
  const worn = look.spec.wear.neck;
  if (!worn) return '';
  const deg = upNeck(body, head);
  const [dx, dy] = sub(body, head);
  const len = Math.hypot(dx, dy) || 1;
  const along: P = [dx / len, dy / len];
  const past = Math.max(1.8, w * 0.1);
  // A bow must show its wings either side of its knot, not just the knot.
  const wide = worn === 'bow' ? bowWing(r) * 0.75 : 0;
  for (let t = 0; t < 400; t += 0.5) {
    const at = add(head, mul(along, t));
    const front = throatOf(at, w, deg);
    const clear = [at, front, add(front, [-wide, 0]), add(front, [wide, 0])];
    if (clear.every((p) => !inside(p, outline)))
      return neckWear(look, add(at, mul(along, past)), w, deg, r);
  }
  return '';
}

/** A bow's wing, by the head it is under. */
const bowWing = (r: number) => Math.max(7, r * 0.5);

/**
 * What is worn round the neck: a collar and its tag, a bow, a scarf, a
 * bell. Round a neck `w` wide; what hangs from it sized by the head (its
 * radius `r`), and never so small that its outline hides its colour.
 */
function neckWear(
  look: Look,
  at: P,
  w: number,
  deg: number,
  r: number,
): string {
  const worn = look.spec.wear.neck;
  if (!worn) return '';
  const colour = look.wear;
  const band = (width: number) => {
    const a = polar(at, w * 0.55, deg + 90);
    const b = polar(at, w * 0.55, deg - 90);
    const mid = polar(at, w * 0.12, deg + 180);
    return limb(curve([a, mid, b]), colour, width);
  };
  const low = throatOf(at, w, deg);
  const big = Math.max(w, 16);
  switch (worn) {
    case 'bow': {
      const c = low;
      const wing = bowWing(r);
      return (
        path(
          blob(
            [c, add(c, [-wing, -wing * 0.7]), add(c, [-wing, wing * 0.7])],
            0.4,
          ),
          inked(colour),
        ) +
        path(
          blob(
            [c, add(c, [wing, -wing * 0.7]), add(c, [wing, wing * 0.7])],
            0.4,
          ),
          inked(colour),
        ) +
        circle(c, Math.max(2.4, wing * 0.28), inked(shade(colour, 0.8)))
      );
    }
    case 'scarf': {
      const hang: P[] = [
        add(low, [-2, 0]),
        add(low, [-big * 0.1, big * 0.4]),
        add(low, [-big * 0.3, big * 0.7]),
      ];
      return (
        band(Math.max(5, w * 0.24)) +
        limb(curve(hang), colour, Math.max(4.5, w * 0.2))
      );
    }
    case 'bell': {
      const bell = Math.max(6, r * 0.5);
      return (
        band(Math.max(3.4, w * 0.13)) +
        path(
          blob(
            [
              add(low, [0, -1]),
              add(low, [bell * 0.62, bell * 0.8]),
              add(low, [0, bell * 1.05]),
              add(low, [-bell * 0.62, bell * 0.8]),
            ],
            0.9,
          ),
          inked(GOLD),
        )
      );
    }
    default: {
      const tag = Math.max(2.6, r * 0.16);
      return (
        band(Math.max(3.4, w * 0.14)) +
        circle(add(low, [0, tag * 0.8]), tag, inked(GOLD, 1.8))
      );
    }
  }
}

/** What is worn on the head: a hat, a crown, a flower by the ear. */
function headWear(look: Look, top: P, r: number): string {
  const worn = look.spec.wear.head;
  if (!worn) return '';
  const k = r / 16;
  const colour = look.wear;
  switch (worn) {
    case 'crown': {
      const w = 11 * k;
      const h = 8 * k;
      const base = add(top, [0, -1 * k]);
      const d = `M${pt(add(base, [-w, 0]))} L${pt(add(base, [-w, -h]))} L${pt(add(base, [-w * 0.5, -h * 0.45]))} L${pt(add(base, [0, -h * 1.15]))} L${pt(add(base, [w * 0.5, -h * 0.45]))} L${pt(add(base, [w, -h]))} L${pt(add(base, [w, 0]))} Z`;
      return (
        path(d, inked(GOLD)) +
        circle(add(base, [0, -h * 0.35]), 1.8 * k, inked(CLOTH.red, 1.4))
      );
    }
    case 'flower': {
      const c = add(top, [-6 * k, 1 * k]);
      const petals = [0, 72, 144, 216, 288]
        .map((deg) =>
          circle(polar(c, 3.6 * k, deg), 2.8 * k, inked(colour, 1.8)),
        )
        .join('');
      return petals + circle(c, 2.4 * k, inked(GOLD, 1.6));
    }
    default: {
      const brim = ellipse(
        add(top, [0, -1 * k]),
        12 * k,
        3.2 * k,
        inked(colour),
      );
      const crown = path(
        blob(
          [
            add(top, [-8 * k, -2 * k]),
            add(top, [-7 * k, -13 * k]),
            add(top, [7 * k, -13 * k]),
            add(top, [8 * k, -2 * k]),
          ],
          0.5,
        ),
        inked(colour),
      );
      const band = line(
        poly([add(top, [-7.6 * k, -4.5 * k]), add(top, [7.6 * k, -4.5 * k])]),
        shade(colour, 0.7),
        2.4 * k,
      );
      return brim + crown + band;
    }
  }
}

/** How a quadruped's body is posed: moved and turned about a point, and its legs' joints. */
interface Posed {
  /** How the body (and the neck with it) is moved, and turned about a point. */
  by: P;
  about: P;
  deg: number;
  legs: QuadFrame['legs'];
  /** The tail lying along the ground. */
  lying: boolean;
}

/** Each pose of four legs: the body sat back on its haunches, lying down, curled up. */
/** The four-legged species that sit on their haunches: the rest lie down when told to sit. */
const SITS: ReadonlySet<AnimalSpecies> = new Set([
  'dog',
  'cat',
  'lion',
  'tiger',
  'bear',
  'fox',
  'wolf',
  'mouse',
  'pig',
]);

function quadPoses(
  s: QuadShape,
  f: QuadFrame,
  sits: boolean,
): Partial<Record<AnimalPose, Posed>> {
  const stand: Posed = {
    by: [0, 0],
    about: [0, 0],
    deg: 0,
    legs: f.legs,
    lying: false,
  };
  const out: Partial<Record<AnimalPose, Posed>> = { stand };
  // A leg folded along the ground: its middle as high as it is thick, so
  // it lies on the ground and not through it.
  const lowY = -(s.footW / 2 + LINE);
  // Lying down: the body lowered onto the ground, the front legs forward
  // along it, the hind legs folded under. Its lowest, as its outline
  // curves (or its wool's bumps), just on the ground.
  const lowest =
    s.build === 'wool'
      ? Math.max(...f.body.map((p) => p[1])) + s.depth * 0.16
      : Math.max(...blobSamples(f.body).map((p) => p[1]));
  const drop = -lowest;
  const lieLegs: QuadFrame['legs'] = f.legs.map((one) => {
    const [hip] = one.joints;
    const h: P = [hip[0], hip[1] + drop];
    if (one.front) {
      const elbow: P = [h[0] - s.footW * 0.3, -(s.legW / 2 + LINE)];
      const reach = Math.min(s.leg * 0.42, s.depth * 0.7) + s.footW * 0.6;
      return { ...one, joints: [h, elbow, [elbow[0] + reach, lowY]] };
    }
    const knee: P = [h[0] + s.legW * 0.6, -(s.legW / 2 + LINE)];
    return { ...one, joints: [h, knee, [knee[0] + s.footW * 0.4, lowY]] };
  });
  out.lie = {
    by: [0, drop],
    about: [0, 0],
    deg: 0,
    legs: lieLegs,
    lying: true,
  };
  out.curl = { ...out.lie };
  if (s.sprawl || s.build === 'shell' || !sits) return out;
  // Sitting: the rump down to the ground about the shoulders, the chest up;
  // the front legs straight, the hind legs folded along the ground.
  const shoulder: P = f.legs.find((one) => one.near && one.front)!.joints[0];
  // Turned down about the shoulders until the rump, as its outline curves,
  // just touches the ground.
  const outline = blobSamples(f.body);
  let deg = 0;
  for (let k = 0; k < 60; k += 1) {
    const low = Math.max(...outline.map((p) => turn(p, shoulder, -deg)[1]));
    if (low >= -LINE / 2) break;
    deg += 1;
  }
  const sitLegs: QuadFrame['legs'] = f.legs.map((one) => {
    if (one.front) return one;
    // The haunch on the ground, not in it: its hip no lower than the
    // thigh is thick (the body over it hides the difference).
    const turned = turn(one.joints[0], shoulder, -deg);
    const hip: P = [turned[0], Math.min(turned[1], -(s.legW / 2 + LINE / 2))];
    const knee: P = [hip[0] + s.leg * 0.45, -(s.legW / 2 + LINE)];
    return { ...one, joints: [hip, knee, [knee[0] + s.footW * 0.9, lowY]] };
  });
  out.sit = {
    by: [0, 0],
    about: shoulder,
    deg: -deg,
    legs: sitLegs,
    lying: true,
  };
  return out;
}

/** A four-legged animal, a lizard, a crocodile or a turtle. */
function quadruped(spec: AnimalSpec, look: Look): Built {
  const base = QUADS[spec.species]!;
  const tall = animalTall(spec);
  const k = tall / SPECIES[spec.species].tall;
  const s = sized(base, k, BUILD_GIRTH[spec.build]);
  const f = quadFrame(s);
  const r = s.head.r;
  const [n0, n1] = f.neck;
  const H = f.head;
  const long = s.head.long > 1.3;
  const poses = quadPoses(s, f, SITS.has(spec.species));

  // ── The head, drawn once: what is worn round the neck and the ears
  // behind, its shape and muzzle, ears before.
  const headPts = headOutline(s, H);
  const behind: string[] = [
    neckWearBelow(
      look,
      headPts,
      n1,
      n0,
      Math.min(s.neck.w * (long ? 0.7 : 0.95), r * 1.2),
      r,
    ),
  ];
  const before: string[] = [];
  const earSize = r * 0.6 * s.ear;
  const ears: P[] = [];
  if (spec.species === 'elephant') {
    const nearBase = add(H, [-r * 0.28, -r * 0.62]);
    const farBase = add(H, [r * 0.42, -r * 0.72]);
    ears.push(nearBase, farBase);
    const flap = (at: P, big: number, colour: string) =>
      path(
        blob(
          [
            at,
            add(at, [-r * 0.78 * big, -r * 0.14 * big]),
            add(at, [-r * 1.02 * big, r * 0.55 * big]),
            add(at, [-r * 0.62 * big, r * 1.28 * big]),
            add(at, [-r * 0.08 * big, r * 1.12 * big]),
            add(at, [r * 0.08 * big, r * 0.45 * big]),
          ],
          0.9,
        ),
        inked(colour),
      );
    behind.push(
      pivoted(
        'rig-ear rig-ear-r',
        farBase,
        path(
          blob(
            [
              farBase,
              add(farBase, [r * 0.55, -r * 0.2]),
              add(farBase, [r * 0.62, r * 0.45]),
              add(farBase, [r * 0.2, r * 0.5]),
            ],
            0.9,
          ),
          inked(look.far),
        ),
      ),
    );
    before.push(
      pivoted(
        'rig-ear',
        nearBase,
        flap(nearBase, 1, look.coat) +
          path(
            blob(
              [
                add(nearBase, [-r * 0.22, r * 0.12]),
                add(nearBase, [-r * 0.72, r * 0.22]),
                add(nearBase, [-r * 0.6, r * 0.95]),
                add(nearBase, [-r * 0.18, r * 0.82]),
              ],
              0.9,
            ),
            flat(shade(look.coat, 1.18)),
          ),
      ),
    );
  } else if (look.ears) {
    const nearBase = long
      ? onHead(s, H, -0.45, -0.86)
      : add(H, [-r * 0.5, -r * 0.72]);
    const farBase = long
      ? onHead(s, H, -0.02, -0.98)
      : add(H, [r * 0.28, -r * 0.88]);
    // A cow's, a goat's and a sheep's ears stick out to the side.
    const sideways =
      (look.ears === 'pointed' &&
        (spec.species === 'cow' || spec.species === 'goat')) ||
      spec.species === 'sheep';
    const lean = sideways
      ? 62
      : look.ears === 'floppy'
        ? 12
        : look.ears === 'long'
          ? 18
          : 12;
    ears.push(nearBase, farBase);
    const far = pivoted(
      'rig-ear rig-ear-r',
      farBase,
      earOf(look.ears, farBase, earSize, -lean, look, false),
    );
    const near = pivoted(
      'rig-ear',
      nearBase,
      earOf(look.ears, nearBase, earSize, lean, look, true),
    );
    behind.push(far);
    (look.ears === 'floppy' ? before : behind).push(near);
  }
  // A lion's mane, round the head and behind it.
  if (spec.species === 'lion' && look.mane !== 'none') {
    const big = look.mane === 'long' ? 1.62 : 1.35;
    const tufts = ellipsePoints(
      add(H, [-r * 0.12, r * 0.08]),
      r * big,
      r * big * 0.96,
      0,
      14,
    ).map((p, i) => (i % 2 ? lerp(add(H, [-r * 0.12, r * 0.08]), p, 0.86) : p));
    behind.unshift(path(blob(tufts, 0.9), inked(look.hair)));
  }
  if (look.horns !== 'none' || spec.species === 'giraffe')
    behind.push(hornsOf(s, look, H, false), hornsOf(s, look, H, true));
  const headShape: string[] = [path(blob(headPts), inked(look.coat))];
  if (s.muzzle.kind === 'croc') {
    // Its eyes stand up out of the top of its head, each on a bump.
    const at = add(H, [r * s.eyeAt[0], r * s.eyeAt[1]]);
    for (const side of [-1, 1])
      headShape.unshift(
        circle(
          add(at, [side * (s.eyeDx ?? 14.5) * s.eye, s.eye * 3]),
          s.eye * 19,
          inked(look.coat),
        ),
      );
  }
  // Markings on the head: a blaze down a long face, a paler face or muzzle.
  if (look.pattern === 'blaze' && long) {
    const { m, d } = snoutOf(s);
    headShape.push(
      `<g clip-path="url(#${look.id}-head)">${path(
        blob(
          [
            onHead(s, H, -0.3, -1.1),
            onHead(s, H, 0.3, -1.08),
            onHead(s, H, d * 0.6, -0.78),
            onHead(s, H, d + 0.2 * m, -0.62 * m),
            onHead(s, H, d + 0.05 * m, -0.3 * m),
            onHead(s, H, d * 0.55, -0.55),
            onHead(s, H, 0.12, -0.72),
          ],
          0.8,
        ),
        flat(look.second),
      )}</g>`,
    );
  }
  if (spec.species === 'sheep')
    headShape.push(path(blob(headPts), inked(sheepFace(look)!)));
  if (
    spec.species === 'tiger' ||
    (spec.species === 'zebra' && look.pattern === 'stripes')
  ) {
    const c = look.spec.species === 'tiger' ? NOSE : look.second;
    const bands: [P, P][] = long
      ? [-0.75, -0.3, 0.15, 0.6, 1.05].map((x): [P, P] => [
          onHead(s, H, x, -1.1),
          onHead(s, H, x + 0.12, -0.2),
        ])
      : [-0.5, -0.1].map((x): [P, P] => [
          add(H, [r * x, -r * 1.1]),
          add(H, [r * (x + 0.08), -r * 0.5]),
        ]);
    for (const [a, b] of bands)
      headShape.push(
        `<g clip-path="url(#${look.id}-head)">${line(poly([a, b]), c, Math.max(2.4, r * 0.16))}</g>`,
      );
  }
  const muzzle = muzzleOf(s, look, H);
  headShape.push(muzzle.markup);

  // A long neck, drawn behind the body and turning with the head.
  const neckW = s.neck.w;
  const neckPts = neckOutline(n0, n1, neckW, long ? neckW * 0.62 : neckW * 0.8);
  const neckMarkup =
    s.neck.len > 3
      ? path(blob(neckPts, 0.9), inked(look.coat)) +
        (look.pattern === 'belly' && spec.species !== 'giraffe'
          ? `<g clip-path="url(#${look.id}-neck)">${ellipse(lerp(n0, n1, 0.5), neckW * 0.3, s.neck.len * 0.6 + 4, flat(look.second), 90 - s.neck.angle + (look.spec.species === 'horse' ? 0 : 20))}</g>`
          : '') +
        (look.pattern === 'patches' && spec.species === 'giraffe'
          ? `<g clip-path="url(#${look.id}-neck)">${(() => {
              // Two a row, up the neck.
              const seeded = seededOf(`${look.id}:neck`);
              const out: string[] = [];
              const rows = Math.round(s.neck.len / (neckW * 0.62));
              for (let i = 0; i <= rows; i += 1)
                for (const side of [-0.24, 0.24]) {
                  const along = lerp(n0, n1, (i + (side > 0 ? 0.5 : 0)) / rows);
                  const at = polar(along, neckW * side, s.neck.angle + 90);
                  out.push(
                    path(
                      blob(
                        ellipsePoints(
                          at,
                          neckW * 0.2,
                          neckW * 0.17,
                          seeded() * 90,
                          6,
                        ),
                        0.8,
                      ),
                      flat(look.second),
                    ),
                  );
                }
              return out.join('');
            })()}</g>`
          : '') +
        (look.pattern === 'stripes'
          ? `<g clip-path="url(#${look.id}-neck)">${[0.15, 0.38, 0.6, 0.82].map((t) => line(poly([polar(lerp(n0, n1, t), neckW, s.neck.angle + 100), polar(lerp(n0, n1, t), neckW, s.neck.angle - 80)]), look.second, Math.max(3, neckW * 0.14))).join('')}</g>`
          : '') +
        maneOnNeck(s, look, n0, n1)
      : '';
  const neckDefs =
    s.neck.len > 3
      ? `<clipPath id="${look.id}-neck"><path d="${blob(neckPts, 0.9)}"/></clipPath>`
      : '';

  // A horse's forelock, and what is worn on the head.
  if (
    look.mane === 'long' &&
    (spec.species === 'horse' || spec.species === 'donkey')
  )
    before.push(
      path(
        blob(
          [
            onHead(s, H, -0.4, -0.98),
            onHead(s, H, 0.05, -1.14),
            onHead(s, H, 0.32, -0.62),
            onHead(s, H, -0.08, -0.55),
          ],
          0.9,
        ),
        inked(look.hair),
      ),
    );
  const top = long ? onHead(s, H, -0.2, -1.02) : add(H, [-r * 0.1, -r * 0.98]);
  before.push(headWear(look, top, r));

  // ── Each pose's body: legs behind and before, the tail, the neck, the body.
  const posed: Partial<Record<AnimalPose, string>> = {};
  const headAt: Built['headAt'] = {};
  const clipHead = `<clipPath id="${look.id}-head"><path d="${blob(headPts)}"/></clipPath>`;
  for (const [pose, how] of Object.entries(poses) as [AnimalPose, Posed][]) {
    const place = (p: P) =>
      add(how.deg ? turn(p, how.about, how.deg) : p, how.by);
    const body = f.body.map(place);
    const legs = how.legs;
    const far = legs.filter((one) => !one.near);
    const near = legs.filter((one) => one.near);
    const socks = look.pattern === 'socks';
    const legGroup = (one: QuadFrame['legs'][number], colour: string) => {
      const markup = legOf(
        s,
        one.joints,
        colour,
        socks ? look.second : colour,
        look,
        pose !== 'stand',
      );
      if (pose !== 'stand') return markup;
      // Standing, each leg steps about its hip: a near front leg with the
      // far hind one, and the other two a step apart.
      const step = one.near === one.front ? 'a' : 'b';
      return pivoted(`rig-leg rig-leg-${step}`, one.joints[0], markup);
    };
    const bare = sheepFace(look);
    const legsBehind = far
      .map((one) => legGroup(one, bare ? shade(bare, 0.85) : look.far))
      .join('');
    const legsBefore = near
      .map((one) => legGroup(one, bare ?? look.coat))
      .join('');
    const tail = tailOf(s, look, place(f.tail), how.lying);
    const tailPart = tail ? pivoted('rig-tail', place(f.tail), tail) : '';
    const clipId = `${look.id}-body-${pose}`;
    const marks = markings(s, look, body, clipId);
    const bodyShape =
      s.build === 'wool'
        ? woolOf(body, look.coat, s.depth * 0.16)
        : s.build === 'shell'
          ? path(blob(body), inked(look.coat)) + shellOf(body, look)
          : path(blob(body), inked(look.coat));
    const dressed = backWear(s, look, body);
    // Lying, the head a little lower on its neck, and lower again curled
    // up (a long neck bends less); a long neck turns with it, so the head
    // stays on it.
    const lower =
      pose === 'curl' ? (s.neck.len > 30 ? 12 : 22) : pose === 'lie' ? 6 : 0;
    const neckPart = neckMarkup
      ? placed(
          placed(pivoted('rig-head', n0, neckMarkup), [0, 0], n0, lower),
          how.by,
          how.about,
          how.deg,
        )
      : '';
    // The tail and the neck behind everything; the legs, far then near,
    // all in one group; the body over their tops.
    posed[pose] = [
      marks.defs || pose === 'stand'
        ? `<defs>${marks.defs}${pose === 'stand' ? neckDefs + clipHead : ''}</defs>`
        : '',
      `<g class="rig-breathe">${tailPart}${neckPart}</g>`,
      `<g id="${pose === 'stand' ? 'legs' : `legs-${pose}`}" class="rig-legs">${legsBehind}${legsBefore}</g>`,
      `<g class="rig-breathe" id="${pose === 'stand' ? 'body' : `body-${pose}`}">${bodyShape}${marks.markup}${dressed}</g>`,
    ].join('');
    const neckNow = place(n0);
    // Sitting, the head stays up and looks ahead, whatever the body does.
    headAt[pose] = {
      by: sub(neckNow, n0),
      turn: pose === 'sit' ? how.deg * 0.25 : how.deg + lower,
    };
  }
  // Curled up, the head down on its paws.
  if (headAt.curl)
    headAt.curl = {
      by: add(headAt.curl.by, [0, r * 0.25]),
      turn: headAt.curl.turn,
    };

  const face = faceOn(s, H, look);
  const allX = [
    ...f.body.map((p) => p[0]),
    ...headPts.map((p) => p[0]),
    f.tail[0] - s.tail,
  ];
  const hornReach =
    look.horns === 'antlers'
      ? r * 2.6
      : look.horns === 'curled'
        ? r * 0.6
        : look.horns === 'small' || spec.species === 'giraffe'
          ? r * 0.85
          : 0;
  const allY = [
    ...headPts.map((p) => p[1]),
    ...ears.map((p) => p[1] - earSize * (look.ears === 'long' ? 2.3 : 1.3)),
    n1[1],
    Math.min(...headPts.map((p) => p[1])) - hornReach,
    top[1] - (look.spec.wear.head ? r * 1.1 : 0),
  ];
  const legsNow: Built['legs'] = f.legs.map((one) => ({
    hip: one.joints[0],
    foot: one.joints[one.joints.length - 1],
    step: one.near === one.front ? 'a' : 'b',
  }));
  return {
    plan: SPECIES[spec.species].plan,
    poses: posed,
    headAt,
    head: [...behind, ...headShape, ...before].join(''),
    neck: n0,
    dip: s.dip,
    face,
    mouth: muzzle.mouth,
    bounds: {
      left: Math.min(...allX) - 4,
      right:
        Math.max(...allX, H[0] + (s.muzzle.kind === 'trunk' ? r * 1.4 : 0)) + 4,
      top: Math.min(...allY) - 3,
    },
    anchors: {
      head: H,
      body: [0, -(s.leg + s.depth / 2)],
      legs: [0, -s.leg / 2],
    },
    legs: legsNow,
    tail: look.tail === 'none' ? null : f.tail,
    ears,
    arms: [],
    wings: [],
    gait: 'walk',
    sink: poses.lie?.by[1] ?? 0,
  };
}

/** A neck's outline from its base to where the head hangs: wide at the body, narrower at the head. */
function neckOutline(n0: P, n1: P, w0: number, w1: number): P[] {
  const dir = sub(n1, n0);
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const across: P = [dir[1] / len, -dir[0] / len];
  const at = (t: number, w: number, side: number): P =>
    add(add(n0, mul(dir, t)), mul(across, (w / 2) * side));
  return [
    at(-0.1, w0, 1),
    at(0.5, (w0 + w1) / 2, 1),
    at(1.05, w1, 1),
    at(1.1, w1 * 0.5, 0),
    at(1.05, w1, -1),
    at(0.5, (w0 + w1) / 2, -1),
    at(-0.1, w0, -1),
  ];
}

/** The kit's face on a quadruped's head: where, and how large. */
function faceOn(s: QuadShape, H: P, look: Look): Built['face'] {
  const r = s.head.r;
  const long = s.head.long > 1.3;
  const at = long
    ? onHead(s, H, s.eyeAt[0], s.eyeAt[1])
    : add(H, [r * s.eyeAt[0], r * s.eyeAt[1]]);
  const species = look.spec.species;
  const skin =
    species === 'sheep'
      ? look.spec.second
        ? look.second
        : '#5f5d66'
      : look.coat;
  return {
    at,
    s: s.eye,
    skin,
    eyeLine: eyeLineOf(s.eye),
    dx: s.eyeDx ?? 14.5,
  };
}

/** The eyes' outline, drawn at the kit's line but thinner on a small face, so a small eye stays white. */
export const eyeLineOf = (scale: number) =>
  Math.round(Math.max(2.3, Math.min(LINE, LINE * (scale / 0.36))) * 100) / 100;

/** A muzzle, by its kind: its shapes on the head, and where the mouth is. */
function muzzleOf(
  s: QuadShape,
  look: Look,
  H: P,
): { markup: string; mouth: Built['mouth'] } {
  const r = s.head.r;
  const m = s.muzzle;
  // A mouth a little larger than the face's own scale: a muzzle is seen
  // small on the stage, and its talking must read.
  const ms = s.eye * 1.25;
  switch (m.kind) {
    case 'snout': {
      const at = add(H, [r * 0.62 + m.len * 0.3, r * 0.38]);
      const rx = m.len * 0.62;
      const ry = m.w * 0.5;
      const nose = add(at, [rx * 0.72, -ry * 0.42]);
      const markup =
        ellipse(at, rx, ry, inked(look.muzzle), -6) +
        path(
          blob(
            [
              add(nose, [-r * 0.2, -r * 0.1]),
              add(nose, [r * 0.14, -r * 0.12]),
              add(nose, [r * 0.1, r * 0.12]),
              add(nose, [-r * 0.06, r * 0.14]),
            ],
            0.9,
          ),
          inked(NOSE),
        );
      return {
        markup,
        mouth: {
          at: add(at, [rx * 0.2, ry * 0.52]),
          s: ms,
          kind: 'muzzle',
          wide: 1,
        },
      };
    }
    case 'short': {
      const at = add(H, [r * 0.3, r * 0.42]);
      const lobe = m.w * 0.38;
      const markup =
        circle(add(at, [-lobe * 0.8, 0]), lobe, inked(look.muzzle)) +
        circle(add(at, [lobe * 0.8, 0]), lobe, inked(look.muzzle)) +
        path(
          `M${pt(add(at, [-lobe * 0.7, -lobe * 0.95]))} L${pt(add(at, [lobe * 0.7, -lobe * 0.95]))} L${pt(add(at, [0, -lobe * 0.2]))} Z`,
          inked(
            look.spec.species === 'cat' || look.spec.species === 'rabbit'
              ? PINK
              : NOSE,
            1.8,
          ),
        );
      return {
        markup,
        mouth: {
          at: add(at, [0, lobe * 1.25]),
          s: ms * 0.9,
          kind: 'muzzle',
          wide: 1,
        },
      };
    }
    case 'pig': {
      const at = add(H, [r * 0.95, r * 0.22]);
      const markup =
        ellipse(at, m.w * 0.3, m.w * 0.46, inked(shade(look.coat, 0.9)), -8) +
        ellipse(
          add(at, [-1, -m.w * 0.15]),
          m.w * 0.06,
          m.w * 0.11,
          flat(shade(look.coat, 0.55)),
        ) +
        ellipse(
          add(at, [1.5, m.w * 0.15]),
          m.w * 0.06,
          m.w * 0.11,
          flat(shade(look.coat, 0.55)),
        );
      return {
        markup,
        mouth: {
          at: add(H, [r * 0.62, r * 0.66]),
          s: ms,
          kind: 'muzzle',
          wide: 1,
        },
      };
    }
    case 'trunk': {
      const root = add(H, [r * 0.42, r * 0.08]);
      const pts: P[] = [
        root,
        add(root, [r * 0.42, r * 0.45]),
        add(root, [r * 0.46, r * 1.05]),
        add(root, [r * 0.42, r * 1.55]),
        add(root, [r * 0.62, r * 1.85]),
        add(root, [r * 0.82, r * 1.72]),
      ];
      // Both tusks behind the trunk, from either side of its root, their
      // tips curving out past it: none crosses it.
      const tusk = (i: number) => {
        const out = i ? 1.12 : 0.95;
        return limb(
          curve([
            add(H, [r * (0.3 + i * 0.2), r * 0.66]),
            add(H, [r * (out - 0.05), r * 0.98]),
            add(H, [r * (out + 0.18), r * 0.84]),
          ]),
          i ? BONE : shade(BONE, 0.9),
          m.w * 0.3,
        );
      };
      const wrinkles = [0.3, 0.42, 0.54, 0.66]
        .map((t) => {
          const at = lerp(pts[1], pts[4], t);
          return line(
            poly([add(at, [-m.w * 0.28, 0]), add(at, [m.w * 0.22, -1])]),
            shade(look.coat, 0.78),
            1.8,
          );
        })
        .join('');
      const markup =
        tusk(0) +
        tusk(1) +
        path(tapered(pts, m.w * 1.25, m.w * 0.62), inked(look.coat)) +
        wrinkles;
      return {
        markup,
        mouth: {
          at: add(H, [r * 0.18, r * 0.62]),
          s: ms * 0.9,
          kind: 'muzzle',
          wide: 1,
        },
      };
    }
    case 'croc': {
      const tip = alongHead(s, H, 1, 0.1);
      const teeth = [0.35, 0.55, 0.75]
        .map((t) => {
          const p = alongHead(s, H, t, 0.32);
          return path(
            `M${pt(add(p, [-1.6, 0]))} L${pt(add(p, [1.6, 0]))} L${pt(add(p, [0, 2.8]))} Z`,
            inked('#ffffff', 1.2),
          );
        })
        .join('');
      const nostril = circle(
        alongHead(s, H, 0.88, -0.35),
        r * 0.08,
        flat(NOSE),
      );
      return {
        markup: nostril + (look.spec.species === 'crocodile' ? teeth : ''),
        mouth: {
          at: lerp(alongHead(s, H, 0.35, 0.34), tip, 0.2),
          s: ms * 1.05,
          kind: 'muzzle',
          wide: look.spec.species === 'crocodile' ? 2.2 : 1.5,
        },
      };
    }
    case 'beaky': {
      return {
        markup: circle(alongHead(s, H, 0.9, -0.25), r * 0.07, flat(NOSE)),
        mouth: {
          at: alongHead(s, H, 0.7, 0.35),
          s: ms * 0.9,
          kind: 'muzzle',
          wide: 1.2,
        },
      };
    }
    default: {
      // A long head's own end: its muzzle a shade apart, a nostril, and
      // the mouth under the muzzle's front.
      const { m: sm, d } = snoutOf(s);
      const species = look.spec.species;
      const pale =
        species === 'cow'
          ? PINK
          : species === 'zebra'
            ? NOSE
            : species === 'horse'
              ? shade(look.coat, 0.78)
              : species === 'donkey'
                ? look.muzzle
                : species === 'sheep'
                  ? ''
                  : shade(look.coat, 1.16);
      const muzzleShape = pale
        ? `<g clip-path="url(#${look.id}-head)">${circle(onHead(s, H, d + 0.15 * sm, 0.1), r * sm * 1.12, inked(pale))}</g>`
        : '';
      const nostril = ellipse(
        onHead(s, H, d + 0.42 * sm, -0.3 * sm),
        r * sm * 0.16,
        r * sm * 0.22,
        flat(species === 'zebra' ? '#1d1a22' : NOSE),
        s.head.angle - 20,
      );
      const beard =
        species === 'goat'
          ? path(
              blob(
                [
                  onHead(s, H, d - 0.2, sm * 0.85),
                  onHead(s, H, d + 0.05, sm * 1.9),
                  onHead(s, H, d - 0.45, sm * 1.2),
                ],
                0.8,
              ),
              inked(look.spec.second ? look.second : shade(look.coat, 0.85)),
            )
          : '';
      return {
        markup: muzzleShape + nostril + beard,
        mouth: {
          at: onHead(s, H, d + 0.42 * sm, 0.62 * sm),
          s: s.eye * 1.4,
          kind: 'muzzle',
          wide: 1,
        },
      };
    }
  }
}

// ── The other plans ────────────────────────────────────────────────────────

/** A bird's shape at its middle size. */
interface BirdShape {
  leg: number;
  body: { w: number; h: number; tilt: number };
  head: { r: number; at: P };
  neck?: { len: number; angle: number; w: number };
  beak: Omit<Beak, 'hinge' | 'colour'>;
  eye: number;
  eyeAt: P;
  feet: 'toes' | 'webbed';
  tail: number;
  top?: 'comb' | 'tufts' | 'crest';
  /** Facing the viewer, eyes forward, its beak between them: an owl. */
  front?: boolean;
  gait: Gait;
  dip: number;
}

const BIRDS: Partial<Record<AnimalSpecies, BirdShape>> = {
  chicken: {
    leg: 12,
    body: { w: 30, h: 24, tilt: 14 },
    head: { r: 10.5, at: [11, -38] },
    beak: { len: 9.5, upper: 5.2, lower: 4, down: 12, kind: 'small' },
    eye: 0.26,
    eyeAt: [0.05, -0.04],
    feet: 'toes',
    tail: 13,
    top: 'comb',
    gait: 'walk',
    dip: 35,
  },
  duck: {
    leg: 8,
    body: { w: 30, h: 19, tilt: -4 },
    head: { r: 10.5, at: [11, -34] },
    neck: { len: 7, angle: 70, w: 9 },
    // A bill: shorter and broader than a goose's, round at its end.
    beak: { len: 10.5, upper: 6, lower: 4.4, down: 6, kind: 'flat' },
    eye: 0.24,
    eyeAt: [0, -0.06],
    feet: 'webbed',
    tail: 8,
    gait: 'waddle',
    dip: 35,
  },
  goose: {
    leg: 9,
    body: { w: 42, h: 27, tilt: -2 },
    head: { r: 10.5, at: [22, -59] },
    neck: { len: 26, angle: 76, w: 10 },
    beak: { len: 14, upper: 6, lower: 4.6, down: 10, kind: 'flat' },
    eye: 0.25,
    eyeAt: [0, -0.06],
    feet: 'webbed',
    tail: 9,
    gait: 'waddle',
    dip: 50,
  },
  owl: {
    leg: 4,
    body: { w: 33, h: 27, tilt: -84 },
    head: { r: 13.5, at: [2, -38] },
    beak: { len: 7.5, upper: 5.6, lower: 3.6, down: 74, kind: 'hooked' },
    eye: 0.36,
    eyeAt: [0, -0.02],
    feet: 'toes',
    tail: 7,
    front: true,
    gait: 'hop',
    dip: 20,
  },
  parrot: {
    leg: 5,
    body: { w: 32, h: 21, tilt: -66 },
    head: { r: 10.5, at: [7, -38] },
    beak: { len: 10, upper: 7.4, lower: 4.4, down: 40, kind: 'hooked' },
    eye: 0.27,
    eyeAt: [-0.1, -0.1],
    feet: 'toes',
    tail: 22,
    top: 'crest',
    gait: 'hop',
    dip: 25,
  },
  eagle: {
    leg: 7,
    body: { w: 46, h: 31, tilt: -76 },
    head: { r: 13, at: [9, -60] },
    beak: { len: 14, upper: 7.5, lower: 4.8, down: 28, kind: 'hooked' },
    eye: 0.33,
    eyeAt: [-0.08, -0.14],
    feet: 'toes',
    tail: 16,
    gait: 'hop',
    dip: 25,
  },
  pigeon: {
    leg: 5,
    body: { w: 22, h: 16, tilt: 6 },
    head: { r: 8, at: [8, -24] },
    beak: { len: 7.5, upper: 3.8, lower: 3.2, down: 12, kind: 'small' },
    eye: 0.2,
    eyeAt: [0, -0.1],
    feet: 'toes',
    tail: 9,
    gait: 'walk',
    dip: 35,
  },
};

/** A bird: its body, its folded wing, its tail, its legs, its head and beak. */
function bird(spec: AnimalSpec, look: Look): Built {
  const base = BIRDS[spec.species]!;
  const k = animalTall(spec) / SPECIES[spec.species].tall;
  const g = BUILD_GIRTH[spec.build];
  const L = base.leg * k;
  const bw = base.body.w * k * g;
  const bh = base.body.h * k * g;
  // Standing on its legs: its body's lowest point just above them, however it is turned.
  const t = (base.body.tilt * Math.PI) / 180;
  const halfHigh = Math.hypot((bw / 2) * Math.sin(t), (bh / 2) * Math.cos(t));
  const B: P = [0, -(L + halfHigh * 0.9)];
  const bodyPts = ellipsePoints(B, bw / 2, bh / 2, base.body.tilt, 10).map(
    (p, i) =>
      // An egg: fuller at the breast.
      i === 0 || i === 1 || i === 9 ? lerp(B, p, 1.04) : p,
  );
  // A small bird's head, eyes and beak a little larger for its body.
  const kh = headScale(k);
  const r = base.head.r * kh;
  const H: P = add(mul(base.head.at, k), [0, -(kh - k) * base.head.r * 0.5]);
  const species = spec.species;
  const beakColour =
    species === 'duck' || species === 'goose'
      ? ANIMAL_PAINT.orange
      : species === 'eagle' || species === 'chicken'
        ? ANIMAL_PAINT.yellow
        : species === 'parrot'
          ? '#f3e4b0'
          : species === 'owl'
            ? '#8d8f96'
            : '#5f5d66';
  const feetColour =
    species === 'duck' || species === 'goose'
      ? ANIMAL_PAINT.orange
      : ANIMAL_PAINT.orange;
  const coat = look.coat;
  // The legs, and the feet on the ground.
  const legX = [-bw * 0.08, bw * 0.12];
  const legsFor = (pose: AnimalPose) => {
    if (pose !== 'stand') return '';
    return legX
      .map((x, i) => {
        const hip: P = [x, B[1] + halfHigh * 0.62];
        const foot: P = [x + 1, -1.5 + (i === 0 ? -0.8 : 0)];
        const colour = i === 0 ? shade(feetColour, 0.85) : feetColour;
        const toes =
          base.feet === 'webbed'
            ? path(
                `M${pt(add(foot, [-2, 0]))} L${pt(add(foot, [7 * k, 1.2]))} L${pt(add(foot, [5 * k, -2.6 * k]))} Z`,
                inked(colour, 1.8),
              )
            : [-20, 5, 30]
                .map((deg) =>
                  line(
                    poly([foot, polar(foot, 4.2 * k, deg - 5)]),
                    FIGURE_INK,
                    1.9,
                  ),
                )
                .join('') +
              line(poly([foot, polar(foot, 3 * k, 180)]), FIGURE_INK, 1.9);
        const markup =
          line(poly([hip, foot]), FIGURE_INK, Math.max(2.2, 2.6 * k) + 1.2) +
          line(poly([hip, foot]), colour, Math.max(1.2, 1.6 * k)) +
          toes;
        const step = i === 0 ? 'a' : 'b';
        return pivoted(`rig-leg rig-leg-${step}`, hip, markup);
      })
      .join('');
  };
  // The tail: feathers fanned at the back.
  const tailBase = turn([B[0] - bw * 0.42, B[1]], B, base.body.tilt);
  const tl = base.tail * k;
  const hanging = species === 'parrot' || species === 'eagle';
  // A hanging tail ends above the ground: as long as there is room below
  // it, its round end and all.
  const hangs = Math.min(
    tl,
    (-tailBase[1] - 2 - tl * 0.25) / Math.sin((70 * Math.PI) / 180),
  );
  const tailFeathers = hanging
    ? path(
        tapered(
          [
            add(tailBase, [2, -3]),
            polar(tailBase, hangs * 0.5, 180 + 66),
            polar(tailBase, hangs, 180 + 70),
          ],
          tl * 0.42,
          tl * 0.3,
        ),
        inked(
          species === 'parrot' && look.spec.second
            ? look.second
            : shade(coat, 0.85),
        ),
      )
    : species === 'chicken'
      ? [-60, -35, -10]
          .map((deg) =>
            path(
              blob(
                [
                  tailBase,
                  polar(tailBase, tl * 0.9, 180 + deg + 10),
                  polar(tailBase, tl, 180 + deg),
                  polar(tailBase, tl * 0.6, 180 + deg - 12),
                ],
                0.8,
              ),
              inked(
                look.spec.second && look.pattern !== 'plain'
                  ? look.second
                  : coat,
              ),
            ),
          )
          .join('')
      : path(
          blob(
            [
              add(tailBase, [2, -2]),
              polar(tailBase, tl, 180 + (base.front ? -60 : 18)),
              polar(tailBase, tl * 0.92, 180 + (base.front ? -80 : 2)),
              add(tailBase, [2, 3]),
            ],
            0.6,
          ),
          inked(shade(coat, 0.9)),
        );
  // The wing folded on its side, about its shoulder.
  // An upright bird's (an owl's) a little lower, clear of its beak.
  const shoulder = turn(
    [B[0] + bw * (base.front ? 0.04 : 0.14), B[1] - bh * 0.22],
    B,
    base.body.tilt,
  );
  const wingTip = turn([B[0] - bw * 0.42, B[1] + bh * 0.08], B, base.body.tilt);
  const wingPts: P[] = [
    shoulder,
    lerp(shoulder, wingTip, 0.5),
    wingTip,
    add(
      lerp(shoulder, wingTip, 0.55),
      turn([0, bh * 0.26], [0, 0], base.body.tilt),
    ),
    add(shoulder, turn([-bw * 0.04, bh * 0.2], [0, 0], base.body.tilt)),
  ];
  const wingColour =
    species === 'parrot' && look.spec.second
      ? shade(coat, 0.8)
      : shade(coat, 0.88);
  // Spots on a bird are speckles on its wing.
  const speckles =
    look.pattern === 'spots' && look.spec.second
      ? [0.3, 0.5, 0.7, 0.42, 0.62]
          .map((t, i) =>
            ellipse(
              add(
                lerp(shoulder, wingTip, t),
                turn([0, bh * (i < 3 ? 0.08 : 0.17)], [0, 0], base.body.tilt),
              ),
              Math.max(1.1, bw * 0.035),
              Math.max(0.8, bh * 0.03),
              flat(look.second),
              base.body.tilt,
            ),
          )
          .join('')
      : '';
  const wing = pivoted(
    'rig-flap',
    shoulder,
    path(blob(wingPts, 0.9), inked(wingColour)) + speckles,
  );
  const belly =
    look.pattern === 'belly' || species === 'owl'
      ? `<g clip-path="url(#${look.id}-bird)">${ellipse(add(B, [bw * 0.18, bh * 0.2]), bw * 0.34, bh * 0.4, flat(look.second), base.body.tilt)}</g>`
      : '';
  const bodyMarkup = path(blob(bodyPts), inked(coat)) + belly;
  // The neck: a goose's long one, a duck's short one.
  const neck = base.neck
    ? (() => {
        const n0 = add(B, [bw * 0.3, -bh * 0.25]);
        return {
          n0,
          markup: path(
            blob(
              neckOutline(n0, H, base.neck.w * k * 1.5, base.neck.w * k),
              0.9,
            ),
            inked(coat),
          ),
        };
      })()
    : null;
  const pivot: P = neck ? neck.n0 : add(H, [-r * 0.2, r * 0.9]);
  // The head: its shape, a comb, tufts or a crest, and the upper half of its beak.
  // A hooked beak set into the face, not hung off the cheek.
  const hinge: P = base.front
    ? add(H, [0, r * 0.12])
    : add(H, [r * (base.beak.kind === 'hooked' ? 0.66 : 0.78), r * 0.18]);
  const beak: Beak = {
    ...base.beak,
    len: base.beak.len * kh,
    upper: base.beak.upper * kh,
    lower: base.beak.lower * kh,
    hinge,
    colour: beakColour,
  };
  const headParts: string[] = [];
  if (base.top === 'tufts')
    for (const side of [-1, 1])
      headParts.push(
        path(
          blob(
            [
              add(H, [side * r * 0.5, -r * 0.78]),
              add(H, [side * r * 0.95, -r * 1.22]),
              add(H, [side * r * 0.86, -r * 0.62]),
            ],
            0.5,
          ),
          inked(shade(coat, 0.8)),
        ),
      );
  if (base.top === 'crest')
    headParts.push(
      path(
        blob(
          [
            add(H, [-r * 0.4, -r * 0.8]),
            add(H, [-r * 0.9, -r * 1.5]),
            add(H, [-r * 0.1, -r * 1.05]),
            add(H, [0, -r * 0.9]),
          ],
          0.7,
        ),
        inked(shade(coat, 1.15)),
      ),
    );
  if (base.top === 'comb') {
    const comb = [-0.35, 0, 0.35].map((dx, i) =>
      circle(
        add(H, [r * dx, -r * (0.95 + (i === 1 ? 0.18 : 0))]),
        r * 0.3,
        inked(CLOTH.red),
      ),
    );
    headParts.push(...comb);
  }
  // On a bird, a blaze is its head in the second colour: a red-headed
  // parrot.
  const headColour =
    look.pattern === 'blaze' && look.spec.second
      ? look.second
      : species === 'eagle'
        ? '#f7f4ee'
        : coat;
  const headShape = base.front
    ? ellipse(H, r * 1.12, r, inked(headColour))
    : path(blob(ellipsePoints(H, r * 1.02, r * 0.96, 0, 8)), inked(headColour));
  // An owl's face disc, flat on its head with no line of its own: an
  // outline so near the head's would run into it, a dark ring round the
  // face.
  const faceDisc = base.front
    ? ellipse(
        add(H, [0, r * 0.1]),
        r * 0.9,
        r * 0.7,
        flat(look.spec.second ? look.second : shade(coat, 1.3)),
      )
    : '';
  const wattle =
    base.top === 'comb'
      ? ellipse(
          add(hinge, [-r * 0.08, r * 0.45]),
          r * 0.16,
          r * 0.3,
          inked(CLOTH.red),
        )
      : '';
  headParts.push(
    headShape,
    faceDisc,
    wattle,
    upperBeak(beak),
    headWear(look, add(H, [-r * 0.1, -r * 0.95]), r * 1.1),
  );
  // What is worn round the neck, just below the head, first in its group.
  headParts.unshift(
    neckWearBelow(
      look,
      ellipsePoints(H, r * (base.front ? 1.12 : 1.02), r, 0, 16),
      H,
      pivot,
      r * 1.2,
      r,
    ),
  );
  // Each pose: standing, and roosting low (sitting, lying, curled up).
  const poses: Partial<Record<AnimalPose, string>> = {};
  const headAt: Built['headAt'] = {};
  // Roosting low, its tail swung up off the ground as far as it must be.
  const tailReach = reachOf(tailFeathers);
  const tailUp = (drop: number) => {
    for (let deg = 0; deg < 90; deg += 5)
      if (
        Math.max(...tailReach.map((p) => turn(p, tailBase, deg)[1])) + drop <=
        LINE / 2
      )
        return deg;
    return 90;
  };
  // Roosting, its body lowered until its lowest (the wing's, if lower) is
  // on the ground.
  const roost =
    LINE / 2 - Math.max(...reachOf(bodyMarkup + wing).map((p) => p[1]));
  for (const pose of ['stand', 'lie'] as AnimalPose[]) {
    const drop = pose === 'stand' ? 0 : roost;
    const by: P = [0, drop];
    const tail = pivoted('rig-tail', tailBase, tailFeathers);
    const markup = [
      `<g id="${pose === 'stand' ? 'legs' : 'legs-lie'}" class="rig-legs">${legsFor(pose)}</g>`,
      placed(
        `<g class="rig-breathe">${placed(tail, [0, 0], tailBase, tailUp(drop))}${neck ? pivoted('rig-head', neck.n0, neck.markup) : ''}</g>` +
          `<g class="rig-breathe" id="${pose === 'stand' ? 'body' : 'body-lie'}">${bodyMarkup}${wing}</g>`,
        by,
      ),
    ].join('');
    poses[pose] = markup;
    headAt[pose] = { by, turn: 0 };
  }
  poses.stand = `<defs><clipPath id="${look.id}-bird"><path d="${blob(bodyPts)}"/></clipPath></defs>${poses.stand}`;
  poses.sit = poses.lie;
  headAt.sit = headAt.lie;
  const face: Built['face'] = {
    at: add(H, [r * base.eyeAt[0], r * base.eyeAt[1]]),
    s: base.eye * kh,
    skin: base.front
      ? look.spec.second
        ? look.second
        : shade(coat, 1.3)
      : species === 'eagle'
        ? '#f7f4ee'
        : coat,
    eyeLine: eyeLineOf(base.eye * kh),
    // Apart, not run together into a mask on a small head.
    dx: base.front ? 16 : 19,
  };
  const allX = [
    ...bodyPts.map((p) => p[0]),
    H[0] + r + beak.len,
    tailBase[0] - tl,
  ];
  return {
    plan: 'bird',
    poses,
    headAt,
    head: headParts.join(''),
    neck: pivot,
    dip: base.dip,
    face,
    mouth: { at: hinge, s: base.eye * kh, kind: 'beak', wide: 1, beak },
    bounds: {
      left: Math.min(...allX) - 3,
      right: Math.max(...allX) + 3,
      top:
        H[1] -
        r *
          (base.top === 'tufts'
            ? 1.5
            : base.top === 'crest'
              ? 1.6
              : base.top === 'comb'
                ? 1.5
                : 1.1) -
        (look.spec.wear.head ? r * 1.1 : 0),
    },
    anchors: { head: H, body: B, legs: [0, -L / 2] },
    legs: legX.map((x, i) => ({
      hip: [x, B[1] + halfHigh * 0.62] as P,
      foot: [x + 1, -1.5] as P,
      step: i === 0 ? 'a' : 'b',
    })),
    tail: tailBase,
    ears: [],
    arms: [],
    wings: [shoulder],
    gait: base.gait,
    sink: L - 1,
  };
}

/**
 * A beak's outline: a little finer than the kit's line (within the slack
 * the house style allows it), so a small beak shows its colour and is not
 * all ink.
 */
export const BEAK_LINE = 2.2;

/** The upper half of a beak, over which the lower opens. */

export function upperBeak(b: Beak): string {
  const { hinge: h, len, upper } = b;
  const tip = polar(h, len, -b.down);
  const back = polar(h, upper, 90 - b.down);
  switch (b.kind) {
    case 'flat':
      // A bill: broad, and round at its end, not a point (whose lines
      // would meet in a dark tip).
      return path(
        blob(
          [
            add(back, [-1, 0]),
            add(lerp(back, tip, 0.6), [0, -upper * 0.2]),
            polar(tip, upper * 0.3, 90 - b.down),
            polar(tip, upper * 0.3, -b.down),
            polar(tip, upper * 0.45, -90 - b.down),
            lerp(h, tip, 0.5),
            h,
          ],
          0.7,
        ),
        inked(b.colour, BEAK_LINE),
      );
    case 'hooked':
      return path(
        blob(
          [
            back,
            polar(lerp(back, tip, 0.55), upper * 0.35, 90 - b.down),
            polar(tip, upper * 0.2, 180 - b.down),
            polar(tip, upper * 0.9, -90 - b.down),
            lerp(h, tip, 0.45),
            h,
          ],
          0.75,
        ),
        inked(b.colour, BEAK_LINE),
      );
    default:
      return path(
        `M${pt(back)} Q${pt(polar(lerp(back, tip, 0.5), upper * 0.3, 90 - b.down))} ${pt(tip)} L${pt(h)} Z`,
        inked(b.colour, BEAK_LINE),
      );
  }
}

/** A fish's shape. */
function fish(spec: AnimalSpec, look: Look): Built {
  const k = animalTall(spec) / SPECIES.fish.tall;
  const g = BUILD_GIRTH[spec.build];
  const h = 26 * k * g;
  const w = 40 * k;
  const lift = 6 * k;
  const B: P = [2 * k, -(lift + h / 2)];
  const bodyPts: P[] = [
    add(B, [w * 0.5, 0]),
    add(B, [w * 0.34, -h * 0.42]),
    add(B, [0, -h * 0.5]),
    add(B, [-w * 0.34, -h * 0.34]),
    add(B, [-w * 0.5, 0]),
    add(B, [-w * 0.34, h * 0.34]),
    add(B, [0, h * 0.5]),
    add(B, [w * 0.34, h * 0.4]),
  ];
  const tailBase = add(B, [-w * 0.44, 0]);
  // Its fins long and flowing: the tail's two lobes, the fin along its back.
  const tail = path(
    blob(
      [
        add(tailBase, [4, 0]),
        add(tailBase, [-w * 0.2, -h * 0.42]),
        add(tailBase, [-w * 0.46, -h * 0.62]),
        add(tailBase, [-w * 0.36, -h * 0.1]),
        add(tailBase, [-w * 0.3, 0]),
        add(tailBase, [-w * 0.36, h * 0.1]),
        add(tailBase, [-w * 0.46, h * 0.62]),
        add(tailBase, [-w * 0.2, h * 0.42]),
      ],
      0.75,
    ),
    inked(shade(look.coat, 0.88)),
  );
  const dorsal = path(
    blob(
      [
        add(B, [w * 0.2, -h * 0.44]),
        add(B, [w * 0.02, -h * 0.9]),
        add(B, [-w * 0.3, -h * 0.84]),
        add(B, [-w * 0.34, -h * 0.34]),
      ],
      0.8,
    ),
    inked(shade(look.coat, 0.88)),
  );
  const finAt = add(B, [w * 0.04, h * 0.12]);
  const fin = pivoted(
    'rig-flap',
    finAt,
    path(
      blob(
        [
          finAt,
          add(finAt, [-w * 0.3, h * 0.05]),
          add(finAt, [-w * 0.28, h * 0.32]),
          add(finAt, [-w * 0.08, h * 0.26]),
        ],
        0.7,
      ),
      inked(shade(look.coat, 0.82)),
    ),
  );
  const clip = `${look.id}-fish`;
  const stripes =
    look.pattern === 'stripes'
      ? `<g clip-path="url(#${clip})">${[0.02, -0.26].map((t) => path(blob([add(B, [w * t - 3, -h]), add(B, [w * t + 3, -h]), add(B, [w * t + 4, h]), add(B, [w * t - 4, h])], 0.6), `fill="${look.second}" stroke-width="2"`)).join('')}</g>`
      : look.pattern === 'spots' || look.pattern === 'patches'
        ? `<g clip-path="url(#${clip})">${[
            [-0.1, -0.2],
            [-0.25, 0.1],
            [0.05, 0.15],
          ]
            .map(([x, y]) =>
              circle(add(B, [w * x, h * y]), h * 0.1, flat(look.second)),
            )
            .join('')}</g>`
        : look.pattern === 'belly'
          ? `<g clip-path="url(#${clip})">${ellipse(add(B, [0, h * 0.42]), w * 0.5, h * 0.3, flat(look.second))}</g>`
          : '';
  const bodyMarkup =
    `<defs><clipPath id="${clip}"><path d="${blob(bodyPts)}"/></clipPath></defs>` +
    `<g class="rig-breathe">${pivoted('rig-tail', tailBase, tail)}${dorsal}</g>` +
    `<g class="rig-breathe" id="body">${path(blob(bodyPts), inked(look.coat))}${stripes}${fin}</g>`;
  const faceAt = add(B, [w * 0.22, -h * 0.12]);
  return {
    plan: 'fish',
    poses: { stand: `<g id="legs"></g>${bodyMarkup}` },
    headAt: { stand: { by: [0, 0], turn: 0 } },
    head: headWear(look, add(B, [w * 0.18, -h * 0.46]), h * 0.5),
    neck: null,
    dip: 0,
    face: {
      at: faceAt,
      s: 0.32 * k,
      skin: look.coat,
      eyeLine: eyeLineOf(0.32 * k),
      dx: 13,
    },
    // Its lips on its front, big enough to read talking.
    mouth: {
      at: add(B, [w * 0.4, h * 0.12]),
      s: 0.46 * k,
      kind: 'fish',
      wide: 1,
    },
    bounds: {
      left: tailBase[0] - w * 0.4,
      right: B[0] + w * 0.55,
      top: B[1] - h * 0.85 - (spec.wear.head ? h * 0.6 : 0),
    },
    anchors: { head: faceAt, body: B, legs: [B[0], -lift / 2] },
    legs: [],
    tail: tailBase,
    ears: [],
    arms: [],
    wings: [finAt],
    gait: 'swim',
    sink: 0,
  };
}

/** A snake: coiled on the ground, its neck raised and its head up. */
function snake(spec: AnimalSpec, look: Look): Built {
  const k = animalTall(spec) / SPECIES.snake.tall;
  const g = BUILD_GIRTH[spec.build];
  const t = 9 * k * g;
  const coil = (cx: number, cy: number, rx: number, ry: number) =>
    ellipse([cx, cy], rx, ry, inked(look.coat));
  // Its lowest coil's bottom on the ground.
  const low = -t * 0.95;
  const lowCoils = [
    coil(0, low, 26 * k, t * 0.95),
    coil(-2 * k, -t * 2.2, 20 * k, t * 0.95),
  ];
  const H: P = [16 * k, -36 * k];
  const neckPts: P[] = [
    [8 * k, -t * 2.6],
    [16 * k, -t * 3.2],
    [10 * k, -28 * k],
    [H[0] - 2 * k, H[1] + 4 * k],
  ];
  const neck = limb(curve(neckPts), look.coat, t * 1.05);
  const clip = `${look.id}-snake`;
  const spots =
    look.pattern !== 'plain'
      ? [-18, -6, 6, 18]
          .map(
            (x, i) =>
              path(
                `M${pt([x * k, low - 3])} l3,3 l-3,3 l-3,-3 Z`,
                flat(look.second),
              ) +
              (i < 3
                ? path(
                    `M${pt([x * k + 2, -t * 2.2 - 3])} l3,3 l-3,3 l-3,-3 Z`,
                    flat(look.second),
                  )
                : ''),
          )
          .join('')
      : '';
  const tail = pivoted(
    'rig-tail',
    [-24 * k, -t * 0.7],
    limb(
      curve([
        [-24 * k, -t * 0.7],
        [-32 * k, -t * 0.4],
        [-40 * k, -t * 0.9],
      ]),
      look.coat,
      t * 0.5,
    ),
  );
  const r = 9 * k;
  const head = path(
    blob(ellipsePoints(H, r * 1.35, r * 0.95, 8, 8)),
    inked(look.coat),
  );
  const stand =
    `<g id="legs"></g><g class="rig-breathe">${tail}</g>` +
    `<g class="rig-breathe" id="body">${lowCoils.join('')}<g clip-path="url(#${clip})">${spots}</g>${pivoted('rig-head', neckPts[0], neck)}</g>`;
  // Stretched out along the ground, lying on it and not in it.
  const onGround = -(t / 2 + LINE / 2);
  const lying = `<g id="legs-lie"></g><g class="rig-breathe">${limb(
    curve([
      [-40 * k, onGround],
      [-20 * k, onGround - t * 0.15],
      [0, onGround],
      [H[0] - 8 * k, onGround - t * 0.05],
    ]),
    look.coat,
    t,
  )}</g>`;
  return {
    plan: 'long',
    poses: {
      stand: `<defs><clipPath id="${clip}">${ellipse([0, low], 26 * k, t * 0.95, '')}${ellipse([-2 * k, -t * 2.2], 20 * k, t * 0.95, '')}</clipPath></defs>${stand}`,
      lie: lying,
    },
    headAt: {
      stand: { by: [0, 0], turn: 0 },
      lie: { by: [-4 * k, 36 * k - t * 1.4], turn: 0 },
      sit: { by: [0, 0], turn: 0 },
    },
    head: head + headWear(look, add(H, [0, -r * 0.9]), r * 1.1),
    neck: neckPts[2],
    dip: 25,
    face: {
      at: add(H, [r * 0.1, -r * 0.25]),
      s: 0.3 * k,
      skin: look.coat,
      eyeLine: eyeLineOf(0.3 * k),
      dx: 13,
    },
    mouth: {
      at: add(H, [r * 0.7, r * 0.45]),
      s: 0.28 * k,
      kind: 'muzzle',
      wide: 1.4,
    },
    bounds: {
      left: -42 * k - t,
      right: H[0] + r * 1.5,
      top: H[1] - r * 1.2 - (spec.wear.head ? r * 1.3 : 0),
    },
    anchors: { head: H, body: [0, -t * 1.5], legs: [0, -t / 2] },
    legs: [],
    tail: [-24 * k, -t * 0.7],
    ears: [],
    arms: [],
    wings: [],
    gait: 'slither',
    sink: 36 * k - t * 1.4,
  };
}

/** A rabbit sitting up, or a frog squatting: big back legs, small front ones. */
function hopper(spec: AnimalSpec, look: Look): Built {
  const frog = spec.species === 'frog';
  const k = animalTall(spec) / SPECIES[spec.species].tall;
  const g = BUILD_GIRTH[spec.build];
  const coat = look.coat;
  const parts: string[] = [];
  let H: P;
  let r: number;
  let face: Built['face'];
  let mouth: Built['mouth'];
  let tailAt: P | null = null;
  const ears: P[] = [];
  const headParts: string[] = [];
  let neck: P;
  let hips: P[] = [];
  if (frog) {
    const B: P = [0, -12 * k * g];
    const body = blob(ellipsePoints(B, 17 * k, 11 * k * g, -12, 8));
    const thigh = ellipse(
      add(B, [-8 * k, 3 * k]),
      11 * k,
      6.5 * k,
      inked(shade(coat, 0.9)),
      -30,
    );
    const foot = path(
      blob(
        // Its sole flat on the ground, its toes forward.
        [
          [-13 * k, -3.6 * k],
          [2 * k, -3.8 * k],
          [6.5 * k, -1.4 * k],
          [2 * k, -0.3],
          [-13 * k, -0.3],
        ] as P[],
        0.8,
      ),
      inked(shade(coat, 0.9)),
    );
    const arm =
      limb(
        poly([add(B, [9 * k, 2 * k]), [13 * k, -(1.8 * k + LINE / 2)]]),
        coat,
        3.6 * k,
      ) + ellipse([14.5 * k, -1.8 * k], 3.2 * k, 1.8 * k, inked(coat));
    hips = [add(B, [-9 * k, 3 * k]), add(B, [9 * k, 2 * k])];
    H = add(B, [9 * k, -8 * k]);
    r = 10 * k;
    const belly =
      look.pattern === 'belly'
        ? `<g clip-path="url(#${look.id}-frog)">${ellipse(add(B, [4 * k, 6.5 * k]), 14 * k, 6 * k, flat(look.second))}</g>`
        : '';
    // Its body, then its legs over it: a frog's thigh lies along its side
    // and its hand is flat on the ground before it.
    parts.push(
      `<defs><clipPath id="${look.id}-frog"><path d="${body}"/></clipPath></defs>`,
      `<g class="rig-breathe" id="body">${path(body, inked(coat))}${belly}</g>`,
      `<g id="legs" class="rig-legs">${pivoted('rig-leg rig-leg-a', hips[0], thigh + foot)}${pivoted('rig-leg rig-leg-b', hips[1], arm)}</g>`,
    );
    // Eyes on top of the head, on their bumps.
    for (const side of [-1, 1])
      headParts.push(
        circle(
          add(H, [side * 5.5 * k + 1.5 * k, -r * 0.62]),
          6 * k,
          inked(coat),
        ),
      );
    headParts.push(
      path(
        blob(ellipsePoints(add(H, [2 * k, 0]), r * 1.1, r * 0.72, 0, 8)),
        inked(coat),
      ),
    );
    face = {
      at: add(H, [1.5 * k, -r * 0.62]),
      s: 0.28 * k,
      skin: coat,
      eyeLine: eyeLineOf(0.28 * k),
      dx: 21,
    };
    mouth = {
      at: add(H, [r * 0.55, r * 0.28]),
      s: 0.2 * k,
      kind: 'muzzle',
      wide: 2.2,
    };
    neck = add(H, [-r * 0.6, r * 0.5]);
  } else {
    // A rabbit, sitting up on its haunches.
    const B: P = [-2 * k, -15 * k * g];
    const body = blob([
      add(B, [9 * k, -12 * k]),
      add(B, [12 * k, 2 * k]),
      add(B, [6 * k, 13 * k]),
      add(B, [-10 * k, 13 * k]),
      add(B, [-15 * k, 2 * k]),
      add(B, [-6 * k, -12 * k]),
    ]);
    const haunch = ellipse(
      add(B, [-5 * k, 6 * k]),
      10 * k,
      8.5 * k,
      inked(coat),
      -10,
    );
    // The long hind foot flat on the ground, and the front paws down
    // before it, apart from it.
    const foot = ellipse([-7.5 * k, -3 * k], 8 * k, 3 * k, inked(coat));
    const paws = [add(B, [12.5 * k, 1 * k]), add(B, [10 * k, 3 * k])].map(
      (p, i) =>
        pivoted(
          `rig-leg rig-leg-${i ? 'a' : 'b'}`,
          p,
          limb(
            poly([p, [p[0] + 1 * k, -(1.8 * k + LINE / 2)]]),
            i ? shade(coat, 0.85) : coat,
            3.6 * k,
          ),
        ),
    );
    hips = [add(B, [-5 * k, 7 * k]), add(B, [12.5 * k, 1 * k])];
    tailAt = add(B, [-14 * k, 6 * k]);
    const tail =
      look.tail === 'none'
        ? ''
        : pivoted(
            'rig-tail',
            tailAt,
            circle(
              add(tailAt, [-2 * k, 0]),
              5 * k,
              inked(look.spec.second ? look.second : '#f7f4ee'),
            ),
          );
    H = add(B, [5 * k, -21 * k]);
    // A head big enough that the kit's eyes leave its face round them.
    r = 11.5 * k;
    const belly =
      look.pattern === 'belly'
        ? `<g clip-path="url(#${look.id}-rabbit)">${ellipse(add(B, [8 * k, 5 * k]), 7 * k, 10 * k, flat(look.second))}</g>`
        : '';
    parts.push(
      `<defs><clipPath id="${look.id}-rabbit"><path d="${body}"/></clipPath></defs>`,
      `<g class="rig-breathe">${tail}</g>`,
      `<g id="legs" class="rig-legs">${paws[1]}${foot}</g>`,
      `<g class="rig-breathe" id="body">${path(body, inked(coat))}${belly}${haunch}</g>`,
      `<g class="rig-legs">${paws[0]}</g>`,
    );
    const earKind = look.ears ?? 'long';
    // Ears standing up behind the head; a lop's near ear hangs over it.
    const over: string[] = [];
    for (const [dx, lean, near] of [
      [-3.5, 12, true],
      [3, -6, false],
    ] as [number, number, boolean][]) {
      const at = add(H, [dx * k, -r * 0.75]);
      ears.push(at);
      (near && earKind === 'floppy' ? over : headParts).push(
        pivoted(
          near ? 'rig-ear' : 'rig-ear rig-ear-r',
          at,
          earOf(earKind, at, 8.5 * k, lean, look, near),
        ),
      );
    }
    headParts.push(
      path(blob(ellipsePoints(H, r * 1.05, r, 0, 8)), inked(coat)),
      ...over,
    );
    const lobe = 3 * k;
    const m = add(H, [r * 0.3, r * 0.42]);
    headParts.push(
      circle(add(m, [-lobe * 0.8, 0]), lobe, inked(look.muzzle)),
      circle(add(m, [lobe * 0.8, 0]), lobe, inked(look.muzzle)),
      path(
        `M${pt(add(m, [-lobe * 0.7, -lobe * 0.95]))} L${pt(add(m, [lobe * 0.7, -lobe * 0.95]))} L${pt(add(m, [0, -lobe * 0.2]))} Z`,
        inked(PINK, 1.6),
      ),
    );
    face = {
      at: add(H, [r * 0.12, -r * 0.16]),
      s: 0.24 * k,
      skin: coat,
      eyeLine: eyeLineOf(0.24 * k),
      // Apart, not run together into a mask.
      dx: 21,
    };
    mouth = {
      at: add(m, [0, lobe * 1.2]),
      s: 0.26 * k,
      kind: 'muzzle',
      wide: 1,
    };
    neck = add(H, [-r * 0.2, r * 0.9]);
  }
  headParts.push(headWear(look, add(H, [0, -r * (frog ? 1.1 : 0.95)]), r));
  // What is worn round the neck, just below the head, first in its group.
  headParts.unshift(
    neckWearBelow(
      look,
      frog
        ? ellipsePoints(add(H, [2 * k, 0]), r * 1.1, r * 0.72, 0, 16)
        : ellipsePoints(H, r * 1.05, r, 0, 16),
      H,
      neck,
      r * (frog ? 1.2 : 1),
      r,
    ),
  );
  // It sits as it stands: a rabbit, a frog, told to lie down, sits.
  const stand = parts.join('');
  return {
    plan: 'hopper',
    poses: { stand },
    headAt: { stand: { by: [0, 0], turn: 0 } },
    head: headParts.join(''),
    neck,
    dip: 20,
    face,
    mouth,
    bounds: {
      left: frog ? -20 * k : -21 * k,
      right: frog ? 24 * k : 18 * k,
      top: H[1] - r * (frog ? 1.3 : 3.3) - (spec.wear.head ? r : 0),
    },
    anchors: { head: H, body: [0, -12 * k], legs: [0, -3 * k] },
    legs: hips.map((hip, i) => ({
      hip,
      foot: [hip[0], -1] as P,
      step: i ? 'b' : 'a',
    })),
    tail: tailAt,
    ears,
    arms: [],
    wings: [],
    gait: 'hop',
    sink: 0,
  };
}

/** A monkey, standing on two legs, its arms free. */
function climber(spec: AnimalSpec, look: Look): Built {
  const k = animalTall(spec) / SPECIES.monkey.tall;
  const g = BUILD_GIRTH[spec.build];
  const coat = look.coat;
  const face = look.spec.second ? look.second : shade(coat, 1.45);
  const legLen = 20 * k;
  const B: P = [0, -(legLen + 17 * k)];
  const bodyPts = ellipsePoints(B, 13 * k * g, 19 * k, 8, 8);
  const hipL: P = add(B, [-5 * k, 13 * k]);
  const hipR: P = add(B, [5 * k, 13 * k]);
  const legW = 6.5 * k;
  // Each leg ends inside its foot, and the foot's bottom is on the ground.
  const legOfMonkey = (hip: P, near: boolean, step: 'a' | 'b') =>
    pivoted(
      `rig-leg rig-leg-${step}`,
      hip,
      limb(
        poly([
          hip,
          add(hip, [2 * k, legLen * 0.55]),
          [hip[0] + 1 * k, -(legW / 2 + LINE / 2)],
        ]),
        near ? coat : look.far,
        legW,
      ) +
        ellipse(
          [hip[0] + 3.5 * k, -2.4 * k],
          5 * k,
          2.4 * k,
          inked(near ? face : shade(face, 0.85)),
        ),
    );
  const shoulderR: P = add(B, [6 * k, -12 * k]);
  const shoulderL: P = add(B, [-6 * k, -12 * k]);
  const armOf = (s: P, side: 'r' | 'l', near: boolean) =>
    pivoted(
      `rig-arm rig-arm-${side}`,
      s,
      limb(
        poly([
          s,
          add(s, [side === 'r' ? 4 * k : -4 * k, 13 * k]),
          add(s, [side === 'r' ? 5 * k : -3 * k, 26 * k]),
        ]),
        near ? coat : look.far,
        5.6 * k,
      ) +
        circle(
          add(s, [side === 'r' ? 5 * k : -3 * k, 27 * k]),
          3.8 * k,
          inked(near ? face : shade(face, 0.85)),
        ),
    );
  const tailAt: P = add(B, [-11 * k, 10 * k]);
  const tail =
    look.tail === 'none'
      ? ''
      : pivoted(
          'rig-tail',
          tailAt,
          limb(
            curve([
              tailAt,
              add(tailAt, [-12 * k, 4 * k]),
              add(tailAt, [-20 * k, -8 * k]),
              add(tailAt, [-14 * k, -18 * k]),
              add(tailAt, [-8 * k, -13 * k]),
            ]),
            coat,
            4 * k,
          ),
        );
  const belly =
    look.pattern === 'belly'
      ? `<g clip-path="url(#${look.id}-monkey)">${ellipse(add(B, [3 * k, 4 * k]), 8 * k, 12 * k, flat(face))}</g>`
      : '';
  const H: P = add(B, [2 * k, -30 * k]);
  const r = 15 * k;
  const stand = [
    `<defs><clipPath id="${look.id}-monkey"><path d="${blob(bodyPts)}"/></clipPath></defs>`,
    `<g class="rig-breathe">${tail}${armOf(shoulderL, 'l', false)}</g>`,
    `<g id="legs" class="rig-legs">${legOfMonkey(hipL, false, 'b')}${legOfMonkey(hipR, true, 'a')}</g>`,
    `<g class="rig-breathe" id="body">${path(blob(bodyPts), inked(coat))}${belly}</g>`,
    `<g class="rig-breathe">${armOf(shoulderR, 'r', true)}</g>`,
  ].join('');
  // Sitting: on the ground, its legs out before it.
  const seat = legLen - 2;
  const sit = [
    `<g class="rig-breathe">${placed(tail, [0, seat])}${placed(armOf(shoulderL, 'l', false), [0, seat])}</g>`,
    `<g id="legs-sit" class="rig-legs">${[hipL, hipR].map((hip, i) => limb(poly([add(hip, [0, seat]), [hip[0] + 12 * k, -(legW / 2 + LINE / 2)]]), i ? coat : look.far, legW) + ellipse([hip[0] + 14 * k, -4.4 * k], 2.6 * k, 4.4 * k, inked(face))).join('')}</g>`,
    `<g class="rig-breathe" id="body-sit">${placed(path(blob(bodyPts), inked(coat)) + belly, [0, seat])}</g>`,
    `<g class="rig-breathe">${placed(armOf(shoulderR, 'r', true), [0, seat])}</g>`,
  ].join('');
  // The head: round ears on its sides, its pale face, its muzzle.
  const ears: P[] = [
    add(H, [-r * 0.95, -r * 0.05]),
    add(H, [r * 0.8, -r * 0.1]),
  ];
  const headParts = [
    neckWearBelow(
      look,
      ellipsePoints(H, r, r * 0.95, 0, 16),
      H,
      add(H, [0, r * 2]),
      r * 0.8,
      r,
    ),
    pivoted(
      'rig-ear',
      ears[0],
      circle(ears[0], r * 0.36, inked(coat)) +
        circle(ears[0], r * 0.2, flat(face)),
    ),
    pivoted(
      'rig-ear rig-ear-r',
      ears[1],
      circle(ears[1], r * 0.32, inked(look.far)) +
        circle(ears[1], r * 0.18, flat(face)),
    ),
    path(blob(ellipsePoints(H, r, r * 0.95, 0, 8)), inked(coat)),
    path(
      blob(
        [
          add(H, [-r * 0.7, -r * 0.4]),
          add(H, [0, -r * 0.68]),
          add(H, [r * 0.78, -r * 0.34]),
          add(H, [r * 0.74, r * 0.45]),
          add(H, [0, r * 0.84]),
          add(H, [-r * 0.66, r * 0.42]),
        ],
        0.9,
      ),
      inked(face),
    ),
    ellipse(
      add(H, [r * 0.08, r * 0.42]),
      r * 0.42,
      r * 0.28,
      inked(shade(face, 1.12)),
    ),
    ellipse(add(H, [r * 0.02, r * 0.28]), r * 0.05, r * 0.04, flat(NOSE)),
    ellipse(add(H, [r * 0.18, r * 0.28]), r * 0.05, r * 0.04, flat(NOSE)),
    headWear(look, add(H, [0, -r * 0.92]), r),
  ];
  return {
    plan: 'climber',
    poses: { stand: stand, sit, lie: sit, curl: sit },
    headAt: {
      stand: { by: [0, 0], turn: 0 },
      sit: { by: [0, seat], turn: 0 },
      lie: { by: [0, seat], turn: 10 },
      curl: { by: [0, seat], turn: 16 },
    },
    head: headParts.join(''),
    neck: add(H, [0, r * 0.9]),
    dip: 22,
    // Eyes a little smaller than its pale face, so the face shows round
    // them.
    face: {
      at: add(H, [r * 0.05, -r * 0.14]),
      s: 0.28 * k,
      skin: face,
      eyeLine: eyeLineOf(0.28 * k),
      dx: 14.5,
    },
    mouth: {
      at: add(H, [r * 0.1, r * 0.55]),
      s: 0.3 * k,
      kind: 'muzzle',
      wide: 1,
    },
    bounds: {
      left: tailAt[0] - 24 * k,
      right: H[0] + r * 1.3,
      top: H[1] - r * 1.05 - (spec.wear.head ? r : 0),
    },
    anchors: { head: H, body: B, legs: [0, -legLen / 2] },
    legs: [
      { hip: hipR, foot: [hipR[0] + 1 * k, -2 * k], step: 'a' },
      { hip: hipL, foot: [hipL[0] + 1 * k, -2 * k], step: 'b' },
    ],
    tail: look.tail === 'none' ? null : tailAt,
    ears,
    arms: [shoulderR, shoulderL],
    wings: [],
    gait: 'walk',
    sink: seat,
  };
}

/** An animal's body by its plan: the four-legged plan draws the lizard, the crocodile and the turtle too. */
export function buildAnimal(spec: AnimalSpec, look: Look): Built {
  if (QUADS[spec.species]) return quadruped(spec, look);
  if (BIRDS[spec.species]) return bird(spec, look);
  switch (spec.species) {
    case 'fish':
      return fish(spec, look);
    case 'snake':
      return snake(spec, look);
    case 'rabbit':
    case 'frog':
      return hopper(spec, look);
    default:
      return climber(spec, look);
  }
}
