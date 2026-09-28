/**
 * Animals, drawn by code (studio-drawings-plan §5): the way the figure kit
 * draws people. A writer says what an animal is from closed lists (its
 * species, build, size, coat and markings, ears, tail, mane, horns, and
 * what it wears) and this draws it, the same in every scene and every
 * episode, in the kit's own ink, line and palette, with the kit's own
 * eyes, feelings and mouths that talk.
 *
 * Each species is a preset over one of six body plans (four legs, a
 * hopper, a bird, a fish, a long one, a climber), drawn from a few shapes
 * with known joints: so its head dips about its neck, its tail wags, its
 * ears twitch, its legs step as it walks and fold as it sits and lies
 * down, each turning about its own joint, set by code, not measured.
 *
 * It is drawn for the stage's artist path (rig false): the parts carry the
 * artist rig's own classes and the drawing the fields an artist's animal
 * has (its mouth, neck, dip, how far it sinks, which way it faces, its
 * mouth's shapes), so the stage plays it exactly as it plays those.
 *
 * The drawing itself is in scene-animal-body (the plans) and here (the
 * face, the mouths, what moves it): this is the description and its words.
 */
import type { ClothColour } from './scene-figure';
import { CLOTH_COLOURS } from './scene-figure';
import { CLOTH, COATS } from './scene-ink';

// ── The lists ──────────────────────────────────────────────────────────────

export const ANIMAL_SPECIES = [
  'dog',
  'cat',
  'horse',
  'donkey',
  'cow',
  'goat',
  'sheep',
  'pig',
  'lion',
  'tiger',
  'bear',
  'elephant',
  'giraffe',
  'zebra',
  'fox',
  'wolf',
  'deer',
  'rabbit',
  'mouse',
  'chicken',
  'duck',
  'goose',
  'owl',
  'parrot',
  'eagle',
  'pigeon',
  'fish',
  'snake',
  'lizard',
  'crocodile',
  'turtle',
  'frog',
  'monkey',
] as const;
export type AnimalSpecies = (typeof ANIMAL_SPECIES)[number];

/**
 * How each species is built: four legs; a hopper (big back legs, small
 * front ones); a bird; a fish; a long one (no legs, or four short ones);
 * a climber (two legs and two arms).
 */
export const BODY_PLANS = [
  'quadruped',
  'hopper',
  'bird',
  'fish',
  'long',
  'climber',
] as const;
export type BodyPlan = (typeof BODY_PLANS)[number];

export const ANIMAL_BUILDS = ['slim', 'average', 'stout'] as const;
export type AnimalBuild = (typeof ANIMAL_BUILDS)[number];

/** Its size within its species: a puppy, a dog, a big dog. */
export const ANIMAL_SIZES = ['small', 'medium', 'large'] as const;
export type AnimalSize = (typeof ANIMAL_SIZES)[number];

/** The colours an animal's coat, feathers or scales come in: the house palette's coats, and red. */
export const ANIMAL_COLOURS = [
  'brown',
  'dark brown',
  'chestnut',
  'tan',
  'cream',
  'white',
  'grey',
  'dark grey',
  'black',
  'ginger',
  'golden',
  'pink',
  'green',
  'yellow',
  'orange',
  'blue',
  'red',
] as const;
export type AnimalColour = (typeof ANIMAL_COLOURS)[number];

/** Each colour as the kit paints it. */
export const ANIMAL_PAINT: Record<AnimalColour, string> = {
  ...(COATS as Record<Exclude<AnimalColour, 'red'>, string>),
  red: CLOTH.red,
};

/**
 * Where the second colour goes: nowhere; in patches; in spots; in
 * stripes; on its feet; down its face; on its belly, chest and muzzle.
 */
export const ANIMAL_PATTERNS = [
  'plain',
  'patches',
  'spots',
  'stripes',
  'socks',
  'blaze',
  'belly',
] as const;
export type AnimalPattern = (typeof ANIMAL_PATTERNS)[number];

