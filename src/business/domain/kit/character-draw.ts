/**
 * The illustrated look's characters, drawn (WP17, after Richard's cartoon
 * world-history reference): a cute, simple proportion (a big head on a
 * small body, the head about two fifths of the height), flat colours and
 * one clean dark outline, so a character reads at a glance on a phone.
 *
 * A character is drawn to the kit's figure standard (rig.ts): every part
 * named as FIGURE_PARTS names it, nested as FIGURE_PARENT nests it, each
 * turning about its joint, so the stage's moves (a walk, a point, a wave,
 * a cheer) work on a character as on a silhouette. Two views:
 *
 *  - facing the camera, the head a little turned toward what it looks at
 *    (`gaze`), for standing, pointing, waving, cheering, holding something
 *    up, thinking;
 *  - in profile facing right (mirrored to face left), for walking,
 *    marching and riding.
 *
 * Like the silhouettes, a character is designed standing at rest with its
 * feet on y = 0; posed by turns at its joints (and by reaching a hand to a
 * point); its limbs drawn between the posed joints, its rigid parts (the
 * torso, the head, a skirt) drawn at rest and carried to where the pose
 * put them. A limb's seam at its joint is not outlined, so a bent knee or
 * elbow stays one clean shape.
 *
 * The face is drawn for an expression (neutral, happy, surprised, angry,
 * smug, worried, thinking) with the same few marks every time: two dark
 * oval eyes with a light, two brows that carry the feeling, a small nose,
 * a mouth. Other expressions can be drawn into the same head hidden, so a
 * state of the rig shows them at a word ("Wait!" and a surprised face).
 */
import type { ShotBox } from '../../../contracts';
import { type FigurePart, type Joints, JOINTS, posed, reach } from './rig';
import {
  type Pt,
  type Shape,
  add,
  blob,
  boxOf,
  capsule,
  circle,
  dir,
  dist,
  ellipse,
  lerp,
  n1,
  rect,
  rounded,
  scale,
  sub,
  turn,
  unionBox,
} from './shape';
import { luminance, mixOk, shadeOk } from './style';
import type { Expression, Looks, Outfit } from './wardrobe';
import { CLOTH } from './wardrobe';

export type View = 'front' | 'side';

const pt = (p: Pt) => `${n1(p[0])} ${n1(p[1])}`;
const deg = (d: number) => (d * Math.PI) / 180;

// ── The body ──────────────────────────────────────────────────────────────

/** How a character is built: its height, its head, and where its joints are at rest. */
export interface Frame {
  /** The top of the head, above the feet. */
  H: number;
  /** The head's height and half-width. */
  head: number;
  headW: number;
  /** The head's middle (y) and the chin (y). */
  cy: number;
  chin: number;
  shoulderY: number;
  shoulderX: number;
  hipY: number;
  hipX: number;
  kneeY: number;
  ankleY: number;
  /** The arm's segments: shoulder to elbow, elbow to wrist, wrist to fingertips. */
  upper: number;
  fore: number;
  hand: number;
  /** Limb radii. */
  arm: number;
  leg: number;
  /** The torso's half-widths: at the shoulders, the waist and the hips. */
  chest: number;
  waist: number;
  hips: number;
  /** The outline's width, and the inner lines'. */
  line: number;
  thin: number;
}

/** A character's frame from its age and build: the head about two fifths of the height at every age. */
export function frameOf(looks: Pick<Looks, 'age' | 'build'>): Frame {
  const child = looks.age === 'child';
  const H = child ? 116 : looks.age === 'elder' ? 146 : 150;
  const head = child ? 52 : 58;
  const headW = child ? 28 : 30;
  const chin = -(H - head);
  const body = H - head;
  const k = body / 92;
  const b = looks.build === 'broad' ? 1 : looks.build === 'slim' ? -1 : 0;
  const cy = -H + head / 2;
  return {
    H,
    head,
    headW,
    cy,
    chin,
    shoulderY: chin + 6 * k,
    shoulderX: (19 + 1.5 * b) * k,
    hipY: chin + 0.5 * body,
    hipX: (8.5 + 0.8 * b) * k,
    kneeY: -0.52 * 0.5 * body,
    ankleY: -7 * k,
    upper: 17 * k,
    fore: 15 * k,
    hand: 8 * k,
    arm: (5.6 + 0.6 * b) * k,
    leg: (6.6 + 0.8 * b) * k,
    chest: (22 + 2.5 * b) * k,
    waist: (19 + 4 * b) * k,
    hips: (20.5 + 3 * b) * k,
    line: 2.2,
    thin: 1.25,
  };
}

/** The joints standing at rest: facing the camera (its `-l` side on the viewer's right) or in profile facing right. */
export function restJoints(f: Frame, view: View): Joints {
  const side = view === 'side';
  const arm = (s: 1 | -1): Partial<Joints> => {
    const k = s === 1 ? 'l' : 'r';
    const x = side ? s * 1.5 : s * f.shoulderX;
    const out = side ? 0 : s * 1.6;
    return {
      [`shoulder-${k}`]: [x, f.shoulderY],
      [`elbow-${k}`]: [x + out, f.shoulderY + f.upper],
      [`wrist-${k}`]: [x + out * 1.7, f.shoulderY + f.upper + f.fore],
      [`fingers-${k}`]: [
        x + out * 1.9,
        f.shoulderY + f.upper + f.fore + f.hand,
      ],
    };
  };
  const leg = (s: 1 | -1): Partial<Joints> => {
    const k = s === 1 ? 'l' : 'r';
    const x = side ? s * 1.5 : s * f.hipX;
    return {
      [`hip-${k}`]: [x, f.hipY],
      [`knee-${k}`]: [x + (side ? 1 : 0), f.kneeY],
      [`ankle-${k}`]: [x, f.ankleY],
      [`heel-${k}`]: side ? [x - 4, 0] : [x - s * 1, 0],
      [`toe-${k}`]: side ? [x + 11, 0] : [x + s * 6, 0],
    };
  };
  return {
    hip: [0, f.hipY],
    neck: [side ? 2 : 0, f.chin + 2],
    crown: [side ? 2 : 0, -f.H],
    ...arm(1),
    ...arm(-1),
    ...leg(1),
    ...leg(-1),
  } as Joints;
}

/** The joints set down: the lowest foot on the ground. */
export function grounded(joints: Joints): Joints {
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

/** A wrist reaching a point: the elbow bent outward (facing the camera) or down (in profile). */
export function reachArm(
  rest: Joints,
  joints: Joints,
  side: 'l' | 'r',
  target: Pt,
  view: View,
): Joints {
  const out = { ...joints };
  const shoulder = out[`shoulder-${side}`];
  const upper = dist(rest[`shoulder-${side}`], rest[`elbow-${side}`]);
  const fore = dist(rest[`elbow-${side}`], rest[`wrist-${side}`]);
  const hand = dist(rest[`wrist-${side}`], rest[`fingers-${side}`]);
  const a = reach(shoulder, target, upper, fore, 1);
  const b = reach(shoulder, target, upper, fore, -1);
  const outward = side === 'l' ? 1 : -1;
  const elbow =
    view === 'front'
      ? (a[0] - b[0]) * outward >= 0
        ? a
        : b
      : a[1] >= b[1]
        ? a
        : b;
  const toward = sub(target, elbow);
  const len = Math.max(1e-6, Math.hypot(toward[0], toward[1]));
  const wrist = add(elbow, scale(toward, fore / len));
  out[`elbow-${side}`] = elbow;
  out[`wrist-${side}`] = wrist;
  out[`fingers-${side}`] = add(wrist, scale(toward, hand / len));
  return out;
}

/** The map taking a point of a part's rest frame (from a to b) to where the pose put it. */
export function frameMap(ra: Pt, rb: Pt, pa: Pt, pb: Pt): (p: Pt) => Pt {
  const angle =
    Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) -
    Math.atan2(rb[1] - ra[1], rb[0] - ra[0]);
  return (p) => add(pa, turn(sub(p, ra), [0, 0], angle));
}

// ── Ink ───────────────────────────────────────────────────────────────────

/** How a shape is painted: its fill, and its outline (the character's line, a thin inner line, or none). */
export interface Paint {
  fill: string;
  stroke?: 'line' | 'thin' | 'none';
  opacity?: number;
}

/** What a character is drawn with: the outline's colour and widths, and a fresh id for each definition. */
export interface Ink {
  colour: string;
  line: number;
  thin: number;
  id(): string;
}

/** A filled shape, outlined as its paint says. */
export function painted(d: string, paint: Paint, ink: Ink): string {
  if (!d) return '';
  const stroke = paint.stroke ?? 'line';
  const o =
    paint.opacity !== undefined && paint.opacity < 1
      ? ` opacity="${Math.round(paint.opacity * 100) / 100}"`
      : '';
  return stroke === 'none'
    ? `<path d="${d}" fill="${paint.fill}"${o}/>`
    : `<path d="${d}" fill="${paint.fill}" stroke="${ink.colour}" stroke-width="${n1(stroke === 'thin' ? ink.thin : ink.line)}" stroke-linejoin="round"${o}/>`;
}

/** An open line: a brow, a mouth, a fold, a strap. */
export function stroked(
  d: string,
  colour: string,
  width: number,
  cap: 'round' | 'butt' = 'round',
): string {
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n1(width)}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
}

/** The cubic segments of a circular arc (angles in radians, either way round), as path commands. */
function arcTo(c: Pt, r: number, a0: number, a1: number): string {
  const turns = Math.max(
    1,
    Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9),
  );
  const step = (a1 - a0) / turns;
  const k = (4 / 3) * Math.tan(step / 4);
  let d = '';
  for (let i = 0; i < turns; i += 1) {
    const s = a0 + step * i;
    const e = s + step;
    const p0 = add(c, scale(dir(s), r));
    const p3 = add(c, scale(dir(e), r));
    const c1 = add(p0, scale([-Math.sin(s), Math.cos(s)], k * r));
    const c2 = sub(p3, scale([-Math.sin(e), Math.cos(e)], k * r));
    d += `C${pt(c1)} ${pt(c2)} ${pt(p3)}`;
  }
  return d;
}

/**
 * A limb segment from a joint to the next: its fill (a capsule) and its
 * outline without the cap at the joint it hangs from, so where it meets
 * the segment above no line crosses it.
 */
