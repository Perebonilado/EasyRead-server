/**
 * The illustrated characters' wardrobe (WP17; ported from ig-illustrated's
 * scene-wardrobe and scene-likeness): what a character wears and how they
 * look, as closed lists the drawing (character-draw.ts) knows, and the
 * reading of words into them.
 *
 * Words come from the research's look notes and the board ("a Roman
 * legionary: red tunic, banded armour, crested helmet", "white keffiyeh,
 * brown robe", "a 19th-century officer in a blue coat"). Each is read by
 * matching phrases of these lists and their other names, longest first,
 * so the same words dress a character the same way every time.
 *
 * Nothing here is anyone's by default: a culture's dress is worn only
 * where the words name it (a keffiyeh for "Arab horsemen", a toga for "a
 * Roman senator"). Without such words a character wears what most people
 * wore in its era for its role (a tunic in antiquity, a coat in the
 * 1800s), plain, never one region's. No religious symbol is drawn on
 * anyone, and nothing is caricature: dress is drawn as worn.
 *
 * Colours are cloth colours by name, read from the words beside a garment
 * ("red tunic"); what the words leave open is chosen by the character's
 * seed from the role's own colours, with the side's colour as an accent.
 */
import { ERA_IDS, type EraId } from './eras';

// ── The lists ─────────────────────────────────────────────────────────────

/** What a character is in the story: their dress and props follow from it when the words say nothing more. */
export const ROLES = [
  'person',
  'soldier',
  'ruler',
  'merchant',
  'scholar',
  'farmer',
  'sailor',
  'priest',
  'worker',
  'explorer',
  'official',
] as const;
export type Role = (typeof ROLES)[number];

