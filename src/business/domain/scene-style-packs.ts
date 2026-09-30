/**
 * Style packs (studio-scenery-plan §5.1): the look of a place's era and
 * region, as data. A pack decides what a set's buildings are made of
 * (their walls, roofs and windows, and how often each extra comes: an
 * awning, a balcony, a water tank), their proportions and detail, the
 * grounds and backdrops it uses, the scenery and clutter it offers the
 * painter, a small shift of the house palette (warmer for Egypt, cooler
 * for a city), its light, and the life about it.
 *
 * Everything here is data, to be retuned by eye against reference
 * cartoons without touching the builders: a pack's proportions, its
 * colours (each one of the house's own, tinted a little toward the
 * pack's), and its detail level.
 *
 * A place's pack is chosen by code from the story's world (its era,
 * region, culture, landscape and homes) by keyword rules; when they do
 * not decide it, the painter picks one from the list; and it is kept on
 * the set's layout, so every scene in the place agrees.
 */
import { CLOTH, COATS, KIT_EXTRAS, SET_COLOURS } from './scene-ink';
import type { StoryWorld } from './scene-story';

export const STYLE_PACK_IDS = [
  'ancient-near-east',
  'biblical-village',
  'west-african-town',
  'western-city',
  'modern-town',
  'village-farm',
  'nature',
] as const;
export type StylePackId = (typeof STYLE_PACK_IDS)[number];

/**
 * The packs of no one region: what a place is drawn in when the story's
 * world names none. A present-day place with nothing to say where it is
 * is a plain modern town (or a village, or out in nature), never one
 * region's streets by default.
 */
export const NEUTRAL_PACKS: readonly StylePackId[] = [
  'modern-town',
  'village-farm',
  'nature',
];

/** What a building's walls are made of. */
export const WALL_KINDS = [
  'mud brick',
  'plaster',
  'painted block',
  'brick',
  'clapboard',
  'glass',
  'stone',
] as const;
export type WallKind = (typeof WALL_KINDS)[number];
/** Its roof: flat behind a parapet, thatch, corrugated zinc, tiles, shingles, or a dome. */
export const ROOF_KINDS = [
  'flat',
  'thatch',
  'zinc',
  'tile',
  'shingle',
  'dome',
] as const;
export type RoofKind = (typeof ROOF_KINDS)[number];
/** Its windows. */
export const WINDOW_KINDS = [
  'slit',
  'arched',
  'louvred',
  'sash',
  'shopfront',
  'barred',
] as const;
export type WindowKind = (typeof WINDOW_KINDS)[number];

