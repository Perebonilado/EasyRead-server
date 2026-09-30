/**
 * The space check on a made Studio story (studio-space-plan): whether its
 * people keep to the room they have, moment by moment, as the player
 * plays the wide stage. Four faults, each counted once per two people
 * (or one person and a thing) per step:
 *
 *  - through: one walks, or steps in, through another's body in the same
 *    row of the floor, rather than round them, before or behind;
 *  - hidden: someone's face more than half behind someone nearer the
 *    camera, both standing still, where the two melt into one (what
 *    looks like a fade);
 *  - outside: someone lying in or on a thing (a manger, a bed) with their
 *    head or their feet out past its sides, or hanging above it;
 *  - stand: someone standing off the floor (floating above its back edge
 *    or below its front), or inside a thing that stands on it (a stool, a
 *    manger), rather than beside it or behind it;
 *  - prop: a thing set down off the floor, or inside or behind a thing
 *    standing on it, where it floats over the thing's legs (a lamp set
 *    down among a manger's). One held is at the hand the player moves.
 *
 * Positions follow the player (timeline.ts): each step's place, a walk
 * between two eased along its path (round a body, where it bends), a step
 * in toward someone, and lying down tipped over about the feet.
 */
import type {
  SceneDto,
  SceneFeatureDto,
  ScenePlaceDto,
  SceneStepDto,
} from '../../contracts';
import { SAME_ROW_D, BODY_SHARE } from './scene-spacing';
import { setFrameFor, walkReach } from './scene-shape';
import {
  handsAt,
  obstaclesOf,
  pathPlace,
  restBlocked,
  thingBoxAt,
  walkBetween,
  type ThingsOnStage,
} from './scene-film';

export type SpaceFaultKind =
  'through' | 'hidden' | 'outside' | 'stand' | 'prop';

export interface SpaceFault {
  kind: SpaceFaultKind;
  /** The step it is at, from 0, and the moment it is worst. */
  step: number;
  atMs: number;
  /** Who; and whom or what (a feature's id), or null. */
  a: string;
  b: string | null;
  /** How bad, 0 to 1: the share of a body in another, of a face covered, of a body out of its thing, or of the height off the floor. */
  amount: number;
  /** For a stand or a thing set down: floating, or in (or behind) a thing. */
  why?: 'floating' | 'in-thing';
}

/** How often the check looks, in ms. */
const EVERY_MS = 100;
/** A face covered by more than this share is hidden. */
const HIDDEN_MOST = 0.5;
/** Two bodies overlapping by more than this share of the narrower one's are in each other. */
const THROUGH_LEAST = 0.2;
/** A face's radius, as a share of a figure's frame width (the kit's head, 46 of 160 units, a little inside its outline). */
const FACE_R = 0.24;
/** How far someone lying down is tipped over (timeline.ts). */
const LIE_DEG = 86;
/** Things people stand beside and never in: on the floor, solid. */
const SOLID_KINDS = new Set([
  'bench',
  'chair',
  'sofa',
  'table',
  'bed',
  'crate',
  'stall',
  'counter',
  'cupboard',
  'sink',
  'well',
  'drawn',
]);

/** A body on the stage at a moment: across it, its feet and its face, how deep, and whether it moves. */
export interface BodyAt {
  id: string;
  x0: number;
  x1: number;
  top: number;
  feet: number;
  d: number;
  face: { x: number; y: number; r: number };
  /** Its head and its feet, where it lies. */
  lying: { head: [number, number]; foot: [number, number] } | null;
  moving: boolean;
  sitting: boolean;
  /** In someone's arms: whose. */
  held?: string;
}

/** The step on at `t`: the last begun; the first before any has. */
function stepAt(steps: readonly SceneStepDto[], t: number): number {
  let k = 0;
  for (let i = 0; i < steps.length; i += 1) if (steps[i].atMs <= t) k = i;
  return k;
}

/** A held move begun this soon after the scene's first step is there from its first frame (timeline.ts OPENS_WITH_MS). */
const OPENS_WITH_MS = 700;

/** Whether a move of someone's is held on at `t` (sitting, lying: until they get up), from the first frame when the scene opens with it. */
function heldOn(
  moves: readonly (readonly [number, string, number?, string?])[],
  kind: string,
  t: number,
  opensAt = 0,
): readonly [number, string, number?, string?] | null {
  let on: readonly [number, string, number?, string?] | null = null;
  for (const move of moves) {
    const [at, what, ms] = move;
    const from = at <= opensAt + OPENS_WITH_MS ? -Infinity : at;
    if (from > t) break;
    if (what === kind && t < at + (ms ?? 0)) on = move;
    if (
      on &&
      (what === 'stand' || what === 'get-up' || what === 'stand-up') &&
      at > on[0]
    )
      on = null;
  }
  return on;
}

