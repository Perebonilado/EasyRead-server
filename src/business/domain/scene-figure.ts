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
import type { Expression } from './scene-story';

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
] as const;
export type Top = (typeof TOPS)[number];

export const BOTTOMS = ['trousers', 'shorts', 'skirt'] as const;
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
] as const;
export type FigureExtra = (typeof FIGURE_EXTRAS)[number];

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

export const FIGURE_INK = '#2d2a32';
const LINE = 2.6;
const MOUTH = '#6b2a2e';
const SHOE = '#3b3440';
const GOLD = '#f2c14e';

const SKIN = [
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
const HAIR: Record<HairColour, string> = {
  black: '#2b2324',
  'dark brown': '#4a3226',
  brown: '#7a4f33',
  auburn: '#9c4a2a',
  red: '#c65a31',
  blonde: '#e2b75d',
  grey: '#a9a6ab',
  white: '#eeece8',
};
const CLOTH: Record<ClothColour, string> = {
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
const HEAD = { rx: 46, ry: 40 };
/** How far the shoes lift the legs off the ground. */
const FEET = 8;
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
type Rig = ReturnType<typeof rigOf>;

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

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number) => `${r1(x)},${r1(y)}`;
/** A shape's fill: its outline is the figure's own, set once on the group round it all. */
const inked = (fill: string, width = LINE) =>
  width === LINE ? `fill="${fill}"` : `fill="${fill}" stroke-width="${width}"`;
/** A shape with no outline: a pupil, a button, a freckle. */
const flat = (fill: string) => `fill="${fill}" stroke="none"`;
const line = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A colour darker (k < 1) or lighter (k > 1), for a band, a pocket, a brim. */
function shade(hex: string, k = 0.82): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) =>
    Math.max(
      0,
      Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))),
    );
  return `#${[n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => channel(v).toString(16).padStart(2, '0'))
    .join('')}`;
}

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
function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

// ── Faces ──────────────────────────────────────────────────────────────────

