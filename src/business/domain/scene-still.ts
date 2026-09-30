/**
 * A Studio film's moment as a still (studio-scenery-plan §8.6): its set's
 * layers, each where the camera has it then (a far layer moved less than
 * the people, one before the camera more), the features the stage draws
 * and the people on the floor at their depths, drawn back to front by
 * their feet, and what stands before the camera over them. Each piece is
 * rendered on its own and laid in place, so no two drawings' ids or
 * styles ever meet in one document. A person the kit draws is posed as
 * they are then: their arms, written into the drawing as transforms, as
 * a renderer that knows no CSS variables never turns them.
 *
 * Everything but the rendering is a pure function of the scene and the
 * moment (stillPlan), so what a still shows can be checked without one.
 */
import type {
  SceneDto,
  ScenePlaceDto,
  SceneSetLayerDto,
} from '../../contracts';
import { DEPTH_TIE } from './scene-faces-seen';
import {
  CROWD_ID,
  crowdShown,
  featureSvgAt,
  hiddenAt,
  withoutStandIns,
} from './scene-compose';
import { posedDangles } from './scene-dangles';
import {
  FLOOR_BACK_F,
  FLOOR_FRONT_F,
  PARALLAX,
  angleLayer,
  anglePeople,
  floorFactor,
  gripBox,
  handOverAt,
  handsAt,
  holdPoint,
  holderOn,
  isReverse,
  meetPoint,
  nearOf,
  sideToward,
  obstaclesOf,
  thingBoxAt,
  type Holder,
  type ThingsOnStage,
  reflectPlace,
  reflectRoom,
  roomOf,
  restOn,
  viewOf,
  type SetRoom,
  type View,
} from './scene-film';
import { setFrameFor, stillSize } from './scene-shape';
import { viewOnly } from './scene-figure-views';
import {
  faceGroupsOf,
  faceInScene,
  hasRigFace,
  withRigFace,
} from './scene-face-draw';
import type { SceneEffectDto, SceneThingDto, SceneView } from '../../contracts';
import { HEAD } from './scene-figure';
import { PAPER as PAPER_THEME } from './scene-themes';

export { FLOOR_BACK_F, FLOOR_FRONT_F, floorFactor };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The ground's own depth: a crowd in its set stands on it. */
const GROUND_DEPTH = 0.72;

/** The camera at a moment as the player moves it: a scale about a point, and a pan past the frame across a wide set. */
export interface StillCamera {
  s: number;
  cx: number;
  cy: number;
  px: number;
  span: [number, number];
}

/** The camera for a view, as the player's viewAt: the zoom kept inside the frame, the rest of the way across a pan. */
export function stillCamera(
  view: View,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): StillCamera {
  const s = Math.max(1, view.s);
  const hw = W / (2 * s);
  const hh = H / (2 * s);
  const vx = Math.min(W - hw, Math.max(hw, view.x));
  const vy = Math.min(H - hh, Math.max(hh, view.y));
  const px = (view.x - vx) * s;
  const base =
    s <= 1.0001
      ? { s: 1, cx: W / 2, cy: H / 2 }
      : { s, cx: (W / 2 - s * vx) / (1 - s), cy: (H / 2 - s * vy) / (1 - s) };
  return { ...base, px, span: [span[0], span[1]] };
}

/** A layer at `depth`'s scale and pan under the camera: never past the set's edge (the player's panOf). */
function layerOf(cam: StillCamera, depth: number): { s: number; pan: number } {
  const s = 1 + (cam.s - 1) * depth;
  const pan = Math.min(
    cam.span[1] * s,
    Math.max(-cam.span[0] * s, cam.px * depth),
  );
  return { s, pan };
}

/** Where a box of the stage shows in the frame, on a layer at `depth`. */
export function onScreen(cam: StillCamera, depth: number, box: Box): Box {
  const { s, pan } = layerOf(cam, depth);
  return {
    x: cam.cx + s * (box.x - cam.cx) - pan,
    y: cam.cy + s * (box.y - cam.cy),
    w: box.w * s,
    h: box.h * s,
  };
}

/** What of a layer at `depth` the frame shows, in stage units: its left, top, width and height. */
export function layerWindow(
  cam: StillCamera,
  depth: number,
  W: number,
  H: number,
): Box {
  const { s, pan } = layerOf(cam, depth);
  return {
    x: cam.cx + (pan - cam.cx) / s,
    y: cam.cy - cam.cy / s,
    w: W / s,
    h: H / s,
  };
}

/** The step drawn at `t`: in a film, the first before it begins. */
export function stepAtMoment(scene: SceneDto, t: number): number {
  let k = 0;
  scene.steps.forEach((step, i) => {
    if (step.atMs <= t) k = i;
  });
  return k;
}

/**
 * Where the camera looks at `t`, as the film shows it: the shot on then
 * (a zoom held until its end), else the wide shot, which on a wide set is
 * on where the action is. The player's camera without its life (the slow
 * push, the lean, the moves), which a still does not need.
 */
export function viewAtMoment(scene: SceneDto, t: number, room: SetRoom): View {
  const { w: W, h: H, places } = scene.stagings.wide;
  const k = stepAtMoment(scene, t);
  const step = scene.steps[k];
  return viewOf(
    shotAtMoment(scene, t),
    step?.show ?? [],
    places[k] ?? {},
    W,
    H,
    room,
    restOn(scene, k),
  );
}

/** The shot on at `t`, if any: a zoom held until its end. */
export function shotAtMoment(
  scene: SceneDto,
  t: number,
): SceneEffectDto | null {
  return (
    scene.effects.find(
      (e) =>
        e.do === 'zoom' &&
        e.atMs <= t &&
        t <
          (e.untilMs ??
            scene.steps.find((s) => s.atMs > e.atMs)?.atMs ??
            Infinity),
    ) ?? null
  );
}

/**
 * The view of someone drawn from every side at `t` (studio-views-plan
 * §2): their view timeline's key then, and whether it is mirrored (facing
 * left). The front, unmirrored, for anyone else. A still shows the view
 * a turn is going to, not the steps of it.
 */
export function viewInStill(
  scene: Pick<SceneDto, 'acting'>,
  id: string,
  t: number,
): { view: SceneView; mirror: 1 | -1 } {
  let key: [number, SceneView, 1 | -1] | undefined;
  for (const one of scene.acting?.[id]?.view ?? []) if (one[0] <= t) key = one;
  return key ? { view: key[1], mirror: key[2] } : { view: 'front', mirror: 1 };
}