/** A face, as the reference's characters wear them. */
export const EXPRESSIONS = [
  'neutral',
  'happy',
  'surprised',
  'angry',
  'smug',
  'worried',
  'thinking',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** The garments the drawing knows, each from the shoulders down. */
export const TOPS = [
  // A plain tunic, belted, to the knee; short sleeves.
  'tunic',
  // A tunic with a cloth draped over one shoulder (a toga; kente and a sari's pallu are drawn so too).
  'toga',
  // A robe to the ankles, long sleeves (a thobe, a habit, an abaya, a djellaba, a kaftan).
  'robe',
  // A robe to the ankles with wide sleeves (a kimono, a scholar's or an official's robe, an agbada).
  'wide-robe',
  // Body armour over a tunic: bands, a plate, mail or scales (armourStyle).
  'armour',
  // A coat to the knee, open over a waistcoat: the 1700s and 1800s.
  'coat',
  // A soldier's or an official's coat to the hip: buttons, a belt, a high collar, epaulettes.
  'uniform',
  // A jacket over a shirt and tie: the 1900s on.
  'suit',
  // A shirt, its sleeves long or rolled.
  'shirt',
  // A fitted top and a long skirt.
  'dress',
  // A ruler's robe with an ermine trim and a long cloak.
  'gown',
  // A boxy tunic to the knee with a band of woven squares (an Andean unku, a huipil).
  'unku',
  // A cloth wrapped at the waist to the knee, the chest bare but for a broad collar (ancient Egypt's shendyt).
  'kilt',
  // A smock with an apron: a worker's, a farmer's, a merchant's.
  'apron',
] as const;
export type Top = (typeof TOPS)[number];

/** How a suit of armour is made: iron bands, one plate, mail, or small scales. */
export const ARMOUR_STYLES = ['bands', 'plate', 'mail', 'scales'] as const;
export type ArmourStyle = (typeof ARMOUR_STYLES)[number];

export const HEADWEAR = [
  'none',
  'crested-helmet',
  'conical-helmet',
  'round-helmet',
  'turban',
  'turban-helmet',
  'keffiyeh',
  'crown',
  'hood',
  'wig',
  'bicorne',
  'tricorne',
  'top-hat',
  'bowler',
  'kepi',
  'pickelhaube',
  'fez',
  'straw-hat',
  'headscarf',
  'nemes',
  'headband',
  'beret',
  'flat-cap',
  'fedora',
  'army-helmet',
  'hard-hat',
  'fur-hat',
  'kufi',
  'gat',
  'morion',
  'cap',
] as const;
export type Headwear = (typeof HEADWEAR)[number];

/** What a character holds in a hand. Weapons are costume: no one is ever shown hurt. */
export const PROPS = [
  'none',
  'spear',
  'sword',
  'curved-sword',
  'axe',
  'bow',
  'scroll',
  'book',
  'flag',
  'staff',
  'sceptre',
  'rifle',
  'telescope',
  'quill',
  'basket',
  'hammer',
  'lantern',
  'pouch',
] as const;
export type Prop = (typeof PROPS)[number];

/** A shield, carried on the other arm. */
export const SHIELDS = [
  'none',
  'round',
  'scutum',
  'kite',
  'heater',
  'oval',
] as const;
export type Shield = (typeof SHIELDS)[number];

export const HAIR_STYLES = [
  'short',
  'cropped',
  'curly',
  'long',
  'bun',
  'ponytail',
  'braids',
  'afro',
  'bald',
  'balding',
  'tonsure',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const FACIAL_HAIR = [
  'none',
  'stubble',
  'moustache',
  'beard',
  'long-beard',
] as const;
export type FacialHair = (typeof FACIAL_HAIR)[number];

export const AGES = ['child', 'adult', 'elder'] as const;
export type Age = (typeof AGES)[number];

export const BUILDS = ['slim', 'average', 'broad'] as const;
export type BuildKind = (typeof BUILDS)[number];

/** What is on the feet. */
export type Feet = 'sandals' | 'shoes' | 'boots' | 'bare';

// ── Colours ───────────────────────────────────────────────────────────────

/** Cloth by name: the reference's natural colours, a little warmer than flat primaries. */
export const CLOTH = {
  red: '#c9463d',
  crimson: '#a8322f',
  orange: '#e0893a',
  yellow: '#efc24a',
  gold: '#e3b23c',
  green: '#4f9a52',
  olive: '#7c7c3f',
  teal: '#2f9188',
  blue: '#3f74c0',
  navy: '#2d3f6b',
  purple: '#6e4ba3',
  pink: '#e38aa8',
  brown: '#8b5a3c',
  tan: '#c49a6c',
  beige: '#e2d2ae',
  cream: '#f1e8d2',
  white: '#f6f4ee',
  grey: '#8e9097',
  steel: '#a9b1b9',
  bronze: '#c08a45',
  black: '#35302f',
} as const satisfies Readonly<Record<string, string>>;
export type Cloth = keyof typeof CLOTH;
export const CLOTH_NAMES = Object.keys(CLOTH);

/** Skin tones, lightest first (the kit's ten). */
export const SKIN = [
  '#f9e1cf',
  '#f1cdb0',
  '#e6b893',
  '#d6a07a',
  '#c28a61',
  '#a86f49',
  '#8c5a3b',
  '#704731',
  '#553524',
  '#3f291d',
] as const;

export const HAIR_COLOURS: Readonly<Record<string, string>> = {
  black: '#2b2324',
  'dark brown': '#4a3226',
  brown: '#7a4f33',
  auburn: '#9c4a2a',
  red: '#c65a31',
  blonde: '#e2b75d',
  grey: '#a9a6ab',
  white: '#eeece8',
};

// ── What the drawing is given ─────────────────────────────────────────────

/** How a character looks: their body and face. */
export interface Looks {
  age: Age;
  build: BuildKind;
  /** A skin colour (one of SKIN). */
  skin: string;
  hair: HairStyle;
  hairColour: string;
  facial: FacialHair;
  glasses: boolean;
}

/** What a character wears and carries. Colours are hex. */
export interface Outfit {
  top: Top;
  armour: ArmourStyle;
  /** The garment's colour, its trim's, the legs' (trousers or hose), and an accent (a belt, a sash, a band). */
  main: string;
  trim: string;
  legs: string;
  accent: string;
  /** Legs bare below the hem, or in trousers. */
  trousers: boolean;
  feet: Feet;
  head: Headwear;
  /** The headwear's colour: a turban's cloth, a helmet's crest, a hat's felt. */
  headColour: string;
  /** A checked keffiyeh, a crest worn across (a centurion's), a striped nemes. */
  headPattern: boolean;
  /** A cloak behind, in its colour; null for none. */
  cape: string | null;
  shield: Shield;
  /** The shield's face colour: the side's. */
  shieldColour: string;
  prop: Prop;
  /** A sash across the chest, medals, a necklace: worn over the garment. */
  sash: boolean;
  medals: boolean;
  necklace: boolean;
}

// ── Reading words ─────────────────────────────────────────────────────────

const lower = (said: unknown): string =>
  (Array.isArray(said) ? said.join(', ') : typeof said === 'string' ? said : '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/gu, '-')
    .replace(/\s+/g, ' ')
    .trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a phrase is in some words, as whole words: its index, or -1. */
function at(text: string, phrase: string): number {
  const m = new RegExp(
    `(?:^|[^a-z0-9])(${escape(phrase)})(?![a-z0-9])`,
    'u',
  ).exec(text);
  return m ? m.index + m[0].length - m[1].length : -1;
}

/** The first of some phrases in the words (the earliest, the longest of those starting together), with the list's name for it. */
function first(
  text: string,
  phrases: readonly (readonly [string, string])[],
): { name: string; index: number } | null {
  let best: { name: string; index: number; length: number } | null = null;
  for (const [phrase, name] of phrases) {
    const i = at(text, phrase);
    if (i < 0) continue;
    if (
      !best ||
      i < best.index ||
      (i === best.index && phrase.length > best.length)
    )
      best = { name, index: i, length: phrase.length };
  }
  return best ? { name: best.name, index: best.index } : null;
}

/** A list's names and their other names, as phrases. */
const phrases = (
  names: readonly string[],
  others: Readonly<Record<string, string>> = {},
): [string, string][] => [
  ...names.map((n): [string, string] => [n.replace(/-/g, ' '), n]),
  ...names.map((n): [string, string] => [n, n]),
  ...Object.entries(others).filter(([, n]) => names.includes(n)),
];

/** Other names for the garments, as notes and models write them (ported from scene-wardrobe's WARDROBE_WORDS). */
const TOP_WORDS: Readonly<Record<string, string>> = {
  chiton: 'tunic',
  himation: 'toga',
  pallium: 'toga',
  stola: 'dress',
  kente: 'toga',
  'kente cloth': 'toga',
  sari: 'toga',
  saree: 'toga',
  shuka: 'toga',
  thobe: 'robe',
  thawb: 'robe',
  dishdasha: 'robe',
  kandura: 'robe',
  jalabiya: 'robe',
  jellabiya: 'robe',
  galabeya: 'robe',
  djellaba: 'robe',
  jellaba: 'robe',
  abaya: 'robe',
  kaftan: 'robe',
  caftan: 'robe',
  kanzu: 'robe',
  boubou: 'wide-robe',
  'grand boubou': 'wide-robe',
  agbada: 'wide-robe',
  'babban riga': 'wide-robe',
  kimono: 'wide-robe',
  yukata: 'wide-robe',
  hanfu: 'wide-robe',
  'academic robe': 'wide-robe',
  'judge robe': 'wide-robe',
  "judge's robe": 'wide-robe',
  'scholar robe': 'wide-robe',
  habit: 'robe',
  "monk's habit": 'robe',
  cassock: 'robe',
  deel: 'robe',
  gown: 'gown',
  'royal robe': 'gown',
  'coronation robe': 'gown',
  'ermine robe': 'gown',
  ermine: 'gown',
  'ermine cloak': 'gown',
  'royal cloak': 'gown',
  'lorica segmentata': 'armour',
  lorica: 'armour',
  'banded armour': 'armour',
  'banded armor': 'armour',
  'segmented armour': 'armour',
  'segmented armor': 'armour',
  'chain mail': 'armour',
  chainmail: 'armour',
  'mail shirt': 'armour',
  hauberk: 'armour',
  byrnie: 'armour',
  mail: 'armour',
  'scale armour': 'armour',
  'scale armor': 'armour',
  lamellar: 'armour',
  breastplate: 'armour',
  cuirass: 'armour',
  armor: 'armour',
  'plate armour': 'armour',
  'plate armor': 'armour',
  'frock coat': 'coat',
  'tail coat': 'coat',
  tailcoat: 'coat',
  'morning coat': 'coat',
  justaucorps: 'coat',
  doublet: 'uniform',
  'military uniform': 'uniform',
  'army uniform': 'uniform',
  "officer's uniform": 'uniform',
  'officer uniform': 'uniform',
  'police uniform': 'uniform',
  'naval uniform': 'uniform',
  'military coat': 'uniform',
  'dress uniform': 'uniform',
  tunic: 'tunic',
  'lounge suit': 'suit',
  'business suit': 'suit',
  'three-piece suit': 'suit',
  tuxedo: 'suit',
  blazer: 'suit',
  jacket: 'suit',
  't-shirt': 'shirt',
  tshirt: 'shirt',
  blouse: 'shirt',
  kurta: 'unku',
  dashiki: 'unku',
  huipil: 'unku',
  unku: 'unku',
  poncho: 'unku',
  sherwani: 'coat',
  achkan: 'coat',
  qipao: 'dress',
  cheongsam: 'dress',
  hanbok: 'dress',
  'ball gown': 'dress',
  crinoline: 'dress',
  'crinoline dress': 'dress',
  frock: 'dress',
  shendyt: 'kilt',
  loincloth: 'kilt',
  kilt: 'kilt',
  smock: 'apron',
  overalls: 'apron',
  dungarees: 'apron',
};

const HEAD_WORDS: Readonly<Record<string, string>> = {
  galea: 'crested-helmet',
  'roman helmet': 'crested-helmet',
  'plumed helmet': 'crested-helmet',
  'crested helmet': 'crested-helmet',
  'corinthian helmet': 'crested-helmet',
  'nasal helmet': 'conical-helmet',
  'norman helmet': 'conical-helmet',
  'viking helmet': 'conical-helmet',
  spangenhelm: 'conical-helmet',
  'iron helmet': 'round-helmet',
  'bronze helmet': 'round-helmet',
  helmet: 'round-helmet',
  'spiked helmet': 'pickelhaube',
  'steel helmet': 'army-helmet',
  'tin hat': 'army-helmet',
  'brodie helmet': 'army-helmet',
  turban: 'turban',
  pagri: 'turban',
  dastar: 'turban',
  'turban helmet': 'turban-helmet',
  keffiyeh: 'keffiyeh',
  kufiya: 'keffiyeh',
  kaffiyeh: 'keffiyeh',
  ghutra: 'keffiyeh',
  shemagh: 'keffiyeh',
  'head cloth': 'keffiyeh',
  headdress: 'keffiyeh',
  crown: 'crown',
  diadem: 'crown',
  tiara: 'crown',
  hood: 'hood',
  cowl: 'hood',
  wig: 'wig',
  'powdered wig': 'wig',
  periwig: 'wig',
  'court wig': 'wig',
  bicorne: 'bicorne',
  bicorn: 'bicorne',
  'cocked hat': 'tricorne',
  tricorn: 'tricorne',
  tricorne: 'tricorne',
  'top hat': 'top-hat',
  'stovepipe hat': 'top-hat',
  bowler: 'bowler',
  'bowler hat': 'bowler',
  'derby hat': 'bowler',
  kepi: 'kepi',
  'peaked cap': 'kepi',
  "officer's cap": 'kepi',
  'officer cap': 'kepi',
  'police cap': 'kepi',
  pickelhaube: 'pickelhaube',
  shako: 'kepi',
  fez: 'fez',
  tarboosh: 'fez',
  'straw hat': 'straw-hat',
  'sun hat': 'straw-hat',
  'wide-brimmed hat': 'straw-hat',
  sombrero: 'straw-hat',
  headscarf: 'headscarf',
  'head scarf': 'headscarf',
  hijab: 'headscarf',
  veil: 'headscarf',
  mantle: 'headscarf',
  nemes: 'nemes',
  'pharaoh headdress': 'nemes',
  headband: 'headband',
  llautu: 'headband',
  mascapaicha: 'headband',
  beret: 'beret',
  'flat cap': 'flat-cap',
  'cloth cap': 'flat-cap',
  'newsboy cap': 'flat-cap',
  fedora: 'fedora',
  trilby: 'fedora',
  'army helmet': 'army-helmet',
  'hard hat': 'hard-hat',
  'fur hat': 'fur-hat',
  ushanka: 'fur-hat',
  papakha: 'fur-hat',
  kufi: 'kufi',
  taqiyah: 'kufi',
  fila: 'kufi',
  'folded cap': 'kufi',
  gat: 'gat',
  morion: 'morion',
  'conquistador helmet': 'morion',
  cap: 'cap',
  'baseball cap': 'cap',
};

const PROP_WORDS: Readonly<Record<string, string>> = {
  pilum: 'spear',
  javelin: 'spear',
  lance: 'spear',
  pike: 'spear',
  spear: 'spear',
  gladius: 'sword',
  sword: 'sword',
  longsword: 'sword',
  sabre: 'curved-sword',
  saber: 'curved-sword',
  scimitar: 'curved-sword',
  shamshir: 'curved-sword',
  'curved sword': 'curved-sword',
  katana: 'curved-sword',
  axe: 'axe',
  'battle axe': 'axe',
  bow: 'bow',
  'bow and arrow': 'bow',
  scroll: 'scroll',
  map: 'scroll',
  charter: 'scroll',
  decree: 'scroll',
  letter: 'scroll',
  book: 'book',
  bible: 'book',
  ledger: 'book',
  flag: 'flag',
  banner: 'flag',
  standard: 'flag',
  staff: 'staff',
  crook: 'staff',
  'walking stick': 'staff',
  cane: 'staff',
  sceptre: 'sceptre',
  scepter: 'sceptre',
  rifle: 'rifle',
  musket: 'rifle',
  gun: 'rifle',
  telescope: 'telescope',
  spyglass: 'telescope',
  quill: 'quill',
  pen: 'quill',
  basket: 'basket',
  hammer: 'hammer',
  lantern: 'lantern',
  lamp: 'lantern',
  pouch: 'pouch',
  purse: 'pouch',
  'coin purse': 'pouch',
  'bag of coins': 'pouch',
};

const SHIELD_WORDS: Readonly<Record<string, string>> = {
  scutum: 'scutum',
  'rectangular shield': 'scutum',
  'curved shield': 'scutum',
  'round shield': 'round',
  hoplon: 'round',
  aspis: 'round',
  buckler: 'round',
  'kite shield': 'kite',
  'heater shield': 'heater',
  'oval shield': 'oval',
  'hide shield': 'oval',
  isihlangu: 'oval',
  shield: 'round',
};

const TOP_PHRASES = phrases(TOPS, TOP_WORDS);
const HEAD_PHRASES = phrases(
  HEADWEAR.filter((h) => h !== 'none'),
  HEAD_WORDS,
);
const PROP_PHRASES = phrases(
  PROPS.filter((p) => p !== 'none'),
  PROP_WORDS,
);
const SHIELD_PHRASES = phrases(
  SHIELDS.filter((s) => s !== 'none'),
  SHIELD_WORDS,
);
const COLOUR_PHRASES = phrases(CLOTH_NAMES, {
  gray: 'grey',
  silver: 'steel',
  iron: 'steel',
  metal: 'steel',
  charcoal: 'black',
  dark: 'black',
  'dark blue': 'navy',
  'navy blue': 'navy',
  'royal blue': 'blue',
  'sky blue': 'blue',
  'light blue': 'blue',
  khaki: 'tan',
  sand: 'beige',
  ivory: 'cream',
  'off-white': 'cream',
  ochre: 'orange',
  golden: 'gold',
  maroon: 'crimson',
  scarlet: 'red',
  burgundy: 'crimson',
  indigo: 'navy',
  violet: 'purple',
  lilac: 'purple',
  emerald: 'green',
  turquoise: 'teal',
  'blue-grey': 'grey',
  saffron: 'orange',
  undyed: 'beige',
  linen: 'cream',
});

/** A cloth colour named in some words, or null. */
export function clothNamed(said: unknown): string | null {
  const m = first(lower(said), COLOUR_PHRASES);
  return m ? CLOTH[m.name as Cloth] : null;
}

/** The colour said just before a phrase ("red tunic"): within its clause. */
function colourBefore(text: string, index: number): string | null {
  const before = text.slice(Math.max(0, index - 24), index);
  const clause = before.split(/[,;]| and | with /u).pop() ?? '';
  const m = first(clause, COLOUR_PHRASES);
  return m ? CLOTH[m.name as Cloth] : null;
}

/** How a culture or a kind of character is dressed: a few things, applied before the words' own garments. */
interface Look {
  top?: Top;
  armour?: ArmourStyle;
  main?: Cloth;
  trim?: Cloth;
  legs?: Cloth;
  accent?: Cloth;
  trousers?: boolean;
  feet?: Feet;
  head?: Headwear;
  headColour?: Cloth;
  headPattern?: boolean;
  cape?: Cloth | 'side';
  shield?: Shield;
  prop?: Prop;
  sash?: boolean;
  medals?: boolean;
  necklace?: boolean;
  facial?: FacialHair;
  hair?: HairStyle;
  role?: Role;
}

/**
 * Kinds of character the words may name, the more particular first: a
 * dress worn by a people at a time, read only where it is named. Each is
 * what the reference's characters wear (a legionary's banded armour and
 * crested helmet, a horseman's keffiyeh and robe), simply and as worn.
 */
const KINDS: readonly (readonly [RegExp, Look])[] = [
  [
    /\bcenturions?\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'bands',
      main: 'red',
      head: 'crested-helmet',
      headColour: 'red',
      headPattern: true,
      cape: 'red',
      prop: 'staff',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:roman soldiers?|legionar(?:y|ies)|legions?|legionnaires?|roman army|roman troops)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'bands',
      main: 'red',
      head: 'crested-helmet',
      headColour: 'red',
      shield: 'scutum',
      prop: 'spear',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:hoplites?|spartans?|greek soldiers?)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'plate',
      main: 'red',
      head: 'crested-helmet',
      headColour: 'red',
      shield: 'round',
      prop: 'spear',
      feet: 'sandals',
      cape: 'red',
    },
  ],
  [
    /\b(?:senators?|roman citizens?|romans?)\b/u,
    { top: 'toga', main: 'white', accent: 'purple', feet: 'sandals' },
  ],
  [
    /\b(?:philosophers?|ancient greeks?|greeks?|athenians?)\b/u,
    { top: 'toga', main: 'white', accent: 'blue', feet: 'sandals' },
  ],
  [
    /\b(?:pharaohs?)\b/u,
    {
      role: 'ruler',
      top: 'kilt',
      main: 'white',
      accent: 'gold',
      head: 'nemes',
      headColour: 'blue',
      headPattern: true,
      necklace: true,
      prop: 'sceptre',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:ancient egyptians?|egyptians? of the old|scribes?)\b/u,
    {
      top: 'kilt',
      main: 'white',
      accent: 'gold',
      necklace: true,
      feet: 'sandals',
      hair: 'short',
    },
  ],
  [
    /\b(?:vikings?|norsemen|norse|varangians?)\b/u,
    {
      role: 'soldier',
      top: 'tunic',
      main: 'blue',
      legs: 'brown',
      trousers: true,
      feet: 'boots',
      head: 'conical-helmet',
      shield: 'round',
      prop: 'axe',
      facial: 'beard',
    },
  ],
  [
    /\b(?:knights?|crusaders?|templars?|men-at-arms|man-at-arms)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'mail',
      trousers: true,
      legs: 'steel',
      feet: 'boots',
      head: 'round-helmet',
      shield: 'heater',
      prop: 'sword',
      cape: 'side',
    },
  ],
  [
    /\b(?:normans?)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'mail',
      trousers: true,
      legs: 'brown',
      feet: 'boots',
      head: 'conical-helmet',
      shield: 'kite',
      prop: 'spear',
    },
  ],
  [
    /\b(?:mamluks?|mamelukes?)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'scales',
      main: 'steel',
      trim: 'red',
      head: 'turban-helmet',
      headColour: 'white',
      prop: 'spear',
      shield: 'round',
      trousers: true,
      legs: 'red',
      feet: 'boots',
      facial: 'beard',
    },
  ],
  [
    /\b(?:arab horsem[ae]n|bedouins?|arab warriors?|arab riders?|arabs?|arabians?)\b/u,
    {
      top: 'robe',
      main: 'brown',
      head: 'keffiyeh',
      headColour: 'white',
      prop: 'curved-sword',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:umayyad|abbasid|rashidun|caliphate)\b.*\b(?:soldiers?|army|armies|troops|warriors?)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'mail',
      main: 'steel',
      head: 'turban-helmet',
      headColour: 'white',
      shield: 'round',
      prop: 'curved-sword',
      trousers: true,
      feet: 'boots',
      facial: 'beard',
    },
  ],
  [
    /\b(?:moors?|moorish)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'mail',
      main: 'steel',
      trim: 'red',
      head: 'turban',
      headColour: 'white',
      shield: 'round',
      prop: 'curved-sword',
      cape: 'red',
      trousers: true,
      feet: 'boots',
    },
  ],
  [
    /\b(?:mongols?|turkic|steppe (?:riders?|warriors?|nomads?)|huns?)\b/u,
    {
      role: 'soldier',
      top: 'robe',
      main: 'blue',
      trim: 'brown',
      head: 'fur-hat',
      headColour: 'brown',
      prop: 'bow',
      trousers: true,
      feet: 'boots',
    },
  ],
  [
    /\b(?:samurai)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'scales',
      main: 'crimson',
      trim: 'black',
      head: 'round-helmet',
      prop: 'curved-sword',
      trousers: true,
      legs: 'navy',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:incas?|inka|quechua)\b/u,
    {
      top: 'unku',
      main: 'red',
      trim: 'gold',
      accent: 'yellow',
      head: 'headband',
      headColour: 'red',
      cape: 'brown',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:monks?|friars?|abbots?)\b/u,
    {
      role: 'priest',
      top: 'robe',
      main: 'brown',
      accent: 'beige',
      head: 'none',
      hair: 'tonsure',
      prop: 'book',
      feet: 'sandals',
    },
  ],
  [
    /\b(?:conquistadors?|conquistadores)\b/u,
    {
      role: 'soldier',
      top: 'armour',
      armour: 'plate',
      main: 'steel',
      trim: 'red',
      head: 'morion',
      prop: 'sword',
      trousers: true,
      legs: 'red',
      feet: 'boots',
      facial: 'beard',
    },
  ],
  [
    /\b(?:napoleon(?:ic)?|grande arm[ée]e)\b/u,
    {
      role: 'soldier',
      top: 'uniform',
      main: 'navy',
      trim: 'gold',
      legs: 'white',
      trousers: true,
      feet: 'boots',
      head: 'bicorne',
      headColour: 'black',
      prop: 'sword',
    },
  ],
  [
    /\b(?:redcoats?)\b/u,
    {
      role: 'soldier',
      top: 'uniform',
      main: 'red',
      trim: 'white',
      legs: 'white',
      trousers: true,
      feet: 'boots',
      head: 'tricorne',
      headColour: 'black',
      prop: 'rifle',
    },
  ],
  [
    /\b(?:pirates?|buccaneers?|privateers?)\b/u,
    {
      top: 'coat',
      main: 'crimson',
      trim: 'gold',
      legs: 'brown',
      trousers: true,
      feet: 'boots',
      head: 'tricorne',
      headColour: 'black',
      prop: 'curved-sword',
    },
  ],
  [
    /\b(?:kings?|queens?|emperors?|empress(?:es)?|monarchs?|sovereigns?|tsars?|czars?|sultans?|shahs?|khans?)\b/u,
    {
      role: 'ruler',
      top: 'gown',
      main: 'crimson',
      trim: 'white',
      head: 'crown',
      headColour: 'gold',
      prop: 'sceptre',
    },
  ],
  [
    /\b(?:officers?|generals?|colonels?|captains?|admirals?|commanders?)\b/u,
    {
      role: 'soldier',
      top: 'uniform',
      main: 'navy',
      trim: 'gold',
      legs: 'navy',
      trousers: true,
      feet: 'boots',
      prop: 'sword',
      medals: true,
      facial: 'moustache',
    },
  ],
  [/\b(?:explorers?|navigators?|voyagers?)\b/u, { role: 'explorer' }],
  [/\b(?:sailors?|seam[ae]n|mariners?|crew)\b/u, { role: 'sailor' }],
  [/\b(?:merchants?|traders?|shopkeepers?|vendors?)\b/u, { role: 'merchant' }],
  [
    /\b(?:farmers?|peasants?|serfs?|herders?|shepherds?|villagers?)\b/u,
    { role: 'farmer' },
  ],
  [
    /\b(?:scholars?|scientists?|scribes?|teachers?|astronomers?|mathematicians?|inventors?|writers?)\b/u,
    { role: 'scholar' },
  ],
  [
    /\b(?:workers?|labourers?|laborers?|miners?|builders?|factory)\b/u,
    { role: 'worker' },
  ],
  [
    /\b(?:priests?|clergy|clerics?|imams?|rabbis?|bishops?|shamans?)\b/u,
    { role: 'priest' },
  ],
  [
    /\b(?:soldiers?|troops|warriors?|army|armies|infantry|guards?|militia|fighters?)\b/u,
    { role: 'soldier' },
  ],
];

