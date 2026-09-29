/**
 * A place built from a layout (studio-drawings-plan §7, D1). The painter
 * writes what a set has, as a few words a field (the sky, the ground,
 * what stands behind the open ground, and each thing placed: what it is,
 * how far across, how far back, how big), and code draws it all, in the
 * kit's own hand, at 1600 × 900: so every set is clean (no stray strokes,
 * no bus painted as a street), its ground is exactly where it is drawn,
 * and its groups ("ground", "front", "outside", "props", and "f-<id>" for
 * each feature of the set the painter draws) are exact, for measureGround
 * to read.
 *
 * Out of doors: a sky by its time and weather, a backdrop band standing
 * on the far edge of the ground (hills, mountains, trees, the sea, a
 * city, a village, fields, dunes), and the ground. A room: its back wall
 * and side walls, its floor, and what hangs on the wall. A vessel from
 * inside, from a template: a bus is its far side with its windows showing
 * the road going by (the "outside" group, which slides past as it goes),
 * its seats, poles and straps, its door and its floor; a train, a plane
 * and a boat likewise. Things are placed in three rows back to front, at
 * the scale people stand at there (the crowd's own camera, scene-crowd),
 * and kept out of the middle of the open ground, where the story's people
 * stand, and clear of the features the stage draws itself.
 *
 * What the list has no piece for is drawn once by the artist, as one of a
 * show's own features (ownFeatureBrief), and placed like a piece.
 */
import {
  ACTED_PIECES,
  drawPiece,
  featureGroup,
  type SetPiece,
} from './scene-set-pieces';
import {
  COUNTERS,
  FLAT,
  HANGING,
  SCENERY_KINDS,
  drawScenery,
  isSceneryKind,
  type SceneryKind,
  type SceneryPiece,
} from './scene-set-scenery';
import { FEATURE_KINDS, type FeatureKind } from './scene-doings';
import { DRAWN } from './scene-own';
import {
  CLOTH,
  COATS,
  FIGURE_INK,
  KIT_EXTRAS,
  SET_COLOURS,
  SET_UNIT_SHARE,
  setLine,
  shade,
} from './scene-ink';
import { FLOOR_BACK_K, FLOOR_FRONT_K, STATION_SHARES } from './scene-layout';
import type { PlaceKind, StoryPlace, StoryWorld } from './scene-story';
import { drawBuilding } from './scene-set-buildings';
import { isKitKind } from './scene-set-kit';
import {
  LANDMARKS,
  clampParams,
  drawLandmark,
  isLandmarkKind,
  landmarkOfName,
  type LandmarkKind,
  type LandmarkParams,
} from './scene-set-landmarks';
import { audienceFor, drawAudience } from './scene-set-audience';
import { FAR_K, FAR_MOST, checkSizes, realScaleOf } from './scene-set-sizes';
import {
  STYLE_PACKS,
  STYLE_PACK_IDS,
  isBuildingKind,
  mix,
  packColour,
  packOfWorld,
  styleOf,
  type StylePack,
  type StylePackId,
} from './scene-style-packs';

// ── What a layout says ────────────────────────────────────────────────────

export const SET_SKIES = ['day', 'dawn', 'dusk', 'night'] as const;
export type SetSky = (typeof SET_SKIES)[number];
export const SET_WEATHERS = ['clear', 'cloudy', 'snow'] as const;
export type SetWeather = (typeof SET_WEATHERS)[number];
/** What people stand on: out of doors, and a floor. */
export const SET_GROUNDS = [
  'grass',
  'path',
  'sand',
  'road',
  'dirt',
  'red earth',
  'paving',
  'snow',
  'wood',
  'tiles',
  'carpet',
  'stone',
] as const;
export type SetGroundKind = (typeof SET_GROUNDS)[number];
/** What stands behind the open ground, out of doors. */
export const SET_BACKDROPS = [
  'hills',
  'mountains',
  'trees',
  'sea',
  'city',
  'village',
  'fields',
  'dunes',
  'none',
  // The style packs' own (studio-scenery-plan §5.1).
  'pyramids',
  'palms',
  'mud town',
  'olive hills',
  'rooftops',
  'skyline',
] as const;
export type SetBackdrop = (typeof SET_BACKDROPS)[number];
/** What a vessel is, seen from inside. */
export const SET_VESSELS = ['bus', 'train', 'plane', 'boat'] as const;
export type SetVessel = (typeof SET_VESSELS)[number];
/** How far back a thing stands: against the back, between, or near (at the sides only). */
export const SET_ROWS = ['back', 'middle', 'front'] as const;
/**
 * And the rows a layered set adds (studio-scenery-plan §3.1): far off on
 * the horizon (a pyramid, a skyline's tower), and nearer than the people,
 * between them and the camera (a fence post, a table's edge, a plant),
 * low or at the sides.
 */
export const LAYER_ROWS = ['far', ...SET_ROWS, 'foreground'] as const;
export type SetRow = (typeof LAYER_ROWS)[number];

/**
 * What a layout may scatter about the back and the edges of the ground
 * to make a place busy (studio-scenery-plan §5.3): chairs, potted plants,
 * benches, baskets and carts, and what L3 adds (scene-set-kit): poles and
 * wires, bins, plastic chairs, laundry lines, generators, parked cars and
 * okadas, water drums, bicycles, street signs, hydrants, clay pots,
 * woodpiles.
 */
export const CLUTTER_KINDS = [
  'chair',
  'plant',
  'bench',
  'basket',
  'cart',
  'poles',
  'bin',
  'plastic chair',
  'laundry line',
  'generator',
  'parked car',
  'okada',
  'water drum',
  'bicycle',
  'street sign',
  'hydrant',
  'clay pots',
  'woodpile',
] as const;
export type ClutterKind = (typeof CLUTTER_KINDS)[number];
/** The most kinds of clutter a set scatters, and foreground things it places. */
export const MAX_CLUTTER = 6;
export const MAX_FOREGROUND = 4;
/** How wide a set is drawn, in frames: one, or wider for a camera that pans (L4). */
export const SET_WIDTHS = [1, 1.5, 2] as const;
export type SetWidth = (typeof SET_WIDTHS)[number];

/** Where a place's action happens: across, the feature it is at, and in the painter's words. */
export interface SetFocal {
  x: number;
  feature?: string;
  words: string;
}

/** What a layout may place: a piece the stage also draws, a piece of scenery, or a palm. */
export type SetItemKind = FeatureKind | SceneryKind | 'palm';
export const SET_ITEM_KINDS: readonly SetItemKind[] = [
  ...FEATURE_KINDS,
  ...SCENERY_KINDS,
  'palm',
];

export interface SetItem {
  kind: SetItemKind;
  /** Its middle, as a share of the width. */
  x: number;
  row: SetRow;
  /** Bigger or smaller than it usually is, 0.6 to 1.5. */
  scale: number;
  /** Its colour from the house's, where it has one of its own; null for its usual. */
  colour: string | null;
  /** Turned the other way. */
  flip?: boolean;
}

/** A thing the list has no piece for: drawn by code from a landmark's builder where it names one (`build`), else by the artist as one of the show's own. */
export interface SetOwnItem {
  name: string;
  x: number;
  row: SetRow;
  /** Its landmark's builder and its parameters, clamped (scene-set-landmarks). */
  build?: { kind: LandmarkKind; params: LandmarkParams };
}

export interface SetLayout {
  sky: SetSky;
  weather: SetWeather;
  ground: SetGroundKind;
  /** The ground's own colour, from the house's; null for its kind's. */
  groundColour: string | null;
  /** Out of doors: what stands behind the open ground. */
  backdrop: SetBackdrop;
  /** A room's walls, or a vessel's inside, from the house's colours; null for the usual. */
  walls: string | null;
  /** A vessel's template, and its own colour (a yellow bus); null out of it. */
  vessel: SetVessel | null;
  vesselColour: string | null;
  items: SetItem[];
  own: SetOwnItem[];
  /** Where the action happens: kept clear of clutter, and what the wide shot centres on (L4). Absent on a layout written before. */
  focal?: SetFocal;
  /** What is scattered about the back and the edges, by code. Absent or empty, nothing. */
  clutter?: ClutterKind[];
  /** How wide the set is, in frames; absent, one. Drawn one frame wide until the camera pans (L4). */
  width?: SetWidth;
  /**
   * Its era and region's style pack (studio-scenery-plan §5.1): what its
   * buildings are made of, its clutter, its colours and light. Absent on
   * a layout written before the packs, which is drawn as it always was.
   */
  style?: StylePackId;
  /** Rows of people watching before the camera (§5.5): a class, a congregation, a stand; absent for none. */
  audience?: 1 | 2;
}

/** The most things a set places, and the most the artist draws for it. */
export const MAX_SET_ITEMS = 14;
export const MAX_OWN_ITEMS = 2;

// ── Reading a layout, leniently ───────────────────────────────────────────

/** Colours by name: the house's own, and the words people use for them. */
const COLOUR_WORDS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(COATS).map(([name, hex]) => [name, hex]),
  ),
  ...CLOTH,
  ...Object.fromEntries(
    Object.entries(SET_COLOURS).map(([name, hex]) => [name, hex]),
  ),
  gray: CLOTH.grey,
  'light blue': SET_COLOURS.sky,
  'sky blue': SET_COLOURS.sky,
  cream: COATS.cream,
  beige: SET_COLOURS.earth,
  tan: COATS.tan,
  gold: KIT_EXTRAS.gold,
  golden: KIT_EXTRAS.gold,
  'dark wood': KIT_EXTRAS['dark wood'],
  silver: KIT_EXTRAS.steel,
  metal: KIT_EXTRAS.steel,
  'dark green': KIT_EXTRAS['dark leaf'],
  'light green': SET_COLOURS.grass,
  'navy blue': CLOTH.navy,
  'dark blue': CLOTH.navy,
  'bright red': KIT_EXTRAS['bright red'],
  pale: SET_COLOURS.walls,
  'off white': SET_COLOURS.walls,
  'off-white': SET_COLOURS.walls,
  magenta: CLOTH.pink,
  violet: CLOTH.purple,
  turquoise: CLOTH.teal,
  lime: CLOTH.green,
};

/** A colour said in words: the house's own for it; null for none it knows. */
export function setColourOf(said: unknown): string | null {
  if (typeof said !== 'string') return null;
  const words = said
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return null;
  if (COLOUR_WORDS[words]) return COLOUR_WORDS[words];
  // The last word that is a colour: "a pale yellow" is yellow.
  const each = words.split(' ');
  for (let n = each.length; n >= 1; n -= 1) {
    const tail = each.slice(n - 1).join(' ');
    if (COLOUR_WORDS[tail]) return COLOUR_WORDS[tail];
  }
  for (const word of each.reverse())
    if (COLOUR_WORDS[word]) return COLOUR_WORDS[word];
  return null;
}

/** Other words for the things a layout places. */
const ITEM_WORDS: Record<string, SetItemKind> = {
  bookcase: 'bookshelf',
  bookshelves: 'bookshelf',
  books: 'bookshelf',
  'book shelf': 'bookshelf',
  'wall shelf': 'shelf',
  shelves: 'shelf',
  board: 'whiteboard',
  'white board': 'whiteboard',
  chalkboard: 'blackboard',
  'chalk board': 'blackboard',
  'notice board': 'noticeboard',
  'bulletin board': 'noticeboard',
  corkboard: 'noticeboard',
  closet: 'wardrobe',
  cupboards: 'cupboard',
  cabinet: 'cupboard',
  kitchen: 'cupboard',
  carpet: 'rug',
  mat: 'rug',
  'floor lamp': 'lamp',
  'standing lamp': 'lamp',
  'window with curtains': 'curtains',
  curtain: 'curtains',
  painting: 'picture',
  photo: 'picture',
  poster: 'picture',
  frame: 'picture',
  'wall clock': 'clock',
  flags: 'bunting',
  garland: 'bunting',
  'pot plant': 'plant',
  'potted plant': 'plant',
  houseplant: 'plant',
  plants: 'plant',
  'potted plants': 'plant',
  'plastic chair': 'plastic chair',
  'plastic chairs': 'plastic chair',
  'toy box': 'toybox',
  'toy chest': 'toybox',
  chest: 'toybox',
  fire: 'fireplace',
  hearth: 'fireplace',
  'shop counter': 'counter',
  till: 'counter',
  desks: 'desk',
  'school desk': 'desk',
  home: 'house',
  houses: 'house',
  building: 'house',
  cottage: 'house',
  'mud hut': 'hut',
  huts: 'hut',
  handcart: 'cart',
  carts: 'cart',
  barrow: 'cart',
  wheelbarrow: 'cart',
  hedge: 'bush',
  shrub: 'bush',
  bushes: 'bush',
  stone: 'rock',
  boulder: 'rock',
  rocks: 'rock',
  flower: 'flowers',
  'flower bed': 'flowers',
  ferns: 'fern',
  mushrooms: 'mushroom',
  toadstool: 'mushroom',
  'street lamp': 'lamppost',
  streetlight: 'lamppost',
  'street light': 'lamppost',
  baskets: 'basket',
  sacks: 'sack',
  'grain sack': 'sack',
  'cloth sack': 'sack',
  'rice sack': 'sack',
  bag: 'sack',
  bags: 'sack',
  'beach umbrella': 'parasol',
  sunshade: 'parasol',
  umbrella: 'parasol',
  canoe: 'boat',
  'rowing boat': 'boat',
  'pine tree': 'pine',
  fir: 'pine',
  'fir tree': 'pine',
  'christmas tree': 'pine',
  mound: 'hill',
  'sand castle': 'sandcastle',
  seat: 'seats',
  'bus seats': 'seats',
  'row of seats': 'seats',
  'palm tree': 'palm',
  'coconut tree': 'palm',
  'coconut palm': 'palm',
  trees: 'tree',
  'mango tree': 'tree',
  stool: 'chair',
  chairs: 'chair',
  armchair: 'chair',
  couch: 'sofa',
  settee: 'sofa',
  benches: 'bench',
  stalls: 'stall',
  'market stall': 'stall',
  'fruit stall': 'stall',
  box: 'crate',
  boxes: 'crate',
  crates: 'crate',
  barrel: 'crate',
  stairs: 'steps',
  staircase: 'steps',
  playground: 'swing',
  goal: 'goalpost',
  'goal post': 'goalpost',
  // The buildings code assembles, and what L3 adds (studio-scenery-plan §5).
  shops: 'shop',
  store: 'shop',
  'corner shop': 'shop',
  kiosks: 'kiosk',
  'news stand': 'kiosk',
  newsstand: 'kiosk',
  chapel: 'church',
  cathedral: 'church',
  school: 'classroom',
  'school building': 'classroom',
  'mud house': 'mud brick house',
  'mud houses': 'mud brick house',
  'mud brick houses': 'mud brick house',
  'adobe house': 'mud brick house',
  'apartment block': 'tenement',
  apartments: 'tenement',
  'block of flats': 'tenement',
  flats: 'tenement',
  brownstones: 'brownstone',
  'office tower': 'skyscraper',
  skyscrapers: 'skyscraper',
  'zinc house': 'zinc roof house',
  'zinc roofed house': 'zinc roof house',
  shack: 'zinc roof house',
  'electric pole': 'poles',
  'electricity pole': 'poles',
  'electricity poles': 'poles',
  'power lines': 'poles',
  'power line': 'poles',
  'telegraph pole': 'poles',
  wires: 'poles',
  'poles and wires': 'poles',
  bins: 'bin',
  dustbin: 'bin',
  'trash can': 'bin',
  'rubbish bin': 'bin',
  'garbage can': 'bin',
  'washing line': 'laundry line',
  clothesline: 'laundry line',
  'clothes line': 'laundry line',
  washing: 'laundry line',
  laundry: 'laundry line',
  generators: 'generator',
  car: 'parked car',
  cars: 'parked car',
  'parked cars': 'parked car',
  motorbike: 'okada',
  motorcycle: 'okada',
  okadas: 'okada',
  'water drums': 'water drum',
  bike: 'bicycle',
  bicycles: 'bicycle',
  'street signs': 'street sign',
  'road sign': 'street sign',
  signpost: 'street sign',
  'fire hydrant': 'hydrant',
  hydrants: 'hydrant',
  pots: 'clay pots',
  'clay pot': 'clay pots',
  jars: 'clay pots',
  'water jars': 'clay pots',
  'water jar': 'clay pots',
  amphora: 'clay pots',
  firewood: 'woodpile',
  logs: 'woodpile',
  'wood pile': 'woodpile',
  obelisks: 'obelisk',
  pillars: 'columns',
  'temple columns': 'columns',
  column: 'columns',
  bulrushes: 'reeds',
  rushes: 'reeds',
  papyrus: 'reeds',
  reed: 'reeds',
  'palm trees': 'palm grove',
  palms: 'palm grove',
  'date palms': 'palm grove',
  oasis: 'palm grove',
  'subway station': 'subway entrance',
  'metro entrance': 'subway entrance',
  'street lamp post': 'streetlamp',
  'street lamps': 'streetlamp',
  cab: 'taxi',
  'yellow cab': 'taxi',
  taxis: 'taxi',
  'hot dog stand': 'hot dog cart',
  'hotdog cart': 'hot dog cart',
  'food cart': 'hot dog cart',
  'market umbrella': 'umbrella stall',
  'umbrella stand': 'umbrella stall',
  danfos: 'danfo',
  minibus: 'danfo',
  gutter: 'gutter bridge',
  drain: 'gutter bridge',
  pyramids: 'pyramid',
  tents: 'tent',
};