const PEOPLE_MOVES_STEP = new Set(['step-in', 'step-back']);
/** A step in or back: as far as a share of their width, never nearer whom they step to than this share of it (timeline.ts STEP_MOST, STEP_ROOM). */
const STEP_MOST = 0.3;
const STEP_ROOM = 1.05;
const STEP_MS = 520;

/** Whether someone is someone the kit draws standing with people. */
export function standsWithPeople(scene: SceneDto, id: string): boolean {
  const thing = scene.things.find((t) => t.id === id);
  return (
    thing?.kind === 'drawing' &&
    !thing.backdrop &&
    (thing.rig === true || thing.units !== undefined)
  );
}

/** Everyone standing with people at `t` on the wide stage, as the player has them. */
export function bodiesAt(scene: SceneDto, t: number): BodyAt[] {
  const { steps } = scene;
  if (!steps.length) return [];
  const { w: W, places } = scene.stagings.wide;
  const R = walkReach(scene.stagings.wide);
  const k = stepAt(steps, t);
  const step = steps[k];
  const prev = k > 0 ? steps[k - 1] : null;
  const out: BodyAt[] = [];
  const placeOf = new Map<string, { place: ScenePlaceDto; moving: boolean }>();
  for (const id of step.show) {
    if (!standsWithPeople(scene, id)) continue;
    const target = places[k]?.[id];
    if (!target) continue;
    let place = target;
    let moving = false;
    const from = prev?.show.includes(id) ? places[k - 1]?.[id] : undefined;
    const walks = scene.acting?.[id]?.walks === true;
    if (from && walks) {
      const pace =
        step.pace?.[id] === 'run'
          ? 2.2
          : Math.min(2.2, Math.max(1, step.hurry?.[id] ?? 1));
      const ms = walkBetween(from, target, R, scene.walk) / pace;
      const p = (t - step.atMs) / ms;
      if (
        p < 1 &&
        Math.abs(from.x - target.x) + Math.abs(from.h - target.h) > 1
      ) {
        place = pathPlace(from, target, Math.max(0, p), R);
        moving = p > 0;
      }
    }
    placeOf.set(id, { place, moving });
  }
  const head = (id: string, place: ScenePlaceDto): [number, number] => {
    const thing = scene.things.find((one) => one.id === id);
    const share =
      thing?.kind === 'drawing' && thing.head ? thing.head : [0.5, 0.3];
    return [place.x + place.w * share[0], place.y + place.h * share[1]];
  };
  for (const [id, { place, moving }] of placeOf) {
    const moves = scene.acting?.[id]?.moves ?? [];
    // A step in or back, toward or from whom they face.
    let shift = 0;
    for (const [at, what, ms, toward] of moves) {
      if (!PEOPLE_MOVES_STEP.has(what) || !ms || t <= at || t >= at + ms)
        continue;
      const turn = Math.min(STEP_MS, ms / 2);
      const q =
        t > at + ms - turn
          ? 1 - (t - (at + ms - turn)) / turn
          : Math.min(1, (t - at) / turn);
      const me = head(id, place);
      const them =
        typeof toward === 'string' && placeOf.has(toward)
          ? head(toward, placeOf.get(toward)!.place)
          : null;
      const side = them ? Math.sign(them[0] - me[0]) || 1 : 1;
      const dir = what === 'step-in' ? side : -side;
      let most = place.w * STEP_MOST;
      if (what === 'step-in' && them)
        most = Math.min(
          most,
          Math.max(0, Math.abs(them[0] - me[0]) - place.w * STEP_ROOM),
        );
      most = Math.min(
        most,
        dir > 0 ? Math.max(0, W - (place.x + place.w)) : Math.max(0, place.x),
      );
      // Never into anyone on the way in their row (timeline.ts roomAhead).
      const mid = place.x + place.w / 2;
      for (const [other, { place: them }] of placeOf) {
        if (
          other === id ||
          Math.abs((them.d ?? 0.5) - (place.d ?? 0.5)) >= SAME_ROW_D
        )
          continue;
        const ahead = (them.x + them.w / 2 - mid) * dir;
        if (ahead > 0)
          most = Math.min(
            most,
            Math.max(0, ahead - (place.w + them.w) * BODY_SHARE),
          );
      }
      shift = dir * most * Math.max(0, Math.min(1, q));
    }
    const cx = place.x + place.w / 2 + shift;
    // Their feet where the stage stands them: the bottom of their frame.
    const feet = place.y + place.h;
    const [hx, hy] = head(id, place);
    const faceR = place.w * FACE_R;
    const opens = steps[0].atMs;
    const lie = heldOn(moves, 'lie', t, opens);
    const sitting = Boolean(heldOn(moves, 'sit', t, opens));
    let lying: BodyAt['lying'] = null;
    let face = { x: hx + shift, y: hy, r: faceR };
    let x0 = cx - place.w * BODY_SHARE;
    let x1 = cx + place.w * BODY_SHARE;
    let top = place.y + place.h * 0.1;
    if (lie) {
      // Over on their side about their feet: toward the side it is aimed
      // away from (its part), else away from the others (timeline.ts).
      const toward = lie[3];
      let over: number;
      if (toward === '@right') over = -1;
      else if (toward === '@left') over = 1;
      else {
        const others = [...placeOf.entries()].filter(([o]) => o !== id);
        const mid = others.length
          ? others.reduce((n, [, o]) => n + o.place.x + o.place.w / 2, 0) /
            others.length
          : cx;
        over = -(Math.sign(mid - cx) || 1);
      }
      const a = (over * LIE_DEG * Math.PI) / 180;
      const turn = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - feet;
        return [
          cx + dx * Math.cos(a) - dy * Math.sin(a),
          feet + dx * Math.sin(a) + dy * Math.cos(a),
        ];
      };
      const [fx, fy] = turn(hx + shift, hy);
      face = { x: fx, y: fy, r: faceR };
      lying = { head: [fx, fy], foot: [cx, feet] };
      x0 = Math.min(fx - faceR, cx);
      x1 = Math.max(fx + faceR, cx);
      top = Math.min(fy - faceR, feet - place.w * BODY_SHARE);
    }
    out.push({
      id,
      x0,
      x1,
      top,
      feet,
      d: place.d ?? 0.5,
      face,
      lying,
      moving: moving || shift !== 0,
      sitting,
      ...(place.held ? { held: place.held } : {}),
    });
  }
  return out;
}

