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
import {
  fieldClaims,
  fieldOf,
  fieldPartOwner,
  pickPicture,
} from './visual-presets';
import { buildFigure } from './living.generated/figures';

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
  /** Head, thorax and abdomen on legs, with wings when it has them: a fly, a bee, an ant. */
  'insect',
  /** A streamlined body with fins and a tail that sweeps: a fish, a shark. */
  'fish',
  /** A body with two wings, a beak and a tail: a bird, a hen, an eagle. */
  'bird',
  /** A body on four legs with a head and a tail: a cow, a dog, a lion. */
  'quadruped',
  /** A chain of segments that bends as it goes: a snake, a worm, a caterpillar. */
  'segmented',
  /** A head, a body and limbs: a person, walking or standing. */
  'person',
  /** A stem with leaves, a flower or fruit, and roots below: a crop, a herb. */
  'plant',
  /** A trunk with a crown: a tree. */
  'tree',
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
  /** A pair, or two pairs, that beat. */
  'wings',
  /** Legs that walk or crawl. */
  'legs',
  /** Two feelers on the head. */
  'antennae',
  /** A biting mouthpart out in front. */
  'proboscis',
  /** A sting at the back. */
  'stinger',
  /** A tail, or a tail fin. */
  'tail',
  /** Fins along the body. */
  'fins',
  /** A beak. */
  'beak',
  /** Horns on the head. */
  'horns',
  /** Ears that stand up. */
  'ears',
  /** Bands across the body. */
  'stripes',
  /** Spots over the body. */
  'spots',
  /** Leaves on a stem or a crown. */
  'leaves',
  /** Flowers on a plant. */
  'flowers',
  /** Fruit hanging on a plant or a tree. */
  'fruit',
  /** A thick trunk. */
  'trunk',
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
  /** Wings beating fast, the body held in the air. */
  'flutter',
  /** Legs walking, the body rocking a little. */
  'walk',
  /** Wings beating slow and wide, the body rising and dipping. */
  'fly',
  /** The body creeping along, segments rippling. */
  'crawl',
  /** Swaying gently side to side, as in a breeze. */
  'sway',
  /** Held in one place, bobbing. */
  'hover',
] as const;
export type FigureManner = (typeof FIGURE_MANNERS)[number];

/**
 * The manners that move each outline, found once from the recipes: a
 * recipe answers to the manners written for it and holds still for the
 * rest, so a fish told to flutter would not move. What the menu offers
 * an outline, and what a check holds a figure to.
 */
const movingManners = new Map<FigureOutline, FigureManner[]>();
/** Every number a recipe drew, in order: the coordinates of its paths and dots. */
function drawnNumbers(ops: ReturnType<typeof buildFigure>['ops']): number[] {
  const out: number[] = [];
  for (const op of ops) {
    const source =
      op.kind === 'path' ? op.d : op.points.map((p) => p.join(' ')).join(' ');
    for (const m of source.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  }
  return out;
}
/** A figure this many units off its first pose has moved; less is a tremor no one sees. */
const MOVED_UNITS = 2;
export function mannersThatMove(outline: FigureOutline): FigureManner[] {
  const have = movingManners.get(outline);
  if (have) return have;
  const at = (manner: FigureManner, ms: number) =>
    drawnNumbers(
      buildFigure(
        {
          x: 100,
          y: 75,
          w: 120,
          h: 84,
          outline,
          parts: [...OUTLINE_PARTS[outline]],
          manner,
          seed: 3,
        },
        ms,
        false,
      ).ops,
    );
  const moved = (manner: FigureManner) => {
    const a = at(manner, 0);
    const b = at(manner, 900);
    if (a.length !== b.length) return true;
    return a.some((v, i) => Math.abs(v - b[i]) >= MOVED_UNITS);
  };
  const found = FIGURE_MANNERS.filter((m) => m !== 'still' && moved(m));
  movingManners.set(outline, found);
  return found;
}

/** What each manner looks like, as the director and the judge read it. */
export const MANNER_MEANINGS: Record<FigureManner, string> = {
  still: 'is held still',
  drift: 'drifts slowly, as if afloat',
  swim: 'swims, its tail sweeping',
  beat: 'beats, like a heart or wings',
  stream: 'streams along, its parts flowing',
  grow: 'grows out from its base',
  pulse: 'pulses, swelling and easing',
  flutter: 'flutters, wings beating fast, held in the air',
  walk: 'walks, legs moving, the body rocking a little',
  fly: 'flies, wings beating slow and wide, rising and dipping',
  crawl: 'crawls, its segments rippling',
  sway: 'sways gently side to side',
  hover: 'hovers in one place, bobbing',
};

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
  insect: 1.6,
  fish: 1.7,
  bird: 1.4,
  quadruped: 1.5,
  segmented: 2.2,
  person: 0.55,
  plant: 0.8,
  tree: 0.9,
};

