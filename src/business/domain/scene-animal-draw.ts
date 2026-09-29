/**
 * An animal drawn by the kit (scene-animal), made whole: its body in each
 * pose (scene-animal-body), its head with the kit's own eyes and feelings,
 * its mouths (the kit's on a muzzle, a beak that opens, a fish's lips), the
 * signs it shows, and the CSS that moves it all on the stage's clock.
 *
 * It plays on the stage's artist path, as an animal the artist drew does:
 * the stage sets --head (the head dipped about its neck, a share of `dip`),
 * --tail (the tail wagged on cue, with .wagging), --low (the body sunk:
 * past a third it sits, past seven tenths it lies down, and asleep it
 * curls up), --nod, and --ar and --al for a climber's arms; `lipsync` and
 * v0 to v5 for its mouth's shapes, `talking` while it speaks, `on-walking`
 * while it goes, `feel-<face>` for its tail's feelings, and `on-<sign>`.
 * A still (the card, a contact sheet) shows it standing, as drawn, since
 * every pose but standing is hidden until the stage's CSS shows it.
 */
import {
  BLINK_FRAMES,
  BLINK_S,
  FACE_MOUTHS,
  FIGURE_FACES,
  MOUTH,
  MOUTH_SHAPES,
  SIGN_ACTS,
  airCss,
  airOver,
  beatOf,
  blinkOf,
  calmBrows,
  eyeClipPath,
  faceEyes,
  faceId,
  facesFor,
  keyframes,
  mouthShape,
  mouthShapes,
  painEyes,
  shutEyes,
  shutStyle,
  signId,
  type DrawnFace,
  type FaceRig,
  type FigureSign,
} from './scene-figure';
import { FIGURE_INK, flat, inked, line } from './scene-ink';
import {
  ANIMAL_SWING,
  DANGLE_FEEL,
  cutChain,
  dangleCss,
  dangleOf,
  strideLength,
  swapRigGroups,
  type Dangle,
  type RigVersion,
} from './scene-dangles';
import type { SheetFace } from './scene-sheet-face';
import { animalTall, type AnimalSpec } from './scene-animal';
import {
  ANIMAL_POSES,
  BEAK_LINE,
  LINE,
  buildAnimal,
  lookOf,
  type AnimalPose,
  type Beak,
  type Built,
  type Gait,
} from './scene-animal-body';
import {
  add,
  blob,
  lerp,
  polar,
  pt,
  r1,
  r2,
  reachOf,
  turn,
  type P,
} from './scene-animal-shapes';

export { ANIMAL_POSES, type AnimalPose };

/**
 * An animal's face as a check measures one (drawing-checks' faceFaults):
 * its eyes and where its mouth is, exactly as drawn, since code drew them;
 * in the drawing's own units, the kit's.
 */
export function animalFace(spec: AnimalSpec, seed = ''): SheetFace {
  const drawn = drawAnimal(spec, seed);
  return {
    mouth: drawn.anchors.mouth,
    scale: 1,
    line: LINE,
    skin: '#ffffff',
    eyes: drawn.eyes.map((box) => ({ box, lid: '#ffffff' })),
    covered: {},
  };
}

/** How an animal is drawn on a page: the signs it can show, and one pose alone for a still. */
export interface AnimalHow {
  /** The signs drawn, ready to be shown: only those the page shows. */
  signs?: readonly FigureSign[];
  /** The faces drawn only when a page shows them (ASKED_FACES): eyes closed. */
  faces?: readonly string[];
  /**
   * One pose alone, as a still shows it (a contact sheet, a card): the
   * head carried where the pose puts it by the drawing itself. Absent,
   * every pose, the stage showing each as the body sinks.
   */
  pose?: AnimalPose;
  /**
   * The rig it is made with (studio-world-plan §4.6): 1, as ever, byte for
   * byte; 2, its tail, ears and mane cut into chains the player turns by
   * `--dg-<id>-<k>`, and its dangles and stride said.
   */
  rig?: RigVersion;
}

/** An animal as the kit draws it, in its own units: the kit's. */
export interface AnimalDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Its parts, by name to the id of their group: head, body, legs. */
  parts: Record<string, string>;
  /** Each face, and each sign drawn, by name to the id of its group. */
  states: Record<string, string>;
  anchors: { head: P; body: P; legs: P; mouth: P };
  /** Where its head turns about, and how far either way (degrees); none for one whose head keeps still. */
  neck: P | null;
  dip: number;
  /** How far its head drops lying down, as a share of the frame's height. */
  sinks: number;
  /** How tall its frame stands, in the kit's units: its viewBox's height. */
  units: number;
  /** Its arms turn about their shoulders, or its head nods: it acts the kit's gestures. */
  limbs: boolean;
  /** Each part that moves, and where it turns about, for a check that it stays joined. */
  joints: {
    legs: { hip: P; foot: P; step: 'a' | 'b' }[];
    tail: P | null;
    ears: P[];
    arms: P[];
    wings: P[];
  };
  /** Where its eyes are, each a box, as the stage shows them: for the face's check. */
  eyes: { x: number; y: number; width: number; height: number }[];
  /** Made with rig 2: its tail, ears and mane drawn as chains. Absent, rig 1. */
  rig?: 2;
  /** On rig 2, each part that swings, its root in the frame's units as it stands. */
  dangles?: Dangle[];
  /** On rig 2: how far one full stride carries it, in the frame's units, and how it goes. */
  stride?: { length: number; gait: Gait };
}

/** How far a stride goes for its legs, by how it goes: a waddle short, a hop long. */
const GAIT_STRIDE: Record<Gait, number> = {
  walk: 1,
  waddle: 0.6,
  hop: 1.5,
  swim: 1.2,
  slither: 0.8,
  float: 1,
};

