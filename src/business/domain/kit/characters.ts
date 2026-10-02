/**
 * The illustrated look's characters (WP17; tech §11): era-dressed cartoon
 * people, after Richard's world-history reference, for a show whose look
 * is illustrated. The editorial look never gets them (registry looks).
 *
 *  - `character.person`: one character: their role, era and dress (the
 *    research's look notes in words), their expression, what they hold,
 *    their pose. A named person is a character with their name (`name`):
 *    labelled the first time they appear (shot-build), and drawn from
 *    their described likeness, never from a photograph.
 *  - `character.group`: two to six characters of one side, every one their
 *    own build, face, hair and colour (never clones), the side's colour on
 *    each as an accent (a tunic, a shield, a sash); standing together,
 *    cheering, or marching in step in profile.
 *  - `character.rider`: a character on a horse, in profile.
 *
 * Every character is drawn to the kit's figure standard (rig.ts) by
 * character-draw.ts and character-dress.ts, so the stage walks, points,
 * waves and turns it from its parts alone. Its face is a part of its own
 * (`face`), its other faces hidden beside it (`face-surprised`, …) for the
 * rig's states, so an expression changes at a word; what it holds is
 * `prop`, a shield `shield`, a hat `hat`.
 *
 * Weapons are worn as costume only: no one is ever drawn hurt. Dress
 * comes only from the words (wardrobe.ts): no region is anyone's default.
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import type { EraId } from './eras';
import type { KitEntry, KitParams } from './registry';
import {
  type FigurePart,
  type Joints,
  type KitPiece,
  type RigPart,
  JOINTS,
  assemble,
  figureParts,
  posed,
  svgOf,
} from './rig';
import { rand, subSeed, type Rand } from './seed';
import {
  type Pt,
  add,
  boxOf,
  capsule,
  circle,
  ellipse,
  groundShadow,
  lerp,
  rounded,
  scale,
  sub,
  unionBox,
} from './shape';
import { type KitStyle, colourOf, mixOk, shadeOk } from './style';
import {
  type Frame,
  type Hold,
  type Ink,
  type View,
  beardOf,
  drawn,
  faceFront,
  faceSide,
  frameOf,
  grounded,
  hairBehind,
  hairOn,
  hatOf,
  limb,
  painted,
  propShapes,
  reachArm,
  restJoints,
  shieldShape,
  stroked,
} from './character-draw';
import {
  bootShape,
  capeShape,
  footShape,
  legColours,
  shoulderPiece,
  skirtMarkup,
  sleeveColours,
  strapLines,
  torsoMarkup,
  torsoShape,
  wideSleeve,
} from './character-dress';
import {
  type Age,
  type BuildKind,
  type Expression,
  type FacialHair,
  type HairStyle,
  type Looks,
  type Outfit,
  AGES,
  BUILDS,
  CLOTH,
  EXPRESSIONS,
  HAIR_COLOURS,
  PROPS,
  ROLES,
  SKIN,
  ageOf,
  buildOf,
  eraParam,
  facialOf,
  glassesIn,
  hairOf,
  outfitOf,
  skinOf,
  womanIn,
} from './wardrobe';

// ── Poses ─────────────────────────────────────────────────────────────────

/** How a character stands or moves when the board names nothing more. */
export const CHARACTER_POSES = [
  'standing',
  'pointing',
  'waving',
  'cheering',
  'holding-up',
  'thinking',
  'hands-on-hips',
  'shrugging',
  'walking',
  'marching',
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

/** The poses drawn in profile; every other faces the camera. */
const SIDE_POSES = new Set<CharacterPose>(['walking', 'marching']);

/** A hand's shape: a round mitten, a pointing finger, open and waving, or a fist round something held. */
type HandKind = 'mitt' | 'point' | 'open' | 'fist';

interface Posing {
  turns: Partial<Record<FigurePart, number>>;
  /** Where a wrist reaches, in the figure's frame at rest (feet at 0). */
  reach?: Partial<Record<'l' | 'r', Pt>>;
  hands: Record<'l' | 'r', HandKind>;
  /** How the prop is held. */
  hold: Hold;
}

/** The arm that points or waves faces where the character looks; the other holds. */
const sideOfGaze = (gaze: number): 'l' | 'r' => (gaze >= 0 ? 'l' : 'r');

/** A march's stride at its phase (0 the near knee up, 0.5 the far), turns forward in degrees. */
export function marchTurns(
  phase: number,
  march: boolean,
): Partial<Record<FigurePart, number>> {
  const a = Math.sin(phase * 2 * Math.PI);
  const lift = march ? 34 : 24;
  const knee = (s: number) => Math.max(0, s) * (march ? 42 : 30);
  return {
    'thigh-l': lift * a,
    'shin-l': -knee(a),
    'thigh-r': -lift * a,
    'shin-r': -knee(-a),
    'arm-l': -18 * a,
    'forearm-l': 14,
    'arm-r': 18 * a,
    'forearm-r': 14,
  };
}

/** A pose's turns (degrees, clockwise on screen for the camera's view; forward for a profile), reaches and hands. */
function posingOf(
  pose: CharacterPose,
  f: Frame,
  gaze: number,
  phase: number,
): Posing {
  const g = sideOfGaze(gaze);
  const o: 'l' | 'r' = g === 'l' ? 'r' : 'l';
  const out = (s: 'l' | 'r', d: number) => (s === 'l' ? -d : d);
  const rest: Posing = {
    turns: {
      'arm-l': -7,
      'forearm-l': -4,
      'arm-r': 7,
      'forearm-r': 4,
    },
    hands: { l: 'mitt', r: 'mitt' },
    hold: 'upright',
  };
  switch (pose) {
    case 'pointing':
      return {
        turns: {
          ...rest.turns,
          [`arm-${g}`]: out(g, 98),
          [`forearm-${g}`]: out(g, 4),
        },
        hands: { [g]: 'point', [o]: 'mitt' } as Posing['hands'],
        hold: 'upright',
      };
    case 'waving':
      return {
        turns: {
          ...rest.turns,
          [`arm-${g}`]: out(g, 110),
          [`forearm-${g}`]: out(g, 55),
        },
        hands: { [g]: 'open', [o]: 'mitt' } as Posing['hands'],
        hold: 'upright',
      };
    case 'cheering':
      return {
        turns: {
          'arm-l': -148,
          'forearm-l': -20,
          'arm-r': 148,
          'forearm-r': 20,
        },
        hands: { l: 'fist', r: 'fist' },
        hold: 'raised',
      };
    case 'holding-up':
      return {
        turns: {
          ...rest.turns,
          [`arm-${o}`]: out(o, 160),
          [`forearm-${o}`]: out(o, 12),
        },
        hands: { [g]: 'mitt', [o]: 'fist' } as Posing['hands'],
        hold: 'raised',
      };
    case 'thinking':
      return {
        turns: rest.turns,
        reach: { [o]: [o === 'l' ? 7 : -7, f.chin + 9] },
        hands: { [g]: 'mitt', [o]: 'fist' } as Posing['hands'],
        hold: 'upright',
      };
    case 'hands-on-hips':
      return {
        turns: rest.turns,
        reach: {
          l: [f.waist + 1.5, (f.shoulderY + f.hipY) / 2 + 6],
          r: [-(f.waist + 1.5), (f.shoulderY + f.hipY) / 2 + 6],
        },
        hands: { l: 'fist', r: 'fist' },
        hold: 'down',
      };
    case 'shrugging':
      return {
        turns: {
          'arm-l': -30,
          'forearm-l': -62,
          'arm-r': 30,
          'forearm-r': 62,
        },
        hands: { l: 'open', r: 'open' },
        hold: 'upright',
      };
    case 'walking':
    case 'marching':
      return {
        turns: marchTurns(phase, pose === 'marching'),
        hands: { l: 'fist', r: 'fist' },
        hold: 'upright',
      };
    default:
      return rest;
  }
}

// ── A figure drawn ────────────────────────────────────────────────────────

/** Who a character is and how they are drawn. */
export interface CharacterSpec {
  looks: Looks;
  outfit: Outfit;
  pose: CharacterPose;
  expression: Expression;
  /** Other faces drawn hidden, for the rig's states. */
  faces: readonly Expression[];
  /** -1 looks to the left, 0 ahead, 1 to the right (the camera's view). */
  gaze: number;
  /** A walk's phase, for a figure drawn mid-stride. */
  phase: number;
}

/** Where a figure stands in its piece. */
interface Placing {
  at: Pt;
  /** In profile: 1 faces right, -1 left. Facing the camera: 0. */
  facing: 1 | -1 | 0;
  prefix: string;
  parent: string | null;
}

/** A figure drawn into a piece: its parts, its shadow and the box it covers. */
export interface DrawnCharacter {
  parts: RigPart[];
  shadow: string;
  box: ShotBox;
  joints: Joints;
  /** The head's box, for a speech bubble's tail and a label. */
  head: ShotBox;
  stands: Pt;
}

/** An affine map [a b c d e f], as SVG's matrix. */
type Mat = [number, number, number, number, number, number];

const matOf = (m: Mat): string =>
  `matrix(${m.map((v) => Math.round(v * 10000) / 10000).join(' ')})`;
const apply = (m: Mat, p: Pt): Pt => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
/** m after n: n applied first. */
const compose = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
/** The rigid map taking the segment ra→rb at rest to pa→pb posed. */
function carry(ra: Pt, rb: Pt, pa: Pt, pb: Pt): Mat {
  const angle =
    Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) -
    Math.atan2(rb[1] - ra[1], rb[0] - ra[0]);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c,
    s,
    -s,
    c,
    pa[0] - (c * ra[0] - s * ra[1]),
    pa[1] - (s * ra[0] + c * ra[1]),
  ];
}
const boxThrough = (m: Mat, box: ShotBox): ShotBox => {
  const [x, y, w, h] = box;
  return boxOf(
    (
      [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ] as Pt[]
    ).map((p) => apply(m, p)),
  );
};
/** A point kept inside a box. */
const within = (box: ShotBox, p: Pt): Pt => [
  Math.max(box[0], Math.min(box[0] + box[2], p[0])),
  Math.max(box[1], Math.min(box[1] + box[3], p[1])),
];
const grow = (box: ShotBox, m: number): ShotBox => [
  box[0] - m,
  box[1] - m,
  box[2] + 2 * m,
  box[3] + 2 * m,
];

