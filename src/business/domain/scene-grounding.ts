/**
 * Everyone on the ground: a Studio scene's people stand on something at
 * every moment, as the stage places them, and never hang in the air.
 *
 * Where someone stands, their feet (the foot of their box, as the stage,
 * its depth order and their contact shadow all have them) are on:
 *
 * - the floor at their depth, where floorAt puts the feet of one at d;
 * - the ground a feature stands on, beside it or under it (behind it a
 *   step back of that), never up at its way (a bus's door sill, a
 *   stall's counter), which is where one goes in;
 * - up a feature where one who climbs it stands (its perch);
 * - on a seat or a bed, as the stations lay them (left as they are).
 *
 * A hop, a jump, a leap and a flight leave the ground only in their air
 * phase, which the player plays about a place on the ground; and a walk
 * between two places on the ground stays on it, the floor's size for its
 * feet growing as they come down it (the pinhole is linear in the feet),
 * so long as both ends are the floor's size for where they stand. That
 * is looked at too.
 *
 * And one beside a solid body (a bus, a stall) stands at its side at its
 * depth, their body clear of it, unless they go in.
 *
 * Whatever is found wrong is put right silently: the feet stood on the
 * surface they belong to, at the size the floor makes them there, or the
 * one beside the body stepped clear of it; and said, as a "staging:
 * floating" note.
 */
import {
  BEHIND_BACK,
  BODY_HALF,
  floorAt,
  pinholeK,
  restingAt,
  type Place,
} from './scene-layout';
import type { SceneSettingDto } from '../../contracts';
import { interactFaults } from './scene-interact';

/** A feature as the ground check needs it: the ground it stands on, where one up it stands, and its box across. */
export interface GroundFeature {
  ground: number;
  perch?: number;
  /** Its box across, left and width: a solid one is stood beside, clear of it. */
  x?: number;
  w?: number;
  solid?: boolean;
}

export interface GroundInput {
  /** Which staging, for the notes. */
  staging: string;
  /** The stage's height. */
  H: number;
  steps: readonly { show: readonly string[] }[];
  /** Each step's places: put right in place. */
  places: Record<string, Place>[];
  /** Each step's stations, by who. */
  stations: readonly (Readonly<Record<string, string>> | undefined)[];
  /** Whether someone stands on the floor: a person or an animal, not a thing. */
  stands: (id: string) => boolean;
  features: ReadonlyMap<string, GroundFeature>;
  /** The floor: where people have always stood, the eye line, and its front edge's lowest. */
  floor: { floor: number; eye: number; bottom: number };
  name: (id: string) => string;
}

/**
 * Everyone climbing a flight of stairs, steps or a ladder has their feet on
 * its treads or rungs, one after another, and stands where one up it stands
 * at the top (studio-interactions-plan §2.6): as "staging: floating" notes
 * for any that does not.
 */
export function climbsGrounded(
  scene: Parameters<typeof interactFaults>[0],
  name: (id: string) => string = (id) => id,
): string[] {
  return interactFaults(scene)
    .filter((fault) => fault.id === 'off-steps')
    .map((fault) => `floating: ${name(fault.who)} ${fault.why}`);
}

/** Feet within this many of the stage's units of a surface are on it. */
export const GROUND_SLACK = 1.5;
/** One's size and the floor's size for where their feet are may differ by this share before a walk from there seems to float. */
export const SIZE_SLACK = 0.04;

/** What someone stands on at a step, by their station: the surfaces their feet may be on, the one to stand them on, and what it is called. */
export function surfacesOf(
  station: string,
  place: Place,
  features: ReadonlyMap<string, GroundFeature>,
  floor: GroundInput['floor'],
  H: number,
): { on: number[]; to: number; what: string; resize: boolean } | null {
  // On a seat or a bed, or a baby in someone's arms: where they are laid.
  if (restingAt(station) || station.startsWith('held:')) return null;
  const onFloor =
    place.d !== undefined
      ? floorAt(place.d, floor.floor, floor.eye, floor.bottom).feet
      : undefined;
  const at = /^(by|behind|under|up):([^:]+)/.exec(station);
  const feature = at ? features.get(at[2]) : undefined;
  if (at && feature) {
    if (at[1] === 'up')
      return feature.perch !== undefined
        ? {
            on: [feature.perch],
            to: feature.perch,
            what: `top of the ${at[2]}`,
            resize: false,
          }
        : null;
    const ground = feature.ground - (at[1] === 'behind' ? H * BEHIND_BACK : 0);
    // Stepped nearer to be seen (the faces' own check), they stand on the
    // floor at their depth: that is ground too.
    return {
      on: [ground, feature.ground, ...(onFloor !== undefined ? [onFloor] : [])],
      to: ground,
      what: `ground ${at[1] === 'by' ? 'beside' : at[1]} the ${at[2]}`,
      resize: true,
    };
  }
  if (onFloor === undefined) return null;
  return { on: [onFloor], to: onFloor, what: 'floor', resize: true };
}