/**
 * A body with its tails and ears cut into chains (rig 2), and a mane its
 * plan cut already: each tail and each ear, found by its rig group, cut at
 * joints code sets along it (a stub one segment, a tail three or four, a
 * long ear two, a short one one), each pose's tail with as many segments
 * as standing's. Its dangles are as it stands.
 */
function segmented(
  built: Built,
  head: string,
  id: string,
): { built: Built; head: string; dangles: Dangle[] } {
  const dangles: Dangle[] = [...(built.dangles ?? [])];
  const counts = new Map<string, number>();
  const order = [
    'stand',
    ...ANIMAL_POSES.filter((pose) => pose !== 'stand'),
  ] as AnimalPose[];
  const poses: Built['poses'] = {};
  // Ears on the head; on a creature with no head apart, on its body.
  const ear = (name: string, inner: string, pivot: P, segments?: number) => {
    const made = cutChain({
      id: name,
      markup: inner,
      root: pivot,
      segments,
      most: 2,
      stub: 1.4,
      clip: `${id}-dg-${name}`,
      limit: DANGLE_FEEL.longEar.limit,
    });
    if (!counts.has(name)) {
      counts.set(name, made.segments);
      dangles.push(dangleOf(name, made, made.segments > 1 ? 'longEar' : 'ear'));
    }
    return made.markup;
  };
  let onHead = 0;
  const ears = swapRigGroups(head, 'rig-ear', (inner, pivot, _, n) => {
    onHead = n + 1;
    return ear(`ear-${n}`, inner, pivot);
  });
  for (const pose of order) {
    const markup = built.poses[pose];
    if (markup === undefined) continue;
    const tailed = swapRigGroups(markup, 'rig-tail', (inner, pivot, _, n) => {
      const name = n ? `tail-${n + 1}` : 'tail';
      const made = cutChain({
        id: name,
        markup: inner,
        root: pivot,
        segments: counts.get(name),
        clip: `${id}-dg-${name}`,
        limit: DANGLE_FEEL.tail.limit,
      });
      if (!counts.has(name)) {
        counts.set(name, made.segments);
        dangles.push(dangleOf(name, made, 'tail'));
      }
      return made.markup;
    });
    poses[pose] = swapRigGroups(tailed, 'rig-ear', (inner, pivot, _, n) => {
      const name = `ear-${onHead + n}`;
      return ear(name, inner, pivot, counts.get(name));
    });
  }
  return { built: { ...built, poses }, head: ears, dangles };
}

/** The kit's eyes on an animal: at the kit's size in the face's own units, set on the head by `face`. */
const EYE = { rx: 15, ry: 16.5 };
/** A third eye (a creature's): how far over the pair's middle, and how large, in the face's units. */
const THIRD = { y: -34, k: 0.72 };
/** One eye's brows: set as a pair's would be this far apart, so they meet over it. */
const ONE_BROWS_DX = 9.5;
const BROWS = /<g class="brows">[\s\S]*?<\/g>/;
const withoutBrows = (markup: string) => markup.replace(BROWS, '');
const browsOf = (markup: string) => BROWS.exec(markup)?.[0] ?? '';

/** How far a pose's weight goes from sitting to lying as the body sinks: past these, each is shown. */
const SIT_FROM = 0.3;
const LIE_FROM = 0.72;
/** How far each part moves. */
const SWING = {
  breathe: 1.1,
  breatheS: 4.2,
  wag: 12,
  wagS: 1.6,
  wagAct: 28,
  happy: 18,
  happyS: 0.7,
  sad: 25,
  sadS: 3.2,
  afraid: 40,
  afraidS: 1.4,
  surprised: 15,
  ear: 4,
  earS: 3.2,
  step: 22,
  stepS: 0.92,
  arm: 110,
  flap: 30,
  flapS: 0.5,
} as const;

/** How wide each of the six mouth shapes opens a beak, degrees: shut, a little, open, wide, round, lip on teeth. */
const BEAK_SHAPES = [0, 12, 34, 27, 22, 8];
/** How far a face's own mouth opens a beak, by the kit's mouth's name. */
const BEAK_REST: Record<string, number> = {
  flat: 0,
  smile: 0,
  frown: 0,
  side: 0,
  grit: 0,
  small: 10,
  grin: 14,
  glum: 7,
  aside: 9,
  wobble: 15,
  oh: 20,
  o: 28,
  gasp: 32,
  shout: 38,
};
/** How round a fish's lips are, by the kit's mouth's name: its width and height in the face's units. */
const FISH_REST: Record<string, [number, number]> = {
  flat: [5, 3.2],
  smile: [6, 4],
  frown: [4.5, 3],
  side: [5, 3.4],
  grit: [5.5, 2.6],
  small: [6, 5],
  grin: [7, 5.5],
  glum: [5, 4],
  aside: [5.5, 4.2],
  wobble: [6.5, 5.2],
  oh: [6, 7],
  o: [7.5, 9],
  gasp: [8, 9],
  shout: [9, 9.5],
};
const FISH_SHAPES: [number, number][] = [
  [4.5, 2.6],
  [5.5, 4.2],
  [8, 8.5],
  [9, 6],
  [6, 8],
  [5.5, 3.6],
];

/** The lower half of a beak, opened `deg`, and the mouth inside it: one mouth shape of a beaked face. */
function lowerBeak(b: Beak, deg: number): string {
  const { hinge: h, len, lower } = b;
  const down = b.down + deg;
  const tip = polar(h, len * (b.kind === 'hooked' ? 0.62 : 0.88), -down);
  const under = polar(lerp(h, tip, 0.35), lower, -90 - down);
  const gap = deg
    ? `<path d="M${pt(h)} L${pt(polar(h, len * 0.86, -b.down))} L${pt(polar(h, len * 0.82, -down))} Z" ${inked(MOUTH, 1.6)}/>`
    : '';
  const shape =
    b.kind === 'flat'
      ? blob(
          [
            h,
            lerp(h, tip, 0.5),
            polar(tip, lower * 0.1, 90 - down),
            polar(tip, lower * 0.35, -down),
            polar(tip, lower * 0.6, -90 - down),
            under,
            polar(h, lower * 0.8, -90 - down),
          ],
          0.7,
        )
      : blob([h, tip, under, polar(h, lower * 0.9, -90 - down)], 0.55);
  return `${gap}<path d="${shape}" ${inked(b.colour, BEAK_LINE)}/>`;
}