export const ANIMAL_EARS = ['floppy', 'pointed', 'round', 'long'] as const;
export type AnimalEars = (typeof ANIMAL_EARS)[number];

export const ANIMAL_TAILS = [
  'short',
  'long',
  'bushy',
  'curly',
  'tufted',
  'none',
] as const;
export type AnimalTail = (typeof ANIMAL_TAILS)[number];

export const ANIMAL_MANES = ['none', 'short', 'long'] as const;
export type AnimalMane = (typeof ANIMAL_MANES)[number];

export const ANIMAL_HORNS = ['none', 'small', 'curled', 'antlers'] as const;
export type AnimalHorns = (typeof ANIMAL_HORNS)[number];

/** What an animal wears, by where: round its neck, on its back, on its head, on its feet. */
export const NECK_WEAR = ['collar', 'bow', 'scarf', 'bell'] as const;
export const BACK_WEAR = ['saddle blanket', 'saddle', 'cape'] as const;
export const HEAD_WEAR = ['hat', 'crown', 'flower'] as const;
export const FEET_WEAR = ['boots'] as const;
export type NeckWear = (typeof NECK_WEAR)[number];
export type BackWear = (typeof BACK_WEAR)[number];
export type HeadWear = (typeof HEAD_WEAR)[number];
export type FeetWear = (typeof FEET_WEAR)[number];
export type AnimalWear = NeckWear | BackWear | HeadWear | FeetWear;
export const WEAR_SLOTS = ['neck', 'back', 'head', 'feet'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];
export const WEAR_OF: Record<WearSlot, readonly AnimalWear[]> = {
  neck: NECK_WEAR,
  back: BACK_WEAR,
  head: HEAD_WEAR,
  feet: FEET_WEAR,
};

/** Who an animal is, as the kit draws it. */
export interface AnimalSpec {
  species: AnimalSpecies;
  build: AnimalBuild;
  size: AnimalSize;
  coat: AnimalColour;
  /** Its belly, muzzle, socks, patches or stripes; null for none. */
  second: AnimalColour | null;
  pattern: AnimalPattern;
  /** Null: the species' own. */
  ears: AnimalEars | null;
  tail: AnimalTail | null;
  mane: AnimalMane | null;
  horns: AnimalHorns | null;
  wear: {
    neck?: NeckWear;
    back?: BackWear;
    head?: HeadWear;
    feet?: FeetWear;
  };
  /** What it wears is in this colour, the kit's cloth colours: a red saddle blanket. */
  wearColour: ClothColour | null;
}

// ── Each species ───────────────────────────────────────────────────────────

/** A species as the kit knows it: its plan, how tall it stands, and how it looks unless said otherwise. */
export interface SpeciesPreset {
  plan: BodyPlan;
  /**
   * How tall it stands at its middle size, to the top of its head, in the
   * kit's units, beside a grown-up's 192: a dog about 0.45 of one, a horse
   * 1.1 at the head, a chicken 0.2. The smallest a little larger than life,
   * as a cartoon's are, so a talking mouse's face reads.
   */
  tall: number;
  coat: AnimalColour;
  second: AnimalColour | null;
  pattern: AnimalPattern;
  ears: AnimalEars | null;
  tail: AnimalTail;
  mane: AnimalMane;
  horns: AnimalHorns;
}

const preset = (
  plan: BodyPlan,
  tall: number,
  coat: AnimalColour,
  second: AnimalColour | null,
  pattern: AnimalPattern,
  ears: AnimalEars | null,
  tail: AnimalTail,
  mane: AnimalMane = 'none',
  horns: AnimalHorns = 'none',
): SpeciesPreset => ({
  plan,
  tall,
  coat,
  second,
  pattern,
  ears,
  tail,
  mane,
  horns,
});