/** What a role wears in an era when the words say nothing more: plain, and no one region's. */
function roleLook(role: Role, era: EraId): Look {
  const ancient = era === 'ancient' || era === 'medieval';
  const early = era === '1500-1800';
  const nineteenth = era === '1800-1900';
  const modern = !ancient && !early && !nineteenth;
  switch (role) {
    case 'soldier':
      if (era === 'ancient')
        return {
          top: 'armour',
          armour: 'bands',
          head: 'round-helmet',
          shield: 'round',
          prop: 'spear',
          feet: 'sandals',
        };
      if (era === 'medieval')
        return {
          top: 'armour',
          armour: 'mail',
          head: 'round-helmet',
          shield: 'heater',
          prop: 'spear',
          trousers: true,
          feet: 'boots',
        };
      if (early)
        return {
          top: 'uniform',
          head: 'tricorne',
          headColour: 'black',
          prop: 'rifle',
          trousers: true,
          legs: 'white',
          feet: 'boots',
        };
      if (nineteenth)
        return {
          top: 'uniform',
          head: 'kepi',
          prop: 'rifle',
          trousers: true,
          feet: 'boots',
        };
      return {
        top: 'uniform',
        main: 'olive',
        legs: 'olive',
        head: 'army-helmet',
        headColour: 'olive',
        prop: 'rifle',
        trousers: true,
        feet: 'boots',
      };
    case 'ruler':
      return modern
        ? { top: 'suit', main: 'navy', sash: true, medals: true }
        : {
            top: 'gown',
            main: 'crimson',
            trim: 'white',
            head: 'crown',
            headColour: 'gold',
            prop: 'sceptre',
          };
    case 'merchant':
      return ancient
        ? { top: 'robe', main: 'teal', prop: 'pouch', feet: 'sandals' }
        : early || nineteenth
          ? {
              top: 'coat',
              main: 'brown',
              trousers: true,
              prop: 'pouch',
              head: early ? 'tricorne' : 'top-hat',
              headColour: 'black',
            }
          : { top: 'suit', prop: 'pouch' };
    case 'scholar':
      return ancient
        ? { top: 'wide-robe', main: 'blue', prop: 'scroll', feet: 'sandals' }
        : early || nineteenth
          ? { top: 'coat', main: 'black', trousers: true, prop: 'book' }
          : { top: 'suit', prop: 'book' };
    case 'farmer':
      return ancient
        ? { top: 'tunic', main: 'beige', feet: 'bare', prop: 'basket' }
        : modern
          ? { top: 'apron', main: 'blue', trousers: true, head: 'straw-hat' }
          : {
              top: 'apron',
              main: 'beige',
              trousers: true,
              head: 'straw-hat',
              prop: 'basket',
            };
    case 'sailor':
      return ancient
        ? { top: 'tunic', main: 'blue', feet: 'bare' }
        : {
            top: 'shirt',
            main: 'white',
            trousers: true,
            legs: 'navy',
            head: early ? 'tricorne' : 'cap',
            headColour: 'navy',
          };
    case 'priest':
      return {
        top: 'robe',
        main: ancient ? 'white' : 'black',
        prop: 'book',
        feet: 'shoes',
      };
    case 'worker':
      return ancient
        ? { top: 'tunic', main: 'tan', prop: 'hammer', feet: 'sandals' }
        : modern
          ? {
              top: 'shirt',
              main: 'blue',
              trousers: true,
              head: era === 'today' ? 'hard-hat' : 'flat-cap',
              prop: 'hammer',
            }
          : {
              top: 'apron',
              main: 'grey',
              trousers: true,
              head: 'flat-cap',
              prop: 'hammer',
            };
    case 'explorer':
      return ancient
        ? { top: 'tunic', cape: 'brown', prop: 'staff', feet: 'sandals' }
        : early
          ? {
              top: 'uniform',
              main: 'crimson',
              trousers: true,
              cape: 'black',
              head: 'beret',
              headColour: 'black',
              prop: 'telescope',
            }
          : { top: 'coat', main: 'tan', trousers: true, prop: 'telescope' };
    case 'official':
      return ancient
        ? { top: 'wide-robe', main: 'purple', prop: 'scroll' }
        : modern
          ? { top: 'suit', prop: 'scroll' }
          : { top: 'coat', main: 'black', trousers: true, prop: 'scroll' };
    default:
      return era === 'ancient'
        ? { top: 'tunic', feet: 'sandals' }
        : era === 'medieval'
          ? { top: 'tunic', trousers: true, feet: 'shoes' }
          : early || nineteenth
            ? { top: 'coat', trousers: true }
            : era === 'today' || era === '1975-2000'
              ? { top: 'shirt', trousers: true }
              : { top: 'suit' };
  }
}