/** A fish's lips: a round mouth, as wide and as open as a shape says, in the face's units about the mouth. */
const fishLips = ([w, h]: [number, number]) =>
  `<ellipse cx="0" cy="0" rx="${r1(w)}" ry="${r1(h)}" ${inked(MOUTH)}/><ellipse cx="0" cy="${r1(h * 0.35)}" rx="${r1(w * 0.5)}" ry="${r1(h * 0.28)}" ${flat('#d4777a')}/>`;

/** Every face of the kit an animal can wear: the story's seven and the kit's own. */
const FACES = FIGURE_FACES;

/** A path's points made `kx` times as wide: its x's, and an arc's width. */
function widenPath(d: string, kx: number): string {
  let command = 'M';
  let at = 0;
  return d.replace(
    /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g,
    (token: string) => {
      if (/[A-Za-z]/.test(token)) {
        command = token.toUpperCase();
        at = 0;
        return token;
      }
      const i = at;
      at += 1;
      const wide =
        command === 'H' ||
        (command === 'A'
          ? i % 7 === 0 || i % 7 === 5
          : command !== 'V' && i % 2 === 0);
      return wide ? String(r2(Number(token) * kx)) : token;
    },
  );
}

/**
 * A mouth made `kx` times as wide by its own points, not by a transform:
 * so its lines stay as heavy as the kit's all round, where a stretched
 * group would thicken its sides.
 */
function widened(markup: string, kx: number): string {
  if (kx === 1) return markup;
  const x = (v: string) => String(r2(Number(v) * kx));
  return markup.replace(
    /<(path|ellipse|rect|circle)\b([^>]*?)(\/?)>/g,
    (_, name: string, attrs: string, end: string) => {
      const keys =
        name === 'path' ? [] : name === 'rect' ? ['x', 'width'] : ['cx', 'rx'];
      let out = attrs.replace(
        /(\s)(\w+)="([^"]*)"/g,
        (whole: string, space: string, key: string, value: string) =>
          key === 'd'
            ? `${space}d="${widenPath(value, kx)}"`
            : keys.includes(key)
              ? `${space}${key}="${x(value)}"`
              : whole,
      );
      // A circle widened is an ellipse.
      if (name === 'circle')
        out = out.replace(
          /(\s)r="([^"]*)"/,
          (_w, space: string, r: string) => `${space}rx="${x(r)}" ry="${r}"`,
        );
      return `<${name === 'circle' ? 'ellipse' : name}${out}${end}>`;
    },
  );
}

/**
 * An animal settled on its ground and in its frame. In no pose does its
 * head go into the ground: lying down, a trunk or a scarf that would is
 * held that much higher. And its frame holds every pose, not standing
 * alone, so a head that swings forward curled up stays in it.
 */
function settled(built: Built, headMarkup: string): Built {
  const head = reachOf(headMarkup);
  const xs = [built.bounds.left, built.bounds.right];
  const ys = [built.bounds.top];
  const headAt: Built['headAt'] = {};
  for (const pose of ANIMAL_POSES) {
    const markup = built.poses[pose];
    if (!markup) continue;
    const at = built.headAt[pose] ?? { by: [0, 0] as P, turn: 0 };
    const moved = head.map((p) =>
      add(built.neck && at.turn ? turn(p, built.neck, at.turn) : p, at.by),
    );
    const lift = head.length
      ? Math.max(0, Math.max(...moved.map((p) => p[1])) - LINE / 2)
      : 0;
    headAt[pose] = lift
      ? { by: [at.by[0], r1(at.by[1] - lift)], turn: at.turn }
      : at;
    for (const [x, y] of [...reachOf(markup), ...moved]) {
      xs.push(x);
      ys.push(y - lift);
    }
  }
  return {
    ...built,
    headAt,
    bounds: {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
    },
  };
}

/**
 * An animal drawn from its spec. `seed` (its id) sets when it blinks and
 * breathes, so no two blink together, the same in every make.
 */
export function drawAnimal(
  spec: AnimalSpec,
  seed = '',
  how: AnimalHow = {},
): AnimalDrawing {
  const key = seed || JSON.stringify(spec);
  const id = `a${Math.floor(beatOf(`${key}:id`) * 1e6).toString(36)}`;
  const look = lookOf(spec, id);
  // On rig 2, its plan cuts its mane into a chain as it draws it.
  if (how.rig === 2) look.rig = 2;
  return drawBuilt(buildAnimal(spec, look), key, id, how);
}

/**
 * A body a kit's plan built (an animal's, or a creature's: scene-creature)
 * drawn whole: the kit's eyes and feelings on its head, its mouths, its
 * signs, every pose, and the CSS that moves it. `key` sets its beat (when
 * it blinks and breathes), `id` its clip paths' ids.
 */