export function limb(
  a: Pt,
  ra: number,
  b: Pt,
  rb: number,
  paint: Paint,
  ink: Ink,
  open = true,
): string {
  const fill = capsule(a, ra, b, rb);
  if (!open) return painted(fill.d, paint, ink);
  const d = dist(a, b);
  if (d <= Math.abs(ra - rb) + 1e-6) return painted(fill.d, paint, ink);
  const theta = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  const a1 = add(a, scale(dir(theta + alpha), ra));
  const a2 = add(a, scale(dir(theta - alpha), ra));
  const b2 = add(b, scale(dir(theta - alpha), rb));
  const edge = `M${pt(a2)}L${pt(b2)}${arcTo(b, rb, theta - alpha, theta + alpha)}L${pt(a1)}`;
  return (
    painted(fill.d, { ...paint, stroke: 'none' }, ink) +
    stroked(edge, ink.colour, ink.line)
  );
}

// ── The face ──────────────────────────────────────────────────────────────

/** How each expression sets the brows (inner end down, degrees; raised, in head heights), the eyes and the mouth. */
const FACES: Readonly<
  Record<
    Expression,
    {
      brow: [number, number];
      lift: [number, number];
      eyes: 'open' | 'wide' | 'lidded' | 'up';
      mouth:
        'smile' | 'open-smile' | 'o' | 'frown' | 'smirk' | 'wobble' | 'flat';
    }
  >
> = {
  neutral: { brow: [4, 4], lift: [0, 0], eyes: 'open', mouth: 'smile' },
  happy: {
    brow: [-6, -6],
    lift: [0.02, 0.02],
    eyes: 'open',
    mouth: 'open-smile',
  },
  surprised: { brow: [-12, -12], lift: [0.07, 0.07], eyes: 'wide', mouth: 'o' },
  angry: {
    brow: [24, 24],
    lift: [-0.015, -0.015],
    eyes: 'open',
    mouth: 'frown',
  },
  smug: {
    brow: [12, -14],
    lift: [-0.01, 0.04],
    eyes: 'lidded',
    mouth: 'smirk',
  },
  worried: {
    brow: [-22, -22],
    lift: [0.02, 0.02],
    eyes: 'open',
    mouth: 'wobble',
  },
  thinking: { brow: [6, -16], lift: [0, 0.05], eyes: 'up', mouth: 'flat' },
};

/** The head's own colours: skin, hair, and the mouth's inside. */
interface HeadColours {
  skin: string;
  hair: string;
}

const MOUTH = '#7a2c2f';
const TONGUE = '#e07a7a';
const EYE = '#2a2223';

/**
 * A face facing the camera, for an expression: in the head's frame at
 * rest (its middle at c, half-width r, half-height h), the features
 * turned toward `gaze` (-1 left, 0 ahead, 1 right).
 */
export function faceFront(
  c: Pt,
  r: number,
  h: number,
  gaze: number,
  expression: Expression,
  colours: HeadColours,
  ink: Ink,
  beard: boolean,
): string {
  const face = FACES[expression];
  const gx = c[0] + gaze * r * 0.13;
  const eyeY = c[1] + h * 0.1;
  const spread = r * 0.37;
  let out = '';
  // Eyes: dark ovals with a light, the far one a little narrower when the head is turned.
  const eyes: [number, number][] = [
    [gx - spread * (gaze > 0 ? 0.92 : 1), gaze > 0 ? 0.88 : 1],
    [gx + spread * (gaze < 0 ? 0.92 : 1), gaze < 0 ? 0.88 : 1],
  ];
  const erx = r * 0.115;
  const ery = h * 0.17;
  for (const [ex, k] of eyes) {
    const wide = face.eyes === 'wide' ? 1.22 : 1;
    const up = face.eyes === 'up' ? -h * 0.03 : 0;
    const shift = face.eyes === 'up' ? gaze * 0.8 + 0.6 : 0;
    const e = ellipse([ex + shift, eyeY + up], erx * k * wide, ery * wide);
    if (face.eyes === 'lidded') {
      // Half shut: the lower half of the eye under a straight lid.
      const top = eyeY - ery * 0.05;
      const lid = `M${pt([ex - erx * k * 1.25, top])}L${pt([ex + erx * k * 1.25, top - 0.3])}`;
      const half = `M${pt([ex - erx * k, top])}C${pt([ex - erx * k, eyeY + ery * 1.25])} ${pt([ex + erx * k, eyeY + ery * 1.25])} ${pt([ex + erx * k, top])}Z`;
      out +=
        `<path d="${half}" fill="${EYE}"/>` +
        stroked(lid, ink.colour, ink.thin * 1.3);
    } else {
      // A thin white round the dark eye, so it reads on every skin.
      out += `<path d="${ellipse([ex + shift * 0.5, eyeY + up], erx * k * wide * 1.32, ery * wide * 1.2).d}" fill="#ffffff"/>`;
      out += `<path d="${e.d}" fill="${EYE}"/>`;
      out += `<circle cx="${n1(ex + shift - erx * 0.38 * k)}" cy="${n1(eyeY + up - ery * 0.42 * wide)}" r="${n1(erx * 0.42)}" fill="#ffffff"/>`;
    }
  }
  // Brows: thick short strokes, their inner ends down for anger, up for worry.
  const browY = eyeY - h * 0.33;
  const browLen = r * 0.3;
  eyes.forEach(([ex], i) => {
    const s = i === 0 ? -1 : 1;
    const tilt = deg(face.brow[i]);
    const lift = face.lift[i] * 2 * h;
    const mid: Pt = [ex, browY - lift];
    const inner: Pt = [
      mid[0] - s * (browLen / 2) * Math.cos(tilt),
      mid[1] + (browLen / 2) * Math.sin(tilt),
    ];
    const outer: Pt = [
      mid[0] + s * (browLen / 2) * Math.cos(tilt),
      mid[1] - (browLen / 2) * Math.sin(tilt),
    ];
    // A little arch for the calm and the glad.
    const arch: Pt = [mid[0], mid[1] - (face.brow[i] < 8 ? h * 0.03 : 0)];
    // Brows read on every skin: near black on a dark one, and a little heavier.
    const deep = luminance(colours.skin) < 0.12;
    out += stroked(
      `M${pt(inner)}Q${pt(arch)} ${pt(outer)}`,
      colours.hair === '#eeece8'
        ? '#8f8a86'
        : deep
          ? '#120d0e'
          : mixOk(colours.hair, EYE, 0.5),
      h * (deep ? 0.1 : 0.085),
    );
  });
  // The nose: a small curve, toward where the head is turned.
  const nx = gx + gaze * r * 0.1;
  const ny = c[1] + h * 0.32;
  out += stroked(
    `M${pt([nx - r * 0.07, ny - h * 0.02])}C${pt([nx - r * 0.05, ny + h * 0.07])} ${pt([nx + r * 0.05, ny + h * 0.07])} ${pt([nx + r * 0.08, ny - h * 0.01])}`,
    shadeOk(colours.skin, 0.35),
    ink.thin,
  );
  // The mouth.
  const mx = gx;
  const my = c[1] + h * 0.56 + (beard ? h * 0.04 : 0);
  const w = r * 0.17;
  switch (face.mouth) {
    case 'open-smile': {
      const d = `M${pt([mx - w * 1.4, my - h * 0.03])}C${pt([mx - w * 1.1, my + h * 0.26])} ${pt([mx + w * 1.1, my + h * 0.26])} ${pt([mx + w * 1.4, my - h * 0.03])}Z`;
      out += painted(d, { fill: MOUTH, stroke: 'thin' }, ink);
      out += `<path d="M${pt([mx - w * 0.7, my + h * 0.15])}C${pt([mx - w * 0.3, my + h * 0.08])} ${pt([mx + w * 0.4, my + h * 0.08])} ${pt([mx + w * 0.75, my + h * 0.15])}C${pt([mx + w * 0.4, my + h * 0.2])} ${pt([mx - w * 0.4, my + h * 0.2])} ${pt([mx - w * 0.7, my + h * 0.15])}Z" fill="${TONGUE}"/>`;
      break;
    }
    case 'o':
      out += painted(
        ellipse([mx, my + h * 0.05], w * 0.62, h * 0.12).d,
        { fill: MOUTH, stroke: 'thin' },
        ink,
      );
      break;
    case 'frown':
      out += stroked(
        `M${pt([mx - w, my + h * 0.07])}C${pt([mx - w * 0.4, my - h * 0.03])} ${pt([mx + w * 0.4, my - h * 0.03])} ${pt([mx + w, my + h * 0.07])}`,
        ink.colour,
        ink.thin * 1.2,
      );
      break;
    case 'smirk':
      out += stroked(
        `M${pt([mx - w * 0.9, my + h * 0.01])}C${pt([mx - w * 0.2, my + h * 0.07])} ${pt([mx + w * 0.5, my + h * 0.05])} ${pt([mx + w * 1.15, my - h * 0.07])}`,
        ink.colour,
        ink.thin * 1.2,
      );
      break;
    case 'wobble':
      out += stroked(
        `M${pt([mx - w, my + h * 0.05])}C${pt([mx - w * 0.6, my - h * 0.02])} ${pt([mx - w * 0.2, my + h * 0.07])} ${pt([mx + w * 0.15, my + h * 0.02])}S${pt([mx + w * 0.7, my - h * 0.01])} ${pt([mx + w, my + h * 0.05])}`,
        ink.colour,
        ink.thin * 1.2,
      );
      break;
    case 'flat':
      out += stroked(
        `M${pt([mx - w * 0.3 + gaze * w * 0.4, my + h * 0.03])}L${pt([mx + w * 0.95 + gaze * w * 0.4, my])}`,
        ink.colour,
        ink.thin * 1.2,
      );
      break;
    default:
      out += stroked(
        `M${pt([mx - w, my])}C${pt([mx - w * 0.45, my + h * 0.09])} ${pt([mx + w * 0.45, my + h * 0.09])} ${pt([mx + w, my])}`,
        ink.colour,
        ink.thin * 1.2,
      );
  }
  return out;
}