export function figureAspect(outline: FigureOutline): number {
  return FIGURE_ASPECT[outline] ?? 1;
}

/**
 * How wide a figure is drawn when it is the card's whole subject. A wide
 * outline takes more of the stage, so a coastline is not a thumbnail.
 */
export function figureWidth(outline: FigureOutline): number {
  const aspect = figureAspect(outline);
  // A tall outline is held to the height a card has for it.
  return Math.min(aspect >= 1.4 ? 216 : 150, Math.round(190 * aspect));
}

/** The parts each outline knows how to draw; the rest are dropped. */
export const OUTLINE_PARTS: Record<FigureOutline, FigurePart[]> = {
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
  insect: [
    'wings',
    'legs',
    'antennae',
    'proboscis',
    'stinger',
    'stripes',
    'spots',
  ],
  fish: ['fins', 'tail', 'stripes', 'spots'],
  bird: ['wings', 'beak', 'tail', 'legs', 'spots'],
  quadruped: ['legs', 'tail', 'horns', 'ears', 'stripes', 'spots'],
  segmented: ['stripes', 'spots', 'legs'],
  person: [],
  plant: ['leaves', 'flowers', 'fruit', 'roots'],
  tree: ['trunk', 'leaves', 'fruit', 'flowers', 'roots'],
};

/**
 * The places on an outline a callout can point at, beyond its parts:
 * the drawing reports where each is every frame, so a label follows it.
 */
export const FIGURE_ANCHORS: Record<FigureOutline, string[]> = {
  blob: ['centre', 'edge'],
  body: ['centre', 'edge'],
  branch: ['centre', 'edge', 'base'],
  layers: ['centre', 'edge', 'top', 'bottom'],
  lattice: ['centre', 'edge'],
  vessel: ['centre', 'edge', 'top', 'bottom'],
  terrain: ['centre', 'edge', 'top'],
  field: ['centre', 'edge'],
  insect: ['centre', 'head', 'thorax', 'abdomen', 'eye'],
  fish: ['centre', 'head', 'body', 'eye'],
  bird: ['centre', 'head', 'body', 'eye'],
  quadruped: ['centre', 'head', 'body', 'back', 'eye'],
  segmented: ['centre', 'head', 'body'],
  person: ['centre', 'head', 'body', 'arms', 'legs'],
  plant: ['centre', 'stem', 'top'],
  tree: ['centre', 'crown', 'trunk'],
};

