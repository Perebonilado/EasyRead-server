/**
 * Which way people face, and so which view of them the camera sees
 * (studio-views-plan §2): for everyone drawn from every side (rig 3), a
 * timeline of views, `acting.view`, as `look` is a timeline of glances.
 *
 * Worked out in two steps, from the finished scene alone:
 *
 *  1. Their facing on the floor, an angle: 0 toward the camera, 90 to the
 *     right of the frame, -90 to its left, 180 away. A walker faces along
 *     the walk (away into the floor, toward the camera, across); one who
 *     talks or listens, toward whom they talk to, as a cartoon cheats it
 *     (three-quarter for most talk, profile face to face close up, a
 *     glance hardly at all); one who looks at a thing of the set, toward
 *     it; one who speaks to the viewer, or has nothing to face, toward the
 *     camera.
 *  2. That angle against the camera's (every camera is front-on today,
 *     yaw 0): within 22 degrees the front, to 67 three-quarter, to 112
 *     profile, to 157 three-quarter from behind, and past it the back;
 *     its sign is whether the view is mirrored (to the left).
 *
 * And on top: someone speaking never shows their back (they turn to
 * three-quarter at least); a view held less than 400 ms is no view (a
 * glance does not turn the body round). Pure: the same scene gives the
 * same views.
 *
 * Turns are motivated and steady (studio-turns-plan): a glance, a look up
 * or down, or a pause with nothing new to look at keeps the facing they
 * have (never a snap to the camera between lines); with nothing to face
 * they rest three-quarter toward the others; a look turns them round as
 * far as profile, never their back; lying down they face up to us, sat
 * down no further round than three-quarter. A turn is held MIN_HOLD_MS
 * unless a real reason turns them sooner (a walk, a thing used, a new
 * line, a cut), and none is undone within FLIP_BACK_MS (steadyFacings).
 */
import type {
  SceneDto,
  SceneEffectDto,
  ScenePlaceDto,
  SceneView,
} from '../../contracts';
import {
  NO_ROOM,
  WALK_DEPTH,
  isReverse,
  nearOf,
  pairSide,
  reflectPlace,
  roomOf,
  walksOf,
  type StageWalk,
} from './scene-film';

/** The camera's yaw straight on, from the front. */
export const FRONT_ON = 0;
/** And turned round, from the place's other side (a reverse shot, §4.2). */
export const TURNED_ROUND = 180;
/** The views in turn from the front round to the back. */
export const VIEW_ORDER: readonly SceneView[] = [
  'front',
  '3q',
  'profile',
  'back3q',
  'back',
];
/** A view held for less than this is no view: a glance does not turn the body. */
export const VIEW_HOLD_MS = 400;
/** Mouth shapes a second, as the acting sends them. */
const MOUTH_FPS = 30;

/**
 * The view the camera sees of someone facing `facing` degrees (0 toward
 * it, 90 to the frame's right), from a camera turned `yaw` degrees: and
 * whether it is mirrored (-1, facing left).
 */
export function viewAt(
  facing: number,
  yaw = FRONT_ON,
): { view: SceneView; mirror: 1 | -1 } {
  let a = (((facing - yaw) % 360) + 540) % 360;
  a -= 180;
  const off = Math.abs(a);
  const mirror: 1 | -1 = a < 0 ? -1 : 1;
  const view: SceneView =
    off <= 22
      ? 'front'
      : off <= 67
        ? '3q'
        : off <= 112
          ? 'profile'
          : off <= 157
            ? 'back3q'
            : 'back';
  return { view, mirror };
}

/** A walk's facing on the floor: along it, across and into or out of the floor. */
export function walkFacing(
  start: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  end: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  W: number,
): number {
  const across = end.x + end.w / 2 - (start.x + start.w / 2);
  const mean = (start.h + end.h) / 2;
  // Growing is coming toward the camera.
  const toward = mean > 0 ? (W * WALK_DEPTH * (end.h - start.h)) / mean : 0;
  if (Math.abs(across) < 1 && Math.abs(toward) < 1) return 0;
  return (Math.atan2(across, toward) * 180) / Math.PI;
}