/** A face in profile facing right: one eye, a brow, the nose's tip, a mouth. In the head's frame at rest. */
export function faceSide(
  c: Pt,
  r: number,
  h: number,
  expression: Expression,
  colours: HeadColours,
  ink: Ink,
  beard: boolean,
): string {
  const face = FACES[expression];
  const ex = c[0] + r * 0.46;
  const ey = c[1] + h * 0.08;
  let out = '';
  const wide = face.eyes === 'wide' ? 1.2 : 1;
  if (face.eyes === 'lidded') {
    const top = ey - h * 0.01;
    out += `<path d="M${pt([ex - r * 0.1, top])}C${pt([ex - r * 0.1, ey + h * 0.2])} ${pt([ex + r * 0.1, ey + h * 0.2])} ${pt([ex + r * 0.1, top])}Z" fill="${EYE}"/>`;
    out += stroked(
      `M${pt([ex - r * 0.13, top])}L${pt([ex + r * 0.13, top])}`,
      ink.colour,
      ink.thin * 1.3,
    );
  } else {
    out += `<path d="${ellipse([ex, ey], r * 0.13 * wide, h * 0.19 * wide).d}" fill="#ffffff"/>`;
    out += `<path d="${ellipse([ex, ey], r * 0.1 * wide, h * 0.16 * wide).d}" fill="${EYE}"/>`;
    out += `<circle cx="${n1(ex - r * 0.03)}" cy="${n1(ey - h * 0.07 * wide)}" r="${n1(r * 0.045)}" fill="#ffffff"/>`;
  }
  const tilt = deg(face.brow[1]);
  const lift = face.lift[1] * 2 * h;
  const by = ey - h * 0.32 - lift;
  const len = r * 0.28;
  out += stroked(
    `M${pt([ex - (len / 2) * Math.cos(tilt), by - (len / 2) * Math.sin(tilt)])}L${pt([ex + (len / 2) * Math.cos(tilt), by + (len / 2) * Math.sin(tilt)])}`,
    colours.hair === '#eeece8' ? '#8f8a86' : mixOk(colours.hair, EYE, 0.5),
    h * 0.085,
  );
  const mx = c[0] + r * 0.66;
  const my = c[1] + h * 0.55 + (beard ? h * 0.04 : 0);
  const w = r * 0.13;
  switch (face.mouth) {
    case 'open-smile':
      out += painted(
        `M${pt([mx - w, my - h * 0.02])}C${pt([mx - w * 0.6, my + h * 0.2])} ${pt([mx + w * 1.2, my + h * 0.18])} ${pt([mx + w * 1.5, my - h * 0.04])}Z`,
        { fill: MOUTH, stroke: 'thin' },
        ink,
      );
      break;
    case 'o':
      out += painted(
        ellipse([mx + w * 0.6, my + h * 0.04], w * 0.55, h * 0.1).d,
        { fill: MOUTH, stroke: 'thin' },
        ink,
      );
      break;
    case 'frown':
      out += stroked(
        `M${pt([mx - w * 0.6, my + h * 0.06])}Q${pt([mx + w * 0.4, my - h * 0.03])} ${pt([mx + w * 1.4, my + h * 0.03])}`,
        ink.colour,
        ink.thin * 1.2,
      );
      break;
    default:
      out += stroked(
        `M${pt([mx - w * 0.6, my + h * 0.01])}Q${pt([mx + w * 0.4, my + h * 0.08])} ${pt([mx + w * 1.4, my - (face.mouth === 'smirk' ? h * 0.05 : 0)])}`,
        ink.colour,
        ink.thin * 1.2,
      );
  }
  return out;
}

// ── Hair and beards ───────────────────────────────────────────────────────

/** Points round an ellipse from one angle to another (radians, clockwise on screen), `n` of them. */
function arcPoints(
  c: Pt,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n: number,
): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
    return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)] as Pt;
  });
}

/** Hair behind the head (long hair, a bun's fall, braids, an afro), drawn before the head. */
export function hairBehind(
  looks: Looks,
  c: Pt,
  r: number,
  h: number,
  view: View,
  chinY: number,
): Shape | null {
  const side = view === 'side';
  switch (looks.hair) {
    case 'long':
      return side
        ? blob(
            [
              [c[0] - r * 0.2, c[1] - h * 0.9],
              [c[0] - r * 1.05, c[1] - h * 0.4],
              [c[0] - r * 1.15, chinY + h * 0.55],
              [c[0] - r * 0.55, chinY + h * 0.72],
              [c[0] + r * 0.05, chinY],
            ],
            0.8,
          )
        : blob(
            [
              [c[0] - r * 0.95, c[1] - h * 0.55],
              [c[0], c[1] - h * 1.06],
              [c[0] + r * 0.95, c[1] - h * 0.55],
              [c[0] + r * 1.12, chinY + h * 0.62],
              [c[0], chinY + h * 0.75],
              [c[0] - r * 1.12, chinY + h * 0.62],
            ],
            0.85,
          );
    case 'braids':
      return side
        ? capsule(
            [c[0] - r * 0.7, c[1]],
            r * 0.2,
            [c[0] - r * 0.85, chinY + h * 0.7],
            r * 0.16,
          )
        : unionShapes([
            capsule(
              [c[0] - r * 0.95, c[1]],
              r * 0.18,
              [c[0] - r * 1.05, chinY + h * 0.75],
              r * 0.15,
            ),
            capsule(
              [c[0] + r * 0.95, c[1]],
              r * 0.18,
              [c[0] + r * 1.05, chinY + h * 0.75],
              r * 0.15,
            ),
          ]);
    case 'afro':
      return ellipse([c[0], c[1] - h * 0.18], r * 1.28, h * 1.12);
    case 'ponytail':
      return capsule(
        [c[0] - r * (side ? 0.95 : 0.6), c[1] - h * 0.35],
        r * 0.22,
        [c[0] - r * (side ? 1.25 : 1.05), chinY + h * 0.3],
        r * 0.14,
      );
    default:
      return null;
  }
}

/** Shapes joined into one (each closed path kept as it is). */
function unionShapes(shapes: readonly Shape[]): Shape {
  return {
    d: shapes.map((s) => s.d).join(''),
    box: unionBox(shapes.map((s) => s.box)),
  };
}

/** Hair on the head, over the skin: a cap of the style, in the head's frame at rest. */
export function hairOn(
  looks: Looks,
  c: Pt,
  r: number,
  h: number,
  view: View,
  gaze: number,
): Shape | null {
  const side = view === 'side';
  const top = c[1] - h;
  switch (looks.hair) {
    case 'bald':
      return null;
    case 'balding':
      return side
        ? blob(
            [
              [c[0] - r * 0.25, c[1] - h * 0.3],
              [c[0] - r * 0.95, c[1] - h * 0.25],
              [c[0] - r * 0.9, c[1] + h * 0.3],
              [c[0] - r * 0.3, c[1] + h * 0.1],
            ],
            0.8,
          )
        : unionShapes([
            blob(
              [
                [c[0] - r * 1.02, c[1] - h * 0.35],
                [c[0] - r * 0.8, c[1] - h * 0.5],
                [c[0] - r * 0.78, c[1] - h * 0.05],
                [c[0] - r * 1.04, c[1] + h * 0.05],
              ],
              0.8,
            ),
            blob(
              [
                [c[0] + r * 1.02, c[1] - h * 0.35],
                [c[0] + r * 0.8, c[1] - h * 0.5],
                [c[0] + r * 0.78, c[1] - h * 0.05],
                [c[0] + r * 1.04, c[1] + h * 0.05],
              ],
              0.8,
            ),
          ]);
    case 'tonsure':
      return side
        ? blob(
            [
              [c[0] + r * 0.55, c[1] - h * 0.62],
              [c[0] + r * 0.2, c[1] - h * 0.86],
              [c[0] - r * 0.6, c[1] - h * 0.8],
              [c[0] - r * 1.04, c[1] - h * 0.15],
              [c[0] - r * 0.85, c[1] + h * 0.25],
              [c[0] - r * 0.4, c[1] - h * 0.3],
              [c[0] + r * 0.2, c[1] - h * 0.6],
            ],
            0.8,
          )
        : blob(
            [
              [c[0] - r * 1.04, c[1] + h * 0.08],
              [c[0] - r * 1.0, c[1] - h * 0.5],
              [c[0] - r * 0.55, c[1] - h * 0.82],
              [c[0], c[1] - h * 0.86],
              [c[0] + r * 0.55, c[1] - h * 0.82],
              [c[0] + r * 1.0, c[1] - h * 0.5],
              [c[0] + r * 1.04, c[1] + h * 0.08],
              [c[0] + r * 0.82, c[1] - h * 0.35],
              [c[0] + r * 0.45, c[1] - h * 0.56],
              [c[0], c[1] - h * 0.6],
              [c[0] - r * 0.45, c[1] - h * 0.56],
              [c[0] - r * 0.82, c[1] - h * 0.35],
            ],
            0.7,
          );
    default: {
      // A cap over the crown to the hairline: closer for cropped, fuller for curls.
      const lift =
        looks.hair === 'cropped'
          ? 0.02
          : looks.hair === 'curly' || looks.hair === 'afro'
            ? 0.12
            : 0.07;
      const line = looks.hair === 'cropped' ? 0.5 : 0.42;
      if (side) {
        const pts: Pt[] = [
          [c[0] + r * 0.72, c[1] - h * 0.66],
          ...arcPoints(
            [c[0] - r * 0.02, c[1] - h * 0.04],
            r * (1.04 + lift),
            h * (1.03 + lift),
            deg(-60),
            deg(-200),
            7,
          ),
          [c[0] - r * 1.02, c[1] + h * 0.38],
          [c[0] - r * 0.55, c[1] + h * 0.12],
          [c[0] - r * 0.15, c[1] - h * 0.32],
          [c[0] + r * 0.35, c[1] - h * line],
        ];
        return blob(pts, 0.75);
      }
      const part = gaze * r * 0.25 + r * 0.18;
      const outer = arcPoints(
        [c[0], c[1] - h * 0.02],
        r * (1.05 + lift * 0.6),
        h * (1.04 + lift),
        deg(172),
        deg(368),
        9,
      );
      const pts: Pt[] = [
        ...outer,
        [c[0] + r * 0.9, c[1] - h * 0.2],
        [c[0] + r * 0.6, c[1] - h * (line + 0.04)],
        [c[0] + part, c[1] - h * (line + 0.12)],
        [c[0] + part - r * 0.12, c[1] - h * line],
        [c[0] - r * 0.45, c[1] - h * (line - 0.02)],
        [c[0] - r * 0.9, c[1] - h * 0.2],
      ];
      const cap = blob(pts, 0.7);
      if (looks.hair === 'curly' || looks.hair === 'afro') {
        // Curls: bumps round the cap's edge.
        const bumps = arcPoints(
          [c[0], c[1] - h * 0.05],
          r * 1.05,
          h * 1.05,
          deg(180),
          deg(360),
          7,
        ).map((p) => circle(p, r * 0.24));
        return unionShapes([cap, ...bumps]);
      }
      if (looks.hair === 'bun')
        return unionShapes([cap, circle([c[0], top - h * 0.12], r * 0.3)]);
      return cap;
    }
  }
}