interface Face {
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
const FACES: Record<Expression, Face> = {
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

const FACE_NAMES = Object.keys(FACES) as Expression[];

function mouthShape(name: string, my: number): string {
  switch (name) {
    case 'flat':
      return line(`M-9,${my} Q0,${my + 2.5} 9,${my}`, FIGURE_INK, 3);
    case 'smile':
      return `<path d="M-14,${my - 3} Q0,${my + 1} 14,${my - 3} Q12,${my + 11} 0,${my + 12} Q-12,${my + 11} -14,${my - 3} Z" ${inked(MOUTH)}/>`;
    case 'grin':
      return line(`M-13,${my - 2} Q0,${my + 9} 13,${my - 2}`, FIGURE_INK, 3);
    case 'frown':
      return line(`M-11,${my + 5} Q0,${my - 5} 11,${my + 5}`, FIGURE_INK, 3);
    case 'glum':
      return `<path d="M-8,${my + 5} Q0,${my - 4} 8,${my + 5} Q0,${my + 3} -8,${my + 5} Z" ${inked(MOUTH)}/>`;
    case 'grit':
      return `<rect x="-12" y="${my - 4}" width="24" height="10" rx="3" ${inked('#ffffff')}/>${line(`M-12,${my + 1} L12,${my + 1}`, FIGURE_INK, 1.8)}`;
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
      return line(`M1,${my + 2} Q8,${my + 1} 14,${my - 3}`, FIGURE_INK, 3);
    case 'aside':
      return `<ellipse cx="8" cy="${my}" rx="5.5" ry="4" ${inked(MOUTH)}/>`;
    default:
      // 'small'
      return `<ellipse cx="0" cy="${my + 1}" rx="6.5" ry="4.5" ${inked(MOUTH)}/>`;
  }
}

/** One face over the eyes' whites: the pupils, their lids and brows, and the mouth, at rest and talking. */
function faceOf(name: Expression, R: Rig, skin: string): string {
  const f = FACES[name];
  const { y, dx, rx, ry } = R.eyes;
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const ex = side * dx;
    out.push(
      `<circle cx="${r1(ex + f.look[0])}" cy="${r1(y + f.look[1])}" r="${f.pupil}" ${flat(FIGURE_INK)}/>`,
    );
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
    const brows = side === 1 && f.browRight ? f.browRight : f.brows;
    if (brows) {
      // The outer end, then the inner: the left eye's outer end is on the left.
      const by = y - ry - 5;
      out.push(
        line(
          `M${pt(ex + side * 11, by + brows[0])} L${pt(ex - side * 8, by + brows[1])}`,
          FIGURE_INK,
          3.4,
        ),
      );
    }
  }
  out.push(
    `<g class="mouth">${mouthShape(f.mouth, R.mouthY)}</g>`,
    `<g class="talk" opacity="0">${mouthShape(f.talk, R.mouthY)}</g>`,
  );
  return out.join('');
}

/** Closed eyes, shown for a moment every few seconds. */
function blinkOf(R: Rig, skin: string): string {
  const { y, dx, rx, ry } = R.eyes;
  return [-1, 1]
    .map((side) => {
      const ex = side * dx;
      return (
        `<ellipse cx="${ex}" cy="${y}" rx="${rx + 0.8}" ry="${ry + 0.8}" ${inked(skin)}/>` +
        line(
          `M${pt(ex - 11, y + 1)} Q${pt(ex, y + 7)} ${pt(ex + 11, y + 1)}`,
          FIGURE_INK,
          3,
        )
      );
    })
    .join('');
}

// ── Hair and headwear ──────────────────────────────────────────────────────

/** Whether a hat hides every hair. */
const wrapped = (spec: FigureSpec) =>
  spec.headwear === 'headscarf' || spec.headwear === 'turban';

/** Hair behind the head: what shows past it, over the shoulders or above. */
function hairBehind(spec: FigureSpec, R: Rig): string {
  if (wrapped(spec)) return '';
  const c = HAIR[spec.hairColour];
  const { cy } = R;
  const accent = CLOTH[spec.accentColour];
  switch (spec.hair) {
    case 'afro':
      return `<ellipse cx="0" cy="${cy - 10}" rx="64" ry="56" ${inked(c)}/>`;
    case 'long':
      return `<path d="M-52,${cy - 18} L-52,${cy + 44} Q-52,${cy + 60} -36,${cy + 60} L36,${cy + 60} Q52,${cy + 60} 52,${cy + 44} L52,${cy - 18} Z" ${inked(c)}/>`;
    case 'bob':
      return `<path d="M-52,${cy - 18} L-52,${cy + 22} Q-52,${cy + 32} -42,${cy + 32} L42,${cy + 32} Q52,${cy + 32} 52,${cy + 22} L52,${cy - 18} Z" ${inked(c)}/>`;
    case 'pigtails':
      return (
        [-1, 1]
          .map(
            (s) =>
              `<ellipse cx="${s * 53}" cy="${cy + 6}" rx="13" ry="21" transform="rotate(${s * -18} ${s * 53} ${cy + 6})" ${inked(c)}/>`,
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
      return `<ellipse cx="50" cy="${cy + 8}" rx="13" ry="26" transform="rotate(-18 50 ${cy + 8})" ${inked(c)}/><circle cx="44" cy="${cy - 12}" r="5" ${inked(accent)}/>`;
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
      const beads: string[] = [];
      for (const s of [-1, 1])
        for (let k = 0; k < 5; k += 1)
          beads.push(
            `<ellipse cx="${s * (48 - k)}" cy="${cy + 6 + k * 12}" rx="8" ry="7.5" ${inked(c)}/>`,
          );
      return (
        beads.join('') +
        [-1, 1]
          .map(
            (s) =>
              `<circle cx="${s * 44}" cy="${cy + 64}" r="4" ${inked(accent)}/>`,
          )
          .join('')
      );
    }
    case 'locs': {
      const strands: string[] = [];
      for (const x of [-50, -40, 40, 50])
        strands.push(
          `<rect x="${x - 5}" y="${cy - 20}" width="10" height="${x < 0 ? 70 : 66}" rx="5" ${inked(c)}/>`,
        );
      return strands.join('');
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

/**
 * The hair over the head: over the top, down the temples to the ears, and
 * a fringe that stops above the brows.
 */
function hairOver(spec: FigureSpec, R: Rig): string {
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
function headwearOf(spec: FigureSpec, R: Rig): string {
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
    default:
      return '';
  }
}

// ── Clothes ────────────────────────────────────────────────────────────────

interface Dressed {
  /** The body's fill. */
  fill: string;
  /** How far down the garment reaches, from the hem's line; and how much wider it flares. */
  longer: number;
  flare: number;
  sleeves: 'short' | 'long' | 'wide';
  sleeve: string;
  /** Drawn on the body, after it. */
  details: string;
  /** Behind the head, over the body: a hood's rim. */
  collar: string;
}

function dressOf(spec: FigureSpec, R: Rig): Dressed {
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
    default:
      return plain;
  }
}

/** A backpack's pack, showing past the shoulders behind the body. */
function packOf(spec: FigureSpec, R: Rig): string {
  if (!spec.extras.includes('backpack')) return '';
  const c = shade(CLOTH[spec.accentColour], 0.85);
  return `<rect x="${r1(-R.halfShoulder - 7)}" y="${R.sY + 2}" width="${r1(R.halfShoulder * 2 + 14)}" height="${r1((R.hemY - R.sY) * 0.72)}" rx="10" ${inked(c)}/>`;
}

/** What someone carries or wears besides: drawn on the body, below the chin. */
function extrasOnBody(spec: FigureSpec, R: Rig): string {
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
        `<path d="M12,${sY + 20} L24,${sY + 20} L22,${sY + 48} L10,${sY + 48} Z" ${inked(accent)}/>`,
    );
  if (spec.extras.includes('bow tie'))
    out.push(
      `<path d="M0,${sY + 15} L-13,${sY + 9} L-13,${sY + 21} Z" ${inked(accent)}/>` +
        `<path d="M0,${sY + 15} L13,${sY + 9} L13,${sY + 21} Z" ${inked(accent)}/>` +
        `<circle cx="0" cy="${sY + 15}" r="3" ${inked(shade(accent), 2)}/>`,
    );
  return out.join('');
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
}

/** How the mouth moves while talking: open and shut, unevenly, as speech does. */
const TALK = [
  [0, 10],
  [18, 30],
  [40, 46],
  [55, 70],
  [78, 86],
];
function keyframes(name: string, shown: boolean): string {
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
interface Layers {
  R: Rig;
  legs: string;
  behind: string;
  body: string;
  arms: string;
  head: string;
  faces: Record<Expression, string>;
  blink: string;
  over: string;
}

function layersOf(spec: FigureSpec): Layers {
  const R = rigOf(spec.age, spec.build);
  const skin = SKIN[Math.min(SKIN_TONES, Math.max(1, spec.skin)) - 1];
  const hairColour = HAIR[spec.hairColour];
  const dressed = dressOf(spec, R);
  const { hemY, sY, cy, halfShoulder: s2 } = R;
  const h2 = R.halfHem;

  const bottom = hemY + dressed.longer;
  // The body's half-width at a height, along its slope, flared below the hem.
  const slope = (h2 - s2) / (hemY - (sY + 12));
  const halfAt = (y: number) =>
    s2 +
    slope * (y - (sY + 12)) +
    (y > hemY ? (dressed.flare * (y - hemY)) / Math.max(1, dressed.longer) : 0);

  // Legs, shoes, and what is worn on the legs.
  const legs: string[] = [];
  const bare =
    spec.top === 'dress' || spec.top === 'robe' || spec.bottom === 'skirt';
  const trousers = CLOTH[spec.bottomColour];
  const legTop = hemY - 4;
  for (const s of [-1, 1]) {
    const x = s * 15 - 8;
    legs.push(
      `<rect x="${x}" y="${legTop}" width="16" height="${r1(-FEET - legTop)}" ${inked(bare || spec.bottom === 'shorts' ? skin : trousers)}/>`,
    );
    if (!bare && spec.bottom === 'shorts') {
      const cut = hemY + Math.max(8, (-FEET - hemY) * 0.45);
      legs.push(
        `<rect x="${x - 1}" y="${legTop}" width="18" height="${r1(cut - legTop)}" ${inked(trousers)}/>`,
      );
    }
    legs.push(
      `<ellipse cx="${s * 17}" cy="-6" rx="15" ry="7" ${inked(SHOE)}/>`,
    );
  }
  if (spec.bottom === 'skirt' && spec.top !== 'dress' && spec.top !== 'robe') {
    const down = hemY + Math.max(12, R.legs * 0.5);
    legs.push(
      `<path d="M${r1(-h2 + 2)},${hemY - 6} L${r1(h2 - 2)},${hemY - 6} L${r1(h2 + 6)},${r1(down)} L${r1(-h2 - 6)},${r1(down)} Z" ${inked(trousers)}/>`,
    );
  }

  // The body: a trapezoid rounded at the shoulders, as long as what is worn.
  const hb = halfAt(bottom);
  const body = [
    `<path d="M${r1(-hb)},${r1(bottom)} L${r1(-s2)},${sY + 12} Q${r1(-s2)},${sY} ${r1(-s2 + 12)},${sY} L${r1(s2 - 12)},${sY} Q${r1(s2)},${sY} ${r1(s2)},${sY + 12} L${r1(hb)},${r1(bottom)} Z" ${inked(dressed.fill)}/>`,
    dressed.details,
    extrasOnBody(spec, R),
    dressed.collar,
  ].join('');

  // Arms over the body: a sleeve, then a mitten hand.
  const arms: string[] = [];
  const width = spec.build === 'slim' ? 14 : spec.build === 'broad' ? 16 : 15;
  for (const s of [-1, 1]) {
    const S: [number, number] = [s * (s2 - 7), sY + 12];
    const H: [number, number] = [s * (h2 + 3), hemY - 8];
    const along = (k: number): [number, number] => [
      S[0] + (H[0] - S[0]) * k,
      S[1] + (H[1] - S[1]) * k,
    ];
    const arm = (to: [number, number], colour: string, w: number) =>
      line(`M${pt(...S)} L${pt(...to)}`, colour, w);
    if (s === 1 && spec.extras.includes('walking stick'))
      arms.push(
        line(`M${pt(H[0] + 2, H[1] - 6)} L${pt(H[0] + 7, -3)}`, FIGURE_INK, 7),
        line(`M${pt(H[0] + 2, H[1] - 6)} L${pt(H[0] + 7, -3)}`, '#8a5a3b', 4),
      );
    const w = dressed.sleeves === 'wide' ? width + 5 : width;
    arms.push(arm(H, FIGURE_INK, w + LINE * 2));
    arms.push(arm(H, dressed.sleeves === 'short' ? skin : dressed.sleeve, w));
    if (dressed.sleeves === 'short')
      arms.push(arm(along(0.42), dressed.sleeve, w));
    if (spec.top === 'jumper')
      arms.push(
        line(
          `M${pt(...along(0.8))} L${pt(...along(0.9))}`,
          shade(dressed.sleeve),
          w,
        ),
      );
    arms.push(
      `<circle cx="${r1(H[0])}" cy="${r1(H[1])}" r="8.5" ${inked(skin)}/>`,
    );
  }

  // The head: the face's ground, then hair and hats. A headscarf wraps it
  // and falls over the shoulders, leaving the face.
  const head: string[] = [];
  if (spec.headwear === 'headscarf') {
    const c = CLOTH[spec.accentColour];
    head.push(
      `<path d="M-54,${cy} Q-54,${cy - 52} 0,${cy - 52} Q54,${cy - 52} 54,${cy} Q56,${sY + 22} 40,${sY + 30} L-40,${sY + 30} Q-56,${sY + 22} -54,${cy} Z" ${inked(c)}/>`,
      `<ellipse cx="0" cy="${cy + 5}" rx="41" ry="36" ${inked(skin)}/>`,
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
  // The eyes' whites, the same under every face.
  for (const side of [-1, 1])
    head.push(
      `<ellipse cx="${side * R.eyes.dx}" cy="${R.eyes.y}" rx="${R.eyes.rx}" ry="${R.eyes.ry}" ${inked('#ffffff')}/>`,
    );

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
  return {
    R,
    legs: legs.join(''),
    behind: packOf(spec, R) + hairBehind(spec, R),
    body,
    arms: arms.join(''),
    head: head.join(''),
    faces: Object.fromEntries(
      FACE_NAMES.map((name) => [name, faceOf(name, R, skin)]),
    ) as Record<Expression, string>,
    blink: blinkOf(R, skin),
    over: over.join(''),
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
function companionOf(spec: FigureSpec, i: number, seed: string): FigureSpec {
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

/** How someone is drawn on a page: standing, or lying in bed (a patient). */
export const FIGURE_POSES = ['standing', 'in bed'] as const;
export type FigurePose = (typeof FIGURE_POSES)[number];

/** A figure's own motion: a breath, a blink for each of them on their own beat, a mouth that moves while talking. */
function styleOf(breathAt: number, blinks: number[]): string {
  return [
    `.breathe{animation:breathe 4.6s ease-in-out infinite;animation-delay:-${breathAt}s}`,
    '@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}',
    '.blink{animation:blink 5.3s linear infinite}',
    ...blinks.map((at, i) => `.b${i}{animation-delay:-${at}s}`),
    '@keyframes blink{0%,95.4%{opacity:0}95.5%,98%{opacity:1}98.1%,100%{opacity:0}}',
    '.talking .mouth{animation:shut 1.2s linear infinite}',
    '.talking .talk{animation:talk 1.2s linear infinite}',
    keyframes('talk', true),
    keyframes('shut', false),
  ].join('');
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
function drawInBed(spec: FigureSpec, key: string): FigureDrawing {
  const layers = layersOf(spec);
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
  const bed = [
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
  const [fx, fy, fw, fh] = [
    -w - 8,
    r1(hy - 40 - FIGURE_FRAME.headroom),
    2 * w + 16,
    r1(FIGURE_FRAME.below - (hy - 40 - FIGURE_FRAME.headroom)),
  ];
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[fx, fy, fw, fh].join(' ')}">`,
    `<style>${styleOf(r1(beatOf(key) * 4.6), [r1(0.3 + beatOf(key) * 2.4)])}</style>`,
    `<ellipse cx="0" cy="0" rx="${w}" ry="8" fill="#1d1a22" fill-opacity="0.16"/>`,
    `<g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">`,
    `<g id="legs">${bed}</g>`,
    `<g class="breathe">`,
    `<g id="behind">${moved(layers.behind)}</g>`,
    `<g id="body">${torso}${cover}</g>`,
    `<g id="head">${moved(layers.head)}</g>`,
    `<g id="arms">${arms}</g>`,
    FACE_NAMES.map(
      (name) => `<g id="${name}">${moved(layers.faces[name])}</g>`,
    ).join(''),
    `<g class="blink b0" opacity="0">${moved(layers.blink)}</g>`,
    `<g id="over">${moved(layers.over)}</g>`,
    `</g>`,
    `</g>`,
    `</svg>`,
  ].join('');
  return {
    svg,
    viewBox: [fx, fy, fw, fh],
    parts: { head: 'head', body: 'body', arms: 'arms', legs: 'legs' },
    states: Object.fromEntries(FACE_NAMES.map((name) => [name, name])),
    anchors: {
      head: [hx, hy],
      body: [hx + 90, top - 12],
      legs: [hx + 150, top + 20],
    },
  };
}

/**
 * A person drawn from their spec, or a few people like them standing
 * together (`count`, up to four): a team, a family, a class. `seed`
 * (their id) sets when each blinks and breathes, so no two blink
 * together, and a group's others are the same in every make.
 */
export function drawFigure(
  spec: FigureSpec,
  seed = '',
  count = 1,
  pose: FigurePose = 'standing',
): FigureDrawing {
  const key = seed || JSON.stringify(spec);
  if (pose === 'in bed') return drawInBed(spec, key);
  const n = Math.min(MOST_TOGETHER, Math.max(1, Math.round(count) || 1));
  const members = Array.from({ length: n }, (_, i) =>
    layersOf(i === 0 ? spec : companionOf(spec, i, key)),
  );
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
  const viewBox: [number, number, number, number] = [
    r1(frame[0] - wider / 2),
    frame[1],
    r1(frame[2] + wider),
    frame[3],
  ];
  const style = styleOf(
    breathAt,
    members.map((_, i) => blinkAt(i)),
  );
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">`,
    `<style>${style}</style>`,
    members
      .map(
        (_, i) =>
          `<ellipse cx="${x(i)}" cy="0" rx="50" ry="7" fill="#1d1a22" fill-opacity="0.16"/>`,
      )
      .join(''),
    `<g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">`,
    `<g id="legs">${all((l) => l.legs)}</g>`,
    `<g class="breathe">`,
    `<g id="behind">${all((l) => l.behind)}</g>`,
    `<g id="body">${all((l) => l.body)}</g>`,
    `<g id="arms">${all((l) => l.arms)}</g>`,
    `<g id="head">${all((l) => l.head)}</g>`,
    FACE_NAMES.map(
      (name) => `<g id="${name}">${all((l) => l.faces[name])}</g>`,
    ).join(''),
    order
      .map(({ layers, i }) =>
        placeAt(i, layers.blink, ` class="blink b${i}" opacity="0"`),
      )
      .join(''),
    `<g id="over">${all((l) => l.over)}</g>`,
    `</g>`,
    `</g>`,
    `</svg>`,
  ].join('');
  return {
    svg,
    viewBox,
    parts: { head: 'head', body: 'body', arms: 'arms', legs: 'legs' },
    states: Object.fromEntries(FACE_NAMES.map((name) => [name, name])),
    anchors: {
      head: [0, R.cy],
      body: [0, r1((R.sY + R.hemY) / 2)],
      legs: [0, r1((R.hemY - FEET) / 2)],
    },
  };
}
