/**
 * People, drawn by code: one rig for everyone, so every person on every
 * page has the same head, eyes, outline and proportions, and a book's
 * characters look the same on every page and in every make of it.
 *
 * A reader says who someone is from closed lists (their age, build,
 * skin, hair, headwear, clothes and colours, and a few extras) and this
 * draws them. The head is one size at every age; age changes the body
 * and the legs. Hair, hats and clothes make each person themselves. The
 * seven faces are drawn in the same place on every head, and nothing is
 * drawn over the eyes, brows or mouth but glasses and a beard, so every
 * feeling reads whatever someone wears.
 *
 * The construction is a cut-paper cartoon's, the design our own: a wide
 * head with no neck, big white eyes with dot pupils, a trapezoid body,
 * mitten hands, oval shoes, flat colours and one dark outline.
 *
 * The figure moves itself, in its own CSS, which the stage runs on the
 * voice's clock: it breathes, it blinks now and then, and while the
 * stage marks it `talking` its mouth opens and closes. A still (the
 * card, the contact sheet) shows it at rest, eyes open, mouth shut.
 */
import type { Expression, StoryWorld } from './scene-story';
import {
  CLOTH,
  FIGURE_INK,
  HAIR,
  KIT_LINE,
  SKIN,
  flat,
  inked,
  line,
  shade,
} from './scene-ink';
import { VIEW_RIG, drawnInViews } from './scene-figure-views';
import {
  DANGLE_FEEL,
  DANGLE_RIG,
  cutChain,
  dangleCss,
  dangleOf,
  PERSON_SWING,
  strideLength,
  uniqueDangles,
  type Dangle,
  type DangleKind,
  type RigVersion,
} from './scene-dangles';

export const FIGURE_AGES = ['child', 'teen', 'adult', 'elder'] as const;
export type FigureAge = (typeof FIGURE_AGES)[number];

export const FIGURE_BUILDS = ['slim', 'average', 'broad'] as const;
export type FigureBuild = (typeof FIGURE_BUILDS)[number];

export const HAIR_STYLES = [
  'bald',
  'balding',
  'short',
  'spiky',
  'curly',
  'afro',
  'bob',
  'long',
  'ponytail',
  'pigtails',
  'bun',
  'braids',
  'locs',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_COLOURS = [
  'black',
  'dark brown',
  'brown',
  'auburn',
  'red',
  'blonde',
  'grey',
  'white',
] as const;
export type HairColour = (typeof HAIR_COLOURS)[number];

export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'beard'] as const;
export type FacialHair = (typeof FACIAL_HAIR)[number];

export const HEADWEAR = [
  'none',
  'cap',
  'beanie',
  'sun hat',
  'headscarf',
  'turban',
  'hard hat',
  'helmet',
  'crown',
  'graduation cap',
  // A veil over the head and shoulders, down the back: Mary's mantle.
  'mantle',
  // A folded head tie, worn high: West Africa's.
  'gele',
  // A round brimless cap.
  'kufi',
  // A pharaoh's striped headcloth.
  'nemes',
  // A soldier's helmet with a crest: Rome's.
  'crested helmet',
] as const;
export type Headwear = (typeof HEADWEAR)[number];

export const TOPS = [
  't-shirt',
  'jumper',
  'hoodie',
  'shirt and tie',
  'jacket',
  'coat',
  'lab coat',
  'dress',
  'cardigan',
  'uniform',
  'robe',
  'apron',
  'tunic',
  // A rough garment of hide or camel's hair: John the Baptist's.
  'animal skin',
  // A long shirt to the shins.
  'kaftan',
  // A flowing robe over a kaftan, its sleeves wide: West Africa's.
  'agbada',
  // A soldier's plated breastplate over a tunic.
  'armour',
  // Striped nightclothes, top and trousers alike: for bed.
  'pyjamas',
] as const;
export type Top = (typeof TOPS)[number];

/** A wrapper is a cloth wrapped as a long skirt, to the ankles. */
export const BOTTOMS = ['trousers', 'shorts', 'skirt', 'wrapper'] as const;
export type Bottom = (typeof BOTTOMS)[number];

export const CLOTH_COLOURS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'navy',
  'purple',
  'pink',
  'brown',
  'grey',
  'white',
  'black',
] as const;
export type ClothColour = (typeof CLOTH_COLOURS)[number];

export const FIGURE_EXTRAS = [
  'glasses',
  'freckles',
  'scarf',
  'backpack',
  'walking stick',
  'stethoscope',
  'bow tie',
  'earrings',
  // A long cloak from the shoulders to the calves, in the accent colour.
  'cloak',
  'sandals',
  // An angel's.
  'wings',
  // No shoes on: in bed, before they are put on.
  'bare feet',
  // A short cape from the shoulders to the hips, apart from the long cloak.
  'cape',
  // A bow in the hair, its two ends hanging behind.
  'ribbon',
  // A headscarf's end, tied below the ear and hanging over the shoulder.
  'headscarf tail',
] as const;
export type FigureExtra = (typeof FIGURE_EXTRAS)[number];

/**
 * How someone is placed on a page: standing, their arms doing
 * something, lying on the floor, or in bed (a patient). A group takes
 * any pose but lying and in bed, which are for one person.
 */
export const FIGURE_POSES = [
  'standing',
  'hand on head',
  'hands on belly',
  'hand on mouth',
  'arms up',
  'pointing',
  'waving',
  'holding',
  'lying',
  'in bed',
] as const;
export type FigurePose = (typeof FIGURE_POSES)[number];
/** The poses one person alone takes. */
export const LYING_POSES: readonly FigurePose[] = ['lying', 'in bed'];

/**
 * What someone is going through, shown the way cartoons show it, and
 * switched on and off at the words like a face. Actions move the whole
 * body (a shake, a shiver, a sway, a walk); marks sit on it (sparkles
 * where it tingles, bolts where it hurts, heat over a fever). Any number
 * at once.
 */
export const FIGURE_ACTIONS = [
  'shaking',
  'shivering',
  'dizzy',
  'coughing',
  'sleeping',
  'breathless',
  'walking',
  'jumping',
] as const;
export const FIGURE_MARKS = [
  'tingling hands',
  'tingling feet',
  'headache',
  'chest pain',
  'stomach ache',
  'fever',
  'sweating',
  'tears',
  'rash',
  'nausea',
  'confused',
  'idea',
] as const;
export const FIGURE_SIGNS = [...FIGURE_ACTIONS, ...FIGURE_MARKS] as const;
export type FigureSign = (typeof FIGURE_SIGNS)[number];
/** Actions for someone on their feet: no one walks or jumps lying down. */
export const ON_FOOT: readonly FigureSign[] = ['walking', 'jumping'];
/** The most signs someone comes on with: more and no one reads them. */
export const MAX_SIGNS = 4;
/** The group a sign is drawn in: "tingling hands" in "tingling-hands". */
export const signId = (sign: string) => sign.replace(/\s+/g, '-');
/** Faces only the kit draws, besides the story's seven: worn one at a time with them. */
export const KIT_FACES = ['pain'] as const;
export type KitFace = (typeof KIT_FACES)[number];
/**
 * Faces the kit draws only on a page that shows them (FigureHow.faces,
 * AnimalHow.faces), so everyone drawn before is drawn as before. Eyes
 * closed: the lids shut, the brows at rest, the mouth calm, and no Zs;
 * someone knocked out, fainted, resting, praying, pretending to sleep, a
 * giant felled. Gentle, never gory. The mouth still talks, and no blink
 * opens the eyes while it is worn.
 */
export const ASKED_FACES = ['eyes closed'] as const;
export type AskedFace = (typeof ASKED_FACES)[number];
/** Every face someone drawn by the kit can wear. */
export type FigureFace = Expression | KitFace | AskedFace;
/** The faces the kit always draws: the story's seven and its own. */
export type DrawnFace = Expression | KitFace;
/** Whether a face is one the kit draws only when a page shows it. */
export const isAskedFace = (face: unknown): face is AskedFace =>
  (ASKED_FACES as readonly unknown[]).includes(face);
/** The group a face is drawn in: "eyes closed" in "eyes-closed". */
export const faceId = (face: string) => face.replace(/\s+/g, '-');
/** The asked faces to draw, of those a page shows: in the list's order. */
export function facesFor(asked: readonly string[] = []): AskedFace[] {
  return ASKED_FACES.filter((face) => asked.includes(face));
}
/** While the eyes are closed no blink opens them: the CSS for the asked faces drawn. */
export function shutStyle(faces: readonly AskedFace[]): string {
  return faces.includes('eyes closed')
    ? `.on-${faceId('eyes closed')} .blink{display:none}`
    : '';
}

/** What someone can hold in their hand. */
export const FIGURE_PROPS = [
  'book',
  'phone',
  'cup',
  'thermometer',
  'syringe',
  'pills',
  'flag',
  'umbrella',
  'magnifier',
  'bag',
  'ball',
  'lantern',
  'letter',
  // A shepherd's crook, a traveller's staff, Moses's.
  'staff',
] as const;
export type FigureProp = (typeof FIGURE_PROPS)[number];
/**
 * What stays drawn in a hand wherever a story goes: a staff, an umbrella,
 * a flag. Anything else a Studio story's people hold is a thing of its
 * own on the stage (scene-props.ts), to be put down, thrown and caught.
 */
export const FIGURE_GEAR = ['flag', 'umbrella', 'staff'] as const;
export type FigureGear = (typeof FIGURE_GEAR)[number];
export const isGear = (thing: unknown): thing is FigureGear =>
  (FIGURE_GEAR as readonly unknown[]).includes(thing);

/** The skin tones, from 1, the lightest, to 10, the deepest. */
export const SKIN_TONES = 10;
/** The most extras one person carries: more and no one reads them. */
export const MAX_EXTRAS = 2;

/** Who someone is, as the kit draws them. */
export interface FigureSpec {
  age: FigureAge;
  build: FigureBuild;
  /** 1, the lightest, to 10, the deepest. */
  skin: number;
  hair: HairStyle;
  hairColour: HairColour;
  facialHair: FacialHair;
  headwear: Headwear;
  top: Top;
  topColour: ClothColour;
  bottom: Bottom;
  bottomColour: ClothColour;
  /** The second colour: a hat, a tie, a scarf, hair ties, an apron. */
  accentColour: ClothColour;
  extras: FigureExtra[];
}

/** Someone the reader said nothing usable of: plainly dressed, drawn all the same. */
export const PLAIN_FIGURE: FigureSpec = {
  age: 'adult',
  build: 'average',
  skin: 4,
  hair: 'short',
  hairColour: 'brown',
  facialHair: 'none',
  headwear: 'none',
  top: 'jumper',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'navy',
  accentColour: 'red',
  extras: [],
};

// ── Reading a spec ─────────────────────────────────────────────────────────

/** Other words for the lists' own, as a model or an older bible may write them. */
const SAME: Record<string, string> = {
  gray: 'grey',
  'dark-brown': 'dark brown',
  darkbrown: 'dark brown',
  blond: 'blonde',
  ginger: 'red',
  tshirt: 't-shirt',
  't shirt': 't-shirt',
  tee: 't-shirt',
  sweater: 'jumper',
  jersey: 'jumper',
  pullover: 'jumper',
  sweatshirt: 'hoodie',
  blazer: 'jacket',
  overcoat: 'coat',
  raincoat: 'coat',
  labcoat: 'lab coat',
  gown: 'dress',
  pants: 'trousers',
  jeans: 'trousers',
  hijab: 'headscarf',
  sunhat: 'sun hat',
  hat: 'sun hat',
  hardhat: 'hard hat',
  mustache: 'moustache',
  spectacles: 'glasses',
  'walking-stick': 'walking stick',
  cane: 'walking stick',
  bowtie: 'bow tie',
  dreadlocks: 'locs',
  dreads: 'locs',
  plaits: 'braids',
  veil: 'mantle',
  shawl: 'mantle',
  'head tie': 'gele',
  headtie: 'gele',
  fila: 'kufi',
  skullcap: 'kufi',
  'pharaoh headdress': 'nemes',
  'roman helmet': 'crested helmet',
  'animal hide': 'animal skin',
  'camel hair': 'animal skin',
  "camel's hair": 'animal skin',
  fur: 'animal skin',
  hide: 'animal skin',
  boubou: 'kaftan',
  dashiki: 'kaftan',
  babariga: 'agbada',
  armor: 'armour',
  breastplate: 'armour',
  pajamas: 'pyjamas',
  pjs: 'pyjamas',
  sarong: 'wrapper',
  lappa: 'wrapper',
  pagne: 'wrapper',
  'hair ribbon': 'ribbon',
  'hair bow': 'ribbon',
  'scarf tail': 'headscarf tail',
  'headscarf end': 'headscarf tail',
  mantle: 'mantle',
  crook: 'staff',
  "shepherd's staff": 'staff',
  rod: 'staff',
};

/** A word as the lists write it: lower case, single spaces, a known other word taken for its own. */
function wordOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const said = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return SAME[said] ?? said;
}

function one<T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T,
): T {
  const word = wordOf(value);
  return word && (list as readonly string[]).includes(word)
    ? (word as T)
    : fallback;
}

/**
 * A figure from what a model or a kept file said, made sound: every value
 * one of the lists, a skin tone from 1 to 10, at most two extras; what is
 * missing or unknown is the plain choice. A child has no beard, and
 * under a headscarf or a turban no hair shows.
 */
export function figureOf(
  raw: unknown,
  fallback: FigureSpec = PLAIN_FIGURE,
): FigureSpec {
  const said = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const age = one(FIGURE_AGES, said.age, fallback.age);
  const tone = Math.round(Number(said.skin));
  const extras = Array.isArray(said.extras)
    ? [
        ...new Set(
          said.extras
            .map(wordOf)
            .filter((word): word is FigureExtra =>
              (FIGURE_EXTRAS as readonly (string | null)[]).includes(word),
            ),
        ),
      ].slice(0, MAX_EXTRAS)
    : [...fallback.extras];
  return {
    age,
    build: one(FIGURE_BUILDS, said.build, fallback.build),
    skin:
      Number.isFinite(tone) && tone >= 1
        ? Math.min(SKIN_TONES, tone)
        : fallback.skin,
    hair: one(HAIR_STYLES, said.hair, fallback.hair),
    hairColour: one(HAIR_COLOURS, said.hairColour, fallback.hairColour),
    facialHair:
      age === 'child'
        ? 'none'
        : one(FACIAL_HAIR, said.facialHair, fallback.facialHair),
    headwear: one(HEADWEAR, said.headwear, fallback.headwear),
    top: one(TOPS, said.top, fallback.top),
    topColour: one(CLOTH_COLOURS, said.topColour, fallback.topColour),
    bottom: one(BOTTOMS, said.bottom, fallback.bottom),
    bottomColour: one(CLOTH_COLOURS, said.bottomColour, fallback.bottomColour),
    accentColour: one(CLOTH_COLOURS, said.accentColour, fallback.accentColour),
    extras,
  };
}

/**
 * Someone the page shows whom no one described: dressed as `patch` says
 * (for what they are: a doctor, a child), the rest chosen by their name,
 * so each looks like themselves and not like the next plain person, and
 * the same in every make.
 */
export function figureFor(
  seed: string,
  patch: Partial<FigureSpec> = {},
): FigureSpec {
  const pick = <T>(list: readonly T[], salt: string): T =>
    list[Math.floor(beatOf(`${seed}:${salt}`) * list.length) % list.length];
  const age = patch.age ?? PLAIN_FIGURE.age;
  const hairs: readonly HairStyle[] =
    age === 'child'
      ? ['short', 'pigtails', 'curly', 'ponytail', 'spiky', 'bob', 'afro']
      : age === 'elder'
        ? ['balding', 'short', 'bun', 'curly', 'bald']
        : ['short', 'curly', 'bob', 'bun', 'afro', 'long', 'ponytail', 'locs'];
  return {
    ...PLAIN_FIGURE,
    age,
    build: pick(FIGURE_BUILDS, 'build'),
    skin:
      1 +
      Math.min(SKIN_TONES - 1, Math.floor(beatOf(`${seed}:skin`) * SKIN_TONES)),
    hair: pick(hairs, 'hair'),
    hairColour:
      age === 'elder'
        ? pick(['grey', 'white'] as const, 'colour')
        : pick(HAIR_COLOURS.slice(0, 6), 'colour'),
    topColour: pick(
      CLOTH_COLOURS.filter((c) => c !== 'white' && c !== 'black'),
      'top',
    ),
    bottomColour: pick(
      ['navy', 'grey', 'brown', 'black', 'blue'] as const,
      'bottom',
    ),
    accentColour: pick(CLOTH_COLOURS, 'accent'),
    ...patch,
  };
}

/** A figure in a few words, for a log line or a contact sheet. */
export function describeFigure(spec: FigureSpec): string {
  const hair =
    spec.headwear === 'headscarf' || spec.headwear === 'turban'
      ? spec.headwear
      : `${spec.hairColour} ${spec.hair} hair${spec.headwear === 'none' ? '' : `, ${spec.headwear}`}`;
  return [
    `${spec.build} ${spec.age}, skin ${spec.skin}`,
    hair,
    spec.facialHair === 'none' ? '' : spec.facialHair,
    `${spec.topColour} ${spec.top}`,
    spec.top === 'dress' || spec.top === 'robe'
      ? ''
      : `${spec.bottomColour} ${spec.bottom}`,
    ...spec.extras,
  ]
    .filter(Boolean)
    .join(', ');
}

// ── The rig ────────────────────────────────────────────────────────────────

export { FIGURE_INK };
export const LINE = KIT_LINE;
export const MOUTH = '#6b2a2e';
export const SHOE = '#3b3440';
export const GOLD = '#f2c14e';

/** The body below the head at each age; the head is the same size at all of them. */
const AGES: Record<
  FigureAge,
  { body: number; legs: number; shoulder: number; hem: number }
> = {
  child: { body: 58, legs: 12, shoulder: 60, hem: 80 },
  teen: { body: 64, legs: 24, shoulder: 64, hem: 84 },
  adult: { body: 76, legs: 38, shoulder: 70, hem: 90 },
  elder: { body: 74, legs: 34, shoulder: 70, hem: 92 },
};
const BUILDS: Record<FigureBuild, number> = {
  slim: 0.9,
  average: 1,
  broad: 1.12,
};
export const HEAD = { rx: 46, ry: 40 };
/** How far the shoes lift the legs off the ground. */
export const FEET = 8;
/** The frame: as wide for everyone, with room above the head for a hat or an afro and below the shoes for the shadow. */
export const FIGURE_FRAME = { halfWidth: 80, headroom: 32, below: 10 } as const;

/** Where the rig's parts meet, at an age and build, in the kit's units: the ground at 0, up is negative. */
export function rigOf(age: FigureAge, build: FigureBuild = 'average') {
  const a = AGES[age];
  const k = BUILDS[build];
  const hemY = -(FEET + a.legs);
  const sY = hemY - a.body;
  const cy = sY + 10 - HEAD.ry;
  return {
    legs: a.legs,
    halfShoulder: (a.shoulder * k) / 2,
    halfHem: (a.hem * k) / 2,
    hemY,
    /** The shoulders' line. */
    sY,
    /** The head's middle. */
    cy,
    /** The top of the head, hair and hats aside: the person's height. */
    top: cy - HEAD.ry,
    eyes: { y: cy + 3, dx: 15.5, rx: 15, ry: 16.5 },
    mouthY: cy + 25,
  };
}
export type Rig = ReturnType<typeof rigOf>;