export const SPECIES: Record<AnimalSpecies, SpeciesPreset> = {
  dog: preset('quadruped', 86, 'brown', 'cream', 'belly', 'floppy', 'long'),
  cat: preset('quadruped', 52, 'ginger', 'cream', 'belly', 'pointed', 'long'),
  horse: preset(
    'quadruped',
    211,
    'chestnut',
    'white',
    'blaze',
    'pointed',
    'long',
    'long',
  ),
  donkey: preset(
    'quadruped',
    150,
    'grey',
    'cream',
    'belly',
    'long',
    'tufted',
    'short',
  ),
  cow: preset(
    'quadruped',
    160,
    'white',
    'black',
    'patches',
    'pointed',
    'tufted',
    'none',
    'small',
  ),
  goat: preset(
    'quadruped',
    92,
    'white',
    'tan',
    'plain',
    'pointed',
    'short',
    'none',
    'curled',
  ),
  sheep: preset(
    'quadruped',
    92,
    'white',
    'dark grey',
    'plain',
    'floppy',
    'short',
  ),
  pig: preset('quadruped', 80, 'pink', null, 'plain', 'pointed', 'curly'),
  lion: preset(
    'quadruped',
    134,
    'golden',
    'cream',
    'belly',
    'round',
    'tufted',
    'long',
  ),
  tiger: preset(
    'quadruped',
    124,
    'orange',
    'black',
    'stripes',
    'round',
    'long',
  ),
  bear: preset('quadruped', 140, 'brown', 'tan', 'belly', 'round', 'short'),
  elephant: preset('quadruped', 280, 'grey', null, 'plain', 'round', 'tufted'),
  giraffe: preset(
    'quadruped',
    360,
    'golden',
    'chestnut',
    'patches',
    'pointed',
    'tufted',
    'short',
    'small',
  ),
  zebra: preset(
    'quadruped',
    182,
    'white',
    'black',
    'stripes',
    'pointed',
    'tufted',
    'short',
  ),
  fox: preset('quadruped', 60, 'ginger', 'white', 'belly', 'pointed', 'bushy'),
  wolf: preset('quadruped', 96, 'grey', 'cream', 'belly', 'pointed', 'bushy'),
  deer: preset(
    'quadruped',
    170,
    'tan',
    'cream',
    'belly',
    'pointed',
    'short',
    'none',
    'antlers',
  ),
  rabbit: preset('hopper', 52, 'grey', 'white', 'belly', 'long', 'short'),
  mouse: preset('quadruped', 30, 'grey', 'pink', 'belly', 'round', 'long'),
  chicken: preset('bird', 42, 'white', 'red', 'plain', null, 'short'),
  duck: preset('bird', 38, 'yellow', 'orange', 'plain', null, 'short'),
  goose: preset('bird', 66, 'white', 'orange', 'plain', null, 'short'),
  owl: preset('bird', 40, 'brown', 'cream', 'belly', null, 'short'),
  parrot: preset('bird', 44, 'green', 'yellow', 'plain', null, 'long'),
  eagle: preset('bird', 72, 'dark brown', 'white', 'plain', null, 'short'),
  pigeon: preset('bird', 30, 'grey', 'dark grey', 'plain', null, 'short'),
  fish: preset('fish', 34, 'orange', 'white', 'stripes', null, 'short'),
  snake: preset('long', 42, 'green', 'yellow', 'spots', null, 'long'),
  lizard: preset('long', 26, 'green', 'yellow', 'belly', null, 'long'),
  crocodile: preset('long', 50, 'green', 'yellow', 'belly', null, 'long'),
  turtle: preset('long', 32, 'green', 'brown', 'plain', null, 'short'),
  frog: preset('hopper', 30, 'green', 'yellow', 'belly', null, 'none'),
  monkey: preset('climber', 84, 'brown', 'tan', 'belly', 'round', 'curly'),
};

// ── Reading a spec ─────────────────────────────────────────────────────────

/**
 * Other words for the lists' own, as a model or the maker may write them.
 * A word some lists share ("fawn": a deer, and a colour) names one in each:
 * each reading takes the one its own list has.
 */