/** The colours a role's own clothes are chosen from, by seed: the earthy ones of the reference. */
const ROLE_COLOURS: Readonly<Record<Role, readonly Cloth[]>> = {
  person: ['beige', 'tan', 'blue', 'green', 'brown', 'red', 'teal', 'cream'],
  soldier: ['red', 'crimson', 'navy', 'brown', 'tan', 'olive', 'blue'],
  ruler: ['crimson', 'purple', 'navy', 'blue'],
  merchant: ['teal', 'orange', 'brown', 'green', 'gold', 'blue'],
  scholar: ['blue', 'navy', 'black', 'brown', 'cream'],
  farmer: ['beige', 'tan', 'brown', 'olive', 'cream'],
  sailor: ['navy', 'blue', 'white', 'grey'],
  priest: ['black', 'brown', 'white', 'cream'],
  worker: ['grey', 'blue', 'brown', 'tan'],
  explorer: ['tan', 'brown', 'crimson', 'olive'],
  official: ['black', 'navy', 'purple', 'grey'],
};

/** The colours a hat is chosen from when the words leave it open, by its kind. */
const HEAD_COLOURS: Partial<Record<Headwear, readonly Cloth[]>> = {
  turban: ['white', 'cream', 'crimson', 'navy', 'gold'],
  'turban-helmet': ['white', 'cream'],
  keffiyeh: ['white', 'cream'],
  headscarf: ['cream', 'blue', 'crimson', 'green', 'gold'],
  hood: ['brown', 'grey', 'navy'],
  'crested-helmet': ['red', 'crimson'],
  crown: ['gold'],
  fez: ['crimson'],
  kufi: ['white', 'cream', 'navy', 'crimson'],
  beret: ['black', 'navy', 'crimson'],
  'flat-cap': ['grey', 'brown', 'tan'],
  cap: ['navy', 'red', 'grey'],
  'top-hat': ['black'],
  bowler: ['black', 'brown'],
  fedora: ['brown', 'grey', 'black'],
  bicorne: ['black'],
  tricorne: ['black', 'brown'],
  kepi: ['navy', 'crimson', 'olive'],
  'fur-hat': ['brown', 'grey'],
  headband: ['red', 'crimson', 'gold'],
  nemes: ['blue'],
};