/** A hand: a mitten, a fist, an open hand or a pointing finger, at the posed wrist. */
function handMarkup(
  kind: HandKind,
  wrist: Pt,
  fingers: Pt,
  f: Frame,
  skin: string,
  ink: Ink,
): { markup: string; box: ShotBox } {
  const r = f.arm * 1.12;
  const m = lerp(wrist, fingers, 0.42);
  const toward = sub(fingers, wrist);
  const len = Math.max(1e-6, Math.hypot(toward[0], toward[1]));
  const u: Pt = [toward[0] / len, toward[1] / len];
  if (kind === 'point') {
    const tip = add(m, scale(u, r * 2.1));
    const finger = capsule(add(m, scale(u, r * 0.5)), r * 0.34, tip, r * 0.3);
    const fist = circle(m, r);
    return {
      markup:
        painted(finger.d, { fill: skin }, ink) +
        painted(fist.d, { fill: skin }, ink),
      box: unionBox([finger.box, fist.box]),
    };
  }
  if (kind === 'open') {
    const palm = ellipse(
      add(m, scale(u, r * 0.2)),
      r * 1.15,
      r * 1.0,
      Math.atan2(u[1], u[0]),
    );
    const thumb = capsule(
      m,
      r * 0.32,
      add(m, add(scale(u, r * 0.2), [u[1] * r * 1.3, -u[0] * r * 1.3])),
      r * 0.3,
    );
    return {
      markup:
        painted(thumb.d, { fill: skin }, ink) +
        painted(palm.d, { fill: skin }, ink),
      box: unionBox([palm.box, thumb.box]),
    };
  }
  const c = circle(m, kind === 'fist' ? r * 0.98 : r);
  return { markup: painted(c.d, { fill: skin }, ink), box: c.box };
}

/**
 * One character drawn: posed, set on the ground, its limbs drawn between
 * its joints and its torso, skirt and head carried from their rest, its
 * prop in a fist, its shield on its arm; placed in its piece and mirrored
 * when it faces left.
 */