const SAME: Record<string, readonly string[]> = {
  // Species, and their young.
  puppy: ['dog'],
  pup: ['dog'],
  hound: ['dog'],
  doggy: ['dog'],
  kitten: ['cat'],
  kitty: ['cat'],
  pony: ['horse'],
  foal: ['horse'],
  colt: ['horse'],
  mare: ['horse'],
  stallion: ['horse'],
  mule: ['donkey'],
  calf: ['cow'],
  bull: ['cow'],
  ox: ['cow'],
  lamb: ['sheep'],
  ram: ['sheep', 'curled'],
  ewe: ['sheep'],
  piglet: ['pig'],
  hog: ['pig'],
  boar: ['pig'],
  lioness: ['lion'],
  cub: ['bear'],
  'teddy bear': ['bear'],
  fawn: ['deer', 'tan'],
  stag: ['deer'],
  reindeer: ['deer'],
  bunny: ['rabbit'],
  hare: ['rabbit'],
  rat: ['mouse'],
  hamster: ['mouse'],
  hen: ['chicken'],
  rooster: ['chicken'],
  cockerel: ['chicken'],
  chick: ['chicken'],
  duckling: ['duck'],
  gosling: ['goose'],
  swan: ['goose'],
  macaw: ['parrot'],
  budgie: ['parrot'],
  hawk: ['eagle'],
  falcon: ['eagle'],
  dove: ['pigeon'],
  sparrow: ['pigeon'],
  robin: ['pigeon'],
  bird: ['pigeon'],
  goldfish: ['fish'],
  serpent: ['snake'],
  python: ['snake'],
  gecko: ['lizard'],
  chameleon: ['lizard'],
  alligator: ['crocodile'],
  croc: ['crocodile'],
  tortoise: ['turtle'],
  toad: ['frog'],
  ape: ['monkey'],
  chimp: ['monkey'],
  chimpanzee: ['monkey'],
  // Colours.
  gray: ['grey'],
  'dark gray': ['dark grey'],
  darkgrey: ['dark grey'],
  'light brown': ['tan'],
  beige: ['tan'],
  sandy: ['tan'],
  darkbrown: ['dark brown'],
  chocolate: ['dark brown'],
  bay: ['chestnut'],
  sorrel: ['chestnut'],
  rust: ['chestnut'],
  'off white': ['cream'],
  ivory: ['cream'],
  gold: ['golden'],
  blond: ['golden'],
  blonde: ['golden'],
  tabby: ['ginger'],
  // Markings.
  patch: ['patches'],
  patchy: ['patches'],
  pinto: ['patches'],
  piebald: ['patches'],
  spot: ['spots'],
  spotted: ['spots'],
  speckled: ['spots'],
  speckles: ['spots'],
  dotted: ['spots'],
  striped: ['stripes'],
  stripe: ['stripes'],
  tiger: ['stripes'],
  sock: ['socks'],
  stockings: ['socks'],
  'white feet': ['socks'],
  star: ['blaze'],
  head: ['blaze'],
  'white face': ['blaze'],
  underside: ['belly'],
  chest: ['belly'],
  bib: ['belly'],
  none: ['plain', 'none'],
  solid: ['plain'],
  // Ears, tails, manes, horns.
  droopy: ['floppy'],
  pricked: ['pointed'],
  upright: ['pointed'],
  triangle: ['pointed'],
  rounded: ['round'],
  stub: ['short'],
  stumpy: ['short'],
  fluffy: ['bushy'],
  plume: ['bushy'],
  curled: ['curly', 'curled'],
  corkscrew: ['curly'],
  tuft: ['tufted'],
  'no tail': ['none'],
  flowing: ['long'],
  cropped: ['short'],
  horn: ['small'],
  horns: ['small'],
  antler: ['antlers'],
  // What it wears.
  'saddle cloth': ['saddle blanket'],
  saddlecloth: ['saddle blanket'],
  blanket: ['saddle blanket'],
  rug: ['saddle blanket'],
  cloak: ['cape'],
  'bow tie': ['bow'],
  bowtie: ['bow'],
  ribbon: ['bow'],
  bandana: ['scarf'],
  neckerchief: ['scarf'],
  necklace: ['collar'],
  cap: ['hat'],
  tiara: ['crown'],
  flowers: ['flower'],
  shoes: ['boots'],
  wellies: ['boots'],
};