/** How much of a face is behind a body: the share of it the body's head and trunk cover. */
function faceCovered(face: BodyAt['face'], by: BodyAt): number {
  let n = 0;
  let inside = 0;
  const trunkTop = by.lying ? by.top : by.face.y + by.face.r * 0.6;
  for (let i = -3; i <= 3; i += 1)
    for (let j = -3; j <= 3; j += 1) {
      const x = face.x + (i / 3) * face.r;
      const y = face.y + (j / 3) * face.r;
      if ((x - face.x) ** 2 + (y - face.y) ** 2 > face.r ** 2) continue;
      n += 1;
      const inHead =
        (x - by.face.x) ** 2 + (y - by.face.y) ** 2 <= (by.face.r * 1.1) ** 2;
      const inTrunk = x >= by.x0 && x <= by.x1 && y >= trunkTop && y <= by.feet;
      if (inHead || inTrunk) inside += 1;
    }
  return n ? inside / n : 0;
}

/** The floor people stand on, on the wide stage: its back edge and front edge. */
function floorOf(scene: SceneDto): [number, number] | null {
  const id = scene.steps.find((s) => s.backdrop)?.backdrop;
  const set = scene.things.find((t) => t.id === id);
  if (set?.kind !== 'drawing' || !set.floor) return null;
  const { w: W, h: H } = scene.stagings.wide;
  const frame = setFrameFor(W, H);
  const k = Math.max(W / frame.w, H / frame.h);
  const top = (H - frame.h * k) / 2;
  return [top + set.floor[0] * k, top + set.floor[1] * k];
}

/** Whether someone is at a feature on purpose at `t`: sitting on it, lying on it, leaning on it, using it. */
function usingAt(
  scene: SceneDto,
  id: string,
  feature: string,
  t: number,
): boolean {
  return (scene.acting?.[id]?.interact ?? []).some(
    (one) =>
      one.feature === feature &&
      t >= one.at - 300 &&
      t <=
        one.at +
          (one.steps ?? []).reduce(
            (n, s) => Math.max(n, s[1] + s[2] - one.at),
            0,
          ) +
          300,
  );
}