export function drawCharacter(
  spec: CharacterSpec,
  place: Placing,
  ink: Ink,
): DrawnCharacter {
  const { looks, outfit } = spec;
  const view: View = place.facing === 0 ? 'front' : 'side';
  const f = frameOf(looks);
  const rest = restJoints(f, view);
  const posing = posingOf(spec.pose, f, spec.gaze, spec.phase);
  // Profile turns are forward: a limb hanging down turns anticlockwise.
  const turns: Partial<Record<FigurePart, number>> = {};
  for (const [part, d] of Object.entries(posing.turns) as [
    FigurePart,
    number,
  ][])
    turns[part] =
      view === 'side' && part !== 'torso' && part !== 'head' ? -d : d;
  let joints = posed(rest, { turns });
  for (const s of ['l', 'r'] as const) {
    const target = posing.reach?.[s];
    if (target) joints = reachArm(rest, joints, s, target, view);
  }
  joints = grounded(joints);
  const flip = place.facing < 0 ? -1 : 1;
  const P: Mat = [flip, 0, 0, 1, place.at[0], place.at[1]];
  const put = (p: Pt): Pt => apply(P, p);
  const skin = looks.skin;
  const parts: Record<string, { markup: string; box: ShotBox }> = {};
  const rigid = (
    a: keyof Joints,
    b: keyof Joints,
    markup: string,
    box: ShotBox,
  ): { markup: string; box: ShotBox } => {
    const m = compose(P, carry(rest[a], rest[b], joints[a], joints[b]));
    return {
      markup: `<g transform="${matOf(m)}">${markup}</g>`,
      box: grow(boxThrough(m, box), f.line),
    };
  };
  const placed = (markup: string, box: ShotBox) => ({
    markup: `<g transform="${matOf(P)}">${markup}</g>`,
    box: grow(boxThrough(P, box), f.line),
  });

  // The torso and the skirt, carried with the hips and the neck.
  const torso = torsoShape(f, view);
  parts.torso = rigid(
    'hip',
    'neck',
    torsoMarkup(f, outfit, view, skin, ink),
    torso.box,
  );
  const skirt = skirtMarkup(f, outfit, view, ink);
  const extras: RigPart[] = [];
  const extraPart = (
    id: string,
    parent: string | null,
    made: { markup: string; box: ShotBox },
    pivot: Pt,
  ) =>
    extras.push({
      id: `${place.prefix}${id}`,
      parent: parent === null ? place.parent : `${place.prefix}${parent}`,
      markup: made.markup,
      box: made.box,
      // It turns about its joint, kept on its own box (a braid hangs beside the neck).
      pivot: within(made.box, put(pivot)),
    });
  if (skirt)
    extraPart(
      'skirt',
      'body',
      rigid('hip', 'neck', skirt.markup, skirt.shape.box),
      joints.hip,
    );
  if (outfit.cape) {
    const cape = capeShape(f, view);
    extraPart(
      'cape',
      'body',
      rigid(
        'hip',
        'neck',
        painted(cape.d, { fill: outfit.cape }, ink),
        cape.box,
      ),
      joints.neck,
    );
  }

  // The head: its middle and size at rest, everything on it, carried with the neck.
  const r = view === 'side' ? f.headW * 0.94 : f.headW;
  const h = f.head / 2;
  const c: Pt = [view === 'side' ? 2 : 0, f.cy];
  const hat = hatOf(outfit, c, r, h, view, f.chin, skin);
  const hairColour = looks.hairColour;
  const behind = hat?.hidesHair
    ? null
    : hairBehind(looks, c, r, h, view, f.chin);
  if (behind && looks.hair !== 'afro')
    extraPart(
      'hair-back',
      'body',
      rigid(
        'neck',
        'crown',
        painted(behind.d, { fill: hairColour }, ink),
        behind.box,
      ),
      joints.neck,
    );
  let head = '';
  const headBoxes: ShotBox[] = [];
  if (behind && looks.hair === 'afro') {
    head += painted(behind.d, { fill: hairColour }, ink);
    headBoxes.push(behind.box);
  }
  // A checked cloth: red checks woven over its white, as a pattern the cloth is filled with.
  const checks = hat?.checked ? ink.id() : null;
  const cloth = (p: { fill: string }) =>
    checks && p.fill === outfit.headColour
      ? { ...p, fill: `url(#${checks})` }
      : p;
  if (checks)
    head += `<defs><pattern id="${checks}" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${outfit.headColour}"/><path d="M0 1.75H7M0 5.25H7M1.75 0V7M5.25 0V7" stroke="#c43b3b" stroke-width="1.6" opacity="0.85"/></pattern></defs>`;
  for (const [s, p] of hat?.behind ?? []) {
    head += painted(s.d, cloth(p), ink);
    headBoxes.push(s.box);
  }
  const skinShape = view === 'side' ? ellipse(c, r, h) : ellipse(c, r, h);
  if (view === 'side') {
    const nose = circle([c[0] + r * 0.98, c[1] + h * 0.22], h * 0.13);
    head += painted(nose.d, { fill: skin }, ink);
  }
  if (!hat?.hidesEars) {
    const ears: Pt[] =
      view === 'side'
        ? []
        : [
            [c[0] - r * 0.97 - spec.gaze * 1.2, c[1] + h * 0.12],
            [c[0] + r * 0.97 - spec.gaze * 1.2, c[1] + h * 0.12],
          ];
    for (const e of ears)
      head += painted(circle(e, h * 0.19).d, { fill: skin }, ink);
  }
  head += painted(skinShape.d, { fill: skin }, ink);
  headBoxes.push(skinShape.box);
  if (view === 'side' && !hat?.hidesEars) {
    const ear = ellipse([c[0] - r * 0.12, c[1] + h * 0.12], h * 0.15, h * 0.19);
    head += painted(ear.d, { fill: skin, stroke: 'thin' }, ink);
    head += stroked(
      `M${pt([c[0] - r * 0.14, c[1] + h * 0.04])}Q${pt([c[0] - r * 0.02, c[1] + h * 0.12])} ${pt([c[0] - r * 0.12, c[1] + h * 0.22])}`,
      shadeOk(skin, 0.3),
      ink.thin,
    );
  }
  // Cheeks a touch warm.
  if (view === 'front')
    for (const s of [-1, 1])
      head += `<path d="${ellipse([c[0] + s * r * 0.55 + spec.gaze * r * 0.1, c[1] + h * 0.4], r * 0.16, h * 0.09).d}" fill="#e98b7f" opacity="0.28"/>`;
  else
    head += `<path d="${ellipse([c[0] + r * 0.45, c[1] + h * 0.42], r * 0.14, h * 0.08).d}" fill="#e98b7f" opacity="0.28"/>`;
  if (looks.facial === 'stubble') {
    const s = beardOf({ ...looks, facial: 'beard' }, c, r, h, view);
    if (s)
      head += `<path d="${s.d}" fill="${shadeOk(skin, 0.18)}" opacity="0.55"/>`;
  }
  const beard = beardOf(looks, c, r, h, view);
  if (beard) {
    head += painted(beard.d, { fill: hairColour }, ink);
    headBoxes.push(beard.box);
  }
  const headJoint = { a: 'neck' as const, b: 'crown' as const };
  parts.head = rigid(headJoint.a, headJoint.b, head, unionBox(headBoxes));
  // The faces: the one worn, and the others hidden for the rig's states.
  const faceOf = (e: Expression) =>
    view === 'side'
      ? faceSide(c, r, h, e, { skin, hair: hairColour }, ink, Boolean(beard))
      : faceFront(
          c,
          r,
          h,
          spec.gaze,
          e,
          { skin, hair: hairColour },
          ink,
          Boolean(beard),
        );
  const faceBox: ShotBox = [c[0] - r * 0.7, c[1] - h * 0.6, r * 1.4, h * 1.35];
  extraPart(
    'face',
    'head',
    rigid('neck', 'crown', faceOf(spec.expression), faceBox),
    c,
  );
  for (const e of spec.faces)
    if (e !== spec.expression) {
      const made = rigid('neck', 'crown', faceOf(e), faceBox);
      extras.push({
        id: `${place.prefix}face-${e}`,
        parent: `${place.prefix}head`,
        markup: made.markup,
        box: made.box,
        pivot: put(c),
        attrs: 'opacity="0"',
      });
    }
  // Hair and hat over the face, with glasses.
  let top = '';
  const topBoxes: ShotBox[] = [];
  const cap = hat?.hidesHair ? null : hairOn(looks, c, r, h, view, spec.gaze);
  if (cap) {
    top += painted(cap.d, { fill: hairColour }, ink);
    topBoxes.push(cap.box);
  }
  if (looks.glasses) {
    const gy = c[1] + h * 0.1;
    if (view === 'front')
      for (const s of [-1, 1])
        top += `<circle cx="${n1(c[0] + spec.gaze * r * 0.13 + s * r * 0.37)}" cy="${n1(gy)}" r="${n1(r * 0.2)}" fill="none" stroke="${ink.colour}" stroke-width="${n1(ink.thin)}"/>`;
    else
      top += `<circle cx="${n1(c[0] + r * 0.46)}" cy="${n1(gy)}" r="${n1(r * 0.19)}" fill="none" stroke="${ink.colour}" stroke-width="${n1(ink.thin)}"/>`;
  }
  for (const [s, p] of hat?.over ?? []) {
    top += painted(s.d, cloth(p), ink);
    topBoxes.push(s.box);
  }
  for (const l of hat?.lines ?? [])
    top += stroked(l.d, l.colour ?? ink.colour, l.width || ink.thin);
  if (top) {
    const made = rigid(
      'neck',
      'crown',
      top,
      topBoxes.length ? unionBox(topBoxes) : faceBox,
    );
    // It turns with the head, about the middle of its own foot.
    extras.push({
      id: `${place.prefix}hat`,
      parent: `${place.prefix}head`,
      markup: made.markup,
      box: made.box,
      pivot: [made.box[0] + made.box[2] / 2, made.box[1] + made.box[3]],
    });
  }

  // The limbs, between the posed joints.
  const sleeves = sleeveColours(outfit, skin);
  const legs = legColours(outfit, skin);
  const far = (s: 'l' | 'r') => view === 'side' && s === 'r';
  const shade = (colour: string, s: 'l' | 'r') =>
    far(s) ? shadeOk(colour, 0.12) : colour;
  for (const s of ['l', 'r'] as const) {
    const J = (j: string) => joints[j as keyof Joints];
    const sh = J(`shoulder-${s}`);
    const el = J(`elbow-${s}`);
    const wr = J(`wrist-${s}`);
    const fi = J(`fingers-${s}`);
    // The upper arm, with what sits on the shoulder.
    const upperFill = shade(sleeves.upper, s);
    const upper = limb(
      sh,
      f.arm,
      el,
      f.arm * 0.95,
      { fill: upperFill },
      ink,
      false,
    );
    const onShoulder = shoulderPiece(outfit, sh, el, f.arm, ink);
    parts[`arm-${s}`] = placed(
      upper + onShoulder,
      capsule(sh, f.arm * 1.4, el, f.arm).box,
    );
    // The forearm: a sleeve, a wide sleeve, or the skin.
    let fore = '';
    let foreBox = capsule(el, f.arm, wr, f.arm).box;
    if (sleeves.wide) {
      const bell = wideSleeve(el, wr, f.arm);
      fore = painted(bell.d, { fill: shade(sleeves.fore, s) }, ink);
      foreBox = bell.box;
    } else {
      fore = limb(
        el,
        f.arm * 0.95,
        wr,
        f.arm * 0.88,
        { fill: shade(sleeves.fore, s) },
        ink,
      );
      if (sleeves.cuff) {
        const cuff = capsule(
          lerp(el, wr, 0.78),
          f.arm * 0.98,
          wr,
          f.arm * 0.95,
        );
        fore += painted(cuff.d, { fill: sleeves.cuff, stroke: 'thin' }, ink);
      }
    }
    parts[`forearm-${s}`] = placed(fore, foreBox);
    const hand = handMarkup(posing.hands[s], wr, fi, f, shade(skin, s), ink);
    parts[`hand-${s}`] = placed(hand.markup, hand.box);
    // The legs.
    const hp = J(`hip-${s}`);
    const kn = J(`knee-${s}`);
    const an = J(`ankle-${s}`);
    const thigh = limb(
      hp,
      f.leg,
      kn,
      f.leg * 0.95,
      { fill: shade(legs.leg, s) },
      ink,
      false,
    );
    parts[`thigh-${s}`] = placed(thigh, capsule(hp, f.leg, kn, f.leg).box);
    let shin = limb(
      kn,
      f.leg * 0.95,
      an,
      f.leg * 0.85,
      { fill: shade(legs.leg, s) },
      ink,
    );
    if (legs.boot) {
      const boot = bootShape(kn, an, f.leg * 0.85);
      shin += painted(boot.d, { fill: shade(legs.boot, s) }, ink);
    }
    if (legs.straps) shin += strapLines(an, kn, ink, outfit.top === 'armour');
    parts[`shin-${s}`] = placed(shin, capsule(kn, f.leg, an, f.leg).box);
    const footRest = footShape(rest[`ankle-${s}`], s === 'l' ? 1 : -1, view, f);
    const footMap = compose(
      P,
      carry(rest[`ankle-${s}`], rest[`toe-${s}`], an, J(`toe-${s}`)),
    );
    parts[`foot-${s}`] = {
      markup: `<g transform="${matOf(footMap)}">${painted(footRest.d, { fill: shade(legs.foot, s) }, ink)}${
        legs.straps
          ? stroked(
              `M${pt([rest[`ankle-${s}`][0] - 4, -3])}L${pt([rest[`ankle-${s}`][0] + 5, -5])}`,
              '#7a4f2e',
              ink.thin * 1.4,
            )
          : ''
      }</g>`,
      box: grow(boxThrough(footMap, footRest.box), f.line),
    };
  }

  // What is held, under the fist; a shield over the other arm.
  const gesture = sideOfGaze(spec.gaze);
  const other: 'l' | 'r' = gesture === 'l' ? 'r' : 'l';
  const propHand: 'l' | 'r' =
    view === 'side'
      ? outfit.shield !== 'none'
        ? 'r'
        : 'l'
      : spec.pose === 'holding-up' || spec.pose === 'thinking'
        ? // The raised hand holds it up; a thinker holds it in the hand away from the chin.
          spec.pose === 'holding-up'
          ? other
          : gesture
        : spec.pose === 'pointing' || spec.pose === 'waving'
          ? other
          : 'r';
  if (outfit.prop !== 'none') {
    const wr = joints[`wrist-${propHand}`];
    const fi = joints[`fingers-${propHand}`];
    const m = lerp(wr, fi, 0.42);
    const facingSign: 1 | -1 = view === 'side' ? 1 : propHand === 'l' ? 1 : -1;
    const hangs = ['pouch', 'basket', 'lantern'].includes(outfit.prop);
    // A blade rests pointing down at the side unless it is held up.
    const blade = ['sword', 'curved-sword', 'axe', 'hammer'].includes(
      outfit.prop,
    );
    const hold: Hold =
      hangs || (blade && posing.hold === 'upright') ? 'down' : posing.hold;
    const shapes = propShapes(
      outfit.prop,
      m,
      hold,
      f.H,
      outfit.shieldColour,
      facingSign,
    );
    if (shapes.length) {
      const box = grow(
        boxThrough(P, unionBox(shapes.map(([s]) => s.box))),
        f.line,
      );
      extras.push({
        id: `${place.prefix}prop`,
        parent: `${place.prefix}forearm-${propHand}`,
        markup: `<g transform="${matOf(P)}">${drawn(shapes, ink)}</g>`,
        box,
        // It turns about the fist that holds it, kept on its own box.
        pivot: within(box, put(m)),
      });
    }
  }
  if (outfit.shield !== 'none') {
    const s: 'l' | 'r' = view === 'side' ? 'l' : propHand === 'l' ? 'r' : 'l';
    const wr = joints[`wrist-${s}`];
    const el = joints[`elbow-${s}`];
    const m = lerp(el, wr, 0.6);
    const size =
      f.H *
      (view === 'side'
        ? outfit.shield === 'scutum'
          ? 0.4
          : 0.36
        : outfit.shield === 'scutum'
          ? 0.5
          : 0.42);
    const centre: Pt =
      view === 'side'
        ? [joints.hip[0] + f.H * 0.15, (f.shoulderY + f.hipY) / 2 + f.H * 0.02]
        : [m[0] + (s === 'l' ? 2 : -2), m[1] - 2];
    const face = shieldShape(outfit.shield, centre, size);
    const colour = outfit.shieldColour;
    let markup = painted(face.d, { fill: colour }, ink);
    // A rim and a boss, or a band across: shapes, never a symbol.
    if (outfit.shield === 'round' || outfit.shield === 'oval') {
      markup += painted(
        shieldShape(outfit.shield, centre, size * 0.78).d,
        { fill: mixOk(colour, '#ffffff', 0.18), stroke: 'thin' },
        ink,
      );
      markup += painted(
        circle(centre, size * 0.09).d,
        { fill: '#b9c0c7' },
        ink,
      );
    } else if (outfit.shield === 'scutum') {
      markup += stroked(
        rounded(
          [
            [centre[0] - size * 0.29, centre[1] - size * 0.45],
            [centre[0] + size * 0.29, centre[1] - size * 0.45],
            [centre[0] + size * 0.29, centre[1] + size * 0.45],
            [centre[0] - size * 0.29, centre[1] + size * 0.45],
          ],
          size * 0.06,
        ).d,
        CLOTH.gold,
        2.2,
      );
      markup += painted(
        circle(centre, size * 0.09).d,
        { fill: CLOTH.gold },
        ink,
      );
      markup += stroked(
        `M${pt([centre[0], centre[1] - size * 0.42])}L${pt([centre[0], centre[1] - size * 0.12])}M${pt([centre[0], centre[1] + size * 0.12])}L${pt([centre[0], centre[1] + size * 0.42])}`,
        CLOTH.gold,
        2.2,
      );
    } else {
      markup += stroked(
        `M${pt([centre[0] - size * 0.28, centre[1] - size * 0.05])}L${pt([centre[0] + size * 0.28, centre[1] - size * 0.05])}`,
        mixOk(colour, '#ffffff', 0.55),
        size * 0.09,
        'butt',
      );
    }
    extras.push({
      id: `${place.prefix}shield`,
      parent: `${place.prefix}forearm-${s}`,
      markup: `<g transform="${matOf(P)}">${markup}</g>`,
      box: grow(boxThrough(P, face.box), f.line),
      pivot: put(m),
    });
  }

  // The figure's parts to the standard, in the view's order.
  const drawing: Partial<Record<FigurePart, { markup: string; box: ShotBox }>> =
    {};
  for (const [id, made] of Object.entries(parts))
    drawing[id as FigurePart] = made;
  const placedJoints = {} as Joints;
  for (const j of JOINTS) placedJoints[j] = put(joints[j]);
  // A hand at the chin comes over the face: its arm after the head.
  const chin =
    spec.pose === 'thinking'
      ? sideOfGaze(spec.gaze) === 'l'
        ? 'r'
        : 'l'
      : null;
  const order =
    view === 'front'
      ? [
          'cape',
          'hair-back',
          'thigh-r',
          'thigh-l',
          'skirt',
          'torso',
          ...(['arm-r', 'arm-l', 'head'] as const).filter(
            (p) => p !== `arm-${chin}`,
          ),
          ...(chin ? [`arm-${chin}`] : []),
        ]
      : [
          'cape',
          'arm-r',
          'thigh-r',
          'hair-back',
          'thigh-l',
          'skirt',
          'torso',
          'head',
          'arm-l',
        ];
  let list = figureParts(
    place.prefix,
    placedJoints,
    drawing,
    view,
    place.parent,
    extras,
    order,
  );
  // The prop under its fist: before the hand in its forearm's group.
  const prop = list.find((p) => p.id === `${place.prefix}prop`);
  if (prop) {
    list = list.filter((p) => p !== prop);
    const at = list.findIndex(
      (p) => p.id === `${place.prefix}hand-${propHand}`,
    );
    list.splice(at < 0 ? list.length : at, 0, prop);
  }
  const boxes = list.map((p) => p.box).filter((b): b is ShotBox => Boolean(b));
  const box = unionBox(boxes);
  const xs = [
    placedJoints['heel-l'],
    placedJoints['toe-l'],
    placedJoints['heel-r'],
    placedJoints['toe-r'],
  ].map((p) => p[0]);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const middle = (lo + hi) / 2;
  const rx = Math.max(0.17 * f.H, (hi - lo) / 2 + 0.08 * f.H);
  const shadow = groundShadow(
    ink.id(),
    [middle, place.at[1]],
    rx,
    rx * 0.16,
    '#000000',
    0.14,
  );
  return {
    parts: list,
    shadow,
    box,
    joints: placedJoints,
    head: parts.head.box,
    stands: [middle, place.at[1]],
  };
}