/** How far into the floor a place stands, 0 at its back to 1 at its front. */
const depthOf = (place: ScenePlaceDto) => place.d ?? 0.5;

/**
 * Facing someone, as a cartoon cheats it toward the camera: turned
 * `turn` of the way (0 to 1) toward where they are. A glance hardly turns
 * the body (front); talk turns it three-quarter; close up and turned
 * well toward them, face to face in profile. Someone behind is looked
 * back at over the shoulder, as far as they are.
 */
export function facingToward(
  dx: number,
  dz: number,
  turn: number,
  close: boolean,
): number {
  if (Math.abs(dx) < 1 && Math.abs(dz) < 1) return 0;
  const side = dx === 0 ? (dz < 0 ? 1 : 0) : Math.sign(dx);
  const geometric = Math.abs((Math.atan2(dx, dz) * 180) / Math.PI);
  if (turn < 0.3) return side * Math.min(geometric, turn * 60);
  // Behind them, turned round to them as far as they are.
  if (geometric > 120) return side * geometric;
  if (close && turn >= 0.5) return side * 90;
  return side * Math.min(geometric, 50);
}

/** A facing someone speaking may show a camera turned `yaw`: never their back. */
const speakerFacing = (facing: number, yaw = FRONT_ON) => {
  const off = ((((facing - yaw) % 360) + 540) % 360) - 180;
  return Math.abs(off) > 112 ? yaw + (Math.sign(off) || 1) * 60 : facing;
};

/** The most a listener on the whole stage turns from the camera: three-quarter, their face seen. */
export const LISTEN_OPEN = 60;

/** The most a look turns someone from the camera on the whole stage: profile, never their back. */
export const LOOK_OPEN = 90;
/** Sat down, the body turns no further from the camera than three-quarter. */
export const SEAT_OPEN = 60;
/** With no one in particular to face, three-quarter toward the others there. */
export const REST_TURN = 45;
/** A look turned less than this is a glance: the head's, never the body's. */
export const GLANCE_TURN = 0.3;
/** A view held at least this long, unless a real reason turns them sooner (a new line, a walk, a thing used, a cut). */
export const MIN_HOLD_MS = 1500;
/** Never back to the view just left within this long (no A, B, A). */
export const FLIP_BACK_MS = 2000;

/** A facing turned no further from a camera turned `yaw` than `most` (three-quarter): a listener cheated open to it. */
export const cheatOpen = (
  facing: number,
  yaw = FRONT_ON,
  most = LISTEN_OPEN,
) => {
  const off = ((((facing - yaw) % 360) + 540) % 360) - 180;
  return Math.abs(off) > most ? yaw + (Math.sign(off) || 1) * most : facing;
};

/** Why someone faces as they do at a moment: what they do then. */
type Why =
  'use' | 'walk' | 'lie' | 'hug' | 'speak' | 'listen' | 'look' | 'rest' | 'off';
/** What they would face, null for what they face already. */
interface Want {
  facing: number | null;
  why: Why;
}
/** A facing from a moment on: why, whether it is at a cut, and its place on the wheel of views from the camera then. */
export interface Facing {
  t: number;
  facing: number;
  why: Why;
  cut: boolean;
  bin: number;
}
/** What turns someone as it begins or ends: their body going somewhere or doing something, or coming on. */
const PHYSICAL: ReadonlySet<Why> = new Set([
  'use',
  'walk',
  'lie',
  'hug',
  'off',
]);

/** Where a facing is on the wheel of eight views from a camera turned `yaw`: 0 the front, 4 the back. */
export function binOf(facing: number, yaw = FRONT_ON): number {
  const { view, mirror } = viewAt(facing, yaw);
  const k = VIEW_ORDER.indexOf(view);
  return mirror < 0 && k > 0 && k < 4 ? 8 - k : k;
}

/** How many views apart two places on the wheel are, the short way round. */
export const wheelSteps = (a: number, b: number): number => {
  const d = (((b - a) % 8) + 8) % 8;
  return Math.min(d, 8 - d);
};