/** A seeded pick of a list. */
type Pick = <T>(list: readonly T[]) => T;

/**
 * A character's outfit from what is said of them: the role and era for
 * what is plain, a kind of character the words name (a legionary, a
 * Viking, a monk), then each garment, hat, prop and shield the words
 * name, with its colour where one is said beside it. `side` is the
 * colour of their side (a shield's face, a cape, an accent).
 */
export function outfitOf(
  said: unknown,
  options: {
    role: Role;
    era: EraId;
    side: string;
    pick: Pick;
    /** The side's colour is worn as the main garment (a group's tunics), or only as an accent. */
    sideMain?: boolean;
  },
): { outfit: Outfit; role: Role; facial?: FacialHair; hair?: HairStyle } {
  const text = lower(said);
  const kind = KINDS.find(([re]) => re.test(text))?.[1] ?? {};
  const role: Role =
    options.role !== 'person' ? options.role : (kind.role ?? 'person');
  const look: Look = { ...roleLook(role, options.era), ...kind };
  const pick = options.pick;
  const own = (name: Cloth | undefined, fallback: () => string): string =>
    name ? CLOTH[name] : fallback();
  const main = own(look.main, () => CLOTH[pick(ROLE_COLOURS[role])]);
  const outfit: Outfit = {
    top: look.top ?? 'tunic',
    armour: look.armour ?? 'bands',
    main,
    trim: own(look.trim, () => CLOTH[pick<Cloth>(['gold', 'cream', 'brown'])]),
    legs: own(
      look.legs,
      () => CLOTH[pick<Cloth>(['brown', 'navy', 'grey', 'black', 'tan'])],
    ),
    accent: own(
      look.accent,
      () => CLOTH[pick<Cloth>(['brown', 'black', 'gold'])],
    ),
    trousers: look.trousers ?? false,
    feet: look.feet ?? 'shoes',
    head: look.head ?? 'none',
    headColour: own(
      look.headColour,
      () =>
        CLOTH[
          pick<Cloth>(
            HEAD_COLOURS[look.head ?? 'none'] ?? ['brown', 'black', 'beige'],
          )
        ],
    ),
    headPattern: look.headPattern ?? false,
    cape:
      look.cape === 'side' ? options.side : look.cape ? CLOTH[look.cape] : null,
    shield: look.shield ?? 'none',
    shieldColour: options.side,
    prop: look.prop ?? 'none',
    sash: look.sash ?? false,
    medals: look.medals ?? false,
    necklace: look.necklace ?? false,
  };
  // The words' own garments, each with its colour.
  const top = first(text, TOP_PHRASES);
  if (top) {
    // A soldier's "blue coat" is his uniform's colour, not another garment.
    const kept = look.top === 'uniform' && ['coat', 'suit'].includes(top.name);
    if (!kept) outfit.top = top.name as Top;
    const c = colourBefore(text, top.index);
    if (c) outfit.main = c;
    if (/\b(?:mail|hauberk|byrnie)\b/u.test(text)) outfit.armour = 'mail';
    else if (/\b(?:scale|lamellar)\b/u.test(text)) outfit.armour = 'scales';
    else if (/\b(?:breastplate|cuirass|plate)\b/u.test(text))
      outfit.armour = 'plate';
    else if (/\b(?:lorica|band|segment)/u.test(text)) outfit.armour = 'bands';
  }
  const head = first(text, HEAD_PHRASES);
  if (head) {
    const was = outfit.head;
    outfit.head = head.name as Headwear;
    const c = colourBefore(text, head.index);
    if (c) outfit.headColour = c;
    // Another hat than its kind's, its colour unsaid: one that hat comes in.
    else if (outfit.head !== was && !look.headColour)
      outfit.headColour =
        CLOTH[
          pick<Cloth>(HEAD_COLOURS[outfit.head] ?? ['brown', 'black', 'beige'])
        ];
    if (
      /\b(?:checked|chequered|checkered|red-and-white|red and white)\b/u.test(
        text,
      )
    )
      outfit.headPattern = true;
  }
  const prop = first(text, PROP_PHRASES);
  if (prop) outfit.prop = prop.name as Prop;
  const shield = first(text, SHIELD_PHRASES);
  if (shield) {
    outfit.shield = shield.name as Shield;
    const c = colourBefore(text, shield.index);
    if (c) outfit.shieldColour = c;
  }
  // A colour said of trousers, a cloak or a cape.
  const legsAt = /\b(?:trousers|breeches|hose|leggings|pants)\b/u.exec(text);
  if (legsAt) {
    outfit.trousers = true;
    const c = colourBefore(text, legsAt.index);
    if (c) outfit.legs = c;
  }
  const capeAt = /\b(?:cloak|cape|mantle)\b/u.exec(text);
  if (capeAt) outfit.cape = colourBefore(text, capeAt.index) ?? options.side;
  if (/\bboots\b/u.test(text)) outfit.feet = 'boots';
  else if (/\bsandals?\b/u.test(text)) outfit.feet = 'sandals';
  else if (/\bbarefoot|bare feet\b/u.test(text)) outfit.feet = 'bare';
  if (/\bsash\b/u.test(text)) outfit.sash = true;
  if (/\bmedals?\b/u.test(text)) outfit.medals = true;
  if (/\b(?:necklace|collar of gold|gold collar|beads)\b/u.test(text))
    outfit.necklace = true;
  // The side's colour worn as the garment itself, where the words leave its colour open.
  if (options.sideMain && !(top && colourBefore(text, top.index)) && !look.main)
    outfit.main = options.side;
  // Long garments are worn with no trousers showing; a uniform or a coat with them.
  if (['robe', 'wide-robe', 'gown', 'dress'].includes(outfit.top))
    outfit.trousers = false;
  if (['uniform', 'coat', 'suit'].includes(outfit.top) && !look.trousers)
    outfit.trousers = true;
  return {
    outfit,
    role,
    ...(kind.facial ? { facial: kind.facial } : {}),
    ...(kind.hair ? { hair: kind.hair } : {}),
  };
}

