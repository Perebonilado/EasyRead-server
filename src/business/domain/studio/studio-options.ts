/**
 * Three to choose from (studio-drawings-plan §8, Phase E). A character
 * the kits draw (a person, an animal, a creature) drawn again as the
 * maker asks comes back as the writer read their words, and beside it up
 * to two other readings of the same words, made by code from that one:
 * free, and at once. Only what the change touched is read another way,
 * and only as far as the words leave open:
 *
 * - a colour, as the nearest shades of it the kit paints with ("browner"
 *   is brown, and chestnut, and dark brown), never one far from it;
 * - a size, a build or an age, a step further the way it went ("bigger"
 *   is medium, and large), never back;
 * - a part or a thing worn the words do not name (ears "more alert" are
 *   pointed, or round), never one they do ("a red collar" is a collar),
 *   and never something taken away.
 *
 * What they are (their species, their body) is never read another way.
 * When nothing is open there are fewer to choose from, never a made-up
 * one.
 */
import {
  ANIMAL_BUILDS,
  ANIMAL_EARS,
  ANIMAL_HORNS,
  ANIMAL_MANES,
  ANIMAL_PAINT,
  ANIMAL_PATTERNS,
  ANIMAL_SIZES,
  ANIMAL_TAILS,
  WEAR_OF,
  type AnimalSpec,
} from '../scene-animal';
import {
  CREATURE_ARMS,
  CREATURE_BUILDS,
  CREATURE_EYES,
  CREATURE_HEADS,
  CREATURE_LEGS,
  CREATURE_NOSES,
  CREATURE_PAINT,
  CREATURE_SIZES,
  CREATURE_TAILS,
  CREATURE_TEXTURES,
  CREATURE_TOPS,
  CREATURE_WEAR_OF,
  CREATURE_WINGS,
  type CreatureSpec,
} from '../scene-creature';
import {
  BOTTOMS,
  FACIAL_HAIR,
  FIGURE_AGES,
  FIGURE_BUILDS,
  HAIR_STYLES,
  HEADWEAR,
  TOPS,
  type FigureSpec,
} from '../scene-figure';
import { CLOTH, HAIR } from '../scene-ink';
import { deltaE, labOf, parseColour, type Rgb } from '../scene-polish';

/** The most drawings offered to choose from at once. */
export const MAX_OPTIONS = 3;

/**
 * How near a shade must be to be read as the same colour asked for: about
 * brown to chestnut or dark brown, never red to orange or pink.
 */
export const NEAR_SHADE = 25;

type Value = string | number;

/** How a field of a spec may be read another way. */
type Way =
  /** A colour, painted as the palette says: its nearest shades. */
  | { kind: 'colour'; paint: Readonly<Record<string, string>> }
  /** One of a row that runs one way (small to large): a step further. */
  | { kind: 'steps'; list: readonly Value[] }
  /** One of a list of its own (ears, a hat): another, unless it is named. */
  | { kind: 'one of'; list: readonly Value[] };

/** Each field that may be read another way, by its path in the spec ("wear.neck"). */
export type Ways = Readonly<Record<string, Way>>;

const SKIN_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const FIGURE_WAYS: Ways = {
  age: { kind: 'steps', list: FIGURE_AGES },
  build: { kind: 'steps', list: FIGURE_BUILDS },
  skin: { kind: 'steps', list: SKIN_STEPS },
  hair: { kind: 'one of', list: HAIR_STYLES },
  hairColour: { kind: 'colour', paint: HAIR },
  facialHair: { kind: 'one of', list: FACIAL_HAIR },
  headwear: { kind: 'one of', list: HEADWEAR },
  top: { kind: 'one of', list: TOPS },
  topColour: { kind: 'colour', paint: CLOTH },
  bottom: { kind: 'one of', list: BOTTOMS },
  bottomColour: { kind: 'colour', paint: CLOTH },
  accentColour: { kind: 'colour', paint: CLOTH },
};

export const ANIMAL_WAYS: Ways = {
  build: { kind: 'steps', list: ANIMAL_BUILDS },
  size: { kind: 'steps', list: ANIMAL_SIZES },
  coat: { kind: 'colour', paint: ANIMAL_PAINT },
  second: { kind: 'colour', paint: ANIMAL_PAINT },
  pattern: { kind: 'one of', list: ANIMAL_PATTERNS },
  ears: { kind: 'one of', list: ANIMAL_EARS },
  tail: { kind: 'one of', list: ANIMAL_TAILS },
  mane: { kind: 'one of', list: ANIMAL_MANES },
  horns: { kind: 'one of', list: ANIMAL_HORNS },
  'wear.neck': { kind: 'one of', list: WEAR_OF.neck },
  'wear.back': { kind: 'one of', list: WEAR_OF.back },
  'wear.head': { kind: 'one of', list: WEAR_OF.head },
  'wear.feet': { kind: 'one of', list: WEAR_OF.feet },
  wearColour: { kind: 'colour', paint: CLOTH },
};