export function drawBuilt(
  from: Built,
  key: string,
  id: string,
  how: AnimalHow = {},
): AnimalDrawing {
  let built = from;
  const beat = beatOf(key);
  const poses = ANIMAL_POSES.filter((pose) => built.poses[pose]);
  // A pose it has not got is the one the stage shows for it: lying down
  // for sitting (a horse lies down when told to sit) or curled up, else
  // standing.
  const standIn = (pose: AnimalPose): AnimalPose =>
    built.poses[pose]
      ? pose
      : (pose === 'sit' || pose === 'curl') && built.poses.lie
        ? 'lie'
        : 'stand';
  const shown: AnimalPose[] = how.pose ? [standIn(how.pose)] : poses;
  const signs = how.signs ?? [];
  const asked = facesFor(how.faces);

  // ── The face, the kit's, in its own units about its middle.
  const { face, mouth } = built;
  const s = face.s;
  // Two eyes, as every animal has; a creature may have one, or three.
  const count = face.count ?? 2;
  const rig: FaceRig = {
    eyes: { y: 0, dx: count === 1 ? 0 : face.dx, rx: EYE.rx, ry: EYE.ry },
    mouthY: 22,
  };
  // One eye alone, in the pair's middle: a third's, or a one-eyed face's.
  const oneRig: FaceRig = { eyes: { ...rig.eyes, dx: 0 }, mouthY: 22 };
  const faceAt = `translate(${r1(face.at[0])} ${r1(face.at[1])}) scale(${Math.round(s * 1000) / 1000})`;
  const inFace = (markup: string) =>
    `<g transform="${faceAt}" stroke-width="${r2(face.eyeLine / s)}">${markup}</g>`;
  // Brows and lids as heavy as the kit's on a face the size of a person's,
  // lighter on a small one, so a small face is not all brow.
  const browK = Math.round(((face.eyeLine + 0.2) / (3.4 * s)) * 100) / 100;
  const lidK = Math.round((Math.min(2.4, face.eyeLine) / (3 * s)) * 100) / 100;
  const clip = `${id}-eyes`;
  // A third eye over the pair, smaller, its lines as heavy as theirs.
  const third = (markup: string) =>
    `<g transform="translate(0 ${THIRD.y}) scale(${THIRD.k})" stroke-width="${r2(face.eyeLine / s / THIRD.k)}">${markup}</g>`;
  const white = (dx: number) =>
    `<ellipse cx="${dx}" cy="0" rx="${EYE.rx}" ry="${EYE.ry}" ${inked('#ffffff')}/>`;
  const pairWhites = [-1, 1].map((side) => white(side * face.dx)).join('');
  const whites = inFace(
    count === 1
      ? white(0)
      : count === 3
        ? pairWhites + third(white(0))
        : pairWhites,
  );
  // The mouth, at its own place: the kit's on a muzzle, scaled, its lines
  // as heavy as the kit's; a beak's lower half; a fish's lips.
  const ms = mouth.s;
  const mouthLine = Math.max(1.5, Math.min(LINE, LINE * (ms / 0.34)));
  const mouthK = Math.round((2.6 / (3 * ms)) * 100) / 100;
  const atMouth = (markup: string, className = '') =>
    mouth.kind === 'beak'
      ? `<g${className ? ` class="${className}"` : ''}>${markup}</g>`
      : `<g${className ? ` class="${className}"` : ''} transform="translate(${r1(mouth.at[0])} ${r1(mouth.at[1])}) scale(${r2(ms)})" stroke-width="${r2(mouthLine / ms)}">${widened(markup, mouth.wide)}</g>`;
  const mouthOf = (name: string): string => {
    if (mouth.kind === 'beak')
      return lowerBeak(mouth.beak!, BEAK_REST[name] ?? 0);
    if (mouth.kind === 'fish') return fishLips(FISH_REST[name] ?? [6, 5]);
    return mouthShape(name, 0, mouthK);
  };
  const shapes =
    mouth.kind === 'beak'
      ? BEAK_SHAPES.map((deg) => lowerBeak(mouth.beak!, deg))
      : mouth.kind === 'fish'
        ? FISH_SHAPES.map(fishLips)
        : mouthShapes(0, mouthK);
  const pairEyes = (name: DrawnFace) =>
    name === 'pain'
      ? painEyes(rig, face.skin, browK)
      : faceEyes(name, rig, face.skin, clip, browK);
  // One eye: its lids and pupil, under brows that meet over it as a
  // pair's would; squeezed shut in pain.
  const browsRig: FaceRig = {
    eyes: { ...rig.eyes, dx: ONE_BROWS_DX },
    mouthY: 22,
  };
  const oneEye = (name: DrawnFace, clipId: string, brows: boolean) => {
    const eye =
      name === 'pain'
        ? `<ellipse cx="0" cy="0" rx="${EYE.rx + 0.8}" ry="${EYE.ry + 0.8}" ${flat(face.skin)}/>${line('M-10,-5 L0,2 L10,-5', FIGURE_INK, r2(3.4 * browK))}`
        : withoutBrows(faceEyes(name, oneRig, face.skin, clipId, browK));
    if (!brows) return eye;
    return (
      eye +
      browsOf(
        name === 'pain'
          ? painEyes(browsRig, face.skin, browK)
          : faceEyes(name, browsRig, face.skin, clipId, browK),
      )
    );
  };
  const eyesOf = (name: DrawnFace): string =>
    count === 1
      ? oneEye(name, clip, true)
      : count === 3
        ? pairEyes(name) + third(oneEye(name, `${clip}3`, false))
        : pairEyes(name);
  const faces = FACES.map((name: DrawnFace) => {
    const eyes = eyesOf(name);
    const mouths =
      name === 'pain' ? { mouth: 'grit', talk: 'shout' } : FACE_MOUTHS[name];
    return `<g id="${name}">${inFace(eyes)}${atMouth(mouthOf(mouths.mouth), 'mouth')}${atMouth(mouthOf(mouths.talk), 'talk" opacity="0')}</g>`;
  }).join('');
  const lipShapes = atMouth(
    shapes.map((shape, k) => `<g class="vm v${k}">${shape}</g>`).join(''),
    'mouths',
  );
  const lids = (markup = '') =>
    inFace(
      blinkOf({ eyes: rig.eyes, cy: -3 }, face.skin, 0, -3, lidK) +
        (count === 3
          ? third(
              blinkOf(
                { eyes: oneRig.eyes, cy: -3 },
                face.skin,
                0,
                -3,
                r2(lidK / THIRD.k),
              ),
            )
          : '') +
        markup,
    );
  const blinkAt = r1(0.3 + beatOf(`${key}:blink`) * 2.4);
  // Eyes closed: every eye shut, its outline under the skin too, brows at
  // rest over the pair (over one eye, as a pair's meet over it), and the
  // calm face's mouth.
  const pad = face.eyeLine / s / 2 + 0.7;
  const shut =
    shutEyes(rig, face.skin, lidK, pad) +
    (count === 3
      ? third(
          shutEyes(
            oneRig,
            face.skin,
            r2(lidK / THIRD.k),
            face.eyeLine / s / THIRD.k / 2 + 0.7,
          ),
        )
      : '') +
    calmBrows(count === 1 ? browsRig : rig, browK);
  const closed = asked
    .map(
      (name) =>
        `<g id="${faceId(name)}">${inFace(shut)}${atMouth(mouthOf(FACE_MOUTHS.neutral.mouth), 'mouth')}${atMouth(mouthOf(FACE_MOUTHS.neutral.talk), 'talk" opacity="0')}</g>`,
    )
    .join('');

  // ── Signs: what floats over its head, and what shows on its face.
  const states: Record<string, string> = Object.fromEntries([
    ...FACES.map((name): [string, string] => [name, name]),
    ...asked.map((name): [string, string] => [name, faceId(name)]),
  ]);
  const signGroups = signs.map((sign) => {
    const gid = `a-${signId(sign)}`;
    states[sign] = gid;
    const air = airOver(
      add(built.anchors.head, [0, -4]),
      Math.max(0.45, s * 2.2),
      sign,
    );
    const onFace =
      sign === 'sleeping'
        ? lids()
        : sign === 'tears'
          ? inFace(
              [-1, 1]
                .map((side) =>
                  line(
                    `M${pt([side * face.dx + side * 4, 13])} Q${pt([side * face.dx + side * 9, 22])} ${pt([side * face.dx + side * 8, 34])}`,
                    '#6cb8e6',
                    r2(4.5 * lidK),
                  ),
                )
                .join(''),
            )
          : '';
    return { gid, air, onFace };
  });

  // ── The head, whole: its shape, its eyes, every face and mouth it has.
  let headGroup = [
    built.head,
    whites,
    faces,
    closed,
    lipShapes,
    `<g class="blink" opacity="0">${lids()}</g>`,
    // What goes over the eyes (a creature's glasses).
    built.over ?? '',
    ...signGroups
      .filter((one) => one.onFace)
      .map((one) => `<g id="${one.gid}-face">${one.onFace}</g>`),
  ].join('');
  // Settled on its ground and in its frame, by all of its head: a mouth
  // opened wide keeps out of the ground too.
  built = settled(built, headGroup);
  // On rig 2, its tail, ears and mane cut into chains: after it is
  // settled, so its frame is as it was.
  let dangles: Dangle[] = [];
  if (how.rig === 2)
    ({ built, head: headGroup, dangles } = segmented(built, headGroup, id));

  // ── The poses: each its own group, all but standing hidden in a still.
  const neck = built.neck;
  const headAt = (pose: AnimalPose) =>
    built.headAt[pose] ?? { by: [0, 0] as P, turn: 0 };
  const onePose = how.pose ? shown[0] : null;
  const fixed = onePose ? headAt(onePose) : null;
  // A still's pose carries the head by the drawing itself: a group round
  // it, never on it, so the stage's turning of it is all that is on it.
  const headMove =
    fixed && (fixed.by[0] || fixed.by[1] || fixed.turn)
      ? `translate(${r1(fixed.by[0])} ${r1(fixed.by[1])})${fixed.turn && neck ? ` rotate(${r1(fixed.turn)} ${r1(neck[0])} ${r1(neck[1])})` : ''}`
      : '';
  const poseGroups = shown
    .map(
      (pose) =>
        `<g class="a-pose a-${pose}"${onePose || pose === 'stand' ? '' : ' opacity="0"'}>${pose === 'stand' ? built.poses[pose] : ownIds(built.poses[pose]!, pose)}</g>`,
    )
    .join('');
  // A sign's state is one group: its face part, and what floats over it.
  const signMarkup = signGroups
    .map((one) => `<g id="${one.gid}">${one.air}</g>`)
    .join('');

  // ── The frame: round all of it, its bottom the ground its feet are on
  // (and their outline's half below it). The stage stands it on its
  // bottom edge, as it does one the artist drew.
  const left = built.bounds.left - 5;
  const right = built.bounds.right + 5;
  const top = built.bounds.top - 6;
  const bottom = LINE / 2;
  // Its top and its bottom each where they are, the height between them.
  const viewBox: [number, number, number, number] = [
    r1(left),
    r1(top),
    r1(right - left),
    r1(bottom - r1(top)),
  ];
  const shadowW = Math.max(10, (built.bounds.right - built.bounds.left) * 0.38);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">`,
    `<style>${animalCss(built, poses, how.pose ?? null, signs, beat, blinkAt, id, how.rig === 2)}${shutStyle(asked)}${how.rig === 2 ? dangleCss(dangles) : ''}</style>`,
    `<defs>${eyeClipPath(rig, clip)}${count === 3 ? eyeClipPath(oneRig, `${clip}3`) : ''}</defs>`,
    `<ellipse cx="0" cy="-0.6" rx="${r1(shadowW)}" ry="${r1(Math.min(2, shadowW * 0.1))}" fill="#1d1a22" fill-opacity="0.16"/>`,
    `<g class="a-root" stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round" stroke-linecap="round">`,
    `<g class="whole"><g class="a-gait">`,
    poseGroups,
    `<g class="rig-breathe">${headMove ? `<g transform="${headMove}">` : ''}<g id="head" class="a-head${neck ? ' rig-head' : ''}"${neck ? ` style="transform-origin:${r1(neck[0])}px ${r1(neck[1])}px"` : ''}>${headGroup}</g>${headMove ? '</g>' : ''}</g>`,
    signMarkup,
    `</g></g>`,
    `</g>`,
    `</svg>`,
  ].join('');
  // Where the eyes are on the stage, each a box in the drawing's units.
  const eyeBox = (dx: number, dy = 0, k = 1) => {
    const cx = face.at[0] + dx * s;
    return {
      x: r1(cx - EYE.rx * k * s),
      y: r1(face.at[1] + dy * s - EYE.ry * k * s),
      width: r1(EYE.rx * 2 * k * s),
      height: r1(EYE.ry * 2 * k * s),
    };
  };
  const eyes =
    count === 1
      ? [eyeBox(0)]
      : [
          ...[-1, 1].map((side) => eyeBox(side * face.dx)),
          ...(count === 3 ? [eyeBox(0, THIRD.y, THIRD.k)] : []),
        ];
  const mouthAt: P =
    mouth.kind === 'beak'
      ? polar(mouth.beak!.hinge, mouth.beak!.len * 0.55, -mouth.beak!.down)
      : mouth.at;
  return {
    svg,
    viewBox,
    parts: { head: 'head', body: 'body', legs: 'legs' },
    states: {
      ...states,
      ...Object.fromEntries(signGroups.map((one, k) => [signs[k], one.gid])),
    },
    anchors: {
      head: built.anchors.head,
      body: built.anchors.body,
      legs: built.anchors.legs,
      mouth: [r1(mouthAt[0]), r1(mouthAt[1])],
    },
    neck,
    dip: neck ? built.dip : 0,
    sinks: Math.round((built.sink / viewBox[3]) * 1000) / 1000,
    units: viewBox[3],
    limbs: Boolean(neck) || built.arms.length > 0,
    joints: {
      legs: built.legs,
      tail: built.tail,
      ears: built.ears,
      arms: built.arms,
      wings: built.wings,
    },
    eyes,
    ...(how.rig === 2
      ? {
          rig: 2 as const,
          ...(dangles.length ? { dangles } : {}),
          stride: strideOf(built),
        }
      : {}),
  };
}

