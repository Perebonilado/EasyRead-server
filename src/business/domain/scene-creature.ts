/**
 * Made-up creatures, drawn by code (studio-drawings-plan §6): the way the
 * figure kit draws people and the animal kit animals. A writer says what a
 * creature is from closed lists (its body's shape, colour and texture, how
 * many eyes, its nose, its head if it has one apart from its body, what
 * grows on top, its arms, legs, wings and tail, and what it wears) and
 * this draws it, the same in every scene and every episode, in the kit's
 * own ink, line and palette, with the kit's own eyes, feelings and mouths
 * that talk: Humpty and Eggbert, snowmen, robots, ghosts, dragons,
 * monsters, blobs, stars and flames.
 *
 * It faces the viewer, as the kit's people do. Its face is set by code in
 * the upper third of its body (or on its head), as large as the body is
 * wide, so it never shrinks into a small oval on its belly.
 *
 * It is drawn for the stage's artist path (rig false), as the animal kit's
 * animals are: its parts carry the artist rig's classes (its arms turn as
 * the kit's people's do; one with no arms leans and hops in one piece).
 * The drawing is in scene-creature-body; this is the description and its
 * words.
 */
import type { ClothColour } from './scene-figure';
import { CLOTH_COLOURS } from './scene-figure';
import { CLOTH, COATS, KIT_EXTRAS } from './scene-ink';

// ── The lists ──────────────────────────────────────────────────────────────

/**
 * A creature's body, the shape it is: an egg (Humpty), a pear, a ball, a
 * bean, a box (a robot), a cone, a cloud, a flame, a star, a column, a
 * drop, a stack of balls (a snowman) and a ghost's sheet.
 */
export const CREATURE_BODIES = [
  'egg',
  'pear',
  'ball',
  'bean',
  'box',
  'cone',
  'cloud',
  'flame',
  'star',
  'column',
  'drop',
  'stack',
  'ghost',
] as const;
export type CreatureBody = (typeof CREATURE_BODIES)[number];

export const CREATURE_BUILDS = ['slim', 'average', 'stout'] as const;
export type CreatureBuild = (typeof CREATURE_BUILDS)[number];

/** How tall it stands beside people. */
export const CREATURE_SIZES = ['small', 'medium', 'large'] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

/** The colours a creature comes in: the house palette's. */
export const CREATURE_COLOURS = [
  'white',
  'cream',
  'yellow',
  'golden',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'navy',
  'teal',
  'green',
  'brown',
  'tan',
  'grey',
  'silver',
  'black',
] as const;
export type CreatureColour = (typeof CREATURE_COLOURS)[number];

/** Each colour as the kit paints it. */
export const CREATURE_PAINT: Record<CreatureColour, string> = {
  white: COATS.white,
  cream: COATS.cream,
  yellow: COATS.yellow,
  golden: COATS.golden,
  orange: COATS.orange,
  red: CLOTH.red,
  pink: CLOTH.pink,
  purple: CLOTH.purple,
  blue: COATS.blue,
  navy: CLOTH.navy,
  teal: CLOTH.teal,
  green: COATS.green,
  brown: COATS.brown,
  tan: COATS.tan,
  grey: COATS.grey,
  silver: KIT_EXTRAS.steel,
  black: COATS.black,
};

/**
 * What is on its body, in its second colour: nothing; a crack (an egg's);
 * scales; spots; stripes; rivets and a panel (a robot's); fur; patches; a
 * paler belly; a row of buttons (a snowman's coal).
 */
export const CREATURE_TEXTURES = [
  'none',
  'crack',
  'scales',
  'spots',
  'stripes',
  'rivets',
  'fur',
  'patches',
  'belly',
  'buttons',
] as const;
export type CreatureTexture = (typeof CREATURE_TEXTURES)[number];

export const CREATURE_EYES = [1, 2, 3] as const;
export type CreatureEyes = (typeof CREATURE_EYES)[number];

/** Its nose: none; a button; a dragon's snout; a snowman's carrot; a small beak. */
export const CREATURE_NOSES = [
  'none',
  'button',
  'snout',
  'carrot',
  'beak',
] as const;
export type CreatureNose = (typeof CREATURE_NOSES)[number];

