/**
 * Seeded variety for the kit: the same seed draws the same piece every
 * time (the stills, the player and the export agree), and two seeds draw
 * two different crowds. mulberry32, as the client's motion core uses.
 */

/** A seeded stream of numbers in [0, 1). */
export interface Rand {
  (): number;
  /** A number between two. */
  between(lo: number, hi: number): number;
  /** One of a list. */
  pick<T>(list: readonly T[]): T;
  /** One of a list by weight. */
  weighted<T>(list: readonly (readonly [T, number])[]): T;
  /** True with a chance. */
  chance(p: number): boolean;
  /** A number about a middle, spread a little (the sum of three draws). */
  about(middle: number, spread: number): number;
}

export function rand(seed: number): Rand {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rand;
  next.between = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (list) => list[Math.floor(next() * list.length) % list.length];
  next.weighted = (list) => {
    const total = list.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    let at = next() * total;
    for (const [value, w] of list) {
      at -= Math.max(0, w);
      if (at < 0) return value;
    }
    return list[list.length - 1][0];
  };
  next.chance = (p) => next() < p;
  next.about = (middle, spread) =>
    middle + spread * ((next() + next() + next()) / 1.5 - 1);
  return next;
}

/** A string's FNV-1a hash, for a seed from words. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seed of its own for one part of a piece (the third figure, the far row). */
export const subSeed = (seed: number, part: number): number =>
  hashOf(`${seed >>> 0}:${part}`);