/**
 * How far one full stride carries it (studio-world-plan §4.2): as far as
 * its legs, hip to foot, carry it swung as far as they step, each foot
 * planted, by how it goes; one with no legs, by its length.
 */
function strideOf(built: Built): { length: number; gait: Gait } {
  const legs = built.legs.map((one) =>
    Math.hypot(one.foot[0] - one.hip[0], one.foot[1] - one.hip[1]),
  );
  const leg = legs.length
    ? legs.reduce((a, b) => a + b, 0) / legs.length
    : (built.bounds.right - built.bounds.left) * 0.45;
  return {
    length: r1(strideLength(leg, ANIMAL_SWING) * GAIT_STRIDE[built.gait]),
    gait: built.gait,
  };
}

/**
 * A pose's markup with ids of its own: each id it defines (a part's, a
 * clip's) given the pose's name, and what points at them with it. What it
 * points at elsewhere (a clip standing draws) is left as it is.
 */
export function ownIds(markup: string, pose: string): string {
  const defined = new Set(
    [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  );
  if (!defined.size) return markup;
  const own = (id: string) => (id.endsWith(`-${pose}`) ? id : `${id}-${pose}`);
  return markup
    .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${own(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (whole, id: string) =>
      defined.has(id) ? `url(#${own(id)})` : whole,
    );
}

/** A sum of weights times amounts, as CSS: "calc(var(--a-sit)*12px + …)", or none. */
function linear(terms: [string, number][], unit: string): string {
  const kept = terms.filter(([, n]) => Math.abs(n) >= 0.01);
  return kept.length
    ? `calc(${kept.map(([w, n]) => `${w}*${r2(n)}${unit}`).join(' + ')})`
    : `0${unit}`;
}

/**
 * How a body on rig 2 goes, as the player sets it: its legs about their
 * hips by --step-a and --step-b, degrees (each pair of legs that step
 * together, a quadruped's diagonals); the whole of it up by --gait-y
 * units and rocked by --gait-r degrees about its feet (a bob, a waddle,
 * a hop); a slither skewed by --gait-k degrees. At 0 every one, as drawn.
 */
function gaitCss(built: Built): string {
  const out: string[] = [];
  if (built.legs.length)
    out.push(
      '.rig-leg{transform-box:view-box}.rig-leg-a{rotate:calc(var(--step-a,0)*1deg)}.rig-leg-b{rotate:calc(var(--step-b,0)*1deg)}',
    );
  out.push(
    `.a-gait{transform-box:view-box;transform-origin:0 0;translate:0 calc(var(--gait-y,0)*-1px);rotate:calc(var(--gait-r,0)*1deg)${built.gait === 'slither' ? ';transform:skewX(calc(var(--gait-k,0)*1deg))' : ''}}`,
  );
  return out.join('');
}

/**
 * The animal's own motion: a breath, a blink on its own beat, a mouth that
 * talks and takes the voice's shapes, a tail that wags and shows how it
 * feels, twitching ears, a head that dips and nods, legs that step as it
 * goes (or a waddle, a hop, a swish, a sway), arms that point and wave, and
 * the pose it is in as the body sinks.
 */
function animalCss(
  built: Built,
  poses: AnimalPose[],
  still: AnimalPose | null,
  signs: readonly FigureSign[],
  beat: number,
  blinkAt: number,
  id: string,
  /**
   * Made with rig 2: it goes as the player walks it (studio-world-plan
   * §4.2), its legs stepped by --step-a and --step-b (degrees about each
   * hip) and its body by --gait-y (units up and down), --gait-r (degrees
   * rocked) and --gait-k (degrees skewed, a slither), each set by how far
   * it has gone, so no loop of its own steps it.
   */
  rig2 = false,
): string {
  const out: string[] = [];
  const rest = (cycle: number) => {
    // A swing at its middle, as drawn, on the stage's still frame (1.5s).
    const d = (1.5 - cycle / 4) % cycle;
    return r2(d > 0 ? d - cycle : d);
  };
  const swing = (name: string, a: number, b: number) =>
    `@keyframes ${name}{0%,100%{transform:rotate(${r2(a)}deg)}50%{transform:rotate(${r2(b)}deg)}}`;
  out.push(
    `.rig-breathe{animation:a-breathe ${SWING.breatheS}s ease-in-out -${r1(beat * SWING.breatheS)}s infinite}`,
    `@keyframes a-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-${SWING.breathe}px)}}`,
    `.blink{animation:blink ${BLINK_S}s linear -${blinkAt}s infinite}@keyframes blink{${BLINK_FRAMES}}`,
    '.talking .mouth{animation:shut 1.2s linear infinite}.talking .talk{animation:talk 1.2s linear infinite}',
    keyframes('talk', true),
    keyframes('shut', false),
    '.vm{opacity:0}.lipsync .mouth,.lipsync .talk{opacity:0}',
    `${Array.from({ length: MOUTH_SHAPES }, (_, k) => `.lipsync.v${k} .v${k}`).join(',')}{opacity:1}`,
  );
  // The tail: its own wag, the stage's wag on cue, and how it feels.
  if (built.tail) {
    const droop = -1;
    out.push(
      `.rig-tail{transform-box:view-box;animation:a-wag ${SWING.wagS}s ease-in-out ${rest(SWING.wagS)}s infinite;rotate:calc(var(--tail,0)*${SWING.wagAct}deg)}`,
      swing('a-wag', -SWING.wag, SWING.wag),
      '.wagging .rig-tail{animation:none;transform:none}',
      `.feel-happy .rig-tail{animation:a-happy ${SWING.happyS}s ease-in-out infinite}${swing('a-happy', -SWING.happy, SWING.happy)}`,
      `.feel-sad .rig-tail{animation:a-sad ${SWING.sadS}s ease-in-out infinite}${swing('a-sad', droop * SWING.sad, droop * SWING.sad * 0.88)}`,
      `.feel-afraid .rig-tail{animation:a-afraid ${SWING.afraidS}s ease-in-out infinite}${swing('a-afraid', droop * SWING.afraid, droop * SWING.afraid * 0.93)}`,
      `.feel-surprised .rig-tail{animation:none;transform:rotate(${-droop * SWING.surprised}deg)}`,
    );
  }
  if (built.ears.length)
    out.push(
      `.rig-ear{transform-box:view-box;animation:a-ear ${SWING.earS}s ease-in-out ${rest(SWING.earS)}s infinite}.rig-ear-r{animation-name:a-ear-r}`,
      swing('a-ear', -SWING.ear, SWING.ear),
      swing('a-ear-r', SWING.ear, -SWING.ear),
    );
  // Wings: folded, beating while it hops or is startled.
  if (built.wings.length)
    out.push(
      `.rig-flap{transform-box:view-box}.on-jumping .rig-flap,.feel-surprised .rig-flap,.feel-afraid .rig-flap${built.gait === 'hop' ? ',.on-walking .rig-flap' : ''}${built.gait === 'swim' ? ',.rig-flap' : ''}{animation:a-flap ${SWING.flapS}s ease-in-out infinite}`,
      `@keyframes a-flap{0%,100%{transform:rotate(0deg)}50%{transform:rotate(${built.gait === 'swim' ? 18 : -SWING.flap}deg)}}`,
    );
  // The head: dipped and nodded about its neck; a pose carries it.
  const neck = built.neck;
  const head = neck
    ? `calc(var(--head,0)*${built.dip}deg + clamp(0,var(--nod,0),7)*1.6deg)`
    : '';
  if (neck) out.push(`.rig-head{transform-box:view-box;rotate:${head}}`);
  // The poses, each shown as the body sinks: a little on its legs, then
  // sitting, then lying down; curled up asleep.
  const has = (pose: AnimalPose) => poses.includes(pose);
  if (!still && poses.length > 1) {
    const sit = has('sit') ? 'var(--a-sit)' : 'var(--a-lie)';
    // Only where custom properties are known (a browser): a renderer that
    // does not know them (a still made on the server) shows each pose as
    // drawn, standing, the rest hidden by their own opacity.
    out.push(
      '@supports (opacity:var(--a)){',
      `.a-root{--a-sit:clamp(0,(var(--low,0) - ${SIT_FROM})*25,1);--a-lie:clamp(0,(var(--low,0) - ${has('sit') ? LIE_FROM : SIT_FROM})*25,1)}`,
      `.a-stand{opacity:calc(1 - ${sit})}`,
      has('sit') ? '.a-sit{opacity:calc(var(--a-sit) - var(--a-lie))}' : '',
      has('lie') ? '.a-lie{opacity:var(--a-lie)}' : '',
      has('curl')
        ? `.a-curl{opacity:0}.on-a-sleeping .a-lie{opacity:0}.on-a-sleeping .a-curl{opacity:var(--a-lie)}`
        : '',
      '}',
    );
    // Standing, the body sinks a little on its legs (a crouch, a dig).
    const hip = built.legs.length
      ? Math.max(...built.legs.map((one) => -one.hip[1]))
      : 0;
    const give = r2(hip * 0.5);
    if (built.legs.length)
      out.push(
        `.a-stand .rig-legs{transform-box:view-box;transform-origin:0 0;scale:1 calc(1 - min(var(--low,0),${SIT_FROM})*0.5)}`,
        `.a-stand .rig-breathe{translate:0 calc(min(var(--low,0),${SIT_FROM})*${give}px)}`,
      );
    const at = (pose: AnimalPose) =>
      built.headAt[pose] ?? { by: [0, 0] as P, turn: 0 };
    const sitAt = has('sit') ? at('sit') : at('lie');
    const lieAt = at('lie');
    const curlAt = has('curl') ? at('curl') : lieAt;
    const SIT = 'var(--a-sit)';
    const LIE = 'var(--a-lie)';
    const sunk = `min(var(--low,0),${SIT_FROM})*(1 - var(--a-sit))`;
    const x: [string, number][] = [
      [SIT, sitAt.by[0]],
      [LIE, lieAt.by[0] - sitAt.by[0]],
    ];
    const y: [string, number][] = [
      ...(built.legs.length ? [[sunk, give] as [string, number]] : []),
      [SIT, sitAt.by[1]],
      [LIE, lieAt.by[1] - sitAt.by[1]],
    ];
    const turned: [string, number][] = [
      ['var(--head,0)', built.dip],
      ['clamp(0,var(--nod,0),7)', 1.6],
      [SIT, sitAt.turn],
      [LIE, lieAt.turn - sitAt.turn],
    ];
    const moves = (
      xs: [string, number][],
      ys: [string, number][],
      turns: [string, number][],
    ) =>
      `translate:${linear(xs, 'px')} ${linear(ys, 'px')}${neck ? `;rotate:${linear(turns, 'deg')}` : ''}`;
    out.push(`.a-head{${moves(x, y, turned)}}`);
    if (has('curl'))
      out.push(
        `.on-a-sleeping .a-head{${moves(
          x,
          [...y, [LIE, curlAt.by[1] - lieAt.by[1]]],
          [...turned, [LIE, curlAt.turn - lieAt.turn]],
        )}}`,
      );
  }
  // Going somewhere: legs that step, a bob; a waddle, a hop, a swish, a
  // sway. On rig 2, the player's, by how far it has gone.
  if (rig2) out.push(gaitCss(built));
  const step = rig2
    ? 0
    : built.gait === 'waddle'
      ? 14
      : built.gait === 'hop'
        ? 0
        : SWING.step;
  if (step && built.legs.length)
    out.push(
      `.rig-leg{transform-box:view-box}.on-walking .rig-leg-a{animation:step ${SWING.stepS}s ease-in-out infinite}.on-walking .rig-leg-b{animation:step ${SWING.stepS}s ease-in-out ${-SWING.stepS / 2}s infinite}`,
      swing('step', -step, step),
    );
  switch (rig2 ? null : built.gait) {
    case null:
      if (built.gait === 'float')
        out.push(
          `.a-gait{animation:float 2.6s ease-in-out -${r1(beat * 2.6)}s infinite}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`,
        );
      break;
    case 'waddle':
      out.push(
        '.on-walking .a-gait{transform-box:view-box;transform-origin:0 0;animation:a-waddle .46s ease-in-out infinite}',
        swing('a-waddle', -6, 6),
      );
      break;
    case 'hop':
      out.push(
        '.on-walking .a-gait{animation:bob .42s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}45%{transform:translateY(-7px)}}',
      );
      break;
    case 'swim':
      out.push(
        '.on-walking .rig-tail{animation:a-wag .45s ease-in-out infinite}.on-walking .a-gait{animation:bob .9s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}',
      );
      break;
    case 'float':
      // Floating: a slow rise and fall always, drifting as it goes.
      out.push(
        `.a-gait{animation:float 2.6s ease-in-out -${r1(beat * 2.6)}s infinite}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`,
        '.on-walking .a-gait{animation-duration:1.3s}',
      );
      break;
    case 'slither':
      out.push(
        '.on-walking .a-gait{transform-box:view-box;transform-origin:0 0;animation:a-slither .7s ease-in-out infinite}@keyframes a-slither{0%,100%{transform:skewX(-6deg)}50%{transform:skewX(6deg)}}',
      );
      break;
    default:
      out.push(
        `.on-walking .a-gait{animation:bob ${SWING.stepS / 2}s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}`,
      );
  }
  // A climber's arms, turned as the kit's people's are.
  if (built.arms.length)
    out.push(
      '.rig-arm{transform-box:view-box}',
      `.rig-arm-r{rotate:calc(clamp(${-SWING.arm}, var(--ar,0), ${SWING.arm})*1deg)}`,
      `.rig-arm-l{rotate:calc(clamp(${-SWING.arm}, var(--al,0), ${SWING.arm})*1deg)}`,
    );
  // What its signs move: the marks over its head, and the whole of it.
  out.push(airCss(signs));
  const whole = signs.filter((sign) => SIGN_ACTS[sign]?.includes('.whole'));
  if (whole.length)
    out.push(
      '.whole{transform-box:view-box;transform-origin:0 0}',
      ...whole.map((sign) => SIGN_ACTS[sign] ?? ''),
    );
  // A sleeping face shows with the sign.
  out.push(
    ...signs.map((sign) =>
      sign === 'sleeping' || sign === 'tears'
        ? `#a-${signId(sign)}-face{opacity:0}.on-a-${signId(sign)} #a-${signId(sign)}-face{opacity:1}`
        : '',
    ),
  );
  void id;
  return out.filter(Boolean).join('');
}

/** How tall an animal stands, and its frame, as the stage stands it: in the kit's units. */
export function animalUnits(spec: AnimalSpec): number {
  return drawAnimal(spec, 'units').units;
}

export { animalTall };