/**
 * Everyone on the ground at every step of one staging, as the module
 * says: put right in place, and each put right said.
 */
export function keepGrounded(input: GroundInput): string[] {
  const { places, floor, H } = input;
  const notes: string[] = [];
  const round = (n: number) => Math.round(n * 10) / 10;
  const k = (feet: number) => pinholeK(feet, floor.floor, floor.eye);
  input.steps.forEach((step, n) => {
    for (const id of step.show) {
      const place = places[n]?.[id];
      if (!place || !input.stands(id)) continue;
      const station = input.stations[n]?.[id] ?? '';
      const surfaces = surfacesOf(station, place, input.features, floor, H);
      if (!surfaces) continue;
      const feet = place.y + place.h;
      let now = place;
      if (!surfaces.on.some((y) => Math.abs(y - feet) <= GROUND_SLACK)) {
        // Stood on it, as big as the floor makes them there.
        const was = k(feet);
        const to = k(surfaces.to);
        const scale = surfaces.resize && was > 0.05 && to > 0.05 ? to / was : 1;
        const w = place.w * scale;
        const h = place.h * scale;
        now = {
          ...place,
          x: round(place.x + place.w / 2 - w / 2),
          y: round(surfaces.to - h),
          w: round(w),
          h: round(h),
        };
        notes.push(
          `staging: floating ${input.name(id)} at step ${n + 1} (${input.staging}): feet at ${round(feet)}, the ${surfaces.what} at ${round(surfaces.to)}; stood on it`,
        );
      }
      // Beside a solid body, at its side: their body clear of it.
      const by = /^by:([^:]+)/.exec(station)?.[1];
      const body = by ? input.features.get(by) : undefined;
      if (body?.solid && body.x !== undefined && body.w !== undefined) {
        const middle = now.x + now.w / 2;
        const half = now.w * BODY_HALF;
        const over =
          Math.min(middle + half, body.x + body.w) -
          Math.max(middle - half, body.x);
        if (over > now.w * 0.08) {
          // The side the station says; else the nearer.
          const side = /:(-1|1)$/.exec(station)?.[1];
          const left = side ? side === '-1' : middle < body.x + body.w / 2;
          const to = left ? body.x - half * 0.9 : body.x + body.w + half * 0.9;
          now = { ...now, x: round(to - now.w / 2) };
          notes.push(
            `staging: floating ${input.name(id)} at step ${n + 1} (${input.staging}): stood over the ${by} it is beside; stepped to its side`,
          );
        }
      }
      if (now !== place) places[n][id] = now;
    }
  });
  // A walk between two places on the floor: the same size for their feet
  // at both ends, or they seem to rise or sink as they go.
  input.steps.forEach((step, n) => {
    if (n === 0) return;
    for (const id of step.show) {
      const a = places[n - 1]?.[id];
      const b = places[n]?.[id];
      if (!a || !b || !input.stands(id)) continue;
      if (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) continue;
      const stations = [input.stations[n - 1]?.[id], input.stations[n]?.[id]];
      // Up something, or on a seat: a climb, a leap or sitting down, not a walk.
      if (stations.some((s) => s && (/^(?:up|held):/.test(s) || restingAt(s))))
        continue;
      const ka = k(a.y + a.h);
      const kb = k(b.y + b.h);
      if (ka <= 0.05 || kb <= 0.05) continue;
      const sa = a.h / ka;
      const sb = b.h / kb;
      if (Math.abs(sa - sb) / Math.max(sa, sb) > SIZE_SLACK)
        notes.push(
          `staging: floating ${input.name(id)} walking at step ${n + 1} (${input.staging}): ${Math.round((Math.abs(sa - sb) / Math.max(sa, sb)) * 100)}% off the floor's size for where their feet are at one end`,
        );
    }
  });
  return notes;
}

/**
 * Things that move through the set keep to the ground (studio-interactions-
 * plan §2.4): a vehicle on wheels, a cart, a boat on the water goes along
 * it, never up off it, so a move's rise is taken out of those, put right
 * silently and said, as a "staging: floating" note. What flies (a kite, a
 * bird) is left as it is.
 */
export function groundMoves(
  moves: NonNullable<SceneSettingDto['moves']>,
  onGround: (id: string) => boolean,
): { moves: NonNullable<SceneSettingDto['moves']>; notes: string[] } {
  const notes: string[] = [];
  const out = moves.map((move) => {
    const [at, id, from, to, ms, ease] = move;
    if (!onGround(id) || (from[1] === 0 && to[1] === 0)) return move;
    notes.push(
      `staging: floating ${id} moving at ${at} ms: kept on the ground (it rose ${Math.round(Math.max(Math.abs(from[1]), Math.abs(to[1])))})`,
    );
    return [at, id, [from[0], 0], [to[0], 0], ms, ease] as typeof move;
  });
  return { moves: out, notes };
}