/** Whether a callout may point at this part of a figure. */
export function figureHasAnchor(figure: VisualFigure, part: string): boolean {
  return (
    figure.parts.includes(part as FigurePart) ||
    FIGURE_ANCHORS[figure.outline].includes(part)
  );
}

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
  /** A living thing is drawn as a figure even when the library has a still icon of it, so it moves. */
  alive?: boolean;
}[] = [
  {
    words:
      /\b(tsetse|mosquito(?:es)?|midge|gnat|horsefl(?:y|ies)|sandfl(?:y|ies)|blackfl(?:y|ies))\b/,
    outline: 'insect',
    parts: ['wings', 'legs', 'antennae', 'proboscis'],
    manner: 'flutter',
    alive: true,
  },
  {
    words: /\b(bee|bees|honeybee|wasp|wasps|hornet|hornets)\b/,
    outline: 'insect',
    parts: ['wings', 'legs', 'antennae', 'stinger', 'stripes'],
    manner: 'flutter',
    alive: true,
  },
  {
    words:
      /\b(fly|flies|housefl(?:y|ies)|fruit fl(?:y|ies)|moth|moths|butterfl(?:y|ies)|dragonfl(?:y|ies)|locust|locusts|grasshopper|cricket|termite|termites|insect|insects)\b/,
    outline: 'insect',
    parts: ['wings', 'legs', 'antennae'],
    manner: 'flutter',
    alive: true,
  },
  {
    words:
      /\b(ant|ants|beetle|beetles|cockroach|cockroaches|weevil|flea|fleas|louse|lice|tick|ticks|mite|mites|spider|spiders|bug|bugs)\b/,
    outline: 'insect',
    parts: ['legs', 'antennae'],
    manner: 'crawl',
    alive: true,
  },
  {
    words:
      /\b(fish|fishes|tilapia|catfish|salmon|shark|sharks|trout|sardine|sardines|tuna|carp|cod|mackerel|minnow|herring)\b/,
    outline: 'fish',
    parts: ['fins', 'tail'],
    manner: 'swim',
    alive: true,
  },
  {
    words:
      /\b(hen|hens|chicken|chickens|rooster|cock|duck|ducks|goose|geese|turkey|turkeys|ostrich|poultry)\b/,
    outline: 'bird',
    parts: ['wings', 'beak', 'tail', 'legs'],
    manner: 'walk',
    alive: true,
  },
  {
    words:
      /\b(bird|birds|eagle|eagles|hawk|owl|owls|sparrow|pigeon|pigeons|dove|crow|crows|vulture|parrot|swallow|stork|heron|flamingo|kite)\b/,
    outline: 'bird',
    parts: ['wings', 'beak', 'tail'],
    manner: 'fly',
    alive: true,
  },
  {
    words:
      /\b(cow|cows|cattle|bull|bulls|ox|oxen|goat|goats|sheep|ram|rams|buffalo|antelope|deer|gazelle)\b/,
    outline: 'quadruped',
    parts: ['legs', 'tail', 'horns', 'ears'],
    manner: 'walk',
    alive: true,
  },
  {
    words:
      /\b(dog|dogs|cat|cats|lion|lions|leopard|cheetah|elephant|elephants|horse|horses|donkey|donkeys|camel|camels|pig|pigs|hog|zebra|giraffe|rat|rats|mouse|mice|rabbit|rabbits|hare|fox|wolf|hyena|hippo|rhino|mammal|mammals|livestock)\b/,
    outline: 'quadruped',
    parts: ['legs', 'tail', 'ears'],
    manner: 'walk',
    alive: true,
  },
  {
    words:
      /\b(snake|snakes|python|cobra|viper|worm|worms|earthworm|caterpillar|caterpillars|larva|larvae|maggot|tapeworm|roundworm|hookworm|eel|centipede|millipede|leech|leeches)\b/,
    outline: 'segmented',
    parts: ['stripes'],
    manner: 'crawl',
    alive: true,
  },
  {
    words:
      /\b(person|people|man|men|woman|women|child|children|boy|boys|girl|girls|baby|babies|crowd|villager|villagers|citizen|citizens|human|humans|pedestrian|farmer|farmers|worker|workers|family|families)\b/,
    outline: 'person',
    parts: [],
    manner: 'walk',
    alive: true,
  },
  {
    words:
      /\b(plant|plants|crop|crops|maize|corn|cassava|yam|yams|rice|wheat|millet|sorghum|bean|beans|seedling|seedlings|herb|herbs|shrub|shrubs|weed|weeds|sunflower|vegetable|vegetables|tomato|tomatoes|pepper|okra|cocoa|coffee|tea|flower|flowers)\b/,
    outline: 'plant',
    parts: ['leaves', 'roots'],
    manner: 'sway',
    alive: true,
  },
  {
    words:
      /\b(tree|trees|forest|forests|woodland|baobab|palm|palms|oak|pine|acacia|orchard|mangrove|mangroves)\b/,
    outline: 'tree',
    parts: ['trunk', 'leaves'],
    manner: 'sway',
    alive: true,
  },
  {
    words:
      /\b(cell|cells|cellular|amoeba|amoebae|protozoa|protozoan|protist|bacteri\w*|microbe|microorganism|micro-organism|germ|germs|pathogen|plankton|alga|algae|spore|yeast|organelle|cytoplasm|nucleus|blob|embryo|ovum|egg cell)\b/,
    outline: 'blob',
    parts: ['membrane', 'core', 'pockets', 'grains'],
    manner: 'drift',
  },
  {
    words:
      /\b(paramecium|euglena|ciliate|flagellate|sperm|tadpole|bacillus|rod cell|swimmer)\b/,
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

/**
 * What each outline looks like on the page, said as a shape and not as a
 * kind of thing. An outline described by what it is for ("a container
 * holding something to a level") pulls in anything that shares that
 * purpose, which is how a kidney came to be drawn as a beaker. Described
 * as a silhouette, it pulls in only what has that silhouette.
 */
export const OUTLINE_LOOKS: Record<FigureOutline, string> = {
  blob: 'one soft closed shape with a rounded, uneven edge',
  body: 'one smooth spindle, pointed at both ends',
  branch: 'a stem that splits in two again and again, spreading out',
  layers: 'flat bands lying one on top of another',
  lattice: 'small nodes in a repeating mesh, joined by short lines',
  vessel:
    'a tall open box seen from the side, with a flat line across it where the filling stops',
  terrain: 'a ground line seen from the side, rising and falling',
  field: 'long curved lines running across an open space, all the same way',
  insect: 'three joined body parts on thin legs, with wings',
  fish: 'a tapered body with fins and a tail fin',
  bird: 'a rounded body with two wings, a beak and a tail',
  quadruped:
    'a body on four legs, with a head at one end and a tail at the other',
  segmented: 'a long chain of repeated segments, bending along its length',
  person: 'a head, a body, two arms and two legs',
  plant: 'an upright stem with leaves, and roots below the line',
  tree: 'a thick trunk under a broad crown',
};

/**
 * The words in a thing's stated appearance that bear out each outline.
 * The test runs against the description of the form, never against the
 * name of the thing: asking whether "kidney" sounds like a container
 * gets the wrong answer, asking whether "a bean-shaped organ with a
 * notch on one edge" does gets the right one. Words for what a thing
 * does are deliberately absent: a thing that holds, stores or filters is
 * not thereby shaped like a tank.
 */
const OUTLINE_FORM_WORDS: Record<FigureOutline, RegExp> = {
  blob: /\b(blob|bean|kidney.?shaped|round\w*|oval|ovoid|lobe\w*|soft|irregular|droplet|globul\w*|sac|pouch|bulb\w*|amoeb\w*|cell|clump|mass|smooth closed|curved outline)\b/,
  body: /\b(spindle|spindle.?shaped|streamlin\w*|taper\w*|torpedo|cigar|elongat\w*|slipper.?shaped|oval body|smooth body|seed.?shaped|egg.?shaped)\b/,
  branch:
    /\b(branch\w*|divid\w*|dividing|fork\w*|split\w*|tributar\w*|dendrit\w*|tree.?like|spread\w* out|arbor\w*|bifurcat\w*|root\w* system)\b/,
  layers:
    /\b(layer\w*|band\w*|strat\w*|stack\w*|sheet\w*|lamina\w*|coat\w*|tier\w*|seam\w*|one on top of|one above|horizon\w*)\b/,
  lattice:
    /\b(lattice|mesh|grid|network of|node\w*|repeating|array|honeycomb|matrix|framework|scaffold|joined at|cross.?linked)\b/,
  vessel:
    /\b(tank|beaker|jar|cup|vat|barrel|silo|cistern|basin|tub|bucket|drum|flask|cylinder|open box|walls and a|brim|filled to|level line|upright box)\b/,
  terrain:
    /\b(ground|land|slope\w*|hill\w*|valley|coast\w*|cliff|ridge|plateau|dune|terrain|landscape|seen from the side|profile of the ground|cross.?section of ground)\b/,
  field:
    /\b(lines of|streamline\w*|flow lines|field lines|current\w*|wind\w*|swirl\w*|eddy|eddies|arrows across|running across)\b/,
  insect:
    /\b(insect|fly|flies|bee|ant|beetle|mosquito|wasp|wing\w*|thorax|abdomen|antenna\w*|proboscis|six legs)\b/,
  fish: /\b(fish|fin\w*|gill\w*|tail fin|scales|swim\w* body)\b/,
  bird: /\b(bird|beak|bill|feather\w*|wing\w*|perch\w*|two wings)\b/,
  quadruped:
    /\b(four legs|quadruped|hoof|hooves|snout|muzzle|mammal|cattle|cow|dog|horse|goat|four.?legged)\b/,
  segmented:
    /\b(segment\w*|worm|snake|serpent\w*|caterpillar|larva\w*|ring\w* along|repeated sections|sinuous|undulat\w*)\b/,
  person:
    /\b(person|man|woman|child|human|figure of a|arms|legs|head and body|standing|walking)\b/,
  plant:
    /\b(plant|stem|leaf|leaves|flower\w*|crop|shoot|root\w* below|seedling|herb)\b/,
  tree: /\b(tree|trunk|crown|canopy|bough\w*|branches above)\b/,
};

/**
 * Whether a stated appearance bears out an outline. The appearance is
 * the director's own sentence on what the thing looks like; the outline
 * is its claim about that shape.
 */
export function formSupports(
  outline: FigureOutline,
  looksLike: string,
): boolean {
  return OUTLINE_FORM_WORDS[outline].test(looksLike.toLowerCase());
}

/** The shape a thing takes, when its words say one plainly. */
export function guessFigure(
  of: string | undefined,
): (VisualFigure & { alive: boolean }) | null {
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
      alive: Boolean(guess.alive),
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
 * The drawing for a thing: the model's own figure, else a living thing
 * as the figure its words say it is (so it moves), else the preset or
 * icon of that name, else the shape its words say it takes, else
 * nothing. Nothing is an answer: the thing is set as words instead, and
 * a wrong picture is never drawn in its place.
 */
export function resolveDrawing(
  of: string | undefined,
  asked?: Partial<VisualFigure> | null,
  /**
   * The field the document is in. A term that belongs to a field's own
   * vocabulary is answered from that field's pack or by words; it never
   * falls through to the general library, because a drawing that does
   * the same job is not a drawing of the thing.
   */
  field?: string,
): Drawing | null {
  if (!of) return null;
  const want = of.trim().toLowerCase();
  if (field) {
    // The field's own drawing of its own term.
    if (fieldOf(want) === field) return { kind: 'picture', name: want };
    // A term drawn as a part of one of the field's things: the whole,
    // so a line can point at the part.
    const owner = fieldPartOwner(want, field);
    if (owner) return { kind: 'picture', name: owner.name };
    // A term the field claims but has not drawn yet is words, never a
    // stand-in from somewhere else: a glomerulus filters, and is not a
    // funnel.
    if (fieldClaims(want, field)) return null;
  }
  // A figure the model asked for by name outranks everything: it knows
  // the page, and the vocabulary is small enough to be meant.
  if (asked?.outline && FIGURE_OUTLINES.includes(asked.outline))
    return { kind: 'figure', figure: tidyFigure({ ...asked, of }) };
  const guessed = guessFigure(of);
  if (guessed?.alive) return { kind: 'figure', figure: strip(guessed) };
  const named = pickPicture(of);
  // An exact drawing beats a guessed shape; a loose one does not.
  if (named && (!guessed || isExact(of, named)))
    return { kind: 'picture', name: named };
  if (guessed) return { kind: 'figure', figure: strip(guessed) };
  if (named) return { kind: 'picture', name: named };
  return null;
}

const strip = (guess: VisualFigure & { alive: boolean }): VisualFigure => ({
  of: guess.of,
  outline: guess.outline,
  parts: guess.parts,
  manner: guess.manner,
  seed: guess.seed,
});

/**
 * The icon a chip shows beside a thing's name: the library's drawing when
 * it is the thing itself, never a loose match for a living thing, since
 * a tick is not a check mark and a fly is not a bug.
 */
export function chipIcon(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const named = pickPicture(name);
  if (!named) return undefined;
  const guess = guessFigure(name);
  if (guess?.alive && !isExact(name, named)) return undefined;
  return named;
}

/** Whether the drawing carries the thing's own word in its name. */
export function isExact(of: string, name: string): boolean {
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
