/**
 * Built figures: the drawings no icon set has.
 *
 * An icon set is drawn for interfaces, so it is strong on phones and
 * buildings and empty on anything alive, anything microscopic, and most
 * of what a science, geography or history page names. A figure covers
 * those by recipe instead of by picture: the page says what the thing
 * is, this file says what shape it takes and what sits on it, and the
 * app draws it. The model gives no geometry and no numbers.
 */
import { resolvePicture } from './visual-presets';

/** The shape a figure takes. Eight of these cover what a whole icon set cannot. */
export const FIGURE_OUTLINES = [
  /** A soft closed shape that breathes: a cell, an island, a drop of ink. */
  'blob',
  /** A smooth spindle that swims: a microbe, a seed, an egg. */
  'body',
  /** A trunk that divides again and again: a river system, a nerve, a pipe network. */
  'branch',
  /** Bands stacked one on another: rock strata, the atmosphere, a wall section. */
  'layers',
  /** Nodes joined in a mesh: a crystal, a molecule, a street grid. */
  'lattice',
  /** A container holding something to a level: a tank, a battery, a silo. */
  'vessel',
  /** Ground seen from the side: a coastline, a valley, a trench. */
  'terrain',
  /** Lines of flow across a space: wind, a current, a magnetic field. */
  'field',
] as const;
export type FigureOutline = (typeof FIGURE_OUTLINES)[number];

/** What sits on or inside an outline. */
export const FIGURE_PARTS = [
  /** A second line just inside the edge: a wall, a skin, a shell. */
  'membrane',
  /** Short strokes all round the edge, beating in a wave. */
  'hairs',
  /** One long tail that whips behind. */
  'whip',
  /** One body inside, off centre: a nucleus, a yolk, a stone. */
  'core',
  /** Small rings inside that swell and empty. */
  'pockets',
  /** Many small dots inside: granules, bubbles, particles, leaves. */
  'grains',
  /** A groove or opening on the edge. */
  'mouth',
  /** Roots or branches running the other way. */
  'roots',
  /** Dots where parts meet. */
  'joints',
  /** A surface line with what is held below it. */
  'level',
  /** Short breaks across the shape. */
  'cracks',
  /** An arm that pushes out and draws back. */
  'bulge',
] as const;
export type FigurePart = (typeof FIGURE_PARTS)[number];

/** How a figure moves. Every manner is a function of the clock, so a seek lands true. */
export const FIGURE_MANNERS = [
  'still',
  'drift',
  'swim',
  'beat',
  'stream',
  'grow',
  'pulse',
] as const;
export type FigureManner = (typeof FIGURE_MANNERS)[number];

export interface VisualFigure {
  /** What the thing is, in the page's own words. Drawn under it and read aloud by a screen reader. */
  of: string;
  outline: FigureOutline;
  parts: FigurePart[];
  manner: FigureManner;
  /** Set by the app, so one page draws the same figure the same way every time. */
  seed: number;
}

/** Width over height of a figure's box. */
const FIGURE_ASPECT: Record<FigureOutline, number> = {
  blob: 1.05,
  body: 1.55,
  branch: 1,
  layers: 1.5,
  lattice: 1.2,
  vessel: 0.85,
  terrain: 1.7,
  field: 1.5,
};

export function figureAspect(outline: FigureOutline): number {
  return FIGURE_ASPECT[outline] ?? 1;
}

/**
 * How wide a figure is drawn when it is the card's whole subject. A wide
 * outline takes more of the stage, so a coastline is not a thumbnail.
 */
export function figureWidth(outline: FigureOutline): number {
  return FIGURE_ASPECT[outline] >= 1.4 ? 216 : 150;
}

/** The parts each outline knows how to draw; the rest are dropped. */
const OUTLINE_PARTS: Record<FigureOutline, FigurePart[]> = {
  blob: [
    'membrane',
    'hairs',
    'whip',
    'core',
    'pockets',
    'grains',
    'mouth',
    'bulge',
  ],
  body: ['membrane', 'hairs', 'whip', 'core', 'pockets', 'grains', 'mouth'],
  branch: ['roots', 'joints', 'grains', 'core'],
  layers: ['cracks', 'grains', 'core'],
  lattice: ['joints', 'core', 'grains'],
  vessel: ['level', 'grains', 'mouth', 'core'],
  terrain: ['cracks', 'grains', 'level'],
  field: ['grains', 'core'],
};

/**
 * Words that say what shape a thing takes, with the parts that come with
 * it. These are the families an icon set has no drawings for, so the app
 * reaches for them before it settles for a loose match.
 */