/** Whether turning from `a` to `b` and then to `c` turns back: `c` is `a`, or beside it and nearer it than `b` is. */
export const flipsBack = (a: number, b: number, c: number): boolean =>
  a !== b && wheelSteps(a, c) <= 1 && wheelSteps(a, c) < wheelSteps(a, b);

/**
 * Facings kept only as often as the eye can follow a turn: one that
 * would come less than MIN_HOLD_MS after the last turn waits until the
 * hold is up (and is dropped if they no longer want it then), unless a
 * real reason turns them at once (a walk, a thing used, lying down, a
 * hug, their own new line or someone new speaking to them, a cut, or
 * the end of any of those); and a turn undone within FLIP_BACK_MS (A, B,
 * A) is not made at all, but for a walk or a thing used. Its first
 * facing always stays.
 */
export function steadyFacings(
  raw: readonly Facing[],
  endMs = Infinity,
): Facing[] {
  if (!raw.length) return [];
  const strong = (one: Facing, before: Facing) =>
    one.cut ||
    PHYSICAL.has(one.why) ||
    PHYSICAL.has(before.why) ||
    one.why === 'speak' ||
    one.why === 'listen';
  const kept: Facing[] = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    const one = raw[i];
    const last = kept[kept.length - 1];
    if (one.bin === last.bin) continue;
    if (strong(one, last) || one.t - last.t >= MIN_HOLD_MS) {
      kept.push(one);
      continue;
    }
    // Too soon after the last turn: made when the hold is up, as they
    // want then, if that is still a turn and held a while.
    const due = last.t + MIN_HOLD_MS;
    let j = i;
    while (j + 1 < raw.length && raw[j + 1].t <= due) j += 1;
    const then = raw[j];
    const until = raw[j + 1]?.t ?? endMs;
    if (then.bin !== last.bin && until - due >= VIEW_HOLD_MS)
      kept.push({ ...then, t: due, cut: false });
    i = j;
  }
  // No A, B, A within FLIP_BACK_MS (nor A, B and back to beside A), but
  // for a body going somewhere or doing something: A kept on, then turned
  // the little way to C if C is not A.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 1; i + 1 < kept.length; i += 1) {
      const [a, b, c] = [kept[i - 1], kept[i], kept[i + 1]];
      if (
        flipsBack(a.bin, b.bin, c.bin) &&
        c.t - b.t < FLIP_BACK_MS &&
        !b.cut &&
        !c.cut &&
        !PHYSICAL.has(b.why) &&
        !PHYSICAL.has(c.why) &&
        !PHYSICAL.has(a.why)
      ) {
        kept.splice(i, c.bin === a.bin ? 2 : 1);
        changed = true;
        break;
      }
    }
  }
  return kept;
}

/** How far round the camera is over someone's shoulder (studio-views-plan §3.1): the one it looks at three-quarter to us, the one near from behind. */
export const OTS_YAW = 45;

/**
 * How a shot turns the two it is of (§3.1, §4): over the shoulder of
 * `part` onto `target`, the camera `OTS_YAW` round toward the one near, so
 * the one it is on is three-quarter to us and the one near three-quarter
 * from behind; in profile, the two face to face across the frame, the
 * camera straight on. Each faces the other on the floor (90 to the side
 * they are on), so each keeps the side of the frame they look to (the
 * 180° rule, §3.3). Null for any other shot.
 */