/** A person the kit draws, posed: each arm, and each forearm, turned by so many degrees about its shoulder and elbow. */
export interface StillPose {
  ar: number;
  arf: number;
  al: number;
  alf: number;
}
const AT_REST: StillPose = { ar: 0, arf: 0, al: 0, alf: 0 };

/**
 * How someone the kit draws holds their arms at `t`, from the moves they
 * are making then, at their fullest (the player's actBody): a point, a
 * wave, a reach, a hug, a clap, a hop for joy, a hand opened out; a line's
 * acting (scene-performance): a raised palm, a wagging finger, a fist,
 * hands clasped, a hand on the chest, a shrug, a flinch, a take. At rest
 * otherwise.
 */
export function stillPose(scene: SceneDto, id: string, t: number): StillPose {
  const pose = { ...AT_REST };
  for (const [at, move, ms] of scene.acting?.[id]?.moves ?? []) {
    if (t < at || t > at + ms) continue;
    if (move === 'point') pose.ar -= 84;
    else if (move === 'point-up') {
      pose.ar -= 100;
      pose.arf -= 12;
    } else if (move === 'wave') {
      pose.ar -= 85;
      pose.arf -= 50;
    } else if (move === 'reach') {
      pose.ar -= 72;
      pose.arf -= 8;
    } else if (move === 'gesture') {
      pose.ar -= 28;
      pose.arf -= 42;
    } else if (move === 'gesture-left') {
      pose.al += 28;
      pose.alf += 42;
    } else if (move === 'hug') {
      pose.ar -= 95;
      pose.arf += 35;
      pose.al -= 50;
      pose.alf -= 40;
    } else if (move === 'clap') {
      pose.ar -= 12;
      pose.arf += 90;
      pose.al += 12;
      pose.alf -= 90;
    } else if (move === 'hop') {
      pose.ar -= 115;
      pose.al += 115;
    } else if (move === 'palm-out') {
      pose.ar -= 58;
      pose.arf -= 62;
    } else if (move === 'wag-finger') {
      pose.ar -= 62;
      pose.arf -= 70;
    } else if (move === 'fist') {
      pose.ar -= 42;
      pose.arf -= 92;
    } else if (move === 'plead') {
      pose.ar -= 16;
      pose.arf += 92;
      pose.al += 16;
      pose.alf -= 92;
    } else if (move === 'hand-chest') {
      pose.ar -= 8;
      pose.arf += 84;
    } else if (move === 'flinch') {
      pose.ar -= 20;
      pose.arf += 40;
      pose.al += 20;
      pose.alf -= 40;
    } else if (move === 'take') {
      pose.ar -= 30;
      pose.al += 30;
    } else if (move === 'shrug') {
      pose.ar -= 26;
      pose.arf -= 34;
      pose.al += 26;
      pose.alf += 34;
    }
  }
  return pose;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A kit drawing with its arms turned as `pose` says, written in as
 * transforms about each shoulder and elbow (where its style puts their
 * origins): for a still, since a renderer that knows no CSS variables
 * never turns them. Its dangles as drawn (posedDangles). One at rest is
 * as drawn.
 */
export function posedRig(svg: string, pose: StillPose): string {
  let arm: 'r' | 'l' | null = null;
  const turned = svg.replace(
    /<g class="(arm a([rl])|fore)" style="transform-origin:(-?[\d.]+)px (-?[\d.]+)px">/g,
    (whole, cls: string, side: string | undefined, x: string, y: string) => {
      let deg = 0;
      if (side === 'r' || side === 'l') {
        arm = side;
        deg = side === 'r' ? pose.ar : pose.al;
      } else if (arm) deg = arm === 'r' ? pose.arf : pose.alf;
      if (!deg) return whole;
      // Its class dropped with its style: a renderer's own reading of the
      // CSS that turns it by its variable would undo the turn.
      return `<g data-rig="${cls}" transform="rotate(${r2(deg)} ${x} ${y})">`;
    },
  );
  return posedDangles(turned, 0);
}

/**
 * An arm bent so its hand reaches `to` (shoulder, elbow and hand as drawn,
 * on the stage): the turn of the arm about its shoulder and of the forearm
 * about its elbow, in degrees as the rig turns them, the elbow out to its
 * own side. Null where it cannot reach.
 */
export function armTo(
  [S, E, Hd]: [number, number][],
  to: readonly [number, number],
  hand: 'r' | 'l',
): [number, number] | null {
  const len = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = (a: readonly number[], b: readonly number[]) =>
    Math.atan2(b[1] - a[1], b[0] - a[0]);
  const upper = len(S, E);
  const fore = len(E, Hd);
  if (upper <= 0 || fore <= 0) return null;
  const d = Math.min(
    upper + fore - 1e-6,
    Math.max(Math.abs(upper - fore) + 1e-6, len(S, to)),
  );
  const a0 = ang(S, to);
  const bend = Math.acos(
    Math.max(
      -1,
      Math.min(1, (upper ** 2 + d ** 2 - fore ** 2) / (2 * upper * d)),
    ),
  );
  const elbows = [a0 + bend, a0 - bend].map((a): [number, number] => [
    S[0] + upper * Math.cos(a),
    S[1] + upper * Math.sin(a),
  ]);
  // The elbow out to the arm's own side of the body.
  const elbow = elbows.sort((p, q) =>
    hand === 'r' ? q[0] - p[0] : p[0] - q[0],
  )[0];
  const deg = (r: number) => (r * 180) / Math.PI;
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  const ar = wrap(deg(ang(S, elbow) - ang(S, E)));
  const arf = wrap(deg(ang(elbow, to) - ang(E, Hd)) - ar);
  return [Math.round(ar * 10) / 10, Math.round(arf * 10) / 10];
}

/** Each arm's shoulder, elbow and hand as drawn in `view`, as shares of the box; facing left, mirrored (the player's jointsIn). */
export function jointsIn(
  thing: Pick<
    Extract<SceneThingDto, { kind: 'drawing' }>,
    'joints' | 'viewJoints'
  >,
  view: SceneView,
  mirror: 1 | -1,
): Record<'r' | 'l', [number, number][]> | undefined {
  const own =
    thing.viewJoints?.[view] ??
    (view === 'front' ? thing.joints : undefined) ??
    thing.joints;
  if (!own) return undefined;
  if (mirror > 0 || !thing.viewJoints?.[view]) return own;
  const flip = (arm: [number, number][]) =>
    arm.map(([x, y]): [number, number] => [1 - x, y]);
  return { r: flip(own.l), l: flip(own.r) };
}

/** `p` turned `deg` degrees about `c`, as SVG's rotate turns it (clockwise, y down). */
const turnedAbout = (
  p: readonly [number, number],
  c: readonly [number, number],
  deg: number,
): [number, number] => {
  const r = (deg * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [
    c[0] + dx * Math.cos(r) - dy * Math.sin(r),
    c[1] + dx * Math.sin(r) + dy * Math.cos(r),
  ];
};

/** An arm as posed: its shoulder, its elbow turned `upper` about it, its hand turned with it and then `fore` about the elbow (the player's handNow). */
export function posedArm(
  [S, E, Hd]: readonly (readonly [number, number])[],
  upper: number,
  fore: number,
): [[number, number], [number, number], [number, number]] {
  const E2 = turnedAbout(E, S, upper);
  return [[S[0], S[1]], E2, turnedAbout(turnedAbout(Hd, S, upper), E2, fore)];
}

/** How far someone leans in for a hand-over they cannot reach, in degrees about their feet (the player's own). */
const HAND_OVER_LEAN = 5;

/** How far someone steps in for a hand-over they cannot reach from where they stand: to reach nine tenths of their arm, no more than takes them within three tenths of their width of the middle between them; null where they can reach it (the player's own, motion.ts: they lean in too). */
function handOverStep(
  me: Holder,
  arm: readonly (readonly [number, number])[],
  meet: readonly [number, number],
  other: Holder,
): number | null {
  const [S, E, Hd] = arm;
  const reach =
    Math.hypot(E[0] - S[0], E[1] - S[1]) +
    Math.hypot(Hd[0] - E[0], Hd[1] - E[1]);
  const short = Math.hypot(meet[0] - S[0], meet[1] - S[1]) - reach * 0.9;
  if (short <= 0) return null;
  const gap = Math.abs(
    other.place.x +
      other.place.w * (other.head?.[0] ?? 0.5) -
      (me.place.x + me.place.w * (me.head?.[0] ?? 0.5)),
  );
  return Math.min(short, Math.max(0, gap / 2 - me.place.w * 0.3));
}

/**
 * How far someone leans in for a hand-over, in degrees: as far as it takes
 * the shoulder `S` (stepped `shift` along) to bring the meeting point within
 * nine tenths of their `reach`, their feet at `feetY`; no more than
 * HAND_OVER_LEAN. The player's handOverLean.
 */
export function handOverLean(
  S: readonly [number, number],
  meet: readonly [number, number],
  reach: number,
  shift: number,
  feetY: number,
): number {
  const left = Math.hypot(meet[0] - S[0] - shift, meet[1] - S[1]) - reach * 0.9;
  const high = feetY - S[1];
  if (left <= 0 || high <= 0) return 0;
  return Math.min(
    HAND_OVER_LEAN,
    (Math.asin(Math.min(1, left / high)) * 180) / Math.PI,
  );
}

/** A point of someone leaning `deg` about their feet (`about`), as the player leans them. */
const leant = (
  p: readonly [number, number],
  about: readonly [number, number],
  deg: number,
): [number, number] => (deg ? turnedAbout(p, about, deg) : [p[0], p[1]]);

/** The views other than the front, whose groups' ids end in their name. */
const SIDE_VIEWS = ['3q', 'profile', 'back3q', 'back'] as const;

/** How long a thing of the set takes to fade, as the player fades it: its FORE_FADE_MS. */
const FADE_MS = 240;
/** How faint a fade without a level leaves it: the player's FORE_FADED. */
const FADED_TO = 0.4;

/** How strongly a group of the set is drawn at `t`: faded as the scene's fades say, as the player fades it. */
export function fadeAt(scene: SceneDto, id: string, t: number): number {
  let out = 1;
  for (const [from, to, which, level] of scene.setting?.fades ?? []) {
    if (which !== id) continue;
    const k = Math.min(
      Math.max(0, Math.min(1, (t - from + FADE_MS) / FADE_MS)),
      Math.max(0, Math.min(1, (to + FADE_MS - t) / FADE_MS)),
    );
    out = Math.min(out, 1 - (1 - (level ?? FADED_TO)) * k);
  }
  return out;
}

/** A layer's drawing with its groups faded as they are at `t`. */
function fadedLayer(scene: SceneDto, svg: string, t: number): string {
  const rules = [...new Set((scene.setting?.fades ?? []).map((f) => f[2]))]
    .map((id) => [id, fadeAt(scene, id, t)] as const)
    .filter(([id, k]) => k < 0.999 && svg.includes(`id="${id}"`))
    .map(([id, k]) => `[id="${id.replace(/"/g, '')}"]{opacity:${r2(k)}}`);
  return rules.length
    ? svg.replace(/(<svg\b[^>]*>)/i, `$1<style>${rules.join('')}</style>`)
    : svg;
}

/** A drawing's viewBox set to a window of it. */
const windowed = (svg: string, box: Box) =>
  svg.replace(
    /(<svg\b[^>]*?)\sviewBox="[^"]*"/i,
    `$1 viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}"`,
  );

/** One piece of a still: what it is, its drawing as rendered on its own, where it lies in the frame, and how wide it is rendered. */
export interface StillPart {
  key: string;
  kind: 'layer' | 'crowd' | 'feature' | 'thing';
  svg: string;
  box: Box;
  width: number;
  /** A layer's depth; a floor thing's depth factor. */
  depth: number;
  /** On the floor: where its feet are, in stage units, for the order it is drawn in. */
  feet?: number;
  /** Drawn the other way round: someone facing left, as their view has them. */
  mirror?: true;
  /** A little soft: someone cheated near the camera, over whose shoulder the shot looks. */
  soft?: true;
  /** A person drawn from every side: the view the still shows. */
  view?: SceneView;
  /** Out of focus: everyone but the thing an insert is on, a little soft. */
  unfocused?: true;
  /** Leant about their feet (in the frame), by so many degrees: in for a hand-over. */
  lean?: { deg: number; x: number; y: number };
}

/** A shape of someone's body in the frame, for measuring what a shot shows: their head, body and legs, and each arm's parts. */
export type BodyShape =
  | { part: 'head'; cx: number; cy: number; rx: number; ry: number }
  | { part: 'body' | 'legs'; points: [number, number][] }
  | {
      part: 'arm' | 'fore' | 'hand';
      hand: 'r' | 'l';
      a: [number, number];
      b: [number, number];
      r: number;
    };

/** Someone in a still, as shapes in the frame: what they hold in which hand. */
export interface StillBody {
  id: string;
  shapes: BodyShape[];
  holds: Partial<Record<'r' | 'l', string>>;
}

export interface StillPlan {
  W: number;
  H: number;
  t: number;
  step: number;
  view: View;
  camera: StillCamera;
  /** Back to front. */
  parts: StillPart[];
  /** Who is on the stage then. */
  shows: string[];
  /** Everyone on the floor as shapes in the frame, for measuring (insertReading). */
  bodies: StillBody[];
  /** The things drawn, where they are in the frame, and whose hand holds each. */
  things: { id: string; box: Box; by: string | null; hand?: 'r' | 'l' }[];
  /** The thing the insert on then is on, if one is. */
  insert: string | null;
}

/**
 * What a still of the film at `t` is made of, back to front, `width`
 * pixels on its long side (a wide still 960 × 540, a tall one 540 × 960:
 * scene-shape stillSize): the set's layers behind the floor, each a window of it as
 * the camera has its depth then; the set's crowd on its ground; the
 * features the stage draws, the people and the set's floor layer, by
 * their feet, each where its depth on the floor puts it; the layers
 * before the camera over all. A set made before the layers is its one
 * picture, as far off as the player moves it.
 */
export function stillPlan(
  scene: SceneDto,
  t: number,
  width = 960,
  /** The moment as the player has it, where known: its camera, and where each one is (on their way somewhere). */
  at: { camera?: StillCamera; places?: Record<string, ScenePlaceDto> } = {},
): StillPlan {
  const { w: W, h: H, places } = scene.stagings.wide;
  const scale = stillSize({ w: W, h: H }, width).w / W;
  const k = stepAtMoment(scene, t);
  const step = scene.steps[k];
  const set = step?.backdrop
    ? scene.things.find((one) => one.id === step.backdrop)
    : undefined;
  const drawnSet = set?.kind === 'drawing' ? set : undefined;
  const room = roomOf(drawnSet ?? null, W, H);
  const view = viewAtMoment(scene, t, room);
  // The shot's grammar (studio-views-plan §3): whom it cheats near the
  // camera, and a low or high angle; and from the place's other side
  // (§4.2), its reverse layers, the stage reflected.
  const shot = shotAtMoment(scene, t);
  const turned = isReverse(shot) && Boolean(drawnSet?.reverse?.layers.length);
  const camera =
    at.camera ??
    stillCamera(view, W, H, turned ? reflectRoom(room, W).span : room.span);
  /** Where a place on the stage is in the picture: reflected, turned round. */
  const side = <T extends Box>(box: T): T =>
    turned ? reflectPlace(box, W) : box;
  const near = nearOf(shot, step?.show ?? [], places[k] ?? {}, W, H, room);
  const angle = shot?.shot?.angle;
  /** A layer's window under a low or high angle: scaled about the frame's top or bottom, the farther off the more. */
  const tilted = (window: Box, depth: number): Box => {
    const { k: g, pivot } = angleLayer(angle, depth);
    if (g === 1) return window;
    const w = window.w / g;
    const h = window.h / g;
    return {
      x: window.x + (window.w - w) / 2,
      y: pivot === 0 ? window.y : window.y + window.h - h,
      w,
      h,
    };
  };
  // The set covers the stage: its units to the stage's (a tall stage's
  // set frame is tall, scene-shape).
  const setFrame = setFrameFor(W, H);
  const unit = Math.max(W / setFrame.w, H / setFrame.h);
  const left = (W - setFrame.w * unit) / 2;
  const top = (H - setFrame.h * unit) / 2;
  const toSet = (b: Box): Box => ({
    x: (b.x - left) / unit,
    y: (b.y - top) / unit,
    w: b.w / unit,
    h: b.h / unit,
  });
  const floor: [number, number] | null = drawnSet?.floor
    ? [top + drawnSet.floor[0] * unit, top + drawnSet.floor[1] * unit]
    : null;
  const frame: Box = { x: 0, y: 0, w: W, h: H };
  const behind: StillPart[] = [];
  const onFloor: StillPart[] = [];
  const before: StillPart[] = [];
  if (drawnSet) {
    const layers: SceneSetLayerDto[] =
      turned && drawnSet.reverse
        ? drawnSet.reverse.layers
        : drawnSet.layers?.length
          ? drawnSet.layers
          : [{ id: 'flat', depth: PARALLAX, svg: drawnSet.svg }];
    for (const layer of layers) {
      const svg = windowed(
        withoutStandIns(scene, layer.svg),
        toSet(
          layer.id === 'floor' || layer.depth > 1
            ? layerWindow(camera, layer.id === 'floor' ? 1 : layer.depth, W, H)
            : tilted(layerWindow(camera, layer.depth, W, H), layer.depth),
        ),
      );
      const part: StillPart = {
        key: `layer:${layer.id}`,
        kind: 'layer',
        svg: fadedLayer(scene, svg, t),
        box: frame,
        width,
        depth: layer.depth,
      };
      if (layer.id === 'floor') {
        const feet = layer.feet !== undefined ? top + layer.feet * unit : H;
        const f = floorFactor(feet, floor);
        onFloor.push({
          ...part,
          svg: fadedLayer(
            scene,
            windowed(
              withoutStandIns(scene, layer.svg),
              toSet(layerWindow(camera, f, W, H)),
            ),
            t,
          ),
          depth: f,
          feet,
        });
      } else if (layer.depth > 1) before.push(part);
      else behind.push(part);
    }
  }
  // Its crowd, in its set's frame, on its ground (the front's only: from
  // the other side, the player leaves it out too).
  const crowd =
    crowdShown(scene, k) && !turned
      ? scene.things.find((one) => one.id === CROWD_ID)
      : undefined;
  if (crowd?.kind === 'drawing')
    behind.push({
      key: 'crowd',
      kind: 'crowd',
      svg: windowed(
        crowd.svg,
        toSet(tilted(layerWindow(camera, GROUND_DEPTH, W, H), GROUND_DEPTH)),
      ),
      box: frame,
      width,
      depth: GROUND_DEPTH,
    });
  behind.sort((a, b) => a.depth - b.depth);
  // The features the stage draws, as open as they are then.
  for (const feature of scene.setting?.features ?? []) {
    const svg = featureSvgAt(scene, feature, t);
    const at = side(feature.at.wide);
    if (!svg || at.w <= 0 || at.h <= 0) continue;
    const feet = feature.feet?.wide ?? at.y + at.h;
    const f = floorFactor(feet, floor);
    onFloor.push({
      key: `feature:${feature.id}`,
      kind: 'feature',
      svg,
      box: onScreen(camera, f, at),
      width: Math.max(48, Math.round(at.w * camera.s * scale * 2)),
      depth: f,
      feet,
      // From the other side, seen the other way round.
      ...(turned ? { mirror: true as const } : {}),
    });
  }
  // Where the things on the stage are then, as an insert finds them.
  const stage: ThingsOnStage = {
    props: scene.props ?? [],
    steps: scene.steps,
    places,
    drawing: (id) => {
      const one = scene.things.find((x) => x.id === id);
      return one?.kind === 'drawing' ? one : undefined;
    },
    feature: (id) => scene.setting?.features?.find((f) => f.id === id)?.at.wide,
    obstacles: obstaclesOf(scene.setting?.features ?? []),
  };
  const hands = handsAt(stage, t);
  // An insert on a thing (studio-screenwriting K5): the hand that holds it
  // holds it still where the shot frames it; whoever has it in hand then
  // is as sharp as it, and everyone else a little soft.
  const insert = shot?.shot?.kind === 'insert' ? shot.target : null;
  const holdsIt = insert ? hands.get(insert) : undefined;
  const inFocus = holdsIt?.by && !holdsIt.gone ? holdsIt.by : null;
  // A thing handed over, its hands out together: where they meet, each
  // stepping in as far as it takes to reach (the player's give).
  const meets = new Map<
    string,
    { prop: string; hand: 'r' | 'l'; at: [number, number]; flip: boolean }
  >();
  const stepIn = new Map<string, { shift: number; lean: number }>();
  for (const prop of scene.props ?? []) {
    const give = handOverAt(stage.props, prop.id, t);
    if (!give) continue;
    const a = holderOn(stage, give.from, k);
    const b = holderOn(stage, give.to, k);
    if (!a || !b) continue;
    const held = hands.get(prop.id);
    const giving =
      held?.by === give.from && (held.hand === 'r' || held.hand === 'l')
        ? held.hand
        : sideToward(a, b);
    const at = meetPoint(a, b, giving);
    for (const [me, other, hand] of [
      [a, b, giving],
      [b, a, sideToward(b, a)],
    ] as const) {
      const id = me === a ? give.from : give.to;
      const d = stage.drawing(id);
      const arm = d?.joints?.[hand];
      // Drawn as the giver holds it until the hands part: never turned
      // round as it changes hands.
      meets.set(id, { prop: prop.id, hand, at, flip: giving === 'l' });
      if (!arm) continue;
      const joints = arm.map(([x, y]): [number, number] => [
        me.place.x + me.place.w * x,
        me.place.y + me.place.h * y,
      ]);
      const step = handOverStep(me, joints, at, other);
      // Out of reach: a step in, and a lean for what it leaves short.
      const way = sideToward(me, other) === 'r' ? 1 : -1;
      const [S, E, Hd] = joints;
      const reach =
        Math.hypot(E[0] - S[0], E[1] - S[1]) +
        Math.hypot(Hd[0] - E[0], Hd[1] - E[1]);
      if (step !== null)
        stepIn.set(id, {
          shift: way * step,
          lean:
            way *
            handOverLean(S, at, reach, way * step, me.place.y + me.place.h),
        });
    }
  }
  /** Where each hand is, on the stage, and each one's scale (stage units to the kit's) and depth, for the things they hold. */
  const handAt = new Map<string, [number, number]>();
  const held = new Map<string, { k: number; f: number; feet: number }>();
  const bodies: StillBody[] = [];
  // The people, posed as they are then, their hidden parts hidden.
  const shows: string[] = [];
  for (const id of step?.show ?? []) {
    const thing = scene.things.find((one) => one.id === id);
    const cheated = near?.id === id ? near.place : null;
    const stood = at.places?.[id] ?? places[k]?.[id];
    const inFor = cheated || at.places?.[id] ? undefined : stepIn.get(id);
    const stepped =
      stood && inFor ? { ...stood, x: stood.x + inFor.shift } : stood;
    const place: ScenePlaceDto | undefined =
      cheated ?? (stepped && side(stepped));
    if (thing?.kind !== 'drawing' || !place || thing.backdrop) continue;
    if (place.w > W * 0.6 && !cheated) continue;
    shows.push(id);
    // Drawn from every side, a state is hidden in every view: its groups
    // are the front's ids with the view after them.
    const sided = thing.rigVersion === 3 && (thing.views?.length ?? 0) > 1;
    const hidden = hiddenAt(scene, thing, t).flatMap((h) =>
      sided ? [h, ...SIDE_VIEWS.map((view) => `${h}--${view}`)] : [h],
    );
    const hide = hidden.length
      ? `<style>${hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`
      : '';
    let svg = hide
      ? thing.svg.replace(/(<svg\b[^>]*>)/i, `$1${hide}`)
      : thing.svg;
    // Drawn from every side: the view they are in then, the other way
    // round facing left (their arms as the frame has them, mirrored).
    const seen = sided ? viewInStill(scene, id, t) : null;
    if (seen) svg = viewOnly(svg, seen.view);
    // One with no views, from the other side, is seen the other way round.
    const mirrored = seen ? seen.mirror === -1 : turned;
    // A face of moving parts: as the player has it then (scene-face-draw),
    // the kit's swapped faces hidden in every view.
    if (hasRigFace(svg))
      svg = withRigFace(svg, faceInScene(scene, id, t), faceGroupsOf(thing));
    const unitsTall = Number(
      /viewBox="[^"]*?(-?[\d.]+)"/u.exec(thing.svg)?.[1] ?? Number.NaN,
    );
    const kit =
      place.h /
      (thing.rig && Number.isFinite(unitsTall) && unitsTall > 0
        ? unitsTall
        : (thing.units ?? 234));
    const arms = thing.rig
      ? jointsIn(
          thing,
          seen?.view ?? 'front',
          seen?.mirror ?? (turned ? -1 : 1),
        )
      : undefined;
    // Leaning in for a hand-over: about their feet.
    const lean = inFor?.lean ?? 0;
    const pivot: [number, number] = [place.x + place.w / 2, place.y + place.h];
    /** An arm's joints on the stage, where they are drawn. */
    const armOn = (hand: 'r' | 'l') =>
      arms?.[hand]?.map(([x, y]): [number, number] =>
        leant([place.x + place.w * x, place.y + place.h * y], pivot, lean),
      );
    const pose = thing.rig ? stillPose(scene, id, t) : { ...AT_REST };
    if (thing.rig && !cheated) {
      // A hand holding a thing, and doing nothing else, holds it before
      // them; a hand the acting moves takes it along, but not the hand
      // holding the thing an insert is on, which holds it still. A hand
      // out to hand a thing over, or take it, is where the hands meet.
      const me: Holder = {
        ...(holderOn(stage, id, k) ?? {}),
        place,
      };
      const aims = new Map<'r' | 'l', [number, number]>();
      for (const prop of scene.props ?? []) {
        const has = hands.get(prop.id);
        if (
          prop.hangs ||
          has?.by !== id ||
          (has.hand !== 'r' && has.hand !== 'l') ||
          has.gone ||
          has.flying
        )
          continue;
        const moved =
          has.hand === 'r' ? pose.ar || pose.arf : pose.al || pose.alf;
        if (!moved || insert === prop.id)
          aims.set(has.hand, holdPoint(me, has.hand));
      }
      const meet = meets.get(id);
      if (meet) aims.set(meet.hand, meet.at);
      for (const [hand, to] of aims) {
        const arm = armOn(hand);
        const bent = arm && armTo(arm, to, hand);
        if (bent && hand === 'r') [pose.ar, pose.arf] = bent;
        else if (bent) [pose.al, pose.alf] = bent;
      }
    }
    if (thing.rig)
      svg = posedRig(
        svg,
        mirrored
          ? { ar: -pose.al, arf: -pose.alf, al: -pose.ar, alf: -pose.arf }
          : pose,
      );
    // Where each hand is, as posed.
    const posed: Partial<Record<'r' | 'l', [number, number][]>> = {};
    for (const hand of ['r', 'l'] as const) {
      const arm = armOn(hand);
      if (!arm || arm.length < 3) continue;
      posed[hand] = posedArm(
        arm,
        hand === 'r' ? pose.ar : pose.al,
        hand === 'r' ? pose.arf : pose.alf,
      );
      handAt.set(`${id}|${hand}`, posed[hand][2]);
    }
    const feet = place.y + place.h;
    // One cheated near the camera stands where the shot puts them, before
    // the floor: moved as the people are.
    const f = cheated ? 1 : floorFactor(feet, floor);
    held.set(id, { k: kit, f, feet: cheated ? H * 4 : feet });
    const grown = anglePeople(angle);
    const box = onScreen(camera, f, place);
    onFloor.push({
      key: `thing:${id}`,
      kind: 'thing',
      svg,
      box:
        grown === 1
          ? box
          : {
              x: box.x + (box.w * (1 - grown)) / 2,
              y: box.y + box.h * (1 - grown),
              w: box.w * grown,
              h: box.h * grown,
            },
      width: Math.max(48, Math.round(place.w * camera.s * scale * 2)),
      depth: f,
      // Cheated near the camera: before everyone.
      feet: cheated ? H * 4 : feet,
      ...(mirrored ? { mirror: true as const } : {}),
      ...(cheated && near?.soft ? { soft: true as const } : {}),
      ...(seen ? { view: seen.view } : {}),
      ...(insert && inFocus !== id ? { unfocused: true as const } : {}),
      ...(lean
        ? (() => {
            const about = onScreen(camera, f, {
              x: pivot[0],
              y: pivot[1],
              w: 0,
              h: 0,
            });
            return { lean: { deg: lean, x: about.x, y: about.y } };
          })()
        : {}),
    });
    if (thing.rig)
      bodies.push({
        id,
        shapes: bodyShapes(
          thing,
          place,
          kit,
          posed,
          mirrored,
          (p) => {
            const at = onScreen(camera, f, { x: p[0], y: p[1], w: 0, h: 0 });
            return [at.x, at.y];
          },
          onScreen(camera, f, { x: 0, y: 0, w: 1, h: 1 }).w,
          (p) => leant(p, pivot, lean),
        ),
        // Out to hand a thing over, or to take it, the hand has it too.
        holds: meets.has(id)
          ? { [meets.get(id)!.hand]: meets.get(id)!.prop }
          : {},
      });
  }
  // The things held or resting before someone, where they are then: a
  // thing in a hand at that hand as it is posed, the other way round in a
  // left hand, just before whoever holds it; one resting, before whoever
  // it rests by; not in the air.
  const things: StillPlan['things'] = [];
  for (const prop of scene.props ?? []) {
    if (prop.in) continue;
    const has = hands.get(prop.id);
    if (!has || has.gone || has.flying) continue;
    const hand = has.hand === 'r' || has.hand === 'l' ? has.hand : undefined;
    const inHand = has.by && hand ? handAt.get(`${has.by}|${hand}`) : undefined;
    const by = has.by ? held.get(has.by) : undefined;
    let box: Box | null;
    let depth: number;
    let feet: number;
    const meeting = has.by ? meets.get(has.by) : undefined;
    const flipped = meeting?.prop === prop.id ? meeting.flip : hand === 'l';
    if (inHand && by && hand) {
      box = gripBox(prop, prop.grip, inHand, by.k, flipped);
      depth = by.f;
      feet = by.feet + 1;
    } else {
      // From the other side, only what is in a hand.
      if (turned) continue;
      box = thingBoxAt(stage, prop.id, t);
      if (!box) continue;
      const who = has.by ?? has.near;
      const them = who ? places[k]?.[who] : undefined;
      feet = them ? them.y + them.h + (has.by ? 1 : -1) : box.y + box.h;
      depth = floorFactor(them ? them.y + them.h : feet, floor);
    }
    const shown = onScreen(camera, depth, box);
    onFloor.push({
      key: `prop:${prop.id}`,
      kind: 'thing',
      svg: prop.svg,
      box: shown,
      width: Math.max(48, Math.round(box.w * camera.s * scale * 2)),
      depth,
      feet,
      ...(inHand && flipped ? { mirror: true as const } : {}),
    });
    things.push({
      id: prop.id,
      box: shown,
      by: inHand ? has.by : null,
      ...(inHand && hand ? { hand } : {}),
    });
    const body = inHand ? bodies.find((one) => one.id === has.by) : undefined;
    if (body && hand) body.holds[hand] = prop.id;
  }
  // Back to front by their feet, as the player draws them: a feature the
  // stage draws is over only those farther off than it by more than a
  // tie (someone beside it stands before it).
  const tie = H * DEPTH_TIE;
  const orderOf = (part: StillPart) =>
    (part.feet ?? 0) - (part.kind === 'feature' ? tie + 0.01 : 0);
  onFloor.sort((a, b) => orderOf(a) - orderOf(b));
  before.sort((a, b) => a.depth - b.depth);
  return {
    W,
    H,
    t,
    step: k,
    view,
    camera,
    parts: [...behind, ...onFloor, ...before],
    shows,
    bodies,
    things,
    insert,
  };
}