const GUESSES: {
  words: RegExp;
  outline: FigureOutline;
  parts: FigurePart[];
  manner: FigureManner;
}[] = [
  {
    words:
      /\b(cell|cells|cellular|amoeba|amoebae|protozoa|protozoan|protist|bacteri\w*|microbe|microorganism|micro-organism|germ|germs|pathogen|plankton|alga|algae|spore|yeast|organelle|cytoplasm|nucleus|blob|embryo|ovum|egg cell)\b/,
    outline: 'blob',
    parts: ['membrane', 'core', 'pockets', 'grains'],
    manner: 'drift',
  },
  {
    words:
      /\b(paramecium|euglena|ciliate|flagellate|sperm|tadpole|larva|bacillus|rod cell|swimmer)\b/,
    outline: 'body',
    parts: ['membrane', 'core', 'hairs'],
    manner: 'swim',
  },
  {
    words:
      /\b(river|rivers|tributar\w*|delta|basin|watershed|nerve|neuron|dendrite|axon|bronch\w*|airway|capillar\w*|vein network|root system|hierarchy|lineage|family tree|pipe network|branching)\b/,
    outline: 'branch',
    parts: ['joints', 'grains'],
    manner: 'grow',
  },
  {
    words:
      /\b(strata|stratum|sediment\w*|bedrock|crust|mantle|atmosphere|ozone|soil profile|horizon|layers of|skin layers|epidermis|tectonic)\b/,
    outline: 'layers',
    parts: ['cracks', 'grains'],
    manner: 'still',
  },
  {
    words:
      /\b(crystal|crystall\w*|lattice|molecul\w*|polymer|compound|alloy|mesh|grid|framework|scaffold|matrix|honeycomb)\b/,
    outline: 'lattice',
    parts: ['joints'],
    manner: 'pulse',
  },
  {
    words:
      /\b(tank|reservoir|beaker|flask|cylinder|silo|cistern|aquifer|battery|barrel|vat|vessel|container|storage)\b/,
    outline: 'vessel',
    parts: ['level', 'grains'],
    manner: 'stream',
  },
  {
    words:
      /\b(coast\w*|shoreline|valley|mountain\w*|hill\w*|terrain|landscape|glacier|dune|cliff|plateau|trench|erosion|landform|topograph\w*|catchment)\b/,
    outline: 'terrain',
    parts: ['cracks'],
    manner: 'still',
  },
  {
    words:
      /\b(magnetic field|electric field|gravitational field|current|currents|wind|winds|airflow|convection|radiation|sound wave|waves|tide|flux|circulation)\b/,
    outline: 'field',
    parts: ['grains'],
    manner: 'stream',
  },
];

/** The shape a thing takes, when its words say one plainly. */
export function guessFigure(of: string | undefined): VisualFigure | null {
  if (!of) return null;
  const words = of.toLowerCase();
  for (const guess of GUESSES) {
    if (!guess.words.test(words)) continue;
    return {
      of,
      outline: guess.outline,
      parts: guess.parts,
      manner: guess.manner,
      seed: seedOf(of),
    };
  }
  return null;
}

/** One number from the words, so the same thing is drawn the same way twice. */
export function seedOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1)
    hash = (hash * 31 + text.charCodeAt(i)) % 100_000;
  return hash;
}

/** What the model asked for, as something the app can draw. */
export type Drawing =
  { kind: 'picture'; name: string } | { kind: 'figure'; figure: VisualFigure };

/**
 * The drawing for a thing: the preset or icon of that name, else the
 * shape its words say it takes, else the model's own figure, else
 * nothing. Nothing is an answer: the thing is set as words instead, and
 * a wrong picture is never drawn in its place.
 */
export function resolveDrawing(
  of: string | undefined,
  asked?: Partial<VisualFigure> | null,
): Drawing | null {
  if (!of) return null;
  // A figure the model asked for by name outranks everything: it knows
  // the page, and the vocabulary is small enough to be meant.
  if (asked?.outline && FIGURE_OUTLINES.includes(asked.outline))
    return { kind: 'figure', figure: tidyFigure({ ...asked, of }) };
  const guessed = guessFigure(of);
  const named = resolvePicture(of);
  // An exact drawing beats a guessed shape; a loose one does not.
  if (named && (!guessed || isExact(of, named)))
    return { kind: 'picture', name: named };
  if (guessed) return { kind: 'figure', figure: guessed };
  if (named) return { kind: 'picture', name: named };
  return null;
}

/** Whether the drawing carries the thing's own word in its name. */
function isExact(of: string, name: string): boolean {
  const words = of
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const parts = name.split('-');
  return words.some((word) => parts.includes(word));
}

/** A figure with only the parts its outline draws, and a seed. */
export function tidyFigure(
  figure: Partial<VisualFigure> & { of: string },
): VisualFigure {
  const outline: FigureOutline = FIGURE_OUTLINES.includes(
    figure.outline as FigureOutline,
  )
    ? (figure.outline as FigureOutline)
    : 'blob';
  const known = OUTLINE_PARTS[outline];
  const parts = Array.from(
    new Set((figure.parts ?? []).filter((part) => known.includes(part))),
  ).slice(0, 5);
  const manner: FigureManner = FIGURE_MANNERS.includes(
    figure.manner as FigureManner,
  )
    ? (figure.manner as FigureManner)
    : 'drift';
  return {
    of: figure.of,
    outline,
    parts: parts.length ? parts : known.slice(0, 2),
    manner,
    seed: figure.seed ?? seedOf(figure.of),
  };
}