/** A beard or a moustache, in the head's frame at rest; the mouth is drawn over it. */
export function beardOf(
  looks: Looks,
  c: Pt,
  r: number,
  h: number,
  view: View,
): Shape | null {
  const side = view === 'side';
  if (looks.facial === 'none' || looks.facial === 'stubble') return null;
  if (looks.facial === 'moustache')
    return side
      ? blob(
          [
            [c[0] + r * 0.58, c[1] + h * 0.42],
            [c[0] + r * 0.92, c[1] + h * 0.4],
            [c[0] + r * 0.98, c[1] + h * 0.52],
            [c[0] + r * 0.62, c[1] + h * 0.53],
          ],
          0.7,
        )
      : blob(
          [
            [c[0] - r * 0.36, c[1] + h * 0.52],
            [c[0] - r * 0.12, c[1] + h * 0.4],
            [c[0], c[1] + h * 0.44],
            [c[0] + r * 0.12, c[1] + h * 0.4],
            [c[0] + r * 0.36, c[1] + h * 0.52],
            [c[0], c[1] + h * 0.52],
          ],
          0.7,
        );
  const drop = looks.facial === 'long-beard' ? 1.9 : 1.32;
  if (side)
    return blob(
      [
        [c[0] - r * 0.2, c[1] + h * 0.05],
        [c[0] + r * 0.15, c[1] + h * 0.35],
        [c[0] + r * 0.55, c[1] + h * 0.4],
        [c[0] + r * 0.98, c[1] + h * 0.42],
        [c[0] + r * 0.9, c[1] + h * 0.85],
        [c[0] + r * 0.5, c[1] + h * drop],
        [c[0] - r * 0.15, c[1] + h * (drop - 0.25)],
        [c[0] - r * 0.4, c[1] + h * 0.55],
      ],
      0.75,
    );
  return blob(
    [
      [c[0] - r * 0.98, c[1] + h * 0.08],
      [c[0] - r * 1.02, c[1] + h * 0.45],
      [c[0] - r * 0.8, c[1] + h * 0.95],
      [c[0] - r * 0.42, c[1] + h * (drop - 0.12)],
      [c[0], c[1] + h * drop],
      [c[0] + r * 0.42, c[1] + h * (drop - 0.12)],
      [c[0] + r * 0.8, c[1] + h * 0.95],
      [c[0] + r * 1.02, c[1] + h * 0.45],
      [c[0] + r * 0.98, c[1] + h * 0.08],
      [c[0] + r * 0.72, c[1] + h * 0.44],
      [c[0] + r * 0.34, c[1] + h * 0.5],
      [c[0], c[1] + h * 0.44],
      [c[0] - r * 0.34, c[1] + h * 0.5],
      [c[0] - r * 0.72, c[1] + h * 0.44],
    ],
    0.6,
  );
}

// ── Headwear ──────────────────────────────────────────────────────────────

/** A hat's shapes over the hair, back to front, each with its paint; and whether it hides the hair and the ears. */
export interface Hat {
  /** Drawn behind the head (a keffiyeh's fall, a hood's back, a cloth hanging behind). */
  behind: [Shape, Paint][];
  over: [Shape, Paint][];
  /** Lines on it (folds, an agal's gap, a crest's strands): path data with a width. */
  lines: { d: string; width: number; colour?: string }[];
  hidesHair: boolean;
  hidesEars: boolean;
  /** A cloth woven in red checks (a checked keffiyeh): its paint is a pattern. */
  checked?: boolean;
  /** How far above the head's top it reaches, in head heights (for the piece's box). */
  reach: number;
}

const STEEL = '#aeb6be';
const STEEL_DARK = '#7f8891';
const GOLD = '#e7b43c';
const BLACKCLOTH = '#2f2b2c';