// ── Reading a likeness (ported from scene-likeness) ───────────────────────

/** An age from words. */
export function ageOf(said: unknown): Age | null {
  const text = lower(said);
  const n = Number(/\b(\d{1,3})\s*(?:years?|yrs?|-year)/u.exec(text)?.[1]);
  if (Number.isFinite(n) && n > 0)
    return n < 14 ? 'child' : n < 60 ? 'adult' : 'elder';
  if (
    /\b(?:child|boy|girl|little|kid|young prince|young princess)\b/u.test(text)
  )
    return 'child';
  if (
    /\b(?:old|elderly|aged|elder|grey-haired|gray-haired|white-haired|white beard|in (?:his|her) (?:sixties|seventies|eighties))\b/u.test(
      text,
    )
  )
    return 'elder';
  return null;
}

/** A build from words. */
export function buildOf(said: unknown): BuildKind | null {
  const text = lower(said);
  if (/\b(?:slim|thin|lean|slender|gaunt|wiry|lanky|slight)\b/u.test(text))
    return 'slim';
  if (
    /\b(?:stout|heavy-set|heavyset|portly|burly|stocky|plump|rotund|broad|well-built|large|big|fat)\b/u.test(
      text,
    )
  )
    return 'broad';
  return null;
}

/** A skin tone (an index into SKIN) from words about skin; null where none is said. */
export function skinOf(said: unknown): number | null {
  const text = lower(said);
  if (!/\b(?:skin|skinned|complexion)\b/u.test(text)) return null;
  const scale: [RegExp, number][] = [
    [/\bvery (?:dark|deep)\b/u, 9],
    [/\b(?:deep brown|dark brown|ebony)\b/u, 8],
    [/\blight brown\b/u, 3],
    [/\b(?:very fair|very light|very pale)\b/u, 0],
    [/\bdark\b/u, 7],
    [/\b(?:brown|mid-brown)\b/u, 5],
    [/\b(?:olive|tan|tanned|medium|golden)\b/u, 4],
    [/\b(?:light|fair)\b/u, 1],
    [/\bpale\b/u, 0],
  ];
  return scale.find(([re]) => re.test(text))?.[1] ?? null;
}