/**
 * Someone the kit draws as shapes, for measuring what a shot shows: the
 * head (with its hair) about where the drawing has it, the body from the
 * shoulders to the hips, the legs to the feet, and each arm as posed
 * (`posed`, on the stage), each as `toFrame` puts it, `across` frame units
 * to a stage unit. In the kit's units, `kit` stage units to one.
 */
function bodyShapes(
  thing: Extract<SceneThingDto, { kind: 'drawing' }>,
  place: Box,
  kit: number,
  posed: Partial<Record<'r' | 'l', [number, number][]>>,
  mirrored: boolean,
  toFrame: (p: [number, number]) => [number, number],
  across: number,
  /** Where a point of them is, leaning: the arms (`posed`) are leant already. */
  lean: (p: [number, number]) => [number, number] = (p) => p,
): BodyShape[] {
  const at = (x: number, y: number): [number, number] =>
    toFrame(
      lean([place.x + place.w * (mirrored ? 1 - x : x), place.y + place.h * y]),
    );
  const u = kit * across;
  const head = thing.head ?? [0.5, 0.25];
  const [hx, hy] = at(head[0], head[1]);
  const shapes: BodyShape[] = [
    // The hair stands a little over the head's own oval.
    {
      part: 'head',
      cx: hx,
      cy: hy - 2 * u,
      rx: (HEAD.rx + 4) * u,
      ry: (HEAD.ry + 6) * u,
    },
  ];
  const joints = thing.joints;
  const legs = thing.legs;
  if (joints) {
    const sy = Math.min(joints.r[0][1], joints.l[0][1]);
    const sx0 = Math.min(joints.r[0][0], joints.l[0][0]);
    const sx1 = Math.max(joints.r[0][0], joints.l[0][0]);
    const hipY = legs
      ? Math.min(legs.r[0][1], legs.l[0][1])
      : sy + (1 - sy) * 0.45;
    const hx0 = legs ? Math.min(legs.r[0][0], legs.l[0][0]) : sx0;
    const hx1 = legs ? Math.max(legs.r[0][0], legs.l[0][0]) : sx1;
    const top = at(0, sy)[1] - 12 * u;
    const [l0] = at(sx0, sy);
    const [r0] = at(sx1, sy);
    const [lh, bottom] = at(hx0, hipY);
    const [rh] = at(hx1, hipY);
    const [a0, a1] = [Math.min(l0, r0), Math.max(l0, r0)];
    const [b0, b1] = [Math.min(lh, rh), Math.max(lh, rh)];
    shapes.push({
      part: 'body',
      points: [
        [a0 - 8 * u, top],
        [a1 + 8 * u, top],
        [b1 + 26 * u, bottom],
        [b0 - 26 * u, bottom],
      ],
    });
    const foot = legs
      ? Math.max(legs.r[legs.r.length - 1][1], legs.l[legs.l.length - 1][1])
      : 1;
    const low = at(0, foot)[1] + 8 * u;
    shapes.push({
      part: 'legs',
      points: [
        [b0 - 12 * u, bottom],
        [b1 + 12 * u, bottom],
        [b1 + 12 * u, low],
        [b0 - 12 * u, low],
      ],
    });
  }
  for (const hand of ['r', 'l'] as const) {
    const arm = posed[hand];
    if (!arm) continue;
    const [S, E, Hd] = arm.map(toFrame);
    shapes.push(
      { part: 'arm', hand, a: S, b: E, r: 10.5 * u },
      { part: 'fore', hand, a: E, b: Hd, r: 10.5 * u },
      { part: 'hand', hand, a: Hd, b: Hd, r: 11 * u },
    );
  }
  return shapes;
}

