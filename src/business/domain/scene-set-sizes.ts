/**
 * Real sizes (studio-scenery-plan §5.8): every kind of scenery has a
 * height in the world, at the kit's scale (a grown-up is 224 of its
 * units, about 1.7 m), and a set built in a style pack draws each piece
 * that tall, scaled by where it stands, as the people are. So a house at
 * the back is never bigger, metre for metre, than a table in front: its
 * scale per metre is never more than anything's nearer the camera, which
 * code checks as it builds (checkSizes).
 *
 * The pieces L3 adds (the kit's clutter, the buildings, the landmarks'
 * shapes) are drawn at their real size already. The stage's own pieces
 * (a gate, a bench, a tree, a stall) keep the size the stage draws them
 * at, so a painter's bench and the stage's are one size. Far off on the
 * horizon, distance is anyone's guess: what stands there is a share of
 * the frame (FAR_MOST), not a size.
 */
import { KIT_M } from './scene-set-draw';

/**
 * How tall each of the older scenery pieces is in the world, in metres:
 * as tall as it stands, to the top of what is on it or hangs from it. A
 * kind not here is drawn true, or is the stage's own size.
 */
export const REAL_HEIGHT_M: Readonly<Record<string, number>> = {
  desk: 1,
  bookshelf: 1.85,
  wardrobe: 1.95,
  lamp: 1.6,
  plant: 0.9,
  toybox: 0.65,
  fireplace: 1.3,
  counter: 1.2,
  cupboard: 1.25,
  house: 5.5,
  hut: 3.4,
  cart: 1.1,
  bush: 1.2,
  rock: 0.6,
  flowers: 0.4,
  fern: 0.6,
  mushroom: 0.35,
  lamppost: 4.2,
  basket: 0.55,
  sack: 0.75,
  parasol: 2.3,
  boat: 1.1,
  pine: 5.5,
  sandcastle: 0.6,
  palm: 5.5,
};

/** The least and the most a piece is scaled to its real size: a cartoon's things are only so far from true. */
const REAL_K: readonly [number, number] = [0.6, 2];

/** How much larger a piece of a kind drawn `drawnTall` of the kit's units tall is drawn, to be its real height; 1 for one drawn true. */
export function realScaleOf(
  kind: string | undefined,
  drawnTall: number,
): number {
  const real = kind ? REAL_HEIGHT_M[kind] : undefined;
  if (!real || drawnTall <= 0) return 1;
  const k = (real * KIT_M) / drawnTall;
  return Math.round(Math.max(REAL_K[0], Math.min(REAL_K[1], k)) * 1000) / 1000;
}

/** How tall a piece far off on the horizon may stand, as a share of the frame: a skyline's tower, a pyramid. */
export const FAR_MOST = 0.42;
/** Far off, a piece is drawn this share of its size where the ground meets the sky. */
export const FAR_K = 0.45;

/** A piece as its size is checked: where its feet are, and its scale per metre (its scale, over what makes it its real height). */
export interface Sized {
  y: number;
  perMetre: number;
  /** Sized to the frame, not to life (a landmark), or far off: not checked. */
  free?: boolean;
}

/**
 * The sizes checked (§8.1): nothing stands larger, metre for metre, than
 * anything nearer the camera than it. Each one that does is made as
 * large as the smallest nearer; returned are those made smaller, by
 * index, with the scale they now have per metre.
 */
export function checkSizes(
  pieces: readonly Sized[],
  tie = 2,
): { index: number; perMetre: number }[] {
  const order = pieces
    .map((one, index) => ({ ...one, index }))
    .filter((one) => !one.free)
    .sort((a, b) => b.y - a.y);
  const out: { index: number; perMetre: number }[] = [];
  // From the front back: the least per metre of all nearer so far.
  let least = Infinity;
  let run: typeof order = [];
  const settle = () => {
    for (const one of run) least = Math.min(least, one.perMetre);
    run = [];
  };
  for (const one of order) {
    if (run.length && run[0].y - one.y > tie) settle();
    if (one.perMetre > least + 1e-9) {
      out.push({ index: one.index, perMetre: least });
      run.push({ ...one, perMetre: least });
    } else run.push(one);
  }
  return out;
}
