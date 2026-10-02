/**
 * The sounds a scene's motion makes (explainer-animation-plan §8): one cue
 * for each heard event, by what moves. A pin ticks as it lands, a stamp
 * thumps, a morph whooshes, a line drawn on scratches like a pencil, a
 * count ticks as it runs, a document opening rustles, a flow swells, a
 * question rises, and the camera's travel and push move air. Everything
 * else is silent: a label, a fill, a mark and a slow drift make no sound,
 * so the cues stay few and every one means something.
 *
 * The cues are on the voice's clock. Where the score's beats are known a
 * cue near one (within 120 ms) lands on it; until the music work package
 * gives them, cues stay on their motion.
 */
import type { ShotDto, ShotInfoRecipe, ShotSoundDto } from '../../../contracts';
import { CAMERA_AMOUNT } from './shot-time';

/** How near a beat a cue must be to land on it. */
export const SNAP_WITHIN_MS = 120;

/** The quietest and loudest a cue is, against the library's level. */
const GAIN = { least: 0.3, most: 0.8 } as const;

/** Two cues of one sound closer than this are one event, heard once. */
const SAME_EVENT_MS = 80;

/**
 * Each recipe's sound: its id in the effects library, how loud, and
 * whether it is heard as the motion starts (a pencil, a whoosh) or as it
 * lands (a tick, a thump).
 */
const RECIPE_SOUND: Partial<
  Record<ShotInfoRecipe, { sound: string; gain: number; on: 'start' | 'land' }>
> = {
  pin: { sound: 'tick', gain: 0.5, on: 'land' },
  stamp: { sound: 'thump', gain: 0.7, on: 'land' },
  morph: { sound: 'whoosh', gain: 0.5, on: 'start' },
  draw: { sound: 'pencil', gain: 0.35, on: 'start' },
  count: { sound: 'ticks', gain: 0.4, on: 'start' },
  flow: { sound: 'swell', gain: 0.4, on: 'start' },
  ask: { sound: 'rise', gain: 0.45, on: 'start' },
};

/** A document opening: paper, as the shot comes in. */
const OPEN_DOCUMENT = { sound: 'paper', gain: 0.5 } as const;

/** The air a camera moves: softer for a short push than a long travel or a dive through. */
const CAMERA_AIR: Record<string, number> = {
  travel: 0.35,
  push: 0.3,
  'zoom-through': 0.45,
};

/**
 * A moment moved onto the nearest of the score's beats when one is within
 * `within` ms; left where it is otherwise, or when there are no beats.
 */
export function snapToBeat(
  atMs: number,
  beatsMs: readonly number[],
  within = SNAP_WITHIN_MS,
): number {
  let best = atMs;
  let nearest = within + 1;
  for (const beat of beatsMs) {
    const off = Math.abs(beat - atMs);
    if (off < nearest) {
      nearest = off;
      best = beat;
    }
  }
  return nearest <= within ? best : atMs;
}

const gainOf = (gain: number) =>
  Math.round(Math.max(GAIN.least, Math.min(GAIN.most, gain)) * 100) / 100;

/** Whether a shot shows another set than the one before it (not the same set carried on). */
const opensNew = (shots: readonly ShotDto[], i: number) => {
  const before = shots[i - 1];
  if (!before) return true;
  const a = shots[i].set;
  const b = before.set;
  return (
    a.kind !== b.kind ||
    ('asset' in a ? a.asset : null) !== ('asset' in b ? b.asset : null)
  );
};

/**
 * One cue per heard event of the shots, in time order: recipes by their
 * sound, a document's paper as it opens, the camera's air on a travel, a
 * push that is more than a drift, and a dive through. Snapped to `beatsMs`
 * (the score's beats on the scene's clock) where one is near; the same
 * sound twice at one moment is heard once.
 */
export function soundsOf(
  shots: readonly ShotDto[],
  beatsMs: readonly number[] = [],
): ShotSoundDto[] {
  const cues: ShotSoundDto[] = [];
  const add = (atMs: number, sound: string, gain: number) =>
    cues.push({
      atMs: Math.max(0, Math.round(snapToBeat(atMs, beatsMs))),
      sound,
      gain: gainOf(gain),
    });
  shots.forEach((shot, i) => {
    if (shot.set.kind === 'document' && opensNew(shots, i))
      add(shot.startMs, OPEN_DOCUMENT.sound, OPEN_DOCUMENT.gain);
    for (const item of shot.info) {
      const heard = RECIPE_SOUND[item.recipe];
      if (!heard) continue;
      add(
        heard.on === 'land' ? item.atMs + item.durMs : item.atMs,
        heard.sound,
        heard.gain,
      );
    }
    for (const move of shot.camera) {
      const air = CAMERA_AIR[move.move];
      if (air === undefined) continue;
      // A small push is a drift: life, not an event, and silent.
      if (
        move.move === 'push' &&
        (move.amount ?? CAMERA_AMOUNT.small) <= CAMERA_AMOUNT.small
      )
        continue;
      add(move.atMs, 'air', air);
    }
  });
  cues.sort((a, b) => a.atMs - b.atMs || a.sound.localeCompare(b.sound));
  const heard: ShotSoundDto[] = [];
  for (const cue of cues)
    if (
      !heard.some(
        (before) =>
          before.sound === cue.sound && cue.atMs - before.atMs < SAME_EVENT_MS,
      )
    )
      heard.push(cue);
  return heard;
}
