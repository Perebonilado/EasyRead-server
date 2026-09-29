/**
 * How far apart people stand on a Studio stage, in metres, as people
 * really stand: never in each other's bodies unless they touch on purpose
 * (a hug); two talking at a social distance, about a metre to a metre and
 * a half, near enough to be talking; one who goes over to someone stops
 * beside them, not on them; one who hands a thing over within reach of
 * the hand it goes to.
 *
 * The kit's people are drawn to scale: a grown-up's crown is 192 of its
 * units up, about 1.7 m, so a metre is about 113 of them, and a stage's
 * pixels to a metre are its unit times that, times how near they stand
 * (k: smaller farther back). Their body, arms at their sides, is
 * BODY_HALF of their frame's width either side of their middle.
 *
 * spaceOut is the stage's own pass (scene-layout's layoutStations uses it
 * on every step): it brings who talk, go over to or hand over together,
 * then moves apart any two whose bodies meet, those tied to a feature
 * (by the door, on the bench) left where they are. spacingFaults is the
 * check on a made scene: overlaps, and pairs too close or too far for
 * what they are doing, step by step.
 */
import type { SceneDto } from '../../contracts';

/** The kit's units to a metre: a grown-up's crown, 192 units up, is about 1.7 m. */
export const KIT_PER_METRE = 113;
/** A grown-up's frame, in the kit's units, as a place's height is drawn: its crown with room above, and its feet. */
export const ADULT_FRAME_UNITS = 234;
/** Half someone's body across, arms at their sides, as a share of their frame's width (scene-layout's BODY_HALF). */
export const BODY_SHARE = 0.28;
/** Two stand in one row, where their bodies can meet, when their depths are this close. */
export const SAME_ROW_D = 0.2;
/** How deep a Studio floor is, back to front, in metres: its depth d from 0 to 1. */
export const FLOOR_DEEP_M = 3.5;
/** The least room between two bodies that do not touch, in metres. */
export const BODY_GAP_M = 0.08;

/** Why two are to be near, and how near: talking, going over to someone, handing something over, touching (a hug). */
export type NearWhy = 'talk' | 'toward' | 'reach' | 'touch';

/** Middle to middle, in metres: the nearest two stand for it, the best, and the farthest. */
export const NEAR_M: Record<
  NearWhy,
  { least: number; best: number; most: number }
> = {
  talk: { least: 1, best: 1.25, most: 1.6 },
  toward: { least: 0.95, best: 1.1, most: 1.5 },
  reach: { least: 0.75, best: 0.9, most: 1.1 },
  touch: { least: 0.4, best: 0.55, most: 0.8 },
};
/** Two talking closer than this, middle to middle, are in each other's faces (the check; the stage keeps NEAR_M.talk.least). */
export const TALK_LEAST_M = 0.8;
/** Two talking farther apart than this are not talking to each other (the check; the stage brings them within NEAR_M.talk.most, a group's edges a little more). */
export const TALK_FAR_M = 2;
/** However far back one stands of the other, two who are near stand this share of the best apart across, so neither stands behind the other, hidden. */
const ACROSS_LEAST = 0.8;

/** Two who are to be near at a step, and why. */
export interface NearPair {
  a: string;
  b: string;
  why: NearWhy;
}

/** Someone on a step's stage, as spaceOut moves them: their middle across, and their size there. */
export interface Spaced {
  id: string;
  /** Their middle across, in the stage's pixels. */
  x: number;
  /** Half their body across, in pixels. */
  half: number;
  /** How deep they stand on the floor, 0 at its back to 1 at its front. */
  d: number;
  /** The stage's pixels to a metre where they stand. */
  perM: number;
  /** Free to step (at a spot of their own); false where a feature holds them (by it, on it, behind it). */
  free: boolean;
  /** Where they stood the step before, when they moved: pushed apart, they keep to the side they came from. */
  was?: number;
}

