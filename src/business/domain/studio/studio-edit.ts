/**
 * How the film joins one scene to the next, from the two sheets. The
 * player keeps room at both ends of each scene (its edit, the client's
 * lib/scene/edit.ts) and makes every join inside it:
 *
 *  - A cut: the same place, time running on. Straight from one to the next.
 *  - A dissolve: a new place, or the weather changed. The next picture
 *    comes up over the last; an explainer's scenes, one idea giving way to
 *    the next, join so too.
 *  - A dip: time has passed. Down to black, a breath of it, and up again:
 *    where the writer says so ("fade"), or the light has changed.
 */
import type { SceneSheet } from './studio';

export type Join = 'cut' | 'dissolve' | 'dip';

/**
 * About how long each join adds to the film, in seconds: the room kept
 * after one scene and before the next, less what the two share.
 */
export const JOIN_SECONDS = 2;

/**
 * How the film comes into a scene from the one before. A sheet that is
 * not known (null) joins as a new place does.
 */
export function joinOf(
  before: SceneSheet | null,
  sheet: SceneSheet | null,
): Join {
  if (sheet?.transition === 'fade') return 'dip';
  if (before?.kind !== 'story' || sheet?.kind !== 'story') return 'dissolve';
  if (before.time !== sheet.time) return 'dip';
  if (before.set !== sheet.set || before.weather !== sheet.weather)
    return 'dissolve';
  return 'cut';
}

/** How many seconds the joins add to a film of this many scenes. */
export const joinsSeconds = (scenes: number) =>
  Math.max(0, scenes - 1) * JOIN_SECONDS;