/** A head apart from its body, its face on it (a robot's, a snowman's, a dragon's); none, its face on its body. */
export const CREATURE_HEADS = ['none', 'round', 'box'] as const;
export type CreatureHead = (typeof CREATURE_HEADS)[number];

/** What grows or sits on top of it. */
export const CREATURE_TOPS = [
  'none',
  'tuft',
  'horns',
  'antennae',
  'ears',
  'crown',
  'halo',
  'hat',
  'flame',
  'spikes',
] as const;
export type CreatureTop = (typeof CREATURE_TOPS)[number];

/** Its arms: none; thin sticks with round hands; the kit's arms with mitten hands; tentacles; small wings. */
export const CREATURE_ARMS = [
  'none',
  'stick',
  'kit',
  'tentacles',
  'wings',
] as const;
export type CreatureArms = (typeof CREATURE_ARMS)[number];

/** Its legs: none; thin sticks with shoes; the kit's legs with feet; just feet; a tail it floats on. */
export const CREATURE_LEGS = ['none', 'stick', 'kit', 'feet', 'tail'] as const;
export type CreatureLegs = (typeof CREATURE_LEGS)[number];

/** Wings on its back. */
export const CREATURE_WINGS = ['none', 'feathered', 'bat', 'insect'] as const;
export type CreatureWings = (typeof CREATURE_WINGS)[number];

export const CREATURE_TAILS = ['none', 'short', 'long', 'spiked'] as const;
export type CreatureTail = (typeof CREATURE_TAILS)[number];

/** What a creature wears, by where: round its neck, on its body, on its face. */
export const CREATURE_NECK_WEAR = ['bow tie', 'scarf', 'collar'] as const;
export const CREATURE_BODY_WEAR = ['belt', 'cape', 'waistcoat'] as const;
export const CREATURE_FACE_WEAR = ['glasses', 'monocle'] as const;
export type CreatureNeckWear = (typeof CREATURE_NECK_WEAR)[number];
export type CreatureBodyWear = (typeof CREATURE_BODY_WEAR)[number];
export type CreatureFaceWear = (typeof CREATURE_FACE_WEAR)[number];
export const CREATURE_WEAR_SLOTS = ['neck', 'body', 'face'] as const;
export type CreatureWearSlot = (typeof CREATURE_WEAR_SLOTS)[number];
export const CREATURE_WEAR_OF: Record<CreatureWearSlot, readonly string[]> = {
  neck: CREATURE_NECK_WEAR,
  body: CREATURE_BODY_WEAR,
  face: CREATURE_FACE_WEAR,
};

/** Who a creature is, as the kit draws it. */
export interface CreatureSpec {
  body: CreatureBody;
  build: CreatureBuild;
  size: CreatureSize;
  bodyColour: CreatureColour;
  texture: CreatureTexture;
  /** Its texture's colour; null, the kit's own for it (a shade of its body, a paler belly). */
  textureColour: CreatureColour | null;
  eyes: CreatureEyes;
  nose: CreatureNose;
  head: CreatureHead;
  top: CreatureTop;
  arms: CreatureArms;
  legs: CreatureLegs;
  /** Its arms' and legs' colour: null, its body's (the kit's limbs) or ink (sticks); a snowman's twig arms are brown. */
  limbColour: CreatureColour | null;
  wings: CreatureWings;
  tail: CreatureTail;
  wear: {
    neck?: CreatureNeckWear;
    body?: CreatureBodyWear;
    face?: CreatureFaceWear;
  };
  /** What it wears is in this colour, the kit's cloth colours: a red bow tie. */
  wearColour: ClothColour | null;
}

// ── Reading a spec ─────────────────────────────────────────────────────────

/**
 * Other words for the lists' own, as a model or the maker may write them.
 * A word some lists share names one in each: each reading takes the one
 * its own list has.
 */