const n1 = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};
const pt = (p: Pt) => `${n1(p[0])} ${n1(p[1])}`;

// ── Who: a character from its settings ─────────────────────────────────────

/** A seeded person: what the words leave open, chosen by the seed, never one region's by default. */
function looksFor(
  r: Rand,
  words: string,
  age: Age | null,
  build: BuildKind | null,
  skinBase: number | null,
  given: { facial?: FacialHair; hair?: HairStyle; men?: boolean },
): Looks {
  const said = hairOf(words);
  // Anyone may be a woman unless the words or the role's history say a man
  // (a legion, a king, a monk); the words saying a woman always win.
  const woman =
    womanIn(words) ||
    (!given.men &&
      !/\b(?:he|him|his|man|men|king|soldiers?|knights?|monks?|vikings?|legionar(?:y|ies)|officers?)\b/u.test(
        words.toLowerCase(),
      ) &&
      r.chance(0.3));
  const a: Age = age ?? ageOf(words) ?? (r.chance(0.12) ? 'elder' : 'adult');
  // A group's figure comes with its own tone (groupSkins); one alone takes
  // the words' (a likeness, the look notes) or the seed's: never a place's.
  const skin = skinBase ?? skinOf(words) ?? Math.floor(r() * SKIN.length);
  const hairColourName =
    said.colour ??
    (a === 'elder'
      ? r.pick(['grey', 'white'])
      : r.weighted([
          ['black', 0.38],
          ['dark brown', 0.28],
          ['brown', 0.16],
          ['auburn', 0.06],
          ['red', 0.04],
          ['blonde', 0.08],
        ] as const));
  const hair: HairStyle =
    said.hair ??
    given.hair ??
    (woman
      ? r.pick(['long', 'bun', 'braids', 'ponytail', 'curly'] as const)
      : a === 'elder'
        ? r.pick(['balding', 'short', 'bald'] as const)
        : r.pick(['short', 'short', 'cropped', 'curly'] as const));
  const facial: FacialHair =
    facialOf(words) ??
    given.facial ??
    (woman || a === 'child'
      ? 'none'
      : r.weighted([
          ['none', 0.42],
          ['beard', 0.3],
          ['moustache', 0.14],
          ['stubble', 0.14],
        ] as const));
  return {
    age: a,
    build:
      build ??
      buildOf(words) ??
      r.weighted([
        ['average', 0.6],
        ['slim', 0.2],
        ['broad', 0.2],
      ] as const),
    skin: SKIN[Math.max(0, Math.min(SKIN.length - 1, skin))],
    hair,
    hairColour: HAIR_COLOURS[hairColourName] ?? HAIR_COLOURS.black,
    facial: woman || a === 'child' ? 'none' : facial,
    glasses: glassesIn(words),
  };
}