/** One of the kit's hats, in the head's frame at rest (middle c, half-width r, half-height h). */
export function hatOf(
  outfit: Outfit,
  c: Pt,
  r: number,
  h: number,
  view: View,
  chinY: number,
  skin: string,
): Hat | null {
  const side = view === 'side';
  const colour = outfit.headColour;
  const hat: Hat = {
    behind: [],
    over: [],
    lines: [],
    hidesHair: false,
    hidesEars: false,
    reach: 0.1,
  };
  const dome = (lift: number, brow: number, wide = 1.06): Shape =>
    blob(
      [
        ...arcPoints(
          [c[0], c[1] - h * 0.05],
          r * wide,
          h * (1 + lift),
          deg(side ? 185 : 180),
          deg(side ? 365 : 360),
          9,
        ),
        [c[0] + r * wide, c[1] - h * brow],
        [c[0] - r * wide, c[1] - h * brow],
      ],
      0.6,
    );
  const brim = (y: number, half: number, thick: number): Shape =>
    ellipse([c[0] + (side ? r * 0.1 : 0), c[1] - h * y], r * half, h * thick);
  switch (outfit.head) {
    case 'crested-helmet': {
      const metal =
        colour === CLOTH.gold || colour === CLOTH.bronze ? CLOTH.bronze : STEEL;
      hat.over.push([dome(0.12, 0.3), { fill: metal }]);
      // The brow band and the cheek guards down the sides of the face.
      hat.over.push([
        rounded(
          [
            [c[0] - r * 1.07, c[1] - h * 0.42],
            [c[0] + r * 1.07, c[1] - h * 0.42],
            [c[0] + r * 1.07, c[1] - h * 0.28],
            [c[0] - r * 1.07, c[1] - h * 0.28],
          ],
          2,
        ),
        { fill: shadeOk(metal, 0.12) },
      ]);
      if (side) {
        hat.over.push([
          blob(
            [
              [c[0] - r * 0.12, c[1] - h * 0.3],
              [c[0] + r * 0.16, c[1] - h * 0.3],
              [c[0] + r * 0.1, c[1] + h * 0.38],
              [c[0] - r * 0.1, c[1] + h * 0.4],
            ],
            0.6,
          ),
          { fill: metal },
        ]);
        hat.over.push([
          blob(
            [
              [c[0] - r * 0.95, c[1] - h * 0.3],
              [c[0] - r * 1.25, c[1] + h * 0.15],
              [c[0] - r * 1.1, c[1] + h * 0.28],
              [c[0] - r * 0.8, c[1] + h * 0.05],
            ],
            0.6,
          ),
          { fill: metal },
        ]);
      } else {
        for (const s of [-1, 1])
          hat.over.push([
            blob(
              [
                [c[0] + s * r * 1.07, c[1] - h * 0.3],
                [c[0] + s * r * 0.7, c[1] - h * 0.28],
                [c[0] + s * r * 0.72, c[1] + h * 0.3],
                [c[0] + s * r * 0.86, c[1] + h * 0.52],
                [c[0] + s * r * 1.05, c[1] + h * 0.35],
              ],
              0.6,
            ),
            { fill: metal },
          ]);
      }
      // The crest: a plume along the top, or worn across (a centurion's).
      const across = outfit.headPattern;
      const crest = side
        ? across
          ? blob(
              [
                [c[0] - r * 0.2, c[1] - h * 1.06],
                [c[0] - r * 0.28, c[1] - h * 1.75],
                [c[0] + r * 0.18, c[1] - h * 1.78],
                [c[0] + r * 0.2, c[1] - h * 1.06],
              ],
              0.7,
            )
          : blob(
              [
                [c[0] + r * 0.55, c[1] - h * 1.0],
                [c[0] + r * 0.45, c[1] - h * 1.42],
                [c[0] - r * 0.25, c[1] - h * 1.55],
                [c[0] - r * 0.95, c[1] - h * 1.22],
                [c[0] - r * 0.75, c[1] - h * 0.92],
              ],
              0.8,
            )
        : across
          ? blob(
              [
                [c[0] - r * 1.15, c[1] - h * 1.0],
                [c[0] - r * 0.95, c[1] - h * 1.55],
                [c[0], c[1] - h * 1.78],
                [c[0] + r * 0.95, c[1] - h * 1.55],
                [c[0] + r * 1.15, c[1] - h * 1.0],
                [c[0], c[1] - h * 1.12],
              ],
              0.8,
            )
          : blob(
              [
                [c[0] - r * 0.28, c[1] - h * 1.08],
                [c[0] - r * 0.34, c[1] - h * 1.6],
                [c[0], c[1] - h * 1.78],
                [c[0] + r * 0.34, c[1] - h * 1.6],
                [c[0] + r * 0.28, c[1] - h * 1.08],
              ],
              0.8,
            );
      hat.behind.push([crest, { fill: colour }]);
      // The crest's holder on the dome.
      hat.over.push([
        rect(c[0] - r * 0.12, c[1] - h * 1.2, r * 0.24, h * 0.16, 1.5),
        { fill: shadeOk(metal, 0.2) },
      ]);
      hat.hidesHair = true;
      hat.hidesEars = true;
      hat.reach = 0.8;
      break;
    }
    case 'conical-helmet':
    case 'round-helmet':
    case 'army-helmet':
    case 'hard-hat':
    case 'turban-helmet': {
      const conical = outfit.head === 'conical-helmet';
      const modern =
        outfit.head === 'army-helmet' || outfit.head === 'hard-hat';
      const metal =
        outfit.head === 'hard-hat'
          ? CLOTH.yellow
          : outfit.head === 'army-helmet'
            ? colour === CLOTH.olive
              ? CLOTH.olive
              : shadeOk(CLOTH.olive, 0.1)
            : STEEL;
      if (outfit.head === 'turban-helmet') {
        // A cloth wound round the helmet's foot.
        hat.over.push([
          blob(
            [
              [c[0] - r * 1.14, c[1] - h * 0.26],
              [c[0] - r * 1.1, c[1] - h * 0.66],
              [c[0], c[1] - h * 0.8],
              [c[0] + r * 1.1, c[1] - h * 0.66],
              [c[0] + r * 1.14, c[1] - h * 0.26],
              [c[0], c[1] - h * 0.36],
            ],
            0.75,
          ),
          { fill: colour },
        ]);
        hat.lines.push({
          d: `M${pt([c[0] - r * 1.0, c[1] - h * 0.5])}Q${pt([c[0], c[1] - h * 0.62])} ${pt([c[0] + r * 1.0, c[1] - h * 0.46])}`,
          width: 0,
        });
      }
      const topY = conical
        ? 1.42
        : outfit.head === 'turban-helmet'
          ? 1.25
          : 1.12;
      const shell = conical
        ? blob(
            [
              [c[0] - r * 1.08, c[1] - h * 0.32],
              [c[0] - r * 0.7, c[1] - h * 0.95],
              [c[0], c[1] - h * topY],
              [c[0] + r * 0.7, c[1] - h * 0.95],
              [c[0] + r * 1.08, c[1] - h * 0.32],
            ],
            0.5,
          )
        : outfit.head === 'turban-helmet'
          ? blob(
              [
                [c[0] - r * 0.9, c[1] - h * 0.66],
                [c[0] - r * 0.6, c[1] - h * 1.05],
                [c[0], c[1] - h * topY],
                [c[0] + r * 0.6, c[1] - h * 1.05],
                [c[0] + r * 0.9, c[1] - h * 0.66],
              ],
              0.6,
            )
          : dome(modern ? 0.14 : 0.1, 0.3, modern ? 1.12 : 1.07);
      if (outfit.head === 'turban-helmet')
        hat.over.unshift([shell, { fill: metal }]);
      else hat.over.push([shell, { fill: metal }]);
      if (conical || outfit.head === 'turban-helmet')
        hat.over.push([
          capsule(
            [c[0], c[1] - h * topY],
            r * 0.06,
            [c[0], c[1] - h * (topY + 0.22)],
            r * 0.03,
          ),
          { fill: metal },
        ]);
      if (!modern && outfit.head !== 'turban-helmet')
        hat.over.push([
          rounded(
            [
              [c[0] - r * 1.1, c[1] - h * 0.42],
              [c[0] + r * 1.1, c[1] - h * 0.42],
              [c[0] + r * 1.1, c[1] - h * 0.28],
              [c[0] - r * 1.1, c[1] - h * 0.28],
            ],
            2,
          ),
          { fill: shadeOk(metal, 0.15) },
        ]);
      if (modern)
        hat.over.push([
          brim(0.3, side ? 1.3 : 1.24, outfit.head === 'hard-hat' ? 0.1 : 0.12),
          { fill: shadeOk(metal, 0.12) },
        ]);
      if (conical && !side)
        // The nasal, down over the nose.
        hat.over.push([
          rect(c[0] - r * 0.07, c[1] - h * 0.32, r * 0.14, h * 0.62, 1.5),
          { fill: metal },
        ]);
      if (conical && side)
        hat.over.push([
          rect(c[0] + r * 0.82, c[1] - h * 0.32, r * 0.16, h * 0.62, 1.5),
          { fill: metal },
        ]);
      hat.hidesHair = true;
      hat.hidesEars = !modern;
      hat.reach = conical ? 0.55 : 0.3;
      break;
    }
    case 'morion': {
      hat.over.push([
        blob(
          [
            [c[0] - r * 1.5, c[1] - h * 0.55],
            [c[0] - r * 1.0, c[1] - h * 0.42],
            [c[0], c[1] - h * 0.4],
            [c[0] + r * 1.0, c[1] - h * 0.42],
            [c[0] + r * 1.5, c[1] - h * 0.55],
            [c[0] + r * 1.15, c[1] - h * 0.32],
            [c[0], c[1] - h * 0.25],
            [c[0] - r * 1.15, c[1] - h * 0.32],
          ],
          0.6,
        ),
        { fill: STEEL },
      ]);
      hat.over.push([dome(0.12, 0.38, 0.95), { fill: STEEL }]);
      hat.over.push([
        blob(
          [
            [c[0] - r * 0.12, c[1] - h * 0.5],
            [c[0] - r * 0.1, c[1] - h * 1.35],
            [c[0] + r * 0.1, c[1] - h * 1.35],
            [c[0] + r * 0.12, c[1] - h * 0.5],
          ],
          0.5,
        ),
        { fill: STEEL_DARK },
      ]);
      hat.hidesHair = true;
      hat.reach = 0.4;
      break;
    }
    case 'turban': {
      const wrap = blob(
        side
          ? [
              [c[0] + r * 0.85, c[1] - h * 0.3],
              [c[0] + r * 0.95, c[1] - h * 0.9],
              [c[0] + r * 0.2, c[1] - h * 1.35],
              [c[0] - r * 0.85, c[1] - h * 1.15],
              [c[0] - r * 1.15, c[1] - h * 0.45],
              [c[0] - r * 0.85, c[1] - h * 0.1],
            ]
          : [
              [c[0] - r * 1.12, c[1] - h * 0.24],
              [c[0] - r * 1.2, c[1] - h * 0.8],
              [c[0] - r * 0.6, c[1] - h * 1.32],
              [c[0], c[1] - h * 1.4],
              [c[0] + r * 0.6, c[1] - h * 1.32],
              [c[0] + r * 1.2, c[1] - h * 0.8],
              [c[0] + r * 1.12, c[1] - h * 0.24],
              [c[0], c[1] - h * 0.38],
            ],
        0.85,
      );
      hat.over.push([wrap, { fill: colour }]);
      const fold = (y0: number, y1: number) =>
        side
          ? `M${pt([c[0] + r * 0.85, c[1] - h * y0])}Q${pt([c[0] - r * 0.2, c[1] - h * (y0 + 0.2)])} ${pt([c[0] - r * 1.05, c[1] - h * y1])}`
          : `M${pt([c[0] - r * 1.08, c[1] - h * y0])}Q${pt([c[0], c[1] - h * (y0 + 0.28)])} ${pt([c[0] + r * 1.08, c[1] - h * y1])}`;
      hat.lines.push({ d: fold(0.45, 0.75), width: 0 });
      hat.lines.push({ d: fold(0.75, 1.05), width: 0 });
      if (outfit.prop === 'sceptre' || outfit.necklace)
        hat.over.push([
          circle([c[0] + (side ? r * 0.75 : 0), c[1] - h * 0.62], r * 0.13),
          { fill: GOLD },
        ]);
      hat.hidesHair = true;
      hat.hidesEars = false;
      hat.reach = 0.5;
      break;
    }
    case 'keffiyeh':
    case 'hood':
    case 'headscarf':
    case 'nemes': {
      const cloth = colour;
      // The cloth over the head and falling to the shoulders, round the face.
      const fall =
        chinY +
        h *
          (outfit.head === 'nemes' ? 0.6 : outfit.head === 'hood' ? 0.3 : 0.38);
      if (side) {
        hat.behind.push([
          blob(
            [
              [c[0] + r * 0.55, c[1] - h * 0.9],
              [c[0] - r * 0.6, c[1] - h * 1.05],
              [c[0] - r * 1.25, c[1] - h * 0.3],
              [c[0] - r * 1.35, fall],
              [c[0] - r * 0.1, fall - h * 0.1],
              [c[0] + r * 0.1, c[1] + h * 0.4],
            ],
            0.75,
          ),
          { fill: cloth },
        ]);
        hat.over.push([
          blob(
            [
              [c[0] + r * 0.85, c[1] - h * 0.5],
              [c[0] + r * 0.2, c[1] - h * 1.12],
              [c[0] - r * 0.95, c[1] - h * 0.9],
              [c[0] - r * 1.15, c[1] - h * 0.1],
              [c[0] - r * 0.5, c[1] + h * 0.4],
              [c[0] - r * 0.15, c[1] + h * 0.1],
              [c[0] + r * 0.3, c[1] - h * 0.42],
            ],
            0.75,
          ),
          { fill: cloth },
        ]);
      } else {
        hat.behind.push([
          blob(
            [
              [c[0] - r * 1.1, c[1] - h * 0.5],
              [c[0], c[1] - h * 1.1],
              [c[0] + r * 1.1, c[1] - h * 0.5],
              [c[0] + r * 1.2, fall],
              [c[0] + r * 0.55, fall + h * 0.05],
              [c[0] - r * 0.55, fall + h * 0.05],
              [c[0] - r * 1.2, fall],
            ],
            0.8,
          ),
          { fill: cloth },
        ]);
        // The front: over the crown, the edge round the face.
        hat.over.push([
          blob(
            [
              [c[0] - r * 1.1, c[1] + h * 0.7],
              [c[0] - r * 1.14, c[1] - h * 0.45],
              [c[0] - r * 0.6, c[1] - h * 1.04],
              [c[0], c[1] - h * 1.12],
              [c[0] + r * 0.6, c[1] - h * 1.04],
              [c[0] + r * 1.14, c[1] - h * 0.45],
              [c[0] + r * 1.1, c[1] + h * 0.7],
              [c[0] + r * 0.9, c[1] + h * 0.5],
              [c[0] + r * 0.9, c[1] - h * 0.25],
              [c[0] + r * 0.5, c[1] - h * 0.56],
              [c[0], c[1] - h * 0.62],
              [c[0] - r * 0.5, c[1] - h * 0.56],
              [c[0] - r * 0.9, c[1] - h * 0.25],
              [c[0] - r * 0.9, c[1] + h * 0.5],
            ],
            0.6,
          ),
          { fill: cloth },
        ]);
      }
      if (outfit.head === 'keffiyeh' && outfit.headPattern) hat.checked = true;
      if (outfit.head === 'keffiyeh') {
        // The agal: a dark double cord round the crown.
        const agal = side
          ? rounded(
              [
                [c[0] - r * 0.9, c[1] - h * 0.86],
                [c[0] + r * 0.62, c[1] - h * 0.78],
                [c[0] + r * 0.6, c[1] - h * 0.62],
                [c[0] - r * 0.95, c[1] - h * 0.7],
              ],
              3,
            )
          : blob(
              [
                [c[0] - r * 1.04, c[1] - h * 0.62],
                [c[0], c[1] - h * 0.86],
                [c[0] + r * 1.04, c[1] - h * 0.62],
                [c[0] + r * 1.04, c[1] - h * 0.46],
                [c[0], c[1] - h * 0.7],
                [c[0] - r * 1.04, c[1] - h * 0.46],
              ],
              0.7,
            );
        hat.over.push([agal, { fill: BLACKCLOTH }]);
      }
      if (outfit.head === 'nemes' && outfit.headPattern) {
        for (let k = 0; k < 4; k += 1) {
          const y = c[1] - h * (0.9 - k * 0.25);
          hat.lines.push({
            d: side
              ? `M${pt([c[0] - r * 1.1, y])}L${pt([c[0] + r * 0.4, y - h * 0.1])}`
              : `M${pt([c[0] - r * 1.15, y + h * 0.1])}Q${pt([c[0], y - h * 0.15])} ${pt([c[0] + r * 1.15, y + h * 0.1])}`,
            width: 2.6,
            colour: GOLD,
          });
        }
      }
      if (outfit.head === 'hood')
        hat.lines.push({
          d: side
            ? `M${pt([c[0] + r * 0.7, c[1] - h * 0.5])}Q${pt([c[0] + r * 0.1, c[1] - h * 1.0])} ${pt([c[0] - r * 0.8, c[1] - h * 0.7])}`
            : `M${pt([c[0] - r * 0.9, c[1] - h * 0.55])}Q${pt([c[0], c[1] - h * 1.2])} ${pt([c[0] + r * 0.9, c[1] - h * 0.55])}`,
          width: 0,
        });
      hat.hidesHair = true;
      hat.hidesEars = true;
      hat.reach = 0.16;
      break;
    }
    case 'crown': {
      const base = c[1] - h * 0.62;
      const points = side ? 3 : 5;
      const half = side ? r * 0.75 : r * 0.82;
      const cx = c[0] + (side ? r * 0.05 : 0);
      const pts: Pt[] = [[cx - half, base + h * 0.12]];
      for (let k = 0; k < points; k += 1) {
        const x0 = cx - half + (2 * half * k) / points;
        const x1 = cx - half + (2 * half * (k + 0.5)) / points;
        pts.push([x0, base - h * 0.2], [x1, base - h * 0.5]);
      }
      pts.push([cx + half, base - h * 0.2], [cx + half, base + h * 0.12]);
      hat.over.push([rounded(pts, 1.2), { fill: GOLD }]);
      for (let k = 0; k < points; k += 1)
        hat.over.push([
          circle(
            [cx - half + (2 * half * (k + 0.5)) / points, base - h * 0.52],
            r * 0.07,
          ),
          { fill: GOLD, stroke: 'thin' },
        ]);
      hat.over.push([
        circle([cx, base - h * 0.02], r * 0.08),
        { fill: '#c43b3b', stroke: 'thin' },
      ]);
      hat.reach = 0.25;
      break;
    }
    case 'wig': {
      const wig = '#eeece6';
      hat.over.push([
        blob(
          [
            ...arcPoints(
              [c[0], c[1] - h * 0.05],
              r * 1.1,
              h * 1.1,
              deg(180),
              deg(360),
              9,
            ),
            [c[0] + r * 0.9, c[1] - h * 0.2],
            [c[0] + r * 0.4, c[1] - h * 0.62],
            [c[0], c[1] - h * 0.66],
            [c[0] - r * 0.4, c[1] - h * 0.62],
            [c[0] - r * 0.9, c[1] - h * 0.2],
          ],
          0.7,
        ),
        { fill: wig },
      ]);
      // Rolled curls over the ears, two each side.
      for (const s of side ? [-1] : [-1, 1])
        for (const k of [0, 1])
          hat.over.push([
            capsule(
              [c[0] + s * r * 0.82, c[1] + h * (k * 0.32 - 0.05)],
              h * 0.15,
              [c[0] + s * r * 1.22, c[1] + h * (k * 0.32 - 0.05)],
              h * 0.15,
            ),
            { fill: wig },
          ]);
      hat.hidesHair = true;
      hat.hidesEars = true;
      hat.reach = 0.12;
      break;
    }
    case 'bicorne':
    case 'tricorne': {
      const felt = colour;
      if (outfit.head === 'bicorne' && !side) {
        // Worn across, its two horns out to the sides.
        hat.over.push([
          blob(
            [
              [c[0] - r * 1.75, c[1] - h * 0.55],
              [c[0] - r * 0.9, c[1] - h * 1.2],
              [c[0], c[1] - h * 1.55],
              [c[0] + r * 0.9, c[1] - h * 1.2],
              [c[0] + r * 1.75, c[1] - h * 0.55],
              [c[0] + r * 0.9, c[1] - h * 0.52],
              [c[0], c[1] - h * 0.48],
              [c[0] - r * 0.9, c[1] - h * 0.52],
            ],
            0.55,
          ),
          { fill: felt },
        ]);
        hat.over.push([
          circle([c[0] + r * 0.62, c[1] - h * 0.95], r * 0.16),
          { fill: '#3a63b8', stroke: 'thin' },
        ]);
        hat.over.push([
          circle([c[0] + r * 0.62, c[1] - h * 0.95], r * 0.08),
          { fill: '#e8e6e0', stroke: 'none' },
        ]);
        hat.lines.push({
          d: `M${pt([c[0] - r * 1.5, c[1] - h * 0.6])}Q${pt([c[0], c[1] - h * 0.75])} ${pt([c[0] + r * 1.5, c[1] - h * 0.6])}`,
          width: 2.4,
          colour: GOLD,
        });
        hat.reach = 0.6;
      } else if (outfit.head === 'bicorne') {
        hat.over.push([
          blob(
            [
              [c[0] - r * 0.8, c[1] - h * 0.5],
              [c[0] - r * 0.6, c[1] - h * 1.25],
              [c[0] + r * 0.3, c[1] - h * 1.3],
              [c[0] + r * 0.9, c[1] - h * 0.5],
            ],
            0.6,
          ),
          { fill: felt },
        ]);
        hat.reach = 0.35;
      } else {
        // Three corners: the brim turned up on three sides.
        hat.over.push([dome(0.06, 0.45, 0.92), { fill: felt }]);
        hat.over.push([
          blob(
            side
              ? [
                  [c[0] - r * 1.3, c[1] - h * 0.95],
                  [c[0] - r * 0.6, c[1] - h * 0.5],
                  [c[0] + r * 0.9, c[1] - h * 0.48],
                  [c[0] + r * 1.3, c[1] - h * 0.85],
                  [c[0] + r * 0.6, c[1] - h * 0.62],
                  [c[0] - r * 0.6, c[1] - h * 0.66],
                ]
              : [
                  [c[0] - r * 1.45, c[1] - h * 1.0],
                  [c[0] - r * 0.8, c[1] - h * 0.48],
                  [c[0], c[1] - h * 0.3],
                  [c[0] + r * 0.8, c[1] - h * 0.48],
                  [c[0] + r * 1.45, c[1] - h * 1.0],
                  [c[0] + r * 0.6, c[1] - h * 0.66],
                  [c[0], c[1] - h * 0.55],
                  [c[0] - r * 0.6, c[1] - h * 0.66],
                ],
            0.55,
          ),
          { fill: felt },
        ]);
        hat.lines.push({
          d: side
            ? `M${pt([c[0] - r * 1.1, c[1] - h * 0.85])}Q${pt([c[0], c[1] - h * 0.55])} ${pt([c[0] + r * 1.1, c[1] - h * 0.78])}`
            : `M${pt([c[0] - r * 1.3, c[1] - h * 0.92])}L${pt([c[0], c[1] - h * 0.38])}L${pt([c[0] + r * 1.3, c[1] - h * 0.92])}`,
          width: 2.2,
          colour: GOLD,
        });
        hat.reach = 0.2;
      }
      hat.hidesHair = false;
      break;
    }
    case 'top-hat':
    case 'bowler':
    case 'fedora':
    case 'straw-hat':
    case 'kepi':
    case 'pickelhaube':
    case 'fez':
    case 'kufi':
    case 'gat':
    case 'fur-hat':
    case 'beret':
    case 'flat-cap':
    case 'cap':
    case 'headband': {
      drawCapLike(outfit, hat, c, r, h, view, colour, skin);
      break;
    }
    default:
      return null;
  }
  return hat;
}