/** Whether a point is in a body's shape. */
function inShape(shape: BodyShape, x: number, y: number): boolean {
  if (shape.part === 'head')
    return (
      ((x - shape.cx) / shape.rx) ** 2 + ((y - shape.cy) / shape.ry) ** 2 <= 1
    );
  if ('points' in shape) {
    let inside = false;
    const p = shape.points;
    for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1)
      if (
        p[i][1] > y !== p[j][1] > y &&
        x <
          ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]
      )
        inside = !inside;
    return inside;
  }
  const [ax, ay] = shape.a;
  const [bx, by] = shape.b;
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  const k = len
    ? Math.max(
        0,
        Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len),
      )
    : 0;
  return (
    Math.hypot(x - (ax + k * (bx - ax)), y - (ay + k * (by - ay))) <= shape.r
  );
}

/** What an insert shows, measured in its still (studio-screenwriting K5). */
export interface InsertReading {
  thing: string;
  /** How far its middle is from the frame's, as shares of the frame's width and height; `off`, the larger. */
  dx: number;
  dy: number;
  off: number;
  /** How much of the frame's height, and width, its box fills. */
  fill: number;
  wide: number;
  /** How much of the frame other bodies cover, outside the thing: anyone's, but the hand and wrist that hold it. */
  bodies: number;
  /** Whether it is in someone's hand (or hands, handed over). */
  held: boolean;
  /** How much of it faces cover. */
  faces: number;
}