/** A word as one list writes it: its own, another word for it, or the last of the words said that is one ("a fluffy white dog"). */
function wordOf(value: unknown, list: readonly string[]): string | null {
  if (typeof value !== 'string') return null;
  const said = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!said) return null;
  const known = (word: string) =>
    list.includes(word)
      ? word
      : (SAME[word]?.find((one) => list.includes(one)) ?? null);
  const whole = known(said);
  if (whole) return whole;
  const words = said.split(' ');
  for (let k = words.length - 1; k >= 0; k -= 1) {
    const found = known(words.slice(k).join(' ')) ?? known(words[k]);
    if (found) return found;
  }
  return null;
}

function one<T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return (wordOf(value, list) as T | null) ?? fallback;
}

/** A species from what a model or a kept file said, or null when the kit has none such. */
export function speciesOf(value: unknown): AnimalSpecies | null {
  return wordOf(value, ANIMAL_SPECIES) as AnimalSpecies | null;
}

/** The plain animal of a species: as the kit draws it when nothing else is said. */
export function plainAnimal(species: AnimalSpecies): AnimalSpec {
  const p = SPECIES[species];
  return {
    species,
    build: 'average',
    size: 'medium',
    coat: p.coat,
    second: p.second,
    pattern: p.pattern,
    ears: null,
    tail: null,
    mane: null,
    horns: null,
    wear: {},
    wearColour: null,
  };
}

/**
 * An animal from what a model, the maker or a kept file said, made sound:
 * every value one of the lists, what is missing or unknown the species'
 * own. Null when there is no species the kit draws: that animal is the
 * artist's. A second colour the same as the coat is none, and what is
 * worn is in a colour (red, when none is said).
 */
export function animalOf(raw: unknown): AnimalSpec | null {
  const said = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const species = speciesOf(said.species);
  if (!species) return null;
  const plain = plainAnimal(species);
  const coat = one(ANIMAL_COLOURS, said.coat, plain.coat);
  const secondSaid =
    said.second === null || said.second === 'none'
      ? null
      : (wordOf(said.second, ANIMAL_COLOURS) as AnimalColour | null);
  const second =
    'second' in said
      ? secondSaid && secondSaid !== coat
        ? secondSaid
        : null
      : plain.second !== coat
        ? plain.second
        : null;
  const orNull = <T extends string>(list: readonly T[], value: unknown) =>
    value === null || value === undefined
      ? null
      : (wordOf(value, list) as T | null);
  const worn = (
    said.wear && typeof said.wear === 'object' ? said.wear : {}
  ) as Record<string, unknown>;
  const wear: AnimalSpec['wear'] = {};
  for (const slot of WEAR_SLOTS) {
    const thing = wordOf(worn[slot], WEAR_OF[slot]);
    if (thing) (wear as Record<string, string>)[slot] = thing;
  }
  const wearColour = Object.keys(wear).length
    ? one(CLOTH_COLOURS, said.wearColour, 'red')
    : null;
  return {
    species,
    build: one(ANIMAL_BUILDS, said.build, plain.build),
    size: one(ANIMAL_SIZES, said.size, plain.size),
    coat,
    second,
    pattern: second
      ? one(ANIMAL_PATTERNS, said.pattern, plain.pattern)
      : 'plain',
    ears: orNull(ANIMAL_EARS, said.ears),
    tail: orNull(ANIMAL_TAILS, said.tail),
    mane: orNull(ANIMAL_MANES, said.mane),
    horns: orNull(ANIMAL_HORNS, said.horns),
    wear,
    wearColour,
  };
}