export function shotFacing(
  shot: Pick<SceneEffectDto, 'target' | 'part' | 'shot'>,
  places: Record<string, Pick<ScenePlaceDto, 'x' | 'w'>>,
): { yaw: number; facing: Record<string, number> } | null {
  const kind = shot.shot?.kind;
  if (isReverse(shot)) {
    // Over the crowd the other way: from behind the one speaking to them.
    if (kind === 'crowd')
      return { yaw: TURNED_ROUND, facing: { [shot.target]: 0 } };
    if (
      kind === 'ots' &&
      shot.part &&
      places[shot.target] &&
      places[shot.part]
    ) {
      // Over the other's shoulder from the place's other side, the two on
      // the sides of the frame they have from the front (§3.3): the one it
      // is on three-quarter to us, the one near three-quarter from behind.
      const dir = pairSide(shot, places);
      return {
        yaw: TURNED_ROUND - OTS_YAW * dir,
        facing: { [shot.target]: 90 * dir, [shot.part]: -90 * dir },
      };
    }
    // Any other shot turned round: each faces as from the front, seen from behind it.
    const front = shotFacing(
      { ...shot, shot: { enter: 'cut', ...(kind ? { kind } : {}) } },
      places,
    );
    return front ? { ...front, yaw: front.yaw + TURNED_ROUND } : null;
  }
  if ((kind !== 'ots' && kind !== 'profile') || !shot.part) return null;
  const one = places[shot.target];
  const two = places[shot.part];
  if (!one || !two) return null;
  // Where the one it is on is, from the other: 1 to the right.
  const dir = Math.sign(one.x + one.w / 2 - (two.x + two.w / 2)) || 1;
  return {
    yaw: kind === 'ots' ? -OTS_YAW * dir : 0,
    facing: { [shot.target]: -90 * dir, [shot.part]: 90 * dir },
  };
}

/**
 * The views of everyone drawn from every side in a scene, by id: each a
 * timeline [atMs, view, mirror], from its first moment. Only those whose
 * view ever leaves the front.
 */