/** A thing's kind by its word; null for one the list has no piece for. */
export function itemKindOf(said: unknown): SetItemKind | null {
  if (typeof said !== 'string') return null;
  const word = said
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if ((SET_ITEM_KINDS as readonly string[]).includes(word))
    return word as SetItemKind;
  if (ITEM_WORDS[word]) return ITEM_WORDS[word];
  // "a big red bookshelf": its last word or two.
  const each = word.split(' ');
  for (let n = Math.min(3, each.length); n >= 1; n -= 1) {
    const tail = each.slice(-n).join(' ');
    if ((SET_ITEM_KINDS as readonly string[]).includes(tail))
      return tail as SetItemKind;
    if (ITEM_WORDS[tail]) return ITEM_WORDS[tail];
  }
  return null;
}

const GROUND_WORDS: Record<string, SetGroundKind> = {
  lawn: 'grass',
  field: 'grass',
  meadow: 'grass',
  beach: 'sand',
  sandy: 'sand',
  street: 'road',
  tarmac: 'road',
  asphalt: 'road',
  earth: 'dirt',
  mud: 'dirt',
  trail: 'path',
  track: 'path',
  footpath: 'path',
  'forest path': 'path',
  soil: 'dirt',
  'red dirt': 'red earth',
  laterite: 'red earth',
  pavement: 'paving',
  sidewalk: 'paving',
  cobbles: 'paving',
  cobblestones: 'paving',
  concrete: 'paving',
  ice: 'snow',
  floorboards: 'wood',
  wooden: 'wood',
  'wooden floor': 'wood',
  planks: 'wood',
  deck: 'wood',
  tile: 'tiles',
  tiled: 'tiles',
  'tiled floor': 'tiles',
  lino: 'tiles',
  rug: 'carpet',
  carpeted: 'carpet',
  'stone floor': 'stone',
  rock: 'stone',
  metal: 'stone',
};

const BACKDROP_WORDS: Record<string, SetBackdrop> = {
  hill: 'hills',
  mountain: 'mountains',
  forest: 'trees',
  woods: 'trees',
  treeline: 'trees',
  jungle: 'trees',
  ocean: 'sea',
  lake: 'sea',
  water: 'sea',
  river: 'sea',
  skyline: 'city',
  town: 'village',
  houses: 'village',
  street: 'village',
  farm: 'fields',
  farmland: 'fields',
  desert: 'dunes',
  sky: 'none',
  pyramid: 'pyramids',
  egypt: 'pyramids',
  palm: 'palms',
  oasis: 'palms',
  'palm trees': 'palms',
  'mud brick': 'mud town',
  'mud houses': 'mud town',
  'old town': 'mud town',
  olives: 'olive hills',
  'olive trees': 'olive hills',
  'olive grove': 'olive hills',
  roofs: 'rooftops',
  'zinc roofs': 'rooftops',
  skyscrapers: 'skyline',
  towers: 'skyline',
};