/** What an animal has, its own or its species': ears, tail, mane and horns. */
export function featuresOf(spec: AnimalSpec): {
  ears: AnimalEars | null;
  tail: AnimalTail;
  mane: AnimalMane;
  horns: AnimalHorns;
} {
  const p = SPECIES[spec.species];
  return {
    ears: spec.ears ?? p.ears,
    tail: spec.tail ?? p.tail,
    mane: spec.mane ?? p.mane,
    horns: spec.horns ?? p.horns,
  };
}

const PATTERN_WORDS: Record<AnimalPattern, (colour: string) => string> = {
  plain: () => '',
  patches: (c) => `${c} patches`,
  spots: (c) => `${c} spots`,
  stripes: (c) => `${c} stripes`,
  socks: (c) => `${c} socks`,
  blaze: (c) => `a ${c} blaze`,
  belly: (c) => `a ${c} belly`,
};

/**
 * An animal in a few words, for its card, the writer and a log line: "a
 * small brown dog with a cream belly, floppy ears and a long tail, in a red
 * collar". What is the species' own is said only when it is not.
 */
export function describeAnimal(spec: AnimalSpec): string {
  const p = SPECIES[spec.species];
  const own = featuresOf(spec);
  const size = spec.size === 'medium' ? '' : `${spec.size} `;
  const build = spec.build === 'average' ? '' : `${spec.build} `;
  // On a bird, a blaze is its head and spots are speckles.
  const bird = p.plan === 'bird';
  const marks =
    spec.second && spec.pattern !== 'plain'
      ? bird && spec.pattern === 'blaze'
        ? `a ${spec.second} head`
        : bird && spec.pattern === 'spots'
          ? `${spec.second} speckles`
          : PATTERN_WORDS[spec.pattern](spec.second)
      : '';
  const parts = [
    marks,
    own.ears ? `${own.ears} ears` : '',
    own.tail === 'none' ? 'no tail' : `a ${own.tail} tail`,
    own.mane !== 'none' && (spec.mane || p.mane !== 'none')
      ? `a ${own.mane} mane`
      : '',
    own.horns !== 'none'
      ? own.horns === 'antlers'
        ? 'antlers'
        : `${own.horns} horns`
      : '',
  ].filter(Boolean);
  const worn = WEAR_SLOTS.flatMap((slot) =>
    spec.wear[slot] ? [spec.wear[slot]] : [],
  );
  const listed = (items: string[]) =>
    items.length <= 1
      ? (items[0] ?? '')
      : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  const article = /^[aeiou]/.test(`${size}${build}${spec.coat}`) ? 'an' : 'a';
  return [
    `${article} ${size}${build}${spec.coat} ${spec.species}`,
    parts.length ? ` with ${listed(parts)}` : '',
    worn.length
      ? `, wearing ${listed(worn.map((w) => `a ${spec.wearColour ?? 'red'} ${w}`))}`
      : '',
  ].join('');
}

/** How much larger or smaller than its species' middle size it is drawn. */
export const SIZE_SCALE: Record<AnimalSize, number> = {
  small: 0.74,
  medium: 1,
  large: 1.24,
};

/** How tall it stands, to the top of its head, in the kit's units. */
export const animalTall = (spec: AnimalSpec): number =>
  Math.round(SPECIES[spec.species].tall * SIZE_SCALE[spec.size] * 10) / 10;

/** Every word of the lists that says where a second colour goes, in the words people write it. */
const PATTERN_SAID: [RegExp, AnimalPattern][] = [
  [/\b(?:patch|patches|patchy|pinto|piebald)\b/, 'patches'],
  [/\b(?:spot|spots|spotted|dots|dotted|speckled|speckles)\b/, 'spots'],
  [/\b(?:stripe|stripes|striped)\b/, 'stripes'],
  [/\b(?:sock|socks|stockings|feet|paws)\b/, 'socks'],
  [/\b(?:blaze|star)\b/, 'blaze'],
  [/\b(?:belly|chest|bib|tummy|underside|muzzle)\b/, 'belly'],
];

