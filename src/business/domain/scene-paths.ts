/**
 * Walks that go round (studio-space-plan): someone walking from where
 * they stood to where they stand next never walks through anyone in the
 * same row of the floor, nor through a solid thing on it (a manger, a
 * stool). Where the straight line would, the walk bends: a row back,
 * behind them, where the floor has room; else a row forward, before them;
 * through a place of its own on the way (ScenePlaceDto.via), which the
 * player walks to and on from (pathPlace). Two walking at once are looked
 * at as they go: one who would meet the other bends round them.
 *
 * Nothing fades to hide it: the one behind is drawn behind, the one before
 * before, by their feet, as the stage always draws them.
 */
import type { ScenePlaceDto } from '../../contracts';
import {
  pathLength,
  pathPlace,
  walkBetween,
  walkLength,
  type WalkPace,
} from './scene-film';
import type { Furniture } from './scene-layout';
import { BODY_SHARE, SAME_ROW_D } from './scene-spacing';

/** How far a walk bends back or forward, in the floor's depth: a row, and two. */
export const BEND_ROWS = [0.26, 0.4] as const;
/** The floor's depth a walk may bend to, back and front. */
const DEPTH_LEAST = 0.06;
const DEPTH_MOST = 0.94;
/** How many points along a walk are looked at. */
const SAMPLES = 32;
/** Two bodies in one row closer than this share of their half widths together meet. */
const MEET = 0.9;

export interface PathsInput {
  W: number;
  /** The stage's walk reach (scene-shape walkReach): its long side. Absent, W. */
  R?: number;
  steps: readonly { atMs: number; show: readonly string[] }[];
  /** Each step's places, by id: bent walks are given their via here. */
  places: Record<string, ScenePlaceDto>[];
  /** Whether someone walks (a person the kit draws, an animal): the rest are placed, not walked. */
  walks: (id: string) => boolean;
  /** The solid things on the floor, and how deep on it each stands. */
  furniture: readonly (Furniture & { d: number })[];
  /** Someone's place stood at depth d instead; null where they cannot be. */
  atDepth: (place: ScenePlaceDto, d: number) => ScenePlaceDto | null;
  pace?: WalkPace;
  name?: (id: string) => string;
}

/** A body at a moment: its middle across, half its width, and how deep. */
interface Body {
  id: string;
  x: number;
  half: number;
  d: number;
}

const bodyOf = (id: string, p: ScenePlaceDto): Body => ({
  id,
  x: p.x + p.w / 2,
  half: p.w * BODY_SHARE,
  d: p.d ?? 0.5,
});

/** Whether two bodies meet: in one row, their bodies one in the other. */
const meets = (a: Body, b: Body) =>
  Math.abs(a.d - b.d) < SAME_ROW_D &&
  Math.abs(a.x - b.x) < (a.half + b.half) * MEET;

/**
 * Every walk in `places` bent round whoever and whatever is in its way,
 * as the module says: the places given their vias in place; a note for
 * each walk bent, and each that could not be.
 */
