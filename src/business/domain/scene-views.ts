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
 */
import type { SceneDto, ScenePlaceDto, SceneView } from '../../contracts';
import { WALK_DEPTH, walksOf, type StageWalk } from './scene-film';

/** The camera's yaw on every shot today: straight on (§3 brings others). */
export const FRONT_ON = 0;
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

/** A facing someone speaking may show: never their back. */
const speakerFacing = (facing: number) =>
  Math.abs(facing) > 112 ? Math.sign(facing) * 60 : facing;

/**
 * The views of everyone drawn from every side in a scene, by id: each a
 * timeline [atMs, view, mirror], from its first moment. Only those whose
 * view ever leaves the front.
 */
export function viewsOf(
  scene: Pick<
    SceneDto,
    'things' | 'steps' | 'stagings' | 'acting' | 'setting' | 'durationMs'
  >,
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
  /** Where someone is at `t`, on the wide stage: along a walk, else where their step has them. */
  const placeOf = (id: string, t: number): ScenePlaceDto | null => {
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
  for (const thing of viewed) {
    const id = thing.id;
    const mine = acting[id] ?? {};
    const looks = mine.look ?? [];
    const speech = (mine.mouth ?? []).map(([at, shapes]): [number, number] => [
      at,
      at + (shapes.length * 1000) / MOUTH_FPS,
    ]);
    const hugs = (mine.moves ?? []).filter(([, what]) => what === 'hug');
    const myWalks = walks.filter((w) => w.id === id);
    // Every moment what they face may change.
    const times = new Set<number>([0]);
    for (const [at] of looks) times.add(at);
    for (const [a, b] of speech) {
      times.add(Math.round(a - 200));
      times.add(Math.round(b + 200));
    }
    for (const w of myWalks) {
      times.add(Math.round(w.from));
      times.add(Math.round(w.to));
    }
    for (const [at, , ms] of hugs) {
      times.add(at);
      times.add(at + ms);
    }
    for (const step of scene.steps) times.add(step.atMs);
    const facingAt = (t: number): number => {
      const walk = walkOf(id, t);
      const speaking = speech.some(([a, b]) => a - 200 <= t && t < b + 200);
      if (walk) {
        const along = walkFacing(walk.start, walk.end, W);
        return speaking ? speakerFacing(along) : along;
      }
      const me = placeOf(id, t);
      if (!me) return 0;
      let key: (typeof looks)[number] | undefined;
      for (const one of looks) if (one[0] <= t) key = one;
      const hugging = hugs.find(([at, , ms]) => at <= t && t < at + ms);
      const target = hugging?.[3] ?? key?.[1] ?? null;
      const turn = hugging ? 0.6 : (key?.[2] ?? 0);
      let facing = 0;
      if (target === '@left' || target === '@right')
        facing = (target === '@left' ? -1 : 1) * (turn >= 0.5 ? 60 : 45);
      else if (target && !target.startsWith('@')) {
        const them = placeOf(target, t) ?? featureAt(target);
        if (them) {
          const dx = them.x + them.w / 2 - (me.x + me.w / 2);
          const dz = (depthOf(them) - depthOf(me)) * W * 0.5;
          const close = Math.abs(dx) < (me.w + them.w) * 0.75;
          facing = facingToward(dx, dz, turn, close);
        }
      }
      return speaking ? speakerFacing(facing) : facing;
    };
    const keys: [number, SceneView, 1 | -1][] = [];
    for (const t of [...times].filter((t) => t >= 0).sort((a, b) => a - b)) {
      // Just after the moment, so a walk that starts then is walking.
      const { view, mirror } = viewAt(facingAt(t + 1));
      const last = keys[keys.length - 1];
      // The front is the same either way round.
      const m: 1 | -1 = view === 'front' ? 1 : mirror;
      if (last && last[1] === view && last[2] === m) continue;
      keys.push([Math.round(t), view, m]);
    }
    const held = holdViews(keys, scene.durationMs);
    if (held.some(([, view]) => view !== 'front')) out[id] = held;
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
