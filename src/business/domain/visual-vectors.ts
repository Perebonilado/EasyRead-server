/**
 * Finding a drawing by meaning, beside finding one by spelling. The
 * library's vectors are built once, offline, by `scripts/visual-embed.ts`
 * and read here; a page's own words are turned into vectors in one call
 * while it is being made, and the two are compared. Spelling still wins
 * where it is sure, because a drawing whose name is the word is better
 * evidence than any distance; meaning carries the rest, which is how
 * "money problems" finds coins when no drawing is filed under it.
 */

/**
 * How many numbers stand for a drawing. Short on purpose: the whole
 * library has to sit in the repository and be compared in milliseconds,
 * and shortened vectors lose very little of the ordering.
 */
export const DRAWING_DIMS = 256;

/**
 * How close a drawing must be to be offered at all. Below this the
 * nearest thing is not the thing, and the page is better with the word.
 */
export const NEAR_ENOUGH = 0.46;

/**
 * Drawings a search by meaning must never offer, because they are near
 * everything and mean nothing. A brand's mark is near any word its
 * company's name contains, so "teamwork" found a logo for a chat
 * product, which teaches nothing and reads as an advertisement. A
 * letter in a circle is near any phrase that starts with it, so "active
 * form" found the letter V. A currency's symbol is near any talk of
 * money, at the wrong level and usually the wrong country. The rest are
 * interface furniture: arrows, alignment, cursors.
 */
const NEVER =
  /(^|-)logo($|-)|^currency-|^(letter|number)-|^(arrow|caret)-|^align-|^text-|^cursor-/;

/** What a search by meaning found: the drawing, and how close it is, zero to one. */
export interface Near {
  name: string;
  score: number;
}

/** The library's vectors, unpacked once on first use. */
let table: {
  names: readonly string[];
  rows: Float32Array[];
  model: string;
} | null = null;

/**
 * A vector as bytes: each part of it scaled to a signed byte, which
 * keeps the angles between vectors and a quarter of the size. Used by
 * the script that builds the library so both ends agree.
 */
export function packVector(vector: number[]): Buffer {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const length = Math.sqrt(sum) || 1;
  const bytes = Buffer.alloc(vector.length);
  vector.forEach((v, i) => {
    const scaled = Math.round((v / length) * 127);
    bytes[i] = Math.max(-127, Math.min(127, scaled)) & 0xff;
  });
  return bytes;
}

/** The bytes of one vector back to numbers, already of unit length when packed. */
export function unpackVector(
  bytes: Buffer,
  at: number,
  dims: number,
): Float32Array {
  return unpack(bytes, at, dims);
}

/** The bytes of one vector back to numbers, already of unit length when packed. */
function unpack(bytes: Buffer, at: number, dims: number): Float32Array {
  const row = new Float32Array(dims);
  for (let i = 0; i < dims; i += 1) {
    const byte = bytes[at + i];
    row[i] = (byte & 0x80 ? byte - 256 : byte) / 127;
  }
  return row;
}

/**
 * The library ready to compare. The generated file may be absent, on a
 * checkout where the script has not been run; then a search by meaning
 * finds nothing and the spelling search carries the page alone.
 */
function library(): {
  names: readonly string[];
  rows: Float32Array[];
  model: string;
} {
  if (table) return table;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const generated = require('./visual-vectors.generated') as {
      DRAWING_NAMES: readonly string[];
      DRAWING_VECTORS: string;
      DRAWING_MODEL?: string;
      DRAWING_VECTOR_DIMS?: number;
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    const dims = generated.DRAWING_VECTOR_DIMS ?? DRAWING_DIMS;
    const bytes = Buffer.from(generated.DRAWING_VECTORS, 'base64');
    const rows = generated.DRAWING_NAMES.map((_, i) =>
      unpack(bytes, i * dims, dims),
    );
    table = {
      names: generated.DRAWING_NAMES,
      rows,
      model: generated.DRAWING_MODEL ?? '',
    };
  } catch {
    table = { names: [], rows: [], model: '' };
  }
  return table;
}

/**
 * Whether there are vectors to search, and whether they were made by the
 * model that will make the page's. Two models put the same word in two
 * different places, so comparing across them is not a weaker search, it
 * is a meaningless one; when they differ the app says so once and falls
 * back to spelling alone.
 */
export function vectorsReady(model?: string): boolean {
  const have = library();
  if (!have.names.length) return false;
  if (!model || !have.model) return have.names.length > 0;
  return model.split(':').pop() === have.model.split(':').pop();
}

/** The model the library's vectors were made by, for a word to the log when it is not the one in use. */
export function vectorsModel(): string {
  return library().model;
}

/** A vector of unit length, so two of them compare as a plain dot product. */
function normalise(vector: number[]): Float32Array {
  const row = new Float32Array(vector.length);
  let sum = 0;
  for (const v of vector) sum += v * v;
  const length = Math.sqrt(sum) || 1;
  for (let i = 0; i < vector.length; i += 1) row[i] = vector[i] / length;
  return row;
}

/**
 * The drawings nearest a vector, closest first, none below the floor.
 * The floor matters more than the order: a drawing that is merely the
 * closest of a bad lot teaches the wrong thing, and a word does not.
 */
export function nearestDrawings(
  vector: number[],
  limit = 4,
  floor = NEAR_ENOUGH,
): Near[] {
  const { names, rows } = library();
  if (!names.length || !vector.length) return [];
  const query = normalise(vector);
  const dims = Math.min(query.length, DRAWING_DIMS);
  const found: Near[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (NEVER.test(names[i])) continue;
    const row = rows[i];
    let score = 0;
    for (let d = 0; d < dims; d += 1) score += query[d] * row[d];
    if (score >= floor) found.push({ name: names[i], score });
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, limit);
}