/** Hair's style and colour from words that talk of hair. */
export function hairOf(said: unknown): {
  hair: HairStyle | null;
  colour: string | null;
} {
  const clauses = lower(said)
    .split(/[,;.]|\band\b|\bwith\b/u)
    .filter((c) =>
      /\b(?:hair|haired|bald|balding|receding|afro|braids|braided|plaits|cornrows|ponytail|bun|curls|curly|wavy|tonsure)\b/u.test(
        c,
      ),
    )
    .join(', ');
  const styles: [RegExp, HairStyle][] = [
    [/\btonsure\b/u, 'tonsure'],
    [/\b(?:bald|shaved head|shaven head)\b/u, 'bald'],
    [/\b(?:balding|receding|thinning|high forehead)\b/u, 'balding'],
    [/\b(?:braids|braided|plaits|cornrows|locs|dreadlocks)\b/u, 'braids'],
    [/\bafro\b/u, 'afro'],
    [/\bponytail\b/u, 'ponytail'],
    [/\bbun\b/u, 'bun'],
    [/\b(?:curly|curls|wavy)\b/u, 'curly'],
    [/\blong\b/u, 'long'],
    [/\b(?:cropped|close-cropped|buzz)\b/u, 'cropped'],
    [/\b(?:short|neat|parted|slicked)\b/u, 'short'],
  ];
  const colours: [RegExp, string][] = [
    [/\b(?:white|snow-white)\b/u, 'white'],
    [/\b(?:grey|gray|greying|graying|silver|salt-and-pepper)\b/u, 'grey'],
    [/\b(?:blonde|blond|fair)\b/u, 'blonde'],
    [/\bauburn\b/u, 'auburn'],
    [/\b(?:red|ginger)\b/u, 'red'],
    [/\bdark brown\b/u, 'dark brown'],
    [/\bbrown\b/u, 'brown'],
    [/\b(?:black|dark)\b/u, 'black'],
  ];
  return {
    hair: styles.find(([re]) => re.test(clauses))?.[1] ?? null,
    colour: colours.find(([re]) => re.test(clauses))?.[1] ?? null,
  };
}