/**
 * An animal read from words alone (a book's "a small scruffy brown dog
 * with a white patch on his chest and a red collar"): its species, the
 * colour said before it, a second colour and where it goes, its ears and
 * tail when said, and what it wears. Null when no species the kit has is
 * named. For a book's animals once they are drawn by the kit (a flag,
 * off until wanted); a Studio's writer says an animal's spec itself.
 */
export function animalFromWords(words: string): AnimalSpec | null {
  const text = ` ${words.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  const tokens = text.split(/\s+/).filter(Boolean);
  let at = -1;
  let species: AnimalSpecies | null = null;
  for (let i = 0; i < tokens.length && !species; i += 1) {
    species = speciesOf(tokens[i]);
    if (species) at = i;
  }
  if (!species) return null;
  const colourAt = (i: number) => wordOf(tokens[i], ANIMAL_COLOURS);
  const joined = (i: number) =>
    i > 0 ? wordOf(`${tokens[i - 1]} ${tokens[i]}`, ANIMAL_COLOURS) : null;
  // The coat: the colour said just before the species, else the first said.
  let coat: string | null = null;
  for (let i = at - 1; i >= Math.max(0, at - 4) && !coat; i -= 1)
    coat = joined(i) ?? colourAt(i);
  // A second colour and where it goes: "a white patch on his chest".
  const rest = tokens.slice(at + 1);
  let second: string | null = null;
  let pattern: AnimalPattern | null = null;
  for (let i = 0; i < rest.length && !second; i += 1) {
    const colour = wordOf(rest[i], ANIMAL_COLOURS);
    if (!colour) continue;
    const after = rest.slice(i + 1, i + 6).join(' ');
    const found = PATTERN_SAID.find(([said]) => said.test(` ${after} `));
    if (found) {
      second = colour;
      pattern = found[1];
    }
  }
  const said = (list: readonly string[], of: string) => {
    const m = new RegExp(`\\b(${list.join('|')})\\s+${of}\\b`).exec(text);
    return m ? m[1] : undefined;
  };
  const wear: Record<string, string> = {};
  let wearColour: string | undefined;
  for (const slot of WEAR_SLOTS)
    for (const thing of WEAR_OF[slot]) {
      const m = new RegExp(`\\b(?:(\\w+)\\s+)?${thing}\\b`).exec(text);
      if (!m || wear[slot]) continue;
      wear[slot] = thing;
      wearColour ??= m[1]
        ? (wordOf(m[1], CLOTH_COLOURS) ?? undefined)
        : undefined;
    }
  return animalOf({
    species,
    ...(coat ? { coat } : {}),
    ...(second ? { second, pattern } : {}),
    ears: said(ANIMAL_EARS, 'ears?'),
    tail: said(ANIMAL_TAILS, 'tail'),
    size: /\b(?:tiny|little|small|baby|puppy|kitten|foal|lamb|piglet|chick|cub)\b/.test(
      text,
    )
      ? 'small'
      : /\b(?:big|huge|large|giant|great)\b/.test(text)
        ? 'large'
        : 'medium',
    wear,
    ...(wearColour ? { wearColour } : {}),
  });
}

/**
 * The kit's animal for a story's character: the spec its bible gives it;
 * else, for a book's animal once books draw them by the kit (`books`, a
 * flag, off until wanted), one read from its look; else none, and the
 * artist draws it.
 */
export function animalFor(
  character: {
    kind?: string | null;
    animal?: AnimalSpec | null;
    look?: string | null;
  },
  books = false,
): AnimalSpec | null {
  if (character.animal) return character.animal;
  if (!books || character.kind !== 'animal') return null;
  return animalFromWords(character.look ?? '');
}