/** The hats with a crown and a brim, or a band: drawn from a few numbers each. */
function drawCapLike(
  outfit: Outfit,
  hat: Hat,
  c: Pt,
  r: number,
  h: number,
  view: View,
  colour: string,
  skin: string,
): void {
  void skin;
  const side = view === 'side';
  const ox = side ? r * 0.08 : 0;
  const crown = (
    y0: number,
    y1: number,
    w0: number,
    w1: number,
    round = 0.3,
  ): Shape =>
    rounded(
      [
        [c[0] + ox - r * w0, c[1] - h * y0],
        [c[0] + ox - r * w1, c[1] - h * y1],
        [c[0] + ox + r * w1, c[1] - h * y1],
        [c[0] + ox + r * w0, c[1] - h * y0],
      ],
      r * round,
    );
  const brim = (y: number, half: number, thick: number, dx = 0): Shape =>
    ellipse([c[0] + ox + dx, c[1] - h * y], r * half, h * thick);
  switch (outfit.head) {
    case 'top-hat':
      hat.over.push([crown(0.55, 1.75, 0.82, 0.86, 0.12), { fill: colour }]);
      hat.over.push([
        rect(c[0] + ox - r * 0.84, c[1] - h * 0.85, r * 1.68, h * 0.18, 1),
        { fill: shadeOk(colour, 0.3), stroke: 'thin' },
      ]);
      hat.over.push([brim(0.6, 1.25, 0.12), { fill: colour }]);
      hat.reach = 0.8;
      break;
    case 'bowler':
      hat.over.push([
        blob(
          arcPoints(
            [c[0] + ox, c[1] - h * 0.6],
            r * 0.92,
            h * 0.68,
            deg(180),
            deg(360),
            7,
          ),
          0.8,
        ),
        { fill: colour },
      ]);
      hat.over.push([brim(0.58, 1.18, 0.11), { fill: colour }]);
      hat.reach = 0.32;
      break;
    case 'fedora':
      hat.over.push([crown(0.55, 1.35, 0.85, 0.72, 0.35), { fill: colour }]);
      hat.over.push([
        rect(c[0] + ox - r * 0.86, c[1] - h * 0.82, r * 1.72, h * 0.16, 1),
        { fill: shadeOk(colour, 0.35), stroke: 'thin' },
      ]);
      hat.over.push([brim(0.58, 1.45, 0.14), { fill: colour }]);
      hat.reach = 0.4;
      break;
    case 'straw-hat':
      hat.over.push([brim(0.52, 1.9, 0.22), { fill: '#e2c27a' }]);
      hat.over.push([crown(0.55, 1.2, 0.8, 0.6, 0.4), { fill: '#e2c27a' }]);
      hat.over.push([
        rect(c[0] + ox - r * 0.8, c[1] - h * 0.78, r * 1.6, h * 0.14, 1),
        { fill: colour, stroke: 'thin' },
      ]);
      hat.reach = 0.25;
      break;
    case 'kepi':
      hat.over.push([crown(0.42, 1.25, 0.92, 0.8, 0.12), { fill: colour }]);
      hat.over.push([
        rect(c[0] + ox - r * 0.93, c[1] - h * 0.62, r * 1.86, h * 0.2, 1),
        { fill: '#c43b3b', stroke: 'thin' },
      ]);
      hat.over.push([
        blob(
          side
            ? [
                [c[0] + r * 0.4, c[1] - h * 0.46],
                [c[0] + r * 1.4, c[1] - h * 0.3],
                [c[0] + r * 0.5, c[1] - h * 0.3],
              ]
            : [
                [c[0] - r * 0.85, c[1] - h * 0.44],
                [c[0] + r * 0.85, c[1] - h * 0.44],
                [c[0] + r * 0.6, c[1] - h * 0.26],
                [c[0] - r * 0.6, c[1] - h * 0.26],
              ],
          0.5,
        ),
        { fill: BLACKCLOTH },
      ]);
      hat.over.push([
        circle([c[0] + ox + (side ? r * 0.6 : 0), c[1] - h * 0.9], r * 0.1),
        { fill: GOLD, stroke: 'thin' },
      ]);
      hat.hidesHair = true;
      hat.reach = 0.3;
      break;
    case 'pickelhaube':
      hat.over.push([
        blob(
          [
            ...arcPoints(
              [c[0] + ox, c[1] - h * 0.42],
              r * 1.02,
              h * 0.72,
              deg(180),
              deg(360),
              7,
            ),
            [c[0] + ox + r * 1.02, c[1] - h * 0.32],
            [c[0] + ox - r * 1.02, c[1] - h * 0.32],
          ],
          0.6,
        ),
        { fill: BLACKCLOTH },
      ]);
      hat.over.push([
        blob(
          [
            [c[0] + ox - r * 0.12, c[1] - h * 1.08],
            [c[0] + ox, c[1] - h * 1.62],
            [c[0] + ox + r * 0.12, c[1] - h * 1.08],
          ],
          0.2,
        ),
        { fill: GOLD },
      ]);
      hat.over.push([
        rect(c[0] + ox - r * 0.2, c[1] - h * 1.14, r * 0.4, h * 0.12, 1),
        { fill: GOLD, stroke: 'thin' },
      ]);
      hat.over.push([
        blob(
          side
            ? [
                [c[0] + r * 0.55, c[1] - h * 0.92],
                [c[0] + r * 0.8, c[1] - h * 0.62],
                [c[0] + r * 0.55, c[1] - h * 0.45],
              ]
            : [
                [c[0] - r * 0.3, c[1] - h * 0.8],
                [c[0], c[1] - h * 0.95],
                [c[0] + r * 0.3, c[1] - h * 0.8],
                [c[0], c[1] - h * 0.45],
              ],
          0.6,
        ),
        { fill: GOLD, stroke: 'thin' },
      ]);
      hat.over.push([
        blob(
          side
            ? [
                [c[0] + r * 0.4, c[1] - h * 0.34],
                [c[0] + r * 1.35, c[1] - h * 0.22],
                [c[0] + r * 0.5, c[1] - h * 0.24],
              ]
            : [
                [c[0] - r * 0.9, c[1] - h * 0.32],
                [c[0] + r * 0.9, c[1] - h * 0.32],
                [c[0] + r * 0.65, c[1] - h * 0.18],
                [c[0] - r * 0.65, c[1] - h * 0.18],
              ],
          0.5,
        ),
        { fill: BLACKCLOTH },
      ]);
      hat.hidesHair = true;
      hat.reach = 0.7;
      break;
    case 'fez':
      hat.over.push([
        crown(0.5, 1.28, 0.7, 0.55, 0.12),
        { fill: colour === CLOTH.brown ? CLOTH.crimson : colour },
      ]);
      hat.lines.push({
        d: `M${pt([c[0] + ox, c[1] - h * 1.28])}Q${pt([c[0] + ox + r * 0.6, c[1] - h * 1.2])} ${pt([c[0] + ox + r * 0.65, c[1] - h * 0.8])}`,
        width: 2.4,
        colour: BLACKCLOTH,
      });
      hat.reach = 0.32;
      break;
    case 'kufi':
      hat.over.push([crown(0.5, 1.12, 0.84, 0.8, 0.3), { fill: colour }]);
      hat.reach = 0.16;
      break;
    case 'gat':
      hat.over.push([
        brim(0.5, 1.75, 0.12),
        { fill: '#2b2727', opacity: 0.85 },
      ]);
      hat.over.push([
        crown(0.52, 1.5, 0.52, 0.45, 0.15),
        { fill: '#2b2727', opacity: 0.85 },
      ]);
      hat.reach = 0.55;
      break;
    case 'fur-hat': {
      const fur = blob(
        [
          [c[0] + ox - r * 1.18, c[1] - h * 0.32],
          [c[0] + ox - r * 1.25, c[1] - h * 0.95],
          [c[0] + ox - r * 0.7, c[1] - h * 1.42],
          [c[0] + ox, c[1] - h * 1.5],
          [c[0] + ox + r * 0.7, c[1] - h * 1.42],
          [c[0] + ox + r * 1.25, c[1] - h * 0.95],
          [c[0] + ox + r * 1.18, c[1] - h * 0.32],
          [c[0] + ox, c[1] - h * 0.46],
        ],
        0.85,
      );
      hat.over.push([fur, { fill: colour }]);
      hat.over.push([
        rounded(
          [
            [c[0] + ox - r * 1.2, c[1] - h * 0.62],
            [c[0] + ox + r * 1.2, c[1] - h * 0.62],
            [c[0] + ox + r * 1.15, c[1] - h * 0.3],
            [c[0] + ox - r * 1.15, c[1] - h * 0.3],
          ],
          r * 0.25,
        ),
        { fill: mixOk(colour, '#ffffff', 0.35) },
      ]);
      hat.hidesHair = true;
      hat.reach = 0.55;
      break;
    }
    case 'beret':
      hat.over.push([
        ellipse(
          [c[0] + ox + r * 0.15, c[1] - h * 0.82],
          r * 1.12,
          h * 0.32,
          deg(-8),
        ),
        { fill: colour },
      ]);
      hat.reach = 0.2;
      break;
    case 'flat-cap':
    case 'cap':
      hat.over.push([
        blob(
          arcPoints(
            [c[0] + ox, c[1] - h * 0.42],
            r * 1.02,
            h * 0.7,
            deg(180),
            deg(360),
            7,
          ),
          0.75,
        ),
        { fill: colour },
      ]);
      hat.over.push([
        blob(
          side
            ? [
                [c[0] + r * 0.5, c[1] - h * 0.48],
                [c[0] + r * 1.45, c[1] - h * 0.36],
                [c[0] + r * 0.55, c[1] - h * 0.3],
              ]
            : [
                [c[0] - r * 0.95, c[1] - h * 0.46],
                [c[0] + r * 0.95, c[1] - h * 0.46],
                [c[0] + r * 0.75, c[1] - h * 0.28],
                [c[0] - r * 0.75, c[1] - h * 0.28],
              ],
          0.5,
        ),
        { fill: shadeOk(colour, 0.15) },
      ]);
      hat.hidesHair = true;
      hat.reach = 0.1;
      break;
    case 'headband':
      hat.over.push([
        rounded(
          side
            ? [
                [c[0] - r * 1.04, c[1] - h * 0.5],
                [c[0] + r * 0.98, c[1] - h * 0.42],
                [c[0] + r * 0.98, c[1] - h * 0.28],
                [c[0] - r * 1.04, c[1] - h * 0.34],
              ]
            : [
                [c[0] - r * 1.06, c[1] - h * 0.48],
                [c[0] + r * 1.06, c[1] - h * 0.48],
                [c[0] + r * 1.06, c[1] - h * 0.32],
                [c[0] - r * 1.06, c[1] - h * 0.32],
              ],
          2,
        ),
        { fill: colour },
      ]);
      hat.reach = 0.05;
      break;
    default:
      break;
  }
}