export function walkRound(input: PathsInput): string[] {
  const { W, steps, places } = input;
  /** Walks are timed and measured against the stage's long side: the same world in either shape. */
  const R = input.R ?? W;
  const notes: string[] = [];
  const name = input.name ?? ((id: string) => id);
  const things: Body[] = input.furniture.map((f, i) => ({
    id: `#${i}`,
    x: f.x,
    half: f.w / 2,
    d: f.d,
  }));
  for (let k = 1; k < steps.length; k += 1) {
    const here = places[k];
    const was = places[k - 1];
    if (!here || !was) continue;
    // A baby in someone's arms goes where they go: neither walks nor is in their way.
    const inArms = (id: string) => Boolean(here[id]?.held);
    const walkers = steps[k].show.filter((id) => {
      const from = was[id];
      const to = here[id];
      return (
        !inArms(id) &&
        steps[k - 1].show.includes(id) &&
        input.walks(id) &&
        from &&
        to &&
        walkLength(from, to, R) > W * 0.02
      );
    });
    if (!walkers.length) continue;
    // Those standing still through the step, where they stand.
    const still = steps[k].show
      .filter((id) => !walkers.includes(id) && here[id] && !inArms(id))
      .map((id) => bodyOf(id, here[id]));
    /** Where a walker is at `t` ms into the step, as the player walks them now. */
    const at = (id: string, t: number): Body => {
      const from = was[id];
      const to = here[id];
      const ms = walkBetween(from, to, R, input.pace);
      return bodyOf(
        id,
        pathPlace(from, to, Math.min(1, Math.max(0, t / ms)), R),
      );
    };
    const longest = (id: string) =>
      walkBetween(was[id], here[id], R, input.pace);
    // The longer walks first: a short one bends round a long one.
    for (const id of [...walkers].sort((a, b) => longest(b) - longest(a))) {
      const from = was[id];
      const to = here[id];
      const others = walkers.filter((o) => o !== id);
      /** Whom a walk of theirs meets, and where along it (0 to 1), as it goes. */
      const meetsOn = (path: ScenePlaceDto) => {
        const ms = walkBetween(from, path, R, input.pace);
        const hit: { who: string; u: number; d: number }[] = [];
        for (let i = 1; i < SAMPLES; i += 1) {
          const u = i / SAMPLES;
          const me = bodyOf(id, pathPlace(from, path, u, R));
          for (const o of [
            ...still,
            ...things,
            ...others.map((other) => at(other, u * ms)),
          ])
            if (meets(me, o)) hit.push({ who: o.id, u, d: o.d });
        }
        return hit;
      };
      // Whom they stand by where they set off or arrive is theirs to be near.
      const ends = new Set(
        [...still, ...things, ...others.map((other) => at(other, 0))]
          .filter((o) => meets(bodyOf(id, from), o) || meets(bodyOf(id, to), o))
          .map((o) => o.id),
      );
      const straight = meetsOn({ ...to, via: undefined }).filter(
        (h) => !ends.has(h.who),
      );
      if (!straight.length) {
        if (to.via) delete to.via;
        continue;
      }
      // Round what it meets: a row back (behind it) where the floor has
      // room, else a row forward (before it), from a little before it to a
      // little past it, and back to their line; a row, then two.
      const straightTo = { ...to, via: undefined };
      const u0 = Math.min(...straight.map((h) => h.u));
      const u1 = Math.max(...straight.map((h) => h.u));
      const lead =
        1.5 / SAMPLES +
        (from.w * 0.6) / Math.max(1, pathLength(from, straightTo, R));
      const a = pathPlace(from, straightTo, Math.max(0, u0 - lead), R);
      const b = pathPlace(from, straightTo, Math.min(1, u1 + lead), R);
      const back = Math.min(...straight.map((h) => h.d));
      const front = Math.max(...straight.map((h) => h.d));
      const tries = BEND_ROWS.flatMap((row) => [
        { d: back - row, how: 'behind' },
        { d: front + row, how: 'before' },
      ]).filter((one) => one.d >= DEPTH_LEAST && one.d <= DEPTH_MOST);
      let bent = false;
      const box = (p: ScenePlaceDto) => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        w: Math.round(p.w * 10) / 10,
        h: Math.round(p.h * 10) / 10,
        ...(p.d !== undefined ? { d: p.d } : {}),
      });
      for (const one of tries) {
        const d = Math.round(one.d * 100) / 100;
        const va = input.atDepth(a, d);
        const vb = input.atDepth(b, d);
        if (!va || !vb) continue;
        const path: ScenePlaceDto = { ...to, via: [box(va), box(vb)] };
        if (meetsOn(path).some((h) => !ends.has(h.who))) continue;
        here[id] = path;
        bent = true;
        const whom = [
          ...new Set(
            straight.map((h) =>
              h.who.startsWith('#') ? 'a thing on the floor' : name(h.who),
            ),
          ),
        ];
        notes.push(
          `paths: at ${(steps[k].atMs / 1000).toFixed(1)} s ${name(id)} walks ${one.how} ${whom.join(' and ')}, not through`,
        );
        break;
      }
      if (!bent)
        notes.push(
          `paths: at ${(steps[k].atMs / 1000).toFixed(1)} s ${name(id)} walks through ${[...new Set(straight.map((h) => (h.who.startsWith('#') ? 'a thing on the floor' : name(h.who))))].join(' and ')}: no way round`,
        );
    }
    // A baby in someone's arms goes round with them, the same way.
    for (const id of steps[k].show) {
      const baby = here[id];
      const holder = baby?.held ? here[baby.held] : undefined;
      if (!baby || !holder) continue;
      if (!holder.via?.length) {
        if (baby.via) delete baby.via;
        continue;
      }
      baby.via = holder.via.map((v) => {
        const r = v.h / Math.max(1, holder.h);
        return {
          x: Math.round((v.x + (baby.x - holder.x) * r) * 10) / 10,
          y: Math.round((v.y + (baby.y - holder.y) * r) * 10) / 10,
          w: Math.round(baby.w * r * 10) / 10,
          h: Math.round(baby.h * r * 10) / 10,
          ...(v.d !== undefined ? { d: v.d } : {}),
        };
      });
    }
  }
  return notes;
}