export const CREATURE_WAYS: Ways = {
  build: { kind: 'steps', list: CREATURE_BUILDS },
  size: { kind: 'steps', list: CREATURE_SIZES },
  bodyColour: { kind: 'colour', paint: CREATURE_PAINT },
  texture: { kind: 'one of', list: CREATURE_TEXTURES },
  textureColour: { kind: 'colour', paint: CREATURE_PAINT },
  eyes: { kind: 'one of', list: CREATURE_EYES },
  nose: { kind: 'one of', list: CREATURE_NOSES },
  head: { kind: 'one of', list: CREATURE_HEADS },
  top: { kind: 'one of', list: CREATURE_TOPS },
  arms: { kind: 'one of', list: CREATURE_ARMS },
  legs: { kind: 'one of', list: CREATURE_LEGS },
  limbColour: { kind: 'colour', paint: CREATURE_PAINT },
  wings: { kind: 'one of', list: CREATURE_WINGS },
  tail: { kind: 'one of', list: CREATURE_TAILS },
  'wear.neck': { kind: 'one of', list: CREATURE_WEAR_OF.neck },
  'wear.body': { kind: 'one of', list: CREATURE_WEAR_OF.body },
  'wear.face': { kind: 'one of', list: CREATURE_WEAR_OF.face },
  wearColour: { kind: 'colour', paint: CLOTH },
};

/** A field's value by its path: one level into `wear`. */
function valueAt(spec: object, path: string): Value | null {
  let at: unknown = spec;
  for (const key of path.split('.'))
    at =
      at && typeof at === 'object'
        ? (at as Record<string, unknown>)[key]
        : undefined;
  return typeof at === 'string' || typeof at === 'number' ? at : null;
}

/** The spec with one field set, the rest as they were. */
function withValue<T extends object>(spec: T, path: string, value: Value): T {
  const [head, tail] = path.split('.');
  if (!tail) return { ...spec, [head]: value };
  const inner = (spec as Record<string, unknown>)[head];
  return {
    ...spec,
    [head]: {
      ...(inner && typeof inner === 'object' ? inner : {}),
      [tail]: value,
    },
  };
}

/** Colours this far round the wheel apart are not one colour, however near: tan is not pink. */
const HUE_APART = 30;
/** Below this much colour a shade has no hue to speak of: a grey, a cream. */
const GREYISH = 12;

/** Whether two colours are of one hue: either is greyish, or they lie near round the wheel. */
function sameHue(a: Rgb, b: Rgb): boolean {
  const [, a1, b1] = labOf(a);
  const [, a2, b2] = labOf(b);
  if (Math.hypot(a1, b1) < GREYISH || Math.hypot(a2, b2) < GREYISH) return true;
  const apart = Math.abs(
    ((Math.atan2(b1, a1) - Math.atan2(b2, a2)) * 180) / Math.PI,
  );
  return Math.min(apart, 360 - apart) <= HUE_APART;
}

/** Nothing there: a part taken away, or none said (a bald head is hair taken away). */
const isNone = (value: Value | null) =>
  value === null || value === 'none' || value === 'plain' || value === 'bald';

/** Which readings come first: a shade is nearest what was asked, a step next, another part last. */
const FAITHFUL: Record<Way['kind'], number> = {
  colour: 0,
  steps: 1,
  'one of': 2,
};