/** The frame an age is drawn in: every figure of it the same, so the stage scales them alike. */
export function figureFrame(age: FigureAge): [number, number, number, number] {
  const { top } = rigOf(age);
  const y = top - FIGURE_FRAME.headroom;
  return [
    -FIGURE_FRAME.halfWidth,
    y,
    FIGURE_FRAME.halfWidth * 2,
    FIGURE_FRAME.below - y,
  ];
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const pt = (x: number, y: number) => `${r1(x)},${r1(y)}`;

/**
 * The part of an ellipse above (or below) a line, as a path: a lid over an
 * eye, hair over a head, a beard under it. The line is given in the
 * ellipse's own frame, -1 to 1 each way, y down: v = a + b·u.
 */
export function chord(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: number,
  b = 0,
  side: 'top' | 'bottom' = 'top',
): string {
  const A = 1 + b * b;
  const B = 2 * a * b;
  const C = a * a - 1;
  const D = B * B - 4 * A * C;
  if (D <= 0) return '';
  const u1 = (-B - Math.sqrt(D)) / (2 * A);
  const u2 = (-B + Math.sqrt(D)) / (2 * A);
  const at = (u: number) => pt(cx + u * rx, cy + (a + b * u) * ry);
  return side === 'top'
    ? `M${at(u1)} A${rx},${ry} 0 ${a > 0 ? 1 : 0} 1 ${at(u2)} Z`
    : `M${at(u2)} A${rx},${ry} 0 ${a < 0 ? 1 : 0} 1 ${at(u1)} Z`;
}

/** A small, stable number from a name: so a person blinks and breathes on their own beat, the same in every make. */
export function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

// ── Faces ──────────────────────────────────────────────────────────────────

export interface Face {
  /** Where the pupils look, from the eye's middle. */
  look: [number, number];
  pupil: number;
  /** Upper lids, the left eye's: its line, v = a + b·u; the right eye's mirrors it. */
  lid?: [number, number];
  /** A lower lid, cheeks raised: v = a. */
  lower?: number;
  /** Brows, the left eye's: its outer end's rise and its inner end's; the right mirrors, unless given. */
  brows?: [number, number];
  browRight?: [number, number];
  /** The mouth at rest, and the other shape it takes while talking. */
  mouth: string;
  talk: string;
}

/** The seven faces, drawn from lids, pupils, brows and a mouth: the story's own, in its order. */
export const FACES: Record<Expression, Face> = {
  neutral: { look: [0, 2], pupil: 3.4, mouth: 'flat', talk: 'small' },
  happy: {
    look: [0, 0],
    pupil: 3.6,
    lower: 0.55,
    brows: [-4, -4],
    mouth: 'smile',
    talk: 'grin',
  },
  sad: {
    look: [0, 5],
    pupil: 3.4,
    lid: [-0.3, -0.5],
    brows: [3, -6],
    mouth: 'frown',
    talk: 'glum',
  },
  angry: {
    look: [0, 3],
    pupil: 3.2,
    lid: [-0.25, 0.55],
    brows: [-4, 7],
    mouth: 'grit',
    talk: 'shout',
  },
  afraid: {
    look: [0, -1],
    pupil: 2.3,
    brows: [0, -6],
    mouth: 'wobble',
    talk: 'gasp',
  },
  surprised: {
    look: [0, 0],
    pupil: 2.5,
    brows: [-6, -6],
    mouth: 'o',
    talk: 'oh',
  },
  thinking: {
    look: [5, -6],
    pupil: 3.4,
    lid: [-0.55, 0],
    brows: [0, 0],
    browRight: [-6, -6],
    mouth: 'side',
    talk: 'aside',
  },
};

/** Each face's mouth at rest and the other shape it takes while talking, by the shapes' names (mouthShape). */
export const FACE_MOUTHS: Record<Expression, { mouth: string; talk: string }> =
  Object.fromEntries(
    Object.entries(FACES).map(([name, f]) => [
      name,
      { mouth: f.mouth, talk: f.talk },
    ]),
  ) as Record<Expression, { mouth: string; talk: string }>;

export const FACE_NAMES = Object.keys(FACES) as Expression[];
/** Every face a person or a character drawn by the kit has drawn: the story's seven, in its order, and the kit's own. */
export const FIGURE_FACES: readonly DrawnFace[] = [...FACE_NAMES, ...KIT_FACES];
/** Every face anyone the kit draws can be asked to wear: those always drawn, then those drawn when a page shows them. */
export const EVERY_FACE: readonly FigureFace[] = [
  ...FIGURE_FACES,
  ...ASKED_FACES,
];

/**
 * A face's mouth by its shape's name, about x 0 at height `my`: at rest
 * or talking. `k` thickens its lines (a character drawn at another scale
 * than the kit's keeps the kit's weight); 1 as the kit draws its people.
 */
export function mouthShape(name: string, my: number, k = 1): string {
  switch (name) {
    case 'flat':
      return line(`M-9,${my} Q0,${my + 2.5} 9,${my}`, FIGURE_INK, 3 * k);
    case 'smile':
      return `<path d="M-14,${my - 3} Q0,${my + 1} 14,${my - 3} Q12,${my + 11} 0,${my + 12} Q-12,${my + 11} -14,${my - 3} Z" ${inked(MOUTH)}/>`;
    case 'grin':
      return line(
        `M-13,${my - 2} Q0,${my + 9} 13,${my - 2}`,
        FIGURE_INK,
        3 * k,
      );
    case 'frown':
      return line(
        `M-11,${my + 5} Q0,${my - 5} 11,${my + 5}`,
        FIGURE_INK,
        3 * k,
      );
    case 'glum':
      return `<path d="M-8,${my + 5} Q0,${my - 4} 8,${my + 5} Q0,${my + 3} -8,${my + 5} Z" ${inked(MOUTH)}/>`;
    case 'grit':
      return `<rect x="-12" y="${my - 4}" width="24" height="10" rx="3" ${inked('#ffffff')}/>${line(`M-12,${my + 1} L12,${my + 1}`, FIGURE_INK, 1.8 * k)}`;
    case 'shout':
      return `<rect x="-12" y="${my - 5}" width="24" height="14" rx="4" ${inked(MOUTH)}/><rect x="-9" y="${my - 3.6}" width="18" height="4" rx="1" ${flat('#ffffff')}/>`;
    case 'wobble':
      return `<ellipse cx="0" cy="${my + 1}" rx="8" ry="5" ${inked(MOUTH)}/>`;
    case 'gasp':
      return `<ellipse cx="0" cy="${my + 1}" rx="7.5" ry="8" ${inked(MOUTH)}/>`;
    case 'o':
      return `<ellipse cx="0" cy="${my + 1}" rx="6.5" ry="8.5" ${inked(MOUTH)}/>`;
    case 'oh':
      return `<ellipse cx="0" cy="${my + 1}" rx="4.5" ry="5.5" ${inked(MOUTH)}/>`;
    case 'side':
      return line(`M1,${my + 2} Q8,${my + 1} 14,${my - 3}`, FIGURE_INK, 3 * k);
    case 'aside':
      return `<ellipse cx="8" cy="${my}" rx="5.5" ry="4" ${inked(MOUTH)}/>`;
    default:
      // 'small'
      return `<ellipse cx="0" cy="${my + 1}" rx="6.5" ry="4.5" ${inked(MOUTH)}/>`;
  }
}

/**
 * Where a face's eyes and mouth are, in the kit's units about the head:
 * the rig's own for a person; an animal's (scene-animal) sets its own
 * eyes on its head, in a group scaled to its size.
 */
export interface FaceRig {
  eyes: { y: number; dx: number; rx: number; ry: number };
  mouthY: number;
}

/** One face over the eyes' whites: the pupils, their lids and brows, and the mouth, at rest and talking. `clip` is the eyes' clip's id. */
export function faceOf(
  name: Expression,
  R: Rig,
  skin: string,
  clip = 'eyes',
): string {
  const f = FACES[name];
  return (
    faceEyes(name, R, skin, clip) +
    `<g class="mouth">${mouthShape(f.mouth, R.mouthY)}</g>` +
    `<g class="talk" opacity="0">${mouthShape(f.talk, R.mouthY)}</g>`
  );
}

/**
 * A face's eyes over their whites: the pupils where it looks, the lids
 * and the brows; its mouth is drawn apart (faceOf's, or an animal's own
 * muzzle, beak or fish's lips). `k` weighs the brows, as mouthShape's
 * does its lines: 1 as the kit draws its people.
 */
export function faceEyes(
  name: Expression,
  R: FaceRig,
  skin: string,
  clip = 'eyes',
  k = 1,
): string {
  const f = FACES[name];
  const { y, dx, rx, ry } = R.eyes;
  const out: string[] = [];
  // The pupils together, so the eyes can look where the stage says, kept
  // inside the eyes' whites wherever they look; the lids over them.
  out.push(
    `<g clip-path="url(#${clip})"><g class="pupils">${[-1, 1]
      .map(
        (side) =>
          `<circle cx="${r1(side * dx + f.look[0])}" cy="${r1(y + f.look[1])}" r="${f.pupil}" ${flat(FIGURE_INK)}/>`,
      )
      .join('')}</g></g>`,
  );
  const brows: string[] = [];
  for (const side of [-1, 1]) {
    const ex = side * dx;
    if (f.lower !== undefined)
      out.push(
        `<path d="${chord(ex, y, rx, ry, f.lower, 0, 'bottom')}" ${inked(skin)}/>`,
      );
    // Thinking narrows one eye only.
    const lid = name === 'thinking' && side === 1 ? undefined : f.lid;
    if (lid)
      out.push(
        `<path d="${chord(ex, y, rx, ry, lid[0], side === -1 ? lid[1] : -lid[1])}" ${inked(skin)}/>`,
      );
    const brow = side === 1 && f.browRight ? f.browRight : f.brows;
    if (brow) {
      // The outer end, then the inner: the left eye's outer end is on the left.
      const by = y - ry - 5;
      brows.push(
        line(
          `M${pt(ex + side * 11, by + brow[0])} L${pt(ex - side * 8, by + brow[1])}`,
          FIGURE_INK,
          k === 1 ? 3.4 : Math.round(3.4 * k * 100) / 100,
        ),
      );
    }
  }
  if (brows.length) out.push(`<g class="brows">${brows.join('')}</g>`);
  return out.join('');
}

/**
 * The mouth's shapes as someone speaks, drawn once for every face: shut
 * (m, b, p), a little open, open (ah), wide (ee), round (oo) and the top
 * teeth on the lip (f, v). The stage shows the one the voice is on.
 */
export const MOUTH_SHAPES = 6;
/** The six shapes, about x 0 at height `my`, each its own markup; `k` as mouthShape's. */
export function mouthShapes(my: number, k = 1): string[] {
  return [
    line(`M-9,${my} Q0,${my + 2} 9,${my}`, FIGURE_INK, 3 * k),
    `<ellipse cx="0" cy="${my + 1}" rx="7" ry="3.6" ${inked(MOUTH)}/>`,
    `<ellipse cx="0" cy="${my + 2}" rx="9" ry="8" ${inked(MOUTH)}/><ellipse cx="0" cy="${my + 6.5}" rx="5" ry="2.6" ${flat('#d4777a')}/>`,
    `<rect x="-12" y="${my - 3}" width="24" height="9" rx="4.5" ${inked(MOUTH)}/><rect x="-9" y="${my - 2}" width="18" height="3" rx="1" ${flat('#ffffff')}/>`,
    `<ellipse cx="0" cy="${my + 1.5}" rx="5.5" ry="7" ${inked(MOUTH)}/>`,
    `<rect x="-10" y="${my - 2}" width="20" height="7" rx="3.5" ${inked(MOUTH)}/><rect x="-7.5" y="${my - 2}" width="15" height="3.4" rx="1" ${flat('#ffffff')}/>`,
  ];
}
export function mouthsOf(R: Rig): string {
  return mouthShapes(R.mouthY)
    .map((shape, k) => `<g class="vm v${k}">${shape}</g>`)
    .join('');
}

/**
 * Closed eyes, shown for a moment every few seconds; at a head's middle
 * other than the rig's, for someone asleep in a pose. The eyes are 3
 * below the head's middle, as the rig has them; `k` weighs the line.
 */
export function blinkOf(
  R: Pick<FaceRig, 'eyes'> & { cy: number },
  skin: string,
  hx = 0,
  hy = R.cy,
  k = 1,
): string {
  const { dx, rx, ry } = R.eyes;
  const y = hy + 3;
  return [-1, 1]
    .map((side) => {
      const ex = hx + side * dx;
      return (
        `<ellipse cx="${ex}" cy="${y}" rx="${rx + 0.8}" ry="${ry + 0.8}" ${inked(skin)}/>` +
        line(
          `M${pt(ex - 11, y + 1)} Q${pt(ex, y + 7)} ${pt(ex + 11, y + 1)}`,
          FIGURE_INK,
          k === 1 ? 3 : Math.round(3 * k * 100) / 100,
        )
      );
    })
    .join('');
}

// ── Signs: what someone is going through ──────────────────────────────────

/** Where signs go on someone: their head's middle, their mouth, chest, belly, hands and feet, and beside them. */
export interface SignPoints {
  head: [number, number];
  mouth: [number, number];
  chest: [number, number];
  belly: [number, number];
  hands: [number, number][];
  feet: [number, number][];
  /** Beside the body, where lines of motion go, and which way is out: lying down, only the side off the floor. */
  sides: { x: number; out: -1 | 1 }[];
}

const RED = '#e0463a';
const TEAR = '#6cb8e6';
const WARM = '#e8743b';
const later = (s: number) => (s ? ` style="animation-delay:-${s}s"` : '');

/** A four-pointed sparkle: where it tingles. */
function sparkle(x: number, y: number, r: number, delay: number): string {
  const k = r * 0.22;
  return `<path class="tw"${later(delay)} d="M${pt(x, y - r)} Q${pt(x + k, y - k)} ${pt(x + r, y)} Q${pt(x + k, y + k)} ${pt(x, y + r)} Q${pt(x - k, y + k)} ${pt(x - r, y)} Q${pt(x - k, y - k)} ${pt(x, y - r)} Z" ${inked(GOLD, 1.6)}/>`;
}

/** A zigzag bolt, out from a point along an angle: where it hurts. */
function bolt(x: number, y: number, angle: number, delay: number): string {
  const a = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [nx, ny] = [-uy, ux];
  const at = (along: number, across: number) =>
    pt(x + ux * along + nx * across, y + uy * along + ny * across);
  return `<path class="throb"${later(delay)} d="M${at(0, 0)} L${at(6, 5)} L${at(10, -4)} L${at(16, 3)}" fill="none" stroke="${RED}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A burst on the body: where it aches. */
function burst(x: number, y: number, r: number): string {
  const spikes: string[] = [];
  for (let k = 0; k < 16; k += 1) {
    const a = (k * Math.PI) / 8;
    const d = k % 2 ? r * 0.5 : r;
    spikes.push(pt(x + Math.cos(a) * d, y + Math.sin(a) * d));
  }
  return `<path class="throb" d="M${spikes.join(' L')} Z" fill="${RED}" fill-opacity="0.8" stroke="${FIGURE_INK}" stroke-width="1.8"/>`;
}

/** A drop: sweat, or a tear. */
function drop(x: number, y: number, delay: number): string {
  return `<path class="drip"${later(delay)} d="M${pt(x, y - 7)} C${pt(x + 5, y - 1)} ${pt(x + 5, y + 4)} ${pt(x, y + 4)} C${pt(x - 5, y + 4)} ${pt(x - 5, y - 1)} ${pt(x, y - 7)} Z" ${inked(TEAR, 1.4)}/>`;
}

/** A curl of motion beside the body, bowing outward. */
function shake(x: number, y: number, dir: number): string {
  return [0, 8]
    .map((k) =>
      line(
        `M${pt(x + dir * k, y - 13)} Q${pt(x + dir * (k + 7), y)} ${pt(x + dir * k, y + 13)}`,
        FIGURE_INK,
        3,
      ),
    )
    .join('');
}

/** What sits on the face: it turns, tilts and nods with it (the rig's `.fm`). */
export const fm = (markup: string) => `<g class="fm">${markup}</g>`;

/** Each sign's drawing: what sits on the body, and what floats over the head, upright however the body lies. */
export interface Signs {
  body: Record<FigureSign, string>;
  air: Partial<Record<FigureSign, string>>;
}

/**
 * What floats over someone's head while a sign is on (stars, steam, a Z,
 * a question mark, a bulb, drops), about the head at (hx, hy), in the
 * kit's units: drawn apart from the body, so it stays upright over
 * someone lying down, and can float over anyone the kit did not draw.
 */
export function airOf(
  hx: number,
  hy: number,
): Partial<Record<FigureSign, string>> {
  const around = (angle: number, r = 1) => {
    const a = (angle * Math.PI) / 180;
    return [hx + Math.cos(a) * 58 * r, hy + Math.sin(a) * 52 * r] as const;
  };
  const star = (x: number, y: number, delay: number) => sparkle(x, y, 7, delay);
  const zed = (x: number, y: number, size: number, delay: number) =>
    `<path class="rise"${later(delay)} d="M${pt(x, y)} L${pt(x + size, y)} L${pt(x, y + size)} L${pt(x + size, y + size)}" fill="none" stroke="#6a79c9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const question = (x: number, y: number, delay: number) =>
    `<g class="tw"${later(delay)}>${line(`M${pt(x - 5, y - 7)} Q${pt(x - 5, y - 14)} ${pt(x + 1, y - 14)} Q${pt(x + 7, y - 14)} ${pt(x + 7, y - 8)} Q${pt(x + 7, y - 3)} ${pt(x + 1, y - 1)} L${pt(x + 1, y + 3)}`, FIGURE_INK, 3.2)}<circle cx="${r1(x + 1)}" cy="${r1(y + 9)}" r="2.2" ${flat(FIGURE_INK)}/></g>`;
  return {
    dizzy: [-150, -90, -30]
      .map((a, k) => star(...around(a), k * 0.35))
      .join(''),
    sleeping: [0, 1, 2]
      .map((k) => zed(hx + 36 + k * 10, hy - 48 - k * 14, 8 + k * 2, k * 0.8))
      .join(''),
    headache: [-155, -90, -25]
      .map((a, k) => bolt(...around(a, 1.02), a, k * 0.3))
      .join(''),
    fever: [-18, 0, 18]
      .map(
        (x, k) =>
          `<path class="rise"${later(k * 0.6)} d="M${pt(hx + x, hy - 50)} q5,-4 0,-8 q-5,-4 0,-8 q5,-4 0,-8" fill="none" stroke="${WARM}" stroke-width="3" stroke-linecap="round"/>`,
      )
      .join(''),
    sweating: [-1, 1]
      .flatMap((side) => [
        drop(hx + side * 48, hy - 20, side < 0 ? 0 : 0.6),
        drop(hx + side * 54, hy + 4, side < 0 ? 0.35 : 0.9),
      ])
      .join(''),
    confused: question(hx - 20, hy - 52, 0) + question(hx + 22, hy - 56, 0.5),
    idea:
      `<g class="throb"><circle cx="${hx}" cy="${hy - 56}" r="10" ${inked('#ffe16b')}/><rect x="${hx - 5}" y="${hy - 47}" width="10" height="6" rx="2" ${inked('#c9c3ba', 1.8)}/></g>` +
      [-70, -35, 35, 70]
        .map((a) => {
          const r = ((a - 90) * Math.PI) / 180;
          return line(
            `M${pt(hx + Math.cos(r) * 14, hy - 56 + Math.sin(r) * 14)} L${pt(hx + Math.cos(r) * 19, hy - 56 + Math.sin(r) * 19)}`,
            '#e2b75d',
            2.6,
          );
        })
        .join(''),
  };
}

/**
 * Every sign someone can show, drawn where it goes on them: each its own
 * group, hidden until the stage shows it. Those that move do so in their
 * own CSS; what moves the whole body is keyed on a class the stage sets
 * while the sign is on (styleOf). What floats over the head (stars,
 * steam, a Z, a question mark, a bulb) is drawn apart, so it can stay
 * upright over someone lying down.
 */
export function signsOf(p: SignPoints, R: Rig, skin: string): Signs {
  const [hx, hy] = p.head;
  const { dx, rx, ry } = R.eyes;
  const ey = hy + 3;
  const [, my] = p.mouth;
  const eyes = [-1, 1].map((side) => hx + side * dx);
  const puffs = (big: number) =>
    [0, 1, 2]
      .map(
        (k) =>
          `<circle class="puff"${later(k * 0.25)} cx="${r1(hx + 20 + k * 12 * big)}" cy="${r1(my - 2 - k * 4 * big)}" r="${r1((4 + k * 2) * big)}" ${inked('#ecebe6', 1.6)}/>`,
      )
      .join('');
  const outward = (x: number) => (x < 0 ? -1 : 1);
  const dot = (x: number, y: number) =>
    `<circle cx="${r1(x)}" cy="${r1(y)}" r="2.3" ${flat('#d94b4b')}/>`;
  const spiral = (x: number) => {
    const turn: string[] = [];
    for (let k = 0; k <= 26; k += 1) {
      const t = k * 0.42;
      const r = 1 + t * 1.25;
      turn.push(pt(x + Math.cos(t) * r, ey + Math.sin(t) * r * (ry / rx)));
    }
    return `<ellipse cx="${x}" cy="${ey}" rx="${rx}" ry="${ry}" ${inked('#ffffff')}/>${line(`M${turn.join(' L')}`, FIGURE_INK, 2.2)}`;
  };
  const body: Record<FigureSign, string> = {
    // Motion: the body's own is in styleOf, keyed on the sign.
    shaking: [p.chest[1], p.belly[1] + 16]
      .flatMap((y) => p.sides.map((side) => shake(side.x, y, side.out)))
      .map((arc) => `<g class="flicker">${arc}</g>`)
      .join(''),
    shivering: [p.chest[1], p.belly[1]]
      .flatMap((y) =>
        p.sides.map(
          ({ x, out }) =>
            `<g class="flicker">${line(`M${pt(x, y - 10)} L${pt(x + out * 5, y - 5)} L${pt(x, y)} L${pt(x + out * 5, y + 5)} L${pt(x, y + 10)}`, TEAR, 3)}</g>`,
        ),
      )
      .join(''),
    dizzy: fm(eyes.map(spiral).join('')),
    coughing: puffs(1.2),
    sleeping: fm(blinkOf(R, skin, hx, hy)),
    breathless: puffs(0.8),
    walking: '',
    jumping: '',
    // Signs on the body.
    'tingling hands': p.hands
      .map(([x, y]) => {
        const o = outward(x);
        return (
          sparkle(x + o * 15, y - 15, 6, 0) +
          sparkle(x + o * 23, y + 2, 4.5, 0.35) +
          sparkle(x + o * 7, y + 17, 4, 0.7)
        );
      })
      .join(''),
    'tingling feet': p.feet
      .map(([x, y]) => {
        const o = outward(x);
        return (
          sparkle(x + o * 24, y - 14, 6, 0.2) +
          sparkle(x + o * 32, y + 1, 4.5, 0.55) +
          sparkle(x + o * 6, y - 22, 4, 0.9)
        );
      })
      .join(''),
    headache: '',
    'chest pain': burst(p.chest[0] - 6, p.chest[1], 14),
    'stomach ache': burst(p.belly[0] - 4, p.belly[1] + 6, 14),
    fever: fm(
      eyes
        .map(
          (x) =>
            `<ellipse cx="${r1(x + (x < hx ? -14 : 14))}" cy="${r1(hy + 17)}" rx="8" ry="5" fill="#e8574d" fill-opacity="0.45" stroke="none"/>`,
        )
        .join(''),
    ),
    sweating: '',
    tears: fm(
      eyes
        .map(
          (x, k) =>
            line(
              `M${pt(x + (k ? 4 : -4), ey + 13)} Q${pt(x + (k ? 9 : -9), hy + 22)} ${pt(x + (k ? 8 : -8), hy + 36)}`,
              TEAR,
              4.5,
            ) + drop(x + (k ? 8 : -8), hy + 40, k * 0.5),
        )
        .join(''),
    ),
    rash:
      fm(
        [
          [-30, 12],
          [-24, 20],
          [-34, 22],
          [28, 13],
          [34, 21],
          [24, 22],
          [-8, -22],
          [10, -20],
        ]
          .map(([x, y]) => dot(hx + x, hy + y))
          .join(''),
      ) +
      p.hands
        .flatMap(([x, y]) => [dot(x - 4, y - 2), dot(x + 3, y + 3)])
        .join(''),
    nausea: fm(
      `<ellipse cx="${hx}" cy="${r1(hy + 8)}" rx="39" ry="30" fill="#7bbf52" fill-opacity="0.38" stroke="none"/>`,
    ),
    confused: '',
    idea: '',
  };
  const air = airOf(hx, hy);
  return { body, air };
}

/** The signs that float over the head, and so can float over anyone. */
export const AIR_SIGNS: readonly FigureSign[] = [
  'dizzy',
  'sleeping',
  'headache',
  'fever',
  'sweating',
  'confused',
  'idea',
];

/**
 * The signs that float over a head, for someone the kit did not draw (an
 * animal, a creature): each its own group about their head, at the
 * kit's size on the stage, moving in CSS of its own. `scale` is the
 * drawing's units to one of the kit's. Only the signs asked for.
 */
export function signsOver(
  head: [number, number],
  scale: number,
  signs: readonly FigureSign[],
  prefix: string,
): { markup: string; css: string; states: Record<string, string> } {
  const shown = signs.filter((sign) => airOver(head, scale, sign));
  if (!shown.length) return { markup: '', css: '', states: {} };
  const states: Record<string, string> = {};
  const groups = shown.map((sign) => {
    const id = `${prefix}-${signId(sign)}`;
    states[sign] = id;
    return `<g id="${id}">${airOver(head, scale, sign)}</g>`;
  });
  return { markup: groups.join(''), css: airCss(shown), states };
}

/**
 * What floats over a head for one sign (a Z, a bulb, steam), about the
 * head at `head` and scaled from the kit's size by `scale`, moving in CSS
 * of its own (airCss): nothing for a sign that does not float.
 */
export function airOver(
  head: [number, number],
  scale: number,
  sign: FigureSign,
): string {
  const air = airOf(0, 0)[sign];
  if (!AIR_SIGNS.includes(sign) || !air) return '';
  const own = air.replace(/class="(tw|throb|rise|drip)"/g, 'class="sgn-$1"');
  return `<g transform="translate(${r1(head[0])} ${r1(head[1])}) scale(${Math.round(scale * 1000) / 1000})">${own}</g>`;
}

/** The CSS that moves what floats over a head for these signs (airOver's). */
export function airCss(signs: readonly FigureSign[]): string {
  const moving = MOVES.filter(([, of]) =>
    of.some((one) => signs.includes(one)),
  );
  return moving.length
    ? [
        `${moving.map(([cls]) => `.sgn-${cls}`).join(',')}{transform-box:fill-box;transform-origin:center}`,
        ...moving.map(
          ([cls, , animation, frames]) =>
            `.sgn-${cls}{animation:${animation}}${frames}`,
        ),
      ].join('')
    : '';
}

/** Each sign's whole drawing, on the body and over the head, for someone upright. */
export function upright({ body, air }: Signs): Record<FigureSign, string> {
  return Object.fromEntries(
    FIGURE_SIGNS.map((name) => [name, body[name] + (air[name] ?? '')]),
  ) as Record<FigureSign, string>;
}

/** The pain face: eyes squeezed shut, brows pinched, teeth gritted. */
export function painFace(R: Rig, skin: string): string {
  const my = R.mouthY;
  return (
    painEyes(R, skin) +
    `<g class="mouth"><rect x="-14" y="${my - 4}" width="28" height="10" rx="3" ${inked('#ffffff')}/>${line(`M-14,${my + 1} L14,${my + 1}`, FIGURE_INK, 1.8)}</g>` +
    `<g class="talk" opacity="0"><rect x="-12" y="${my - 5}" width="24" height="14" rx="4" ${inked(MOUTH)}/><rect x="-9" y="${my - 3.6}" width="18" height="4" rx="1" ${flat('#ffffff')}/></g>`
  );
}

/** The pain face's eyes, squeezed shut, and its brows pinched: its mouth drawn apart. `k` weighs the lines. */
export function painEyes(R: FaceRig, skin: string, k = 1): string {
  const { y, dx, rx, ry } = R.eyes;
  const w = k === 1 ? 3.4 : Math.round(3.4 * k * 100) / 100;
  const eyes = [-1, 1]
    .map((side) => {
      const ex = side * dx;
      // The squeeze points in, toward the nose.
      const d = side < 0 ? 1 : -1;
      return (
        `<ellipse cx="${ex}" cy="${y}" rx="${rx + 0.8}" ry="${ry + 0.8}" ${flat(skin)}/>` +
        line(
          `M${pt(ex - d * 8, y - 7)} L${pt(ex + d * 6, y)} L${pt(ex - d * 8, y + 7)}`,
          FIGURE_INK,
          w,
        )
      );
    })
    .join('');
  const brows = [-1, 1]
    .map((side) =>
      line(
        `M${pt(side * dx + side * 11, y - ry - 2)} L${pt(side * dx - side * 8, y - ry - 9)}`,
        FIGURE_INK,
        w,
      ),
    )
    .join('');
  return eyes + `<g class="brows">${brows}</g>`;
}

/** The eyes-closed face: lids shut as a blink shuts them, brows at rest, the calm face's mouth at rest and talking. */
export function closedFace(R: Rig, skin: string): string {
  return (
    closedEyes(R, skin) +
    `<g class="mouth">${mouthShape(FACES.neutral.mouth, R.mouthY)}</g>` +
    `<g class="talk" opacity="0">${mouthShape(FACES.neutral.talk, R.mouthY)}</g>`
  );
}

/** Eyes closed: the lids shut, and the brows at rest over them. */
function closedEyes(R: FaceRig, skin: string): string {
  return shutEyes(R, skin) + calmBrows(R);
}

/**
 * Eyes shut and calm: each eye's white under the skin, its outline too
 * (`pad` past it, half its line and a little), and the lid a soft curve
 * down, as a blink draws it. `k` weighs the lid's line.
 */
export function shutEyes(
  R: Pick<FaceRig, 'eyes'>,
  skin: string,
  k = 1,
  pad = LINE / 2 + 0.7,
): string {
  const { y, dx, rx, ry } = R.eyes;
  const w = k === 1 ? 3 : Math.round(3 * k * 100) / 100;
  const p = Math.round(pad * 100) / 100;
  return [-1, 1]
    .map((side) => {
      const ex = side * dx;
      return (
        `<ellipse cx="${ex}" cy="${y}" rx="${rx + p}" ry="${ry + p}" ${flat(skin)}/>` +
        line(
          `M${pt(ex - 11, y + 1)} Q${pt(ex, y + 7)} ${pt(ex + 11, y + 1)}`,
          FIGURE_INK,
          w,
        )
      );
    })
    .join('');
}

/** Brows at rest: level, a little low over closed eyes. `k` weighs the lines, as faceEyes' brows. */
export function calmBrows(R: FaceRig, k = 1): string {
  const { y, dx, ry } = R.eyes;
  const by = y - ry - 3;
  const brows = [-1, 1]
    .map((side) => {
      const ex = side * dx;
      return line(
        `M${pt(ex + side * 11, by + 1)} L${pt(ex - side * 8, by)}`,
        FIGURE_INK,
        k === 1 ? 3.4 : Math.round(3.4 * k * 100) / 100,
      );
    })
    .join('');
  return `<g class="brows">${brows}</g>`;
}

// ── Hair and headwear ──────────────────────────────────────────────────────

/** Whether a hat hides every hair. */
export const wrapped = (spec: FigureSpec) =>
  spec.headwear === 'headscarf' ||
  spec.headwear === 'turban' ||
  spec.headwear === 'mantle' ||
  spec.headwear === 'gele' ||
  spec.headwear === 'nemes';

/**
 * Where a drawing made with rig 2 collects its dangles as it draws them:
 * the prefix its clip paths' ids take, unique in the drawing, and each
 * part cut into a chain. Absent, a drawing is made as rig 1 draws it.
 */
export interface Chains {
  clip: string;
  dangles: Dangle[];
}

/**
 * A part that swings: as drawn, on rig 1; on rig 2, cut into a chain of
 * `segments` from `root` toward `tip`, and its dangle kept. `pinned`: what
 * lies behind the root stays on the head or the shoulders.
 */
export function swung(
  chains: Chains | undefined,
  id: string,
  kind: DangleKind,
  markup: string,
  root: Point2,
  tip: Point2 | undefined,
  segments: number,
  pinned = true,
): string {
  if (!chains || !markup) return markup;
  const made = cutChain({
    id,
    markup,
    root,
    tip,
    segments,
    clip: `${chains.clip}-${id}`,
    pinned,
    limit: DANGLE_FEEL[kind].limit,
  });
  chains.dangles.push(dangleOf(id, made, kind));
  return made.markup;
}

/** Hair behind the head: what shows past it, over the shoulders or above. */
export function hairBehind(spec: FigureSpec, R: Rig, chains?: Chains): string {
  if (wrapped(spec)) return '';
  const c = HAIR[spec.hairColour];
  const { cy } = R;
  const accent = CLOTH[spec.accentColour];
  switch (spec.hair) {
    case 'afro':
      return `<ellipse cx="0" cy="${cy - 10}" rx="64" ry="56" ${inked(c)}/>`;
    case 'long':
      return swung(
        chains,
        'hair',
        'hair',
        `<path d="M-52,${cy - 18} L-52,${cy + 44} Q-52,${cy + 60} -36,${cy + 60} L36,${cy + 60} Q52,${cy + 60} 52,${cy + 44} L52,${cy - 18} Z" ${inked(c)}/>`,
        [0, cy + 26],
        [0, cy + 60],
        2,
      );
    case 'bob':
      return `<path d="M-52,${cy - 18} L-52,${cy + 22} Q-52,${cy + 32} -42,${cy + 32} L42,${cy + 32} Q52,${cy + 32} 52,${cy + 22} L52,${cy - 18} Z" ${inked(c)}/>`;
    case 'pigtails':
      return (
        [-1, 1]
          .map((s) =>
            swung(
              chains,
              s < 0 ? 'pig-l' : 'pig-r',
              'pigtail',
              `<ellipse cx="${s * 53}" cy="${cy + 6}" rx="13" ry="21" transform="rotate(${s * -18} ${s * 53} ${cy + 6})" ${inked(c)}/>`,
              [s * 45, cy - 10],
              [s * 59.5, cy + 26],
              2,
            ),
          )
          .join('') +
        [-1, 1]
          .map(
            (s) =>
              `<circle cx="${s * 45}" cy="${cy - 10}" r="5" ${inked(accent)}/>`,
          )
          .join('')
      );
    case 'ponytail':
      return `${swung(
        chains,
        'pony',
        'ponytail',
        `<ellipse cx="50" cy="${cy + 8}" rx="13" ry="26" transform="rotate(-18 50 ${cy + 8})" ${inked(c)}/>`,
        [44, cy - 12],
        [58, cy + 32.7],
        3,
      )}<circle cx="44" cy="${cy - 12}" r="5" ${inked(accent)}/>`;
    case 'bun':
      return `<circle cx="0" cy="${cy - 44}" r="15" ${inked(c)}/>`;
    case 'balding':
      return [-1, 1]
        .map(
          (s) =>
            `<ellipse cx="${s * 45}" cy="${cy - 2}" rx="9" ry="14" ${inked(c)}/>`,
        )
        .join('');
    case 'braids': {
      // Two plaits, each a run of beads hanging past the shoulders.
      const bead = (s: number, k: number) =>
        `<ellipse cx="${s * (48 - k)}" cy="${cy + 6 + k * 12}" rx="8" ry="7.5" ${inked(c)}/>`;
      const tie = (s: number) =>
        `<circle cx="${s * 44}" cy="${cy + 64}" r="4" ${inked(accent)}/>`;
      // On rig 2, each plait and its tie a chain of its own.
      if (chains)
        return [-1, 1]
          .map((s) =>
            swung(
              chains,
              s < 0 ? 'braid-l' : 'braid-r',
              'braid',
              [0, 1, 2, 3, 4].map((k) => bead(s, k)).join('') + tie(s),
              [s * 48, cy - 1.5],
              [s * 44, cy + 68],
              2,
            ),
          )
          .join('');
      const beads: string[] = [];
      for (const s of [-1, 1])
        for (let k = 0; k < 5; k += 1) beads.push(bead(s, k));
      return beads.join('') + [-1, 1].map(tie).join('');
    }
    case 'locs': {
      const strand = (x: number) =>
        `<rect x="${x - 5}" y="${cy - 20}" width="10" height="${x < 0 ? 70 : 66}" rx="5" ${inked(c)}/>`;
      return [
        [-50, -40],
        [40, 50],
      ]
        .map((xs) =>
          swung(
            chains,
            xs[0] < 0 ? 'locs-l' : 'locs-r',
            'locs',
            xs.map(strand).join(''),
            [Math.sign(xs[0]) * 45, cy],
            [Math.sign(xs[0]) * 45, cy + 48],
            2,
          ),
        )
        .join('');
    }
    case 'curly': {
      const bumps: string[] = [];
      for (let t = -172; t <= -8; t += 20) {
        const a = (t * Math.PI) / 180;
        bumps.push(
          `<circle cx="${r1(Math.cos(a) * 46)}" cy="${r1(cy + Math.sin(a) * 40)}" r="10" ${inked(c)}/>`,
        );
      }
      return bumps.join('');
    }
    case 'spiky': {
      const spikes: string[] = [];
      for (let t = -150; t <= -30; t += 24) {
        const a = (t * Math.PI) / 180;
        const w = (13 * Math.PI) / 180;
        const at = (angle: number, k: number) =>
          pt(Math.cos(angle) * 47 * k, cy + Math.sin(angle) * 41 * k);
        spikes.push(
          `<path d="M${at(a - w, 1)} L${at(a, 1.32)} L${at(a + w, 1)} Z" ${inked(c)}/>`,
        );
      }
      return spikes.join('');
    }
    default:
      return '';
  }
}

/** A ribbon's two ends, hanging from its bow at the side of the head, behind it. */
export function ribbonEnds(spec: FigureSpec, R: Rig, chains?: Chains): string {
  if (!spec.extras.includes('ribbon')) return '';
  const { cy } = R;
  const c = CLOTH[spec.accentColour];
  return swung(
    chains,
    'ribbon',
    'ribbon',
    `<path d="M46,${cy - 18} L54,${cy - 18} L68,${cy + 28} L63,${cy + 25} L60,${cy + 31} Z" ${inked(shade(c, 0.85))}/>` +
      `<path d="M42,${cy - 18} L50,${cy - 18} L56,${cy + 36} L51,${cy + 32} L47,${cy + 37} Z" ${inked(c)}/>`,
    [48, cy - 18],
    [60, cy + 34],
    2,
  );
}

/** A ribbon's bow, on the side of the head over the hair. */
export function ribbonBow(spec: FigureSpec, R: Rig): string {
  if (!spec.extras.includes('ribbon')) return '';
  const { cy } = R;
  const c = CLOTH[spec.accentColour];
  return (
    `<path d="M44,${cy - 22} L31,${cy - 33} L33,${cy - 11} Z" ${inked(c)}/>` +
    `<path d="M44,${cy - 22} L57,${cy - 33} L55,${cy - 11} Z" ${inked(c)}/>` +
    `<circle cx="44" cy="${cy - 22}" r="4.5" ${inked(shade(c, 0.85))}/>`
  );
}

/** A headscarf's end: knotted below the ear and hanging over the shoulder, in front. */
export function headscarfTail(
  spec: FigureSpec,
  R: Rig,
  chains?: Chains,
): string {
  if (!spec.extras.includes('headscarf tail')) return '';
  const { cy, sY } = R;
  const c = CLOTH[spec.accentColour];
  return (
    swung(
      chains,
      'headscarf',
      'headscarf',
      `<path d="M34,${cy + 34} L47,${cy + 32} L58,${sY + 50} L52,${sY + 45} L47,${sY + 52} Z" ${inked(c)}/>` +
        line(`M41,${cy + 38} L50,${sY + 44}`, shade(c, 0.78), 2.2),
      [40, cy + 34],
      [53, sY + 51],
      2,
    ) +
    `<ellipse cx="40" cy="${cy + 33}" rx="8" ry="6.5" ${inked(shade(c, 0.9))}/>`
  );
}

/**
 * The hair over the head: over the top, down the temples to the ears, and
 * a fringe that stops above the brows.
 */
export function hairOver(spec: FigureSpec, R: Rig): string {
  if (spec.hair === 'bald' || spec.hair === 'balding' || wrapped(spec))
    return '';
  const c = HAIR[spec.hairColour];
  const { cy } = R;
  const rx = 48.5;
  const ry = 42.5;
  const sideY = cy - 3;
  const sx = r1(rx * Math.sqrt(1 - ((sideY - cy) / ry) ** 2));
  const fy = cy - 26;
  const fringes: Record<string, string> = {
    straight: `L26,${fy}`,
    swept: `Q2,${fy + 3} 28,${fy - 7}`,
    parted: `Q-14,${fy - 2} -6,${fy - 11} Q6,${fy - 2} 26,${fy}`,
    spiky: `L-19,${fy + 6} L-13,${fy} L-6,${fy + 6} L0,${fy} L7,${fy + 6} L13,${fy} L20,${fy + 6} L26,${fy}`,
    curly: `Q-22,${fy + 8} -15,${fy + 1} Q-9,${fy + 9} -3,${fy + 1} Q3,${fy + 9} 9,${fy + 1} Q15,${fy + 9} 21,${fy + 1} Q25,${fy + 6} 26,${fy}`,
  };
  const fringe = {
    short: 'swept',
    spiky: 'spiky',
    curly: 'curly',
    afro: 'curly',
    long: 'parted',
    bob: 'straight',
    pigtails: 'parted',
    ponytail: 'swept',
    bun: 'parted',
    braids: 'parted',
    locs: 'straight',
  }[spec.hair];
  return `<path d="M${-sx},${sideY} L-38,${sideY} Q-36,${cy - 18} -26,${fy} ${fringes[fringe ?? 'straight']} Q36,${cy - 18} 38,${sideY} L${sx},${sideY} A${rx},${ry} 0 1 0 ${-sx},${sideY} Z" ${inked(c)}/>`;
}

/** What is worn on the head. None of it comes down past the brows' band. */
export function headwearOf(spec: FigureSpec, R: Rig): string {
  const { cy } = R;
  const c = CLOTH[spec.accentColour];
  switch (spec.headwear) {
    case 'cap':
      return (
        `<path d="${chord(0, cy, 49.5, 44, -0.62)}" ${inked(c)}/>` +
        `<path d="M6,${cy - 30} Q40,${cy - 43} 74,${cy - 35} Q77,${cy - 30} 70,${cy - 28} Q38,${cy - 27} 6,${cy - 30} Z" ${inked(shade(c, 0.78))}/>` +
        `<circle cx="0" cy="${cy - 44}" r="3.5" ${inked(shade(c, 0.78))}/>`
      );
    case 'beanie':
      return (
        `<path d="${chord(0, cy, 49.5, 44, -0.6)}" ${inked(shade(c, 0.8))}/>` +
        `<path d="${chord(0, cy, 49.5, 44, -0.8)}" ${inked(c)}/>`
      );
    case 'sun hat':
      return (
        `<path d="M-33,${cy - 36} Q-33,${cy - 70} 0,${cy - 70} Q33,${cy - 70} 33,${cy - 36} Z" ${inked(c)}/>` +
        `<ellipse cx="0" cy="${cy - 35}" rx="70" ry="9" ${inked(c)}/>` +
        `<path d="M-32,${cy - 44} L32,${cy - 44} L32,${cy - 38} L-32,${cy - 38} Z" ${inked(shade(c, 0.7))}/>`
      );
    case 'turban':
      return (
        `<path d="M-50,${cy - 26} Q-58,${cy - 70} 0,${cy - 70} Q58,${cy - 70} 50,${cy - 26} Q0,${cy - 36} -50,${cy - 26} Z" ${inked(c)}/>` +
        line(
          `M-44,${cy - 30} Q-4,${cy - 62} 40,${cy - 58}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(`M-48,${cy - 44} Q0,${cy - 70} 44,${cy - 40}`, shade(c, 0.72), 2.4)
      );
    case 'hard hat':
      return (
        `<path d="${chord(0, cy - 2, 50, 46, -0.61)}" ${inked(c)}/>` +
        line(`M0,${cy - 48} L0,${cy - 32}`, shade(c, 0.72), 3) +
        `<rect x="-58" y="${cy - 34}" width="116" height="7" rx="3.5" ${inked(shade(c, 0.85))}/>`
      );
    case 'helmet':
      return (
        `<path d="${chord(0, cy - 2, 52, 48, -0.52)}" ${inked(c)}/>` +
        [-22, -6, 10]
          .map(
            (x) =>
              `<rect x="${x}" y="${cy - 44}" width="12" height="7" rx="3.5" ${inked(shade(c, 0.7), 2)}/>`,
          )
          .join('')
      );
    case 'crown':
      return `<path d="M-34,${cy - 28} L-38,${cy - 62} L-19,${cy - 44} L0,${cy - 70} L19,${cy - 44} L38,${cy - 62} L34,${cy - 28} Q0,${cy - 36} -34,${cy - 28} Z" ${inked(GOLD)}/>${[
        -38, 0, 38,
      ]
        .map(
          (x) =>
            `<circle cx="${x}" cy="${x ? cy - 62 : cy - 70}" r="4" ${inked(CLOTH.red, 2)}/>`,
        )
        .join('')}`;
    case 'graduation cap':
      return (
        `<path d="${chord(0, cy, 49.5, 44, -0.62)}" ${inked(c)}/>` +
        `<path d="M-56,${cy - 48} L0,${cy - 60} L56,${cy - 48} L0,${cy - 36} Z" ${inked(c)}/>` +
        line(`M0,${cy - 48} L40,${cy - 44} L44,${cy - 28}`, GOLD, 2.6) +
        `<circle cx="44" cy="${cy - 26}" r="3.5" ${flat(GOLD)}/>`
      );
    case 'gele':
      // Tied high and wide, its folds fanned out above the brow.
      return (
        `<path d="M-52,${cy - 24} Q-74,${cy - 60} -40,${cy - 82} Q-14,${cy - 100} 8,${cy - 86} Q38,${cy - 104} 58,${cy - 76} Q76,${cy - 50} 52,${cy - 24} Q0,${cy - 40} -52,${cy - 24} Z" ${inked(c)}/>` +
        line(
          `M-40,${cy - 34} Q-44,${cy - 66} -18,${cy - 80}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(
          `M-10,${cy - 38} Q-6,${cy - 74} 22,${cy - 90}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(`M20,${cy - 38} Q34,${cy - 66} 56,${cy - 70}`, shade(c, 0.72), 2.4)
      );
    case 'kufi':
      return (
        `<path d="${chord(0, cy, 48, 43, -0.66)}" ${inked(c)}/>` +
        [-26, -9, 9, 26]
          .map(
            (x) =>
              `<circle cx="${x}" cy="${cy - 34 - (Math.abs(x) < 10 ? 3 : 0)}" r="2.6" ${flat(shade(c, 0.7))}/>`,
          )
          .join('')
      );
    case 'crested helmet': {
      const steel = '#b9bec6';
      return (
        `<path d="${chord(0, cy - 2, 51, 47, -0.5)}" ${inked(steel)}/>` +
        // Its crest, front to back over the top.
        `<path d="M-30,${cy - 42} Q0,${cy - 86} 30,${cy - 42} Q0,${cy - 62} -30,${cy - 42} Z" ${inked(CLOTH.red)}/>` +
        `<rect x="-56" y="${cy - 30}" width="112" height="6" rx="3" ${inked(shade(steel, 0.8))}/>` +
        [-1, 1]
          .map(
            (s2) =>
              `<path d="M${s2 * 46},${cy - 26} L${s2 * 50},${cy + 6} Q${s2 * 44},${cy + 14} ${s2 * 38},${cy + 6} L${s2 * 38},${cy - 26} Z" ${inked(steel)}/>`,
          )
          .join('')
      );
    }
    default:
      return '';
  }
}

// ── Clothes ────────────────────────────────────────────────────────────────

export interface Dressed {
  /** The body's fill. */
  fill: string;
  /** How far down the garment reaches, from the hem's line; and how much wider it flares. */
  longer: number;
  flare: number;
  sleeves: 'short' | 'long' | 'wide' | 'flowing';
  sleeve: string;
  /** Drawn on the body, after it. */
  details: string;
  /** Behind the head, over the body: a hood's rim. */
  collar: string;
}

export function dressOf(spec: FigureSpec, R: Rig): Dressed {
  const top = CLOTH[spec.topColour];
  const accent = CLOTH[spec.accentColour];
  const white = CLOTH.white;
  const { sY, hemY, halfShoulder: s2, legs } = R;
  const mid = r1(sY + (hemY - sY) * 0.5);
  const plain: Dressed = {
    fill: top,
    longer: 0,
    flare: 0,
    sleeves: 'long',
    sleeve: top,
    details: '',
    collar: '',
  };
  switch (spec.top) {
    case 't-shirt':
      return { ...plain, sleeves: 'short' };
    case 'jumper':
      return {
        ...plain,
        details: `<path d="M${-R.halfHem},${hemY} L${r1(-R.halfHem + 1.3)},${hemY - 7} L${r1(R.halfHem - 1.3)},${hemY - 7} L${R.halfHem},${hemY} Z" ${inked(shade(top))}/>`,
      };
    case 'hoodie':
      return {
        ...plain,
        collar: `<ellipse cx="0" cy="${sY + 2}" rx="38" ry="12" ${inked(shade(top))}/>`,
        details:
          `<rect x="-20" y="${hemY - 26}" width="40" height="17" rx="6" ${inked(shade(top))}/>` +
          [-1, 1]
            .map((s) =>
              line(`M${s * 7},${sY + 11} L${s * 8},${sY + 28}`, white, 2.6),
            )
            .join(''),
      };
    case 'shirt and tie':
      return {
        ...plain,
        details:
          `<path d="M-3,${sY + 9} L3,${sY + 9} L6,${mid + 8} L0,${mid + 16} L-6,${mid + 8} Z" ${inked(accent)}/>` +
          [-1, 1]
            .map(
              (s) =>
                `<path d="M0,${sY + 9} L${s * 14},${sY + 6} L${s * 10},${sY + 18} Z" ${inked(shade(top, 1.35))}/>`,
            )
            .join(''),
      };
    case 'jacket':
    case 'coat': {
      const long = spec.top === 'coat';
      const bottom = hemY + (long ? legs * 0.45 : 0);
      return {
        ...plain,
        longer: long ? legs * 0.45 : 0,
        details:
          `<path d="M-9,${sY} L9,${sY} L9,${hemY - 1} L-9,${hemY - 1} Z" ${inked(white)}/>` +
          line(`M0,${sY + 26} L0,${r1(bottom)}`, FIGURE_INK, LINE) +
          [-1, 1]
            .map(
              (s) =>
                `<path d="M${s * 9},${sY} L${s * 18},${sY} L${s * 6},${sY + 26} L${s * 1},${sY + 26} Z" ${inked(shade(top))}/>`,
            )
            .join('') +
          [0, 1, long ? 2 : -1]
            .filter((k) => k >= 0)
            .map(
              (k) =>
                `<circle cx="6" cy="${r1(sY + 36 + k * 16)}" r="2.6" ${flat(FIGURE_INK)}/>`,
            )
            .join(''),
      };
    }
    case 'lab coat': {
      const longer = Math.max(8, legs * 0.55);
      return {
        ...plain,
        fill: white,
        sleeve: white,
        longer,
        details:
          `<path d="M-11,${sY} L11,${sY} L0,${sY + 24} Z" ${inked(accent)}/>` +
          line(`M0,${sY + 24} L0,${r1(hemY + longer)}`, FIGURE_INK, LINE) +
          `<rect x="${r1(s2 - 26)}" y="${sY + 30}" width="15" height="12" rx="2" ${inked(white)}/>` +
          line(
            `M${r1(s2 - 21)},${sY + 30} L${r1(s2 - 21)},${sY + 24}`,
            CLOTH.blue,
            3,
          ),
      };
    }
    case 'dress':
      return {
        ...plain,
        sleeves: 'short',
        longer: spec.age === 'child' ? 6 : legs * 0.5,
        flare: 9,
        details: line(
          `M${r1(-s2 - 1)},${mid} L${r1(s2 + 1)},${mid}`,
          FIGURE_INK,
          LINE,
        ),
      };
    case 'cardigan':
      return {
        ...plain,
        details:
          `<path d="M-7,${sY} L7,${sY} L7,${hemY} L-7,${hemY} Z" ${inked(white)}/>` +
          [0, 1, 2]
            .map(
              (k) =>
                `<circle cx="-11" cy="${r1(sY + 20 + k * ((hemY - sY - 30) / 2))}" r="2.6" ${flat(FIGURE_INK)}/>`,
            )
            .join(''),
      };
    case 'uniform':
      return {
        ...plain,
        details:
          `<rect x="${r1(-R.halfHem + 3)}" y="${r1(mid + 8)}" width="${r1(R.halfHem * 2 - 6)}" height="7" ${inked(CLOTH.black)}/>` +
          `<rect x="-5" y="${r1(mid + 8.5)}" width="10" height="6" rx="1" ${inked(GOLD, 1.6)}/>` +
          `<circle cx="${r1(s2 - 20)}" cy="${sY + 22}" r="6" ${inked(accent)}/>` +
          [0, 1]
            .map(
              (k) =>
                `<circle cx="0" cy="${r1(sY + 16 + k * 14)}" r="2.4" ${flat(FIGURE_INK)}/>`,
            )
            .join('') +
          [-1, 1]
            .map(
              (s) =>
                `<path d="M0,${sY + 6} L${s * 13},${sY + 3} L${s * 9},${sY + 14} Z" ${inked(shade(top))}/>`,
            )
            .join(''),
      };
    case 'robe':
      return {
        ...plain,
        sleeves: 'wide',
        longer: -hemY - FEET - 4,
        flare: 6,
        details:
          `<path d="M-12,${sY} L12,${sY} L0,${sY + 22} Z" ${inked(shade(top))}/>` +
          `<rect x="${r1(-R.halfHem + 3)}" y="${mid}" width="${r1(R.halfHem * 2 - 6)}" height="7" rx="3" ${inked(accent)}/>`,
      };
    case 'apron':
      return {
        ...plain,
        sleeves: 'short',
        details:
          `<path d="M-19,${sY + 14} L19,${sY + 14} L22,${r1(hemY + legs * 0.3)} L-22,${r1(hemY + legs * 0.3)} Z" ${inked(accent)}/>` +
          [-1, 1]
            .map((s) =>
              line(
                `M${s * 17},${sY + 15} L${r1(s * (s2 - 6))},${sY + 2}`,
                shade(accent),
                3,
              ),
            )
            .join('') +
          `<rect x="-10" y="${r1(hemY - 16)}" width="20" height="12" rx="2" ${inked(shade(accent, 0.88))}/>`,
      };
    case 'tunic':
      return {
        ...plain,
        longer: legs * 0.3,
        details:
          `<path d="M-6,${sY} L6,${sY} L0,${sY + 18} Z" ${inked(shade(top))}/>` +
          `<rect x="${r1(-R.halfHem + 2)}" y="${mid + 6}" width="${r1(R.halfHem * 2 - 4)}" height="6" ${inked(CLOTH.brown)}/>`,
      };
    case 'animal skin': {
      // Rough hide to the knees, its hem torn, its spots darker, belted
      // with leather.
      const hide = '#b8905a';
      const longer = legs * 0.4;
      const bottom = hemY + longer;
      const half = R.halfHem + 4;
      const teeth: string[] = [];
      for (let x = -half; x < half - 2; x += 12)
        teeth.push(
          `<path d="M${r1(x)},${r1(bottom - 1)} L${r1(x + 6)},${r1(bottom + 7)} L${r1(x + 12)},${r1(bottom - 1)}" ${inked(hide)}/>`,
        );
      return {
        ...plain,
        fill: hide,
        sleeve: hide,
        sleeves: 'short',
        longer,
        flare: 4,
        details:
          teeth.join('') +
          [
            [-18, sY + 20, 6, 4],
            [14, sY + 32, 5, 3.5],
            [-8, mid + 20, 5, 3],
            [20, mid + 28, 4, 3],
          ]
            .map(
              ([x, y, rx, ry]) =>
                `<ellipse cx="${x}" cy="${r1(y)}" rx="${rx}" ry="${ry}" ${flat(shade(hide, 0.7))}/>`,
            )
            .join('') +
          `<rect x="${r1(-R.halfHem + 2)}" y="${mid + 4}" width="${r1(R.halfHem * 2 - 4)}" height="7" ${inked('#6b4a2f')}/>`,
      };
    }
    case 'kaftan':
      // A long shirt to the shins, its neck and front embroidered.
      return {
        ...plain,
        longer: legs * 0.62,
        flare: 4,
        details:
          `<path d="M-15,${sY} L15,${sY} L10,${sY + 30} L-10,${sY + 30} Z" ${inked(accent)}/>` +
          [0, 1, 2, 3]
            .map(
              (k) =>
                `<circle cx="0" cy="${r1(sY + 36 + k * 11)}" r="2.2" ${flat(accent)}/>`,
            )
            .join(''),
      };
    case 'agbada':
      // A great flowing robe over the kaftan, to the shins, its sleeves
      // wide as wings and its chest embroidered.
      return {
        ...plain,
        sleeves: 'flowing',
        longer: legs * 0.72,
        flare: 18,
        details:
          `<path d="M-22,${sY} L22,${sY} L24,${sY + 34} Q0,${sY + 48} -24,${sY + 34} Z" ${inked(shade(top, 0.88))}/>` +
          line(`M-15,${sY + 10} Q0,${sY + 34} 15,${sY + 10}`, accent, 2.6) +
          line(`M-9,${sY + 22} Q0,${sY + 38} 9,${sY + 22}`, accent, 2.2),
      };
    case 'armour': {
      // A breastplate of bands over a tunic in the accent colour, whose
      // skirt shows below it in strips of leather.
      const steel = '#b9bec6';
      const skirt = legs * 0.35;
      const strips: string[] = [];
      for (let x = -R.halfHem + 4; x < R.halfHem - 6; x += 11)
        strips.push(
          `<rect x="${r1(x)}" y="${r1(hemY - 2)}" width="8" height="${r1(skirt)}" rx="2" ${inked('#7a5334', 2)}/>`,
        );
      return {
        ...plain,
        fill: steel,
        sleeves: 'short',
        sleeve: accent,
        longer: skirt,
        details:
          `<rect x="${r1(-R.halfHem - 1)}" y="${r1(hemY - 2)}" width="${r1(R.halfHem * 2 + 2)}" height="${r1(skirt)}" ${inked(accent)}/>` +
          strips.join('') +
          [0.28, 0.5, 0.72]
            .map((k) =>
              line(
                `M${r1(-s2 + 4)},${r1(sY + (hemY - sY) * k)} L${r1(s2 - 4)},${r1(sY + (hemY - sY) * k)}`,
                shade(steel, 0.72),
                2.4,
              ),
            )
            .join(''),
      };
    }
    case 'pyjamas':
      // Soft stripes down the front and a row of buttons.
      return {
        ...plain,
        details:
          [-0.62, -0.2, 0.2, 0.62]
            .map((k) =>
              line(
                `M${r1(k * s2)},${sY + 8} L${r1(k * R.halfHem)},${hemY - 2}`,
                shade(top, 1.3),
                3,
              ),
            )
            .join('') +
          [0, 1, 2]
            .map(
              (k) =>
                `<circle cx="0" cy="${r1(sY + 14 + k * ((hemY - sY - 24) / 2))}" r="2.4" ${flat(shade(top, 0.6))}/>`,
            )
            .join(''),
      };
    default:
      return plain;
  }
}

/** How far past the frame's sides an angel's wings reach. */
export const WING_SPAN = 118;

/**
 * What hangs or spreads behind the body: a cloak from the shoulders, a
 * mantle's fall from the head, an angel's wings. Drawn first, so the
 * body stands in front of it.
 */
export function backOf(
  spec: FigureSpec,
  R: Rig,
  bottom: number,
  halfBottom: number,
  chains?: Chains,
): string {
  const out: string[] = [];
  const { sY, cy, halfShoulder: s2 } = R;
  const accent = CLOTH[spec.accentColour];
  if (spec.extras.includes('wings'))
    for (const s of [-1, 1]) {
      const tip = s * WING_SPAN;
      // On rig 2 each wing turns whole about where it grows.
      out.push(
        swung(
          chains,
          s < 0 ? 'wing-l' : 'wing-r',
          'wing',
          [
            `<path d="M${s * 14},${sY + 14} Q${s * 60},${sY - 70} ${tip},${sY - 44} Q${s * 104},${sY + 4} ${s * 96},${sY + 22} Q${s * 84},${sY + 52} ${s * 70},${sY + 58} Q${s * 50},${sY + 70} ${s * 22},${sY + 50} Z" ${inked('#fbfbf6')}/>`,
            ...[0, 1, 2].map((k) =>
              line(
                `M${s * (30 + k * 8)},${sY + 36 - k * 4} Q${s * (60 + k * 10)},${sY + 20 - k * 16} ${s * (86 + k * 8)},${sY - 6 - k * 14}`,
                '#d7d5cc',
                2.4,
              ),
            ),
          ].join(''),
          [s * 14, sY + 14],
          undefined,
          1,
          false,
        ),
      );
    }
  if (spec.extras.includes('cloak')) {
    // A cape from the shoulders to the calves, flaring past the arms.
    const down = r1(Math.max(bottom + 6, -FEET - 16));
    const half = r1(halfBottom + 30);
    // On rig 2, three panels: the yoke, the middle and the hem.
    out.push(
      swung(
        chains,
        'cloak',
        'cloak',
        `<path d="M${r1(-s2 - 2)},${sY + 6} Q${r1(-s2 - 6)},${sY} ${r1(-s2 + 10)},${sY - 2} L${r1(s2 - 10)},${sY - 2} Q${r1(s2 + 6)},${sY} ${r1(s2 + 2)},${sY + 6} L${half},${down} Q0,${r1(down + 8)} ${-half},${down} Z" ${inked(shade(accent, 0.9))}/>`,
        [0, sY],
        [0, down],
        3,
      ),
    );
  }
  if (spec.extras.includes('cape')) {
    // A cape: from the shoulders to the hips, flaring a little past the arms.
    const down = r1(R.hemY + 12);
    const half = r1(halfBottom + 16);
    out.push(
      swung(
        chains,
        'cape',
        'cape',
        `<path d="M${r1(-s2 - 2)},${sY + 6} Q${r1(-s2 - 6)},${sY} ${r1(-s2 + 10)},${sY - 2} L${r1(s2 - 10)},${sY - 2} Q${r1(s2 + 6)},${sY} ${r1(s2 + 2)},${sY + 6} L${half},${down} Q0,${r1(down + 6)} ${-half},${down} Z" ${inked(shade(accent, 0.9))}/>`,
        [0, sY],
        [0, down],
        3,
      ),
    );
  }
  if (spec.headwear === 'mantle')
    out.push(
      `<path d="M-54,${cy} Q-54,${cy - 52} 0,${cy - 52} Q54,${cy - 52} 54,${cy} L${r1(halfBottom + 10)},${r1(bottom - 14)} L${r1(-halfBottom - 10)},${r1(bottom - 14)} Z" ${inked(shade(accent, 0.88))}/>`,
    );
  return out.join('');
}

/** A backpack's pack, showing past the shoulders behind the body. */
export function packOf(spec: FigureSpec, R: Rig): string {
  if (!spec.extras.includes('backpack')) return '';
  const c = shade(CLOTH[spec.accentColour], 0.85);
  return `<rect x="${r1(-R.halfShoulder - 7)}" y="${R.sY + 2}" width="${r1(R.halfShoulder * 2 + 14)}" height="${r1((R.hemY - R.sY) * 0.72)}" rx="10" ${inked(c)}/>`;
}

/** What someone carries or wears besides: drawn on the body, below the chin. */
export function extrasOnBody(
  spec: FigureSpec,
  R: Rig,
  chains?: Chains,
): string {
  const { sY, halfShoulder: s2 } = R;
  const accent = CLOTH[spec.accentColour];
  const out: string[] = [];
  if (spec.extras.includes('backpack'))
    for (const s of [-1, 1])
      out.push(
        `<rect x="${r1(s * (s2 - 12) - 4)}" y="${sY + 1}" width="8" height="34" rx="3" ${inked(shade(accent, 0.85))}/>`,
      );
  if (spec.extras.includes('stethoscope'))
    out.push(
      line(
        `M-16,${sY + 8} Q-16,${sY + 34} 0,${sY + 36} Q16,${sY + 34} 16,${sY + 8}`,
        '#55525a',
        3.2,
      ) +
        line(`M0,${sY + 36} L0,${sY + 44}`, '#55525a', 3.2) +
        `<circle cx="0" cy="${sY + 47}" r="4.5" ${inked('#c9cdd3', 2)}/>`,
    );
  if (spec.extras.includes('scarf'))
    out.push(
      `<path d="M-30,${sY + 8} Q0,${sY + 18} 30,${sY + 8} L30,${sY + 18} Q0,${sY + 28} -30,${sY + 18} Z" ${inked(accent)}/>` +
        // Its end, two segments on rig 2.
        swung(
          chains,
          'scarf',
          'scarf',
          `<path d="M12,${sY + 20} L24,${sY + 20} L22,${sY + 48} L10,${sY + 48} Z" ${inked(accent)}/>`,
          [18, sY + 20],
          [16, sY + 48],
          2,
          false,
        ),
    );
  if (spec.extras.includes('cloak'))
    // Its fronts over the shoulders, fastened below the chin.
    out.push(
      [-1, 1]
        .map(
          (s) =>
            `<path d="M${s * 6},${sY + 12} Q${s * (s2 - 2)},${sY - 2} ${s * (s2 + 1)},${sY + 10} L${s * (s2 - 1)},${sY + 44} Q${s * (s2 - 8)},${sY + 30} ${s * 6},${sY + 18} Z" ${inked(accent)}/>`,
        )
        .join('') + `<circle cx="0" cy="${sY + 16}" r="5" ${inked(GOLD, 2)}/>`,
    );
  if (spec.extras.includes('cape'))
    // Its short fronts over the shoulders, tied at the neck.
    out.push(
      [-1, 1]
        .map(
          (s) =>
            `<path d="M${s * 6},${sY + 10} Q${s * (s2 - 4)},${sY - 2} ${s * (s2 + 1)},${sY + 8} L${s * (s2 - 2)},${sY + 22} Q${s * (s2 - 10)},${sY + 14} ${s * 6},${sY + 16} Z" ${inked(accent)}/>`,
        )
        .join('') + `<circle cx="0" cy="${sY + 13}" r="4" ${inked(GOLD, 2)}/>`,
    );
  if (spec.extras.includes('bow tie'))
    out.push(
      `<path d="M0,${sY + 15} L-13,${sY + 9} L-13,${sY + 21} Z" ${inked(accent)}/>` +
        `<path d="M0,${sY + 15} L13,${sY + 9} L13,${sY + 21} Z" ${inked(accent)}/>` +
        `<circle cx="0" cy="${sY + 15}" r="3" ${inked(shade(accent), 2)}/>`,
    );
  return out.join('');
}

// ── Props ──────────────────────────────────────────────────────────────────

/**
 * How a prop is held: up in front, the arm bent at the elbow; high, by
 * a pole beside the head; or down at the side, hanging from the hand.
 * And how much larger than life it is drawn, as a cartoon draws what
 * matters: beside a head this big, a cup the size of a hand is lost.
 */
export const GRIPS: Record<
  FigureProp,
  { grip: 'up' | 'high' | 'down'; size: number }
> = {
  book: { grip: 'up', size: 1.3 },
  phone: { grip: 'up', size: 1.5 },
  cup: { grip: 'up', size: 1.5 },
  thermometer: { grip: 'up', size: 1.35 },
  syringe: { grip: 'up', size: 1.35 },
  pills: { grip: 'up', size: 1.45 },
  flag: { grip: 'high', size: 1 },
  umbrella: { grip: 'high', size: 1 },
  magnifier: { grip: 'up', size: 1.4 },
  bag: { grip: 'down', size: 1.25 },
  ball: { grip: 'up', size: 1.4 },
  lantern: { grip: 'up', size: 1.35 },
  letter: { grip: 'up', size: 1.35 },
  staff: { grip: 'high', size: 1 },
};
export const WOOD = '#8a5a3b';
const STEEL = '#c9cdd3';

/**
 * A prop as held in a right hand, drawn from the hand (at 0,0) outward
 * to +x, at its own size: the left hand's is its mirror. `up` is how far
 * above the hand the top of the head is, for a pole to clear it. With
 * how far it reaches out from the hand, and up.
 */
export function propOf(
  prop: FigureProp,
  accent: string,
  up: number,
  /** How far below the hand the ground is. */
  down = 0,
): { markup: string; out: number; top: number } {
  const k = GRIPS[prop].size;
  // Its lines as wide as the figure's, however large it is drawn.
  const W = (n: number) => r1(n / k);
  const drawn = ((): { markup: string; out: number; top: number } => {
    switch (prop) {
      case 'book': {
        // Open, its pages to the reader.
        const lines = [0.25, 0.45, 0.65]
          .flatMap((v) =>
            [-1, 1].map((s) =>
              line(
                `M${pt(s * 3.6, -32 + 24 * v)} L${pt(s * 20.4, -37 + 24 * v)}`,
                '#b9b4ae',
                W(1.6),
              ),
            ),
          )
          .join('');
        return {
          markup:
            `<path d="M0,-3 L-27,-11 L-27,-41 L0,-33 L27,-41 L27,-11 Z" ${inked(accent)}/>` +
            [-1, 1]
              .map(
                (s) =>
                  `<path d="M0,-7 L${s * 24},-14 L${s * 24},-38 L0,-31 Z" ${inked('#ffffff', W(2))}/>`,
              )
              .join('') +
            lines,
          out: 28,
          top: -42,
        };
      }
      case 'letter': {
        // A sheet held up to read, a corner folded, its lines of writing.
        const writing = [-34, -27, -20, -13]
          .map((y, i) =>
            line(`M-12,${y} L${i === 3 ? 3 : 12},${y}`, '#9d978f', W(1.8)),
          )
          .join('');
        return {
          markup:
            `<path d="M-17,-3 L-17,-42 L10,-42 L17,-35 L17,-3 Z" ${inked('#fbf7ee')}/>` +
            `<path d="M10,-42 L10,-35 L17,-35" fill="none" stroke="${FIGURE_INK}" stroke-width="${W(2)}" stroke-linejoin="round"/>` +
            writing,
          out: 18,
          top: -43,
        };
      }
      case 'phone':
        return {
          markup: `<rect x="-8" y="-32" width="16" height="30" rx="3.5" ${inked('#3a3740')}/><rect x="-5.5" y="-29" width="11" height="21" rx="1.5" ${flat('#9fd3f0')}/>`,
          out: 9,
          top: -33,
        };
      case 'cup': {
        const handle = 'M10,-22 Q21,-22 21,-15 Q21,-8 10,-8';
        return {
          markup:
            line(handle, FIGURE_INK, W(8.2)) +
            line(handle, accent, W(3)) +
            `<rect x="-11" y="-28" width="22" height="24" rx="3" ${inked(accent)}/>` +
            `<rect x="-9.7" y="-21" width="19.4" height="4" ${flat(shade(accent))}/>`,
          out: 24,
          top: -29,
        };
      }
      case 'thermometer':
        // Held up, the bulb under the hand.
        return {
          markup:
            `<rect x="-4" y="-46" width="8" height="54" rx="4" ${inked('#f5f5f2', W(2))}/>` +
            `<rect x="-1.6" y="-30" width="3.2" height="38" ${flat(RED)}/>` +
            [-38, -30, -22]
              .map((y) => line(`M4,${y} L7,${y}`, FIGURE_INK, W(1.6)))
              .join('') +
            `<circle cx="0" cy="12" r="6" ${inked(RED, W(2))}/>`,
          out: 8,
          top: -47,
        };
      case 'syringe':
        // Needle up, as a nurse holds it.
        return {
          markup:
            `<g transform="rotate(-38)">` +
            line('M30,0 L48,0', '#8d8f96', W(2.2)) +
            `<rect x="-6" y="-6" width="36" height="12" rx="2" ${inked('#eef6fb', W(2))}/>` +
            `<rect x="8" y="-3.6" width="20.5" height="7.2" ${flat('#7cc3e8')}/>` +
            [12, 18, 24]
              .map((x) => line(`M${x},-6 L${x},-2.5`, FIGURE_INK, W(1.2)))
              .join('') +
            `<rect x="-17" y="-2" width="12" height="4" ${inked(STEEL, W(1.6))}/>` +
            `<rect x="-21" y="-7" width="4" height="14" rx="1" ${inked(STEEL, W(1.6))}/>` +
            `<rect x="-8" y="-10" width="4" height="20" rx="1" ${inked(STEEL, W(1.6))}/>` +
            `</g>`,
          out: 39,
          top: -31,
        };
      case 'pills':
        // A bottle, a cross on its label.
        return {
          markup:
            `<rect x="-10" y="-30" width="20" height="28" rx="3" ${inked('#f0924a')}/>` +
            `<rect x="-7" y="-24" width="14" height="13" rx="1" ${flat('#ffffff')}/>` +
            `<path d="M-1.4,-21.5 h2.8 v3.1 h3.1 v2.8 h-3.1 v3.1 h-2.8 v-3.1 h-3.1 v-2.8 h3.1 Z" ${flat(RED)}/>` +
            `<rect x="-11.5" y="-39" width="23" height="10" rx="2" ${inked('#f5f5f2')}/>`,
          out: 12,
          top: -40,
        };
      case 'staff': {
        // From the ground to above the head, its crook curled outward.
        const top = r1(up / k - 34);
        const foot = r1(down / k - 2);
        const d = `M0,${foot} L0,${r1(top + 16)} Q0,${top} 12,${top} Q24,${top} 24,${r1(top + 12)} L24,${r1(top + 19)}`;
        return {
          markup: line(d, FIGURE_INK, W(7.4)) + line(d, WOOD, W(4)),
          out: 28,
          top: r1(top - 5),
        };
      }
      case 'flag': {
        const top = r1(up / k - 24);
        return {
          markup:
            line(`M0,14 L0,${top}`, FIGURE_INK, W(6.6)) +
            line(`M0,14 L0,${top}`, WOOD, W(3.4)) +
            `<circle cx="0" cy="${r1(top - 3)}" r="3.6" ${inked(GOLD, W(1.8))}/>` +
            `<path d="M2,${top} Q12,${r1(top - 5)} 23,${top} Q34,${r1(top + 5)} 45,${top} L45,${r1(top + 28)} Q34,${r1(top + 33)} 23,${r1(top + 28)} Q12,${r1(top + 23)} 2,${r1(top + 28)} Z" ${inked(accent)}/>`,
          out: 46,
          top: r1(top - 8),
        };
      }
      case 'umbrella': {
        // Over the head, the shaft leaning in from the hand beside it.
        const top = r1(up / k - 10);
        const cx = -40;
        const w = 64;
        const scallops = [2, 1, 0, -1]
          .map((j) => {
            const a = cx + (j * w) / 2;
            const b = cx + ((j - 1) * w) / 2;
            return `Q${r1((a + b) / 2)},${r1(top - 9)} ${r1(b)},${top}`;
          })
          .join(' ');
        return {
          markup:
            line(`M0,8 L0,16 Q0,24 -7,24 Q-12,24 -12,19`, FIGURE_INK, W(3.4)) +
            line(`M0,10 L${cx},${top}`, FIGURE_INK, W(3)) +
            `<path d="M${cx - w},${top} Q${cx - w},${r1(top - 28)} ${cx},${r1(top - 30)} Q${cx + w},${r1(top - 28)} ${cx + w},${top} ${scallops} Z" ${inked(accent)}/>` +
            [-1, 1]
              .map((s) =>
                line(
                  `M${cx},${r1(top - 30)} Q${cx + (s * w) / 4},${r1(top - 22)} ${cx + (s * w) / 2},${top}`,
                  shade(accent, 0.75),
                  W(2),
                ),
              )
              .join('') +
            line(
              `M${cx},${r1(top - 30)} L${cx},${r1(top - 36)}`,
              FIGURE_INK,
              W(3),
            ),
          out: cx + w + 1,
          top: r1(top - 37),
        };
      }
      case 'magnifier':
        return {
          markup:
            line('M-2,8 L9,-14', FIGURE_INK, W(7.6)) +
            line('M-2,8 L9,-14', WOOD, W(4.2)) +
            `<circle cx="15" cy="-27" r="14" fill="#d6ecf7" fill-opacity="0.85" stroke-width="${W(4.6)}"/>` +
            line('M7,-30 Q9,-36 15,-37', '#ffffff', W(2.4)),
          out: 31,
          top: -43,
        };
      case 'bag':
        // Hanging from the hand at the side.
        return {
          markup:
            `<path d="M-8,6 Q-8,-9 0,-9 Q8,-9 8,6" fill="none" stroke-width="${W(2.6)}"/>` +
            `<path d="M-15,5 L15,5 L17,31 L-17,31 Z" ${inked(accent)}/>` +
            line('M-15.4,11 L15.4,11', shade(accent), W(2)),
          out: 18,
          top: -10,
        };
      case 'ball':
        return {
          markup:
            `<circle cx="0" cy="-19" r="14" ${inked(accent)}/>` +
            line('M-13.6,-17 Q0,-11 13.6,-17', shade(accent, 0.7), W(2.2)) +
            line('M-2,-32.8 Q-7,-19 -2,-5.2', shade(accent, 0.7), W(2.2)),
          out: 15,
          top: -34,
        };
      default:
        // A lantern, hanging from the hand held up: its glow round it.
        return {
          markup:
            `<circle cx="0" cy="25" r="21" fill="#ffe16b" fill-opacity="0.3" stroke="none"/>` +
            `<path d="M-8,10 Q-8,-5 0,-5 Q8,-5 8,10" fill="none" stroke-width="${W(2.4)}"/>` +
            `<path d="M-9,10 L9,10 L12,15 L-12,15 Z" ${inked('#3a3740', W(2))}/>` +
            `<rect x="-10" y="15" width="20" height="20" ${inked('#ffe16b', W(2))}/>` +
            `<path d="M0,19.5 Q4.5,25 0,30.5 Q-4.5,25 0,19.5 Z" ${flat('#f0924a')}/>` +
            `<rect x="-12" y="35" width="24" height="5" rx="1.5" ${inked('#3a3740', W(2))}/>`,
          out: 21,
          top: -6,
        };
    }
  })();
  return {
    markup:
      k === 1
        ? drawn.markup
        : `<g transform="scale(${k})" stroke-width="${W(LINE)}">${drawn.markup}</g>`,
    out: r1(drawn.out * k),
    top: r1(drawn.top * k),
  };
}

// ── The figure ─────────────────────────────────────────────────────────────

export interface FigureDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Part name to the id of its group: head, body, arms, legs. */
  parts: Record<string, string>;
  /** Each face, by name, to the id of its group. */
  states: Record<string, string>;
  /** Where the head, the body and the legs are, in the frame's units. */
  anchors: {
    head: [number, number];
    body: [number, number];
    legs: [number, number];
  };
  /**
   * One person standing: each arm's shoulder, elbow and hand as drawn, in
   * the frame's units, so the player can put a hand where it means to:
   * on a shoulder, toward a face, round someone. None for a group, or for
   * one lying down.
   */
  joints?: Record<'r' | 'l', [Point2, Point2, Point2]>;
  /** And each leg's hip, knee and foot: the knees bend by them, and the body sinks as far as the legs fold. */
  legs?: Record<'r' | 'l', [Point2, Point2, Point2]>;
  /** Made with rig 2 (studio-world-plan §4.6): what swings is drawn as chains; with rig 3, from every side as well (studio-views-plan §1.2). Absent, rig 1. */
  rig?: 2 | 3;
  /** On rig 3, each view's group, front first: the stage shows one at a time. */
  views?: string[];
  /** On rig 2, each part that swings, its root in the frame's units. */
  dangles?: Dangle[];
  /** On rig 2, one who walks: how far one full stride (both feet) carries them, in the frame's units, and how they go. */
  stride?: { length: number; gait: 'walk' };
}

/** How the mouth moves while talking: open and shut, unevenly, as speech does. */
const TALK = [
  [0, 10],
  [18, 30],
  [40, 46],
  [55, 70],
  [78, 86],
];
/** The talking mouth's opening and shutting, as keyframes: `shown`, the talking shape's; else the resting one's. */
export function keyframes(name: string, shown: boolean): string {
  const stops: string[] = [];
  let at = 0;
  for (const [from, to] of TALK) {
    if (from > at)
      stops.push(`${at}%,${from - 0.1}%{opacity:${shown ? 0 : 1}}`);
    stops.push(`${from}%,${to - 0.1}%{opacity:${shown ? 1 : 0}}`);
    at = to;
  }
  stops.push(`${at}%,100%{opacity:${shown ? 0 : 1}}`);
  return `@keyframes ${name}{${stops.join('')}}`;
}

/** What one person is drawn from, layer by layer, at the rig's origin. */
export interface Layers {
  R: Rig;
  legs: string;
  behind: string;
  body: string;
  /** The body seen from behind: what is worn, with nothing of its front (no collar, no buttons). */
  bodyBack: string;
  arms: string;
  /** An arm that reaches the face, drawn in front of it: a hand on the head, over the mouth. */
  reach: string;
  head: string;
  /** The eyes' whites, under every face. */
  eyes: string;
  faces: Record<Expression, string>;
  /** The kit's own faces. */
  more: Record<KitFace, string>;
  /** The faces drawn only when a page shows them. */
  asked: Record<AskedFace, string>;
  /** The mouth's shapes while speaking, shared by every face. */
  mouths: string;
  signs: Record<FigureSign, string>;
  blink: string;
  over: string;
  /** How far they reach past the frame, in the kit's units: a pointing hand, a flag, an umbrella over the head. */
  beyond: { left: number; right: number; up: number };
  /** Each arm's shoulder, elbow and hand as drawn: the rig's joints. */
  joints: Record<'r' | 'l', [Point2, Point2, Point2]>;
  /** Each leg's hip, knee and foot as drawn. */
  legJoints: Record<'r' | 'l', [Point2, Point2, Point2]>;
  /** On rig 2, what swings, each with its root in the kit's units; none on rig 1. */
  dangles: Dangle[];
}

/** Whether someone in a pose has a hand free to hold something. */
export function canHold(pose: FigurePose): boolean {
  return holderOf(pose, 'book') !== 0;
}

/** Which hand holds a prop in a pose: the right, the left when the right is busy, none when both are. */
export function holderOf(
  pose: FigurePose,
  holding: FigureProp | null,
): -1 | 0 | 1 {
  if (!holding) return 0;
  switch (pose) {
    case 'standing':
    case 'holding':
      return 1;
    case 'hand on head':
    case 'hand on mouth':
    case 'pointing':
    case 'waving':
      return -1;
    default:
      return 0;
  }
}

export type Point2 = [number, number];

/** A point a share of the way along a line through points, and the line between two shares of it. */
export function alongOf(joints: Point2[]) {
  const lengths = joints
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - joints[i][0], p[1] - joints[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const at = (k: number): Point2 => {
    let left = k * total;
    for (let i = 0; i < lengths.length; i += 1) {
      if (left <= lengths[i] || i === lengths.length - 1) {
        const f = lengths[i] ? Math.min(1, left / lengths[i]) : 0;
        const [a, b] = [joints[i], joints[i + 1]];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      left -= lengths[i];
    }
    return joints[joints.length - 1];
  };
  const stretch = (from: number, to: number): string => {
    const points = [at(from)];
    let run = 0;
    for (let i = 0; i < lengths.length - 1; i += 1) {
      run += lengths[i];
      if (run / total > from && run / total < to) points.push(joints[i + 1]);
    }
    points.push(at(to));
    return `M${points.map((p) => pt(...p)).join(' L')}`;
  };
  return { at, stretch };
}

export function layersOf(
  spec: FigureSpec,
  pose: FigurePose = 'standing',
  holding: FigureProp | null = null,
  /** On rig 2, the prefix of this one's clip paths' ids: what swings is drawn as chains. */
  clip?: string,
): Layers {
  const chains: Chains | undefined = clip ? { clip, dangles: [] } : undefined;
  const R = rigOf(spec.age, spec.build);
  const skin = SKIN[Math.min(SKIN_TONES, Math.max(1, spec.skin)) - 1];
  const hairColour = HAIR[spec.hairColour];
  const dressed = dressOf(spec, R);
  const { hemY, sY, cy, halfShoulder: s2 } = R;
  const h2 = R.halfHem;
  const lying = pose === 'lying';

  const bottom = hemY + dressed.longer;
  // The body's half-width at a height, along its slope, flared below the hem.
  const slope = (h2 - s2) / (hemY - (sY + 12));
  const halfAt = (y: number) =>
    s2 +
    slope * (y - (sY + 12)) +
    (y > hemY ? (dressed.flare * (y - hemY)) / Math.max(1, dressed.longer) : 0);

  // Legs, shoes, and what is worn on the legs: each leg its own group, so
  // a walk lifts one and then the other.
  const legs: string[] = [];
  const bare =
    spec.top === 'dress' ||
    spec.top === 'robe' ||
    spec.top === 'animal skin' ||
    spec.top === 'armour' ||
    spec.bottom === 'skirt' ||
    spec.bottom === 'wrapper';
  const trousers = CLOTH[spec.bottomColour];
  const legTop = hemY - 4;
  // The knee, halfway down: the shin turns about it, so the legs fold and
  // the body sinks (a crouch, sitting down) with the feet on the ground.
  const kneeY = r1((legTop - FEET) / 2);
  const legJoints = {} as Layers['legJoints'];
  for (const s of [-1, 1]) {
    const x = s * 15 - 8;
    const colour = bare || spec.bottom === 'shorts' ? skin : trousers;
    // The thigh and the shin, each open at the knee (no outline across
    // it), over a round knee: standing, one leg as before; bent, the knee
    // shows where they part.
    const piece = (open: number, shut: number) =>
      `<path d="M${x},${r1(open)} V${r1(shut)} H${x + 16} V${r1(open)}" fill="${colour}"/>`;
    const thigh = [piece(kneeY + 1, legTop)];
    if (!bare && spec.bottom === 'shorts') {
      const cut = hemY + Math.max(8, (-FEET - hemY) * 0.45);
      thigh.push(
        `<rect x="${x - 1}" y="${legTop}" width="18" height="${r1(cut - legTop)}" ${inked(trousers)}/>`,
      );
    }
    // Sandals: the foot, and straps over it; bare feet, the foot alone.
    // The foot stays flat on the ground however the leg above it turns.
    const foot = spec.extras.includes('sandals')
      ? [
          `<ellipse cx="${s * 17}" cy="-6" rx="15" ry="7" ${inked(skin)}/>`,
          line(`M${s * 17 - 11},-5 L${s * 17 + 11},-5`, '#6b4a2f', 3),
          line(`M${s * 17 - 4},-11 L${s * 17 - 4},-1`, '#6b4a2f', 3),
        ]
      : spec.extras.includes('bare feet')
        ? [`<ellipse cx="${s * 16}" cy="-5" rx="13" ry="6" ${inked(skin)}/>`]
        : [`<ellipse cx="${s * 17}" cy="-6" rx="15" ry="7" ${inked(SHOE)}/>`];
    const shin = [
      piece(kneeY, -FEET),
      `<g class="foot" style="transform-origin:${s * 15}px ${-FEET}px">${foot.join('')}</g>`,
    ];
    // Each leg turns about its hip (a kick, knees apart), and its shin
    // about the knee.
    legs.push(
      `<g class="leg l${s < 0 ? 0 : 1}" style="transform-origin:${s * 15}px ${r1(legTop)}px"><circle cx="${s * 15}" cy="${kneeY}" r="8" fill="${colour}"/><g class="shin" style="transform-origin:${s * 15}px ${kneeY}px">${shin.join('')}</g>${thigh.join('')}</g>`,
    );
    legJoints[s > 0 ? 'r' : 'l'] = [
      [s * 15, r1(legTop)],
      [s * 15, kneeY],
      [s * 15, -FEET],
    ];
  }
  if (
    (spec.bottom === 'skirt' || spec.bottom === 'wrapper') &&
    spec.top !== 'dress' &&
    spec.top !== 'robe'
  ) {
    // A wrapper falls to the ankles, its end tucked across the front.
    const wrapper = spec.bottom === 'wrapper';
    const down = wrapper ? -FEET - 3 : hemY + Math.max(12, R.legs * 0.5);
    const skirt = [
      `<path d="M${r1(-h2 + 2)},${hemY - 6} L${r1(h2 - 2)},${hemY - 6} L${r1(h2 + 6)},${r1(down)} L${r1(-h2 - 6)},${r1(down)} Z" ${inked(trousers)}/>`,
    ];
    if (wrapper)
      skirt.push(
        line(
          `M${r1(h2 - 4)},${hemY - 4} L${r1(-h2 * 0.2)},${r1(down)}`,
          shade(trousers, 0.72),
          2.4,
        ),
        `<rect x="${r1(-h2 + 2)}" y="${hemY - 6}" width="${r1(h2 * 2 - 4)}" height="6" ${inked(shade(trousers, 0.85), 2)}/>`,
      );
    // It sinks with the body; one to the ankles is taken up as it does, so
    // its hem stays off the ground.
    legs.push(
      wrapper
        ? `<g class="skirt wrap" style="transform-origin:0 ${hemY - 6}px;--reach:${r1(down - (hemY - 6))}">${skirt.join('')}</g>`
        : `<g class="skirt">${skirt.join('')}</g>`,
    );
  }

  // The body: a trapezoid rounded at the shoulders, as long as what is worn.
  const hb = halfAt(bottom);
  const shape = `<path d="M${r1(-hb)},${r1(bottom)} L${r1(-s2)},${sY + 12} Q${r1(-s2)},${sY} ${r1(-s2 + 12)},${sY} L${r1(s2 - 12)},${sY} Q${r1(s2)},${sY} ${r1(s2)},${sY + 12} L${r1(hb)},${r1(bottom)} Z" ${inked(dressed.fill)}/>`;
  const body = [
    shape,
    dressed.details,
    extrasOnBody(spec, R, chains),
    dressed.collar,
  ].join('');

  // Arms over the body: a sleeve, then a mitten hand, where the pose
  // puts it, bent at the elbow to hold something up. One that reaches
  // the face is drawn in front of it.
  const arms: string[] = [];
  const reach: string[] = [];
  const hands: Point2[] = [];
  const joints = {} as Layers['joints'];
  const width = spec.build === 'slim' ? 14 : spec.build === 'broad' ? 16 : 15;
  const belly = r1(sY + (hemY - sY) * 0.66);
  const long = hemY - sY;
  const holds = holderOf(pose, holding);
  const beyond: { left: number; right: number; top: number } = {
    left: FIGURE_FRAME.halfWidth,
    right: FIGURE_FRAME.halfWidth,
    top: R.top - FIGURE_FRAME.headroom,
  };
  // Wings reach out past the frame's sides.
  if (spec.extras.includes('wings')) {
    beyond.left = Math.max(beyond.left, WING_SPAN + 4);
    beyond.right = Math.max(beyond.right, WING_SPAN + 4);
  }
  const rest = (s: number): Point2 => [s * (h2 + 3), hemY - 8];
  const handFor = (
    s: number,
  ): { at: Point2; elbow?: Point2; front?: boolean } => {
    if (holding && s === holds)
      switch (GRIPS[holding].grip) {
        case 'down':
          // Low enough to swing clear of the floor, however short the legs.
          return { at: [s * (h2 + 3), Math.min(hemY - 8, -46)] };
        case 'high':
          return {
            at: [s * (s2 + 18), r1(sY + 4)],
            elbow: [s * (s2 + 16), r1(sY + long * 0.5)],
          };
        default:
          return {
            at: [s * (s2 + 20), r1(sY + long * 0.3)],
            elbow: [s * (s2 + 5), r1(sY + long * 0.62)],
          };
      }
    const right = s === 1;
    switch (pose) {
      case 'hand on head':
        return right ? { at: [36, cy - 16], front: true } : { at: rest(s) };
      case 'hand on mouth':
        return right ? { at: [6, R.mouthY + 3], front: true } : { at: rest(s) };
      case 'hands on belly':
        return { at: [s * 12, belly] };
      case 'arms up':
        return { at: [s * (s2 + 24), sY - 40] };
      case 'pointing':
        return right ? { at: [s2 + 44, sY + 14] } : { at: rest(s) };
      case 'waving':
        return right ? { at: [s2 + 30, sY - 38] } : { at: rest(s) };
      default:
        return { at: rest(s) };
    }
  };
  const plans = new Map([-1, 1].map((s) => [s, handFor(s)]));
  // A walking stick is in a hand free at the side: the right, else the left.
  const free = (s: number) =>
    s !== holds &&
    plans.get(s)!.at[0] === rest(s)[0] &&
    plans.get(s)!.at[1] === rest(s)[1];
  const stick = spec.extras.includes('walking stick')
    ? [1, -1].find(free)
    : undefined;
  for (const s of [-1, 1]) {
    const S: Point2 = [s * (s2 - 7), sY + 12];
    const { at: H, elbow, front } = plans.get(s)!;
    hands.push(H);
    const into = front ? reach : arms;
    // The elbow: where a bent arm bends, else halfway down a straight one.
    const E: Point2 = elbow ?? [r1((S[0] + H[0]) / 2), r1((S[1] + H[1]) / 2)];
    const { stretch } = alongOf([S, E, H]);
    joints[s > 0 ? 'r' : 'l'] = [S, E, H];
    const upperLength = Math.hypot(E[0] - S[0], E[1] - S[1]);
    const u =
      upperLength / (upperLength + Math.hypot(H[0] - E[0], H[1] - E[1]) || 1);
    if (s === stick) {
      const d = `M${pt(H[0] + s * 2, H[1] - 6)} L${pt(H[0] + s * 7, -3)}`;
      arms.push(line(d, FIGURE_INK, 7), line(d, WOOD, 4));
    }
    const w =
      dressed.sleeves === 'flowing'
        ? width + 14
        : dressed.sleeves === 'wide'
          ? width + 5
          : width;
    const colour = dressed.sleeves === 'short' ? skin : dressed.sleeve;
    // The forearm, from the elbow: its sleeve, a jumper's cuff, what the
    // hand holds under the hand, the hand, a pointing finger.
    const fore: string[] = [
      line(stretch(u, 1), FIGURE_INK, w + LINE * 2),
      line(stretch(u, 1), colour, w),
    ];
    if (spec.top === 'jumper')
      fore.push(line(stretch(Math.max(0.8, u), 0.9), shade(dressed.sleeve), w));
    if (holding && s === holds) {
      const prop = propOf(
        holding,
        CLOTH[spec.accentColour],
        R.top - H[1],
        -H[1],
      );
      fore.push(
        `<g transform="translate(${r1(H[0])} ${r1(H[1])})${s < 0 ? ' scale(-1 1)' : ''}">${prop.markup}</g>`,
      );
      if (s > 0) beyond.right = Math.max(beyond.right, H[0] + prop.out + 3);
      else beyond.left = Math.max(beyond.left, -H[0] + prop.out + 3);
      beyond.top = Math.min(beyond.top, H[1] + prop.top - 3);
    }
    fore.push(
      `<circle cx="${r1(H[0])}" cy="${r1(H[1])}" r="8.5" ${inked(skin)}/>`,
    );
    if (pose === 'pointing' && s === 1) {
      fore.push(
        `<rect x="${r1(H[0] + 4)}" y="${r1(H[1] - 3.5)}" width="13" height="7" rx="3.5" ${inked(skin)}/>`,
      );
      beyond.right = Math.max(beyond.right, H[0] + 20);
    }
    // The upper arm: its outline under everything, its colour over the
    // elbow, so the joint shows no seam however the forearm turns.
    const upper = [line(stretch(0, u), colour, w)];
    if (dressed.sleeves === 'short')
      upper.push(line(stretch(0, Math.min(0.42, u)), dressed.sleeve, w));
    let arm = `${line(stretch(0, u), FIGURE_INK, w + LINE * 2)}<g class="fore" style="transform-origin:${r1(E[0])}px ${r1(E[1])}px">${fore.join('')}</g>${upper.join('')}`;
    // A wave, from the shoulder.
    if (pose === 'waving' && s === 1) {
      arm = `<g class="wave">${arm}</g>`;
      // The hand swings out as it waves.
      beyond.right = Math.max(beyond.right, H[0] + 22);
    }
    into.push(
      `<g class="arm ${s > 0 ? 'ar' : 'al'}" style="transform-origin:${r1(S[0])}px ${r1(S[1])}px">${arm}</g>`,
    );
  }

  // The head: the face's ground, then hair and hats. A headscarf wraps it
  // and falls over the shoulders, leaving the face.
  const head: string[] = [];
  if (spec.headwear === 'headscarf' || spec.headwear === 'mantle') {
    // A mantle falls further, over the shoulders.
    const c = CLOTH[spec.accentColour];
    const fall = spec.headwear === 'mantle' ? sY + 44 : sY + 30;
    head.push(
      `<path d="M-54,${cy} Q-54,${cy - 52} 0,${cy - 52} Q54,${cy - 52} 54,${cy} Q58,${sY + 22} 46,${fall} L-46,${fall} Q-58,${sY + 22} -54,${cy} Z" ${inked(c)}/>`,
      `<ellipse cx="0" cy="${cy + 5}" rx="41" ry="36" ${inked(skin)}/>`,
    );
  } else if (spec.headwear === 'nemes') {
    // A pharaoh's headcloth: striped, flat over the brow, falling in two
    // lappets in front of the shoulders.
    const stripes = [-1, 1]
      .flatMap((s) =>
        [0, 1, 2].map((k) =>
          line(
            `M${s * (46 + k * 3)},${cy + k * 14} L${s * (40 + k * 3)},${sY + 30}`,
            CLOTH.navy,
            3,
          ),
        ),
      )
      .join('');
    head.push(
      `<path d="M-50,${cy - 22} Q-48,${cy - 50} 0,${cy - 52} Q48,${cy - 50} 50,${cy - 22} L62,${sY + 36} L28,${sY + 36} L30,${cy + 10} L-30,${cy + 10} L-28,${sY + 36} L-62,${sY + 36} Z" ${inked(GOLD)}/>`,
      stripes,
      `<ellipse cx="0" cy="${cy + 5}" rx="40" ry="35" ${inked(skin)}/>`,
      `<path d="M-42,${cy - 20} Q0,${cy - 34} 42,${cy - 20} L40,${cy - 10} Q0,${cy - 22} -40,${cy - 10} Z" ${inked(CLOTH.navy)}/>`,
    );
  } else {
    head.push(
      `<ellipse cx="0" cy="${cy}" rx="${HEAD.rx}" ry="${HEAD.ry}" ${inked(skin)}/>`,
    );
  }
  if (spec.extras.includes('freckles'))
    for (const s of [-1, 1])
      for (const [dx, dy] of [
        [0, 0],
        [5, 3],
        [-4, 4],
      ])
        head.push(
          `<circle cx="${s * (30 + dx)}" cy="${cy + 20 + dy}" r="1.7" ${flat(shade(skin, 0.62))}/>`,
        );
  if (spec.extras.includes('earrings') && spec.headwear !== 'headscarf')
    for (const s of [-1, 1])
      head.push(
        `<circle cx="${s * 45}" cy="${cy + 16}" r="3.4" ${inked(GOLD, 1.8)}/>`,
      );
  if (spec.facialHair === 'stubble')
    head.push(
      `<path d="${chord(0, cy, HEAD.rx, HEAD.ry, 0.35, 0, 'bottom')}" ${flat(hairColour)} fill-opacity="0.28"/>`,
    );
  if (spec.facialHair === 'beard')
    head.push(
      `<path d="${chord(0, cy + 3, 47, 44, 0.3, 0, 'bottom')}" ${inked(hairColour)}/>`,
    );
  head.push(hairOver(spec, R), headwearOf(spec, R));
  head.push(ribbonBow(spec, R), headscarfTail(spec, R, chains));
  // The eyes' whites, the same under every face: they turn with it.
  const whites = [-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${side * R.eyes.dx}" cy="${R.eyes.y}" rx="${R.eyes.rx}" ry="${R.eyes.ry}" ${inked('#ffffff')}/>`,
    )
    .join('');

  // Over the face: a moustache over the mouth, glasses over the eyes.
  const over: string[] = [];
  if (spec.facialHair === 'moustache' || spec.facialHair === 'beard') {
    const my = R.mouthY - 5;
    over.push(
      `<path d="M0,${my} Q-10,${my - 5} -17,${my + 2} Q-8,${my + 4} 0,${my + 1} Q8,${my + 4} 17,${my + 2} Q10,${my - 5} 0,${my} Z" ${inked(hairColour)}/>`,
    );
  }
  if (spec.extras.includes('glasses')) {
    const { y, dx } = R.eyes;
    for (const s of [-1, 1])
      over.push(
        `<circle cx="${s * dx}" cy="${y}" r="18.5" fill="none" stroke-width="2.4"/>`,
        line(`M${s * 34},${y - 2} L${s * 45},${y - 5}`, FIGURE_INK, 2.4),
      );
  }
  const signs = signsOf(
    {
      head: [0, cy],
      mouth: [0, R.mouthY],
      chest: [0, r1(sY + (hemY - sY) * 0.3)],
      belly: [0, belly],
      hands,
      feet: [
        [-17, -6],
        [17, -6],
      ],
      // Lying on their left side, only the right is off the floor.
      sides: lying
        ? [{ x: r1(h2 + 20), out: 1 }]
        : [
            { x: r1(-h2 - 20), out: -1 },
            { x: r1(h2 + 20), out: 1 },
          ],
    },
    R,
    skin,
  );
  return {
    R,
    legs: legs.join(''),
    behind: `${backOf(spec, R, bottom, hb, chains)}${packOf(spec, R)}<g class="hd">${hairBehind(spec, R, chains)}${ribbonEnds(spec, R, chains)}</g>`,
    body,
    bodyBack: shape,
    arms: arms.join(''),
    reach: reach.join(''),
    head: `<g class="hd">${head.join('')}</g>`,
    eyes: fm(whites),
    faces: Object.fromEntries(
      FACE_NAMES.map((name) => [name, fm(faceOf(name, R, skin))]),
    ) as Record<Expression, string>,
    more: { pain: fm(painFace(R, skin)) },
    asked: { 'eyes closed': fm(closedFace(R, skin)) },
    mouths: fm(mouthsOf(R)),
    // Lying down, what floats over the head is turned back upright
    // about it, so steam rises and a question mark reads.
    signs: lying
      ? (Object.fromEntries(
          FIGURE_SIGNS.map((name) => [
            name,
            signs.body[name] +
              (signs.air[name]
                ? `<g transform="rotate(90 0 ${cy})">${signs.air[name]}</g>`
                : ''),
          ]),
        ) as Record<FigureSign, string>)
      : upright(signs),
    blink: fm(blinkOf(R, skin)),
    over: over.length ? fm(over.join('')) : '',
    beyond: {
      left: r1(beyond.left - FIGURE_FRAME.halfWidth),
      right: r1(beyond.right - FIGURE_FRAME.halfWidth),
      up: r1(R.top - FIGURE_FRAME.headroom - beyond.top),
    },
    joints,
    legJoints,
    dangles: chains?.dangles ?? [],
  };
}

/** The most people one figure stands for: a team, a family, a class, as a few of them. */
export const MOST_TOGETHER = 4;
/** How far apart people in a group stand, in the kit's units: shoulder to shoulder. */
const APART = 118;

/**
 * Another of a group: dressed as the one described, and their own person
 * besides (their build, hair and its colour, a beard or none, a skin tone
 * near the described one, their own accent colour), the same every time.
 * Their extras are the described one's alone.
 */
export function companionOf(
  spec: FigureSpec,
  i: number,
  seed: string,
): FigureSpec {
  const pick = <T>(list: readonly T[], salt: string): T =>
    list[
      Math.floor(beatOf(`${seed}:${i}:${salt}`) * list.length) % list.length
    ];
  const hairs: readonly HairStyle[] =
    spec.age === 'child'
      ? ['short', 'pigtails', 'curly', 'ponytail', 'spiky', 'bob', 'afro']
      : spec.age === 'elder'
        ? ['balding', 'short', 'bun', 'curly', 'bald']
        : ['short', 'curly', 'bob', 'bun', 'afro', 'long', 'ponytail'];
  const grown = spec.age === 'adult' || spec.age === 'elder';
  return {
    ...spec,
    build: pick(FIGURE_BUILDS, 'build'),
    skin: Math.min(
      SKIN_TONES,
      Math.max(1, spec.skin + pick([-2, -1, 0, 1, 2], 'skin')),
    ),
    // Under a hat, hair that would stand out from under it is left out.
    hair: pick(
      hairs.filter(
        (hair) =>
          hair !== spec.hair &&
          (spec.headwear === 'none' || (hair !== 'afro' && hair !== 'bun')),
      ),
      'hair',
    ),
    hairColour:
      spec.age === 'elder'
        ? pick(['grey', 'white'] as const, 'colour')
        : pick(HAIR_COLOURS.slice(0, 6), 'colour'),
    facialHair: grown
      ? pick(['none', 'none', 'moustache', 'beard'] as const, 'beard')
      : 'none',
    accentColour: pick(CLOTH_COLOURS, 'accent'),
    extras: [],
  };
}

/**
 * Which signs' marks move in each of the kit's motions: each moves only
 * while a sign of its own is on, so a still, and a stage with motion
 * reduced, shows them at rest.
 */
const MOVES: [string, readonly FigureSign[], string, string][] = [
  [
    'tw',
    ['tingling hands', 'tingling feet', 'dizzy', 'confused'],
    'twinkle 1s ease-in-out infinite',
    '@keyframes twinkle{0%,100%{transform:scale(.55);opacity:.45}50%{transform:scale(1.1);opacity:1}}',
  ],
  [
    'throb',
    ['headache', 'chest pain', 'stomach ache', 'idea'],
    'throb .9s ease-in-out infinite',
    '@keyframes throb{0%,100%{transform:scale(.85)}50%{transform:scale(1.15)}}',
  ],
  [
    'rise',
    ['fever', 'sleeping'],
    'rise 2.4s linear infinite',
    '@keyframes rise{0%{transform:translateY(6px);opacity:0}25%{opacity:1}100%{transform:translateY(-22px);opacity:0}}',
  ],
  [
    'drip',
    ['sweating', 'tears'],
    'drip 1.3s ease-in infinite',
    '@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(16px);opacity:0}}',
  ],
  [
    'flicker',
    ['shaking', 'shivering'],
    'flicker .32s linear infinite',
    '@keyframes flicker{0%,49%{opacity:1}50%,100%{opacity:.25}}',
  ],
  [
    'puff',
    ['coughing', 'breathless'],
    'puff 1.8s ease-out infinite',
    '@keyframes puff{0%{transform:scale(.3);opacity:0}8%{opacity:.95}45%{transform:scale(1.25);opacity:0}100%{opacity:0}}',
  ],
];

/** How each action moves the whole body, while it is on: about the feet, which stay on the ground. */
const ACTS: Partial<Record<FigureSign, string>> = {
  shaking:
    '.on-shaking .whole{animation:shake .16s linear infinite}@keyframes shake{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-3px,-1px) rotate(-1.6deg)}50%{transform:translate(3px,0) rotate(1.2deg)}75%{transform:translate(-2px,-1px) rotate(-1deg)}}',
  shivering:
    '.on-shivering .whole{animation:shiver .1s linear infinite}@keyframes shiver{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1.2px)}}',
  dizzy:
    '.on-dizzy .whole{animation:sway 2.6s ease-in-out infinite}@keyframes sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}',
  coughing:
    '.on-coughing .whole{animation:cough 1.8s ease-out infinite}@keyframes cough{0%,24%,100%{transform:translateY(0) rotate(0)}6%{transform:translateY(3px) rotate(2.4deg)}14%{transform:translateY(0) rotate(0)}}',
  sleeping: '.on-sleeping .breathe{animation-duration:6.5s}',
  breathless: '.on-breathless .breathe{animation-duration:1.1s}',
  // A walk in place: the body bobs as one foot lifts, then the other.
  walking:
    '.on-walking .breathe{animation:bob .64s ease-in-out infinite}@keyframes bob{0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-3px)}}.on-walking .leg{animation:step .64s ease-in-out infinite}.on-walking .l1{animation-delay:-.32s}@keyframes step{0%,50%,100%{transform:translateY(0)}25%{transform:translateY(-8px)}}',
  // Up and down again, squashed on landing.
  jumping:
    '.on-jumping .whole{animation:jump .9s ease-in-out infinite}@keyframes jump{0%,100%{transform:translateY(0) scale(1.05,.93)}12%{transform:translateY(0) scale(1)}45%{transform:translateY(-30px) scale(.98,1.03)}78%{transform:translateY(0) scale(1)}88%{transform:translateY(0) scale(1.06,.92)}}',
};

/** How often the kit's people blink, in seconds, and the blink in each cycle: shut a moment near its end. */
export const BLINK_S = 5.3;
export const BLINK_FRAMES =
  '0%,95.4%{opacity:0}95.5%,98%{opacity:1}98.1%,100%{opacity:0}';

/**
 * A figure's own motion: a breath, a blink for each of them on their own
 * beat, a mouth that moves while talking, a wave; and for each sign
 * drawn, how its marks and the body move while it is on.
 */
export function styleOf(
  breathAt: number,
  blinks: number[],
  signs: readonly FigureSign[],
  waves = false,
  /** Where the head turns about: the neck, in the kit's units. */
  neck = 0,
  /**
   * Made with rig 2: its walk is the player's (studio-world-plan §4.2),
   * the legs swung and the body bobbed by the rig's variables as far as
   * it goes, so no loop of its own steps them.
   */
  rig2 = false,
): string {
  const acts = (one: FigureSign) =>
    rig2 && one === 'walking' ? '' : (ACTS[one] ?? '');
  const moving = MOVES.filter(([, of]) =>
    of.some((one) => signs.includes(one)),
  );
  return [
    `.breathe{animation:breathe 4.6s ease-in-out infinite;animation-delay:-${breathAt}s}`,
    '@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}',
    `.blink{animation:blink ${BLINK_S}s linear infinite}`,
    ...blinks.map((at, i) => `.b${i}{animation-delay:-${at}s}`),
    `@keyframes blink{${BLINK_FRAMES}}`,
    '.talking .mouth{animation:shut 1.2s linear infinite}',
    '.talking .talk{animation:talk 1.2s linear infinite}',
    keyframes('talk', true),
    keyframes('shut', false),
    waves
      ? '.wave{transform-box:fill-box;transform-origin:0% 100%;animation:wave 1s ease-in-out infinite}@keyframes wave{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(12deg)}}'
      : '',
    moving.length
      ? `${moving.map(([cls]) => `.${cls}`).join(',')}{transform-box:fill-box;transform-origin:center}`
      : '',
    ...moving.map(
      ([cls, of, animation, frames]) =>
        `${of
          .filter((one) => signs.includes(one))
          .map((one) => `.on-${signId(one)} .${cls}`)
          .join(',')}{animation:${animation}}${frames}`,
    ),
    signs.some((one) => ACTS[one]?.includes('.whole'))
      ? '.whole{transform-box:view-box;transform-origin:0 0}'
      : '',
    ...signs.map(acts),
    // Anyone may walk on and off, whatever their signs.
    signs.includes('walking') ? '' : acts('walking'),
    rigStyle(neck),
  ].join('');
}

/**
 * How the stage moves a figure as it acts: CSS variables on its <svg>,
 * set each frame, and classes for the mouth's shape. At 0 every one, the
 * figure stands exactly as drawn.
 *
 * --gx, --gy: where the pupils look, in the kit's units. --turn, -1 to 1:
 * the face turned toward one side. --tilt, --nod: the head tilted (in
 * degrees) and nodded (in units), about the neck. --brow: the brows
 * raised. --ar, --arf, --al, --alf: the right and left arm about the
 * shoulder, and the forearm about the elbow, in degrees. --legr, --legl:
 * the right and left leg about the hip, in degrees (a kick, knees apart).
 * --knr, --knl: each shin about its knee, in degrees, the foot kept flat.
 * --low: the body sunk on its legs, in units (a crouch, sitting down).
 * --lean and --flip: the whole figure leant about its feet, and mirrored.
 */
function rigStyle(neck: number): string {
  const head = `transform-box:view-box;transform-origin:0 ${r1(neck)}px`;
  const nodTilt =
    'translateY(calc(var(--nod,0)*1px)) rotate(calc(var(--tilt,0)*1deg))';
  return [
    '.pupils{transform:translate(calc(var(--gx,0)*1px),calc(var(--gy,0)*1px))}',
    '.brows{transform:translateY(calc(var(--brow,0)*-1px))}',
    `.hd{${head};transform:${nodTilt}}`,
    `.fm{${head};transform:${nodTilt} translateX(calc(var(--turn,0)*7px))}`,
    '.arm,.fore{transform-box:view-box}',
    '.ar{transform:rotate(calc(var(--ar,0)*1deg))}.ar .fore{transform:rotate(calc(var(--arf,0)*1deg))}',
    '.al{transform:rotate(calc(var(--al,0)*1deg))}.al .fore{transform:rotate(calc(var(--alf,0)*1deg))}',
    '.leg{transform-box:view-box}.l1{transform:rotate(calc(var(--legr,0)*1deg))}.l0{transform:rotate(calc(var(--legl,0)*1deg))}',
    '.shin,.foot,.skirt{transform-box:view-box}.l1 .shin{transform:rotate(calc(var(--knr,0)*1deg))}.l0 .shin{transform:rotate(calc(var(--knl,0)*1deg))}',
    '.l1 .foot{transform:rotate(calc((var(--legr,0) + var(--knr,0))*-1deg))}.l0 .foot{transform:rotate(calc((var(--legl,0) + var(--knl,0))*-1deg))}',
    '.leg,.breathe,.skirt{translate:0 calc(var(--low,0)*1px)}.wrap{scale:1 calc(1 - var(--low,0) / var(--reach,100))}',
    '.flip{transform-box:view-box;transform-origin:0 0;transform:scaleX(var(--flip,1)) rotate(calc(var(--lean,0)*1deg))}',
    '.vm{opacity:0}.lipsync .mouth,.lipsync .talk{opacity:0}',
    `${Array.from({ length: MOUTH_SHAPES }, (_, k) => `.lipsync.v${k} .v${k}`).join(',')}{opacity:1}`,
  ].join('');
}

/** The eyes' whites as a clip: pupils never look out past them. `id` is the clip's own, unique where many people share a drawing. */
export function eyeClip(R: Rig, id = 'eyes'): string {
  return `<defs>${eyeClipPath(R, id)}</defs>`;
}

/** The eyes' whites as a clip path alone, for a drawing that keeps its own definitions. */
export function eyeClipPath(R: FaceRig, id = 'eyes'): string {
  const { y, dx, rx, ry } = R.eyes;
  return `<clipPath id="${id}">${[-1, 1]
    .map(
      (side) =>
        `<ellipse cx="${side * dx}" cy="${y}" rx="${rx - 1}" ry="${ry - 1}"/>`,
    )
    .join('')}</clipPath>`;
}

/** Every state a figure has, by name to the id of its group: the faces, the kit's faces, those asked for, and the signs drawn. */
export function statesOf(
  signs: readonly FigureSign[],
  faces: readonly AskedFace[] = [],
): Record<string, string> {
  return Object.fromEntries(
    [
      ...FIGURE_FACES.map((name) => [name, name]),
      ...faces.map((name) => [name, faceId(name)]),
      ...signs.map((name) => [name, signId(name)]),
    ].map(([name, id]): [string, string] => [name, id]),
  );
}

/** The signs to draw for someone in a pose: those asked for, in the list's order; none that needs their feet when they are lying down. */
export function signsFor(
  pose: FigurePose,
  asked: readonly FigureSign[] = [],
): FigureSign[] {
  return FIGURE_SIGNS.filter(
    (sign) =>
      asked.includes(sign) &&
      !(LYING_POSES.includes(pose) && ON_FOOT.includes(sign)),
  );
}

/** The bed, in the kit's units: the mattress's top, and where the head rests on the pillows. */
const BED = { top: -78, head: [-76, -148] as [number, number], half: 138 };

/**
 * Someone in bed: a patient, the sick, the sleeping. The same head, face,
 * hair and hat as they have standing, propped on pillows at the bed's
 * head, their shoulders and top above the blanket and their hands on it;
 * the bed a plain one with a rail at each end. Faces, blinks and talking
 * work as they do standing, and the blanket rises and falls as they
 * breathe.
 */
function drawInBed(
  spec: FigureSpec,
  key: string,
  asked?: readonly FigureSign[],
  /** Before beds had metal frames: a low wooden pallet and a woven mat. */
  old = false,
  /** The faces drawn only when asked for: eyes closed. */
  faces: readonly AskedFace[] = [],
  /** On rig 2, the prefix of its clip paths' ids: what swings is drawn as chains. */
  clip?: string,
): FigureDrawing {
  const layers = layersOf(spec, 'standing', null, clip);
  const { R } = layers;
  const skin = SKIN[Math.min(SKIN_TONES, Math.max(1, spec.skin)) - 1];
  const top = BED.top;
  const [hx, hy] = BED.head;
  const moved = (markup: string) =>
    `<g transform="translate(${hx} ${r1(hy - R.cy)})">${markup}</g>`;
  const frame = '#b9c0ca';
  const blanket = shade(CLOTH[spec.accentColour], 1.55);
  const shirt = CLOTH[spec.topColour];
  const w = BED.half;
  const wood = '#9a6b3f';
  const mat = '#d9c49a';
  const bed = old
    ? [
        // A low wooden pallet on short legs, a woven mat, a rolled cloth.
        ...[-w + 16, w - 26].map(
          (x) =>
            `<rect x="${x}" y="${top + 26}" width="10" height="${-top - 26}" rx="2" ${inked(wood)}/>`,
        ),
        `<rect x="${-w + 6}" y="${top + 10}" width="${2 * w - 12}" height="18" rx="3" ${inked(wood)}/>`,
        `<rect x="${-w + 10}" y="${top}" width="${2 * w - 20}" height="14" rx="4" ${inked(mat)}/>`,
        ...[-w + 40, -w + 90, -w + 140, -w + 190, -w + 240].map((x) =>
          line(`M${x},${top + 2} L${x},${top + 12}`, shade(mat, 0.8), 2),
        ),
        `<ellipse cx="${hx - 6}" cy="${top - 34}" rx="46" ry="18" ${inked(shade(mat, 0.92))}/>`,
      ].join('')
    : [
        // Legs, the base, the rails at each end, the mattress, the pillows.
        ...[-w + 14, w - 22].map(
          (x) =>
            `<rect x="${x}" y="${top + 26}" width="8" height="${-top - 32}" ${inked(frame)}/><circle cx="${x + 4}" cy="-5" r="5" ${inked(SHOE)}/>`,
        ),
        `<rect x="${-w + 6}" y="${top + 10}" width="${2 * w - 12}" height="18" rx="4" ${inked(frame)}/>`,
        `<rect x="${-w}" y="${top - 88}" width="14" height="${118}" rx="6" ${inked(frame)}/>`,
        `<rect x="${w - 14}" y="${top - 36}" width="14" height="${66}" rx="6" ${inked(frame)}/>`,
        `<rect x="${-w + 12}" y="${top}" width="${2 * w - 24}" height="14" rx="5" ${inked('#f3f1ec')}/>`,
        `<ellipse cx="${hx - 6}" cy="${top - 40}" rx="50" ry="24" ${inked('#ffffff')}/>`,
      ].join('');
  // Their top: the shoulders, sitting up against the pillows.
  const s2 = R.halfShoulder;
  const sy = hy + 30;
  const torso = `<path d="M${r1(hx - s2)},${top + 6} L${r1(hx - s2)},${sy + 12} Q${r1(hx - s2)},${sy} ${r1(hx - s2 + 12)},${sy} L${r1(hx + s2 - 12)},${sy} Q${r1(hx + s2)},${sy} ${r1(hx + s2)},${sy + 12} L${r1(hx + s2)},${top + 6} Z" ${inked(shirt)}/>`;
  const cover = [
    `<path d="M${hx + 20},${top - 10} C${hx + 50},${top - 30} ${hx + 100},${top - 32} ${hx + 150},${top - 26} C${hx + 180},${top - 22} ${w - 20},${top - 18} ${w - 12},${top - 14} L${w - 12},${top + 18} Q${hx + 120},${top + 24} ${hx + 20},${top + 18} Z" ${inked(blanket)}/>`,
    `<path d="M${r1(hx - s2 - 6)},${top - 8} Q${hx},${top - 16} ${hx + 34},${top - 10} L${hx + 34},${top + 16} L${r1(hx - s2 - 6)},${top + 16} Z" ${inked(blanket)}/>`,
    line(
      `M${hx + 70},${top - 14} Q${hx + 120},${top - 6} ${w - 24},${top - 4}`,
      shade(blanket, 0.85),
      2.4,
    ),
  ].join('');
  // Hands on the blanket, in their sleeves.
  const arms = [
    [r1(hx - s2 + 7), sy + 12, hx - 4, top - 8],
    [r1(hx + s2 - 7), sy + 12, hx + 28, top - 10],
  ]
    .map(
      ([x1, y1, x2, y2]) =>
        line(`M${x1},${y1} L${x2},${y2}`, FIGURE_INK, 13 + LINE * 2) +
        line(`M${x1},${y1} L${x2},${y2}`, shirt, 13) +
        `<circle cx="${x2}" cy="${y2}" r="8" ${inked(skin)}/>`,
    )
    .join('');
  // Where signs go on someone in bed: their head on the pillows, their
  // hands on the blanket, the blanket over them.
  const signs = upright(
    signsOf(
      {
        head: [hx, hy],
        mouth: [hx, hy + (R.mouthY - R.cy)],
        chest: [hx, top - 8],
        belly: [hx + 70, top - 20],
        hands: [
          [hx - 4, top - 8],
          [hx + 28, top - 10],
        ],
        feet: [
          [w - 40, top - 16],
          [w - 22, top - 14],
        ],
        sides: [
          { x: hx - 60, out: -1 },
          { x: hx + 64, out: 1 },
        ],
      },
      R,
      skin,
    ),
  );
  const drawn = signsFor('in bed', asked);
  const [fx, fy, fw, fh] = [
    -w - 8,
    r1(hy - 40 - FIGURE_FRAME.headroom),
    2 * w + 16,
    r1(FIGURE_FRAME.below - (hy - 40 - FIGURE_FRAME.headroom)),
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[fx, fy, fw, fh].join(' ')}">`,
    `<style>${styleOf(r1(beatOf(key) * 4.6), [r1(0.3 + beatOf(key) * 2.4)], drawn, false, R.sY + 6, Boolean(clip))}${shutStyle(faces)}${clip ? dangleCss(layers.dangles) : ''}</style>`,
    eyeClip(R),
    `<ellipse cx="0" cy="0" rx="${w}" ry="8" fill="#1d1a22" fill-opacity="0.16"/>`,
    `<g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">`,
    `<g id="legs">${bed}</g>`,
    `<g class="whole"><g class="breathe">`,
    `<g id="behind">${moved(layers.behind)}</g>`,
    `<g id="body">${torso}${cover}</g>`,
    `<g id="head">${moved(layers.head + layers.eyes)}</g>`,
    `<g id="arms">${arms}</g>`,
    FACE_NAMES.map(
      (name) => `<g id="${name}">${moved(layers.faces[name])}</g>`,
    ).join(''),
    `<g id="pain">${moved(layers.more.pain)}</g>`,
    faces
      .map((name) => `<g id="${faceId(name)}">${moved(layers.asked[name])}</g>`)
      .join(''),
    `<g class="mouths">${moved(layers.mouths)}</g>`,
    drawn.map((name) => `<g id="${signId(name)}">${signs[name]}</g>`).join(''),
    `<g class="blink b0" opacity="0">${moved(layers.blink)}</g>`,
    `<g id="over">${moved(layers.over)}</g>`,
    `</g></g>`,
    `</g>`,
    `</svg>`,
  ].join('');
  return {
    svg,
    viewBox: [fx, fy, fw, fh],
    parts: { head: 'head', body: 'body', arms: 'arms', legs: 'legs' },
    states: statesOf(drawn, faces),
    anchors: {
      head: [hx, hy],
      body: [hx + 90, top - 12],
      legs: [hx + 150, top + 20],
    },
    // On rig 2, what swings, moved to the pillows with the head.
    ...(clip
      ? {
          rig: 2 as const,
          ...(layers.dangles.length
            ? {
                dangles: layers.dangles.map((one) => ({
                  ...one,
                  root: [
                    r1(one.root[0] + hx),
                    r1(one.root[1] + hy - R.cy),
                  ] as Point2,
                })),
              }
            : {}),
        }
      : {}),
  };
}

/** How someone is drawn on a page: how many, in what pose, holding what, and which signs they can show. */
export interface FigureHow {
  /** A few people like them, standing together: a team, a family, a class, up to four. */
  count?: number;
  pose?: FigurePose;
  /** A prop in their hand: the right, or the left when the pose uses the right. */
  holding?: FigureProp | null;
  /** The signs drawn, ready to be shown: only those the page shows, so a figure carries no more than it needs. */
  signs?: readonly FigureSign[];
  /** The faces drawn only when a page shows them (ASKED_FACES): eyes closed. */
  faces?: readonly string[];
  /** A story set before beds had metal frames: a bed is a low wooden pallet with a mat. */
  old?: boolean;
  /**
   * The clothes one person changes into later on (a Studio story's "puts
   * on his uniform"), each a state of its own ("dress-1"): drawn on the
   * same rig as the clothes they start in, and worn from when the state is
   * shown, in place of those before it. None for a group, or lying.
   */
  dress?: readonly { state: string; spec: FigureSpec }[];
  /**
   * The rig it is made with (studio-world-plan §4.6): 1, as ever, byte for
   * byte; 2, what swings (hair behind, a cloak or cape, a scarf's end, a
   * ribbon, a headscarf's end, wings) drawn as chains the player turns by
   * `--dg-<id>-<k>`, and its dangles and stride said.
   */
  rig?: RigVersion | typeof VIEW_RIG;
}

/** The class a figure's clothes are drawn in: 0 what they start in, then each they change into. */
export const dressClass = (k: number) => `dress-${k}`;

/**
 * The clothes of a figure that changes clothes, as its own CSS shows them:
 * each later outfit hidden until its state is on, and every outfit before
 * it hidden once it is.
 */
function dressStyle(states: readonly string[]): string {
  if (!states.length) return '';
  const later = states.map((_, i) => `.${dressClass(i + 1)}`).join(',');
  return [
    `${later}{display:none}`,
    ...states.map((state, i) => {
      const k = i + 1;
      const before = Array.from(
        { length: k },
        (_, j) => `.on-${state} .${dressClass(j)}`,
      ).join(',');
      return `.on-${state} .${dressClass(k)}{display:inline}${before}{display:none}`;
    }),
  ].join('');
}

/**
 * Whether a story's era is before beds with metal frames, hospital
 * rails, and the like: an ancient, biblical or medieval world, or any
 * before the eighteenth century.
 */
export function oldWorld(era: string | null | undefined): boolean {
  const text = (era ?? '').toLowerCase();
  if (!text) return false;
  if (
    /\b(?:ancient|antiquity|biblical|medieval|middle ages|prehistoric|stone age|bronze age|iron age|roman|greek|egyptian|bc|bce|b\.c\.?)\b/u.test(
      text,
    )
  )
    return true;
  const ORDINALS = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
  ];
  const century =
    /\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/u.exec(text)?.[1] ??
    (() => {
      const word = /\b([a-z]+)\s+century\b/u.exec(text)?.[1];
      const at = word ? ORDINALS.indexOf(word) : -1;
      return at >= 0 ? String(at + 1) : undefined;
    })();
  return century !== undefined && Number(century) < 18;
}

/**
 * A person drawn from their spec, or a few people like them standing
 * together (`count`, up to four): a team, a family, a class. `seed`
 * (their id) sets when each blinks and breathes, so no two blink
 * together, and a group's others are the same in every make. A group
 * takes the pose and the prop together; lying down and in bed are for
 * one person.
 */
export function drawFigure(
  spec: FigureSpec,
  seed = '',
  how: FigureHow = {},
): FigureDrawing {
  // On rig 3, one person standing is drawn from every side (a group, or
  // someone lying down or in bed, as on rig 2).
  if (how.rig === VIEW_RIG)
    return (
      drawnInViews(spec, seed, how) ??
      drawFigure(spec, seed, { ...how, rig: DANGLE_RIG })
    );
  const key = seed || JSON.stringify(spec);
  const pose = how.pose ?? 'standing';
  const faces = facesFor(how.faces);
  // On rig 2, its clip paths' ids its own, so no two drawings' meet.
  const clip =
    how.rig === 2
      ? `f${Math.floor(beatOf(`${key}:id`) * 1e6).toString(36)}`
      : undefined;
  if (pose === 'in bed')
    return drawInBed(spec, key, how.signs, how.old, faces, clip);
  const lying = pose === 'lying';
  const n = lying
    ? 1
    : Math.min(MOST_TOGETHER, Math.max(1, Math.round(how.count ?? 1) || 1));
  const holding = lying ? null : (how.holding ?? null);
  // Something in hand and no pose for it: held up.
  const posed = holding && pose === 'standing' ? 'holding' : pose;
  const drawn = signsFor(pose, how.signs);
  const members = Array.from({ length: n }, (_, i) =>
    layersOf(
      i === 0 ? spec : companionOf(spec, i, key),
      posed,
      holding,
      clip && `${clip}-${i}`,
    ),
  );
  // One person who changes clothes: each outfit's clothed layers drawn on
  // the same rig, the later ones shown as their states are.
  const changes = n === 1 && !lying ? (how.dress ?? []) : [];
  const outfits = [
    members[0],
    ...changes.map((one, k) =>
      layersOf(one.spec, posed, holding, clip && `${clip}-o${k + 1}`),
    ),
  ];
  const worn = (layer: (l: Layers) => string): string =>
    changes.length
      ? outfits
          .map((l, k) => `<g class="${dressClass(k)}">${layer(l)}</g>`)
          .join('')
      : all(layer);
  // The one described stands in the middle of their group.
  const order = members
    .map((layers, i) => ({ layers, i }))
    .sort((a, b) => Math.abs(a.i - (n - 1) / 2) - Math.abs(b.i - (n - 1) / 2));
  const x = (i: number) => r1((i - (n - 1) / 2) * APART);
  const placeAt = (i: number, markup: string, attrs = '') =>
    x(i) || attrs
      ? `<g${x(i) ? ` transform="translate(${x(i)} 0)"` : ''}${attrs}>${markup}</g>`
      : markup;
  const all = (layer: (l: Layers) => string) =>
    order.map(({ layers, i }) => placeAt(i, layer(layers))).join('');
  const { R } = members[0];
  const beat = beatOf(key);
  const breathAt = r1(beat * 4.6);
  // Each blinks on their own beat, never at the start or at the still's
  // moment (1.5s): the cycle's blink is at 5.06–5.2s.
  const blinkAt = (i: number) =>
    r1(0.3 + beatOf(i ? `${key}:${i}` : key) * 2.4);
  const frame = figureFrame(spec.age);
  const wider = (n - 1) * APART;
  // What reaches past the frame widens it on that side, or raises it: a
  // pointing hand, a flag, an umbrella over the head.
  const reaching = [...members, ...outfits.slice(1)];
  const left = Math.max(0, ...reaching.map((l) => l.beyond.left));
  const right = Math.max(0, ...reaching.map((l) => l.beyond.right));
  const up = Math.max(0, ...reaching.map((l) => l.beyond.up));
  // Lying on the floor, head to the left: the standing figure turned a
  // quarter over, its side on the ground.
  const lies = { x: r1(-R.top / 2), y: -60 };
  const viewBox: [number, number, number, number] = lying
    ? [r1(R.top / 2 - 44), -150, r1(-R.top + 60), 160]
    : [
        r1(frame[0] - wider / 2 - left),
        r1(frame[1] - up),
        r1(frame[2] + wider + left + right),
        r1(frame[3] + up),
      ];
  // On rig 2, what swings, each once: the one described's, then the
  // rest of their group's and their later outfits', where each stands.
  const dangles = uniqueDangles([
    ...order.flatMap(({ layers, i }) =>
      layers.dangles.map((one) => ({
        ...one,
        root: [r1(one.root[0] + x(i)), one.root[1]] as Point2,
      })),
    ),
    ...outfits.slice(1).flatMap((l) => l.dangles),
  ]);
  const style =
    styleOf(
      breathAt,
      members.map((_, i) => blinkAt(i)),
      drawn,
      posed === 'waving',
      R.sY + 6,
      Boolean(clip),
    ) +
    dressStyle(changes.map((one) => one.state)) +
    shutStyle(faces) +
    (clip ? dangleCss(dangles) : '');
  const person = [
    `<g id="legs">${worn((l) => l.legs)}</g>`,
    `<g class="breathe">`,
    `<g id="behind">${worn((l) => l.behind)}</g>`,
    `<g id="body">${worn((l) => l.body)}</g>`,
    `<g id="arms">${worn((l) => l.arms)}</g>`,
    `<g id="head">${changes.length ? worn((l) => l.head) + members[0].eyes : all((l) => l.head + l.eyes)}</g>`,
    FACE_NAMES.map(
      (name) => `<g id="${name}">${all((l) => l.faces[name])}</g>`,
    ).join(''),
    `<g id="pain">${all((l) => l.more.pain)}</g>`,
    faces
      .map((name) => `<g id="${faceId(name)}">${all((l) => l.asked[name])}</g>`)
      .join(''),
    `<g class="mouths">${all((l) => l.mouths)}</g>`,
    `<g id="reach">${worn((l) => l.reach)}</g>`,
    drawn
      .map((name) => `<g id="${signId(name)}">${all((l) => l.signs[name])}</g>`)
      .join(''),
    order
      .map(({ layers, i }) =>
        placeAt(i, layers.blink, ` class="blink b${i}" opacity="0"`),
      )
      .join(''),
    `<g id="over">${worn((l) => l.over)}</g>`,
    `</g>`,
  ].join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">`,
    `<style>${style}</style>`,
    eyeClip(R),
    lying
      ? `<ellipse cx="0" cy="0" rx="${lies.x}" ry="8" fill="#1d1a22" fill-opacity="0.16"/>`
      : members
          .map(
            (_, i) =>
              `<ellipse cx="${x(i)}" cy="0" rx="50" ry="7" fill="#1d1a22" fill-opacity="0.16"/>`,
          )
          .join(''),
    `<g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">`,
    lying
      ? `<g transform="translate(${lies.x} ${lies.y}) rotate(-90)"><g class="whole">${person}</g></g>`
      : `<g class="flip"><g class="whole">${person}</g></g>`,
    `</g>`,
    `</svg>`,
  ].join('');
  // Lying, the rig's points turn with it: (x, y) is at (y + x0, -x + y0).
  const at = ([px, py]: [number, number]): [number, number] =>
    lying ? [r1(py + lies.x), r1(-px + lies.y)] : [px, py];
  return {
    svg,
    viewBox,
    parts: { head: 'head', body: 'body', arms: 'arms', legs: 'legs' },
    states: {
      ...statesOf(drawn, faces),
      ...Object.fromEntries(changes.map((one) => [one.state, one.state])),
    },
    anchors: {
      head: at([0, R.cy]),
      body: at([0, r1((R.sY + R.hemY) / 2)]),
      legs: at([0, r1((R.hemY - FEET) / 2)]),
    },
    ...(n === 1 && !lying
      ? { joints: members[0].joints, legs: members[0].legJoints }
      : {}),
    // On rig 2: what swings, turned with them lying down; and standing,
    // their stride (§4.2): as far as their legs carry them swung 24
    // degrees either way about the hip, each foot planted where it lands
    // (the leg from the hip to the ankle, about which the foot is kept
    // flat).
    ...(clip
      ? {
          rig: 2 as const,
          ...(dangles.length
            ? {
                dangles: dangles.map((one) => ({
                  ...one,
                  root: at(one.root),
                  // Lying, turned with them: (x, y) goes to (y, -x).
                  ...(lying
                    ? { dir: [one.dir[1], -one.dir[0] || 0] as Point2 }
                    : {}),
                })),
              }
            : {}),
          ...(lying
            ? {}
            : {
                stride: {
                  length: r1(strideLength(R.legs + 4, PERSON_SWING)),
                  gait: 'walk' as const,
                },
              }),
        }
      : {}),
  };
}

// ── Extras ─────────────────────────────────────────────────────────────────

/**
 * How much of someone in a crowd is drawn, by how tall they stand on the
 * stage: 0, the kit's own face; 1, dark dots for eyes and no mouth; 2, a
 * shape with no face and no outline, as someone far off reads.
 */
export type ExtraDetail = 0 | 1 | 2;
/** Which way someone in a crowd faces: toward the viewer, or away. */
export type ExtraView = 'front' | 'back';

/** Someone in a crowd, drawn by the kit at the rig's origin: their feet at 0. */
export interface ExtraDrawing {
  /** Their legs and shoes, each leg its own group. */
  legs: string;
  /** Everything above the legs, which breathes: what hangs behind, the body, the arms, the head and the face. */
  upper: string;
  /** Their frame, as figureFrame has it, widened for what reaches past it. */
  viewBox: [number, number, number, number];
  /** The top of the head (hair and hats aside), the head's middle and the mouth, in the kit's units. */
  top: number;
  cy: number;
  mouthY: number;
  /** Each arm's shoulder, elbow and hand as drawn: its groups turn about the first two. */
  joints: Record<'r' | 'l', [Point2, Point2, Point2]>;
}

/**
 * The back of a head: hair over all of it but the nape, or what is worn
 * over it; hats as they are from the front.
 */
function backOfHead(spec: FigureSpec, R: Rig, skin: string): string {
  const { cy } = R;
  const cover =
    spec.headwear === 'nemes'
      ? GOLD
      : wrapped(spec) || spec.headwear === 'mantle'
        ? CLOTH[spec.accentColour]
        : null;
  const out = [
    `<ellipse cx="0" cy="${cy}" rx="${HEAD.rx}" ry="${HEAD.ry}" ${inked(cover ?? skin)}/>`,
  ];
  if (!cover && spec.hair !== 'bald' && spec.hair !== 'balding')
    out.push(
      `<path d="${chord(0, cy, HEAD.rx, HEAD.ry, 0.5)}" ${inked(HAIR[spec.hairColour])}/>`,
    );
  if (spec.headwear !== 'headscarf' && spec.headwear !== 'mantle')
    out.push(headwearOf(spec, R));
  return `<g class="hd">${out.join('')}</g>`;
}

/**
 * Someone in a crowd, drawn by the kit as everyone is, with less of them
 * the farther off they are (`detail`). Facing the viewer, their eyes and
 * face at rest (none of the other faces, no mouth shapes, no blink, no
 * signs); or turned away (`view`), the back of their head and no face.
 * `id` makes the eyes' clip their own, so many can share one drawing.
 */
export function drawExtra(
  spec: FigureSpec,
  how: {
    detail: ExtraDetail;
    view?: ExtraView;
    pose?: FigurePose;
    holding?: FigureProp | null;
    /** How far the face is turned to one side, -1 to 1, as the stage's --turn. */
    turn?: number;
    id: string;
  },
): ExtraDrawing {
  const back = how.view === 'back';
  // Turned away, they stand with their arms at their sides.
  const asked = how.pose ?? 'standing';
  const pose = back || LYING_POSES.includes(asked) ? 'standing' : asked;
  const holding = back ? null : (how.holding ?? null);
  const posed = holding && pose === 'standing' ? 'holding' : pose;
  const L = layersOf(spec, posed, holding);
  const { R } = L;
  const skin = SKIN[Math.min(SKIN_TONES, Math.max(1, spec.skin)) - 1];
  let upper: string;
  if (back)
    // From behind, what hangs at the back (long hair, a cloak) is over the body.
    upper = `${L.bodyBack}${L.arms}${backOfHead(spec, R, skin)}${L.behind}`;
  else {
    let face = '';
    if (how.detail === 0) {
      const clip = `${how.id}-eyes`;
      // The face at rest, without the second mouth it speaks with.
      const rest = faceOf('neutral', R, skin, clip).replace(
        /<g class="talk" opacity="0">.*?<\/g>/,
        '',
      );
      face = `${eyeClip(R, clip)}${L.eyes}${fm(rest)}`;
    } else if (how.detail === 1)
      // Dots for eyes; on dark skin, whites with a dot in each, which a
      // dark dot on it would not show.
      face = fm(
        [-1, 1]
          .map((side) =>
            lightness(skin) < DARK_SKIN
              ? `<ellipse cx="${side * R.eyes.dx}" cy="${R.eyes.y}" rx="7" ry="8" ${flat('#f5f1e8')}/><circle cx="${side * R.eyes.dx}" cy="${R.eyes.y + 1}" r="3.4" ${flat(FIGURE_INK)}/>`
              : `<ellipse cx="${side * R.eyes.dx}" cy="${R.eyes.y}" rx="6" ry="7" ${flat(FIGURE_INK)}/>`,
          )
          .join(''),
      );
    // Turned a little to one side: the face and what is over it, as the stage turns it.
    const turn = r1((how.turn ?? 0) * 7);
    const turned = (markup: string) =>
      turn && markup
        ? `<g transform="translate(${turn} 0)">${markup}</g>`
        : markup;
    upper = `${L.behind}${L.body}${L.arms}${L.head}${turned(face)}${L.reach}${how.detail === 2 ? '' : turned(L.over)}`;
  }
  let legs = L.legs;
  // Far off, a shape: no outline anywhere, not even the arms' own.
  if (how.detail === 2) {
    const bare = (markup: string) =>
      markup.replace(
        new RegExp(`stroke="${FIGURE_INK}"`, 'g'),
        'stroke="none"',
      );
    upper = bare(upper);
    legs = bare(legs);
  }
  const frame = figureFrame(spec.age);
  const left = Math.max(0, L.beyond.left);
  const right = Math.max(0, L.beyond.right);
  const up = Math.max(0, L.beyond.up);
  return {
    legs,
    upper,
    viewBox: [
      r1(frame[0] - left),
      r1(frame[1] - up),
      r1(frame[2] + left + right),
      r1(frame[3] + up),
    ],
    top: R.top,
    cy: R.cy,
    mouthY: R.mouthY,
    joints: L.joints,
  };
}

/** What people wear in a story's world, from the kit's own lists, and the colours they wear it in. */
interface Wardrobe {
  tops: readonly Top[];
  bottoms: readonly Bottom[];
  headwear: readonly Headwear[];
  colours: readonly ClothColour[];
  /** Skin tones, 1 to 10, as most are there. */
  skins: readonly number[];
  extras: readonly FigureExtra[];
}

const EARTHY: readonly ClothColour[] = [
  'brown',
  'white',
  'grey',
  'navy',
  'yellow',
  'red',
  'green',
  'brown',
  'white',
];
const BRIGHT: readonly ClothColour[] = CLOTH_COLOURS.filter(
  (c) => c !== 'black' && c !== 'grey',
);

/**
 * The wardrobe for a story's world: the ancient world in robes, tunics
 * and head cloths; West Africa in kaftans, agbadas, wrappers and geles;
 * anywhere else in everyday clothes.
 */
export function wardrobeOf(world: StoryWorld | null): Wardrobe {
  const text = world
    ? [world.era, world.region, world.culture, world.homes, world.landscape]
        .join(' ')
        .toLowerCase()
    : '';
  if (
    /\b(?:bc|ad|first century|1st century|ancient|biblical|bible|roman|galilee|judea|judaea|jerusalem|israel|nazareth|egypt|egyptian|pharaoh|babylon|medieval|middle ages)\b/.test(
      text,
    )
  )
    return {
      tops: ['robe', 'robe', 'tunic', 'tunic', 'robe', 'apron'],
      bottoms: ['trousers'],
      headwear: ['none', 'none', 'headscarf', 'turban', 'mantle', 'headscarf'],
      colours: EARTHY,
      skins: [4, 5, 5, 6, 6, 7],
      extras: ['sandals', 'sandals', 'cloak'],
    };
  if (
    /\b(?:nigeria|nigerian|yoruba|igbo|hausa|ghana|ghanaian|akan|west africa|west african|lagos|accra|ibadan|kano|abuja)\b/.test(
      text,
    )
  )
    return {
      tops: [
        't-shirt',
        't-shirt',
        'kaftan',
        'kaftan',
        'dress',
        'shirt and tie',
        'agbada',
        'apron',
        'jacket',
      ],
      bottoms: [
        'trousers',
        'trousers',
        'wrapper',
        'wrapper',
        'skirt',
        'shorts',
      ],
      headwear: ['none', 'none', 'none', 'gele', 'kufi', 'cap', 'headscarf'],
      colours: BRIGHT,
      skins: [6, 7, 8, 8, 9, 9, 10],
      extras: ['earrings', 'glasses'],
    };
  return {
    tops: [
      't-shirt',
      'jumper',
      'hoodie',
      'shirt and tie',
      'jacket',
      'coat',
      'dress',
      'cardigan',
    ],
    bottoms: ['trousers', 'trousers', 'shorts', 'skirt'],
    headwear: ['none', 'none', 'none', 'none', 'cap', 'beanie', 'sun hat'],
    colours: CLOTH_COLOURS,
    skins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    extras: ['glasses', 'scarf', 'backpack'],
  };
}

/** How light a colour looks, 0 (black) to 1 (white). */
function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  );
}