const oneOf = <T extends string>(
  list: readonly T[],
  raw: unknown,
  fallback: T,
): T =>
  (list as readonly string[]).includes(String(raw)) ? (raw as T) : fallback;

/** The ink a piece's characters are drawn with: the style's line, thicker, as the reference's. */
function inkOf(style: KitStyle): Ink {
  let k = 0;
  return {
    colour: mixOk(style.lineColour, '#1a1414', 0.6),
    line: 2.2,
    thin: 1.25,
    id: () => `c${(k += 1)}`,
  };
}

/** A character's spec from a piece's settings and its seed. */
export function characterSpec(
  params: KitParams,
  style: KitStyle,
  seed: number,
  options: {
    sideMain?: boolean;
    skinBase?: number | null;
    pose?: CharacterPose;
    phase?: number;
    age?: Age | null;
  } = {},
): CharacterSpec {
  const r = rand(seed);
  const era: EraId = eraParam(params.era, 'today');
  const words = [params.dress, params.name, params.looks]
    .filter((w) => typeof w === 'string' && w)
    .join(', ');
  const side = colourOf(
    style,
    typeof params.colour === 'string' ? params.colour : undefined,
  );
  const sideColour = side === style.ink ? CLOTH.red : side;
  const role = oneOf(ROLES, params.role, 'person');
  const dressed = outfitOf(words, {
    role,
    era,
    side: sideColour,
    pick: (list) => r.pick(list),
    sideMain: options.sideMain,
  });
  const prop = oneOf(PROPS, params.prop, 'none');
  if (prop !== 'none') dressed.outfit.prop = prop;
  const looks = looksFor(
    r,
    words,
    options.age ?? (params.age ? oneOf(AGES, params.age, 'adult') : null),
    params.build ? oneOf(BUILDS, params.build, 'average') : null,
    options.skinBase ?? null,
    {
      facial: dressed.facial,
      hair: dressed.hair,
      men:
        (dressed.role === 'soldier' || dressed.role === 'ruler') &&
        !['1945-1975', '1975-2000', 'today'].includes(era),
    },
  );
  const pose = options.pose ?? oneOf(CHARACTER_POSES, params.pose, 'standing');
  const expression = oneOf(EXPRESSIONS, params.expression, 'neutral');
  const gaze =
    params.facing === 'left'
      ? -1
      : params.facing === 'right'
        ? 1
        : r.pick([-0.6, 0.6]);
  return {
    looks,
    outfit: dressed.outfit,
    pose,
    expression,
    faces: FACE_STATES.filter((e) => e !== expression),
    gaze: SIDE_POSES.has(pose) ? 0 : gaze,
    phase: options.phase ?? 0,
  };
}