/** Whether the maker's words name a value, whole: "collar", "saddle blanket" or its "blanket". */
export function namedIn(words: string, value: Value): boolean {
  const said = ` ${words.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const name = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!name) return false;
  if (said.includes(` ${name} `) || said.includes(` ${name}s `)) return true;
  const last = name.split(' ').at(-1)!;
  return last !== name && last.length > 3 && said.includes(` ${last} `);
}

/** Other readings of one field the change touched, the likeliest first. */
function readings(
  way: Way,
  was: Value | null,
  now: Value,
  words: string,
): Value[] {
  if (way.kind === 'colour') {
    const from = parseColour(way.paint[String(now)]);
    if (!from) return [];
    const seen = new Set([way.paint[String(now)]]);
    const out: { name: string; far: number }[] = [];
    for (const [name, hex] of Object.entries(way.paint)) {
      const rgb = parseColour(hex);
      if (name === now || name === was || !rgb || seen.has(hex)) continue;
      seen.add(hex);
      const far = deltaE(from, rgb);
      if (far <= NEAR_SHADE && sameHue(from, rgb)) out.push({ name, far });
    }
    return out.sort((a, b) => a.far - b.far).map((one) => one.name);
  }
  if (way.kind === 'steps') {
    const at = way.list.indexOf(now);
    if (at < 0) return [];
    const from = was === null ? -1 : way.list.indexOf(was);
    // Further the way it went; from nothing said, either side.
    const ways = from < 0 ? [1, -1] : [Math.sign(at - from)];
    if (ways[0] === 0) return [];
    const out: Value[] = [];
    for (const step of [1, 2])
      for (const way1 of ways) {
        const next = way.list[at + way1 * step];
        if (next !== undefined && next !== was) out.push(next);
      }
    return out;
  }
  // Something taken away is gone, and something named is what was asked.
  if (isNone(now) || namedIn(words, now)) return [];
  // The lists keep like beside like (hats together, hair by its length):
  // the nearest in the list first, the one after before the one before.
  const at = way.list.indexOf(now);
  return way.list
    .map((one, k) => ({ one, far: Math.abs(k - at) * 2 - (k > at ? 1 : 0) }))
    .filter(({ one }) => one !== now && one !== was && !isNone(one))
    .sort((a, b) => a.far - b.far)
    .map(({ one }) => one);
}

/**
 * A spec changed as the maker asked, and up to `more` other readings of
 * the same words: each differs from it in one field the change touched,
 * each in a different field where it can. The writer's own comes first.
 */
export function readingsOf<T extends object>(
  was: T | null,
  now: T,
  ways: Ways,
  words: string,
  more = MAX_OPTIONS - 1,
): T[] {
  const byField: { path: string; values: Value[]; kind: Way['kind'] }[] = [];
  for (const [path, way] of Object.entries(ways)) {
    // A spec new to them (one the artist drew, now the kit's) is every
    // field said at once: only its colours are read another way.
    if (!was && way.kind !== 'colour') continue;
    const before = was ? valueAt(was, path) : null;
    const after = valueAt(now, path);
    if (after === null || after === before) continue;
    const values = readings(way, before, after, words);
    if (values.length) byField.push({ path, values, kind: way.kind });
  }
  byField.sort((a, b) => FAITHFUL[a.kind] - FAITHFUL[b.kind]);
  const out: T[] = [now];
  const seen = new Set([JSON.stringify(now), JSON.stringify(was)]);
  const deepest = Math.max(0, ...byField.map((one) => one.values.length));
  for (let round = 0; round < deepest && out.length <= more; round++)
    for (const { path, values } of byField) {
      if (out.length > more) break;
      const value = values[round];
      if (value === undefined) continue;
      const one = withValue(now, path, value);
      const key = JSON.stringify(one);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(one);
    }
  return out;
}

/**
 * How another reading reads in words: the writer's words for theirs, with
 * each value that differs said as the other's ("a brown horse" as "a
 * chestnut horse"); when their words never said it, `describe`'s.
 */
export function lookOf<T extends object>(
  look: string,
  theirs: T,
  other: T,
  ways: Ways,
  describe: (spec: T) => string,
): string {
  let words = look;
  let told = true;
  for (const path of Object.keys(ways)) {
    const a = valueAt(theirs, path);
    const b = valueAt(other, path);
    if (a === b || a === null || b === null) continue;
    const escaped = String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // With its "a" or "an" before it, said again for the other.
    const pattern = new RegExp(`(\\b(?:a|an)\\s+)?\\b${escaped}\\b`, 'i');
    if (!pattern.test(words)) told = false;
    else
      words = words.replace(pattern, (_all, article?: string) => {
        if (!article) return String(b);
        const an = /^[aeiou]/i.test(String(b)) ? 'an' : 'a';
        return `${article.startsWith('A') ? an.replace('a', 'A') : an} ${b}`;
      });
  }
  return told && words.trim() ? words : describe(other);
}

/** The ways of each kit's spec. */
export const WAYS_OF = {
  person: FIGURE_WAYS,
  animal: ANIMAL_WAYS,
  creature: CREATURE_WAYS,
} as const;

export type KitSpecOf = {
  person: FigureSpec;
  animal: AnimalSpec;
  creature: CreatureSpec;
};