/** Skin this dark, in clothes or a hat this dark, and a head far off is a dark blob: what they wear is at least this light. */
const DARK_SKIN = 0.3;
const DARK_CLOTH = 0.35;
const READS_ON_DARK = 0.45;

/**
 * An extra's colours where their head reads: someone with dark skin in a
 * dark top or a dark hat (navy, black) wears one of the world's lighter
 * colours instead, as the seed picks it, so their head never runs into
 * what is under and on it. Their skin and hair are as they are; anyone
 * else is left as they are.
 */
export function readable(
  spec: FigureSpec,
  colours: readonly ClothColour[],
  seed: string,
): FigureSpec {
  const skin = SKIN[Math.min(SKIN_TONES, Math.max(1, spec.skin)) - 1];
  if (lightness(skin) >= DARK_SKIN) return spec;
  const light = colours.filter((c) => lightness(CLOTH[c]) >= READS_ON_DARK);
  const lighter = (colour: ClothColour, salt: string): ClothColour =>
    lightness(CLOTH[colour]) >= DARK_CLOTH || !light.length
      ? colour
      : light[
          Math.floor(beatOf(`${seed}:${salt}`) * light.length) % light.length
        ];
  return {
    ...spec,
    topColour: lighter(spec.topColour, 'top'),
    ...(spec.headwear !== 'none'
      ? { accentColour: lighter(spec.accentColour, 'hat') }
      : {}),
  };
}