/** Metres between two, middle to middle: across at their scale, and back to front on the floor. */
export function apartM(
  a: Pick<Spaced, 'x' | 'd' | 'perM'>,
  b: Pick<Spaced, 'x' | 'd' | 'perM'>,
): number {
  const perM = (a.perM + b.perM) / 2;
  const across = Math.abs(a.x - b.x) / Math.max(1, perM);
  const deep = Math.abs(a.d - b.d) * FLOOR_DEEP_M;
  return Math.hypot(across, deep);
}

/** Whether two stand in one row, where their bodies can meet. */
export const sameRow = (a: Pick<Spaced, 'd'>, b: Pick<Spaced, 'd'>) =>
  Math.abs(a.d - b.d) < SAME_ROW_D;

/** How far across two in one row must be, middle to middle, their bodies clear (or touching, for a hug), in pixels. */
function leastAcross(a: Spaced, b: Spaced, touch: boolean): number {
  const perM = (a.perM + b.perM) / 2;
  return touch
    ? NEAR_M.touch.best * perM * 0.8
    : a.half + b.half + BODY_GAP_M * perM;
}

/**
 * Everyone on a step spaced as people stand (the stage's pass): first
 * who are to be near come near (to the best distance for why, the one
 * freer to move moving, or both halfway), then anyone whose body meets
 * another's in one row steps apart (whoever moved to get there back the
 * way they came; else both, each their share), those a feature holds
 * never moved, all within `least` and `most` across. A few rounds, so
 * bringing two together never leaves a third inside them. Their middles
 * across, by id.
 */
export function spaceOut(
  people: readonly Spaced[],
  pairs: readonly NearPair[],
  bounds: { least: number; most: number },
): Map<string, number> {
  const at = new Map(people.map((p) => [p.id, { ...p }]));
  const clamp = (x: number) => Math.min(bounds.most, Math.max(bounds.least, x));
  const touching = (a: string, b: string) =>
    pairs.some(
      (p) =>
        p.why === 'touch' &&
        ((p.a === a && p.b === b) || (p.a === b && p.b === a)),
    );
  /** How many pairs each is in: the one in fewer is freer to come over. */
  const busy = new Map<string, number>();
  for (const p of pairs) {
    busy.set(p.a, (busy.get(p.a) ?? 0) + 1);
    busy.set(p.b, (busy.get(p.b) ?? 0) + 1);
  }
  for (let round = 0; round < 4; round += 1) {
    // 1. Near enough for what they are doing.
    for (const pair of pairs) {
      const a = at.get(pair.a);
      const b = at.get(pair.b);
      if (!a || !b || a === b || (!a.free && !b.free)) continue;
      const near = NEAR_M[pair.why];
      const now = apartM(a, b);
      // Close enough and not in each other's faces: as they are.
      if (now <= near.most && (now >= near.least || !sameRow(a, b))) continue;
      const perM = (a.perM + b.perM) / 2;
      const deep = Math.abs(a.d - b.d) * FLOOR_DEEP_M;
      const aim = now > near.most ? near.best : near.least;
      const across =
        Math.max(
          Math.sqrt(Math.max(0, aim ** 2 - deep ** 2)),
          pair.why === 'touch' ? 0 : aim * ACROSS_LEAST,
        ) * perM;
      const want = Math.max(across, leastAcross(a, b, pair.why === 'touch'));
      const side = a.x <= b.x ? 1 : -1;
      // Above zero, they come together by it; below, they step apart.
      const gap = Math.abs(b.x - a.x) - want;
      if (Math.abs(gap) <= 0.5) continue;
      // Both come halfway, unless a feature holds one, or one is in the
      // middle of several (the one everyone talks to) and the other free.
      const aBusy = busy.get(a.id) ?? 0;
      const bBusy = busy.get(b.id) ?? 0;
      const aShare = !a.free
        ? 0
        : !b.free
          ? 1
          : aBusy > bBusy + 1
            ? 0.25
            : bBusy > aBusy + 1
              ? 0.75
              : 0.5;
      a.x = clamp(a.x + side * gap * aShare);
      b.x = clamp(b.x - side * gap * (1 - aShare));
    }
    // 2. No one inside anyone else.
    let moved = false;
    const list = [...at.values()].sort((p, q) => p.x - q.x);
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (!sameRow(a, b) || (!a.free && !b.free)) continue;
        const least = leastAcross(a, b, touching(a.id, b.id));
        const short = least - Math.abs(b.x - a.x);
        if (short <= 0.5) continue;
        // Who goes which way: as they stand, else as they came.
        let left = a;
        let right = b;
        if (Math.abs(b.x - a.x) < 1) {
          const came = (p: Spaced) => (p.was ?? p.x) - p.x;
          if (came(a) > came(b)) [left, right] = [b, a];
        }
        const leftShare = !left.free
          ? 0
          : !right.free
            ? 1
            : left.was !== undefined && right.was === undefined
              ? 1
              : right.was !== undefined && left.was === undefined
                ? 0
                : 0.5;
        const l0 = left.x;
        const r0 = right.x;
        left.x = clamp(left.x - short * leftShare);
        right.x = clamp(right.x + short * (1 - leftShare));
        // Held at the stage's edge: the other takes the rest.
        const still = least - (right.x - left.x);
        if (still > 0.5) {
          if (right.free && right.x < bounds.most)
            right.x = clamp(right.x + still);
          else if (left.free) left.x = clamp(left.x - still);
        }
        if (left.x !== l0 || right.x !== r0) moved = true;
      }
    if (!moved && round > 0) break;
  }
  return new Map([...at].map(([id, p]) => [id, p.x]));
}

