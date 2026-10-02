/**
 * The kit's rig format (explainer-animation-plan §7.1; tech §4.2). A kit
 * piece is one SVG drawing with named parts (`data-part`), each part's box
 * and pivot, the states it can be posed in, the moves it can make, the
 * box the camera frames, and the colours it wears. The stage turns parts
 * about their pivots; nothing in a piece moves by itself.
 *
 * Every figure in the kit, a silhouette of the editorial look or a
 * character of the illustrated one, is built to one standard, so the
 * stage's moves (a walk, a point, a wave, sitting down) work on any of
 * them from its parts alone:
 *
 *  - its parts are named as FIGURE_PARTS names them, `-l` the near side
 *    in a profile (drawn over the body) and `-r` the far side; in a group
 *    each figure's parts carry its prefix ("f2.thigh-l");
 *  - each part is a group nested in its parent's (FIGURE_PARENT), so a
 *    shin turned at the knee goes with the thigh turned at the hip; the
 *    torso and the head turn alone, and the body (the root, at the hips)
 *    carries everything;
 *  - each part turns about its joint (FIGURE_PIVOT), its pivot given as
 *    fractions of its own box; groups carry no transform of their own,
 *    so every box and pivot is in the piece's units as drawn;
 *  - the rig lists its figures, each with the way it faces as drawn.
 *
 * A piece's units are centimetres (UNITS_PER_METRE), its feet or wheels
 * on the bottom of its box, so pieces stand at their real sizes beside
 * each other: a person beside a bus, a crowd before a train.
 */