/** The faces a character keeps hidden for its states: those the board may turn it to at a word. */
export const FACE_STATES: readonly Expression[] = [
  'neutral',
  'happy',
  'surprised',
  'angry',
  'worried',
];

// ── Pieces ────────────────────────────────────────────────────────────────

/** A piece's box round what it draws: its feet on the bottom edge, a margin round the rest. */
function pieceBox(drawnBox: ShotBox, margin: number): ShotBox {
  const [x, y, w, h] = drawnBox;
  const top = y - margin;
  const bottom = Math.max(0, y + h);
  return [x - margin, top, w + 2 * margin, bottom - top].map(
    (v) => Math.round(v * 10) / 10,
  ) as ShotBox;
}

/**
 * The rig's states for a figure's faces: each shows its face and hides
 * the others, every face named in every state, so a change of face
 * crossfades (the stage shows a part drawn hidden at its state's opacity).
 */
function faceStates(
  prefix: string,
  worn: Expression,
  faces: readonly Expression[],
): ShotRigDto['states'] {
  const hidden = faces.filter((e) => e !== worn);
  const none = Object.fromEntries(
    hidden.map((e) => [`${prefix}face-${e}`, { opacity: 0 }]),
  );
  const states: ShotRigDto['states'] = { rest: { ...none } };
  for (const e of hidden)
    states[e] = {
      ...none,
      [`${prefix}face`]: { opacity: 0 },
      [`${prefix}face-${e}`]: { opacity: 1 },
    };
  return states;
}