const SAME: Record<string, readonly string[]> = {
  // Bodies.
  oval: ['egg'],
  eggy: ['egg'],
  round: ['ball', 'round'],
  sphere: ['ball'],
  blob: ['ball'],
  circle: ['ball'],
  jelly: ['drop'],
  slime: ['drop'],
  teardrop: ['drop'],
  droplet: ['drop'],
  square: ['box', 'box'],
  boxy: ['box', 'box'],
  cube: ['box'],
  block: ['box'],
  rectangle: ['box'],
  triangle: ['cone'],
  pointy: ['cone'],
  gnome: ['cone'],
  fluffy: ['cloud', 'fur'],
  puffy: ['cloud'],
  fire: ['flame', 'flame'],
  candle: ['flame'],
  tall: ['column'],
  tube: ['column'],
  pillar: ['column'],
  cylinder: ['column'],
  snowman: ['stack'],
  stacked: ['stack'],
  sheet: ['ghost'],
  spirit: ['ghost'],
  phantom: ['ghost'],
  kidney: ['bean'],
  potato: ['bean'],
  bottom: ['pear'],
  // Colours.
  gray: ['grey'],
  'light grey': ['silver'],
  metal: ['silver'],
  metallic: ['silver'],
  steel: ['silver'],
  chrome: ['silver'],
  gold: ['golden'],
  violet: ['purple'],
  lilac: ['purple'],
  lavender: ['purple'],
  'dark blue': ['navy'],
  'light blue': ['blue'],
  turquoise: ['teal'],
  aqua: ['teal'],
  lime: ['green'],
  'off white': ['cream'],
  ivory: ['cream'],
  beige: ['tan'],
  sandy: ['tan'],
  'light brown': ['tan'],
  // Textures.
  cracked: ['crack'],
  cracks: ['crack'],
  scaly: ['scales'],
  scale: ['scales'],
  spotted: ['spots'],
  spotty: ['spots'],
  dotted: ['spots'],
  dots: ['spots'],
  striped: ['stripes'],
  stripy: ['stripes'],
  stripe: ['stripes'],
  bolts: ['rivets'],
  rivet: ['rivets'],
  panel: ['rivets'],
  screen: ['rivets'],
  robot: ['rivets'],
  furry: ['fur'],
  hairy: ['fur'],
  shaggy: ['fur'],
  patchy: ['patches'],
  patch: ['patches'],
  tummy: ['belly'],
  chest: ['belly'],
  button: ['buttons', 'button'],
  coal: ['buttons'],
  plain: ['none'],
  smooth: ['none'],
  // Eyes.
  one: ['1'],
  single: ['1'],
  cyclops: ['1'],
  two: ['2'],
  three: ['3'],
  // Noses.
  muzzle: ['snout'],
  nostrils: ['snout'],
  carrots: ['carrot'],
  bill: ['beak'],
  // Heads, tops.
  hair: ['tuft'],
  curl: ['tuft'],
  quiff: ['tuft'],
  horn: ['horns'],
  antenna: ['antennae'],
  aerial: ['antennae'],
  stalks: ['antennae'],
  tiara: ['crown'],
  'top hat': ['hat'],
  tophat: ['hat'],
  cap: ['hat'],
  'bowler hat': ['hat'],
  spiky: ['spikes', 'spiked'],
  spines: ['spikes'],
  crest: ['spikes'],
  spike: ['spikes'],
  // Limbs.
  thin: ['stick', 'slim'],
  sticks: ['stick'],
  twig: ['stick'],
  twigs: ['stick'],
  human: ['kit'],
  tentacle: ['tentacles'],
  feelers: ['tentacles'],
  paws: ['feet'],
  foot: ['feet'],
  stubby: ['feet'],
  short: ['feet', 'short'],
  // Wings.
  feathers: ['feathered'],
  feathery: ['feathered'],
  angel: ['feathered'],
  bird: ['feathered'],
  dragon: ['bat'],
  leathery: ['bat'],
  fairy: ['insect'],
  bee: ['insect'],
  butterfly: ['insect'],
  dragonfly: ['insect'],
  // Tails.
  stub: ['short'],
  arrow: ['spiked'],
  pointed: ['spiked'],
  // What it wears.
  bowtie: ['bow tie'],
  bow: ['bow tie'],
  ribbon: ['bow tie'],
  necktie: ['bow tie'],
  tie: ['bow tie'],
  bandana: ['scarf'],
  neckerchief: ['scarf'],
  necklace: ['collar'],
  sash: ['belt'],
  cloak: ['cape'],
  vest: ['waistcoat'],
  spectacles: ['glasses'],
  specs: ['glasses'],
  eyeglass: ['monocle'],
  // Builds and sizes.
  skinny: ['slim'],
  chubby: ['stout'],
  fat: ['stout'],
  plump: ['stout'],
  rounder: ['stout'],
  tiny: ['small'],
  little: ['small'],
  baby: ['small'],
  big: ['large'],
  huge: ['large'],
  giant: ['large'],
  none: ['none'],
  no: ['none'],
};