import type {
  ShotBox,
  ShotPartDto,
  ShotRigDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { type Pt, add, boxOf, dist, n1, sub, turn, unionBox } from './shape';

/** A piece's units: a hundred to the metre. */
export const UNITS_PER_METRE = 100;

/** A kit piece: what a generator makes and the stage plays (toAsset). */
export interface KitPiece {
  /** The kit id it was made from, with what made it different ("people.group:walking:5"). */
  id: string;
  /** The drawing: a viewBox of `box`, every addressable part with data-part. */
  svg: string;
  parts: Record<string, ShotPartDto>;
  rig: ShotRigDto;
  /** What the camera frames by default: the people, the vehicle's body. */
  focal: ShotBox;
  /** Its viewBox, its feet (or wheels, or keel) on the bottom edge. */
  box: ShotBox;
  /** The colours it wears, by role or side name ("side", "ink"), for the look's checks. */
  colours: string[];
  /** Notes for the build's log: what it shows and how it counts ("1 figure = 100 people"). */
  notes?: string[];
}

/** A piece as the stage takes it. */
export function toAsset(piece: KitPiece): ShotSvgAssetDto {
  return {
    kind: 'svg',
    svg: piece.svg,
    box: piece.box,
    parts: piece.parts,
    rig: piece.rig,
    focal: piece.focal,
  };
}

// ── The figure standard ───────────────────────────────────────────────────

export const FIGURE_PARTS = [
  'body',
  'torso',
  'head',
  'arm-l',
  'forearm-l',
  'hand-l',
  'arm-r',
  'forearm-r',
  'hand-r',
  'thigh-l',
  'shin-l',
  'foot-l',
  'thigh-r',
  'shin-r',
  'foot-r',
] as const;
export type FigurePart = (typeof FIGURE_PARTS)[number];

/** Each part's parent in the drawing: a part turns with it. The body is the root. */
export const FIGURE_PARENT: Readonly<Record<FigurePart, FigurePart | null>> = {
  body: null,
  torso: 'body',
  head: 'body',
  'arm-l': 'body',
  'forearm-l': 'arm-l',
  'hand-l': 'forearm-l',
  'arm-r': 'body',
  'forearm-r': 'arm-r',
  'hand-r': 'forearm-r',
  'thigh-l': 'body',
  'shin-l': 'thigh-l',
  'foot-l': 'shin-l',
  'thigh-r': 'body',
  'shin-r': 'thigh-r',
  'foot-r': 'shin-r',
};

export const JOINTS = [
  'hip',
  'neck',
  'crown',
  'shoulder-l',
  'elbow-l',
  'wrist-l',
  'fingers-l',
  'shoulder-r',
  'elbow-r',
  'wrist-r',
  'fingers-r',
  'hip-l',
  'knee-l',
  'ankle-l',
  'heel-l',
  'toe-l',
  'hip-r',
  'knee-r',
  'ankle-r',
  'heel-r',
  'toe-r',
] as const;
export type Joint = (typeof JOINTS)[number];
export type Joints = Record<Joint, Pt>;

/** The joint each part turns about. */
export const FIGURE_PIVOT: Readonly<Record<FigurePart, Joint>> = {
  body: 'hip',
  torso: 'hip',
  head: 'neck',
  'arm-l': 'shoulder-l',
  'forearm-l': 'elbow-l',
  'hand-l': 'wrist-l',
  'arm-r': 'shoulder-r',
  'forearm-r': 'elbow-r',
  'hand-r': 'wrist-r',
  'thigh-l': 'hip-l',
  'shin-l': 'knee-l',
  'foot-l': 'ankle-l',
  'thigh-r': 'hip-r',
  'shin-r': 'knee-r',
  'foot-r': 'ankle-r',
};

/**
 * How a pose moves the joints: each part carries the joints at its far
 * end, and turns them with every part below it. The torso carries the
 * neck and the shoulders here (a bow is drawn so), though in the drawing
 * the head and the arms hang from the body: the stage never bows a torso.
 */
const POSE_PARENT: Readonly<Record<FigurePart, FigurePart | null>> = {
  ...FIGURE_PARENT,
  head: 'torso',
  'arm-l': 'torso',
  'arm-r': 'torso',
};
const CARRIES: Readonly<Record<FigurePart, readonly Joint[]>> = {
  body: ['hip', 'hip-l', 'hip-r'],
  torso: ['neck', 'shoulder-l', 'shoulder-r'],
  head: ['crown'],
  'arm-l': ['elbow-l'],
  'forearm-l': ['wrist-l'],
  'hand-l': ['fingers-l'],
  'arm-r': ['elbow-r'],
  'forearm-r': ['wrist-r'],
  'hand-r': ['fingers-r'],
  'thigh-l': ['knee-l'],
  'shin-l': ['ankle-l'],
  'foot-l': ['heel-l', 'toe-l'],
  'thigh-r': ['knee-r'],
  'shin-r': ['ankle-r'],
  'foot-r': ['heel-r', 'toe-r'],
};

/** The order a profile's parts are painted in, back to front: the far limbs behind the body, the near ones over it. */
export const PROFILE_ORDER: readonly FigurePart[] = [
  'arm-r',
  'thigh-r',
  'torso',
  'head',
  'thigh-l',
  'arm-l',
];
/** And a figure facing the camera: legs, body, arms, head. */
export const FRONT_ORDER: readonly FigurePart[] = [
  'thigh-r',
  'thigh-l',
  'torso',
  'arm-r',
  'arm-l',
  'head',
];

/** How a grown-up figure is built: the kit's realistic proportions, varied by seed. */
export interface Build {
  /** Standing height, in units. */
  height: number;
  /** How many heads tall (about 7 for a grown-up drawn to read small, 6 for a child). */
  heads: number;
  /** Hip height as a share of height (about 0.52). */
  legs: number;
  /** Shoulder width as a share of height, seen from the front (about 0.25). */
  shoulders: number;
  /** Hip width as a share of height, seen from the front (about 0.19). */
  hips: number;
}

export const GROWN_UP: Build = {
  height: 172,
  heads: 7.2,
  legs: 0.52,
  shoulders: 0.25,
  hips: 0.19,
};

/**
 * A figure's joints standing at rest, its feet on y = 0 and its hips over
 * x = 0: in profile facing right (a mirror faces it left), or facing the
 * camera, its `-l` side on the viewer's right as a person's left is.
 */
export function standingJoints(build: Build, view: 'side' | 'front'): Joints {
  const H = build.height;
  const head = H / build.heads;
  const hipY = -build.legs * H;
  const ankleH = 0.085 * build.legs * H;
  const kneeY = -(ankleH + 0.5 * (build.legs * H - ankleH));
  // The shoulder joint sits an arm's thickness under the shoulder's top;
  // the neck's base is above it, between the shoulders.
  const shoulderY = -H + 1.5 * head;
  const neckY = shoulderY - 0.05 * H;
  // Arm segments as the hip height says, so a child's reach is a child's.
  const upper = 0.34 * build.legs * H;
  const fore = 0.27 * build.legs * H;
  const hand = 0.2 * build.legs * H;
  const side = (x: number, s: 'l' | 'r'): Partial<Joints> => {
    const out: Partial<Joints> = {};
    const sx = view === 'front' ? (s === 'l' ? x : -x) : 0;
    const shoulderX =
      view === 'front'
        ? (s === 'l' ? 1 : -1) * (build.shoulders * H * 0.5 - 0.035 * H)
        : s === 'l'
          ? 0.004 * H
          : -0.004 * H;
    const armOut = view === 'front' ? (s === 'l' ? 1 : -1) * 0.012 * H : 0;
    out[`shoulder-${s}`] = [shoulderX, shoulderY];
    out[`elbow-${s}`] = [shoulderX + armOut, shoulderY + upper];
    out[`wrist-${s}`] = [shoulderX + armOut * 1.6, shoulderY + upper + fore];
    out[`fingers-${s}`] = [
      shoulderX + armOut * 1.8,
      shoulderY + upper + fore + hand,
    ];
    const hx = view === 'front' ? sx : s === 'l' ? 0.006 * H : -0.006 * H;
    out[`hip-${s}`] = [hx, hipY];
    out[`knee-${s}`] = [hx + (view === 'side' ? 0.012 * H : 0), kneeY];
    out[`ankle-${s}`] = [hx, -ankleH];
    out[`heel-${s}`] = view === 'side' ? [hx - 0.03 * H, 0] : [hx, 0];
    out[`toe-${s}`] =
      view === 'side'
        ? [hx + 0.12 * H, 0]
        : [hx + (s === 'l' ? 0.012 : -0.012) * H, 0];
    return out;
  };
  return {
    hip: [0, hipY],
    neck: [view === 'side' ? 0.012 * H : 0, neckY],
    crown: [view === 'side' ? 0.012 * H : 0, -H],
    ...side(build.hips * H * 0.5 - 0.04 * H, 'l'),
    ...side(build.hips * H * 0.5 - 0.04 * H, 'r'),
  } as Joints;
}

/** A pose: each part's turn about its joint, in degrees, relative to its parent; and where the body's root goes. */
export interface Pose {
  turns?: Partial<Record<FigurePart, number>>;
  /** The whole figure moved (the hips lowered to sit): in units. */
  move?: Pt;
}

/**
 * The joints posed: each part turned about its joint by its turn
 * (clockwise on screen, as SVG turns), carrying every joint below it.
 */
export function posed(joints: Joints, pose: Pose): Joints {
  const out: Joints = { ...joints };
  const parentOf = POSE_PARENT;
  // Each part's total transform: turns about pivots, applied child-first to its own joints then up its chain.
  const carriedBy = (joint: Joint): FigurePart[] => {
    const owner = (Object.keys(CARRIES) as FigurePart[]).find((p) =>
      CARRIES[p].includes(joint),
    );
    const chain: FigurePart[] = [];
    for (let p: FigurePart | null = owner ?? null; p; p = parentOf[p])
      chain.push(p);
    return chain;
  };
  for (const joint of JOINTS) {
    let p = joints[joint];
    // From the part that carries it up to the root, each turn about that part's joint as it stood at rest,
    // composed outward: the innermost turn first, about its rest pivot, then its parent's, and so on.
    for (const part of carriedBy(joint)) {
      const deg = pose.turns?.[part] ?? 0;
      if (deg) p = turn(p, joints[FIGURE_PIVOT[part]], (deg * Math.PI) / 180);
    }
    if (pose.move) p = add(p, pose.move);
    out[joint] = p;
  }
  return out;
}

/** The joints mirrored about a vertical line: a profile turned to face the other way. */
export function mirrored(joints: Joints, x: number): Joints {
  const out = {} as Joints;
  for (const joint of JOINTS)
    out[joint] = [2 * x - joints[joint][0], joints[joint][1]];
  return out;
}

/**
 * Two segments reaching from `from` toward `to` (a thigh and a shin, an
 * arm and a forearm): where the middle joint goes, bent to the side
 * `bend` says (1 bends the knee forward of a figure facing right, a
 * clockwise turn from the line), as far as the lengths allow.
 */
export function reach(
  from: Pt,
  to: Pt,
  a: number,
  b: number,
  bend: 1 | -1,
): Pt {
  const d = Math.max(1e-6, Math.min(dist(from, to), a + b - 1e-6));
  const toward = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const cos = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const angle = toward - bend * Math.acos(cos);
  return [from[0] + a * Math.cos(angle), from[1] + a * Math.sin(angle)];
}

/** The turn (degrees, clockwise) that takes a segment from one direction to another. */
export function turnBetween(fromA: Pt, fromB: Pt, toA: Pt, toB: Pt): number {
  const a = Math.atan2(fromB[1] - fromA[1], fromB[0] - fromA[0]);
  const b = Math.atan2(toB[1] - toA[1], toB[0] - toA[0]);
  let deg = ((b - a) * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

// ── Putting a piece together ──────────────────────────────────────────────

/** One part as drawn, for assemble(). */
export interface RigPart {
  id: string;
  /** Its parent part's id; null for one at the root of the drawing. */
  parent: string | null;
  /** Its own drawing (its children are nested after it). Empty for a group that only holds others. */
  markup: string;
  /** The box of its own drawing; for an empty group, the box of all it holds. */
  box?: ShotBox;
  /** Where it turns, in the piece's units. */
  pivot: Pt;
  /** Attributes for its group beyond its data-part (a filter that lights it). */
  attrs?: string;
}

/**
 * Parts nested as their parents say, each a group with its data-part,
 * siblings painted in the order given; and each part's box and its pivot
 * as fractions of that box.
 */
export function assemble(parts: readonly RigPart[]): {
  markup: string;
  parts: Record<string, ShotPartDto>;
} {
  const children = new Map<string | null, RigPart[]>();
  for (const part of parts)
    children.set(part.parent, [...(children.get(part.parent) ?? []), part]);
  // How far a part reaches with everything it holds, and its own box: its
  // drawing's, or for an empty group (a body, a figure) all it holds.
  const reaches = new Map<string, ShotBox>();
  const extentOf = (part: RigPart): ShotBox => {
    const known = reaches.get(part.id);
    if (known) return known;
    const box = unionBox([
      ...(part.markup && part.box ? [part.box] : []),
      ...(children.get(part.id) ?? []).map(extentOf),
    ]);
    reaches.set(part.id, box);
    return box;
  };
  const boxOfPart = (part: RigPart): ShotBox =>
    part.markup && part.box ? part.box : extentOf(part);
  const dto: Record<string, ShotPartDto> = {};
  const draw = (part: RigPart): string => {
    const box = boxOfPart(part);
    const [bx, by, bw, bh] = box;
    const fx = bw > 0 ? (part.pivot[0] - bx) / bw : 0.5;
    const fy = bh > 0 ? (part.pivot[1] - by) / bh : 1;
    dto[part.id] = {
      box,
      pivot: [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000],
    };
    const inner = (children.get(part.id) ?? []).map(draw).join('');
    const attrs = part.attrs ? ` ${part.attrs}` : '';
    return `<g data-part="${part.id}"${attrs}>${part.markup}${inner}</g>`;
  };
  const markup = (children.get(null) ?? []).map(draw).join('');
  return { markup, parts: dto };
}

/** A figure's parts as a generator drew them: each one's own markup and box, at its posed joints. */
export type FigureDrawing = Partial<
  Record<FigurePart, { markup: string; box: ShotBox }>
>;

/** The chain each top part leads (an arm, its forearm, its hand). */
const CHAIN: Readonly<Record<string, readonly FigurePart[]>> = {
  'arm-l': ['arm-l', 'forearm-l', 'hand-l'],
  'arm-r': ['arm-r', 'forearm-r', 'hand-r'],
  'thigh-l': ['thigh-l', 'shin-l', 'foot-l'],
  'thigh-r': ['thigh-r', 'shin-r', 'foot-r'],
  torso: ['torso'],
  head: ['head'],
};

/**
 * A figure's parts to the standard, ready for assemble(): the body at
 * the root (under `parent`, a group's own part), each limb a chain of
 * nested parts, painted in the view's order, each turning about its
 * joint as the figure stands drawn. `extras` (a skirt, a lectern, a sign
 * in the near hand) go in under the part each names; `order`, when
 * given, is the body's children back to front, the view's parts by
 * their top part's name and extras by their ids among them (a skirt
 * between the near leg and the near arm). Extras it leaves out go last.
 */
export function figureParts(
  prefix: string,
  joints: Joints,
  drawing: FigureDrawing,
  view: 'side' | 'front',
  parent: string | null = null,
  extras: readonly RigPart[] = [],
  order: readonly string[] = view === 'front' ? FRONT_ORDER : PROFILE_ORDER,
): RigPart[] {
  const own = (part: FigurePart): RigPart => ({
    id: `${prefix}${part}`,
    parent:
      part === 'body' ? parent : `${prefix}${FIGURE_PARENT[part] ?? 'body'}`,
    markup: drawing[part]?.markup ?? '',
    ...(drawing[part]?.box ? { box: drawing[part].box } : {}),
    pivot: joints[FIGURE_PIVOT[part]],
  });
  const byId = new Map(extras.map((extra) => [extra.id, extra]));
  const placed = new Set<string>();
  const body = order.flatMap((top): RigPart[] => {
    if (CHAIN[top]) return CHAIN[top].map(own);
    const extra = byId.get(top) ?? byId.get(`${prefix}${top}`);
    if (!extra) return [];
    placed.add(extra.id);
    return [extra];
  });
  return [
    own('body'),
    ...body,
    ...extras.filter((extra) => !placed.has(extra.id)),
  ];
}

/** A piece's whole drawing: its viewBox and its markup. */
export const svgOf = (box: ShotBox, markup: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(n1).join(' ')}">${markup}</svg>`;

/** A box as a piece keeps it: whole numbers of a tenth. */
export const tidy = (box: ShotBox): ShotBox =>
  box.map((v) => Math.round(v * 10) / 10) as ShotBox;

/** The box round a figure's joints, for a quick frame of where it stands. */
export const jointsBox = (joints: Joints): ShotBox =>
  boxOf(JOINTS.map((j) => joints[j]));

// ── Checking a piece ──────────────────────────────────────────────────────

/**
 * Each data-part in a drawing and the part it is nested in (null at the
 * root), and any part named twice. The kit's own markup is regular (no
 * comments, no text that holds a "<"), so a tag scanner is enough.
 */
export function partTree(svg: string): {
  parent: Map<string, string | null>;
  twice: string[];
} {
  const parent = new Map<string, string | null>();
  const twice: string[] = [];
  const stack: (string | null)[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, , attrs, self] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const part = /\bdata-part="([^"]+)"/.exec(attrs)?.[1] ?? null;
    if (part) {
      if (parent.has(part)) twice.push(part);
      const above = [...stack].reverse().find((p) => p !== null) ?? null;
      parent.set(part, above);
    }
    if (!self) stack.push(part);
  }
  return { parent, twice };
}