// ── Shields and what is held ──────────────────────────────────────────────

/** A shield's face, its middle at m, `s` its size (a share of the height), facing the viewer. */
export function shieldShape(kind: Outfit['shield'], m: Pt, s: number): Shape {
  switch (kind) {
    case 'scutum':
      return rounded(
        [
          [m[0] - s * 0.34, m[1] - s * 0.5],
          [m[0] + s * 0.34, m[1] - s * 0.5],
          [m[0] + s * 0.34, m[1] + s * 0.5],
          [m[0] - s * 0.34, m[1] + s * 0.5],
        ],
        s * 0.08,
      );
    case 'kite':
      return blob(
        [
          [m[0], m[1] - s * 0.45],
          [m[0] + s * 0.3, m[1] - s * 0.32],
          [m[0] + s * 0.22, m[1] + s * 0.1],
          [m[0], m[1] + s * 0.55],
          [m[0] - s * 0.22, m[1] + s * 0.1],
          [m[0] - s * 0.3, m[1] - s * 0.32],
        ],
        0.6,
      );
    case 'heater':
      return blob(
        [
          [m[0] - s * 0.3, m[1] - s * 0.34],
          [m[0] + s * 0.3, m[1] - s * 0.34],
          [m[0] + s * 0.28, m[1] + s * 0.05],
          [m[0], m[1] + s * 0.4],
          [m[0] - s * 0.28, m[1] + s * 0.05],
        ],
        0.45,
      );
    case 'oval':
      return ellipse(m, s * 0.24, s * 0.42);
    default:
      return circle(m, s * 0.3);
  }
}