/** Facial hair from words. */
export function facialOf(said: unknown): FacialHair | null {
  const text = lower(said);
  if (/\b(?:clean-shaven|clean shaven|beardless|no beard)\b/u.test(text))
    return 'none';
  if (
    /\b(?:long beard|long white beard|long grey beard|flowing beard)\b/u.test(
      text,
    )
  )
    return 'long-beard';
  if (
    /\b(?:beard|bearded|goatee|whiskers|sideburns|mutton ?chops)\b/u.test(text)
  )
    return 'beard';
  if (/\b(?:moustache|mustache|moustached|mustached)\b/u.test(text))
    return 'moustache';
  if (/\b(?:stubble|unshaven)\b/u.test(text)) return 'stubble';
  return null;
}

/** Glasses in the words. */
export const glassesIn = (said: unknown): boolean =>
  /\b(?:glasses|spectacles|specs|eyeglasses|monocle|pince-nez)\b/u.test(
    lower(said),
  );

/** Whether words speak of a woman or a girl, for hair the seed leaves open. */
export const womanIn = (said: unknown): boolean =>
  /\b(?:she|her|woman|women|girl|queen|empress|princess|lady|mother|wife|nun|priestess)\b/u.test(
    lower(said),
  );

/** An era id from a param that may be one. */
export const eraParam = (raw: unknown, fallback: EraId = 'today'): EraId =>
  (ERA_IDS as readonly string[]).includes(String(raw))
    ? (raw as EraId)
    : fallback;