/**
 * What an insert is to read as, checked by insertReading: its thing within
 * a tenth of the frame's middle, filling about two fifths of its height;
 * little of anyone else in it (a thing alone on the floor, a foot at most;
 * one in a hand or handed over, the arms and the body behind it), and no
 * more of a face than a sliver at an edge.
 */
export const INSERT_READS = {
  off: 0.1,
  fill: [0.33, 0.55] as const,
  bodies: { alone: 0.25, held: 0.5 },
  faces: 0.05,
};

/**
 * What a still shows of the thing an insert is on (`thing`, else the
 * plan's insert): where its middle is in the frame, how much of it it
 * fills, and how much of the frame others' bodies and faces cover outside
 * it (the hand and wrist holding it do not count), each by points on a
 * grid across the frame. Null when the thing is not drawn.
 */
export function insertReading(
  plan: StillPlan,
  thing: string | null = plan.insert,
): InsertReading | null {
  if (!thing) return null;
  const box = thing.startsWith('f:')
    ? plan.parts.find((part) => part.key === `feature:${thing.slice(2)}`)?.box
    : plan.things.find((one) => one.id === thing)?.box;
  if (!box) return null;
  const { W, H } = plan;
  const dx = (box.x + box.w / 2 - W / 2) / W;
  const dy = (box.y + box.h / 2 - H / 2) / H;
  const clip = (a: number, b: number, lo: number, hi: number) =>
    Math.max(0, Math.min(b, hi) - Math.max(a, lo));
  const cols = 96;
  const rows = 54;
  let bodies = 0;
  let faces = 0;
  for (let i = 0; i < cols; i += 1)
    for (let j = 0; j < rows; j += 1) {
      const x = ((i + 0.5) / cols) * W;
      const y = ((j + 0.5) / rows) * H;
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
        continue;
      let body = false;
      let face = false;
      for (const one of plan.bodies)
        for (const shape of one.shapes) {
          // The hand and wrist holding it are fine.
          if (
            (shape.part === 'hand' || shape.part === 'fore') &&
            one.holds[shape.hand] === thing
          )
            continue;
          if (!inShape(shape, x, y)) continue;
          body = true;
          if (shape.part === 'head') face = true;
        }
      if (body) bodies += 1;
      if (face) faces += 1;
    }
  const n = cols * rows;
  return {
    thing,
    dx,
    dy,
    off: Math.max(Math.abs(dx), Math.abs(dy)),
    fill: clip(box.y, box.y + box.h, 0, H) / H,
    wide: clip(box.x, box.x + box.w, 0, W) / W,
    bodies: bodies / n,
    faces: faces / n,
    held: plan.bodies.some((one) => Object.values(one.holds).includes(thing)),
  };
}