/** A word as one list writes it: its own, another word for it, or the last of the words said that is one ("a big boxy robot"). */
function wordOf(value: unknown, list: readonly string[]): string | null {
  if (typeof value === 'number') value = String(value);
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

/** A plain creature of a body: as the kit draws it when nothing else is said. */
export function plainCreature(body: CreatureBody): CreatureSpec {
  return {
    body,
    build: 'average',
    size: 'medium',
    bodyColour: body === 'ghost' || body === 'stack' ? 'white' : 'green',
    texture: 'none',
    textureColour: null,
    eyes: 2,
    nose: body === 'stack' ? 'carrot' : 'none',
    head: body === 'stack' ? 'round' : 'none',
    top: 'none',
    arms: body === 'ghost' ? 'none' : 'stick',
    legs:
      body === 'ghost' ||
      body === 'cloud' ||
      body === 'flame' ||
      body === 'stack'
        ? 'none'
        : 'stick',
    limbColour: null,
    wings: 'none',
    tail: 'none',
    wear: {},
    wearColour: null,
  };
}

/**
 * A creature from what a model, the maker or a kept file said, made
 * sound: every value one of the lists, what is missing or unknown the
 * body's plain own. Null when no body the kit has is said: that creature
 * is the artist's. What is worn is in a colour (red, when none is said).
 */
export function creatureOf(raw: unknown): CreatureSpec | null {
  const said = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const body = wordOf(said.body, CREATURE_BODIES) as CreatureBody | null;
  if (!body) return null;
  const plain = plainCreature(body);
  const colourOrNull = (value: unknown) =>
    value === null || value === undefined || value === 'none'
      ? null
      : (wordOf(value, CREATURE_COLOURS) as CreatureColour | null);
  const worn = (
    said.wear && typeof said.wear === 'object' ? said.wear : {}
  ) as Record<string, unknown>;
  const wear: CreatureSpec['wear'] = {};
  for (const slot of CREATURE_WEAR_SLOTS) {
    const thing = wordOf(worn[slot], CREATURE_WEAR_OF[slot]);
    if (thing) (wear as Record<string, string>)[slot] = thing;
  }
  const wearColour = Object.keys(wear).length
    ? one(CLOTH_COLOURS, said.wearColour, 'red')
    : null;
  const eyes = Number(
    wordOf(said.eyes, CREATURE_EYES.map(String)) ?? plain.eyes,
  ) as CreatureEyes;
  const texture = one(CREATURE_TEXTURES, said.texture, plain.texture);
  return {
    body,
    build: one(CREATURE_BUILDS, said.build, plain.build),
    size: one(CREATURE_SIZES, said.size, plain.size),
    bodyColour: one(CREATURE_COLOURS, said.bodyColour, plain.bodyColour),
    texture,
    textureColour: texture === 'none' ? null : colourOrNull(said.textureColour),
    eyes,
    nose: one(CREATURE_NOSES, said.nose, plain.nose),
    head: one(CREATURE_HEADS, said.head, plain.head),
    top: one(CREATURE_TOPS, said.top, plain.top),
    arms: one(CREATURE_ARMS, said.arms, plain.arms),
    legs: one(CREATURE_LEGS, said.legs, plain.legs),
    limbColour: colourOrNull(said.limbColour),
    wings: one(CREATURE_WINGS, said.wings, plain.wings),
    tail: one(CREATURE_TAILS, said.tail, plain.tail),
    wear,
    wearColour,
  };
}

const BODY_WORDS: Record<CreatureBody, string> = {
  egg: 'egg-shaped',
  pear: 'pear-shaped',
  ball: 'round',
  bean: 'bean-shaped',
  box: 'boxy',
  cone: 'cone-shaped',
  cloud: 'cloud-shaped',
  flame: 'flame-shaped',
  star: 'star-shaped',
  column: 'tall, thin',
  drop: 'drop-shaped',
  stack: 'snowball-stacked',
  ghost: 'ghostly',
};

const TEXTURE_WORDS: Record<CreatureTexture, (colour: string) => string> = {
  none: () => '',
  crack: () => 'a crack',
  scales: (c) => `${c}scales`,
  spots: (c) => `${c}spots`,
  stripes: (c) => `${c}stripes`,
  rivets: () => 'rivets and a panel',
  fur: () => 'fur',
  patches: (c) => `${c}patches`,
  belly: (c) => `a ${c}belly`,
  buttons: (c) => `${c}buttons`,
};

const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * A creature in a few words, for its card, the writer and a log line: "a
 * small white egg-shaped creature with two eyes, thin stick arms and legs,
 * wearing a red bow tie and a red belt".
 */
export function describeCreature(spec: CreatureSpec): string {
  const size = spec.size === 'medium' ? '' : `${spec.size} `;
  const build = spec.build === 'average' ? '' : `${spec.build} `;
  const texture = TEXTURE_WORDS[spec.texture](
    spec.textureColour ? `${spec.textureColour} ` : '',
  );
  const limbs = (kind: string, what: 'arms' | 'legs') =>
    kind === 'stick'
      ? `thin ${what}`
      : kind === 'kit'
        ? what
        : kind === 'feet'
          ? 'feet'
          : kind === 'tail'
            ? 'a tail to float on'
            : kind === 'tentacles'
              ? 'tentacles'
              : kind === 'wings'
                ? 'little wings for arms'
                : '';
  const parts = [
    texture,
    spec.eyes === 2 ? '' : spec.eyes === 1 ? 'one big eye' : 'three eyes',
    spec.nose === 'none' ? '' : `a ${spec.nose} nose`,
    spec.head === 'none' ? '' : `a ${spec.head} head`,
    spec.top === 'none'
      ? ''
      : spec.top === 'horns' ||
          spec.top === 'antennae' ||
          spec.top === 'ears' ||
          spec.top === 'spikes'
        ? spec.top
        : `a ${spec.top}`,
    limbs(spec.arms, 'arms'),
    limbs(spec.legs, 'legs'),
    spec.wings === 'none' ? '' : `${spec.wings} wings`,
    spec.tail === 'none' ? '' : `a ${spec.tail} tail`,
  ].filter(Boolean);
  const worn = CREATURE_WEAR_SLOTS.flatMap((slot) =>
    spec.wear[slot] ? [spec.wear[slot]] : [],
  );
  const article = /^[aeiou]/.test(`${size}${build}${spec.bodyColour}`)
    ? 'an'
    : 'a';
  return [
    `${article} ${size}${build}${spec.bodyColour} ${BODY_WORDS[spec.body]} creature`,
    parts.length ? ` with ${listed(parts)}` : '',
    worn.length
      ? `, wearing ${listed(worn.map((w) => (w === 'glasses' ? `${spec.wearColour ?? 'red'} glasses` : `a ${spec.wearColour ?? 'red'} ${w}`)))}`
      : '',
  ].join('');
}

/** How tall it stands, to the top of its body or head, in the kit's units, by its size: beside a grown-up's 192. */
export const CREATURE_TALL: Record<CreatureSize, number> = {
  small: 82,
  medium: 120,
  large: 186,
};

/** The kit's creature for a story's character: the spec its bible gives it; else none, and the artist draws it. */
export function creatureFor(character: {
  creature?: CreatureSpec | null;
}): CreatureSpec | null {
  return character.creature ?? null;
}