/** What a hand holds and how: upright through the fist, raised overhead, pointing down at the side, or across. */
export type Hold = 'upright' | 'raised' | 'down' | 'across';

/**
 * A prop in a hand: its shapes in the piece's units, the hand's middle at
 * `m`, held `hold`-wise, `H` the character's height. Drawn under the hand,
 * so the fist closes over its grip.
 */
export function propShapes(
  prop: Outfit['prop'],
  m: Pt,
  hold: Hold,
  H: number,
  side: string,
  facing: 1 | -1,
): [Shape, Paint][] {
  // Held down, a blade rests out and low, its point ahead of the feet; a load hangs straight.
  const blade = ['sword', 'curved-sword', 'axe', 'hammer'].includes(prop);
  const up: Pt =
    hold === 'down'
      ? blade
        ? [facing, 0.55]
        : [facing * 0.15, 1]
      : hold === 'across'
        ? [facing, -0.15]
        : hold === 'raised'
          ? [facing * 0.12, -1]
          : [0, -1];
  const len = Math.hypot(up[0], up[1]);
  const u: Pt = [up[0] / len, up[1] / len];
  const n: Pt = [-u[1], u[0]];
  const at = (along: number, across = 0): Pt =>
    add(m, add(scale(u, along * H), scale(n, across * H)));
  const WOOD = '#8a5a35';
  const out: [Shape, Paint][] = [];
  switch (prop) {
    case 'spear':
    case 'flag':
    case 'staff': {
      const top = prop === 'staff' ? 0.62 : 0.95;
      out.push([
        capsule(at(-0.32), H * 0.016, at(top), H * 0.016),
        { fill: WOOD },
      ]);
      if (prop === 'spear')
        out.push([
          blob(
            [
              at(top - 0.04, -0.03),
              at(top + 0.06, -0.035),
              at(top + 0.2),
              at(top + 0.06, 0.035),
              at(top - 0.04, 0.03),
            ],
            0.6,
          ),
          { fill: STEEL },
        ]);
      if (prop === 'flag')
        out.push([
          blob(
            [
              at(top - 0.02, 0),
              at(top - 0.04, -0.12 * facing * -1),
              at(top - 0.2, -0.38 * -facing),
              at(top - 0.3, -0.36 * -facing),
              at(top - 0.32, 0),
            ].map((p, k) => (k === 0 ? p : p)),
            0.5,
          ),
          { fill: side },
        ]);
      if (prop === 'staff')
        out.push([circle(at(top), H * 0.03), { fill: WOOD }]);
      break;
    }
    case 'sword':
      out.push([
        rounded(
          [
            at(0.02, -0.018),
            at(0.34, -0.016),
            at(0.39),
            at(0.34, 0.016),
            at(0.02, 0.018),
          ],
          1,
        ),
        { fill: STEEL },
      ]);
      out.push([
        capsule(at(0.02, -0.07), H * 0.014, at(0.02, 0.07), H * 0.014),
        { fill: GOLD },
      ]);
      out.push([
        capsule(at(-0.06), H * 0.014, at(0.02), H * 0.014),
        { fill: '#6a4428' },
      ]);
      break;
    case 'curved-sword': {
      const bend = 0.09 * facing;
      out.push([
        blob(
          [
            at(0.02, -0.02),
            at(0.16, -0.02 + bend * 0.3),
            at(0.3, bend),
            at(0.37, bend * 1.6),
            at(0.32, bend * 1.2 + 0.02),
            at(0.16, bend * 0.45 + 0.02),
            at(0.02, 0.02),
          ],
          0.6,
        ),
        { fill: STEEL },
      ]);
      out.push([
        capsule(at(0.02, -0.06), H * 0.013, at(0.02, 0.06), H * 0.013),
        { fill: GOLD },
      ]);
      out.push([
        capsule(at(-0.06), H * 0.013, at(0.02), H * 0.013),
        { fill: '#6a4428' },
      ]);
      break;
    }
    case 'axe':
      out.push([
        capsule(at(-0.12), H * 0.016, at(0.45), H * 0.016),
        { fill: WOOD },
      ]);
      out.push([
        blob(
          [
            at(0.32, 0),
            at(0.28, 0.1 * facing),
            at(0.45, 0.16 * facing),
            at(0.5, 0.1 * facing),
            at(0.44, 0),
          ],
          0.5,
        ),
        { fill: STEEL },
      ]);
      break;
    case 'bow':
      out.push([
        {
          d: `M${pt(at(-0.32, 0))}Q${pt(at(0, -0.2 * facing))} ${pt(at(0.32, 0))}`,
          box: boxOf([at(-0.32), at(0.32), at(0, -0.2 * facing)]),
        },
        { fill: 'none' },
      ]);
      break;
    case 'scroll': {
      const a = at(0.03, -0.12);
      const b = at(0.03, 0.12);
      out.push([
        rounded(
          [
            add(a, scale(u, -0.07 * H)),
            add(b, scale(u, -0.07 * H)),
            add(b, scale(u, 0.09 * H)),
            add(a, scale(u, 0.09 * H)),
          ],
          1,
        ),
        { fill: '#f1e3bd' },
      ]);
      out.push([
        capsule(
          add(a, scale(u, 0.1 * H)),
          H * 0.022,
          add(b, scale(u, 0.1 * H)),
          H * 0.022,
        ),
        { fill: '#e2cd96' },
      ]);
      out.push([
        capsule(
          add(a, scale(u, -0.08 * H)),
          H * 0.022,
          add(b, scale(u, -0.08 * H)),
          H * 0.022,
        ),
        { fill: '#e2cd96' },
      ]);
      break;
    }
    case 'book':
      out.push([
        rounded(
          [at(-0.04, -0.09), at(0.13, -0.09), at(0.13, 0.09), at(-0.04, 0.09)],
          1.5,
        ),
        { fill: '#8c3b32' },
      ]);
      out.push([
        rounded(
          [at(-0.02, 0.06), at(0.11, 0.06), at(0.11, 0.085), at(-0.02, 0.085)],
          0.5,
        ),
        { fill: '#f3ead2', stroke: 'thin' },
      ]);
      break;
    case 'sceptre':
      out.push([
        capsule(at(-0.06), H * 0.014, at(0.36), H * 0.014),
        { fill: GOLD },
      ]);
      out.push([circle(at(0.39), H * 0.035), { fill: GOLD }]);
      out.push([
        circle(at(0.39), H * 0.015),
        { fill: '#c43b3b', stroke: 'none' },
      ]);
      break;
    case 'rifle':
      out.push([
        rounded(
          [at(-0.3, -0.03), at(-0.12, -0.035), at(-0.1, 0.02), at(-0.3, 0.035)],
          2,
        ),
        { fill: '#7a4a2a' },
      ]);
      out.push([
        capsule(at(-0.12), H * 0.016, at(0.55), H * 0.012),
        { fill: '#7a4a2a' },
      ]);
      out.push([
        capsule(at(0.2, -0.012), H * 0.008, at(0.62, -0.012), H * 0.008),
        { fill: STEEL_DARK },
      ]);
      break;
    case 'telescope':
      out.push([
        capsule(at(-0.05), H * 0.03, at(0.12), H * 0.03),
        { fill: '#b98a3a' },
      ]);
      out.push([
        capsule(at(0.12), H * 0.024, at(0.3), H * 0.024),
        { fill: GOLD },
      ]);
      break;
    case 'quill':
      out.push([
        blob([at(-0.05), at(0.1, 0.04), at(0.3, 0.03), at(0.2, -0.01)], 0.7),
        { fill: '#f4f1ea' },
      ]);
      break;
    case 'basket':
      out.push([
        rounded(
          [at(0.05, -0.12), at(0.05, 0.12), at(0.2, 0.1), at(0.2, -0.1)],
          3,
        ),
        { fill: '#c99a55' },
      ]);
      break;
    case 'hammer':
      out.push([
        capsule(at(-0.05), H * 0.014, at(0.3), H * 0.014),
        { fill: WOOD },
      ]);
      out.push([
        rounded(
          [at(0.26, -0.07), at(0.26, 0.07), at(0.34, 0.07), at(0.34, -0.07)],
          1.5,
        ),
        { fill: STEEL_DARK },
      ]);
      break;
    case 'lantern':
      out.push([
        rounded(
          [at(0.06, -0.06), at(0.06, 0.06), at(0.2, 0.06), at(0.2, -0.06)],
          2,
        ),
        { fill: '#ffd36a' },
      ]);
      break;
    case 'pouch':
      out.push([ellipse(at(0.1), H * 0.055, H * 0.065), { fill: '#9a6a3c' }]);
      break;
    default:
      break;
  }
  return out;
}

/** The shapes drawn with their paints and ids, as a part's markup. */
export const drawn = (shapes: readonly [Shape, Paint][], ink: Ink): string =>
  shapes
    .map(([s, p]) =>
      p.fill === 'none'
        ? stroked(s.d, '#7a4f2e', ink.line * 1.1) +
          stroked(s.d.replace(/Q[^A-Z]+ /, 'L'), '#e8e1cf', ink.thin * 0.6)
        : painted(s.d, p, ink),
    )
    .join('');

/** The box round shapes. */
export const boxOfShapes = (shapes: readonly [Shape, Paint][]): ShotBox =>
  unionBox(shapes.map(([s]) => s.box));

export { lerp };

/** The parts a figure is posed by, for a pose's turns. */
export type Turns = Partial<Record<FigurePart, number>>;

/** Joints posed by turns, then set down. */
export const posedJoints = (rest: Joints, turns: Turns): Joints =>
  posed(rest, { turns });