/** The space check (the module's doc): every fault, each once per pair per step, at its worst. */
export function spaceFaults(
  scene: SceneDto,
  /** How the player sets a thing down: aside of a thing on the floor (now), or toward the others whatever is there (as films were made before). */
  how: { restAside?: boolean } = {},
): SpaceFault[] {
  if (!scene.steps.length || !scene.setting?.full) return [];
  const worst = new Map<string, SpaceFault>();
  const note = (fault: SpaceFault) => {
    const key = `${fault.kind}:${fault.step}:${[fault.a, fault.b ?? ''].sort().join('|')}`;
    const was = worst.get(key);
    if (!was || was.amount < fault.amount) worst.set(key, fault);
  };
  const { h: H } = scene.stagings.wide;
  const floor = floorOf(scene);
  const features = (scene.setting.features ?? []).filter(
    (f): f is SceneFeatureDto => Boolean(f.at?.wide),
  );
  const hugs = (a: string, b: string, t: number) =>
    [a, b].some((id) =>
      (scene.acting?.[id]?.moves ?? []).some(
        ([at, move, ms, other]) =>
          (move === 'hug' || move === 'reach' || move === 'take') &&
          t >= at &&
          t <= at + (ms ?? 0) &&
          (other === a || other === b),
      ),
    );
  const start = Math.max(0, scene.steps[0].atMs);
  for (let t = start; t < scene.durationMs; t += EVERY_MS) {
    const k = stepAt(scene.steps, t);
    const bodies = bodiesAt(scene, t);
    for (let i = 0; i < bodies.length; i += 1)
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        // A baby in someone's arms is theirs to hold.
        if (a.held === b.id || b.held === a.id) continue;
        const across = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const narrower = Math.min(a.x1 - a.x0, b.x1 - b.x0);
        // Through each other: in one row, their bodies one in the other,
        // one of them moving.
        if (
          Math.abs(a.d - b.d) < SAME_ROW_D &&
          !a.lying &&
          !b.lying &&
          (a.moving || b.moving) &&
          narrower > 0 &&
          across / narrower > THROUGH_LEAST &&
          !hugs(a.id, b.id, t)
        )
          note({
            kind: 'through',
            step: k,
            atMs: t,
            a: a.moving ? a.id : b.id,
            b: a.moving ? b.id : a.id,
            amount: Math.round((across / narrower) * 100) / 100,
          });
        // One behind the other, both still, their face covered by the
        // nearer: the two melt into one. (One walking past before another
        // hides them a moment, as in any film.)
        const [far, near] = a.feet < b.feet ? [a, b] : [b, a];
        if (a.moving || b.moving || near.feet - far.feet < 1) continue;
        const covered = faceCovered(far.face, near);
        if (covered > HIDDEN_MOST && !hugs(a.id, b.id, t))
          note({
            kind: 'hidden',
            step: k,
            atMs: t,
            a: far.id,
            b: near.id,
            amount: Math.round(covered * 100) / 100,
          });
      }
    for (const body of bodies) {
      // Lying in or on a thing: head and feet within it, not over it. (A
      // baby in someone's arms is in their arms.)
      if (body.held) continue;
      if (body.lying) {
        const [fx, fy] = body.lying.foot;
        const on = features.find((f) => {
          const box = f.at.wide;
          return (
            fx >= box.x &&
            fx <= box.x + box.w &&
            fy >= box.y - H * 0.05 &&
            fy <= box.y + box.h
          );
        });
        if (on) {
          const box = on.at.wide;
          const inset = box.w * 0.04;
          const [hx, hy] = body.lying.head;
          const r = body.face.r;
          const out =
            Math.max(0, box.x + inset - (hx - r)) +
            Math.max(0, hx + r - (box.x + box.w - inset)) +
            Math.max(0, box.x + inset - fx) +
            Math.max(0, fx - (box.x + box.w - inset)) +
            // Hanging above it: the head's middle over its top by more than the head.
            Math.max(0, box.y - r - hy);
          const long = Math.hypot(hx - fx, hy - fy) + r;
          if (out > r * 0.25)
            note({
              kind: 'outside',
              step: k,
              atMs: t,
              a: body.id,
              b: on.id,
              amount: Math.round(Math.min(1, out / long) * 100) / 100,
            });
        }
        continue;
      }
      if (body.moving || body.sitting) continue;
      // Standing: on the floor, between its back and front edges.
      if (floor) {
        const off = Math.max(
          0,
          floor[0] - body.feet,
          body.feet - (floor[1] + H * 0.01),
        );
        if (off > H * 0.02)
          note({
            kind: 'stand',
            why: 'floating',
            step: k,
            atMs: t,
            a: body.id,
            b: null,
            amount: Math.round((off / H) * 100) / 100,
          });
      }
      // And never inside a thing standing on the floor.
      for (const f of features) {
        if (!SOLID_KINDS.has(f.kind) || usingAt(scene, body.id, f.id, t))
          continue;
        const box = f.at.wide;
        const feet = f.feet?.wide ?? box.y + box.h;
        // Its footprint: across its width, and a little way back from its feet.
        const deep = Math.max(H * 0.035, box.h * 0.12);
        if (body.feet < feet - deep || body.feet > feet + H * 0.02) continue;
        const across =
          Math.min(body.x1, box.x + box.w * 0.92) -
          Math.max(body.x0, box.x + box.w * 0.08);
        const share = across / Math.max(1, body.x1 - body.x0);
        if (share > 0.25)
          note({
            kind: 'stand',
            why: 'in-thing',
            step: k,
            atMs: t,
            a: body.id,
            b: f.id,
            amount: Math.round(Math.min(1, share) * 100) / 100,
          });
      }
    }
  }
  // What is set down: on the floor, and never inside or behind a thing
  // standing on it.
  const stage: ThingsOnStage = {
    props: scene.props ?? [],
    steps: scene.steps,
    places: scene.stagings.wide.places,
    drawing: (id) => {
      const one = scene.things.find((x) => x.id === id);
      return one?.kind === 'drawing' ? one : undefined;
    },
    feature: (id) => features.find((f) => f.id === id)?.at.wide,
    ...(how.restAside === false ? {} : { obstacles: obstaclesOf(features) }),
  };
  const obstacles = obstaclesOf(features);
  if (stage.props.length)
    for (let t = start; t < scene.durationMs; t += EVERY_MS) {
      const k = stepAt(scene.steps, t);
      const hands = handsAt(stage, t);
      for (const prop of stage.props) {
        const has = hands.get(prop.id);
        if (!has || has.by || has.gone || has.flying || prop.in) continue;
        const box = thingBoxAt(stage, prop.id, t);
        if (!box) continue;
        const base = box.y + box.h;
        if (restBlocked(box, obstacles))
          note({
            kind: 'prop',
            why: 'in-thing',
            step: k,
            atMs: t,
            a: prop.id,
            b: has.near ?? null,
            amount: 1,
          });
        else if (
          floor &&
          (base < floor[0] - H * 0.02 || base > floor[1] + H * 0.02)
        )
          note({
            kind: 'prop',
            why: 'floating',
            step: k,
            atMs: t,
            a: prop.id,
            b: has.near ?? null,
            amount:
              Math.round(
                (Math.max(floor[0] - base, base - floor[1]) / H) * 100,
              ) / 100,
          });
      }
    }
  return [...worst.values()].sort((p, q) => p.atMs - q.atMs);
}