// ── The check on a made scene ─────────────────────────────────────────────

/** Two who stand wrong for what they are doing at a step of a made scene. */
export interface SpacingFault {
  /** Which step, from 0, and when it starts. */
  step: number;
  atMs: number;
  a: string;
  b: string;
  kind: 'overlap' | 'too-close' | 'too-far';
  /** Middle to middle, in metres. */
  metres: number;
  /** What they are doing: talking, or nothing (an overlap). */
  why: NearWhy | null;
}

/** The pixels to a metre of someone the kit draws standing, from their height; null for one it does not (an animal, a thing). */
function perMetreOf(
  scene: SceneDto,
  id: string,
  place: { h: number },
): number | null {
  const thing = scene.things.find((t) => t.id === id);
  if (!thing || thing.kind !== 'drawing' || !('rig' in thing) || !thing.rig)
    return null;
  return (place.h / ADULT_FRAME_UNITS) * KIT_PER_METRE;
}

/** Whom someone looks at, at a moment, as their acting has it. */
function lookingAt(scene: SceneDto, id: string, t: number): string | null {
  const look = scene.acting?.[id]?.look ?? [];
  let target: string | null = null;
  for (const [at, who] of look) {
    if (at > t) break;
    target = who;
  }
  return target;
}

/**
 * The spacing check on a made scene, step by step on its wide stage:
 * any two people whose bodies meet in one row (not in a hug), and two
 * talking (a line said by one, looking at the other) closer than
 * TALK_LEAST_M or farther than TALK_FAR_M. Everyone the kit draws
 * standing; an animal's size says nothing of metres, so it counts only
 * beside a person.
 */