/**
 * What is wrong with a piece, in plain words; nothing when it is sound:
 * every part it lists drawn once as a data-part, every pivot inside its
 * box, every part a state poses one it has, its box sound, and each of
 * its figures whole and nested to the standard.
 */
export function validateRig(piece: KitPiece): string[] {
  const problems: string[] = [];
  const say = (message: string) => problems.push(message);
  const [, , W, H] = piece.box;
  if (!(W > 0 && H > 0)) say(`its box ${piece.box.join(' ')} is empty`);
  if (!/^<svg[^>]*\bviewBox="/.test(piece.svg))
    say('its drawing has no viewBox');
  const { parent, twice } = partTree(piece.svg);
  for (const part of twice) say(`part "${part}" is drawn twice`);
  const reach = Math.max(W, H);
  for (const [id, part] of Object.entries(piece.parts)) {
    if (!parent.has(id)) say(`part "${id}" is listed but not drawn`);
    const [x, y, w, h] = part.box;
    if (!(w >= 0 && h >= 0)) say(`part "${id}" has a box with no size`);
    if (
      x < piece.box[0] - reach ||
      y < piece.box[1] - reach ||
      x + w > piece.box[0] + W + reach ||
      y + h > piece.box[1] + H + reach
    )
      say(`part "${id}" lies far outside the piece`);
    // A pivot on its box's edge may sit a hair outside it (a foot's line
    // under a rounded outline); one well outside is a broken part.
    if (part.pivot) {
      const [fx, fy] = part.pivot;
      if (!(fx >= -0.05 && fx <= 1.05 && fy >= -0.05 && fy <= 1.05))
        say(`part "${id}" turns about a point outside its box`);
    }
  }
  for (const id of parent.keys())
    if (!(id in piece.parts)) say(`part "${id}" is drawn but not listed`);
  for (const [state, poses] of Object.entries(piece.rig.states))
    for (const id of Object.keys(poses))
      if (!(id in piece.parts))
        say(`state "${state}" poses "${id}", which it does not have`);
  for (const figure of piece.rig.figures ?? []) {
    for (const part of FIGURE_PARTS) {
      const id = `${figure.prefix}${part}`;
      if (!(id in piece.parts)) {
        say(`figure "${figure.prefix || 'the figure'}" has no ${part}`);
        continue;
      }
      const up = FIGURE_PARENT[part];
      if (up && parent.get(id) !== `${figure.prefix}${up}`)
        say(`"${id}" is not nested in "${figure.prefix}${up}"`);
    }
  }
  for (const id of piece.rig.idle ?? [])
    if (!(id in piece.parts)) say(`idle part "${id}" is not a part`);
  if (piece.rig.vehicle)
    for (const [id, part] of Object.entries(piece.parts))
      if (/^(?:.*\.)?wheel-\d+$/.test(id) && !(part.value && part.value > 0))
        say(`wheel "${id}" has no radius`);
  if (!piece.rig.moves.length) say('it can make no moves');
  const [fx, fy, fw, fh] = piece.focal;
  if (!(fw > 0 && fh > 0)) say('its focal box is empty');
  if (
    fx < piece.box[0] - 1 ||
    fy < piece.box[1] - 1 ||
    fx + fw > piece.box[0] + W + 1 ||
    fy + fh > piece.box[1] + H + 1
  )
    say('its focal box is outside it');
  return problems;
}

/** A distance between two joints, for a segment's length. */
export const span = (joints: Joints, a: Joint, b: Joint): number =>
  dist(joints[a], joints[b]);

/** The vector from one joint to another. */
export const along = (joints: Joints, a: Joint, b: Joint): Pt =>
  sub(joints[b], joints[a]);
