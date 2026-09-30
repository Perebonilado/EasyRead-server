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

/** A thing a baby is laid in, by its name: a manger, a crib, a cradle, a cot, a basket. */
const CRADLE_WORDS =
  /\b(?:mangers?|cribs?|cradles?|cots?|bassinets?|(?:moses )?baskets?|troughs?|prams?|carry ?cots?)\b/iu;

/** Whether a thing of the set is lain in, as a bed is (studio-space-plan): one of a show's own named as a cradle. */
export function isCradle(feature: {
  kind: string;
  name?: string | null;
}): boolean {
  return (
    (feature.kind === 'drawn' || feature.kind === 'crate') &&
    Boolean(feature.name && CRADLE_WORDS.test(feature.name))
  );
}

/** How far in from a cradle's sides its hollow is, as a share of its width; and how high over its rim the line one lies along in it is, as a share of its height: their head and shoulders over the rim, the rest below it. */
export const CRADLE_INSET = 0.14;
export const CRADLE_LIFT = 0.05;

/**
 * Where one lies in a cradle, in its drawing's own units, as a bed's
 * piece says it (scene-set-pieces' lies): along its hollow from its head
 * end (the left) to its foot end, a little over its rim (its seat where
 * it has one, else near its top), so the head shows over it. And the share of its height
 * from its top down to its rim, which its front covers whoever is in it
 * below (SceneFeatureDto.rim).
 */
export function cradleOf(piece: {
  viewBox: [number, number, number, number];
  seat?: number;
}): {
  lies: { top: number; head: number; foot: number; sits: number };
  rim: number;
} {
  const [vx, vy, vw, vh] = piece.viewBox;
  const rim = piece.seat ?? -vy * 0.88;
  return {
    lies: {
      top: Math.round((rim + vh * CRADLE_LIFT) * 10) / 10,
      head: Math.round((vx + vw * CRADLE_INSET) * 10) / 10,
      foot: Math.round((vx + vw * (1 - CRADLE_INSET)) * 10) / 10,
      sits: Math.round((vx + vw / 2) * 10) / 10,
    },
    rim: Math.round(Math.min(1, Math.max(0, (-rim - vy) / vh)) * 1000) / 1000,
  };
}