const VESSEL_WORDS: [RegExp, SetVessel][] = [
  [/\b(?:bus|buses|danfo|minibus|coach|car|taxi|van|lorry|truck)\b/iu, 'bus'],
  [/\b(?:train|tram|carriage|railway|subway|metro|underground)\b/iu, 'train'],
  [/\b(?:plane|aeroplane|airplane|aircraft|jet)\b/iu, 'plane'],
  [/\b(?:boat|ship|ferry|canoe|ark|yacht|raft|ship's deck|deck)\b/iu, 'boat'],
];

/** A vessel's template from words: its own word, or what its name says; null for none. */
export function vesselOf(...said: unknown[]): SetVessel | null {
  for (const one of said) {
    if (typeof one !== 'string') continue;
    const word = one.toLowerCase().trim();
    if ((SET_VESSELS as readonly string[]).includes(word))
      return word as SetVessel;
    for (const [pattern, vessel] of VESSEL_WORDS)
      if (pattern.test(word)) return vessel;
  }
  return null;
}

const pick = <T extends string>(
  list: readonly T[],
  words: Record<string, T>,
  said: unknown,
): T | null => {
  if (typeof said !== 'string') return null;
  const word = said
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if ((list as readonly string[]).includes(word)) return word as T;
  if (words[word]) return words[word];
  for (const one of word.split(' ').reverse()) {
    if ((list as readonly string[]).includes(one)) return one as T;
    if (words[one]) return words[one];
  }
  return null;
};

const share = (said: unknown, otherwise = 0.5): number => {
  const n =
    typeof said === 'number'
      ? said
      : typeof said === 'string'
        ? parseFloat(said)
        : NaN;
  if (!Number.isFinite(n)) return otherwise;
  // A percentage, now and then.
  const k = n > 1 && n <= 100 ? n / 100 : n;
  return Math.round(Math.max(0, Math.min(1, k)) * 1000) / 1000;
};

const rowOf = (said: unknown): SetRow => {
  const word = typeof said === 'string' ? said.toLowerCase() : '';
  if (/foreground|camera|nearest|closest/u.test(word)) return 'foreground';
  if (/\bfar\b|horizon|distan/u.test(word)) return 'far';
  if (/front|near|fore/u.test(word)) return 'front';
  if (/mid|between|centre|center/u.test(word)) return 'middle';
  if (typeof said === 'number')
    return said >= 2 ? 'front' : said >= 1 ? 'middle' : 'back';
  return 'back';
};

/**
 * Whether a thing asked to be drawn apart is one code draws already: a
 * kind of its own, the place itself (its walls, its floor, its sky), a
 * vessel's windows, seats, poles and straps; or no thing at all.
 */
function drawnAlready(name: string, kind: PlaceKind): boolean {
  const words = name
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !words ||
    /^(?:own|thing|things|item|items|object|none|null|other|something)$/u.test(
      words,
    )
  )
    return true;
  if (itemKindOf(words)) return true;
  if (
    /\b(?:walls?|floors?|ceilings?|sky|skies|ground|grass|sun|moon|stars?|clouds?|sea|road|paths?|trails?|tracks?|horizon|light|lights|shadows?|people|person|children|crowd)\b/u.test(
      words,
    )
  )
    return true;
  return (
    kind === 'vessel' &&
    /\b(?:windows?|seats?|straps?|handles?|poles?|rails?|handrails?|doors?|aisle|bars?|grips?)\b/u.test(
      words,
    )
  );
}

/** What a place is like when its painter said nothing sound: plain, and its kind's. */
export function plainLayout(
  place: Pick<StoryPlace, 'kind' | 'name' | 'look'>,
): SetLayout {
  const kind = place.kind ?? 'outdoor';
  const vessel =
    kind === 'vessel' ? (vesselOf(place.name, place.look) ?? 'bus') : null;
  return {
    sky: 'day',
    weather: 'clear',
    ground:
      kind === 'indoor'
        ? 'wood'
        : vessel === 'boat'
          ? 'wood'
          : kind === 'vessel'
            ? 'stone'
            : 'grass',
    groundColour: null,
    backdrop: kind === 'outdoor' ? 'hills' : 'none',
    walls: null,
    vessel,
    vesselColour: vessel ? setColourOf(`${place.name} ${place.look}`) : null,
    items:
      kind === 'outdoor'
        ? [
            { kind: 'tree', x: 0.08, row: 'middle', scale: 1, colour: null },
            { kind: 'bush', x: 0.3, row: 'back', scale: 1, colour: null },
            { kind: 'tree', x: 0.9, row: 'back', scale: 0.9, colour: null },
          ]
        : kind === 'indoor'
          ? [
              { kind: 'curtains', x: 0.5, row: 'back', scale: 1, colour: null },
              { kind: 'picture', x: 0.22, row: 'back', scale: 1, colour: null },
              { kind: 'plant', x: 0.86, row: 'back', scale: 1, colour: null },
            ]
          : [],
    own: [],
  };
}

/**
 * A layout as the painter wrote it, made sound: every field one the kit
 * draws (a word it knows for it, else the place's plain one), each thing
 * placed on the width, in a row, at a scale it may be; a thing the list
 * has no piece for kept by its name for the artist, at most two, or for
 * the landmark builder its name or the painter's `build` names, its
 * parameters clamped.
 *
 * Given the story's `world` (as the artist gives it; null for a book with
 * none), the layout is one of the style packs' (studio-scenery-plan
 * §5.1): its pack chosen by code from the world where the world decides
 * it, else the painter's `style`, else the place's own words, else
 * nature's; and a place people watch in (a classroom, a church, a
 * market) has its rows of them before the camera. Read without a world
 * (a layout from before the packs), it has neither.
 */
export function layoutOf(
  raw: unknown,
  place: Pick<StoryPlace, 'kind' | 'name' | 'look'> & {
    features?: StoryPlace['features'];
  },
  world?: StoryWorld | null,
): SetLayout {
  const plain = plainLayout(place);
  if (!raw || typeof raw !== 'object') return plain;
  const said = raw as Record<string, unknown>;
  const kind = place.kind ?? 'outdoor';
  const items: SetItem[] = [];
  const own: SetOwnItem[] = [];
  for (const one of Array.isArray(said.items) ? said.items : []) {
    if (!one || typeof one !== 'object') continue;
    const item = one as Record<string, unknown>;
    const kindOf = itemKindOf(item.kind) ?? itemKindOf(item.name);
    const x = share(item.x);
    const row = rowOf(item.row);
    // A kind the kit has no piece for is left out: only what the painter
    // asks to be drawn apart ("own") is drawn by the artist.
    if (!kindOf) continue;
    if (items.length >= MAX_SET_ITEMS) continue;
    // A few things before the camera at most: the rest nearer than none.
    if (
      row === 'foreground' &&
      items.filter((one) => one.row === 'foreground').length >= MAX_FOREGROUND
    )
      continue;
    const scale =
      typeof item.scale === 'number' && Number.isFinite(item.scale)
        ? item.scale
        : 1;
    items.push({
      kind: kindOf,
      x,
      row,
      scale: Math.round(Math.max(0.6, Math.min(1.5, scale)) * 100) / 100,
      colour: setColourOf(item.colour),
      ...(item.flip === true ? { flip: true } : {}),
    });
  }
  for (const one of Array.isArray(said.own) ? said.own : []) {
    if (!one || typeof one !== 'object' || own.length >= MAX_OWN_ITEMS)
      continue;
    const item = one as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const build = buildOf(item.build, name);
    if (!name || name.length > 60 || (!build && drawnAlready(name, kind)))
      continue;
    if (own.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue;
    own.push({
      name,
      x: share(item.x),
      row: rowOf(item.row),
      ...(build ? { build } : {}),
    });
  }
  const ground = pick(SET_GROUNDS, GROUND_WORDS, said.ground) ?? plain.ground;
  const vessel =
    kind === 'vessel' ? (vesselOf(said.vessel) ?? plain.vessel ?? 'bus') : null;
  const focal = focalOf(said.focal, place);
  const clutter = [
    ...new Set(
      (Array.isArray(said.clutter) ? said.clutter : []).flatMap(
        (one): ClutterKind[] => {
          const kindOf = CLUTTER_KINDS.find((k) => k === itemKindOf(one));
          return kindOf ? [kindOf] : [];
        },
      ),
    ),
  ].slice(0, MAX_CLUTTER);
  const wide =
    typeof said.width === 'string' ? parseFloat(said.width) : said.width;
  const width = SET_WIDTHS.find((w) => w === wide);
  const placeWords = `${place.name} ${place.look}`;
  const style =
    world === undefined
      ? styleOf(said.style)
      : (packOfWorld(world) ??
        styleOf(said.style) ??
        packOfWorld(null, placeWords) ??
        'nature');
  const rowsSaid =
    typeof said.audience === 'number'
      ? said.audience
      : said.audience === true
        ? 1
        : said.audience === false
          ? 0
          : null;
  const watching = style ? audienceFor(placeWords) : null;
  const audience =
    rowsSaid !== null
      ? rowsSaid >= 2
        ? 2
        : rowsSaid >= 1
          ? 1
          : null
      : (watching?.rows ?? null);
  return {
    sky: pick(SET_SKIES, {}, said.sky) ?? 'day',
    weather:
      pick(
        SET_WEATHERS,
        {
          cloud: 'cloudy',
          clouds: 'cloudy',
          overcast: 'cloudy',
          snowy: 'snow',
        },
        said.weather,
      ) ?? 'clear',
    ground,
    groundColour: setColourOf(said.groundColour),
    backdrop:
      kind === 'outdoor'
        ? (pick(SET_BACKDROPS, BACKDROP_WORDS, said.backdrop) ?? plain.backdrop)
        : 'none',
    walls: kind === 'outdoor' ? null : setColourOf(said.walls),
    vessel,
    vesselColour: vessel
      ? (setColourOf(said.vesselColour) ?? plain.vesselColour)
      : null,
    items,
    own,
    ...(focal ? { focal } : {}),
    ...(clutter.length ? { clutter } : {}),
    ...(width !== undefined && width !== 1 ? { width } : {}),
    ...(style ? { style } : {}),
    ...(style && audience ? { audience } : {}),
  };
}

/** A thing's landmark builder: as the painter named it, its parameters clamped; else as its name says; null for none. */
function buildOf(said: unknown, name: string): SetOwnItem['build'] | null {
  if (said && typeof said === 'object') {
    const build = said as Record<string, unknown>;
    const kind =
      typeof build.kind === 'string' ? build.kind.toLowerCase().trim() : '';
    if (isLandmarkKind(kind)) {
      // What its name says, under what the painter said.
      const named = landmarkOfName(name);
      const params =
        named?.kind === kind
          ? Object.fromEntries(
              Object.entries(named.params).filter(
                ([key, value]) => value !== clampParams(kind, {})[key],
              ),
            )
          : {};
      const given =
        build.params && typeof build.params === 'object'
          ? (build.params as Record<string, unknown>)
          : {};
      return { kind, params: clampParams(kind, { ...params, ...given }) };
    }
  }
  return landmarkOfName(name);
}

/** Where the painter says the action happens: across, at a feature of the place, in their words; null for nothing sound. */
function focalOf(
  said: unknown,
  place: Pick<StoryPlace, 'kind' | 'name' | 'look'> & {
    features?: StoryPlace['features'];
  },
): SetFocal | null {
  if (!said || typeof said !== 'object') return null;
  const focal = said as Record<string, unknown>;
  const words =
    typeof focal.words === 'string'
      ? focal.words.replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
  const id = typeof focal.feature === 'string' ? focal.feature.trim() : '';
  const feature = (place.features ?? []).find(
    (f) => f.id === id || f.name.toLowerCase() === id.toLowerCase(),
  );
  if (focal.x === undefined && !feature && !words) return null;
  return {
    x: share(focal.x, feature ? (SPOT_AT[feature.spot] ?? 0.5) : 0.5),
    ...(feature ? { feature: feature.id } : {}),
    words,
  };
}

/** A layout in a few words: for the log, and for the artist to revise. */
export function describeLayout(layout: SetLayout): string {
  const where = layout.vessel
    ? `inside a ${layout.vessel}`
    : layout.walls !== null || layout.backdrop === 'none'
      ? `${layout.ground}`
      : `${layout.sky}, ${layout.weather}, ${layout.ground} before ${layout.backdrop}`;
  const things = layout.items.map(
    (one) => `${one.kind} (${one.row}, ${Math.round(one.x * 100)}%)`,
  );
  const own = layout.own.map((one) => `${one.name} (drawn apart)`);
  return `${where}: ${[...things, ...own].join(', ') || 'nothing placed'}`;
}

// ── The painter's brief ───────────────────────────────────────────────────

/** Where the stage's spots stand across the set, by their names. */
const SPOT_AT: Record<string, number> = { ...STATION_SHARES, back: 0.5 };
/** How near across (a share of the set) a painter's thing is to the stage's own piece of its kind to be that piece again. */
const STAGED_NEAR = 0.2;

/** The story's world, as the painter is told it. */
const worldText = (world: StoryWorld | null | undefined) =>
  world
    ? `The story happens in ${[world.region, world.era].filter(Boolean).join(', ')}${world.culture ? `, among ${world.culture}` : ''}${world.landscape ? `: ${world.landscape}` : ''}${world.homes ? `; ${world.homes}` : ''}.`
    : '';

/**
 * The style pack in the painter's brief: the one code chose from the
 * story's world, with what it offers; else every pack, for the painter to
 * choose one as "style".
 */
function packText(world: StoryWorld | null | undefined): string {
  const id = packOfWorld(world);
  if (id) {
    const pack = STYLE_PACKS[id];
    return `Its look is the "${id}" style (${pack.words}): answer "style": "${id}". Its buildings are ${pack.buildings.join(', ')}; its scenery ${pack.scenery.join(', ')}; its clutter ${pack.clutter.join(', ')}.`;
  }
  return `Choose its look as "style", one of: ${STYLE_PACK_IDS.map((one) => `"${one}" (${STYLE_PACKS[one].words})`).join('; ')}.`;
}

/** The features of a place the stage draws itself, and those the set draws, by the brief's own rule (setThing). */
export function featuresOf(place: StoryPlace): {
  staged: NonNullable<StoryPlace['features']>;
  drawn: NonNullable<StoryPlace['features']>;
} {
  const features = place.features ?? [];
  const named = (f: (typeof features)[number]) =>
    new RegExp(
      `\\b${f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ).test(place.look);
  const stages = (f: (typeof features)[number]) =>
    f.kind === DRAWN || (ACTED_PIECES.includes(f.kind) && !named(f));
  return {
    staged: features.filter(stages),
    drawn: features.filter((f) => !stages(f)),
  };
}

/**
 * The painter's brief for a place's layout: what the place is, in its
 * world, the lists it chooses from, and what it leaves out (the stage's
 * own pieces) and where they stand, so it keeps that ground clear.
 */
export function layoutBrief(
  place: StoryPlace,
  bookTitle: string,
  world: StoryWorld | null = null,
): string {
  const kind = place.kind ?? 'outdoor';
  const { staged, drawn } = featuresOf(place);
  const at = (spot: string) =>
    `${Math.round((SPOT_AT[spot] ?? 0.5) * 100)}% across`;
  return [
    `Place: ${place.name}, in "${bookTitle}"${place.look ? `: ${place.look}` : ''}.`,
    worldText(world),
    packText(world),
    kind === 'vessel'
      ? `It is the inside of a vessel, seen from inside at eye level: say which (${SET_VESSELS.join(', ')}) as "vessel", and its colour as "vesselColour". Code draws its far side, its windows with what goes by outside, its seats along it, its poles and hand straps, its door and its floor: place only what else is in it, if anything, and nothing in "own" that code draws.`
      : kind === 'indoor'
        ? 'It is a room, seen from inside at eye level: code draws its back wall, its side walls and its floor. Give the walls\' colour as "walls" and the floor as "ground", and place what is in it.'
        : 'It is out of doors, seen at eye level: say its sky, its weather, its ground, and what stands behind the open ground as "backdrop".',
    staged.length
      ? `The stage draws these itself, where they stand: leave them out, and keep the ground clear there: ${staged.map((f) => `the ${f.name} (${at(f.spot)})`).join(', ')}.`
      : '',
    drawn.length
      ? `Code places these where they stand, so do not place them again: ${drawn.map((f) => `the ${f.name} (${at(f.spot)})`).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// ── The camera: where each row stands, and how big ────────────────────────

export const SET_W = 1600;
export const SET_H = 900;
/** The set's own outline: the kit's line where its people stand. */
const INK_W = setLine(SET_H);
/** Where the story's people stand, and how many of the set's units a kit unit is there (scene-crowd's own). */
const FEET = (820 / 900) * SET_H;
const UNIT = SET_UNIT_SHARE * SET_H;
/** Where the open ground meets what stands behind it, by the kind of place (the painter's brief's own). */
export const FLOOR_LINE: Record<PlaceKind, number> = {
  outdoor: 0.64 * SET_H,
  indoor: 0.7 * SET_H,
  vessel: 0.72 * SET_H,
};
/** The camera's eye line: out of doors the horizon; inside, a grown-up's eyes (scene-crowd). */
const EYE: Record<PlaceKind, number> = {
  // A little above the horizon, as a child's eye sees a picture book:
  // what stands at the far edge of the ground is not lost in the distance.
  outdoor: FLOOR_LINE.outdoor - 80,
  indoor: FEET - 200 * UNIT - 0.05 * SET_H,
  vessel: FEET - 200 * UNIT - 0.05 * SET_H,
};

/** Where a row's feet stand, down the set: far off on the horizon; before the camera, under the frame's foot. */
export function rowFeet(kind: PlaceKind, row: SetRow): number {
  const floor = FLOOR_LINE[kind];
  if (row === 'far') return floor + 3;
  if (row === 'foreground') return SET_H + 60;
  const k =
    kind === 'outdoor'
      ? { back: 0.32, middle: 0.62, front: 1 }
      : { back: 0.02, middle: 0.42, front: 1 };
  return row === 'front' ? FEET - 4 : floor + k[row] * (FEET - floor);
}

/** How many of the set's units one of the kit's is, with feet at y. */
export const scaleAtFeet = (kind: PlaceKind, y: number): number =>
  (UNIT * (y - EYE[kind])) / (FEET - EYE[kind]);

// ── Drawing ───────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;
const fill = (colour: string) => `fill="${colour}"`;
const flatFill = (colour: string) => `fill="${colour}" stroke="none"`;
const shape = (d: string, colour: string) => `<path d="${d}" ${fill(colour)}/>`;
const flatShape = (d: string, colour: string) =>
  `<path d="${d}" ${flatFill(colour)}/>`;
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  round = 0,
) =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${round ? ` rx="${round}"` : ''} ${fill(colour)}/>`;
const flatRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  round = 0,
) =>
  `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${round ? ` rx="${round}"` : ''} ${flatFill(colour)}/>`;
const circle = (x: number, y: number, r: number, colour: string) =>
  `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" ${fill(colour)}/>`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A seeded run of numbers, so a place is drawn the same way every time. */
function seeded(seed: string): () => number {
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

const SKY: Record<SetSky, string> = {
  day: SET_COLOURS.sky,
  dawn: '#f6dcc8',
  dusk: '#f2c6a8',
  night: '#34406e',
};
const GROUND: Record<SetGroundKind, string> = {
  grass: SET_COLOURS.grass,
  path: SET_COLOURS.grass,
  sand: '#f1dcaa',
  road: '#a4a2a8',
  dirt: SET_COLOURS.earth,
  'red earth': '#d9936a',
  paving: '#d8cbb3',
  snow: '#f3f5f7',
  wood: '#d7aa7c',
  tiles: '#e6e1d6',
  carpet: '#c9b8d8',
  stone: '#c9c3ba',
};
const PAPER = KIT_EXTRAS.paper;
const GLASS = KIT_EXTRAS.glass;
const STEEL = KIT_EXTRAS.steel;
const GOLD = KIT_EXTRAS.gold;
const DARK = '#3a3740';
/** A bus's, a train's or a plane's floor. */
const VESSEL_FLOOR = '#a9abb2';

/** A cloud, outlined, its middle at x, y. */
const cloud = (x: number, y: number, k: number, colour = '#ffffff') =>
  shape(
    `M${r1(x - 80 * k)},${r1(y)} Q${r1(x - 84 * k)},${r1(y - 30 * k)} ${r1(x - 50 * k)},${r1(y - 30 * k)} Q${r1(x - 40 * k)},${r1(y - 62 * k)} ${r1(x)},${r1(y - 56 * k)} Q${r1(x + 34 * k)},${r1(y - 72 * k)} ${r1(x + 52 * k)},${r1(y - 36 * k)} Q${r1(x + 88 * k)},${r1(y - 34 * k)} ${r1(x + 82 * k)},${r1(y)} Z`,
    colour,
  );

/** The sky, over the whole frame: its colour, its sun or moon and stars, its clouds, drifting. */
function drawSky(
  layout: SetLayout,
  top: number,
  random: () => number,
  pack: StylePack | null = null,
): string {
  const sky =
    layout.weather === 'cloudy' && layout.sky === 'day'
      ? '#dde5ea'
      : pack && layout.sky === 'day'
        ? pack.light.day
        : SKY[layout.sky];
  let out = flatRect(-10, -10, SET_W + 20, top + 20, sky);
  if (layout.sky === 'night') {
    const stars = Array.from(
      { length: 26 },
      () =>
        `<circle cx="${r1(random() * SET_W)}" cy="${r1(random() * top * 0.8)}" r="${r1(2 + random() * 2.5)}" ${flatFill('#fff6d8')}/>`,
    ).join('');
    out += `<g class="twinkle">${stars}</g>` + circle(1240, 150, 46, '#f6ecc4');
  } else if (layout.weather === 'clear') {
    const low = layout.sky === 'dawn' || layout.sky === 'dusk';
    out += circle(
      low ? 1320 : 1340,
      low ? top - 70 : 150,
      low ? 70 : 58,
      low ? '#f5b36b' : (pack?.light.sun ?? GOLD),
    );
  }
  if (layout.sky !== 'night') {
    const n = layout.weather === 'cloudy' ? 5 : 3;
    const clouds = Array.from({ length: n }, (_, k) =>
      cloud(
        ((k + 0.3 + random() * 0.4) / n) * SET_W,
        90 + random() * Math.max(40, top * 0.3),
        0.7 + random() * 0.5,
        layout.weather === 'cloudy' ? '#f2f4f6' : '#ffffff',
      ),
    ).join('');
    out += `<g class="drift">${clouds}</g>`;
  }
  return out;
}

/** A band of rolling shapes along a line: hills, dunes, a tree line's crowns. */
function rolling(
  base: number,
  high: number,
  bumps: number,
  random: () => number,
  colour: string,
): string {
  let d = `M-20,${r1(base)} L-20,${r1(base - high * 0.6)}`;
  const step = (SET_W + 40) / bumps;
  for (let i = 0; i < bumps; i += 1) {
    const x0 = -20 + i * step;
    const peak = base - high * (0.55 + random() * 0.45);
    const end = base - high * (0.45 + random() * 0.3);
    d += ` Q${r1(x0 + step / 2)},${r1(peak - high * 0.3)} ${r1(x0 + step)},${r1(end)}`;
  }
  d += ` L${SET_W + 20},${r1(base)} Z`;
  return shape(d, colour);
}

/** What stands behind the open ground, standing on its far edge. */
function drawBackdrop(
  layout: SetLayout,
  base: number,
  random: () => number,
  pack: StylePack | null = null,
  backdrop: SetBackdrop = layout.backdrop,
): string {
  const snow = layout.weather === 'snow';
  switch (backdrop) {
    case 'hills':
      return (
        rolling(base, 200, 4, random, snow ? '#e8eef2' : '#cfe7b8') +
        rolling(base, 120, 5, random, snow ? '#f3f5f7' : SET_COLOURS.hills)
      );
    case 'fields': {
      const bands = [0, 1, 2]
        .map((k) => {
          const y0 = base - 110 + k * 36;
          return flatRect(
            -10,
            y0,
            SET_W + 20,
            40,
            k % 2 ? '#c4e2a6' : '#d9e9b0',
          );
        })
        .join('');
      const hedges = Array.from(
        { length: 7 },
        (_, k) =>
          `<ellipse cx="${r1((k + 0.5) * (SET_W / 7))}" cy="${r1(base - 112)}" rx="${r1(60 + random() * 30)}" ry="16" ${fill(SET_COLOURS.leaves)}/>`,
      ).join('');
      return (
        rolling(base - 100, 90, 3, random, '#cfe7b8') +
        shape(
          `M-20,${base} L-20,${r1(base - 112)} L${SET_W + 20},${r1(base - 112)} L${SET_W + 20},${base} Z`,
          '#d9e9b0',
        ) +
        bands +
        hedges
      );
    }
    case 'dunes':
      return (
        rolling(base, 170, 3, random, '#f0d7a0') +
        rolling(base, 90, 4, random, '#f5e2b8')
      );
    case 'mountains': {
      let out = '';
      const n = 4;
      for (let k = 0; k < n; k += 1) {
        const cx = ((k + 0.5) / n) * SET_W + (random() - 0.5) * 120;
        const h = 240 + random() * 120;
        const w = 300 + random() * 120;
        out +=
          shape(
            `M${r1(cx - w)},${base} L${r1(cx)},${r1(base - h)} L${r1(cx + w)},${base} Z`,
            k % 2 ? '#b8c4d6' : '#a9b6ca',
          ) +
          shape(
            `M${r1(cx - w * 0.28)},${r1(base - h * 0.72)} L${r1(cx)},${r1(base - h)} L${r1(cx + w * 0.28)},${r1(base - h * 0.72)} L${r1(cx + w * 0.1)},${r1(base - h * 0.78)} L${r1(cx)},${r1(base - h * 0.7)} L${r1(cx - w * 0.12)},${r1(base - h * 0.78)} Z`,
            '#f7f7f5',
          );
      }
      return (
        out + rolling(base, 60, 5, random, snow ? '#f3f5f7' : SET_COLOURS.hills)
      );
    }
    case 'trees': {
      let out = shape(
        `M-20,${base} L-20,${r1(base - 90)} L${SET_W + 20},${r1(base - 90)} L${SET_W + 20},${base} Z`,
        '#557f31',
      );
      const n = 12;
      for (let k = 0; k < n; k += 1) {
        const cx = (k / (n - 1)) * SET_W + (random() - 0.5) * 60;
        const r = 70 + random() * 40;
        const cy = base - 90 - r * 0.6 - random() * 50;
        out += circle(cx, cy, r, k % 2 ? '#6a9c3e' : SET_COLOURS.leaves);
      }
      for (let k = 0; k < n - 1; k += 1) {
        const cx = ((k + 0.5) / (n - 1)) * SET_W;
        out += circle(
          cx,
          base - 60 - random() * 30,
          56 + random() * 20,
          k % 2 ? SET_COLOURS.leaves : '#8cc46c',
        );
      }
      return out;
    }
    case 'sea': {
      const top = base - 120;
      const waves = Array.from({ length: 9 }, (_, k) => {
        const x = 80 + k * 180 + random() * 60;
        const y = top + 30 + random() * 70;
        return flatShape(
          `M${r1(x - 26)},${r1(y)} Q${r1(x)},${r1(y - 10)} ${r1(x + 26)},${r1(y)} Q${r1(x)},${r1(y - 4)} ${r1(x - 26)},${r1(y)} Z`,
          '#e9f5fb',
        );
      }).join('');
      return (
        shape(
          `M-20,${base} L-20,${top} L${SET_W + 20},${top} L${SET_W + 20},${base} Z`,
          SET_COLOURS.water,
        ) + `<g class="ripple">${waves}</g>`
      );
    }
    case 'city': {
      let out = '';
      let x = -20;
      const walls = ['#efe3cf', '#d8cbb3', '#c9c3ba', '#e6d3a8', '#cfd8e2'];
      let k = 0;
      while (x < SET_W + 20) {
        const w = 110 + random() * 90;
        const h = 180 + random() * 190;
        const colour = walls[k % walls.length];
        out += rect(x, base - h, w, h + 10, colour);
        const cols = Math.max(2, Math.floor((w - 20) / 34));
        const rows = Math.max(2, Math.floor((h - 40) / 46));
        for (let r = 0; r < Math.min(rows, 6); r += 1)
          for (let c = 0; c < cols; c += 1)
            out += flatRect(
              x + 14 + c * ((w - 28) / cols),
              base - h + 20 + r * 46,
              (w - 28) / cols - 10,
              26,
              GLASS,
              2,
            );
        x += w - 6;
        k += 1;
      }
      return out;
    }
    case 'village': {
      let out = rolling(
        base - 40,
        110,
        4,
        random,
        snow ? '#e8eef2' : '#cfe7b8',
      );
      const n = 7;
      const houses = Array.from({ length: n }, (_, k) => ({
        k,
        cx: ((k + 0.5) / n) * SET_W + (random() - 0.5) * 90,
        // Some nearer, some farther: never one flat row.
        back: Math.round(random() * 3) * 16,
        k2: random(),
      })).sort((a, b) => b.back - a.back);
      for (const { k, cx, back, k2 } of houses) {
        const near = 1 - back / 120;
        const w = (110 + k2 * 60) * near;
        const h = (80 + ((k * 37) % 50)) * near;
        const walls = ['#efe3cf', '#e6d3a8', '#f1e2c4', '#d8cbb3'][k % 4];
        const b = base - back;
        out +=
          rect(cx - w / 2, b - h, w, h + 6 + back, walls) +
          shape(
            `M${r1(cx - w / 2 - 14)},${r1(b - h + 4)} L${r1(cx)},${r1(b - h - 50 * near)} L${r1(cx + w / 2 + 14)},${r1(b - h + 4)} Z`,
            k % 2 ? SET_COLOURS.roofs : '#c0746a',
          ) +
          flatRect(
            cx - 12 * near,
            b - 44 * near,
            24 * near,
            44 * near,
            DARK,
            2,
          ) +
          flatRect(
            cx - w / 2 + 14,
            b - h + 20,
            22 * near,
            20 * near,
            GLASS,
            2,
          ) +
          flatRect(
            cx + w / 2 - 14 - 22 * near,
            b - h + 20,
            22 * near,
            20 * near,
            GLASS,
            2,
          );
      }
      return out;
    }
    case 'none':
      return '';
    default:
      return packBackdrop(backdrop, base, random, pack);
  }
}

/** A pack's colour, or the house's where a set has no pack. */
const tinted = (pack: StylePack | null, hex: string) =>
  pack ? packColour(pack, hex) : hex;

/**
 * The style packs' backdrops, standing on the far edge of the ground:
 * pyramids beyond dunes, a line of palms, a town of flat-roofed mud
 * houses, hills of olive trees, a Lagos town's zinc rooftops and water
 * tanks, a city's skyline.
 */
function packBackdrop(
  backdrop: SetBackdrop,
  base: number,
  random: () => number,
  pack: StylePack | null,
): string {
  const walls = pack?.palette.walls ?? [SET_COLOURS.walls, '#e6d3a8'];
  const pick = (list: readonly string[]) =>
    tinted(pack, list[Math.floor(random() * list.length) % list.length]);
  const palm = (x: number, h: number) =>
    shape(
      `M${r1(x - 5)},${r1(base)} Q${r1(x + 4)},${r1(base - h * 0.5)} ${r1(x + 8)},${r1(base - h)} L${r1(x + 14)},${r1(base - h)} Q${r1(x + 10)},${r1(base - h * 0.5)} ${r1(x + 5)},${r1(base)} Z`,
      SET_COLOURS.wood,
    ) +
    [-1, 1, -0.5, 0.5]
      .map((k) =>
        shape(
          `M${r1(x + 11)},${r1(base - h)} Q${r1(x + 11 + k * 30)},${r1(base - h - 22)} ${r1(x + 11 + k * 58)},${r1(base - h + 14 + Math.abs(k) * 6)} Q${r1(x + 11 + k * 26)},${r1(base - h - 6)} ${r1(x + 11)},${r1(base - h + 6)} Z`,
          Math.abs(k) === 1 ? KIT_EXTRAS['dark leaf'] : SET_COLOURS.leaves,
        ),
      )
      .join('');
  switch (backdrop) {
    case 'pyramids': {
      const sand = tinted(pack, '#efd8a4');
      let out = '';
      const at = [0.18 + random() * 0.06, 0.45 + random() * 0.06, 0.76];
      at.forEach((x, k) => {
        const B = [300, 420, 220][k];
        const H = B * 0.6;
        const cx = x * SET_W;
        const apex = cx + B * 0.08;
        out +=
          shape(
            `M${r1(cx - B / 2)},${r1(base)} L${r1(apex)},${r1(base - H)} L${r1(apex)},${r1(base)} Z`,
            sand,
          ) +
          shape(
            `M${r1(apex)},${r1(base - H)} L${r1(cx + B / 2)},${r1(base)} L${r1(apex)},${r1(base)} Z`,
            shade(sand, 0.86),
          );
      });
      return (
        out +
        rolling(base, 70, 4, random, tinted(pack, '#f0d7a0')) +
        rolling(base, 36, 5, random, tinted(pack, '#f5e2b8'))
      );
    }
    case 'palms': {
      let out = rolling(base, 50, 5, random, tinted(pack, SET_COLOURS.hills));
      for (let k = 0; k < 11; k += 1) {
        const x = ((k + 0.3 + random() * 0.4) / 11) * SET_W;
        out += palm(x, 110 + random() * 80);
      }
      return out;
    }
    case 'mud town':
    case 'rooftops': {
      const lagos = backdrop === 'rooftops';
      let out = rolling(
        base - 20,
        70,
        4,
        random,
        tinted(pack, lagos ? SET_COLOURS.hills : '#e6d9b6'),
      );
      let x = -30;
      let k = 0;
      while (x < SET_W + 30) {
        const w = 90 + random() * 90;
        const h = (lagos ? 60 : 50) + random() * (lagos ? 90 : 70);
        const b = base - (k % 3) * 6;
        const wall = pick(
          lagos ? walls : ['#e6d3a8', '#dcc190', COATS.tan, COATS.cream],
        );
        out += rect(x, b - h, w, h + 8, wall);
        if (lagos && random() < 0.65)
          // A zinc roof, low, its sheets in lines, rusted here and there.
          out += shape(
            `M${r1(x - 8)},${r1(b - h + 4)} L${r1(x + w * 0.2)},${r1(b - h - 22)} L${r1(x + w * 0.8)},${r1(b - h - 22)} L${r1(x + w + 8)},${r1(b - h + 4)} Z`,
            random() < 0.3 ? COATS.chestnut : KIT_EXTRAS.steel,
          );
        else out += flatRect(x - 4, b - h - 8, w + 8, 10, shade(wall, 0.86));
        out +=
          flatRect(x + w * 0.2, b - h * 0.55, 14, 18, DARK) +
          flatRect(x + w * 0.62, b - h * 0.55, 14, 18, DARK);
        if (lagos && random() < 0.35)
          out += rect(x + w * 0.55, b - h - 44, 22, 26, CLOTH.black, 4);
        if (!lagos && random() < 0.3) out += palm(x + w + 6, h + 60);
        x += w - 4;
        k += 1;
      }
      if (lagos)
        // A mast over the town, and a palm or two.
        out +=
          line(
            `M${r1(SET_W * 0.72)},${r1(base - 60)} L${r1(SET_W * 0.72)},${r1(base - 300)}`,
            FIGURE_INK,
            4,
          ) +
          line(
            `M${r1(SET_W * 0.72 - 20)},${r1(base - 250)} L${r1(SET_W * 0.72 + 20)},${r1(base - 250)} M${r1(SET_W * 0.72 - 14)},${r1(base - 200)} L${r1(SET_W * 0.72 + 14)},${r1(base - 200)}`,
            FIGURE_INK,
            3,
          ) +
          palm(SET_W * 0.3, 190) +
          palm(SET_W * 0.9, 160);
      return out;
    }
    case 'olive hills': {
      let out =
        rolling(base, 190, 4, random, tinted(pack, '#d7e2b0')) +
        rolling(base, 110, 5, random, tinted(pack, SET_COLOURS.hills));
      for (let k = 0; k < 14; k += 1) {
        const x = random() * SET_W;
        const y = base - 20 - random() * 90;
        out +=
          flatRect(x - 3, y - 6, 6, 14, SET_COLOURS.wood) +
          `<ellipse cx="${r1(x)}" cy="${r1(y - 14)}" rx="${r1(16 + random() * 8)}" ry="12" ${fill('#8fa86a')}/>`;
      }
      return out;
    }
    case 'skyline': {
      let out = '';
      let x = -20;
      const faces = [
        KIT_EXTRAS.glass,
        SET_COLOURS.stone,
        '#b9d3e2',
        KIT_EXTRAS.concrete,
        COATS.cream,
      ];
      while (x < SET_W + 20) {
        const w = 70 + random() * 90;
        const h = 170 + random() * 290;
        const face = tinted(pack, faces[Math.floor(random() * faces.length)]);
        out += rect(x, base - h, w, h + 10, face);
        // Its windows as strips, and a spire now and then.
        const strips = Math.max(2, Math.floor(w / 26));
        for (let c = 0; c < strips; c += 1)
          out += flatRect(
            x + 8 + c * ((w - 16) / strips),
            base - h + 16,
            (w - 16) / strips - 8,
            h - 30,
            shade(face, 0.9),
          );
        if (random() < 0.2)
          out += line(
            `M${r1(x + w / 2)},${r1(base - h)} L${r1(x + w / 2)},${r1(base - h - 60)}`,
            FIGURE_INK,
            3,
          );
        x += w + 4;
      }
      return out;
    }
    default:
      return '';
  }
}

/** The open ground out of doors: its colour, and its own marks (a tuft, a pebble, a road's lines), flat. */
function drawGround(
  layout: SetLayout,
  top: number,
  random: () => number,
): string {
  const colour =
    layout.groundColour ??
    (layout.weather === 'snow' && layout.ground === 'grass'
      ? GROUND.snow
      : GROUND[layout.ground]);
  let out = shape(
    `M-20,${r1(top)} L${SET_W + 20},${r1(top)} L${SET_W + 20},${SET_H + 20} L-20,${SET_H + 20} Z`,
    colour,
  );
  const darker = shade(colour, 0.9);
  const marks = (n: number, draw: (x: number, y: number) => string) =>
    Array.from({ length: n }, () => {
      const x = random() * SET_W;
      const y = top + 20 + random() * (SET_H - top - 30);
      return draw(x, y);
    }).join('');
  /** A tuft of grass, which bends as someone brushes by it (studio-world-plan §5.1). */
  const tuft = (x: number, y: number) =>
    `<g${worldAttributes({ as: 'sway', len: r1(16 / scaleAtFeet('outdoor', y)) }, 'grass', x, rowAt('outdoor', y), [x, y])}>${flatShape(
      `M${r1(x - 10)},${r1(y)} L${r1(x - 4)},${r1(y - 14)} L${r1(x)},${r1(y - 4)} L${r1(x + 5)},${r1(y - 16)} L${r1(x + 10)},${r1(y)} Z`,
      darker,
    )}</g>`;
  switch (layout.ground) {
    case 'path': {
      // A path of earth winding from the front, wide, to the far edge, narrow.
      const mid = SET_W * (0.42 + random() * 0.16);
      const far = top + 2;
      out += flatShape(
        `M${r1(mid - 24)},${r1(far)} Q${r1(mid - 120)},${r1(top + (SET_H - top) * 0.45)} ${r1(mid - 420)},${SET_H + 20} L${r1(mid + 420)},${SET_H + 20} Q${r1(mid + 120)},${r1(top + (SET_H - top) * 0.45)} ${r1(mid + 24)},${r1(far)} Z`,
        SET_COLOURS.earth,
      );
      out += marks(16, tuft);
      break;
    }
    case 'grass':
      out += marks(22, tuft);
      break;
    case 'sand':
    case 'dirt':
    case 'red earth':
    case 'snow':
      out += marks(
        18,
        (x, y) =>
          `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(6 + random() * 8)}" ry="${r1(3 + random() * 3)}" ${flatFill(darker)}/>`,
      );
      break;
    case 'road': {
      // The road across the back, the pavement people stand on before it.
      const kerb = top + (SET_H - top) * 0.36;
      out +=
        flatRect(-10, kerb, SET_W + 20, SET_H - kerb + 10, GROUND.paving) +
        flatRect(-10, kerb - 8, SET_W + 20, 12, '#c2b397') +
        Array.from({ length: 9 }, (_, k) =>
          flatRect(
            k * 190 + 30,
            top + (kerb - top) * 0.45,
            100,
            10,
            '#f3f1ec',
            3,
          ),
        ).join('');
      break;
    }
    case 'paving':
    case 'stone':
      out += Array.from({ length: 5 }, (_, r) =>
        flatRect(
          -10,
          top + 40 + r * ((SET_H - top) / 5),
          SET_W + 20,
          5,
          darker,
        ),
      ).join('');
      break;
    default:
      break;
  }
  return out;
}

/**
 * The open ground of a set in a style pack (studio-scenery-plan §5.4):
 * its colour a little paler toward the far edge, in flat bands; and its
 * own marks, few, smaller and fewer the farther off they are: grass
 * tufts (each answering the world as it is brushed), a dirt path, sand's
 * ripples, a road's cracks and kerb, paving's slabs and a deck's planks
 * running to the distance.
 */
function drawGroundL3(
  layout: SetLayout,
  top: number,
  random: () => number,
  pack: StylePack,
): string {
  const colour =
    layout.groundColour ??
    packColour(
      pack,
      layout.weather === 'snow' && layout.ground === 'grass'
        ? GROUND.snow
        : GROUND[layout.ground],
    );
  const D = SET_H - top;
  let out = shape(
    `M-20,${r1(top)} L${SET_W + 20},${r1(top)} L${SET_W + 20},${SET_H + 20} L-20,${SET_H + 20} Z`,
    colour,
  );
  // Nearer to farther, the colour shifts toward the haze.
  [0.05, 0.1, 0.16].forEach((k, i) => {
    const h = D * [0.34, 0.2, 0.09][i];
    out += flatRect(-20, top, SET_W + 40, h, mix(colour, pack.light.haze, k));
  });
  const darker = shade(colour, 0.9);
  const unit = scaleAtFeet('outdoor', FEET);
  /** A depth down the ground, more of them near than far. */
  const depth = () => top + 10 + D * (0.06 + 0.94 * Math.sqrt(random()));
  /** How big a mark is where it lies, against one where the people stand. */
  const near = (y: number) => Math.max(0.2, scaleAtFeet('outdoor', y) / unit);
  const marks = (
    n: number,
    draw: (x: number, y: number, k: number) => string,
  ) =>
    Array.from({ length: n }, () => {
      const y = depth();
      const x = random() * SET_W;
      return draw(x, y, near(y));
    }).join('');
  const tuft = (x: number, y: number, k: number) =>
    `<g${worldAttributes({ as: 'sway', len: r1((16 * k) / scaleAtFeet('outdoor', y)) }, 'grass', x, rowAt('outdoor', y), [x, y])}>${flatShape(
      `M${r1(x - 10 * k)},${r1(y)} L${r1(x - 4 * k)},${r1(y - 14 * k)} L${r1(x)},${r1(y - 4 * k)} L${r1(x + 5 * k)},${r1(y - 16 * k)} L${r1(x + 10 * k)},${r1(y)} Z`,
      darker,
    )}</g>`;
  /** Lines running from the front to the far edge, toward the eye's point, and across at depths as far apart as the ground is deep. */
  const toDistance = (across: number, deep: number, tone: string) => {
    const eye = EYE.outdoor;
    const bottom = SET_H + 20;
    const t = (bottom - top) / (bottom - eye);
    const runs: string[] = [];
    for (let x0 = -SET_W; x0 <= SET_W * 2; x0 += across) {
      const x1 = x0 + (SET_W / 2 - x0) * t;
      runs.push(`M${r1(x0)},${bottom} L${r1(x1)},${r1(top)}`);
    }
    for (let k = 1; k < 40; k += 1) {
      const y = eye + (bottom - eye) / (1 + deep * k);
      if (y <= top + 4) break;
      runs.push(`M-20,${r1(y)} L${SET_W + 20},${r1(y)}`);
    }
    return `<path d="${runs.join(' ')}" fill="none" stroke="${tone}" stroke-width="2"/>`;
  };
  switch (layout.ground) {
    case 'grass':
      out += marks(24, tuft);
      break;
    case 'path':
    case 'dirt':
    case 'red earth': {
      // A way worn across it, wide near and narrow far, and a few stones.
      const mid = SET_W * (0.4 + random() * 0.2);
      out += flatShape(
        `M${r1(mid - 20)},${r1(top + 2)} Q${r1(mid - 110)},${r1(top + D * 0.45)} ${r1(mid - 380)},${SET_H + 20} L${r1(mid + 380)},${SET_H + 20} Q${r1(mid + 110)},${r1(top + D * 0.45)} ${r1(mid + 20)},${r1(top + 2)} Z`,
        layout.ground === 'path' ? SET_COLOURS.earth : shade(colour, 1.12),
      );
      out +=
        layout.ground === 'path'
          ? marks(14, tuft)
          : marks(
              12,
              (x, y, k) =>
                `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(8 * k)}" ry="${r1(3.5 * k)}" ${flatFill(darker)}/>`,
            );
      break;
    }
    case 'sand':
    case 'snow':
      // Ripples on the sand, soft drifts in the snow: short curves.
      out += marks(
        16,
        (x, y, k) =>
          `<path d="M${r1(x - 30 * k)},${r1(y)} Q${r1(x)},${r1(y - 7 * k)} ${r1(x + 30 * k)},${r1(y)}" fill="none" stroke="${darker}" stroke-width="${r1(3 * k)}" stroke-linecap="round"/>`,
      );
      break;
    case 'road': {
      // The road across the back and the pavement before it, its kerb, the
      // lane's marks, and a crack or two in each.
      const kerb = top + D * 0.36;
      out +=
        flatRect(
          -10,
          kerb,
          SET_W + 20,
          SET_H - kerb + 10,
          packColour(pack, GROUND.paving),
        ) +
        flatRect(-10, kerb - 8, SET_W + 20, 12, '#c2b397') +
        Array.from({ length: 12 }, (_, k) =>
          flatRect(k * 136 + 10, kerb - 8, 4, 12, shade('#c2b397', 0.85)),
        ).join('') +
        Array.from({ length: 9 }, (_, k) =>
          flatRect(
            k * 190 + 30,
            top + (kerb - top) * 0.45,
            100,
            10,
            '#f3f1ec',
            3,
          ),
        ).join('');
      const crack = (x: number, y: number, k: number) =>
        `<path d="M${r1(x)},${r1(y)} l${r1(12 * k)},${r1(5 * k)} l${r1(-6 * k)},${r1(7 * k)} l${r1(14 * k)},${r1(4 * k)}" fill="none" stroke="${shade(GROUND.paving, 0.8)}" stroke-width="${r1(2.4 * k)}" stroke-linecap="round"/>`;
      out += marks(7, (x, y, k) => (y > kerb + 8 ? crack(x, y, k) : ''));
      out += Array.from({ length: 3 }, () => {
        const x = random() * SET_W;
        const y = top + 6 + random() * (kerb - top - 20);
        return crack(x, y, near(y));
      }).join('');
      break;
    }
    case 'paving':
    case 'stone':
      out += toDistance(220, 0.55, shade(colour, 0.94));
      break;
    case 'wood':
      out += toDistance(90, 0.9, shade(colour, 0.85));
      break;
    case 'tiles':
      out += toDistance(160, 0.5, shade(colour, 0.94));
      break;
    default:
      break;
  }
  return out;
}

/** A floor inside, the far edge at `top` meeting the walls, lower where the side walls come down to it. */
function drawFloor(
  layout: SetLayout,
  top: number,
  side: number,
  drop: number,
): string {
  const colour = layout.groundColour ?? GROUND[layout.ground];
  const d = `M${side},${r1(top)} L${SET_W - side},${r1(top)} L${SET_W + 20},${r1(top + drop)} L${SET_W + 20},${SET_H + 20} L-20,${SET_H + 20} L-20,${r1(top + drop)} Z`;
  let out = shape(d, colour);
  const darker = shade(colour, 0.9);
  // Where the floor starts across at a depth: it runs under the side walls' feet.
  const from = (y: number) =>
    drop > 0 && y < top + drop ? side - ((y - top) / drop) * (side + 20) : -10;
  if (layout.ground === 'wood')
    // Boards running into the room, seen as the seams between them.
    out += Array.from({ length: 6 }, (_, k) => {
      const y = top + 26 + k * k * 7 + k * 26;
      const x = from(y + 4);
      return y < SET_H
        ? flatRect(x, y, SET_W - x * 2, 4 + k * 0.6, darker)
        : '';
    }).join('');
  else if (layout.ground === 'tiles') {
    const band = (SET_H - top) / 4;
    out += Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => {
        if (!((r + c) % 2)) return '';
        const y = top + 20 + r * band;
        const x0 = Math.max(c * 160, from(y + band));
        const x1 = Math.min((c + 1) * 160, SET_W - from(y + band));
        return x1 > x0
          ? flatRect(x0, y, x1 - x0, band, shade(colour, 0.95))
          : '';
      }).join(''),
    ).join('');
  }
  return out;
}

/** A room's walls: the back wall to the floor, the side walls meeting it at the corners, and the skirting. */
function drawRoom(
  walls: string,
  top: number,
  side: number,
  drop: number,
): string {
  const sideColour = shade(walls, 0.9);
  return (
    flatRect(-10, -10, SET_W + 20, top + 20, walls) +
    shape(
      `M-20,-20 L${side},-20 L${side},${r1(top)} L-20,${r1(top + drop)} Z`,
      sideColour,
    ) +
    shape(
      `M${SET_W + 20},-20 L${SET_W - side},-20 L${SET_W - side},${r1(top)} L${SET_W + 20},${r1(top + drop)} Z`,
      sideColour,
    ) +
    rect(side, top - 16, SET_W - side * 2, 16, shade(walls, 0.82))
  );
}

/** A piece's inside, out of its own frame, and its outline's width in its own units. */
function innerOf(piece: SetPiece): string {
  const m = /^<svg\b[^>]*>\s*<g\b[^>]*>([\s\S]*)<\/g>\s*<\/svg>\s*$/u.exec(
    piece.svg.trim(),
  );
  if (m) return m[1];
  // One drawn by the artist: whatever its own frame holds.
  const open = piece.svg.indexOf('>');
  const close = piece.svg.lastIndexOf('</svg>');
  return open >= 0 && close > open ? piece.svg.slice(open + 1, close) : '';
}

/** The row nearest where feet at y stand. */
function rowAt(kind: PlaceKind, y: number): SetRow {
  return SET_ROWS.reduce((best, row) =>
    Math.abs(rowFeet(kind, row) - y) < Math.abs(rowFeet(kind, best) - y)
      ? row
      : best,
  );
}

/**
 * What the stage needs to know of a thing in a set to make it answer the
 * world (studio-world-plan §5), as data attributes on its group: how it
 * moves (`data-react`: a plant sways, a lamp or a bucket hangs, a curtain
 * billows, a flag or an awning flaps), what it is, where it stands (its
 * middle as a share of the width, its row), how long it is in the kit's
 * units, where birds may sit on it (its own units), and the point it
 * turns about when that is not its own origin. Nothing for one that
 * neither moves nor is sat on, so its bytes are as they were.
 */
function worldAttributes(
  reacts: SetPiece['reacts'],
  kind: string | undefined,
  x: number,
  row: SetRow | 'wall' | 'flat' | 'horizon',
  pivot?: [number, number],
  roosts?: SetPiece['roosts'],
): string {
  if (!reacts && !roosts?.length) return '';
  return (
    (reacts ? ` data-react="${reacts.as}"` : '') +
    (kind ? ` data-kind="${kind}"` : '') +
    ` data-x="${Math.round((x / SET_W) * 1000) / 1000}" data-row="${row}"` +
    (reacts ? ` data-len="${reacts.len}"` : '') +
    (pivot ? ` data-pivot="${r1(pivot[0])} ${r1(pivot[1])}"` : '') +
    (roosts?.length
      ? ` data-roost="${roosts.map(([rx, ry]) => `${rx} ${ry}`).join(';')}"`
      : '')
  );
}

/** A piece at a point of the set, its feet there, `s` of the set's units to one of the kit's. */
function placed(
  piece: SetPiece,
  x: number,
  y: number,
  s: number,
  options: {
    flip?: boolean;
    id?: string;
    lives?: 'sway' | 'flicker';
    own?: boolean;
    /** What it is and its row, for the stage to make it answer the world. */
    world?: { kind?: string; row: SetRow | 'wall' | 'flat' | 'horizon' };
  } = {},
): string {
  const inner = innerOf(piece);
  const flip = options.flip ? -1 : 1;
  // The kit's outline wherever it stands; one the artist drew keeps its own.
  const stroke = options.own
    ? ''
    : ` stroke="${FIGURE_INK}" stroke-width="${Math.round((INK_W / s) * 100) / 100}" stroke-linejoin="round"`;
  const body = options.lives
    ? `<g class="${options.lives}">${inner}</g>`
    : inner;
  const world = options.world
    ? worldAttributes(
        piece.reacts,
        options.world.kind,
        x,
        options.world.row,
        undefined,
        piece.roosts,
      )
    : '';
  return `<g${options.id ? ` id="${options.id}"` : ''} transform="translate(${r1(x)} ${r1(y)}) scale(${Math.round(s * flip * 1000) / 1000} ${Math.round(s * 1000) / 1000})"${stroke}${world}>${body}</g>`;
}

/** Whether a colour is too pale to show on a white awning. */
const pale = (hex: string): boolean => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 765 > 0.82;
};

/**
 * A layout's thing, drawn: the stage's own pieces as the stage draws
 * them, and a palm as a tree named so. In a style pack, a building is
 * assembled from the pack's parts by its own seed (`key`), and what has a
 * colour of its own takes the pack's tint.
 */
function pieceOf(
  kind: SetItemKind,
  colour: string | null,
  seed = 0,
  pack: StylePack | null = null,
  key = '',
): SceneryPiece {
  if (pack && isBuildingKind(kind))
    return drawBuilding(kind, pack, key, colour ?? undefined);
  if (pack && colour && (isKitKind(kind) || isLandmarkKind(kind)))
    colour = packColour(pack, colour);
  if (kind === 'palm')
    return { ...drawPiece('tree', 'palm tree'), lives: 'sway' };
  if (isSceneryKind(kind)) return drawScenery(kind, colour ?? undefined);
  const piece = drawPiece(kind);
  if (kind === 'stall') {
    // Each stall its own: its awning's stripes in its colour, and its
    // wares of several kinds.
    const wares = [
      CLOTH.orange,
      CLOTH.green,
      CLOTH.yellow,
      KIT_EXTRAS['bright red'],
      CLOTH.purple,
    ];
    let n = seed;
    return {
      ...piece,
      svg: piece.svg
        .replace(
          /stroke="#e0463a" stroke-width="10"/gu,
          `stroke="${colour && !pale(colour) ? colour : wares[seed % 4 === 3 ? 4 : (seed * 3) % 5]}" stroke-width="10"`,
        )
        .replace(
          /(<circle cx="[-\d.]+" cy="-94" r="11") fill="#e0463a"\/>/gu,
          (_m, head: string) => `${head} fill="${wares[n++ % wares.length]}"/>`,
        ),
    };
  }
  return kind === 'tree' ? { ...piece, lives: 'sway' } : piece;
}

/** What a vessel's things stand on and look through, and how its far side is drawn. */
const VESSEL_LOOK: Record<
  SetVessel,
  { colour: string; seats: string; walls: string }
> = {
  bus: { colour: CLOTH.yellow, seats: CLOTH.blue, walls: PAPER },
  train: { colour: CLOTH.teal, seats: CLOTH.red, walls: PAPER },
  plane: { colour: '#e7ecf2', seats: CLOTH.navy, walls: '#eef1f5' },
  boat: { colour: SET_COLOURS.wood, seats: CLOTH.blue, walls: PAPER },
};

/** What is seen outside a vessel, across the whole width, to slide past as it goes: sky, hills, and the road or the sea. */
function drawOutside(
  vessel: SetVessel,
  bottom: number,
  random: () => number,
): string {
  const sky = flatRect(-10, -10, SET_W + 20, bottom + 20, SET_COLOURS.sky);
  const clouds = [0.15, 0.5, 0.82]
    .map((x) => cloud(x * SET_W, 150 + random() * 40, 0.55))
    .join('');
  if (vessel === 'plane')
    return (
      sky +
      [0.1, 0.35, 0.62, 0.9]
        .map((x) => cloud(x * SET_W, 330 + random() * 60, 0.9))
        .join('') +
      clouds
    );
  if (vessel === 'boat') {
    const shore = 360;
    return (
      sky +
      clouds +
      rolling(shore, 70, 4, random, SET_COLOURS.hills) +
      flatRect(-10, shore, SET_W + 20, bottom - shore + 10, SET_COLOURS.water) +
      Array.from({ length: 8 }, (_, k) =>
        flatRect(
          k * 200 + 40 + random() * 60,
          shore + 30 + random() * (bottom - shore - 60),
          60,
          6,
          '#e9f5fb',
          3,
        ),
      ).join('')
    );
  }
  // A road going by: its verge, houses and trees beyond, the road itself.
  const road = 430;
  let out =
    sky +
    clouds +
    rolling(road - 40, 90, 5, random, SET_COLOURS.hills) +
    flatRect(-10, road - 50, SET_W + 20, 60, SET_COLOURS.grass);
  for (let k = 0; k < 7; k += 1) {
    const cx = (k + 0.5) * (SET_W / 7) + (random() - 0.5) * 60;
    if (k % 2) {
      const w = 90 + random() * 30;
      const h = 70 + random() * 30;
      out +=
        rect(
          cx - w / 2,
          road - 36 - h,
          w,
          h,
          ['#efe3cf', '#f1e2c4'][k % 2 === 1 ? 0 : 1],
        ) +
        shape(
          `M${r1(cx - w / 2 - 10)},${r1(road - 34 - h)} L${r1(cx)},${r1(road - 76 - h)} L${r1(cx + w / 2 + 10)},${r1(road - 34 - h)} Z`,
          SET_COLOURS.roofs,
        ) +
        flatRect(cx - 12, road - 36 - h * 0.62, 24, 22, GLASS, 2);
    } else
      out +=
        rect(cx - 6, road - 90, 12, 54, SET_COLOURS.wood) +
        circle(cx, road - 110, 38, SET_COLOURS.leaves);
  }
  out +=
    flatRect(-10, road - 10, SET_W + 20, bottom - road + 20, '#a4a2a8') +
    Array.from({ length: 8 }, (_, k) =>
      flatRect(k * 200 + 50, road + 30, 90, 8, '#f3f1ec', 3),
    ).join('');
  return out;
}

/**
 * A vessel's far side from inside: its wall round its windows (what is
 * outside shows through them), its ceiling, its lights and its rail with
 * the straps hanging, its poles, and its door at the right.
 */
function drawVesselSide(
  vessel: SetVessel,
  colour: string,
  walls: string,
  floor: number,
): string {
  if (vessel === 'boat') {
    // An open deck: its far rail, the sea beyond it, and a mast.
    const rail = floor - 110;
    return (
      shape(
        `M-20,${r1(rail)} L${SET_W + 20},${r1(rail)} L${SET_W + 20},${r1(floor)} L-20,${r1(floor)} Z`,
        colour,
      ) +
      rect(-20, rail - 16, SET_W + 40, 18, shade(colour, 0.82), 4) +
      Array.from({ length: 12 }, (_, k) =>
        flatRect(-10, rail + 10 + k * 8, SET_W + 20, 2, shade(colour, 0.9)),
      )
        .slice(0, 10)
        .join('') +
      rect(1330, 40, 22, rail - 40, KIT_EXTRAS['dark wood'], 3) +
      shape(`M1352,70 L1352,${r1(rail - 60)} L1520,${r1(rail - 60)} Z`, PAPER)
    );
  }
  const ceiling = vessel === 'plane' ? 150 : 120;
  const sill = floor - (vessel === 'plane' ? 250 : 210);
  const glassTop = ceiling + 40;
  // The windows, and the door at the right with its glass.
  const doorX = vessel === 'plane' ? null : SET_W - 250;
  const holes: string[] = [];
  const frames: string[] = [];
  if (vessel === 'plane') {
    const n = 6;
    for (let k = 0; k < n; k += 1) {
      const cx = ((k + 0.5) / n) * SET_W;
      const cy = (glassTop + sill) / 2 - 10;
      holes.push(
        `M${r1(cx - 44)},${r1(cy)} a44,64 0 1,0 88,0 a44,64 0 1,0 -88,0 Z`,
      );
    }
  } else {
    const right = (doorX ?? SET_W) - 40;
    const n = vessel === 'train' ? 3 : 4;
    const gap = 44;
    const w = (right - 40 - gap * (n - 1)) / n;
    for (let k = 0; k < n; k += 1) {
      const x = 40 + k * (w + gap);
      const round = vessel === 'train' ? 26 : 12;
      holes.push(
        `M${r1(x + round)},${glassTop} L${r1(x + w - round)},${glassTop} Q${r1(x + w)},${glassTop} ${r1(x + w)},${glassTop + round} L${r1(x + w)},${r1(sill - round)} Q${r1(x + w)},${r1(sill)} ${r1(x + w - round)},${r1(sill)} L${r1(x + round)},${r1(sill)} Q${r1(x)},${r1(sill)} ${r1(x)},${r1(sill - round)} L${r1(x)},${glassTop + round} Q${r1(x)},${glassTop} ${r1(x + round)},${glassTop} Z`,
      );
      if (vessel === 'bus')
        frames.push(rect(x + w / 2 - 5, glassTop, 10, sill - glassTop, colour));
    }
    if (doorX !== null)
      holes.push(
        `M${doorX + 26},${glassTop} L${doorX + 204},${glassTop} L${doorX + 204},${r1(floor - 40)} L${doorX + 26},${r1(floor - 40)} Z`,
      );
  }
  const wall = `<path d="M-20,${ceiling} L${SET_W + 20},${ceiling} L${SET_W + 20},${r1(floor)} L-20,${r1(floor)} Z ${holes.join(' ')}" fill-rule="evenodd" ${fill(colour)}/>`;
  const panel = `<path d="M-20,${r1(sill + 18)} L${doorX !== null ? doorX : SET_W + 20},${r1(sill + 18)} L${doorX !== null ? doorX : SET_W + 20},${r1(floor)} L-20,${r1(floor)} Z" ${fill(walls)}/>`;
  const door =
    doorX !== null
      ? rect(
          doorX + 20,
          glassTop - 6,
          190,
          floor - glassTop - 28,
          shade(colour, 0.85),
          6,
        ) +
        `<path d="M${doorX + 32},${glassTop + 6} L${doorX + 110},${glassTop + 6} L${doorX + 110},${r1(floor - 48)} L${doorX + 32},${r1(floor - 48)} Z M${doorX + 120},${glassTop + 6} L${doorX + 198},${glassTop + 6} L${doorX + 198},${r1(floor - 48)} L${doorX + 120},${r1(floor - 48)} Z" fill-rule="evenodd" ${fill(GLASS)}/>`
      : '';
  const top =
    rect(-20, -20, SET_W + 40, ceiling + 20, walls) +
    [0.18, 0.5, 0.82]
      .map(
        (x) =>
          `<ellipse cx="${r1(x * SET_W)}" cy="${r1(ceiling * 0.4)}" rx="70" ry="14" ${fill('#fff6d8')}/>`,
      )
      .join('');
  const rail =
    vessel === 'plane'
      ? rect(-20, ceiling - 20, SET_W + 40, 40, shade(walls, 0.94), 6)
      : rect(-20, ceiling + 6, SET_W + 40, 12, STEEL, 6);
  const straps =
    vessel === 'bus'
      ? Array.from({ length: 7 }, (_, k) => {
          const x = 110 + k * 190;
          return (
            rect(x - 4, ceiling + 14, 8, 64, colour, 3) +
            `<circle cx="${x}" cy="${ceiling + 92}" r="16" fill="none" stroke-width="${INK_W * 1.5}" stroke="${FIGURE_INK}"/><circle cx="${x}" cy="${ceiling + 92}" r="16" fill="none" stroke-width="${INK_W * 0.6}" stroke="${PAPER}"/>`
          );
        }).join('')
      : vessel === 'train'
        ? rect(40, ceiling + 30, (doorX ?? SET_W) - 80, 16, STEEL, 4)
        : '';
  const poles =
    vessel === 'bus'
      ? [0.3, 0.62]
          .map((x) =>
            rect(
              x * SET_W - 9,
              ceiling + 10,
              18,
              floor - ceiling - 6,
              colour,
              6,
            ),
          )
          .join('')
      : '';
  return top + wall + frames.join('') + panel + door + rail + straps + poles;
}

/** What stands before the people's legs where they are in it: the boat's side, a table, a counter, a wall. */
function drawFront(words: string, colour: string | null): string {
  const top = SET_H - SET_H * 0.2;
  if (/\b(?:boat|canoe|ship|ark|raft|ferry|hull|side)\b/iu.test(words)) {
    const c = colour ?? SET_COLOURS.wood;
    return (
      shape(
        `M-20,${r1(top)} Q${SET_W / 2},${r1(top + 26)} ${SET_W + 20},${r1(top)} L${SET_W + 20},${SET_H + 20} L-20,${SET_H + 20} Z`,
        c,
      ) +
      rect(-20, top - 12, SET_W + 40, 20, shade(c, 0.8), 8) +
      flatRect(-10, top + 60, SET_W + 20, 5, shade(c, 0.88)) +
      flatRect(-10, top + 110, SET_W + 20, 5, shade(c, 0.88))
    );
  }
  if (/\b(?:table|desk|counter|bar|bench|altar)\b/iu.test(words)) {
    const c = colour ?? SET_COLOURS.wood;
    return (
      rect(-20, top, SET_W + 40, SET_H - top + 20, shade(c, 0.9)) +
      rect(-20, top - 18, SET_W + 40, 26, c, 6)
    );
  }
  const c = colour ?? '#d8cbb3';
  return (
    rect(-20, top, SET_W + 40, SET_H - top + 20, c) +
    rect(-20, top - 14, SET_W + 40, 18, shade(c, 0.85), 3)
  );
}

/** A thing about to be drawn: where, how big, in which band of the set. */
interface Placing {
  piece: SetPiece;
  /** What it is, when the layout placed it (a kind of its list, or a landmark's builder). */
  kind?: string;
  /** Its middle across, and its feet, in the set's units. */
  x: number;
  y: number;
  s: number;
  /** Its row, the wall it hangs on, the floor it lies on, or (in a style pack) the far edge of the ground: what it keeps apart from. */
  band: SetRow | 'wall' | 'flat' | 'horizon';
  hang?: boolean;
  flip?: boolean;
  id?: string;
  lives?: 'sway' | 'flicker';
  counter?: boolean;
  own?: boolean;
  /** Where it stands is fixed: a feature at its spot, a vessel's seats. The rest move aside. */
  fixed?: boolean;
  /** Scattered by code, kept clear of where the action is. */
  clutter?: boolean;
  /** How much it was scaled to its real height (studio-scenery-plan §5.8); 1 for one drawn true. */
  real?: number;
  /** Sized to the frame, not to life (a landmark), or far off: its size is not checked. */
  free?: boolean;
}

/** A placing's reach across, in the set's units. */
const reachOf = (one: Placing): [number, number] => {
  const [vx, , vw] = one.piece.viewBox;
  const a = one.x + (one.flip ? -(vx + vw) : vx) * one.s;
  return [a, a + vw * one.s];
};

/** How much of the width some placings cover, as a share. */
function covered(placings: Placing[]): number {
  const spans = placings
    .map(reachOf)
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(SET_W, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total / SET_W;
}

/**
 * Things in one band moved apart until none covers another by more than
 * a little, and each kept within the frame by at least half of itself:
 * two shelves at the same spot of the wall hang side by side.
 */
function spreadOut(placings: Placing[]): void {
  const bands = new Map<string, Placing[]>();
  for (const one of placings) {
    if (one.band === 'flat') continue;
    const list = bands.get(one.band) ?? [];
    list.push(one);
    bands.set(one.band, list);
  }
  const within = (one: Placing) => {
    const [a, b] = reachOf(one);
    const w = b - a;
    if (a < -w * 0.35) one.x += -w * 0.35 - a;
    if (b > SET_W + w * 0.35) one.x -= b - SET_W - w * 0.35;
  };
  for (const list of bands.values()) {
    for (const one of list) if (!one.fixed) within(one);
    for (let pass = 0; pass < 6; pass += 1) {
      let moved = false;
      list.sort((a, b) => a.x - b.x);
      for (let i = 1; i < list.length; i += 1) {
        const left = list[i - 1];
        const right = list[i];
        const [, lb] = reachOf(left);
        const [ra] = reachOf(right);
        const room =
          Math.min(lb - reachOf(left)[0], reachOf(right)[1] - ra) * 0.12;
        const over = lb - ra - room;
        if (over <= 0) continue;
        moved = true;
        if (left.fixed && right.fixed) continue;
        if (left.fixed) right.x += over;
        else if (right.fixed) left.x -= over;
        else {
          left.x -= over / 2;
          right.x += over / 2;
        }
      }
      for (const one of list) if (!one.fixed) within(one);
      if (!moved) break;
    }
  }
}

/** The layers of a layered set, back to front (studio-scenery-plan §2). */
export const SET_LAYER_IDS = [
  'sky',
  'far',
  'back',
  'ground',
  'stage',
  'floor',
  'foreground',
] as const;
export type SetLayerId = (typeof SET_LAYER_IDS)[number];
/**
 * How each layer follows the camera, its depth factor f: a pan of Δx
 * moves it f·Δx and a zoom of s scales it 1 + (s − 1)·f. 1 is the
 * people's own plane; less is farther off, more is nearer the camera. The
 * foreground's is its own, 1.2 to 1.55 by how near its things are.
 */
export const LAYER_DEPTH: Record<SetLayerId, number> = {
  sky: 0.03,
  far: 0.2,
  back: 0.45,
  ground: 0.72,
  stage: 0.78,
  floor: 1,
  foreground: 1.2,
};
export const FOREGROUND_DEPTH: readonly [number, number] = [1.2, 1.55];

/** One flat layer of a set: which, how it follows the camera, and its drawing at the set's width × 900. */
export interface SetLayer {
  id: SetLayerId;
  depth: number;
  svg: string;
  /** On the floor with the people (its things stand among them): where their feet are, in the set's units, for the order they are drawn in. */
  feet?: number;
}

/** The floor people stand on, in the set's units: its back and front edges, and the eye line its pinhole scales by (scaleAtFeet). */
export interface SetFloor {
  back: number;
  front: number;
  eye: number;
}

/** A set as layers (studio-scenery-plan §3.2): the layers, its width, its floor, and each thing before the camera, by its group. */
export interface SetLayering {
  layers: SetLayer[];
  /** In the set's units: 1600, or wider for a camera that pans (L4). */
  width: number;
  floor: SetFloor;
  fore: { id: string; box: [number, number, number, number] }[];
}

/** A set built from its layout: its SVG, its groups by their names, and its layers. */
export interface BuiltSet {
  svg: string;
  parts: Record<string, string>;
  layered: SetLayering;
  /** What code did to make it sound, and what it wanted in the kit, for the log. */
  notes: string[];
  /** Each thing placed: what, where its feet are, its scale and reach, its row; for the checks. */
  placed: PlacedPiece[];
}

/** A thing as it was placed in a set, in the set's units. */
export interface PlacedPiece {
  kind?: string;
  x: number;
  y: number;
  s: number;
  band: string;
  /** Its box: left, top, width, height. */
  box: [number, number, number, number];
  /** How much it was scaled to its real height; its scale per metre is s over this. */
  real: number;
  clutter?: boolean;
  free?: boolean;
}

/** The floor of a place of this kind, in the set's units (studio-scenery-plan §4.2): from where people stand farthest off to the front edge. */
export function floorOf(kind: PlaceKind): SetFloor {
  const eye = EYE[kind];
  const at = (k: number) => Math.round((eye + k * (FEET - eye)) * 10) / 10;
  return {
    back: at(FLOOR_BACK_K),
    front: Math.min(SET_H - 8, at(FLOOR_FRONT_K)),
    eye: Math.round(eye * 10) / 10,
  };
}

/** A layer's own drawing, in the set's frame and the kit's line. */
const layerSvg = (inner: string, world = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SET_W} ${SET_H}"${world}>` +
  `<g stroke="${FIGURE_INK}" stroke-width="${INK_W}" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;

/**
 * A place drawn from its layout, at 1600 × 900. `own` are the drawings
 * the artist made of the things the list has no piece for, by their
 * names; one missing is left out.
 *
 * Drawn twice from the same pieces: flat, as one picture (for a book, an
 * older player, and the stills), and as the layers the player moves at
 * their own depths (studio-scenery-plan §2). A layout written before the
 * layers (back, middle and front rows) is drawn flat exactly as it always
 * was; its back row is the back layer, its middle row the stage, and its
 * front row stands on the floor with the people.
 *
 * A layout in a style pack (L3, §5) is drawn richer: its buildings from
 * the pack's parts, its clutter scattered clear of where the action is,
 * its ground textured, every piece its real height for where it stands
 * (and none larger per metre than what stands before it), its landmarks
 * built from their parameters, and a crowd before the camera where
 * people watch. Out of doors, what stands at the back stands on the far
 * edge of the ground, on the back layer, and the ground is one layer
 * whole: no seam can open between them as the layers part.
 */
export function buildSet(
  layout: SetLayout,
  place: StoryPlace,
  own: Record<string, SetPiece> = {},
): BuiltSet {
  const kind: PlaceKind = place.kind ?? 'outdoor';
  const random = seeded(`${place.id}:${place.name}`);
  const floor = FLOOR_LINE[kind];
  const studio = place.features !== undefined;
  const { staged, drawn } = featuresOf(place);
  const pack = layout.style ? STYLE_PACKS[layout.style] : null;
  /** Out of doors in a style pack: its back row on the ground's far edge, and its ground whole. */
  const horizon = pack !== null && kind === 'outdoor';
  const notes: string[] = [];
  const parts: Record<string, string> = { ground: 'ground' };
  const out: string[] = [];
  const layers: Record<SetLayerId, string[]> = {
    sky: [],
    far: [],
    back: [],
    ground: [],
    stage: [],
    floor: [],
    foreground: [],
  };
  const SIDE = 110;
  const DROP = 70;
  /** The ground's own colour, far off: what shows wherever the layers part as the camera moves. */
  const plainGround =
    layout.groundColour ??
    (kind === 'vessel' && layout.vessel !== 'boat' && layout.ground === 'stone'
      ? VESSEL_FLOOR
      : layout.weather === 'snow' && layout.ground === 'grass'
        ? GROUND.snow
        : GROUND[layout.ground]);
  const groundColour =
    horizon && !layout.groundColour
      ? packColour(pack, plainGround)
      : plainGround;
  const underlay = flatRect(
    -20,
    floor - 2,
    SET_W + 40,
    SET_H - floor + 22,
    groundColour,
  );

  // Behind everything: the sky and what stands behind the ground, a
  // room's walls, or what a vessel's windows look out on and its side.
  if (kind === 'outdoor') {
    const sky = `<g id="sky">${drawSky(layout, floor, random, pack)}</g>`;
    out.push(sky);
    layers.sky.push(sky, underlay);
    const own = pack?.backdropFor[layout.backdrop];
    const backdrop =
      own && (SET_BACKDROPS as readonly string[]).includes(own)
        ? (own as SetBackdrop)
        : layout.backdrop;
    const back = drawBackdrop(layout, floor, random, pack, backdrop);
    if (back) {
      out.push(`<g id="backdrop">${back}</g>`);
      layers.far.push(underlay, `<g id="backdrop">${back}</g>`);
    }
  } else if (kind === 'indoor') {
    // Walls a little paler than their colour, so the people stand out.
    const walls = `<g id="walls">${drawRoom(layout.walls ? shade(layout.walls, 1.4) : SET_COLOURS.walls, floor, SIDE, DROP)}</g>`;
    out.push(walls);
    layers.back.push(walls);
  } else {
    const vessel = layout.vessel ?? 'bus';
    const look = VESSEL_LOOK[vessel];
    const outside = `<g id="outside">${drawOutside(vessel, floor, random)}</g>`;
    out.push(outside);
    layers.far.push(outside);
    parts.outside = 'outside';
    const side = `<g id="side">${drawVesselSide(vessel, layout.vesselColour ?? look.colour, layout.walls ? shade(layout.walls, 1.4) : look.walls, floor)}</g>`;
    out.push(side);
    layers.back.push(side);
  }

  // Where the things stand: their rows, their scale, and out of the way
  // of the stage's own pieces and of the middle of the open ground.
  const clear = staged.map((f) => SPOT_AT[f.spot] ?? 0.5);
  const placings: Placing[] = [];
  /** The sides a tall thing in front already frames. */
  const framed = new Set<'left' | 'right'>();
  const counts = (item: SetItem) =>
    kind === 'outdoor' &&
    studio &&
    ((COUNTERS as readonly string[]).includes(item.kind) ||
      item.kind === 'stall' ||
      item.kind === 'crate' ||
      item.kind === 'table');
  /** Where something stands on the far edge of the ground, and how big it is there. */
  const atEdge = floor + 2;
  const farOff = (piece: SetPiece, k: number): { y: number; s: number } => {
    const y = rowFeet(kind, 'far');
    const tall = Math.max(1, -piece.viewBox[1]);
    return {
      y,
      s: Math.min(scaleAtFeet(kind, y) * FAR_K * k, (FAR_MOST * SET_H) / tall),
    };
  };
  let n = 0;
  const scattered: Scattered[] = pack
    ? clutterOfPack(layout, place, pack, clear)
    : clutterOf(layout, place);
  for (let item of [...layout.items, ...scattered] as Scattered[]) {
    const key = `${place.id}:${place.name}:${item.kind}:${n}`;
    n += 1;
    // One the stage draws itself, placed again by the painter where it
    // stands (the yard's gate, told to leave it out): drawn once, the
    // stage's, never a second behind it.
    if (
      staged.some(
        (f) =>
          f.kind === item.kind &&
          Math.abs((SPOT_AT[f.spot] ?? 0.5) - item.x) < STAGED_NEAR,
      )
    )
      continue;
    // A window or a door is a room's, on its wall; a vessel has its own.
    if ((item.kind === 'window' || item.kind === 'door') && kind !== 'indoor')
      continue;
    if (item.kind === 'window') item = { ...item, kind: 'curtains' };
    const piece = pieceOf(item.kind, item.colour, placings.length, pack, key);
    const [, vy, vw] = piece.viewBox;
    if ((HANGING as readonly string[]).includes(item.kind)) {
      // Only on a wall: on the back wall, at the back row's scale, its
      // foot as high as it hangs (in a vessel, above its windows' sill).
      if (kind === 'outdoor') continue;
      const s = scaleAtFeet(kind, rowFeet(kind, 'back')) * item.scale;
      const high = piece.hangs ?? 100;
      const top = kind === 'vessel' ? floor - 230 : floor;
      placings.push({
        piece,
        kind: item.kind,
        x: item.x * SET_W,
        y: top - high * s,
        s,
        band: 'wall',
        hang: true,
      });
      continue;
    }
    const isFlat = (FLAT as readonly string[]).includes(item.kind);
    /** In a style pack, its real height for where it stands (§5.8). */
    const real =
      pack && !isFlat && !isBuildingKind(item.kind)
        ? realScaleOf(item.kind, -vy)
        : 1;
    const also = {
      ...(item.clutter ? { clutter: true } : {}),
      ...(pack ? { real } : {}),
    };
    // In a vessel its aisle is open: what stands is along its far side.
    // Far off is out of doors only: in a room, it is against its wall.
    let row: SetRow = isFlat
      ? 'middle'
      : kind === 'vessel' && item.row === 'middle'
        ? 'back'
        : kind !== 'outdoor' && item.row === 'far'
          ? 'back'
          : item.row;
    // Far off, in a style pack: a share of the frame, not a size.
    if (pack && row === 'far') {
      const { y, s } = farOff(piece, item.scale * real);
      placings.push({
        piece,
        kind: item.kind,
        x: item.x * SET_W,
        y,
        s,
        band: 'far',
        free: true,
        ...(item.flip ? { flip: true } : {}),
        ...(piece.lives ? { lives: piece.lives } : {}),
        ...also,
      });
      continue;
    }
    // At the back out of doors, a tall thing stands on the far edge of the
    // ground; the rest at the back of the ground before it.
    const toEdge = () =>
      placings.push({
        piece,
        kind: item.kind,
        x: item.x * SET_W,
        y: atEdge,
        s: scaleAtFeet(kind, atEdge) * HORIZON_K * item.scale * real,
        band: 'horizon',
        ...(item.flip ? { flip: true } : {}),
        ...(piece.lives ? { lives: piece.lives } : {}),
        ...(counts(item) ? { counter: true } : {}),
        ...also,
      });
    if (horizon && !isFlat && row === 'back' && AT_HORIZON.has(item.kind)) {
      toEdge();
      continue;
    }
    let x = item.x;
    const s0 = scaleAtFeet(kind, rowFeet(kind, row)) * item.scale * real;
    const half = (vw * s0) / 2 / SET_W;
    const tall = (-vy * s0) / SET_H;
    // The front row frames the picture: only something tall, one at each
    // side at its very edge; anything else stands farther back.
    if (!isFlat && row === 'front' && !item.edge) {
      const side = x < 0.5 ? 'left' : 'right';
      if (tall < 0.4 || framed.has(side)) row = 'middle';
      else {
        framed.add(side);
        x = side === 'left' ? Math.min(x, 0.06) : Math.max(x, 0.94);
      }
    }
    if (
      !isFlat &&
      row === 'middle' &&
      tall > 0.28 &&
      x > 0.3 - half &&
      x < 0.7 + half
    )
      x = x < 0.5 ? Math.min(0.3 - half, 0.16) : Math.max(0.7 + half, 0.84);
    // Clear of what the stage draws itself, nearer than the back.
    if (
      !isFlat &&
      !item.edge &&
      (row === 'middle' || row === 'front') &&
      clear.some((c) => Math.abs(c - x) < 0.1 + half)
    ) {
      if (horizon && AT_HORIZON.has(item.kind)) {
        toEdge();
        continue;
      }
      row = 'back';
    }
    // Clutter at an edge of the floor stands between the middle and the front, low.
    const y = item.edge
      ? rowFeet(kind, 'middle') +
        (rowFeet(kind, 'front') - rowFeet(kind, 'middle')) * EDGE_NEARER
      : rowFeet(kind, row);
    // What frames the picture at its sides is the kit's size, cut by the
    // frame as it is: a palm its real height there would be all trunk.
    const here = row === 'front' && !item.edge ? 1 : real;
    let s = scaleAtFeet(kind, y) * item.scale * here;
    // Before the camera, low or at the sides (§8.4): at most the bottom
    // three tenths of the frame, else in its outer eighth.
    if (row === 'foreground' && x > 0.12 && x < 0.88) {
      const low = SET_H * 0.7;
      const fits = (y - low) / Math.max(1, -vy);
      if (y + vy * s < low) {
        if (fits >= s * 0.6) s = fits;
        else x = x < 0.5 ? 0.05 : 0.95;
      }
    }
    placings.push({
      piece,
      kind: item.kind,
      x: x * SET_W,
      y,
      s,
      band: isFlat ? 'flat' : row,
      ...(item.flip ? { flip: true } : {}),
      ...(piece.lives ? { lives: piece.lives } : {}),
      ...(counts(item) ? { counter: true } : {}),
      ...also,
      ...(pack ? { real: here } : {}),
      ...(pack && row === 'foreground' ? { free: true } : {}),
    });
  }
  // The things the artist drew, where the layout put them; and the
  // landmarks code builds from their parameters.
  for (const item of layout.own) {
    if (item.build) {
      const landmark = landmarkPlacing(item.build, item, kind, horizon, floor);
      placings.push(landmark);
      continue;
    }
    const piece = own[item.name];
    if (!piece) continue;
    if (pack)
      notes.push(
        `wanted in the kit: ${item.name} (drawn by the artist this time)`,
      );
    if (pack && item.row === 'far' && kind === 'outdoor') {
      const { y, s } = farOff(piece, 1);
      placings.push({
        piece,
        x: item.x * SET_W,
        y,
        s,
        band: 'far',
        own: true,
        free: true,
      });
      continue;
    }
    const row: SetRow =
      item.row === 'front' || item.row === 'foreground' || item.row === 'far'
        ? 'back'
        : item.row;
    const y = rowFeet(kind, row);
    const s = scaleAtFeet(kind, y);
    let x = item.x;
    const half = (piece.viewBox[2] * s) / 2 / SET_W;
    if (row === 'middle' && x > 0.3 - half && x < 0.7 + half)
      x = x < 0.5 ? 0.16 : 0.84;
    placings.push({
      piece,
      x: x * SET_W,
      y,
      s,
      band: row,
      own: true,
      ...(pack ? { free: true } : {}),
    });
  }
  // A vessel's seats along its far side, unless the layout placed its own.
  if (
    kind === 'vessel' &&
    layout.vessel !== 'boat' &&
    !layout.items.some((one) => one.kind === 'seats')
  ) {
    const seats = drawScenery(
      'seats',
      VESSEL_LOOK[layout.vessel ?? 'bus'].seats,
    );
    const y = rowFeet(kind, 'back');
    const s = scaleAtFeet(kind, y);
    const right = layout.vessel === 'plane' ? SET_W : SET_W - 290;
    const n = layout.vessel === 'plane' ? 5 : 4;
    for (let k = 0; k < n; k += 1)
      placings.push({
        piece: seats,
        x: 60 + ((k + 0.5) * (right - 60)) / n,
        y,
        s,
        band: 'back',
        fixed: true,
      });
  }
  // The features of the set it draws itself (a stall, a well, one its
  // look names), each its own group, where it stands.
  for (const feature of drawn) {
    if (feature.kind === DRAWN) continue;
    const row: SetRow = feature.spot === 'back' ? 'back' : 'middle';
    const y = rowFeet(kind, row);
    const id = featureGroup(feature.id);
    parts[id] = id;
    placings.push({
      piece: drawPiece(feature.kind, feature.name),
      kind: feature.kind,
      x: (SPOT_AT[feature.spot] ?? 0.5) * SET_W,
      y,
      s: scaleAtFeet(kind, y),
      band: row,
      id,
      fixed: true,
      ...(pack ? { real: 1 } : {}),
    });
  }
  // The middle of the ground kept open: what stands between covers at
  // most two fifths of its width, the widest going back first.
  for (const one of [...placings]
    .filter((p) => p.band === 'middle' && !p.fixed && !p.own)
    .sort(
      (a, b) => reachOf(b)[1] - reachOf(b)[0] - (reachOf(a)[1] - reachOf(a)[0]),
    )) {
    if (covered(placings.filter((p) => p.band === 'middle')) <= 0.4) break;
    const k = one.s / scaleAtFeet(kind, one.y);
    one.band = 'back';
    one.y = rowFeet(kind, 'back');
    one.s = scaleAtFeet(kind, one.y) * k;
  }
  // In a style pack, what code scatters finds its own room after (below),
  // and never pushes what the painter placed into where the action is.
  spreadOut(pack ? placings.filter((one) => !one.clutter) : placings);
  if (pack) {
    // Clutter never where the action is (§5.3): moved out to its nearer
    // side, and on past whatever it would then stand on; left out when
    // that is off the set.
    const focal = layout.focal?.x ?? 0.5;
    const lo = (focal - FOCAL_HALF) * SET_W;
    const hi = (focal + FOCAL_HALF) * SET_W;
    const settled = placings.filter((p) => !p.clutter);
    const scatter = placings
      .filter((p) => p.clutter)
      .sort(
        (a, b) => Math.abs(a.x - focal * SET_W) - Math.abs(b.x - focal * SET_W),
      );
    const dropped = new Set<Placing>();
    for (const one of scatter) {
      const [a0, b0] = reachOf(one);
      let way = 0;
      if (b0 > lo && a0 < hi) {
        const left = one.x - (b0 - lo);
        const right = one.x + (hi - a0);
        way =
          Math.abs(left - one.x) <= Math.abs(right - one.x) && left > 0
            ? -1
            : 1;
        one.x = way < 0 ? left : right;
      }
      // Past what it would overlap in its own band, the same way; else the
      // other way, while that keeps it out of where the action is.
      way ||= one.x < focal * SET_W ? -1 : 1;
      const from = one.x;
      const clearWay = (dir: number): boolean => {
        one.x = from;
        for (let pass = 0; pass < 12; pass += 1) {
          const [a, b] = reachOf(one);
          if (b > lo && a < hi) return false;
          // It may stand at the foot of what the painter placed, as a drum
          // by a kiosk; never on more of the clutter than half of it; on
          // the far edge, a pole before a house as it would.
          const hit =
            one.band === 'horizon'
              ? undefined
              : settled.find((other) => {
                  if (other.band !== one.band || !other.clutter) return false;
                  const [c, d] = reachOf(other);
                  return (
                    Math.min(b, d) - Math.max(a, c) >
                    Math.min(b - a, d - c) * 0.45
                  );
                });
          if (!hit) return one.x >= 0 && one.x <= SET_W;
          const [c, d] = reachOf(hit);
          one.x += dir < 0 ? c - b : d - a;
        }
        return false;
      };
      if (clearWay(way) || clearWay(-way)) settled.push(one);
      else dropped.add(one);
    }
    for (let k = placings.length - 1; k >= 0; k -= 1)
      if (dropped.has(placings[k])) placings.splice(k, 1);
    // Nothing larger, metre for metre, than what stands before it (§8.1).
    const sized = placings.map((one) => ({
      y: one.y,
      perMetre: one.s / (one.real ?? 1),
      free:
        one.free ||
        one.hang === true ||
        one.band === 'flat' ||
        one.band === 'far' ||
        one.band === 'wall' ||
        one.real === undefined,
    }));
    for (const { index, perMetre } of checkSizes(sized)) {
      const one = placings[index];
      one.s = perMetre * (one.real ?? 1);
      notes.push(
        `size: the ${one.kind ?? 'thing'} at ${Math.round((one.x / SET_W) * 100)}% made no larger, metre for metre, than what stands before it`,
      );
    }
  }
  // A chair beside a desk or a table faces it.
  for (const chair of placings.filter((one) => one.kind === 'chair')) {
    const near = placings
      .filter(
        (one) =>
          (one.kind === 'desk' || one.kind === 'table') &&
          one.band === chair.band,
      )
      .sort((a, b) => Math.abs(a.x - chair.x) - Math.abs(b.x - chair.x))[0];
    if (near && Math.abs(near.x - chair.x) < 260) chair.flip = near.x < chair.x;
  }

  const drawnAt = (one: Placing) =>
    placed(one.piece, one.x, one.y, one.s, {
      ...(one.flip ? { flip: true } : {}),
      ...(one.id ? { id: one.id } : {}),
      ...(one.lives ? { lives: one.lives } : {}),
      ...(one.own ? { own: true } : {}),
      world: {
        ...(one.kind ? { kind: one.kind } : {}),
        row: one.band,
      },
    });
  // Far off on the horizon, before the ground's far edge.
  const far = placings
    .filter((one) => one.band === 'far')
    .sort((a, b) => a.y - b.y)
    .map(drawnAt);
  out.push(...far);
  layers.far.push(...far);
  const hanging = placings.filter((one) => one.hang).map(drawnAt);
  out.push(...hanging);
  layers.back.push(...hanging);
  // On the far edge of the ground, its feet under the ground's edge.
  const onEdge = placings
    .filter((one) => one.band === 'horizon')
    .sort((a, b) => a.y - b.y)
    .map(drawnAt);
  out.push(...onEdge);
  layers.back.push(...onEdge);
  // The ground or floor, with what lies flat on it: exactly what people stand on.
  const floorLayout =
    kind === 'vessel' &&
    !layout.groundColour &&
    layout.vessel !== 'boat' &&
    layout.ground === 'stone'
      ? { ...layout, groundColour: VESSEL_FLOOR }
      : layout;
  const ground =
    kind === 'outdoor'
      ? pack
        ? drawGroundL3(layout, floor, random, pack)
        : drawGround(layout, floor, random)
      : kind === 'indoor'
        ? drawFloor(layout, floor, SIDE, DROP)
        : drawFloor(floorLayout, floor, -20, 0);
  const flats = placings
    .filter((one) => one.band === 'flat')
    .map(drawnAt)
    .join('');
  out.push(`<g id="ground">${ground}${flats}</g>`);
  if (horizon)
    // One layer, whole: what stands at the back stands on its far edge.
    layers.ground.push(`<g id="ground">${ground}${flats}</g>`);
  else {
    // As layers, the ground is cut where the back row stands: its far part
    // lies under the back row, in the back layer, so the ground nearer the
    // camera never covers their feet as the layers part; and it runs on a
    // little under the ground's near part, so no seam opens between them.
    const seam = rowFeet(kind, 'back') + 8;
    // Each tuft of grass answers the world on the one layer it is seen on.
    layers.back.push(`<g>${tuftsWhere(ground, (y) => y < seam)}</g>`);
    layers.ground.push(
      `<defs><clipPath id="near-ground"><rect x="-20" y="${r1(seam)}" width="${SET_W + 40}" height="${r1(SET_H - seam + 40)}"/></clipPath></defs>` +
        `<g clip-path="url(#near-ground)"><g id="ground">${tuftsWhere(ground, (y) => y >= seam)}${flats}</g></g>`,
    );
  }

  // Back to front; what someone could stand behind together, as "props".
  const standing = placings
    .filter(
      (one) =>
        !one.hang &&
        one.band !== 'flat' &&
        one.band !== 'far' &&
        one.band !== 'horizon' &&
        one.band !== 'foreground',
    )
    .sort((a, b) => a.y - b.y);
  const props = standing.filter((one) => one.counter);
  const rest = standing.filter((one) => !one.counter);
  const backRow = rest.filter((one) => one.band === 'back').map(drawnAt);
  out.push(...backRow);
  // Before the whole ground, in a style pack out of doors: on the stage's layer.
  if (horizon) layers.stage.push(...backRow);
  else layers.back.push(...backRow);
  if (props.length) {
    const group = `<g id="props">${props.map(drawnAt).join('')}</g>`;
    out.push(group);
    layers.stage.push(group);
    parts.props = 'props';
  }
  for (const one of rest.filter((one) => one.band !== 'back')) {
    const drawnOne = drawnAt(one);
    out.push(drawnOne);
    // On the floor among the people, with its contact shadow, as theirs.
    if (one.band === 'front') layers.floor.push(contactShadow(one), drawnOne);
    else layers.stage.push(drawnOne);
  }

  // Before the people's legs, where they are in it: over them, as the
  // stage draws it from the flat picture (it moves with them).
  if (place.front && place.stand === 'in') {
    out.push(
      `<g id="front">${drawFront(place.front, layout.vesselColour)}</g>`,
    );
    parts.front = 'front';
  }

  // Before the camera: each its own group, so one can be faded while a
  // face behind it speaks.
  const fore = placings
    .filter((one) => one.band === 'foreground')
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((one, k) => ({ one, id: `fg-${k + 1}` }));
  for (const { one, id } of fore) {
    const drawnOne = drawnAt({ ...one, id });
    out.push(drawnOne);
    layers.foreground.push(drawnOne);
  }
  // And the people watching, their backs to the camera (§5.5).
  let watching: SetLayering['fore'] = [];
  if (pack && layout.audience) {
    const words = `${place.name} ${place.look}`;
    const audience = drawAudience({
      rows: layout.audience,
      spread: audienceFor(words)?.spread ?? 'full',
      seed: `${place.id}:${place.name}`,
      world: PACK_WORLD[pack.id],
      kind,
      focal: layout.focal?.x ?? 0.5,
      children: /\b(?:class ?rooms?|school|lessons?|pupils|children)\b/iu.test(
        words,
      ),
      W: SET_W,
      H: SET_H,
    });
    // On its layer only: the flat picture's ground is read by what stands
    // on it (measureGround), and rows of heads across its foot are none of it.
    if (audience.markup) {
      layers.foreground.push(audience.markup);
      watching = audience.fore;
    }
  }

  // What the stage needs to know of the place to make it answer the
  // world: what kind of place, what people walk on, and where the open
  // ground meets what stands behind it (studio-world-plan §5); in a
  // style pack, which, and the life about it.
  const world =
    ` data-place="${kind}" data-ground="${layout.ground}" data-floor="${r1(floor)}"` +
    (pack
      ? ` data-style="${pack.id}" data-ambient="${pack.ambient.join(' ')}"`
      : '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SET_W} ${SET_H}"${world}>` +
    `<g stroke="${FIGURE_INK}" stroke-width="${INK_W}" stroke-linejoin="round" stroke-linecap="round">${out.join('')}</g></svg>`;
  // Nearer, the larger its things are drawn.
  const nearness = fore.length
    ? Math.min(
        1,
        Math.max(
          0,
          (fore.reduce(
            (sum, { one }) => sum + one.s / scaleAtFeet(kind, one.y),
            0,
          ) /
            fore.length -
            0.6) /
            0.9,
        ),
      )
    : 0;
  const depthOf = (id: SetLayerId) =>
    id === 'foreground'
      ? Math.round(
          (FOREGROUND_DEPTH[0] +
            (FOREGROUND_DEPTH[1] - FOREGROUND_DEPTH[0]) * nearness) *
            100,
        ) / 100
      : LAYER_DEPTH[id];
  const layerList = SET_LAYER_IDS.flatMap((id): SetLayer[] =>
    layers[id].length || id === 'ground'
      ? [
          {
            id,
            depth: depthOf(id),
            // Each says what place it is of, as the flat one does, and
            // which layer it is, for the stage's world to answer in it.
            svg: layerSvg(
              layers[id].join(''),
              pack
                ? ` data-place="${kind}" data-ground="${layout.ground}" data-floor="${r1(floor)}" data-layer="${id}" data-style="${pack.id}"`
                : `${world} data-layer="${id}"`,
            ),
            ...(id === 'floor' ? { feet: rowFeet(kind, 'front') } : {}),
          },
        ]
      : [],
  );
  if (pack) {
    // The budget for what does not move (studio-scenery-plan §7.3).
    const elements = layerList
      .filter((one) => one.id !== 'floor')
      .reduce(
        (sum, one) => sum + (one.svg.match(/<[a-zA-Z]/g) ?? []).length,
        0,
      );
    if (elements > ELEMENT_BUDGET)
      notes.push(
        `budget: ${elements} shapes on the layers that do not move, over ${ELEMENT_BUDGET}: the player flattens them`,
      );
  }
  return {
    svg,
    parts,
    layered: {
      layers: layerList,
      width: SET_W,
      floor: floorOf(kind),
      fore: [
        ...fore.map(({ one, id }) => {
          const [a, b] = reachOf(one);
          const [, vy, , vh] = one.piece.viewBox;
          return {
            id,
            box: [r1(a), r1(one.y + vy * one.s), r1(b - a), r1(vh * one.s)] as [
              number,
              number,
              number,
              number,
            ],
          };
        }),
        ...watching,
      ],
    },
    notes,
    placed: placings.map((one) => {
      const [a, b] = reachOf(one);
      const [, vy, , vh] = one.piece.viewBox;
      return {
        ...(one.kind ? { kind: one.kind } : {}),
        x: r1(one.x),
        y: r1(one.y),
        s: Math.round(one.s * 1000) / 1000,
        band: one.band,
        box: [r1(a), r1(one.y + vy * one.s), r1(b - a), r1(vh * one.s)],
        real: one.real ?? 1,
        ...(one.clutter ? { clutter: true } : {}),
        ...(one.free ? { free: true } : {}),
      };
    }),
  };
}

/** A landmark built from its parameters, where its layout put it: sized to the frame, its top within it. */
function landmarkPlacing(
  build: NonNullable<SetOwnItem['build']>,
  item: SetOwnItem,
  kind: PlaceKind,
  horizon: boolean,
  floor: number,
): Placing {
  const piece = drawLandmark(build.kind, build.params);
  const spec = LANDMARKS[build.kind];
  const size = Number(build.params.size);
  let row: SetRow =
    item.row === 'front' || item.row === 'foreground' ? 'middle' : item.row;
  if (kind !== 'outdoor' && row === 'far') row = 'back';
  const onEdge = horizon && row === 'back';
  const y =
    row === 'far'
      ? rowFeet(kind, 'far')
      : onEdge
        ? floor + 2
        : rowFeet(kind, row);
  const [, vy, vw, vh] = piece.viewBox;
  let s = spec.span === 'w' ? (size * SET_W) / vw : (size * SET_H) / vh;
  if (row === 'far') s *= 0.6;
  // Never much above the frame's top: what would not fit is made smaller.
  const room = y - SET_H * 0.04;
  if (-vy * s > room) s = room / -vy;
  let x = item.x;
  const half = (vw * s) / 2 / SET_W;
  if (row === 'middle' && x > 0.3 - half && x < 0.7 + half)
    x = x < 0.5 ? Math.max(half, 0.16) : Math.min(1 - half, 0.84);
  return {
    piece,
    kind: build.kind,
    x: x * SET_W,
    y,
    s,
    band: row === 'far' ? 'far' : onEdge ? 'horizon' : row,
    fixed: true,
    free: true,
    ...(piece.lives ? { lives: piece.lives } : {}),
  };
}

/**
 * The ground with only the tufts of grass whose roots `keep` tagged to
 * answer the world: the rest drawn as they are, untagged, so a tuft cut
 * out of a layer's sight never sways unseen.
 */
function tuftsWhere(ground: string, keep: (y: number) => boolean): string {
  return ground.replace(
    /<g data-react="[^"]*" data-kind="grass"[^>]*? data-pivot="([-\d.]+) ([-\d.]+)"[^>]*>/gu,
    (tag, _x: string, y: string) => (keep(Number(y)) ? tag : '<g>'),
  );
}

/** The flat shadow a thing on the floor casts where it stands: one tone, the ink's at 18% (studio-scenery-plan §4.2). */
function contactShadow(one: Placing): string {
  const [a, b] = reachOf(one);
  const rx = Math.max(8, (b - a) * 0.36);
  return `<ellipse cx="${r1((a + b) / 2)}" cy="${r1(one.y)}" rx="${r1(rx)}" ry="${r1(rx * 0.14)}" fill="${FIGURE_INK}" fill-opacity="0.18" stroke="none"/>`;
}

/** A thing a layout places, or code scatters: scattered, and at an edge of the floor. */
type Scattered = SetItem & { clutter?: boolean; edge?: boolean };

/**
 * What stands on the far edge of the ground when it is placed at the back
 * out of doors, in a style pack: buildings, trees, poles and wires,
 * lamps, parked vehicles, monuments (studio-scenery-plan §2's back
 * layer).
 */
const AT_HORIZON: ReadonlySet<string> = new Set([
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
  'zinc roof house',
  'barn',
  'hut',
  'tree',
  'palm',
  'pine',
  'palm grove',
  'poles',
  'lamppost',
  'streetlamp',
  'parked car',
  'danfo',
  'taxi',
  'obelisk',
  'columns',
  'pyramid',
  'tent',
]);
/**
 * How much smaller than the pinhole says what stands on the far edge of
 * the ground is drawn: that edge is farther off than the ground's own
 * lines make it, as a cartoon's street is, so a row of houses is a
 * street behind the people, not a wall over them. Everything there is
 * drawn at it alike, so their sizes agree among themselves.
 */
export const HORIZON_K = 0.5;
/** How much nearer than the middle row clutter at an edge of the floor stands, as a share of the way to the front. */
const EDGE_NEARER = 0.3;
/** Half the width of where the action is, as a share: no clutter within it. */
export const FOCAL_HALF = 0.13;
/** The most shapes on a set's layers that do not move (studio-scenery-plan §7.3). */
export const ELEMENT_BUDGET = 3000;
/** The most things code scatters about a place. */
const MOST_SCATTERED = 14;
/** Clutter too big to have many of. */
const BIG_CLUTTER: ReadonlySet<string> = new Set([
  'parked car',
  'laundry line',
  'generator',
  'poles',
]);
/** The colours some clutter comes in, one each. */
const CLUTTER_COLOURS: Readonly<Record<string, readonly string[]>> = {
  'plastic chair': [CLOTH.white, CLOTH.red, CLOTH.blue, CLOTH.green],
  'water drum': [CLOTH.blue, CLOTH.blue, CLOTH.black],
  'parked car': [CLOTH.blue, CLOTH.red, CLOTH.white, CLOTH.grey, CLOTH.green],
  okada: [CLOTH.red, CLOTH.black, CLOTH.blue],
  bicycle: [CLOTH.teal, CLOTH.red, CLOTH.yellow],
  bin: [KIT_EXTRAS['dark leaf'], CLOTH.grey, CLOTH.blue],
};

/** Who the people watching are dressed as, by their pack: the figure kit's wardrobe for its world. */
const PACK_WORLD: Record<StylePackId, StoryWorld> = {
  'ancient-near-east': {
    era: 'ancient, BC',
    region: 'Egypt',
    culture: '',
    landscape: '',
    homes: '',
  },
  'biblical-village': {
    era: 'first century',
    region: 'Galilee',
    culture: '',
    landscape: '',
    homes: '',
  },
  'west-african-town': {
    era: 'today',
    region: 'Lagos, Nigeria',
    culture: 'Yoruba',
    landscape: '',
    homes: '',
  },
  'western-city': {
    era: 'today',
    region: 'a city',
    culture: '',
    landscape: '',
    homes: '',
  },
  'village-farm': {
    era: 'today',
    region: 'a village',
    culture: '',
    landscape: '',
    homes: '',
  },
  nature: { era: 'today', region: '', culture: '', landscape: '', homes: '' },
};

/**
 * What a layout in a style pack scatters (studio-scenery-plan §5.3): as
 * many of each kind as its pack is busy (a Lagos street three, a farm
 * two), fewer of the big ones; two in three along the back, clear of
 * where the action is and of what the stage draws itself, the rest at
 * the edges of the floor, where no one stands. Seeded, so the same every
 * time; its colours its own.
 */
function clutterOfPack(
  layout: SetLayout,
  place: StoryPlace,
  pack: StylePack,
  clear: readonly number[],
): Scattered[] {
  if (!layout.clutter?.length) return [];
  const random = seeded(`${place.id}:${place.name}:clutter`);
  const focal = layout.focal?.x ?? 0.5;
  const out: Scattered[] = [];
  let slot = 0;
  let side = 0;
  for (const kind of layout.clutter) {
    const count = Math.min(BIG_CLUTTER.has(kind) ? 2 : 3, pack.density);
    for (let j = 0; j < count && out.length < MOST_SCATTERED; j += 1) {
      const edge =
        !AT_HORIZON.has(kind) &&
        !BIG_CLUTTER.has(kind) &&
        kind !== 'street sign' &&
        slot % 3 === 2;
      slot += 1;
      let x = 0.5;
      if (edge) {
        x = side % 2 ? 0.88 + random() * 0.09 : 0.03 + random() * 0.09;
        side += 1;
      } else
        for (let tries = 0; tries < 16; tries += 1) {
          x = 0.04 + random() * 0.92;
          if (
            Math.abs(x - focal) >= FOCAL_HALF + 0.07 &&
            clear.every((c) => Math.abs(c - x) >= 0.1)
          )
            break;
        }
      const colours = CLUTTER_COLOURS[kind];
      const colour = colours
        ? colours[Math.floor(random() * colours.length)]
        : null;
      out.push({
        kind,
        x: Math.round(x * 1000) / 1000,
        row: edge ? 'middle' : 'back',
        scale: Math.round((0.9 + random() * 0.15) * 100) / 100,
        colour,
        clutter: true,
        ...(edge ? { edge: true } : {}),
        ...(random() < 0.4 ? { flip: true } : {}),
      });
    }
  }
  return out;
}

/**
 * What a layout scatters about its place (studio-scenery-plan §5.3), by
 * code and seeded so it is the same every time: every other kind along
 * the back, clear of where the action is; the rest at the edges of the
 * ground, where no one stands.
 */
function clutterOf(layout: SetLayout, place: StoryPlace): SetItem[] {
  if (!layout.clutter?.length) return [];
  const random = seeded(`${place.id}:${place.name}:clutter`);
  const focal = layout.focal?.x ?? 0.5;
  return layout.clutter.map((kind, k): SetItem => {
    const edge = k % 2 === 1;
    let x = 0.5;
    if (edge) x = k % 4 === 1 ? 0.03 + random() * 0.06 : 0.91 + random() * 0.06;
    else
      for (let tries = 0; tries < 12; tries += 1) {
        x = 0.05 + random() * 0.9;
        if (Math.abs(x - focal) >= 0.2) break;
      }
    return {
      kind,
      x: Math.round(x * 1000) / 1000,
      row: edge ? 'middle' : 'back',
      scale: Math.round((0.8 + random() * 0.2) * 100) / 100,
      colour: null,
    };
  });
}