export function viewsOf(
  scene: Pick<
    SceneDto,
    'things' | 'steps' | 'stagings' | 'acting' | 'setting' | 'durationMs'
  > &
    Partial<Pick<SceneDto, 'effects'>>,
): Record<string, [number, SceneView, 1 | -1][]> {
  const out: Record<string, [number, SceneView, 1 | -1][]> = {};
  const acting = scene.acting ?? {};
  const wide = scene.stagings.wide;
  if (!wide) return out;
  const W = wide.w;
  const viewed = scene.things.filter(
    (thing) =>
      thing.kind === 'drawing' &&
      thing.rigVersion === 3 &&
      (thing.views?.length ?? 0) > 1,
  );
  if (!viewed.length) return out;
  const walks = walksOf(scene);
  const stepAt = (t: number) => {
    let k = -1;
    for (let j = 0; j < scene.steps.length && scene.steps[j].atMs <= t; j += 1)
      k = j;
    return k;
  };
  const walkOf = (id: string, t: number): StageWalk | undefined =>
    walks.find((w) => w.id === id && w.from <= t && t < w.to);
  // The camera's shots (§3): which is on at a moment, and whom it cheats
  // near the camera, where.
  const set = scene.things.find(
    (thing) =>
      thing.kind === 'drawing' &&
      thing.backdrop &&
      scene.steps.some((step) => step.backdrop === thing.id),
  );
  const room = set?.kind === 'drawing' ? roomOf(set, wide.w, wide.h) : NO_ROOM;
  const shots = (scene.effects ?? [])
    .filter((e) => e.do === 'zoom' && e.untilMs !== undefined)
    .sort((a, b) => a.atMs - b.atMs);
  const shotAt = (t: number) =>
    shots.find((shot) => shot.atMs <= t && t < (shot.untilMs ?? shot.atMs));
  const nearAt = (id: string, t: number): ScenePlaceDto | null => {
    const shot = shotAt(t);
    const k = stepAt(t);
    if (!shot || k < 0) return null;
    const near = nearOf(
      shot,
      scene.steps[k].show,
      wide.places[k] ?? {},
      wide.w,
      wide.h,
      room,
    );
    if (near?.id !== id) return null;
    // Turned round, where the front would have them, as everyone else here is.
    return isReverse(shot) ? reflectPlace(near.place, wide.w) : near.place;
  };
  /** The camera's yaw at a moment: turned round in a shot from the place's other side. */
  const yawAt = (t: number) => (isReverse(shotAt(t)) ? TURNED_ROUND : FRONT_ON);
  /** Where someone is at `t`, on the wide stage: cheated near the camera for a shot, along a walk, else where their step has them. */
  const placeOf = (
    id: string,
    t: number,
    cheat = true,
  ): ScenePlaceDto | null => {
    const cheated = cheat ? nearAt(id, t) : null;
    if (cheated) return cheated;
    const walk = walkOf(id, t);
    if (walk) {
      const p = (t - walk.from) / Math.max(1, walk.to - walk.from);
      const mix = (a: number, b: number) => a + (b - a) * p;
      return {
        x: mix(walk.start.x, walk.end.x),
        y: mix(walk.start.y, walk.end.y),
        w: mix(walk.start.w, walk.end.w),
        h: mix(walk.start.h, walk.end.h),
        d: mix(depthOf(walk.start), depthOf(walk.end)),
      };
    }
    const k = stepAt(t);
    if (k < 0 || !scene.steps[k].show.includes(id)) return null;
    return wide.places[k]?.[id] ?? null;
  };
  /** A thing of the set, where it stands: something to look at. */
  const featureAt = (id: string): ScenePlaceDto | null => {
    const feature = scene.setting?.features?.find(
      (f) => f.id === id || `f:${f.id}` === id,
    );
    return feature ? { ...feature.at.wide } : null;
  };
  /** Whether someone speaks at a moment: their mouth moving, a moment either side. */
  const speakingAt = (who: string, t: number) =>
    (acting[who]?.mouth ?? []).some(
      ([at, shapes]) =>
        at - 200 <= t && t < at + (shapes.length * 1000) / MOUTH_FPS + 200,
    );
  /** Who is someone on the stage: those who act, and everyone drawn to. */
  const people = new Set(
    scene.things
      .filter(
        (thing) =>
          thing.kind === 'drawing' &&
          !thing.backdrop &&
          (thing.rig || acting[thing.id]),
      )
      .map((thing) => thing.id),
  );
  for (const thing of viewed) {
    const id = thing.id;
    const mine = acting[id] ?? {};
    const looks = mine.look ?? [];
    const speech = (mine.mouth ?? []).map(([at, shapes]): [number, number] => [
      at,
      at + (shapes.length * 1000) / MOUTH_FPS,
    ]);
    const hugs = (mine.moves ?? []).filter(([, what]) => what === 'hug');
    // Sat down or lying: held until they get up (scene-acting).
    const held = (mine.moves ?? []).filter(
      ([, what]) => what === 'sit' || what === 'lie',
    );
    const heldAt = (t: number) =>
      held.find(([at, , ms]) => at <= t && t < at + ms)?.[1];
    const myWalks = walks.filter((w) => w.id === id);
    // Every moment what they face may change.
    const times = new Set<number>([0]);
    for (const [at] of looks) times.add(at);
    for (const [a, b] of speech) {
      times.add(Math.round(a - 200));
      times.add(Math.round(b + 200));
    }
    // As anyone else starts or stops speaking: a listener turns in to them.
    for (const [who, one] of Object.entries(acting))
      if (who !== id)
        for (const [at, shapes] of one.mouth ?? []) {
          times.add(Math.round(at - 200));
          times.add(Math.round(at + (shapes.length * 1000) / MOUTH_FPS + 200));
        }
    for (const w of myWalks) {
      times.add(Math.round(w.from));
      times.add(Math.round(w.to));
    }
    for (const [at, , ms] of [...hugs, ...held]) {
      times.add(at);
      times.add(at + ms);
    }
    // What they do with a thing of the set, step by step.
    const interacts = mine.interact ?? [];
    for (const one of interacts)
      for (const [, at, ms] of one.steps) {
        times.add(at);
        times.add(at + ms);
      }
    for (const step of scene.steps) times.add(step.atMs);
    // As a shot begins and ends: it may turn them for the camera.
    for (const shot of shots) {
      times.add(Math.round(shot.atMs));
      times.add(Math.round(shot.untilMs ?? shot.atMs));
    }
    /** Whether a shot on at `t` is a close of their own they speak in: they may be cheated open to its camera. */
    const closeOnSpeaker = (t: number) => {
      const shot = shotAt(t);
      if (!shot || shot.target !== id || shot.part) return false;
      const kind = shot.shot?.kind;
      if (kind === 'ots' || kind === 'profile' || kind === 'crowd')
        return false;
      const until = shot.untilMs ?? shot.atMs;
      return speech.some(([a, b]) => a < until && b > shot.atMs);
    };
    /** How the shot on at `t` turns them: its camera's yaw, and their facing in it. */
    const inShot = (t: number): { yaw: number; facing: number } | null => {
      const shot = shotAt(t);
      const k = stepAt(t);
      if (!shot || k < 0 || walkOf(id, t)) return null;
      // An insert frames a thing where it is as the front view draws it
      // (in a hand, on a table): whoever is there is drawn so for it,
      // unseen, between its two cuts.
      if (shot.shot?.kind === 'insert') return { yaw: 0, facing: 0 };
      if (shot.shot?.kind === 'crowd' && shot.target === id)
        // Over the crowd: they speak to them, to us; the other way, seen
        // from behind as they do.
        return isReverse(shot)
          ? { yaw: TURNED_ROUND, facing: 0 }
          : { yaw: 0, facing: 0 };
      const turned = shotFacing(shot, wide.places[k] ?? {});
      const facing = turned?.facing[id];
      return turned && facing !== undefined
        ? { yaw: turned.yaw, facing }
        : null;
    };
    /** Whether they begin to speak, or `who` does, about `t`: a new line, a real reason to turn at once. */
    const onsetAt = (who: string, t: number) =>
      (acting[who]?.mouth ?? []).some(([at]) => at - 450 <= t && t <= at + 50);
    /**
     * What they would face at `t`, and why, from what they do then alone:
     * a thing of the set they use, a walk, lying down (face up to us);
     * whom they hug, speak or listen to, or look at (turned toward them,
     * as a cartoon cheats it: a look never turns their back to the
     * camera, a listener shows their face three-quarter, and sat down the
     * body turns no further than three-quarter). A glance (a look under
     * GLANCE_TURN), a look up or down, or nothing to look at: null, they
     * keep the facing they have (the head does the glance). `cheat`:
     * from where a shot cheats them near the camera.
     */
    const wantAt = (t: number, cheat = false): Want => {
      const using = interactFacing(id, t);
      if (using !== null) return { facing: using, why: 'use' };
      const walk = walkOf(id, t);
      if (walk)
        return { facing: walkFacing(walk.start, walk.end, W), why: 'walk' };
      const holding = heldAt(t);
      if (holding === 'lie') return { facing: 0, why: 'lie' };
      const me = placeOf(id, t, cheat);
      if (!me) return { facing: null, why: 'off' };
      const yaw = yawAt(t);
      const speaking = speech.some(([a, b]) => a - 200 <= t && t < b + 200);
      let key: (typeof looks)[number] | undefined;
      for (const one of looks) if (one[0] <= t) key = one;
      const hugging = hugs.find(([at, , ms]) => at <= t && t < at + ms);
      const target = hugging?.[3] ?? key?.[1] ?? null;
      const turn = hugging ? 0.6 : (key?.[2] ?? 0);
      let facing: number | null = null;
      let why: Why = 'rest';
      if (target === '@left' || target === '@right') {
        if (turn >= GLANCE_TURN) {
          facing = (target === '@left' ? -1 : 1) * (turn >= 0.5 ? 60 : 45);
          why = speaking ? 'speak' : 'look';
        }
      } else if (target && !target.startsWith('@') && turn >= GLANCE_TURN) {
        const them = placeOf(target, t, cheat) ?? featureAt(target);
        if (them) {
          const dx = them.x + them.w / 2 - (me.x + me.w / 2);
          const dz = (depthOf(them) - depthOf(me)) * W * 0.5;
          const close = Math.abs(dx) < (me.w + them.w) * 0.75;
          facing = facingToward(dx, dz, turn, close);
          const listening = !speaking && !hugging && speakingAt(target, t);
          // Listening to someone behind them, on the whole stage: turned in
          // three-quarter, their face to us, as a film cheats it, never
          // their back (a shot of their own turns them as it frames them).
          if (listening && !shotAt(t)) facing = cheatOpen(facing, yaw);
          // Looking or speaking to someone or something behind them:
          // round as far as profile, never their back.
          else if (!hugging) facing = cheatOpen(facing, yaw, LOOK_OPEN);
          why = hugging
            ? 'hug'
            : onsetAt(id, t)
              ? 'speak'
              : onsetAt(target, t)
                ? 'listen'
                : 'look';
        }
      }
      if (facing !== null && holding === 'sit')
        facing = cheatOpen(facing, yaw, SEAT_OPEN);
      return { facing, why };
    };
    /** Toward the others on the stage at `t`, three-quarter; null when no one else is there. */
    const restFacing = (t: number): number | null => {
      const me = placeOf(id, t, false);
      const k = stepAt(t);
      if (!me || k < 0) return null;
      // Where the others stand at this step (not where a walk has them on the way).
      const others = scene.steps[k].show
        .filter((other) => other !== id && people.has(other))
        .map((other) => wide.places[k]?.[other])
        .filter((place): place is ScenePlaceDto => Boolean(place));
      if (!others.length) return null;
      const mid = others.reduce((n, o) => n + o.x + o.w / 2, 0) / others.length;
      const dx = mid - (me.x + me.w / 2);
      return Math.abs(dx) < me.w * 0.1 ? 0 : Math.sign(dx) * REST_TURN;
    };
    /**
     * Which way someone faces while they use a thing of the set
     * (studio-interactions-plan §2.1): away into a doorway going in, out of
     * it coming out; turned to a door, a switch or a tap they use at its
     * face (from behind, three-quarter), to a counter they lean on; along
     * a flight of stairs seen from the side, away up steps or a ladder seen
     * from the front; sat at a table, to the camera. Null when they use
     * nothing then.
     */
    function interactFacing(who: string, t: number): number | null {
      for (const one of interacts) {
        const step = one.steps.find(([, at, ms]) => t >= at && t < at + ms);
        if (!step) continue;
        const [name] = step;
        const f = scene.setting?.features?.find((x) => x.id === one.feature);
        const me = placeOf(who, t) ?? placeOf(who, one.at - 1);
        const toward =
          f && me
            ? Math.sign(f.at.wide.x + f.at.wide.w / 2 - (me.x + me.w / 2)) || 1
            : 1;
        switch (one.does) {
          case 'go-through':
            return name === 'through' || name === 'gone' || name === 'close'
              ? 180
              : toward * 50;
          case 'come-through':
            return 0;
          case 'climb-stairs':
          case 'climb-ladder': {
            // Along a flight seen from the side, the way it rises.
            const rises = f?.affordances?.steps;
            const across =
              rises && rises.length > 1
                ? Math.sign(rises[rises.length - 1][0] - rises[0][0])
                : 0;
            return across ? across * 90 : 180;
          }
          case 'sit-at':
          case 'stand-from':
            return 0;
          case 'lean-on':
            return toward * 50;
          default:
            // At its face: turned to it, three-quarter from behind.
            return name === 'wait' ? toward * 50 : toward * 135;
        }
      }
      return null;
    }
    const sorted = [...times].filter((t) => t >= 0).sort((a, b) => a - b);
    const cuts = new Set(
      shots.flatMap((shot) => [
        Math.round(shot.atMs),
        Math.round(shot.untilMs ?? shot.atMs),
      ]),
    );
    // 1. What they face on the floor, moment by moment: what they do
    // then, or, with nothing new to face, the facing they had (after a
    // walk, turned three-quarter to the others, or the way they went).
    const raw: Facing[] = [];
    for (const t of sorted) {
      // Just after the moment, so a walk that starts then is walking.
      const want = wantAt(t + 1);
      const last = raw[raw.length - 1];
      let facing = want.facing;
      if (facing === null) {
        if (
          last &&
          last.why !== 'walk' &&
          last.why !== 'lie' &&
          last.why !== 'off'
        )
          facing = last.facing;
        else {
          // About to lie down: as they will lie, face up to us.
          const lying = held.some(
            ([at, what]) => what === 'lie' && at >= t && at - t < MIN_HOLD_MS,
          );
          const rest = lying ? 0 : restFacing(t + 1);
          const went = last?.why === 'walk' ? last.facing : 0;
          facing =
            rest ??
            (Math.abs(went) <= 22 ? 0 : cheatOpen(went, FRONT_ON, REST_TURN));
        }
      }
      raw.push({
        t: Math.round(t),
        facing,
        why: want.why,
        cut: cuts.has(Math.round(t)),
        bin: binOf(facing, yawAt(t + 1)),
      });
    }
    // Not on the stage yet: already as they will be when they come on,
    // so they come on turned so, not turning.
    const on = raw.find((one) => one.why !== 'off');
    if (on)
      for (const one of raw) {
        if (one.why !== 'off') break;
        one.facing = on.facing;
        one.bin = on.bin;
      }
    // 2. Turned only as often as the eye can follow (studio-turns-plan).
    const kept = steadyFacings(raw, scene.durationMs);
    /** The facing they keep at `t`. */
    const keptAt = (t: number) => {
      let found = kept[0];
      for (const one of kept) if (one.t <= t) found = one;
      return found;
    };
    // 3. The view the camera sees of that facing: a shot's own, a
    // speaker never shows their back, one speaking in a close of their
    // own cheated open to it, one cheated near the camera from there.
    const keys: [number, SceneView, 1 | -1][] = [];
    const moments = [...new Set([...sorted, ...kept.map((one) => one.t)])]
      .filter((t) => t >= 0)
      .sort((a, b) => a - b);
    for (const t of moments) {
      const shot = inShot(t + 1);
      const using = interactFacing(id, t + 1);
      let facing = keptAt(t)?.facing ?? 0;
      const yaw = shot?.yaw ?? yawAt(t + 1);
      let seen: { view: SceneView; mirror: 1 | -1 };
      if (using !== null) seen = viewAt(facing, yaw);
      else if (shot) seen = viewAt(shot.facing, shot.yaw);
      else {
        if (nearAt(id, t + 1)) {
          const near = wantAt(t + 1, true);
          if (near.facing !== null) facing = near.facing;
        }
        if (closeOnSpeaker(t + 1)) facing = cheatOpen(facing, yaw);
        if (speech.some(([a, b]) => a - 200 <= t + 1 && t + 1 < b + 200))
          facing = speakerFacing(facing, yaw);
        seen = viewAt(facing, yaw);
      }
      const last = keys[keys.length - 1];
      // The front is the same either way round.
      const m: 1 | -1 = seen.view === 'front' ? 1 : seen.mirror;
      if (last && last[1] === seen.view && last[2] === m) continue;
      keys.push([Math.round(t), seen.view, m]);
    }
    const steady = holdViews(keys, scene.durationMs);
    if (steady.some(([, view]) => view !== 'front')) out[id] = steady;
  }
  return out;
}