/** How many of each fault. */
export function spaceCounts(
  faults: readonly SpaceFault[],
): Record<SpaceFaultKind, number> {
  const out: Record<SpaceFaultKind, number> = {
    through: 0,
    hidden: 0,
    outside: 0,
    stand: 0,
    prop: 0,
  };
  for (const f of faults) out[f.kind] += 1;
  return out;
}

/** The space check's faults in words, for the log. */
export function describeSpace(
  faults: readonly SpaceFault[],
  name: (id: string) => string = (id) => id,
): string[] {
  return faults.map((f) => {
    const when = `at ${(f.atMs / 1000).toFixed(1)} s`;
    const pct = `${Math.round(f.amount * 100)}%`;
    switch (f.kind) {
      case 'through':
        return `space: ${when} ${name(f.a)} goes through ${name(f.b ?? '')} (${pct} of a body)`;
      case 'hidden':
        return `space: ${when} ${name(f.a)}'s face is behind ${name(f.b ?? '')} (${pct} covered)`;
      case 'outside':
        return `space: ${when} ${name(f.a)} lies out past the ${f.b} (${pct} of them)`;
      case 'prop':
        return f.why === 'floating'
          ? `space: ${when} the ${f.a} is set down off the floor`
          : `space: ${when} the ${f.a} is set down in or behind a thing on the floor, floating over it`;
      default:
        return f.why === 'floating'
          ? `space: ${when} ${name(f.a)} stands off the floor (${pct} of the frame)`
          : `space: ${when} ${name(f.a)} stands in the ${f.b} (${pct} of their body)`;
    }
  });
}