/** The moves a character can make: the people's own, and holding something up and cheering. */
export const CHARACTER_MOVES = [
  'enter',
  'exit',
  'walk',
  'leave',
  'turn',
  'point',
  'wave',
  'cheer',
  'hold-up',
  // A face turned at a word: the rig's state of that name.
  ...FACE_MOVES(),
];
const GROUP_MOVES = [
  'enter',
  'exit',
  'walk',
  'leave',
  'turn',
  'wave',
  'cheer',
  ...FACE_MOVES(),
];

/** The faces a character may turn to at a word, as moves (each the rig's state of its name). */
function FACE_MOVES(): string[] {
  return ['neutral', 'happy', 'surprised', 'angry', 'worried'];
}

/** One character, as a piece. */
function personPiece(
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const spec = characterSpec(params, style, seed);
  const ink = inkOf(style);
  const side = SIDE_POSES.has(spec.pose);
  const facing: 1 | -1 | 0 = side ? (params.facing === 'left' ? -1 : 1) : 0;
  const fig = drawCharacter(
    spec,
    { at: [0, 0], facing, prefix: '', parent: null },
    ink,
  );
  const states = faceStates('', spec.expression, spec.faces);
  const named =
    typeof params.name === 'string' && params.name.trim()
      ? params.name.trim()
      : null;
  return piece(
    `character.person:${spec.pose}`,
    fig.parts,
    [fig.shadow],
    fig.box,
    6,
    {
      states,
      moves: CHARACTER_MOVES,
      figures: [{ prefix: '', facing }],
    },
    fig.box,
    named
      ? [`a character of ${named}, labelled with the name when first seen`]
      : [],
  );
}

/** The stream a group's skin tones are drawn from: their own, so nothing else drawn moves them. */
const SKIN_STREAM = 7919;

/**
 * A group's skin tones (each an index of SKIN), each figure its own: near
 * the tone its words give (a likeness, or the research's look notes as the
 * board passes them for a group), else a seeded, varied mix from light to
 * dark. Only words about skin move them (skinOf): never a place, a people's
 * name or an era.
 */
export function groupSkins(
  seed: number,
  count: number,
  words: string,
): number[] {
  const r = rand(subSeed(seed, SKIN_STREAM));
  const last = SKIN.length - 1;
  const said = skinOf(words);
  if (said !== null)
    return Array.from({ length: count }, () =>
      Math.max(0, Math.min(last, said + Math.round(r.between(-1.2, 1.2)))),
    );
  // A mix: one tone from each band of the range, shuffled along the row.
  const mix = Array.from({ length: count }, (_, k) =>
    Math.min(last, Math.floor(((k + r()) / count) * SKIN.length)),
  );
  for (let k = mix.length - 1; k > 0; k -= 1) {
    const j = Math.floor(r() * (k + 1));
    [mix[k], mix[j]] = [mix[j], mix[k]];
  }
  return mix;
}