/** The buildings code assembles from parts (studio-scenery-plan §5.2). */
export const BUILDING_KINDS = [
  'house',
  'shop',
  'church',
  'mosque',
  'classroom',
  'compound',
  'tenement',
  'temple',
  'mud brick house',
  'brownstone',
  'skyscraper',
  'kiosk',
  'zinc roof house',
  'barn',
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const isBuildingKind = (kind: string): kind is BuildingKind =>
  (BUILDING_KINDS as readonly string[]).includes(kind);

/** The life about a place, for the stage to add (birds on its roofs, goats in its lanes). */
export type AmbientLife =
  | 'birds'
  | 'pigeons'
  | 'chickens'
  | 'goats'
  | 'sheep'
  | 'cows'
  | 'donkeys'
  | 'dogs'
  | 'butterflies'
  | 'dust'
  | 'smoke';

/** A choice and how often it comes, as a weight. */
export type Weighted<T> = readonly (readonly [T, number])[];

/** How often a building has each extra, 0 to 1. */
export interface PackExtras {
  awning: number;
  balcony: number;
  stoop: number;
  parapet: number;
  signboard: number;
  waterTank: number;
  ac: number;
  satellite: number;
  chimney: number;
  lamp: number;
  flag: number;
  plants: number;
}

export interface StylePack {
  id: StylePackId;
  /** What it is, for the painter. */
  name: string;
  /** Where and when it is for. */
  words: string;
  walls: Weighted<WallKind>;
  roofs: Weighted<RoofKind>;
  windows: Weighted<WindowKind>;
  extras: PackExtras;
  /**
   * Its buildings' shape: a storey's height in metres, a house's storeys
   * and width in metres, how steep a pitched roof is (its rise over half
   * its width), and how much detail (0 plain, 1 some, 2 all).
   */
  proportions: {
    storeyM: number;
    storeys: readonly [number, number];
    widthM: readonly [number, number];
    pitch: number;
    detail: 0 | 1 | 2;
  };
  /** The buildings it offers the painter. */
  buildings: readonly BuildingKind[];
  /** The grounds it walks on. */
  grounds: readonly string[];
  /** The backdrops it uses, and its own version of a plain one (a Lagos town's rooftops for "city"). */
  backdrops: readonly string[];
  backdropFor: Readonly<Record<string, string>>;
  /** The scenery and the clutter it offers the painter. */
  scenery: readonly string[];
  clutter: readonly string[];
  /** How many of each kind of clutter it scatters: a Lagos street is busier than a farm. */
  density: number;
  /** Its colours, each one of the house's: walls, roofs, doors, trims, awnings; and the tint all are shifted toward, a little. */
  palette: {
    walls: readonly string[];
    roofs: readonly string[];
    doors: readonly string[];
    trims: readonly string[];
    awnings: readonly string[];
    tint: string;
    tintK: number;
  };
  /** Its light: the sky by day, the sun, and the haze far things fade toward. */
  light: { day: string; sun: string; haze: string };
  ambient: readonly AmbientLife[];
}

const C = CLOTH;
const E = KIT_EXTRAS;
const S = SET_COLOURS;

/** The first packs, and nature, which every place shares. */
export const STYLE_PACKS: Record<StylePackId, StylePack> = {
  'ancient-near-east': {
    id: 'ancient-near-east',
    name: 'ancient Near East',
    words:
      'Moses, Egypt, Babylon, the patriarchs: mud-brick houses with flat roofs, temples and obelisks, palms and reeds by the river, pyramids in the haze',
    walls: [
      ['mud brick', 0.6],
      ['plaster', 0.3],
      ['stone', 0.1],
    ],
    roofs: [
      ['flat', 0.9],
      ['thatch', 0.1],
    ],
    windows: [
      ['slit', 0.75],
      ['arched', 0.25],
    ],
    extras: {
      awning: 0.3,
      balcony: 0.05,
      stoop: 0.25,
      parapet: 0.9,
      signboard: 0,
      waterTank: 0,
      ac: 0,
      satellite: 0,
      chimney: 0,
      lamp: 0.1,
      flag: 0.1,
      plants: 0.3,
    },
    proportions: {
      storeyM: 2.8,
      storeys: [1, 2],
      widthM: [4, 7],
      pitch: 0.3,
      detail: 1,
    },
    buildings: ['mud brick house', 'house', 'temple', 'shop', 'compound'],
    grounds: ['sand', 'dirt', 'path', 'stone'],
    backdrops: ['pyramids', 'dunes', 'palms', 'mud town', 'sea'],
    backdropFor: { city: 'mud town', village: 'mud town', trees: 'palms' },
    scenery: [
      'palm',
      'palm grove',
      'reeds',
      'obelisk',
      'columns',
      'pyramid',
      'clay pots',
      'well',
      'basket',
      'sack',
      'tent',
      'cart',
    ],
    clutter: ['clay pots', 'basket', 'woodpile', 'cart'],
    density: 2,
    palette: {
      walls: [S.earth, COATS.tan, COATS.cream, E.concrete],
      roofs: [COATS.tan, S.earth, '#e2c27a'],
      doors: [E['dark wood'], S.wood],
      trims: [C.teal, E.gold, C.red],
      awnings: [COATS.cream, C.teal, C.red, '#e2c27a'],
      tint: C.orange,
      tintK: 0.06,
    },
    light: { day: '#d8e8ea', sun: E.gold, haze: COATS.cream },
    ambient: ['birds', 'goats', 'donkeys', 'dust'],
  },
  'biblical-village': {
    id: 'biblical-village',
    name: 'biblical village',
    words:
      'Galilee, Bethlehem, Nazareth in the first century: stone and plaster houses with flat roofs and outside stairs, olive trees, wells, fishing boats by the lake',
    walls: [
      ['stone', 0.5],
      ['plaster', 0.4],
      ['mud brick', 0.1],
    ],
    roofs: [
      ['flat', 0.85],
      ['tile', 0.15],
    ],
    windows: [
      ['slit', 0.4],
      ['arched', 0.35],
      ['louvred', 0.25],
    ],
    extras: {
      awning: 0.35,
      balcony: 0.05,
      stoop: 0.45,
      parapet: 0.75,
      signboard: 0,
      waterTank: 0,
      ac: 0,
      satellite: 0,
      chimney: 0,
      lamp: 0.2,
      flag: 0,
      plants: 0.4,
    },
    proportions: {
      storeyM: 2.8,
      storeys: [1, 2],
      widthM: [4, 7],
      pitch: 0.35,
      detail: 1,
    },
    buildings: ['house', 'shop', 'compound', 'temple', 'mud brick house'],
    grounds: ['dirt', 'path', 'stone', 'sand', 'grass'],
    backdrops: ['olive hills', 'hills', 'sea', 'mud town'],
    backdropFor: {
      village: 'mud town',
      city: 'mud town',
      trees: 'olive hills',
    },
    scenery: [
      'tree',
      'palm',
      'well',
      'clay pots',
      'basket',
      'sack',
      'cart',
      'boat',
      'tent',
      'woodpile',
      'rock',
      'bush',
    ],
    clutter: ['clay pots', 'basket', 'woodpile', 'cart'],
    density: 2,
    palette: {
      walls: [S.stone, S.walls, COATS.cream, E.concrete],
      roofs: [S.earth, COATS.tan],
      doors: [S.wood, E['dark wood'], C.blue],
      trims: [C.blue, C.navy],
      awnings: [C.purple, C.red, COATS.cream, C.blue],
      tint: C.yellow,
      tintK: 0.04,
    },
    light: { day: S.sky, sun: E.gold, haze: S.walls },
    ambient: ['birds', 'sheep', 'goats', 'chickens'],
  },
  'west-african-town': {
    id: 'west-african-town',
    name: 'West African town (Lagos today)',
    words:
      'Lagos and West African towns today: painted block houses with zinc roofs, kiosks and umbrella stalls, poles and wires, water tanks, danfos and okadas (motorbikes)',
    walls: [
      ['painted block', 0.55],
      ['plaster', 0.35],
      ['mud brick', 0.1],
    ],
    roofs: [
      ['zinc', 0.65],
      ['flat', 0.3],
      ['tile', 0.05],
    ],
    windows: [
      ['louvred', 0.5],
      ['barred', 0.35],
      ['shopfront', 0.15],
    ],
    extras: {
      awning: 0.45,
      balcony: 0.3,
      stoop: 0.2,
      parapet: 0.3,
      signboard: 0.6,
      waterTank: 0.5,
      ac: 0.25,
      satellite: 0.3,
      chimney: 0,
      lamp: 0.1,
      flag: 0,
      plants: 0.3,
    },
    proportions: {
      storeyM: 3,
      storeys: [1, 3],
      widthM: [5, 9],
      pitch: 0.18,
      detail: 2,
    },
    buildings: [
      'zinc roof house',
      'house',
      'shop',
      'kiosk',
      'compound',
      'tenement',
      'church',
      'mosque',
      'classroom',
    ],
    grounds: ['road', 'red earth', 'dirt', 'paving'],
    backdrops: ['rooftops', 'city', 'village', 'trees'],
    backdropFor: { city: 'rooftops', village: 'rooftops' },
    scenery: [
      'kiosk',
      'umbrella stall',
      'danfo',
      'motorbike',
      'generator',
      'gutter bridge',
      'poles',
      'water drum',
      'plastic chair',
      'palm',
      'stall',
      'cart',
      'basket',
    ],
    clutter: [
      'poles',
      'bin',
      'plastic chair',
      'laundry line',
      'generator',
      'parked car',
      'motorbike',
      'water drum',
      'street sign',
      'basket',
      'cart',
    ],
    density: 3,
    palette: {
      walls: [
        COATS.cream,
        S.walls,
        C.yellow,
        C.teal,
        C.pink,
        S.water,
        S.earth,
        E.concrete,
      ],
      roofs: [E.steel, COATS.chestnut, C.grey],
      doors: [C.blue, C.navy, C.green, E['dark wood']],
      trims: [C.red, C.teal, C.blue],
      awnings: [C.red, C.yellow, C.blue, C.green, C.orange],
      tint: C.orange,
      tintK: 0.03,
    },
    light: { day: S.sky, sun: E.gold, haze: S.walls },
    ambient: ['birds', 'chickens', 'goats', 'smoke'],
  },
  'western-city': {
    id: 'western-city',
    name: 'Western city (New York, London)',
    words:
      'New York, London and cities like them: brick brownstones with stoops, shopfronts with awnings, a skyline of towers, hydrants, streetlamps, taxis',
    walls: [
      ['brick', 0.45],
      ['painted block', 0.2],
      ['glass', 0.1],
      ['clapboard', 0.1],
      ['stone', 0.15],
    ],
    roofs: [
      ['flat', 0.7],
      ['shingle', 0.15],
      ['tile', 0.15],
    ],
    windows: [
      ['sash', 0.6],
      ['shopfront', 0.25],
      ['arched', 0.15],
    ],
    extras: {
      awning: 0.35,
      balcony: 0.15,
      stoop: 0.5,
      parapet: 0.65,
      signboard: 0.5,
      waterTank: 0.25,
      ac: 0.4,
      satellite: 0.1,
      chimney: 0.3,
      lamp: 0.2,
      flag: 0.1,
      plants: 0.3,
    },
    proportions: {
      storeyM: 3.2,
      storeys: [2, 5],
      widthM: [5, 9],
      pitch: 0.4,
      detail: 2,
    },
    buildings: [
      'brownstone',
      'tenement',
      'shop',
      'skyscraper',
      'house',
      'church',
      'classroom',
      'kiosk',
    ],
    grounds: ['paving', 'road', 'stone'],
    backdrops: ['skyline', 'city'],
    backdropFor: { city: 'skyline', village: 'city' },
    scenery: [
      'hydrant',
      'streetlamp',
      'subway entrance',
      'taxi',
      'hot dog cart',
      'bin',
      'bench',
      'street sign',
      'parked car',
      'bicycle',
      'tree',
      'plant',
    ],
    clutter: [
      'bin',
      'hydrant',
      'street sign',
      'parked car',
      'bicycle',
      'bench',
      'plant',
    ],
    density: 2,
    palette: {
      walls: [
        COATS.chestnut,
        S.roofs,
        S.stone,
        E.concrete,
        COATS.cream,
        C.grey,
      ],
      roofs: [COATS['dark grey'], C.black, C.grey],
      doors: [C.navy, C.black, C.red, E['dark wood'], C.teal],
      trims: [E.paper, C.white],
      awnings: [C.red, C.navy, C.green, C.teal],
      tint: C.navy,
      tintK: 0.04,
    },
    light: { day: S.sky, sun: E.gold, haze: '#dde5ea' },
    ambient: ['pigeons', 'birds', 'dogs'],
  },
  'modern-town': {
    id: 'modern-town',
    name: 'modern town',
    words:
      'a present-day town anywhere, of no one country: plain houses and flats, small shops with awnings, a school, trees and benches, parked cars and bicycles',
    walls: [
      ['plaster', 0.4],
      ['painted block', 0.3],
      ['brick', 0.2],
      ['clapboard', 0.1],
    ],
    roofs: [
      ['flat', 0.4],
      ['tile', 0.35],
      ['shingle', 0.25],
    ],
    windows: [
      ['sash', 0.55],
      ['shopfront', 0.3],
      ['louvred', 0.15],
    ],
    extras: {
      awning: 0.3,
      balcony: 0.2,
      stoop: 0.3,
      parapet: 0.35,
      signboard: 0.35,
      waterTank: 0.05,
      ac: 0.2,
      satellite: 0.1,
      chimney: 0.1,
      lamp: 0.25,
      flag: 0,
      plants: 0.45,
    },
    proportions: {
      storeyM: 3,
      storeys: [1, 3],
      widthM: [5, 9],
      pitch: 0.4,
      detail: 1,
    },
    buildings: ['house', 'shop', 'kiosk', 'classroom', 'tenement'],
    grounds: ['paving', 'road', 'grass', 'path'],
    backdrops: ['city', 'village', 'trees', 'hills'],
    backdropFor: {},
    scenery: [
      'tree',
      'bush',
      'bench',
      'streetlamp',
      'bin',
      'street sign',
      'parked car',
      'bicycle',
      'plant',
      'flowers',
      'kiosk',
    ],
    clutter: ['bin', 'bench', 'plant', 'bicycle', 'parked car', 'street sign'],
    density: 2,
    palette: {
      walls: [S.walls, COATS.cream, C.white, S.stone, C.yellow, S.water],
      roofs: [S.roofs, COATS['dark grey'], C.grey],
      doors: [C.blue, C.green, C.red, E['dark wood']],
      trims: [C.white, E.paper],
      awnings: [C.green, C.blue, C.red, C.teal],
      tint: C.blue,
      tintK: 0,
    },
    light: { day: S.sky, sun: E.gold, haze: S.walls },
    ambient: ['birds', 'pigeons', 'dogs'],
  },
  'village-farm': {
    id: 'village-farm',
    name: 'village and farm',
    words:
      'a village or a farm in the countryside: cottages with pitched roofs and chimneys, a barn, fences, fields, woodpiles',
    walls: [
      ['clapboard', 0.3],
      ['plaster', 0.3],
      ['stone', 0.2],
      ['brick', 0.1],
      ['mud brick', 0.1],
    ],
    roofs: [
      ['tile', 0.35],
      ['shingle', 0.3],
      ['thatch', 0.25],
      ['zinc', 0.1],
    ],
    windows: [
      ['sash', 0.7],
      ['louvred', 0.2],
      ['arched', 0.1],
    ],
    extras: {
      awning: 0.05,
      balcony: 0.05,
      stoop: 0.4,
      parapet: 0.05,
      signboard: 0.05,
      waterTank: 0.1,
      ac: 0,
      satellite: 0.1,
      chimney: 0.6,
      lamp: 0.2,
      flag: 0,
      plants: 0.5,
    },
    proportions: {
      storeyM: 2.9,
      storeys: [1, 2],
      widthM: [5, 9],
      pitch: 0.55,
      detail: 1,
    },
    buildings: ['house', 'barn', 'shop', 'church', 'classroom'],
    grounds: ['grass', 'path', 'dirt'],
    backdrops: ['fields', 'hills', 'village', 'trees'],
    backdropFor: {},
    scenery: [
      'tree',
      'bush',
      'fence',
      'hut',
      'cart',
      'woodpile',
      'flowers',
      'sack',
      'well',
      'basket',
      'rock',
    ],
    clutter: ['woodpile', 'cart', 'basket', 'bicycle', 'clay pots', 'plant'],
    density: 2,
    palette: {
      walls: [S.walls, COATS.cream, C.white, S.roofs, S.earth, C.yellow],
      roofs: [S.roofs, COATS.chestnut, '#e2c27a', COATS['dark grey']],
      doors: [C.red, C.green, C.blue, E['dark wood']],
      trims: [C.white, E.paper],
      awnings: [C.red, C.green],
      tint: C.yellow,
      tintK: 0.03,
    },
    light: { day: S.sky, sun: E.gold, haze: S.walls },
    ambient: ['chickens', 'cows', 'sheep', 'birds'],
  },
  nature: {
    id: 'nature',
    name: 'nature',
    words:
      'forest, beach, desert, river and mountain, anywhere: shared by every place, with a hut or a cabin at most',
    walls: [
      ['plaster', 0.5],
      ['mud brick', 0.2],
      ['clapboard', 0.3],
    ],
    roofs: [
      ['thatch', 0.5],
      ['shingle', 0.5],
    ],
    windows: [['sash', 1]],
    extras: {
      awning: 0,
      balcony: 0,
      stoop: 0.2,
      parapet: 0,
      signboard: 0,
      waterTank: 0,
      ac: 0,
      satellite: 0,
      chimney: 0.3,
      lamp: 0.1,
      flag: 0,
      plants: 0.3,
    },
    proportions: {
      storeyM: 2.8,
      storeys: [1, 1],
      widthM: [4, 6],
      pitch: 0.55,
      detail: 0,
    },
    buildings: ['house', 'barn'],
    grounds: ['grass', 'path', 'sand', 'dirt', 'stone', 'snow'],
    backdrops: ['trees', 'mountains', 'sea', 'dunes', 'hills'],
    backdropFor: {},
    scenery: [
      'tree',
      'pine',
      'bush',
      'rock',
      'fern',
      'flowers',
      'mushroom',
      'reeds',
      'palm',
      'palm grove',
      'boat',
      'hut',
      'tent',
    ],
    clutter: ['woodpile', 'basket'],
    density: 1,
    palette: {
      walls: [S.walls, COATS.cream, S.earth],
      roofs: ['#e2c27a', S.roofs, COATS['dark grey']],
      doors: [E['dark wood'], S.wood],
      trims: [C.white],
      awnings: [C.red],
      tint: S.leaves,
      tintK: 0.02,
    },
    light: { day: S.sky, sun: E.gold, haze: S.walls },
    ambient: ['birds', 'butterflies'],
  },
};

// ── Colours ───────────────────────────────────────────────────────────────

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const hexOf = (rgb: number[]) =>
  `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** A colour mixed `k` of the way toward another. */
export function mix(hex: string, toward: string, k: number): string {
  const a = channels(hex);
  const b = channels(toward);
  return hexOf(a.map((v, i) => v + (b[i] - v) * k));
}

/** A house colour, shifted a little toward its pack's tint (studio-scenery-plan §5.6). */
export const packColour = (pack: StylePack, hex: string): string =>
  pack.palette.tintK > 0
    ? mix(hex, pack.palette.tint, pack.palette.tintK)
    : hex;

// ── Choosing a place's pack ───────────────────────────────────────────────

/**
 * The words that say a pack, each with its weight: a place's own name
 * (Galilee, Lagos) outweighs an era's or a landscape's (biblical, city).
 */
const PACK_WORDS: Record<StylePackId, [RegExp, number][]> = {
  'ancient-near-east': [
    [
      /\b(?:moses|egypt(?:ian)?s?|pharaohs?|nile|babylon(?:ian)?|assyria|mesopotamia|sumer|goshen|sinai|exodus|canaan(?:ites?)?|ur of the chaldees|abraham|noah|patriarchs?|hebrew slaves|pyramids?|ziggurat)\b/iu,
      3,
    ],
    [
      /\b(?:b\.?c\.?e?|before christ|ancient|biblical|old testament|bronze age)\b/iu,
      1.5,
    ],
  ],
  'biblical-village': [
    [
      /\b(?:galilee|bethlehem|nazareth|jerusalem|jud(?:a)?ea|capernaum|samaria|bethany|jericho|jesus|disciples|apostles|sea of galilee|first[- ]century|1st[- ]century)\b/iu,
      4,
    ],
    [/\b(?:a\.?d\.?|roman (?:empire|times|rule)|new testament)\b/iu, 2],
  ],
  'west-african-town': [
    [
      /\b(?:lagos|danfos?|nigeria(?:n|ns)?|west africa(?:n)?|yoruba|igbo|hausa|accra|ghana(?:ian)?|abuja|ibadan|okadas?|kekes?|agbada|dakar|senegal(?:ese)?|lom[eé]|benin city|kano|port harcourt|surulere|ikeja|lekki|yaba)\b/iu,
      4,
    ],
    [/\bzinc roofs?\b/iu, 1],
  ],
  'western-city': [
    [
      /\b(?:new york|manhattan|brooklyn|harlem|london|paris|chicago|boston|toronto|philadelphia|san francisco|dublin|edinburgh)\b/iu,
      4,
    ],
    [/\b(?:subway|skyscrapers?|brownstones?|terraced houses)\b/iu, 1],
  ],
  // A town or a city of no one country: the words for one, in any world.
  'modern-town': [
    [
      /\b(?:city|cities|towns?|downtown|suburbs?|neighbou?rhoods?|apartments?|flats|high street|shopping (?:street|centre|center|mall))\b/iu,
      1,
    ],
  ],
  'village-farm': [
    [
      /\b(?:farms?|farmyard|barns?|countryside|rural|cottages?|meadows?|harvest|tractors?|orchard)\b/iu,
      2,
    ],
    [/\b(?:villages?|hamlet)\b/iu, 1],
  ],
  nature: [
    [
      /\b(?:forests?|jungle|woods|beach|desert|rivers?|mountains?|lakes?|islands?|savannah?|wilderness|caves?|seaside|ocean|clearings?|glades?|valleys?|canyons?|waterfalls?|streams?|swamps?|marsh(?:es)?|tundra|glaciers?|volcano(?:es)?|reefs?|prairies?|grasslands?)\b/iu,
      0.5,
    ],
  ],
};
/** Which wins a tie: the more particular first. */
const PACK_ORDER: readonly StylePackId[] = [
  'biblical-village',
  'ancient-near-east',
  'west-african-town',
  'western-city',
  'modern-town',
  'village-farm',
  'nature',
];
/** A pack must score this much, and this much more than the next, to be code's choice. */
const PACK_LEAST = 1;
const PACK_MARGIN = 0.5;

/** Each pack's score from some words: the weight of each rule that matches them. */
export function packScores(words: string): Record<StylePackId, number> {
  const out = Object.fromEntries(STYLE_PACK_IDS.map((id) => [id, 0])) as Record<
    StylePackId,
    number
  >;
  for (const id of STYLE_PACK_IDS)
    for (const [pattern, weight] of PACK_WORDS[id])
      if (pattern.test(words)) out[id] += weight;
  return out;
}

/** The story's world in words, every field of it. */
export const worldWords = (world: StoryWorld | null | undefined): string =>
  world
    ? [world.era, world.region, world.culture, world.landscape, world.homes]
        .filter(Boolean)
        .join('; ')
    : '';

/**
 * A place's pack from the story's world (and the place's own words, when
 * given), by keyword rules; null when they do not decide it, for the
 * painter to pick.
 */
export function packOfWorld(
  world: StoryWorld | null | undefined,
  placeWords = '',
): StylePackId | null {
  const scores = packScores(`${worldWords(world)} ${placeWords}`);
  const ranked = [...PACK_ORDER].sort((a, b) => scores[b] - scores[a]);
  const [first, second] = ranked;
  if (scores[first] < PACK_LEAST) return null;
  if (scores[first] - scores[second] < PACK_MARGIN) return null;
  return first;
}

/** An era long before today: a story set then is never a modern town. */
const LONG_AGO =
  /\b(?:ancient|b\.?c\.?e?|biblical|medieval|middle ages|prehistoric|stone age|bronze age|iron age|romans?|vikings?|pharaohs?|long ago|once upon a time|olden|fairy ?tales?|[1-9](?:st|nd|rd|th) century|1[0-8](?:st|nd|rd|th) century|1[0-8]\d\ds?)\b/iu;

/**
 * The pack a place is drawn in when neither the story's world nor its own
 * words decide one, and none the painter chose will do: out in nature
 * for a place its words say is (a forest, a beach), a village for a
 * village or a farm, nature for a story long ago, and else a plain
 * present-day town of no one country. Never one region's by default.
 */
export function plainPack(
  world: StoryWorld | null | undefined,
  placeWords = '',
): StylePackId {
  const scores = packScores(placeWords);
  if (scores['village-farm'] > 0) return 'village-farm';
  if (scores.nature > 0) return 'nature';
  if (LONG_AGO.test(world?.era ?? '')) return 'nature';
  return 'modern-town';
}

/** A pack named in words ("Lagos", "ancient Egypt", "west-african-town"); null for none. */
export function styleOf(said: unknown): StylePackId | null {
  if (typeof said !== 'string') return null;
  const word = said.toLowerCase().trim();
  const id = STYLE_PACK_IDS.find(
    (one) => one === word || one === word.replace(/\s+/g, '-'),
  );
  if (id) return id;
  const named = STYLE_PACK_IDS.find(
    (one) => STYLE_PACKS[one].name.toLowerCase() === word,
  );
  return named ?? packOfWorld(null, word);
}

// ── Seeded choices ────────────────────────────────────────────────────────

/** A seeded run of numbers, so a thing is drawn the same way every time. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** One of a weighted list, by a number 0 to 1; only those `allowed` (any of them, as likely, when none is on the list). */
export function weighted<T>(
  list: Weighted<T>,
  r: number,
  allowed?: readonly T[],
): T {
  // What its kind must have, where its pack has none of it: a mosque's dome.
  if (allowed?.length && !list.some(([one]) => allowed.includes(one)))
    return allowed[Math.floor(r * allowed.length) % allowed.length];
  const kept = allowed?.length
    ? list.filter(([one]) => allowed.includes(one))
    : list;
  const total = kept.reduce((sum, [, w]) => sum + w, 0);
  let at = r * total;
  for (const [one, w] of kept) {
    if (at < w) return one;
    at -= w;
  }
  return kept[kept.length - 1][0];
}
