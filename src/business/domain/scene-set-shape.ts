/**
 * A kept set as a film of a shape sees it (studio-vertical-plan §3.1). A
 * wide film's is the set as kept. A tall film's is the same place, built
 * again by code from its own layout for the tall frame (900 × 1600, the
 * same world at the same scale per metre), gated and its ground measured
 * as the artist's build of it was: no model is asked.
 *
 * A set painted whole, or with pieces the artist drew for it (not kept
 * with it), cannot be built again: null, and the stage lays the wide set
 * over the tall stage as it is (a crop of its middle).
 * TODO(V3, §3.1): extend those by code, sky and floor from their own edge
 * colours, and dress a tall set's sky and floor.
 */
import type { FilmShape } from './scene-shape';
import { SET_FRAMES } from './scene-shape';
import { buildSet, type SetLook } from './scene-set-layout';
import type { SetSheet } from './scene-sheet';
import { setThing, type StoryPlace, type StoryWorld } from './scene-story';
import { gateDrawing } from './scene-svg';
import { measureGround } from './scene-ground';

export async function setInShape(
  set: SetSheet,
  place: StoryPlace,
  shape: FilmShape,
  bookTitle: string,
  world: StoryWorld | null = null,
  look: SetLook | null = null,
): Promise<SetSheet | null> {
  if (shape === 'wide') return set;
  if (!set.layout || set.layout.own.length) return null;
  const built = buildSet(set.layout, place, {}, world, look, SET_FRAMES[shape]);
  const gated = await gateDrawing(
    built.svg,
    setThing(place, bookTitle, world),
    {
      backdrop: true,
    },
  );
  if (!gated.drawing) return null;
  const ground = await measureGround(gated.drawing);
  return {
    ...set,
    drawing: gated.drawing,
    // Its own ground, measured on its own frame: never the wide set's.
    ground: ground ?? undefined,
    layered: built.layered,
  };
}