/**
 * A view timeline with no view held for less than VIEW_HOLD_MS: a view
 * that gives way that soon is dropped, the one before it kept on, and
 * keys that change nothing merged. Its first key always stays.
 */
export function holdViews(
  keys: readonly [number, SceneView, 1 | -1][],
  endMs = Infinity,
): [number, SceneView, 1 | -1][] {
  const list = keys.map((k) => [...k] as [number, SceneView, 1 | -1]);
  const merge = () => {
    for (let i = list.length - 1; i > 0; i -= 1)
      if (list[i][1] === list[i - 1][1] && list[i][2] === list[i - 1][2])
        list.splice(i, 1);
  };
  merge();
  for (let i = 1; i < list.length;) {
    const until = list[i + 1]?.[0] ?? endMs;
    if (until - list[i][0] < VIEW_HOLD_MS) {
      list.splice(i, 1);
      merge();
      i = 1;
    } else i += 1;
  }
  return list;
}

/** A scene with everyone drawn from every side given their views. */
export function withViews<T extends Parameters<typeof viewsOf>[0]>(
  scene: T,
): T {
  const views = viewsOf(scene);
  if (!Object.keys(views).length) return scene;
  const acting = { ...(scene.acting ?? {}) };
  for (const [id, view] of Object.entries(views))
    acting[id] = { ...(acting[id] ?? {}), view };
  return { ...scene, acting };
}