export function spacingFaults(scene: SceneDto): SpacingFault[] {
  const out: SpacingFault[] = [];
  const places = scene.stagings.wide.places;
  const hugs = (t0: number, t1: number, a: string, b: string) =>
    [a, b].some((id) =>
      (scene.acting?.[id]?.moves ?? []).some(
        ([t, move, ms, other]) =>
          move === 'hug' &&
          t < t1 &&
          t + (ms ?? 0) > t0 &&
          (other === a || other === b),
      ),
    );
  scene.steps.forEach((step, k) => {
    const from = step.atMs;
    const to = scene.steps[k + 1]?.atMs ?? scene.durationMs;
    const here = places[k] ?? {};
    const people = step.show.flatMap((id) => {
      const place = here[id];
      if (!place) return [];
      const perM = perMetreOf(scene, id, place);
      return [{ id, place, perM }];
    });
    const scale =
      people.map((p) => p.perM).find((n): n is number => n !== null) ?? null;
    if (scale === null) return;
    const tall = new Map(people.map((p) => [p.id, p.place.h]));
    const spaced = people.map((p): Spaced => ({
      id: p.id,
      x: p.place.x + p.place.w / 2,
      half: p.place.w * BODY_SHARE,
      d: p.place.d ?? 0.5,
      perM: p.perM ?? scale,
      free: true,
    }));
    const seen = new Set<string>();
    const add = (fault: Omit<SpacingFault, 'step' | 'atMs'>) => {
      const key = [fault.a, fault.b].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ step: k, atMs: from, ...fault });
    };
    for (let i = 0; i < spaced.length; i += 1)
      for (let j = i + 1; j < spaced.length; j += 1) {
        const a = spaced[i];
        const b = spaced[j];
        if (!sameRow(a, b) || hugs(from, to, a.id, b.id)) continue;
        // A bird or a kitten at someone's feet is not in their body.
        const [ha, hb] = [tall.get(a.id) ?? 0, tall.get(b.id) ?? 0];
        if (Math.min(ha, hb) < Math.max(ha, hb) * 0.5) continue;
        const across = Math.abs(a.x - b.x);
        if (across < (a.half + b.half) * 0.9)
          add({
            a: a.id,
            b: b.id,
            kind: 'overlap',
            metres: Math.round(apartM(a, b) * 100) / 100,
            why: null,
          });
      }
    /** Sitting or lying at a moment (a held move not yet got up from): where they rest, the stage leaves them. */
    const resting = (id: string, t: number) => {
      const moves = scene.acting?.[id]?.moves ?? [];
      const down = moves.filter(
        ([at, move]) => at <= t && (move === 'sit' || move === 'lie'),
      );
      const last = down[down.length - 1];
      return Boolean(
        last &&
        !moves.some(
          ([at, move]) => move === 'stand' && at > last[0] && at <= t,
        ),
      );
    };
    // Who talks to whom in this step: a line, and whom its speaker looks at.
    for (const effect of scene.effects) {
      if (effect.do !== 'say' || effect.atMs < from || effect.atMs >= to)
        continue;
      const speaker = effect.target;
      const heard = lookingAt(scene, speaker, effect.atMs + 300);
      const a = spaced.find((p) => p.id === speaker);
      const b = spaced.find((p) => p.id === heard);
      if (!a || !b || a === b) continue;
      // Talking to someone on a sofa or in bed, or to a bird on the sill:
      // their body is not where their middle is, nor their size a person's.
      if (resting(a.id, effect.atMs) || resting(b.id, effect.atMs)) continue;
      const [ha, hb] = [tall.get(a.id) ?? 0, tall.get(b.id) ?? 0];
      if (Math.min(ha, hb) < Math.max(ha, hb) * 0.5) continue;
      const metres = Math.round(apartM(a, b) * 100) / 100;
      if (metres > TALK_FAR_M)
        add({ a: a.id, b: b.id, kind: 'too-far', metres, why: 'talk' });
      else if (metres < TALK_LEAST_M && !hugs(from, to, a.id, b.id))
        add({ a: a.id, b: b.id, kind: 'too-close', metres, why: 'talk' });
    }
  });
  return out;
}

/** The spacing check's faults in words, for the log: "staging: at 12.3 s Dee and Tessa talk 2.9 m apart". */
export function describeSpacing(
  faults: readonly SpacingFault[],
  name: (id: string) => string = (id) => id,
): string[] {
  return faults.map((f) => {
    const when = `at ${(f.atMs / 1000).toFixed(1)} s`;
    const who = `${name(f.a)} and ${name(f.b)}`;
    return f.kind === 'overlap'
      ? `spacing: ${when} ${who} stand in each other's bodies (${f.metres} m apart)`
      : `spacing: ${when} ${who} talk ${f.metres} m apart, ${f.kind === 'too-far' ? 'too far' : 'too close'}`;
  });
}