/** The still's paper, under everything: the stage's ground (a film's set covers it). */
const PAPER = PAPER_THEME.paper;
/** How soft one cheated near the camera is, in the stage's units (the player's NEAR_SOFT_PX). */
const SOFT_PX = 2.5;
/** How soft everyone is behind an insert's thing, in the stage's units, and how much of them shows over what is behind: the player's INSERT_SOFT_PX and INSERT_KEEP. */
const UNFOCUSED_PX = 4;
const UNFOCUSED_KEEP = 0.85;

/** A still as one SVG from its parts' PNGs (by key): each laid where the plan puts it. A part with no PNG is left out. */
export function stillSvg(
  plan: StillPlan,
  pngs: ReadonlyMap<string, Buffer>,
): string {
  const images = plan.parts.flatMap((part) => {
    const png = pngs.get(part.key);
    if (!png) return [];
    const { x, y, w, h } = part.box;
    // Someone stands on the foot of their box, where the floor, their
    // shadow and the order they are drawn in have their feet, whatever
    // the box's shape: never lifted into its middle.
    const fit =
      part.kind === 'layer' || part.kind === 'crowd' || part.kind === 'feature'
        ? ' preserveAspectRatio="none"'
        : ' preserveAspectRatio="xMidYMax meet"';
    // Facing left: drawn the other way round about the middle of its box.
    const turned = [
      part.lean
        ? `rotate(${r2(part.lean.deg)} ${r2(part.lean.x)} ${r2(part.lean.y)})`
        : '',
      part.mirror ? `translate(${r2(2 * x + w)} 0) scale(-1 1)` : '',
    ].filter(Boolean);
    const transform = turned.length ? ` transform="${turned.join(' ')}"` : '';
    const soft = part.soft
      ? ' filter="url(#still-soft)"'
      : part.unfocused
        ? ` filter="url(#still-unfocused)" opacity="${UNFOCUSED_KEEP}"`
        : '';
    return [
      `<image x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${fit}${transform}${soft} href="data:image/png;base64,${png.toString('base64')}"/>`,
    ];
  });
  const filters = [
    plan.parts.some((part) => part.soft)
      ? `<filter id="still-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${r2(SOFT_PX * (Math.max(plan.W, plan.H) / 1600))}"/></filter>`
      : '',
    // Out of focus behind an insert's thing: softer, and a little faded
    // into what is behind, as a lens close on a thing leaves the rest.
    plan.parts.some((part) => part.unfocused)
      ? `<filter id="still-unfocused" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${r2(UNFOCUSED_PX * (Math.max(plan.W, plan.H) / 1600))}"/></filter>`
      : '',
  ].join('');
  const defs = filters ? `<defs>${filters}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.W} ${plan.H}">${defs}<rect width="${plan.W}" height="${plan.H}" fill="${PAPER}"/>${images.join('')}</svg>`;
}

/**
 * A still of the film at `t`, as a PNG `width` pixels on its long side
 * (scene-shape stillSize): each part
 * rendered alone by `raster` (a drawing's SVG to a PNG that wide), laid
 * in place, and the whole rendered. A part that will not render is left
 * out; the rest is still a still.
 */
export async function renderStill(
  scene: SceneDto,
  t: number,
  raster: (svg: string, width: number) => Promise<Buffer>,
  width = 960,
  at: Parameters<typeof stillPlan>[3] = {},
): Promise<{ png: Buffer; plan: StillPlan }> {
  const plan = stillPlan(scene, t, width, at);
  const pngs = new Map<string, Buffer>();
  await Promise.all(
    plan.parts.map((part) =>
      raster(part.svg, part.width).then(
        (png) => pngs.set(part.key, png),
        // Left out of the still.
        () => undefined,
      ),
    ),
  );
  return {
    png: await raster(
      stillSvg(plan, pngs),
      stillSize({ w: plan.W, h: plan.H }, width).w,
    ),
    plan,
  };
}
