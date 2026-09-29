/**
 * Affordances (studio-interactions-plan §1.1): what a thing of the set
 * offers the people who use it, in its own drawing's units. A door's knob
 * and the line one goes in over; a chair's seat and its back; a table's
 * top, its chair and its front, laid over the legs of whoever sits at it;
 * each tread of the stairs and each rung of a ladder; where one leans on a
 * counter; a light switch, a tap, a doorbell.
 *
 * The stage's own pieces declare them as they are drawn (scene-set-pieces),
 * so the points are exact. One of a show's own, drawn by the artist, gets
 * a small guess from what code knows of it (its way in, its leaf); where
 * there is nothing to guess from, it offers nothing and is not used, only
 * looked at and stood by.
 *
 * The player finds each point on the stage from the feature's box and its
 * drawing's frame (featurePoint in scene-interact, the client's interact).
 */
import type {
  SceneAffordancesDto,
  SceneMaskId,
  ScenePoint,
} from '../../contracts';
import type { SetPiece } from './scene-set-pieces';

/** What a thing offers the people who use it: the contracts' own shape. */
export type Affordances = SceneAffordancesDto;

/** The group of a thing's drawing laid over whoever uses it, by what it is: its near frame, its front. */
export const maskGroup = (
  affordances: Affordances | undefined,
  id: SceneMaskId,
): string | null => affordances?.masks?.find((m) => m.id === id)?.group ?? null;

/** A handle of a thing, on the side asked (its outside, else any). */
export function handleOf(
  affordances: Affordances | undefined,
  side: 'in' | 'out' = 'out',
): ScenePoint | null {
  const handles = affordances?.handles ?? [];
  return (handles.find((h) => h.side === side) ?? handles[0])?.at ?? null;
}

/** A small point a hand operates on a thing: its switch, its tap, its bell, its face to knock on. */
export function operatePoint(
  affordances: Affordances | undefined,
  does: 'switch' | 'tap' | 'bell' | 'knock',
): ScenePoint | null {
  return affordances?.operates?.find((o) => o.does === does)?.at ?? null;
}

/**
 * A small guess at what one of a show's own offers, from what code knows
 * of its drawing: one that is gone into (a hut) has a way in over the
 * foot of its opening; one that opens has a handle on its leaf's far edge,
 * at its hinge's height. Undefined where there is nothing to go on.
 */
export function guessAffordances(
  piece: Pick<SetPiece, 'enters' | 'opening' | 'leaf' | 'affordances'>,
): Affordances | undefined {
  if (piece.affordances) return piece.affordances;
  const out: Affordances = {};
  const opening = piece.opening;
  if (piece.enters && opening)
    out.threshold = {
      line: [
        [opening[0], opening[3]],
        [opening[2], opening[3]],
      ],
      inside: 'behind',
    };
  if (piece.leaf && opening && piece.leaf.slide === undefined) {
    const [hx, hy] = piece.leaf.hinge;
    // The far edge from the hinge, a little in from it.
    const far =
      Math.abs(hx - opening[0]) < Math.abs(hx - opening[2])
        ? opening[2]
        : opening[0];
    const x =
      far + (hx < far ? -1 : 1) * Math.abs(opening[2] - opening[0]) * 0.12;
    out.handles = [{ id: 'handle', at: [x, hy], side: 'out' }];
    out.side = far > hx ? 1 : -1;
  }
  return Object.keys(out).length ? out : undefined;
}