/** Who in a crowd is how old: mostly grown-ups, a few children, teenagers and elders. */
const CROWD_AGES: [FigureAge, number][] = [
  ['child', 0.14],
  ['teen', 0.1],
  ['adult', 0.62],
  ['elder', 0.14],
];

/**
 * The `i`th person of a crowd in a story's world, dressed from the kit's
 * own lists for it: their age, build, skin, hair, clothes and colours
 * their own, and the same for the same seed every time.
 */
export function extraFor(
  world: StoryWorld | null,
  seed: string,
  i: number,
): FigureSpec {
  const key = `${seed}:${i}`;
  const pick = <T>(list: readonly T[], salt: string): T =>
    list[Math.floor(beatOf(`${key}:${salt}`) * list.length) % list.length];
  const w = wardrobeOf(world);
  let a = beatOf(`${key}:age`);
  let age: FigureAge = 'adult';
  for (const [one, share] of CROWD_AGES) {
    if (a < share) {
      age = one;
      break;
    }
    a -= share;
  }
  const grown = age === 'adult' || age === 'elder';
  // A child in a child's clothes: no agbada, no tie, no apron.
  const tops = grown
    ? w.tops
    : w.tops.filter((t) => !['agbada', 'shirt and tie', 'apron'].includes(t));
  const top = pick(tops.length ? tops : ['t-shirt' as const], 'top');
  const headwear = pick(
    grown ? w.headwear : w.headwear.filter((h) => h !== 'gele'),
    'headwear',
  );
  // One dressed as a woman is dressed so all through, and beardless.
  const woman =
    top === 'dress' ||
    headwear === 'gele' ||
    headwear === 'headscarf' ||
    headwear === 'mantle';
  const hairs: readonly HairStyle[] =
    age === 'elder'
      ? ['balding', 'short', 'bun', 'bald', 'curly']
      : woman
        ? ['bun', 'braids', 'long', 'bob', 'afro', 'ponytail', 'locs']
        : age === 'child'
          ? ['short', 'pigtails', 'curly', 'afro', 'spiky', 'bob']
          : ['short', 'curly', 'afro', 'locs', 'short', 'bald'];
  const covered = headwear !== 'none';
  return readable(
    {
      age,
      build: pick(FIGURE_BUILDS, 'build'),
      skin: pick(w.skins, 'skin'),
      // Under a hat, hair that would stand out from under it is left out.
      hair: pick(
        covered
          ? hairs.filter((h) => h !== 'afro' && h !== 'bun' && h !== 'bald')
          : hairs,
        'hair',
      ),
      hairColour:
        age === 'elder'
          ? pick(['grey', 'white'] as const, 'colour')
          : pick(
              w.skins[0] >= 6
                ? (['black', 'black', 'dark brown'] as const)
                : HAIR_COLOURS.slice(0, 6),
              'colour',
            ),
      facialHair:
        grown && !woman
          ? pick(
              ['none', 'none', 'none', 'moustache', 'beard'] as const,
              'beard',
            )
          : 'none',
      headwear,
      top,
      topColour: pick(w.colours, 'topColour'),
      bottom:
        top === 'dress' || top === 'robe' || top === 'agbada'
          ? 'trousers'
          : pick(
              woman ? w.bottoms : w.bottoms.filter((b) => b !== 'skirt'),
              'bottom',
            ),
      bottomColour: pick(
        ['navy', 'brown', 'grey', 'black', 'teal', 'blue', 'purple'] as const,
        'bottomColour',
      ),
      accentColour: pick(w.colours, 'accent'),
      extras: beatOf(`${key}:extra`) < 0.2 ? [pick(w.extras, 'extras')] : [],
    },
    w.colours,
    key,
  );
}

/** How each action moves the whole body while it is on (a shake, a shiver, a jump), for others the kit draws: an animal. */
export { ACTS as SIGN_ACTS };