/** Two to six characters of a side, each their own: standing together, cheering, or marching in profile. */
function groupPiece(
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const count = Math.max(2, Math.min(6, Math.round(Number(params.count) || 3)));
  const pose = oneOf(CHARACTER_POSES, params.pose, 'standing');
  const side = SIDE_POSES.has(pose);
  const facing: 1 | -1 | 0 = side ? (params.facing === 'left' ? -1 : 1) : 0;
  const ink = inkOf(style);
  const r = rand(seed);
  // Each its own skin: near the tone the look notes give, else a seeded mix.
  const skins = groupSkins(
    seed,
    count,
    [params.dress, params.looks]
      .filter((w) => typeof w === 'string' && w)
      .join(', '),
  );
  const parts: RigPart[] = [];
  const shadows: string[] = [];
  const boxes: ShotBox[] = [];
  const figures: { prefix: string; facing: 1 | -1 | 0 }[] = [];
  const states: ShotRigDto['states'] = { rest: {} };
  const spacing = side ? 44 : 50;
  for (let k = 0; k < count; k += 1) {
    const prefix = `f${k + 1}.`;
    const spec = characterSpec(params, style, subSeed(seed, k + 1), {
      sideMain: true,
      skinBase: skins[k],
      pose,
      // In step: a column marches together, each a little off.
      phase: side ? (k % 2) * 0.04 : 0,
    });
    // Front rows a little lower: a column reads with depth.
    const x = side ? -k * spacing : (k - (count - 1) / 2) * spacing;
    const y = side ? 0 : k % 2 ? -6 : 0;
    const fig = drawCharacter(
      {
        ...spec,
        gaze: side
          ? 0
          : (k - (count - 1) / 2) * -0.2 + (r.chance(0.5) ? 0.4 : -0.4),
      },
      { at: [x, y], facing, prefix, parent: `f${k + 1}` },
      ink,
    );
    parts.push(
      { id: `f${k + 1}`, parent: null, markup: '', pivot: fig.stands },
      ...fig.parts,
    );
    shadows.push(fig.shadow);
    boxes.push(fig.box);
    figures.push({ prefix, facing });
    Object.assign(
      states,
      mergeStates(states, faceStates(prefix, spec.expression, spec.faces)),
    );
  }
  // Back to front: the column's leader last (in front), a row's middle ones over the ends.
  const order = side
    ? [...Array(count).keys()].reverse()
    : [...Array(count).keys()]
        .sort((a, b) => (a % 2) - (b % 2) || a - b)
        .reverse();
  const byFigure = (k: number) =>
    parts.filter((p) => p.id === `f${k + 1}` || p.id.startsWith(`f${k + 1}.`));
  const ordered = order.flatMap((k) => byFigure(k));
  const box = unionBox(boxes);
  return piece(
    `character.group:${pose}:${count}`,
    ordered,
    shadows,
    box,
    6,
    {
      states,
      moves: GROUP_MOVES,
      figures: figures.sort((a, b) =>
        a.prefix.localeCompare(b.prefix, 'en', { numeric: true }),
      ),
      // Standing together, each shifts a little on its own and bounces when they cheer.
      ...(side
        ? {}
        : { idle: [...Array(count).keys()].map((k) => `f${k + 1}`) }),
    },
    box,
    [],
  );
}

/** States merged: each state's poses together. */
function mergeStates(
  a: ShotRigDto['states'],
  b: ShotRigDto['states'],
): ShotRigDto['states'] {
  const out: ShotRigDto['states'] = { ...a };
  for (const [name, poses] of Object.entries(b))
    out[name] = { ...(out[name] ?? {}), ...poses };
  return out;
}

/** A piece put together from its parts and shadows. */
function piece(
  id: string,
  parts: RigPart[],
  shadows: string[],
  drawnBox: ShotBox,
  margin: number,
  rig: ShotRigDto,
  focal: ShotBox,
  notes: string[],
): KitPiece {
  const built = assemble(parts);
  const box = pieceBox(drawnBox, margin);
  return {
    id,
    svg: svgOf(box, `${shadows.join('')}${built.markup}`),
    parts: built.parts,
    rig,
    focal: focal.map((v) => Math.round(v * 10) / 10) as ShotBox,
    box,
    colours: ['side'],
    ...(notes.length ? { notes } : {}),
  };
}

// ── The registry's entries ────────────────────────────────────────────────

const ERA_PARAM = {
  values: [
    'ancient',
    'medieval',
    '1500-1800',
    '1800-1900',
    '1900-1945',
    '1945-1975',
    '1975-2000',
    'today',
  ],
  default: 'today',
  about: 'when they lived (a period in words is read as one)',
};
const ROLE_PARAM = {
  values: ROLES,
  default: 'person',
  about: 'what they are in the story',
};
const DRESS_PARAM = {
  text: 90,
  default: '',
  about:
    'what they wear, and their skin or hair where the look notes give it, in the research’s own words (a culture’s dress only where the research names it, never a look from a place)',
};
const EXPRESSION_PARAM = {
  values: EXPRESSIONS,
  default: 'neutral',
  about: 'their face',
};
const PROP_PARAM = {
  values: PROPS,
  default: 'none',
  about: 'what they hold (weapons only as costume)',
};
const FACING_PARAM = {
  values: ['left', 'right', 'camera'],
  default: 'camera',
  about: 'where they look',
};

export const CHARACTER_KIT: Readonly<Record<string, KitEntry>> = {
  'character.person': {
    family: 'characters',
    looks: ['illustrated'],
    about:
      'one cartoon character dressed for their era: an unnamed role the line speaks of (a soldier, a merchant, a monk), or a named person of the list (name), drawn from their described likeness and labelled with their name.',
    params: {
      role: ROLE_PARAM,
      era: ERA_PARAM,
      dress: DRESS_PARAM,
      name: {
        text: 48,
        default: '',
        about: 'a person of the list, by name; empty for an unnamed role',
      },
      looks: {
        text: 240,
        default: '',
        about: 'a named person’s likeness, from the look notes',
        code: true,
      },
      expression: EXPRESSION_PARAM,
      prop: PROP_PARAM,
      pose: {
        values: CHARACTER_POSES,
        default: 'standing',
        about: 'how they stand (walking and marching are drawn in profile)',
      },
      facing: FACING_PARAM,
    },
    moves: CHARACTER_MOVES,
    people: true,
    named: true,
    make: personPiece,
  },
  'character.group': {
    family: 'characters',
    looks: ['illustrated'],
    about:
      'two to six cartoon characters of one side, dressed for their era, each their own, the side’s colour on each: a people, an army, a crowd’s front.',
    params: {
      count: { range: [2, 6], default: 3, about: 'how many are drawn' },
      role: ROLE_PARAM,
      era: ERA_PARAM,
      dress: DRESS_PARAM,
      expression: EXPRESSION_PARAM,
      prop: PROP_PARAM,
      pose: {
        values: ['standing', 'cheering', 'marching', 'walking'],
        default: 'standing',
        about: 'standing together, cheering, or marching in step',
      },
      facing: FACING_PARAM,
    },
    moves: GROUP_MOVES,
    people: true,
    make: groupPiece,
  },
};

/** Whether a piece shows people (for the board's rules of people). */
export const isCharacter = (id: string): boolean => id.startsWith('character.');

export { mixOk };
