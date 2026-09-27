/**
 * The house style every drawing on the stage is made in, in one place:
 * the kit's ink and line, and the colours it paints with. People are
 * drawn by the kit (scene-figure) in these; the artist is told them
 * (PROMPTS.castDraw), and what it draws is brought to them after
 * (scene-polish), so an animal, a thing or a place drawn by a model
 * stands beside the kit's people as though one hand drew them all.
 */
import type { ClothColour, HairColour } from './scene-figure';
import type { StorySize } from './scene-story';

/** The kit's outline colour: every shape's edge. */
export const FIGURE_INK = '#2d2a32';
/** The kit's outline width, in its own units (a grown-up is 224 tall). */
export const KIT_LINE = 2.6;
/** How far an outline may be from the kit's at stage size and still be the kit's: a share either way. */
export const LINE_SLACK = 0.15;

/** The kit's skin tones, lightest first. */
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
];

export const HAIR: Record<HairColour, string> = {
  black: '#2b2324',
  'dark brown': '#4a3226',
  brown: '#7a4f33',
  auburn: '#9c4a2a',
  red: '#c65a31',
  blonde: '#e2b75d',
  grey: '#a9a6ab',
  white: '#eeece8',
};

export const CLOTH: Record<ClothColour, string> = {
  red: '#d9534f',
  orange: '#f0924a',
  yellow: '#f4c95d',
  green: '#6dbf73',
  teal: '#3fb0a4',
  blue: '#4a8fd9',
  navy: '#34518f',
  purple: '#8a6bd1',
  pink: '#ef8fb3',
  brown: '#9a6b4b',
  grey: '#8d8f96',
  white: '#f5f5f2',
  black: '#3a3740',
};

/**
 * An animal's coat, markings, beak and feet: the colours real animals
 * come in, in the kit's soft, warm register.
 */
export const COATS: Record<string, string> = {
  brown: '#8b5e3c',
  'dark brown': '#5c3d2e',
  chestnut: '#9c5a33',
  tan: '#c9a074',
  cream: '#f1e2c4',
  white: '#f7f4ee',
  grey: '#9b9aa3',
  'dark grey': '#5f5d66',
  black: '#3a3740',
  ginger: '#e0874a',
  golden: '#e7b95a',
  pink: '#f1b3ae',
  green: '#7cbf6b',
  yellow: '#f6d25e',
  orange: '#f09a3e',
  blue: '#5b9bd5',
};

/** A place's colours, as the set painter is told them: soft, so people stand out in front. */
export const SET_COLOURS: Record<string, string> = {
  sky: '#cfe6f3',
  grass: '#a7d58c',
  hills: '#b9dea0',
  earth: '#e6d3a8',
  wood: '#b9875f',
  stone: '#c9c3ba',
  water: '#8cc4e3',
  walls: '#efe3cf',
  roofs: '#d98a6c',
  leaves: '#6fb35f',
};

/** What else the kit paints with: eyes, mouths, gold, shoes, and its set pieces' wood, metal and glass. */
export const KIT_EXTRAS: Record<string, string> = {
  'eye white': '#ffffff',
  mouth: '#6b2a2e',
  shoe: '#3b3440',
  gold: '#f2c14e',
  metal: '#4f7cac',
  concrete: '#d8cbb3',
  'dark wood': '#7a5238',
  plank: '#c79a6b',
  leaf: '#6a9c3e',
  'dark leaf': '#557f31',
  glass: '#cfe3ee',
  paper: '#f3f1ec',
  'bright red': '#e0463a',
  steel: '#c9cdd3',
};

/** Every colour of the house, by name: what the artist is told, and what its colours are brought to. */
export const HOUSE_PALETTE: readonly { name: string; hex: string }[] = [
  ...SKIN.map((hex, k) => ({ name: `skin ${k + 1}`, hex })),
  ...Object.entries(HAIR).map(([name, hex]) => ({ name: `${name} hair`, hex })),
  ...Object.entries(CLOTH).map(([name, hex]) => ({ name, hex })),
  ...Object.entries(COATS).map(([name, hex]) => ({
    name: `${name} coat`,
    hex,
  })),
  ...Object.entries(SET_COLOURS).map(([name, hex]) => ({ name, hex })),
  ...Object.entries(KIT_EXTRAS).map(([name, hex]) => ({ name, hex })),
].filter(
  // One entry a colour: the first name it is known by.
  (entry, k, all) => all.findIndex((one) => one.hex === entry.hex) === k,
);

/**
 * How tall an animal or a creature stands, in the kit's units, by its
 * size: a grown-up's frame is 234, a child's 190. Larger than life for
 * the small ones, as a cartoon's are: a fox who talks must be seen to.
 */
export const SIZE_UNITS: Record<StorySize, number> = {
  small: 95,
  medium: 130,
  large: 230,
};

/**
 * A set's units to one of the kit's where the story's people stand, as a
 * share of its height: a grown-up in front is drawn about 2.36 of a
 * 900-tall set's units to each of the kit's (scene-crowd's own measure).
 */
export const SET_UNIT_SHARE = 2.357 / 900;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The outline a drawing is drawn with, in its own units, for it to land
 * at the kit's line on the stage: a drawing `drawnTall` units tall shown
 * `unitsTall` of the kit's units tall. A medium animal on an 800-tall
 * canvas: 16.
 */
export const lineFor = (drawnTall: number, unitsTall: number): number =>
  unitsTall > 0 && drawnTall > 0 ? r1((KIT_LINE * drawnTall) / unitsTall) : 0;

/** The outline a set is painted with, in its own units, by its height: the kit's line where its people stand. */
export const setLine = (setTall: number): number =>
  r1(KIT_LINE * SET_UNIT_SHARE * setTall);
