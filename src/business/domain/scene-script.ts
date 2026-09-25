/**
 * A page as the writer scripts it: the narration, the cast of things the
 * page needs drawn, and the storyboard that says what stands on the stage
 * and when. Everything here is pure: the checks that keep a storyboard
 * sound and the mends that need no model. The processor calls the model
 * around it.
 *
 * The rule the whole scene keeps: the models decide what, code decides
 * where and when. The writer never gives a coordinate. A moment is
 * anchored on a phrase copied from its sentence, never on a word the model
 * counted, so no miscount can move a picture off its words.
 */

import { MAX_BARS, numbersIn, type ChartSpec } from './scene-chart';
import {
  FIGURE_FACES,
  FIGURE_POSES,
  FIGURE_PROPS,
  FIGURE_SIGNS,
  LYING_POSES,
  MAX_SIGNS,
  MOST_TOGETHER,
  ON_FOOT,
  canHold,
  figureFor,
  figureOf,
  type FigureFace,
  type FigurePose,
  type FigureProp,
  type FigureSign,
  type FigureSpec,
} from './scene-figure';
import { dialogueOf, quotedSpans } from './scene-dialogue';
import {
  directionsIn,
  speakersIn,
  type Actor,
  type NarratedMove,
  type Passage,
  type PropAction,
} from './scene-directions';
import { propsIn, type StageProp } from './scene-props';
import {
  STAGE_RECIPES,
  type LearningStage,
  type StageRecipe,
} from './scene-stage';
import { checkLines } from './maths-work';
import { numberPicture, type NumberPicture } from './scene-numbers';
import { checkArithmetic, markTerms, type MathLine } from './scene-math';
import { sample, type PlotSpec } from './scene-plot';
import { findPhrase, isVerbatim } from './scene-quote';
import { MAX_EVENTS, type TimelineSpec } from './scene-timeline';
import {
  SHEET_PARTS,
  nameKey,
  soundIn,
  type Expression,
  type StoryCrowd,
  type StoryKind,
  type StoryPresence,
  type StoryTime,
  type StoryVoice,
  type StoryWeather,
  type StoryWorld,
} from './scene-story';

/**
 * Rows are made per generator; a new generator is a new set of rows.
 * scene-2: labels lifted out of drawings and set by the stage, arrow
 * labels placed, each sentence's delivery, the page's mood and sounds.
 */
export const SCENE_GENERATOR_VERSION = 'scene-2';

export const SCENE_LAYOUTS = [
  'one',
  'row',
  'grid',
  'compare',
  'hub',
  'cycle',
  'focus',
  'stack',
] as const;
export type SceneLayout = (typeof SCENE_LAYOUTS)[number];

export const SCENE_EFFECTS = [
  'point',
  'show',
  'hide',
  'pulse',
  'zoom',
  'say',
  'look',
  'reach',
  'hug',
] as const;
/** What someone does toward someone else, directed by the writer on a story's page: "ada.kofi", Ada toward Kofi. */
export const ACTING_EFFECTS = ['look', 'reach', 'hug'] as const;
/**
 * What a story's people do besides, played by the rig where a screenplay
 * says: a wave, a nod, a shake of the head, a laugh, a hop, a clap, a sob,
 * a shrug, a lean in toward someone.
 */
export const STORY_MOVES = [
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'sob',
  'shrug',
  'lean-in',
] as const;
export type StoryMove = (typeof STORY_MOVES)[number];
export type SceneEffectKind = (typeof SCENE_EFFECTS)[number] | StoryMove;

/**
 * How a sentence is said. The writer tags each one and code turns the tag
 * into a pace and a silence (scene-voice.ts): a hook a touch quicker, the
 * point slower with room after it, time to think after a question. One
 * pace and two pauses for every sentence was a metronome.
 */
/** How a line is said: its pace, and how the face says it. */
export const LINE_PACES = [
  'calm',
  'quick',
  'slow',
  'whisper',
  'shout',
] as const;
export type LinePace = (typeof LINE_PACES)[number];

/**
 * Where a line comes from: said on the stage ("here"), from just off it,
 * from above (heaven, the sky), down a phone, from a letter read out, in
 * a thought, or in a dream or a memory.
 */
export const LINE_FROMS = [
  'here',
  'off',
  'above',
  'phone',
  'letter',
  'thought',
  'dream',
] as const;
export type LineFrom = (typeof LINE_FROMS)[number];

export const SCENE_DELIVERIES = [
  'hook',
  'explain',
  'key',
  'aside',
  'question',
  'recap',
] as const;
export type SceneDelivery = (typeof SCENE_DELIVERIES)[number];

/** The page's feeling: how the voice sounds, and the music on a page made before the score. */
export const SCENE_MOODS = [
  'calm',
  'bright',
  'curious',
  'serious',
  'playful',
] as const;
export type SceneMood = (typeof SCENE_MOODS)[number];

/**
 * What the music does from a sentence on (scene-music.ts places it). The
 * page's mood sets how the voice sounds; these say what the score under it
 * plays, and where it should play nothing at all.
 */
export const SCENE_MUSIC = [
  'none',
  'calm',
  'curious',
  'bright',
  'playful',
  'motion',
  'solemn',
  'tense',
] as const;
export type SceneMusic = (typeof SCENE_MUSIC)[number];
/** The states whose music can also run high: a chase, a celebration, danger close. */
export const MUSIC_WITH_ENERGY: readonly SceneMusic[] = [
  'motion',
  'bright',
  'tense',
];

/** What a drawn thing can sound like while it is on the stage: only a sound it makes in life. */
export const SCENE_AMBIENCES = [
  'heartbeat',
  'bubbles',
  'water',
  'wind',
  'rain',
  'fire',
  'electric',
  'machine',
  'clock',
] as const;
export type SceneAmbience = (typeof SCENE_AMBIENCES)[number];

/**
 * How a page may be taught. Every page can be an explainer; a book of
 * maths may also work on a board (maths set by code, and graphs); a book
 * of poems, plays or stories may also read its own words closely. The
 * document's profile says which a book may use.
 */
export const SCENE_FORMATS = ['explainer', 'maths', 'reading'] as const;
export type SceneFormat = (typeof SCENE_FORMATS)[number];

export const DRAWING_SHAPES = ['square', 'wide', 'tall'] as const;
export type DrawingShape = (typeof DRAWING_SHAPES)[number];

/** The most things a page may draw: each is a call, and a minute or two of waiting. */
export const MAX_DRAWINGS = 8;
/** The most named parts, and later states, one drawing is asked for. */
export const MAX_PARTS = 8;
export const MAX_STATES = 3;
/** The most things on the stage at once; beyond it, nothing is taken in. */
export const MAX_ON_STAGE = 5;
/** The most arrows on the stage at once. */
export const MAX_ARROWS = 6;
/** A page longer than this, spoken, is more than the voice takes in one request. */
export const MAX_SPOKEN_CHARS = 7000;

export interface SceneBeat {
  /** One spoken sentence. */
  say: string;
  /** The silence after it: short between sentences, long where the idea changes. */
  pause: 'short' | 'long';
  /** How it is said: its pace and the silence after it follow from this. */
  delivery: SceneDelivery;
  /** The story's character it quotes, by their id: their words in their voice, in a bubble by their head. */
  speaker?: string | null;
  /**
   * Each line it quotes and who says it, found in its own words: a quote
   * with no speaker found is the narrator's and is not listed.
   */
  lines?: { span: [number, number]; speaker: string }[];
  /**
   * What its narration says the characters do, found in its own words:
   * where the verb starts, who, what, and toward whom or what ("@up" is
   * the sky).
   */
  acts?: {
    at: number;
    who: string;
    do: NarratedMove;
    toward: string | null;
  }[];
  /**
   * What its narration says people do with the things on the stage, found
   * in its own words: where the verb starts, who, what, with which thing,
   * and to whom it is given.
   */
  business?: {
    at: number;
    who: string;
    does: PropAction;
    prop: StageProp;
    to: string | null;
  }[];
  /**
   * On a story's page, written as a screenplay: a line a character says,
   * the whole sentence in their voice, or the narrator's few words.
   * Absent on a lesson's page, all of it narration.
   */
  kind?: 'line' | 'narration';
  /** A line's listener: whom it is said to, by id. */
  to?: string;
  /**
   * Where a line comes from, when not from someone on the stage: off it,
   * above, a phone, a letter, a thought, a dream. A narration from above
   * is words from heaven no character in the cast could say.
   */
  from?: Exclude<LineFrom, 'here'>;
  /** How a line is said. */
  pace?: LinePace;
  /** Seconds of quiet after it, for what happens without words: a hug, someone walking off. */
  holdS?: number;
  /** The music from this sentence on; absent, it carries on as it was. */
  music?: SceneMusic;
  /** The music runs high from here: a chase, a rush, danger close. */
  energy?: 'high';
}

export interface DrawingThing {
  id: string;
  kind: 'drawing';
  /** The page's own word for it, one to three words; its caption. */
  name: string;
  /** What to draw, for an illustrator who has not read the page. */
  brief: string;
  /** What moves while it is on screen, and why. */
  motion: string;
  /** Things the voice names inside it, each drawn as its own group. */
  parts: { name: string; label: boolean }[];
  /** Overlays drawn over it and shown later: the bulb lit, the valve open. */
  states: { name: string; look: string }[];
  shape: DrawingShape;
  /** The sound it makes while it is on stage, or null for none. */
  sound: SceneAmbience | null;
}

export interface StatThing {
  id: string;
  kind: 'stat';
  /** As the page writes it: "70%", "1.5 million". */
  value: string;
  caption: string;
}

export interface WordsThing {
  id: string;
  kind: 'words';
  text: string;
  style: 'title' | 'keyword';
}

/** Working set by code: lines of TeX, their equals signs in one column. */
export interface MathThing {
  id: string;
  kind: 'math';
  /** A caption under the working, or empty for none. */
  name: string;
  lines: MathLine[];
  /** For a young learner, its sum as a picture under it: blocks, bars, dots. */
  picture?: NumberPicture;
}

/** A graph drawn by code from its function. */
export interface PlotThing {
  id: string;
  kind: 'plot';
  name: string;
  plot: PlotSpec;
}

/** The text's own words, with the phrases the voice will talk about. */
export interface QuoteThing {
  id: string;
  kind: 'quote';
  name: string;
  text: string;
  phrases: { name: string; phrase: string; note: string | null }[];
}

/** The page's events along an axis, drawn by code. */
export interface TimelineThing {
  id: string;
  kind: 'timeline';
  name: string;
  timeline: TimelineSpec;
}

/** Bars or a line from the page's own numbers, drawn by code. */
export interface ChartThing {
  id: string;
  kind: 'chart';
  name: string;
  chart: ChartSpec;
}

/** A thing drawn by code and not by the artist. */
export type CodeThing =
  MathThing | PlotThing | QuoteThing | TimelineThing | ChartThing;

/** The kinds code draws itself. */
export const CODE_KINDS = [
  'math',
  'plot',
  'quote',
  'timeline',
  'chart',
] as const;

/** Whether a thing is one code draws, not the artist. */
export const isCodeThing = (thing: { kind: string }): thing is CodeThing =>
  (CODE_KINDS as readonly string[]).includes(thing.kind);

/**
 * One of the story's characters: drawn once for the whole book, and the
 * same figure on every page they are on.
 */
export interface CharacterThing {
  id: string;
  kind: 'character';
  /** Their id in the story. */
  ref: string;
  name: string;
  /** The face they come on with; null keeps the one the last page left them with. */
  state: FigureFace | null;
  /** Where they come in the order the book meets its characters: the first met stands on the left. */
  met: number;
  /** On the page the book meets them: what they are like, set beside them. */
  intro: string[];
  /** What they are like, on every page: how they move. */
  traits?: string[];
  /** The page the book meets them on: their name is written under them. */
  first?: boolean;
  /** Their pose on this page, when the kit draws them; absent, standing. */
  pose?: FigurePose;
  /** What they are going through as they come on: a shake, a fever, sparkles where it tingles. */
  signs?: FigureSign[];
  /** What they hold on this page. */
  holding?: FigureProp;
  /** The face the last page left them with: theirs through a "previously" opening. */
  before?: Expression;
  /** A group who speak as one: the crowd behind the stage is them. */
  group?: true;
  /** One of the story's minor characters: drawn a little smaller and quieter. */
  minor?: true;
}

/**
 * A person the page shows who is not one of a story's characters: a
 * doctor, a patient, a scientist, a shopkeeper. Drawn by the kit from
 * the writer's figure, in the same style as everyone else, never by the
 * artist.
 */
export interface PersonThing {
  id: string;
  kind: 'person';
  /** Their caption: "Doctor", "Marie Curie". */
  name: string;
  figure: FigureSpec;
  /** How many people like them stand together: 1, or a team, a family, a class, as up to four. */
  count?: number;
  /** How they are placed: their arms doing something, lying down, in bed (a patient); absent, standing. */
  pose?: FigurePose;
  /** What they are going through as they come on: a shake, a fever, sparkles where it tingles. */
  signs?: FigureSign[];
  /** What they hold. */
  holding?: FigureProp;
  /** The face they come on with; null for a calm one. */
  state: FigureFace | null;
}

/**
 * One of the story's places: painted once for the whole book, and the
 * scene behind the stage whenever the story is there. Never a thing in a
 * slot: shown, it becomes the backdrop.
 */
export interface PlaceThing {
  id: string;
  kind: 'place';
  /** Its id in the story. */
  ref: string;
  name: string;
  /** What it sounds like while the story is there. */
  sound: SceneAmbience | null;
}

export type SceneThing =
  | DrawingThing
  | StatThing
  | WordsThing
  | CodeThing
  | CharacterThing
  | PersonThing
  | PlaceThing;

/** The names of the parts the voice can point at in a thing. */
export function partNames(thing: SceneThing): string[] {
  if (thing.kind === 'drawing') return thing.parts.map((p) => p.name);
  if (thing.kind === 'math')
    return [
      ...new Set(
        thing.lines.flatMap((line, k) =>
          markTerms(line.latex, k + 1).terms.map((t) => t.name),
        ),
      ),
    ];
  if (thing.kind === 'plot')
    return ['curve', ...thing.plot.points.map((p) => p.name)];
  if (thing.kind === 'quote') return thing.phrases.map((p) => p.name);
  if (thing.kind === 'timeline')
    return thing.timeline.events.map((e) => e.name || e.when);
  if (thing.kind === 'chart') return thing.chart.bars.map((b) => b.label);
  if (thing.kind === 'character' || thing.kind === 'person')
    return [...SHEET_PARTS];
  return [];
}

/** The names of the states a thing can show and hide: a drawing's overlays, a working's later lines. */
export function stateNames(thing: SceneThing): string[] {
  if (thing.kind === 'drawing') return thing.states.map((s) => s.name);
  if (thing.kind === 'math')
    return thing.lines.slice(1).map((_, k) => `line ${k + 2}`);
  if (thing.kind === 'character' || thing.kind === 'person')
    return [...FACES, ...FIGURE_SIGNS];
  return [];
}

/** Every face a person or a character can wear: the story's seven and the kit's own. */
export const FACES = FIGURE_FACES;
export const isFace = (value: unknown): value is FigureFace =>
  (FACES as readonly unknown[]).includes(value);

/**
 * The signs a person or a character shows on a page: those they come
 * on with, and those an effect shows. Only these are drawn.
 */
export function signsShown(script: SceneScript, id: string): FigureSign[] {
  const thing = script.cast.find((one) => one.id === id);
  const first =
    thing?.kind === 'person' || thing?.kind === 'character'
      ? (thing.signs ?? [])
      : [];
  const shown = new Set(
    script.steps.flatMap((step) =>
      step.effects.flatMap((effect) =>
        effect.target === id && effect.do === 'show' && effect.part
          ? [effect.part]
          : [],
      ),
    ),
  );
  return FIGURE_SIGNS.filter((sign) => first.includes(sign) || shown.has(sign));
}

export interface SceneArrow {
  from: string;
  to: string;
  label: string | null;
  /** Dashes march along it: the stage's steady motion. */
  flow: boolean;
}

/** What stands on the stage after a step, in slot order. */
export interface SceneStage {
  layout: SceneLayout;
  show: string[];
  arrows: SceneArrow[];
  /** A place shown at this step: the scene behind the stage from now on. */
  backdrop?: string;
  /** Who comes into view here without arriving: in the scene all along, now shown. */
  cutIn?: string[];
  /** Who arrives here as the words say ("Zainab ran up the path"): they walk on. */
  arrive?: string[];
  /** Who leaves here as the words say ("Baba Sule walked off"): they walk off. */
  leave?: string[];
  /** A cut: a new scene, or to another place of it, even where the place is the same. */
  cut?: true;
}

export interface SceneEffect {
  /** The thing's id. */
  target: string;
  /** One of its parts or states, by the name the writer gave it; null for the whole thing. */
  part: string | null;
  do: SceneEffectKind;
}

export interface SceneStep {
  /** The sentence it lands in, and a phrase copied from it. */
  at: { beat: number; phrase: string };
  /** Where in the sentence the phrase starts, in words; set by the mend. */
  word: number;
  /**
   * A moment in the quiet after the sentence instead, this many seconds
   * after its last word: what a screenplay shows without words. With the
   * sentence -1, before the first, in the quiet the page opens with.
   */
  after?: number;
  /** Null: the stage stays as it is and only the effects happen. */
  stage: SceneStage | null;
  effects: SceneEffect[];
}

export interface SceneScript {
  fit: 'good' | 'poor';
  fitReason: string | null;
  title: string;
  mood: SceneMood;
  beats: SceneBeat[];
  cast: SceneThing[];
  steps: SceneStep[];
  /** A story page's own place: the scene behind the stage until the writer shows another. */
  backdrop?: string | null;
  /**
   * A story page's "previously": who comes back from the page before, as
   * they were, on the scene they were in, before the voice starts.
   */
  opening?: { show: string[]; backdrop: string | null } | null;
  /** Seconds of what happens without words before the first word: someone walking on. */
  lead?: number;
  /** The things the page's words set on the stage (bread, a cup): on the table from the start, handled as the narration says. */
  props?: StageProp[];
  /** A story page's time, weather and crowd, and the story's world: how the stage dresses it. */
  setting?: {
    time: StoryTime | null;
    weather: StoryWeather | null;
    crowd: StoryCrowd | null;
    world: StoryWorld | null;
  };
}

/**
 * What the writer returns: every field present, nulls for the ones a kind
 * does not use. Flat, because a structured-output schema holds a flat
 * shape more reliably than a union, and a model fills it more reliably.
 */
export interface SceneScriptDraft {
  fit: 'good' | 'poor';
  fitReason: string | null;
  title: string;
  mood: SceneMood;
  beats: {
    say: string;
    pause: 'short' | 'long';
    delivery: SceneDelivery;
    /** A story's character the sentence quotes, or null. */
    speaker?: string | null;
    /** The music from this sentence on, or null to carry on. */
    music?: SceneMusic | null;
    energy?: 'low' | 'high' | null;
  }[];
  cast: {
    id: string;
    kind:
      | 'drawing'
      | 'stat'
      | 'words'
      | 'math'
      | 'plot'
      | 'quote'
      | 'timeline'
      | 'chart'
      | 'character'
      | 'person'
      | 'place';
    /** A drawing's caption, a stat's caption, the words themselves. */
    name: string;
    brief: string | null;
    motion: string | null;
    parts: { name: string; label: boolean }[] | null;
    states: { name: string; look: string }[] | null;
    shape: DrawingShape | null;
    value: string | null;
    style: 'title' | 'keyword' | null;
    sound: SceneAmbience | null;
    /** A working's lines. */
    lines: { latex: string; check: string | null }[] | null;
    /** A graph. */
    plot: {
      fn: string;
      xFrom: number;
      xTo: number;
      yFrom: number | null;
      yTo: number | null;
      xLabel: string | null;
      yLabel: string | null;
      points: { x: number; name: string }[] | null;
    } | null;
    /** A quotation, word for word from the page. */
    quote: string | null;
    phrases: { name: string; phrase: string; note: string | null }[] | null;
    /** A character: their id in the story, and the face they come on with (a person's too). */
    ref: string | null;
    state: FigureFace | null;
    /** A person: how they look, from the kit's lists; made sound by figureOf. */
    figure?: Record<string, unknown> | null;
    /** A person: how many like them stand together. */
    count?: number | null;
    /** A person or a character: how they are placed. */
    pose?: FigurePose | null;
    /** A person or a character: what they are going through as they come on. */
    signs?: FigureSign[] | null;
    /** A person or a character: what they hold. */
    holding?: FigureProp | null;
    /** A timeline: the page's events in order, each when and what. */
    timeline: { when: string; name: string }[] | null;
    /** A chart: bars or a line, from the page's own numbers. */
    chart: {
      kind: 'bar' | 'line';
      unit: string | null;
      bars: { label: string; value: number }[];
    } | null;
  }[];
  steps: {
    beat: number;
    phrase: string;
    /** Null: the stage stays as it is. */
    layout: SceneLayout | null;
    show: string[] | null;
    arrows:
      | { from: string; to: string; label: string | null; flow: boolean }[]
      | null;
    effects: { target: string; do: SceneEffectKind }[] | null;
  }[];
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The words of a sentence as the captions count them: a whitespace split. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

import { groupId, idKey, wordKey } from './scene-ids';
export { groupId, idKey, wordKey };
export { quotedSpans };

/** Two words the same, or one the other with an ending: "chloroplast" and "chloroplasts". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    short.length >= 4 &&
    long.startsWith(short) &&
    long.length - short.length <= 3
  );
}

/**
 * Where a phrase starts in a sentence, in words of the sentence, or -1.
 * Case and punctuation do not count; failing an exact match, the window
 * that shares the most words, if it shares at least three in five.
 */
export function phraseAt(sentence: string, phrase: string): number {
  const words = wordsOf(sentence);
  const keyed = words
    .map((word, index) => ({ key: wordKey(word), index }))
    .filter((w) => w.key);
  const wanted = wordsOf(phrase).map(wordKey).filter(Boolean);
  if (!wanted.length || !keyed.length) return -1;
  for (let i = 0; i + wanted.length <= keyed.length; i += 1) {
    if (wanted.every((key, k) => keyed[i + k].key === key))
      return keyed[i].index;
  }
  let best = -1;
  let bestScore = 0;
  const span = Math.min(wanted.length, keyed.length);
  for (let i = 0; i + span <= keyed.length; i += 1) {
    let matched = 0;
    for (let k = 0; k < span; k += 1)
      if (sameWord(keyed[i + k].key, wanted[k])) matched += 1;
    const score = matched / wanted.length;
    if (score > bestScore) {
      bestScore = score;
      best = keyed[i].index;
    }
  }
  return bestScore >= 0.6 ? best : -1;
}

// ── Layouts ───────────────────────────────────────────────────────────────

/** How many things each layout holds. */
export const LAYOUT_CAPACITY: Record<
  SceneLayout,
  { min: number; max: number }
> = {
  one: { min: 1, max: 1 },
  row: { min: 2, max: 5 },
  grid: { min: 3, max: 4 },
  compare: { min: 2, max: 2 },
  hub: { min: 3, max: 6 },
  cycle: { min: 3, max: 5 },
  focus: { min: 2, max: 4 },
  stack: { min: 2, max: 4 },
};

/** The layout the writer asked for when it holds this many, else the nearest one that does. */
export function fitLayout(asked: SceneLayout, count: number): SceneLayout {
  const { min, max } = LAYOUT_CAPACITY[asked];
  if (count >= min && count <= max) return asked;
  if (count <= 1) return 'one';
  if (count === 2)
    return asked === 'focus' || asked === 'compare' || asked === 'stack'
      ? asked
      : 'row';
  return asked === 'stack' && count <= 4 ? 'stack' : 'row';
}

// ── The mend ──────────────────────────────────────────────────────────────

const slug = (text: string) => groupId(text).slice(0, 32);

export const clean = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/** A sentence's music, kept only when it is one the score plays; high only where it can run high. */
/**
 * What a page that is not a story must say for its music to be solemn: a
 * death, grief, a war, a disaster. The writer reaches for solemn on
 * symptoms and illness too (an illness explained is calm), so, like a
 * chart's numbers, solemn is held to the page's own words.
 */
const GRAVE =
  /\b(die[ds]?|dying|dead|deaths?|deadly|fatal(ly|ity|ities)?|kill(s|ed|ing)?|perish(es|ed|ing)?|lost (his|her|their|its) li(fe|ves)|grie(f|ve[ds]?|ving)|mourn(s|ed|ing)?|funerals?|graves?|trag(edy|edies|ic)|disasters?|catastroph\w*|wars?|battles?|massacres?|genocide|famine|murder(s|ed)?|drown(s|ed)?|victims?|casualt(y|ies)|slain|sorrow|holocaust|bur(y|ied)|sank|sunk)\b/i;

/** Whether a sentence, or the one after it, tells of something grave enough for solemn music. */
export function tellsOfLoss(say: string, next?: string): boolean {
  return GRAVE.test(say) || (next !== undefined && GRAVE.test(next));
}

export function musicOf(
  beat: Pick<SceneScriptDraft['beats'][number], 'say' | 'music' | 'energy'>,
  next: Pick<SceneScriptDraft['beats'][number], 'say'> | undefined,
  story: boolean,
): {
  music?: SceneMusic;
  energy?: 'high';
} {
  const asked =
    beat.music && SCENE_MUSIC.includes(beat.music) ? beat.music : undefined;
  // Outside a story, solemn where the page tells of no loss is calm. A
  // story's sadness (a light gone out, a boat lost in the fog) is its own
  // to score, and is left as the writer asked.
  const music =
    asked === 'solemn' && !story && !tellsOfLoss(beat.say, next?.say)
      ? 'calm'
      : asked;
  return {
    ...(music ? { music } : {}),
    ...(beat.energy === 'high' && (!music || MUSIC_WITH_ENERGY.includes(music))
      ? { energy: 'high' as const }
      : {}),
  };
}

export interface MendedScript {
  script: SceneScript;
  /** What the writer should redo; empty means the storyboard is sound. */
  problems: string[];
  /** What code put right on its own, for the log. */
  mended: string[];
}

/** Whether "she" or "he" may mean a character, from the voice they speak in. */
export function genderOf(
  voice: StoryVoice | null | undefined,
): 'f' | 'm' | null {
  if (voice === 'girl' || voice === 'woman' || voice === 'old woman')
    return 'f';
  if (voice === 'boy' || voice === 'man' || voice === 'old man') return 'm';
  return null;
}

/**
 * Who comes and goes as the narration says, on the stage: someone who
 * leaves walks off at the words and stays off until the words bring them
 * back; someone who comes walks on at the words, and stays until they
 * go. Where the writer's storyboard has them come or go in that sentence
 * or the next, it is left as the writer staged it.
 */
function comingsAndGoings(
  steps: SceneStep[],
  passages: readonly Passage[],
  beats: readonly SceneBeat[],
  characters: ReadonlySet<string>,
  mended: string[],
): void {
  /** The word a passage is said on: the one its first character is in. */
  const wordAt = (p: Passage) => {
    const before = beats[p.beat].say.slice(0, p.at);
    const n = wordsOf(before).length;
    return /\S$/u.test(before) ? n - 1 : n;
  };
  const key = (beat: number, word: number) => beat * 100_000 + word;
  const keyOf = (step: SceneStep) => key(step.at.beat, step.word);
  /** A stage as it was, as the base of a new one: who came into it then is no newcomer now. */
  const base = (stage: SceneStage): SceneStage => {
    const out = { ...stage };
    delete out.cutIn;
    delete out.arrive;
    delete out.leave;
    return out;
  };
  const without = (stage: SceneStage, id: string): SceneStage | null => {
    const show = stage.show.filter((one) => one !== id);
    if (!show.length) return null;
    return {
      ...stage,
      layout: fitLayout(stage.layout, show.length),
      show,
      arrows: stage.arrows.filter((a) => a.from !== id && a.to !== id),
    };
  };
  for (const passage of passages) {
    const { who, how } = passage;
    const word = wordAt(passage);
    const at = key(passage.beat, word);
    let k = -1;
    steps.forEach((step, i) => {
      if (keyOf(step) <= at) k = i;
    });
    let at0 = k;
    while (at0 >= 0 && !steps[at0].stage) at0 -= 1;
    const standing = at0 >= 0 ? steps[at0].stage : null;
    const shown = standing?.show.includes(who) ?? false;
    // The writer's own staging in this sentence or the next.
    const nearby = steps.filter(
      (s) => s.stage && keyOf(s) > at && s.at.beat <= passage.beat + 1,
    );
    // Until the words say otherwise: where they bring them back, or take them off.
    const until = passages
      .filter((p) => p.who === who && p.how !== how && !p.said)
      .map((p) => key(p.beat, wordAt(p)))
      .find((later) => later > at);
    // Speaking after the words sent them away, they call from off the stage.
    if (passage.said) {
      const last = passages
        .filter((p) => p.who === who && !p.said && key(p.beat, wordAt(p)) <= at)
        .pop();
      if (last?.how === 'leave') continue;
    }
    const phrase = wordsOf(beats[passage.beat].say)
      .slice(word, word + 4)
      .join(' ');
    let stage: SceneStage;
    if (how === 'leave') {
      if (!standing || !shown) continue;
      // The writer takes them off nearby: where the words say they go, they walk off.
      const taking = nearby.find((s) => !s.stage!.show.includes(who));
      if (taking) {
        taking.stage!.leave = [...(taking.stage!.leave ?? []), who];
        continue;
      }
      stage = without(base(standing), who) ?? {
        layout: 'one',
        show: [],
        arrows: [],
        ...(standing.backdrop ? { backdrop: standing.backdrop } : {}),
      };
      stage.leave = [who];
      for (const later of steps)
        if (
          later.stage?.show.includes(who) &&
          keyOf(later) > at &&
          (until === undefined || keyOf(later) < until)
        )
          later.stage = without(later.stage, who);
    } else {
      if (shown) {
        // On since the writer's step just before the words: they arrive there.
        let prior = at0 - 1;
        while (prior >= 0 && !steps[prior].stage) prior -= 1;
        if (
          !passage.said &&
          standing &&
          steps[at0].at.beat >= passage.beat - 1 &&
          !(prior >= 0 && steps[prior].stage!.show.includes(who))
        )
          standing.arrive = [...(standing.arrive ?? []), who];
        continue;
      }
      // The writer brings them on nearby: where the words say they arrive, they walk on.
      const bringing = nearby.find((s) => s.stage!.show.includes(who));
      if (bringing) {
        if (!passage.said)
          bringing.stage!.arrive = [...(bringing.stage!.arrive ?? []), who];
        continue;
      }
      const show = [...(standing?.show ?? []), who];
      if (show.length > MAX_ON_STAGE) continue;
      stage = standing
        ? {
            ...base(standing),
            layout: fitLayout(
              standing.layout === 'one' ? 'row' : standing.layout,
              show.length,
            ),
            show,
          }
        : { layout: 'one', show, arrows: [] };
      if (passage.said) stage.cutIn = [who];
      else stage.arrive = [who];
      // They stay among the people the writer shows after, until they go.
      for (const later of steps) {
        const s = later.stage;
        if (
          !s ||
          keyOf(later) <= at ||
          (until !== undefined && keyOf(later) >= until) ||
          s.show.includes(who) ||
          s.show.length >= MAX_ON_STAGE ||
          !s.show.some((id) => characters.has(id))
        )
          continue;
        later.stage = {
          ...s,
          layout: fitLayout(
            s.layout === 'one' ? 'row' : s.layout,
            s.show.length + 1,
          ),
          show: [...s.show, who],
        };
      }
    }
    steps.splice(k + 1, 0, {
      at: { beat: passage.beat, phrase },
      word,
      stage,
      effects: [],
    });
    mended.push(
      passage.said
        ? `${who} is shown as they speak, at "${phrase}"`
        : `${who} ${how === 'leave' ? 'leaves' : 'comes'} at "${phrase}", as the words say`,
    );
  }
}

/** What a mend holds a writer's draft to. */
export interface MendOptions {
  /** The page, to hold a quotation to its own words. */
  material?: string;
  /** The formats the document may use; a kind of another is set in type. */
  formats?: readonly SceneFormat[];
  /** The story's characters, when the book is a story: who a character may be. */
  characters?: readonly {
    id: string;
    name: string;
    aliases: string[];
    /** The voice they speak in: whether "she" or "he" may mean them. */
    voice?: StoryVoice | null;
    /** What they are like: how they move. */
    traits?: string[];
    /** Whether they are seen, or only heard: a voice never stands on the stage. */
    presence?: StoryPresence | null;
    /** A group is a crowd, never one of the stage's things. */
    kind?: StoryKind | null;
  }[];
  /** And its places: where the story may be. */
  places?: readonly {
    id: string;
    name: string;
    aliases: string[];
    sound?: SceneAmbience | null;
    /** How it looks, when the story says: a fire burning, a river. */
    look?: string | null;
  }[];
  /** Whom the document is for: its recipe's limits hold. */
  stage?: LearningStage | null;
  /** A crowd is behind the stage: a group speaks from it, not from off the stage. */
  crowd?: boolean;
  /**
   * Where the story has the page's people, when some are apart from the
   * rest (Sally in the cave, the boys beside it): where the page happens,
   * and each character's place, by the story's ids.
   */
  whereabouts?: {
    place: string | null;
    people: Readonly<Record<string, string>>;
  } | null;
}

/** What mending a cast needs to know and where it says what it did. */
interface CastMend {
  formats: ReadonlySet<SceneFormat>;
  recipe: StageRecipe | null;
  mended: string[];
  problems: string[];
}

/**
 * The writer's cast made sound: ids safe and unique, a story's characters
 * and places the story's own, people drawn by the kit, code things set,
 * drawings with briefs the artist can draw. With every way the writer
 * might refer to each thing.
 */
export function mendCast(
  given: SceneScriptDraft['cast'],
  options: MendOptions,
  { formats, recipe, mended, problems }: CastMend,
): {
  cast: SceneThing[];
  byId: Map<string, SceneThing>;
  resolve: (ref: string) => string | null;
} {
  // Ids: safe, unique, and every way the writer might refer to one.
  const idFor = new Map<string, string>();
  const used = new Set<string>();
  const cast: SceneThing[] = [];
  given.forEach((given, index) => {
    // A person the story knows is its character, drawn once for the book.
    const known =
      given.kind === 'person' && options.characters?.length
        ? storyEntry(
            options.characters,
            given.ref ?? given.id,
            clean(given.name) || clean(given.id),
          )
        : null;
    const raw = known
      ? { ...given, kind: 'character' as const, ref: known.id }
      : given;
    let id = slug(raw.id) || `thing-${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    idFor.set(raw.id, id);
    idFor.set(raw.id.toLowerCase(), id);
    idFor.set(slug(raw.id), id);
    const name = clean(raw.name) || clean(raw.id);
    if (raw.kind === 'stat') {
      const value = clean(raw.value);
      if (value) {
        cast.push({ id, kind: 'stat', value, caption: name });
        return;
      }
      mended.push(`${id}: a number with no value is set as words`);
      cast.push({ id, kind: 'words', text: name, style: 'keyword' });
      return;
    }
    if (raw.kind === 'words') {
      cast.push({
        id,
        kind: 'words',
        text: name,
        style: raw.style === 'title' ? 'title' : 'keyword',
      });
      return;
    }
    if (isCodeThing(raw)) {
      const made = codeThing(
        id,
        raw,
        name,
        formats,
        options.material,
        options.stage === 'early',
      );
      mended.push(...made.mended);
      problems.push(...made.problems);
      cast.push(made.thing);
      return;
    }
    // A story's place drawn as a picture is the place: the scene behind
    // the stage, painted once for the book.
    const asPlace =
      raw.kind === 'drawing' && options.places?.length
        ? storyEntry(options.places, raw.ref ?? raw.id, name)
        : null;
    if (asPlace)
      mended.push(
        `${id}: the story's place ${asPlace.id}, set behind the stage`,
      );
    if (raw.kind === 'place' || asPlace) {
      const where = asPlace ?? storyEntry(options.places ?? [], raw.ref, name);
      // One set a place; a place the story does not have is left out.
      const again = where
        ? cast.find((thing) => thing.kind === 'place' && thing.ref === where.id)
        : undefined;
      if (!where || again) {
        used.delete(id);
        for (const key of [raw.id, raw.id.toLowerCase(), slug(raw.id)])
          if (again) idFor.set(key, again.id);
          else idFor.delete(key);
        if (!where)
          mended.push(
            `${id}: "${raw.ref ?? name}" is not one of the story's places; left out`,
          );
        return;
      }
      cast.push({
        id,
        kind: 'place',
        ref: where.id,
        name: where.name,
        // What it sounds like; when the story did not say, from how it looks.
        sound: where.sound ?? soundIn(where.look ?? ''),
      });
      return;
    }
    if (raw.kind === 'character') {
      if (known) mended.push(`${id}: the story's character ${known.id}`);
      const who = storyEntry(options.characters ?? [], raw.ref, name);
      if (!who) {
        mended.push(
          `${id}: "${raw.ref ?? name}" is not one of the story's characters; set in type`,
        );
        cast.push({ id, kind: 'words', text: name, style: 'keyword' });
        return;
      }
      // One figure a character: a second of them is the first again.
      const again = cast.find(
        (thing) => thing.kind === 'character' && thing.ref === who.id,
      );
      if (again) {
        used.delete(id);
        for (const key of [raw.id, raw.id.toLowerCase(), slug(raw.id)])
          idFor.set(key, again.id);
        return;
      }
      cast.push({
        id,
        kind: 'character',
        ref: who.id,
        name: who.name,
        state: isFace(raw.state) ? raw.state : null,
        met: 0,
        intro: [],
        ...postureOf(id, raw, 1, mended),
      });
      return;
    }
    if (raw.kind === 'person') {
      if (!raw.figure)
        mended.push(`${id}: a person with no figure, drawn plainly`);
      const count = Math.min(
        MOST_TOGETHER,
        Math.max(1, Math.round(Number(raw.count)) || 1),
      );
      // What the writer left out of how they are placed and what they go
      // through, their caption may say: "Seizure: shaking" shakes.
      const read = doingIn(name);
      cast.push({
        id,
        kind: 'person',
        name,
        // What the writer left out is chosen by their name, not plain.
        figure: figureOf(raw.figure, figureFor(id)),
        ...(count > 1 ? { count } : {}),
        ...postureOf(
          id,
          {
            pose: raw.pose || read.pose,
            signs: raw.signs?.length ? raw.signs : read.signs,
            holding: raw.holding || read.holding,
          },
          count,
          mended,
        ),
        state: isFace(raw.state) ? raw.state : null,
      });
      return;
    }
    // A drawing that is someone ("Person", "Sick child", "Scott's team")
    // is a person, drawn by the kit like everyone else.
    // Not one whose named parts are inside a body: that is a diagram.
    const someone =
      raw.kind === 'drawing' &&
      (raw.parts ?? []).every((part) =>
        (SHEET_PARTS as readonly string[]).includes(idKey(part.name)),
      ) &&
      !(raw.states ?? []).length
        ? someoneIn(name)
        : null;
    if (someone) {
      mended.push(`${id}: "${name}" is someone; drawn as a person`);
      cast.push({
        id,
        kind: 'person',
        name,
        figure: figureFor(id, someone.dressed),
        ...(someone.count > 1 ? { count: someone.count } : {}),
        ...postureOf(
          id,
          doingIn(`${name}. ${clean(raw.brief)}`),
          someone.count,
          mended,
        ),
        state: null,
      });
      return;
    }
    const asked = clean(raw.brief);
    // A drawing about someone ("A patient in a hospital bed…", "A simple
    // outline of a person…") is them, drawn by the kit: what else the
    // brief asks for is left to the voice.
    const about = raw.kind === 'drawing' && !someone ? personIn(asked) : null;
    if (about) {
      mended.push(`${id}: its brief is about someone; drawn as a person`);
      cast.push({
        id,
        kind: 'person',
        name,
        figure: figureFor(id, about.dressed),
        ...(about.count > 1 ? { count: about.count } : {}),
        // What the brief says they do and go through: a shake, a fever, a
        // book in hand. The rest it asks for is left to the voice.
        ...postureOf(id, doingIn(`${name}. ${asked}`), about.count, mended),
        state: about.face,
      });
      return;
    }
    // The artist draws no one: people stand beside a drawing, as persons.
    const brief =
      asked && mentionsPeople(asked) ? `${asked} ${LEAVE_PEOPLE_OUT}` : asked;
    if (brief !== asked)
      mended.push(
        `${id}: its brief mentions people; the artist leaves them out`,
      );
    // And the writer, told which drawing asks for someone, shows them as
    // people when it writes the page again.
    const wanted = asked ? peopleAskedFor(asked) : null;
    if (wanted)
      problems.push(
        `The drawing "${raw.id}" asks the artist for people ("${wanted}"), and the artist draws no one: show each person as a person (a pose for how they are placed, "in bed" for someone in bed; signs for what they go through, shown at the words; count for a few), with a face that fits, and let drawings show only things.`,
      );
    if (!brief) {
      problems.push(`The drawing "${raw.id}" has no brief: say what to draw.`);
      cast.push({ id, kind: 'words', text: name, style: 'keyword' });
      return;
    }
    const seen = new Set<string>();
    const parts = (raw.parts ?? [])
      .map((part) => ({ name: clean(part.name), label: Boolean(part.label) }))
      .filter((part) => {
        const key = idKey(part.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_PARTS);
    // A child reads two labels on a drawing, a student more: the rest stay
    // parts the voice can point at, unlabelled.
    let labelled = 0;
    for (const part of parts)
      if (part.label && ++labelled > (recipe?.labels ?? MAX_PARTS)) {
        part.label = false;
        mended.push(`${id}: "${part.name}" unlabelled, for these learners`);
      }
    const states = (raw.states ?? [])
      .map((state) => ({ name: clean(state.name), look: clean(state.look) }))
      .filter((state) => {
        const key = idKey(state.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_STATES);
    cast.push({
      id,
      kind: 'drawing',
      name,
      brief,
      motion: clean(raw.motion),
      parts,
      states,
      shape:
        raw.shape && DRAWING_SHAPES.includes(raw.shape) ? raw.shape : 'square',
      sound:
        raw.sound && SCENE_AMBIENCES.includes(raw.sound) ? raw.sound : null,
    });
  });
  const byId = new Map(cast.map((thing) => [thing.id, thing]));
  const resolve = (ref: string): string | null =>
    idFor.get(ref) ??
    idFor.get(ref.toLowerCase()) ??
    idFor.get(slug(ref)) ??
    (byId.has(slug(ref)) ? slug(ref) : null);
  return { cast, byId, resolve };
}

/**
 * The writer's draft made sound without asking again: ids made safe and
 * unique, unknown ids dropped, a lost anchor found in another sentence or
 * put at its sentence's start, a stage trimmed to what its layout holds,
 * extra drawings set in type. What cannot be mended is a problem for the
 * one repair call.
 */
export function mendScript(
  draft: SceneScriptDraft,
  options: MendOptions = {},
): MendedScript {
  const recipe = options.stage ? STAGE_RECIPES[options.stage] : null;
  const problems: string[] = [];
  const mended: string[] = [];
  const formats = new Set(options.formats ?? SCENE_FORMATS);

  const kept = draft.beats.filter(
    (beat) => wordsOf(clean(beat.say)).length > 0,
  );
  const beats: SceneBeat[] = kept.map((beat, index) => ({
    say: clean(beat.say),
    pause: beat.pause === 'long' ? ('long' as const) : ('short' as const),
    delivery: SCENE_DELIVERIES.includes(beat.delivery)
      ? beat.delivery
      : ('explain' as const),
    ...musicOf(beat, kept[index + 1], !!options.characters?.length),
  }));

  // The cast: every thing made sound, and every way the writer might refer to one.
  const { cast, byId, resolve } = mendCast(draft.cast, options, {
    formats,
    recipe,
    mended,
    problems,
  });

  // Who each sentence quotes: one of the story's characters in the cast.
  const speakerOf = (said: string): string | null => {
    const id = resolve(said);
    if (id && byId.get(id)?.kind === 'character') return id;
    // Named as the story names them: by name or alias.
    const who = storyEntry(options.characters ?? [], said, said);
    const thing = who
      ? cast.find((t) => t.kind === 'character' && t.ref === who.id)
      : undefined;
    return thing?.id ?? null;
  };
  kept.forEach((raw, k) => {
    const said = clean(raw.speaker);
    if (!said) return;
    const id = speakerOf(said);
    if (id) beats[k].speaker = id;
    else
      mended.push(
        `sentence ${k + 1}: "${said}" is not one of the story's characters`,
      );
  });

  // Anchors: the phrase in its sentence, or in the one sentence it is
  // really in, or the sentence's start.
  let lost = 0;
  const lostWhere: string[] = [];
  const anchored = draft.steps.map((raw, index) => {
    const beat = Math.min(
      Math.max(0, Math.round(raw.beat)),
      Math.max(0, beats.length - 1),
    );
    const phrase = clean(raw.phrase);
    let at = {
      beat,
      word: beats.length ? phraseAt(beats[beat].say, phrase) : -1,
    };
    if (at.word < 0 && phrase) {
      const elsewhere = beats
        .map((b, i) => ({ beat: i, word: phraseAt(b.say, phrase) }))
        .filter((found) => found.word >= 0);
      if (elsewhere.length) {
        // Nearest to the sentence it was put in.
        elsewhere.sort(
          (a, b) => Math.abs(a.beat - beat) - Math.abs(b.beat - beat),
        );
        at = elsewhere[0];
        mended.push(
          `step ${index + 1}: "${phrase}" is in sentence ${at.beat + 1}, not ${beat + 1}`,
        );
      }
    }
    if (at.word < 0) {
      lost += 1;
      lostWhere.push(`step ${index + 1} ("${phrase}" in sentence ${beat + 1})`);
      at = { beat, word: 0 };
    }
    return { raw, index, beat: at.beat, word: at.word, phrase };
  });
  // In spoken order; steps on the same word keep the writer's order.
  anchored.sort(
    (a, b) => a.beat - b.beat || a.word - b.word || a.index - b.index,
  );

  const steps: SceneStep[] = [];
  let onStage: string[] = [];
  for (const one of anchored) {
    const { raw } = one;
    let stage: SceneStage | null = null;
    if (raw.layout && raw.show?.length) {
      const show: string[] = [];
      // A place shown is the scene behind the stage, not a thing on it.
      let backdrop: string | undefined;
      for (const ref of raw.show) {
        const id = resolve(ref);
        if (!id) {
          mended.push(
            `step ${one.index + 1}: nothing in the cast is called "${ref}"`,
          );
          continue;
        }
        if (byId.get(id)?.kind === 'place') backdrop = id;
        else if (!show.includes(id)) show.push(id);
      }
      // A place alone: the empty scene, before anyone is in it. Once
      // people are on the stage, it is the scene changing behind them:
      // they stay.
      const standing = [...steps].reverse().find((s) => s.stage)?.stage;
      if (!show.length && backdrop && onStage.length && standing) {
        stage = { ...standing, backdrop };
        mended.push(
          `step ${one.index + 1}: the place goes behind who is on the stage`,
        );
      } else if (!show.length && backdrop) {
        stage = { layout: 'one', show: [], arrows: [], backdrop };
        onStage = [];
      }
      if (show.length > MAX_ON_STAGE) {
        mended.push(
          `step ${one.index + 1}: ${show.length} things on the stage, ${MAX_ON_STAGE} kept`,
        );
        show.splice(0, show.length - MAX_ON_STAGE);
      }
      if (show.length) {
        const layout = fitLayout(
          SCENE_LAYOUTS.includes(raw.layout) ? raw.layout : 'row',
          show.length,
        );
        if (layout !== raw.layout)
          mended.push(
            `step ${one.index + 1}: ${raw.layout} does not hold ${show.length}; ${layout} instead`,
          );
        const arrows: SceneArrow[] = [];
        for (const arrow of raw.arrows ?? []) {
          const from = resolve(arrow.from);
          const to = resolve(arrow.to);
          if (!from || !to || from === to) continue;
          if (!show.includes(from) || !show.includes(to)) continue;
          if (arrows.some((a) => a.from === from && a.to === to)) continue;
          arrows.push({
            from,
            to,
            label: clean(arrow.label) || null,
            flow: Boolean(arrow.flow),
          });
        }
        stage = {
          layout,
          show,
          arrows: arrows.slice(0, MAX_ARROWS),
          ...(backdrop ? { backdrop } : {}),
        };
        // The stage restated as it stands is no change: its effects only.
        const last = [...steps].reverse().find((s) => s.stage)?.stage;
        if (
          last &&
          !backdrop &&
          last.layout === stage.layout &&
          last.show.join() === stage.show.join() &&
          last.arrows.map((a) => `${a.from}>${a.to}`).join() ===
            stage.arrows.map((a) => `${a.from}>${a.to}`).join()
        ) {
          mended.push(
            `step ${one.index + 1}: the stage as it stands, restated`,
          );
          stage = null;
        }
        onStage = show;
      }
    }
    const effects: SceneEffect[] = [];
    for (const effect of raw.effects ?? []) {
      const found = effectOf(effect, resolve, byId, onStage);
      if (typeof found === 'string')
        mended.push(`step ${one.index + 1}: ${found}`);
      else effects.push(found);
    }
    if (!stage && !effects.length) continue;
    steps.push({
      at: { beat: one.beat, phrase: one.phrase },
      word: one.word,
      stage,
      effects,
    });
  }

  // Who says each quoted line: the story's characters on the page, found
  // in the sentences' own words, the writer's speakers and "say"s only a
  // hint. Each line is said in its speaker's voice and shown in its own
  // bubble; a "say" on the stage is no longer needed for either.
  const speaking: Actor[] = cast.flatMap((thing) => {
    if (thing.kind !== 'character') return [];
    const who = (options.characters ?? []).find((c) => c.id === thing.ref);
    return who
      ? [
          {
            id: thing.id,
            names: [who.name, ...who.aliases, thing.name],
            gender: genderOf(who.voice),
          },
        ]
      : [];
  });
  if (speaking.length) {
    const given = new Map<number, string[]>();
    beats.forEach((beat, k) => {
      if (beat.speaker) given.set(k, [beat.speaker]);
    });
    for (const step of steps)
      for (const effect of step.effects)
        if (effect.do === 'say')
          given.set(step.at.beat, [
            ...(given.get(step.at.beat) ?? []),
            effect.target,
          ]);
    for (const line of dialogueOf(
      beats.map((beat) => beat.say),
      speaking,
      given,
    ))
      (beats[line.beat].lines ??= []).push({
        span: line.span,
        speaker: line.speaker,
      });
    beats.forEach((beat) => {
      if (beat.lines?.length) beat.speaker = beat.lines[0].speaker;
    });
  }
  for (const step of steps)
    step.effects = step.effects.filter((effect) => effect.do !== 'say');

  // What the narration says the characters do, acted where it says it;
  // and who comes and goes, walking on and off at its words.
  // The things the page's words set on the stage: bread, a cup.
  const props = options.characters?.length
    ? propsIn([...beats.map((beat) => beat.say), options.material ?? ''])
    : [];
  if (speaking.length) {
    const { acts, passages, business } = directionsIn(
      beats.map((beat) => beat.say),
      speaking,
      cast.flatMap((thing) =>
        thing.kind !== 'character' &&
        thing.kind !== 'place' &&
        'name' in thing &&
        thing.name
          ? [{ id: thing.id, names: [thing.name] }]
          : [],
      ),
      new Map(
        beats.flatMap((beat, k) =>
          beat.lines?.length ? [[k, beat.lines] as const] : [],
        ),
      ),
      props,
    );
    for (const { beat, ...act } of acts) (beats[beat].acts ??= []).push(act);
    for (const { beat, ...one } of business)
      (beats[beat].business ??= []).push(one);
    const said = speakersIn(
      beats.map((beat) => beat.say),
      new Map(
        beats.flatMap((beat, k) =>
          beat.lines?.length ? [[k, beat.lines] as const] : [],
        ),
      ),
    );
    comingsAndGoings(
      steps,
      [...passages, ...said].sort((a, b) => a.beat - b.beat || a.at - b.at),
      beats,
      new Set(speaking.map((one) => one.id)),
      mended,
    );
  }
  steps.splice(
    0,
    steps.length,
    ...steps.filter((step) => step.stage || step.effects.length),
  );

  // A sign the storyboard first shows at the words comes on then, not
  // before, whether the writer listed it or a caption said it: "Person
  // shaking", shaking shown as the voice says it starts. One first
  // hidden was on from the start.
  for (const thing of cast) {
    if ((thing.kind !== 'person' && thing.kind !== 'character') || !thing.signs)
      continue;
    const first = new Map<string, SceneEffectKind>();
    for (const step of steps)
      for (const effect of step.effects)
        if (
          effect.target === thing.id &&
          effect.part &&
          !first.has(effect.part) &&
          (effect.do === 'show' || effect.do === 'hide')
        )
          first.set(effect.part, effect.do);
    const kept = thing.signs.filter((sign) => first.get(sign) !== 'show');
    if (kept.length < thing.signs.length)
      mended.push(
        `${thing.id}: ${thing.signs.filter((sign) => !kept.includes(sign)).join(', ')} on at the words that show it, not before`,
      );
    if (kept.length) thing.signs = kept;
    else delete thing.signs;
  }

  if (draft.fit !== 'poor') {
    if (beats.length < 3)
      problems.push(
        `There are ${beats.length} sentences; a page needs at least three.`,
      );
    if (!steps.some((step) => step.stage))
      problems.push('The storyboard never puts anything on the stage.');
    if (lost > Math.max(1, draft.steps.length / 3))
      problems.push(
        `These phrases are not in their sentences, word for word: ${lostWhere.slice(0, 6).join('; ')}. Copy each phrase exactly from the sentence it names.`,
      );
    // A story whose characters speak on this page keeps their words in
    // quotes, with who says them: then they say them in their own voices,
    // in bubbles, their mouths moving. Told as reported speech, everyone
    // is the narrator.
    if (options.material && speaking.length) {
      const there = options.material
        .split(/\n+/)
        .flatMap((line) => quotedSpans(line).map(([a, b]) => line.slice(a, b)));
      const here = beats.reduce((n, beat) => n + (beat.lines?.length ?? 0), 0);
      if (there.length >= 2 && here < Math.min(2, Math.ceil(there.length / 4)))
        problems.push(
          `The story's characters speak on this page ("${there[0].slice(0, 60)}"), but ${here ? `only ${here} of your sentences quotes them` : 'your sentences quote no one'}: keep what they say in double quotes, word for word, in the sentence with who says it, so each line is said in its speaker's voice.`,
        );
    }
    const spoken = beats.reduce((n, beat) => n + beat.say.length, 0);
    if (spoken > MAX_SPOKEN_CHARS)
      problems.push(
        `The narration is ${spoken} characters; keep it under ${MAX_SPOKEN_CHARS}.`,
      );
    // Far past what these learners take in: back, with their numbers. A
    // little over is let be; a retry costs the writer once more.
    if (recipe) {
      const words = beats.map((beat) => wordsOf(beat.say).length);
      const total = words.reduce((a, b) => a + b, 0);
      // Working takes the words to walk through it: a few more for each line.
      const working = cast.reduce(
        (n, thing) => n + (thing.kind === 'math' ? thing.lines.length * 20 : 0),
        0,
      );
      if (total > recipe.spoken[1] * 1.3 + Math.min(160, working))
        problems.push(
          `The narration is ${total} spoken words; these learners take ${recipe.spoken[0]} to ${recipe.spoken[1]}. Say less, keeping the main ideas.`,
        );
      const long = words.filter((n) => n > recipe.sentence[1] * 1.3).length;
      if (long > Math.max(1, words.length / 4))
        problems.push(
          `${long} sentences run over ${Math.round(recipe.sentence[1] * 1.3)} words; these learners take sentences of ${recipe.sentence[0]} to ${recipe.sentence[1]}. Split them.`,
        );
    }
    const drawings = cast.filter((thing) => thing.kind === 'drawing');
    if (drawings.length > MAX_DRAWINGS) {
      // The ones on stage longest keep their drawings; the rest are set in type.
      const firstSeen = (id: string) => {
        const at = steps.findIndex((step) => step.stage?.show.includes(id));
        return at < 0 ? Number.POSITIVE_INFINITY : at;
      };
      const keep = new Set(
        [...drawings]
          .sort((a, b) => firstSeen(a.id) - firstSeen(b.id))
          .slice(0, MAX_DRAWINGS)
          .map((thing) => thing.id),
      );
      cast.forEach((thing, index) => {
        if (thing.kind === 'drawing' && !keep.has(thing.id)) {
          cast[index] = {
            id: thing.id,
            kind: 'words',
            text: thing.name,
            style: 'keyword',
          };
          mended.push(
            `${thing.id}: more than ${MAX_DRAWINGS} drawings; set in type`,
          );
        }
      });
    }
  }

  // Arrows read forward: left to right along a row, down a stack. Then a
  // list the voice reads out comes on stage item by item, as it is said,
  // beside what is shown as it now stands.
  // A stage that brings on several things at once brings each on as the
  // voice names it: the picture built up a thing at a time.
  if (draft.fit !== 'poor') buildUp(beats, cast, steps, mended);
  flowForward(steps, mended);
  if (draft.fit !== 'poor') showSpokenLists(beats, cast, steps, mended);
  // The camera goes in close only on what the voice is talking about.
  zoomsOnWhatIsSaid(beats, cast, steps, mended);

  return {
    script: {
      fit: draft.fit === 'poor' ? 'poor' : 'good',
      fitReason: clean(draft.fitReason) || null,
      title: clean(draft.title).slice(0, 80) || 'This page',
      mood: SCENE_MOODS.includes(draft.mood) ? draft.mood : 'curious',
      beats,
      cast: cast.filter((thing) =>
        steps.some(
          (step) =>
            step.stage?.show.includes(thing.id) ||
            step.stage?.backdrop === thing.id,
        ),
      ),
      steps,
      ...(props.length ? { props } : {}),
    },
    problems,
    mended,
  };
}

/** What the artist is told when a drawing's brief mentions people. */
export const LEAVE_PEOPLE_OUT =
  'Draw no person in it: no figure, silhouette, pictogram or stick figure of anyone; people are drawn separately, beside it. Only a body part close up is fine, or the outline of a body when the drawing is about the organs inside it.';

/**
 * Who a drawing's name can say it is, as its last word: one, or a few
 * together. Only words that mean people wherever they are said: not
 * "adult" (a mosquito's is one), "worker" (an ant), "group" (a blood
 * group), "class" or "family" (of drugs, of proteins).
 */
const ONE_OF_US = [
  'person',
  'man',
  'woman',
  'boy',
  'girl',
  'child',
  'kid',
  'baby',
  'patient',
  'doctor',
  'nurse',
  'farmer',
  'builder',
  'teacher',
  'student',
  'pupil',
  'scientist',
  'explorer',
  'soldier',
  'mother',
  'father',
  'parent',
  'grandmother',
  'grandfather',
  'someone',
  'human',
  'teenager',
  'villager',
  'traveller',
  'traveler',
  'hunter',
  'fisherman',
  'merchant',
  'chef',
  'pilot',
];
const A_FEW = [
  'people',
  'men',
  'women',
  'boys',
  'girls',
  'children',
  'kids',
  'patients',
  'doctors',
  'nurses',
  'farmers',
  'builders',
  'teachers',
  'students',
  'pupils',
  'scientists',
  'explorers',
  'soldiers',
  'parents',
  'grandparents',
  'humans',
  'teenagers',
  'villagers',
  'travellers',
  'travelers',
  'hunters',
  'fishermen',
  'merchants',
  'team',
  'crew',
];
const SOMEONE_WORDS = new Map<string, number>([
  ...ONE_OF_US.map((word): [string, number] => [word, 1]),
  ...A_FEW.map((word): [string, number] => [word, 3]),
  ['crowd', 4],
]);

/** How a word dresses someone, or says how old they are. */
const DRESSED: [RegExp, Partial<FigureSpec>][] = [
  [
    /\b(child|children|kids?|boys?|girls?|baby|babies|pupils?)\b/,
    { age: 'child' },
  ],
  [/\b(teen|teens|teenagers?|adolescents?)\b/, { age: 'teen' }],
  [/\b(old|elderly|aged|grand(mother|father|parents?)s?)\b/, { age: 'elder' }],
  [/\b(doctors?|nurses?)\b/, { top: 'lab coat', extras: ['stethoscope'] }],
  [/\b(scientists?|chemists?|lab)\b/, { top: 'lab coat', extras: ['glasses'] }],
  [/\b(soldiers?|guards?|police)\b/, { top: 'uniform', headwear: 'helmet' }],
  [/\b(builders?|workers?)\b/, { top: 'jacket', headwear: 'hard hat' }],
  [/\b(farmers?)\b/, { top: 'apron', headwear: 'sun hat' }],
  [/\b(explorers?|crew)\b/, { top: 'coat', headwear: 'beanie' }],
  [/\b(students?|pupils?)\b/, { top: 'jumper', extras: ['backpack'] }],
  [/\b(kings?|queens?|emperors?)\b/, { top: 'robe', headwear: 'crown' }],
  [/\b(chefs?)\b/, { top: 'apron' }],
  [/\b(patients?)\b/, { top: 't-shirt' }],
];

/**
 * Whether a drawing's name says it is someone: its last word a person, or
 * a few together ("Person", "Sick child", "Amundsen's team"), and not
 * something of theirs ("Person's lungs"). How they are dressed follows
 * from the name's words.
 */
export function someoneIn(
  name: string,
): { count: number; dressed: Partial<FigureSpec> } | null {
  const words = name
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
  const count = SOMEONE_WORDS.get(words[words.length - 1] ?? '');
  if (!count) return null;
  const said = words.join(' ');
  const dressed: Partial<FigureSpec> = {};
  for (const [pattern, patch] of DRESSED)
    if (pattern.test(said)) Object.assign(dressed, patch);
  return { count, dressed };
}

/** A brief's first words when it is about someone: "A patient…", "Two people…", "A simple outline of a person…". */
const ABOUT_SOMEONE =
  /^(?:(?:a|an|the|one|two|three|four|several|some|many)\s+)?(?:(?:simple|cartoon|small|young|old|elderly|sick|ill|tired|weak|healthy|infected|little|happy|sad|worried|pale|thin|sleeping|unconscious|feverish|coughing|typical|generic|faceless|grey|gray|dark)\s+)*(?:(?:outline|silhouette|figure|drawing|picture|illustration|cartoon|image|sketch|depiction)\s+of\s+(?:(?:a|an|the|two|three|several)\s+)?(?:(?:sick|tired|weak|young|old|healthy|infected)\s+)*)?(persons?|people|patients?|man|men|woman|women|boys?|girls?|child|children|kids?|doctors?|nurses?|farmers?|students?|teachers?|scientists?|soldiers?|explorers?|someone|human figures?|stick figures?|family|crowd)\b(?!['’]s)/i;

/** How someone a brief is about feels, from its words. */
const FEELINGS: [RegExp, FigureFace][] = [
  [/\b(happy|smiling|healthy|well|cheerful|relieved|laughing)\b/, 'happy'],
  [
    /\b(in pain|pain(?:ful)?|hurts?|hurting|aching|agony|headaches?|migraines?)\b/,
    'pain',
  ],
  [/\b(afraid|scared|frightened|worried|anxious|bitten)\b/, 'afraid'],
  [/\b(surprised|shocked|amazed)\b/, 'surprised'],
  [/\b(angry|cross|furious)\b/, 'angry'],
  [/\b(thinking|confused|puzzled|wondering)\b/, 'thinking'],
  [
    /\b(sick|ill|tired|weak|sad|unwell|feverish|fever|coma|unresponsive|dying|exhausted|sleepy|drowsy|waking|pale|sunken)\b/,
    'sad',
  ],
];

/**
 * Whether a brief is about someone rather than a thing: its first words
 * a person ("A patient in a hospital bed…", "A simple outline of a person
 * looking tired…", "Two people…"), and not something of theirs ("A
 * person's lungs", "A doctor's hand"). How many, how they feel and how
 * they are dressed follow from the brief's words; what they are doing,
 * from doingIn.
 */
export function personIn(brief: string): {
  count: number;
  face: FigureFace | null;
  dressed: Partial<FigureSpec>;
} | null {
  const found = ABOUT_SOMEONE.exec(brief.trim());
  if (!found) return null;
  const said = brief.toLowerCase();
  const word = found[1].toLowerCase();
  const many = /^(two|three|four|several|some|many)\b/i.exec(brief.trim())?.[1];
  const count =
    word === 'crowd'
      ? 4
      : many
        ? Math.min(
            MOST_TOGETHER,
            { two: 2, three: 3, four: 4 }[many.toLowerCase()] ?? 3,
          )
        : /s$|people|men$|women|children|family/.test(word) &&
            word !== 'someone'
          ? 3
          : 1;
  const dressed: Partial<FigureSpec> = {};
  for (const [pattern, patch] of DRESSED)
    if (pattern.test(said)) Object.assign(dressed, patch);
  return {
    count,
    face: FEELINGS.find(([pattern]) => pattern.test(said))?.[1] ?? null,
    dressed,
  };
}

/**
 * The words in a brief that ask for someone to be drawn ("a patient
 * lying in bed", "two people"), not for something of theirs ("a
 * person's lungs", "a doctor's hand"): what the writer is told to show
 * as people instead. Null when it asks for no one.
 */
export function peopleAskedFor(brief: string): string | null {
  const found = [
    ...brief.matchAll(
      /\b(persons?|people|man|men|woman|women|boys?|girls?|child|children|kids?|patients?|doctors?|nurses?|farmers?|workers?|teachers?|students?|scientists?|explorers?|soldiers?|someone|stick figures?|silhouettes? of (?:a |an )?(?:person|man|woman|child))\b(?!['’]s)/gi,
    ),
  ].find((one) => !denied(brief, one.index));
  if (!found) return null;
  // The words round it, to name it to the writer.
  const from = Math.max(
    0,
    brief.lastIndexOf(' ', Math.max(0, found.index - 12)),
  );
  return brief.slice(from, found.index + found[0].length + 24).trim();
}

/** The words that say what someone is going through, and the signs that show it. */
const SIGN_WORDS: [RegExp, FigureSign[]][] = [
  [
    /\b(shak(?:e|es|ing)(?! hands)|convuls\w*|jerk(?:s|ing|ed)?|twitch\w*|spasms?)\b/,
    ['shaking'],
  ],
  [/\b(shiver\w*|chills?|freezing|trembl\w*)\b/, ['shivering']],
  [/\b(dizz\w*|faint(?:s|ing|ed)?|vertigo|light-?headed)\b/, ['dizzy']],
  [/\b(cough\w*|sneez\w*)\b/, ['coughing']],
  [
    /\b(asleep|sleep(?:s|ing|y)?|unconscious|coma|unresponsive|passed out|drowsy)\b/,
    ['sleeping'],
  ],
  [
    /\b(breathless\w*|out of breath|short(?:ness)? of breath|panting|gasping|wheez\w*)\b/,
    ['breathless'],
  ],
  [/\b(walk(?:s|ing)?(?! stick)|marching|strolling|hiking)\b/, ['walking']],
  [/\b(jump\w*|leap\w*|hopping|bouncing)\b/, ['jumping']],
  [/\b(headaches?|migraines?|head (?:hurts|pain|aches?))\b/, ['headache']],
  [/\b(chest (?:pain|hurts|tight\w*)|heart attack|angina)\b/, ['chest pain']],
  [
    /\b(stomach ?aches?|tummy ?aches?|belly ?aches?|stomach (?:pain|cramps?)|abdominal pain)\b/,
    ['stomach ache'],
  ],
  [/\b(fever\w*|high temperature|burning up)\b/, ['fever', 'sweating']],
  [/\b(sweat\w*)\b/, ['sweating']],
  [/\b(cry(?:ing)?|cries|tears|tearful|weep\w*|sobb\w*)\b/, ['tears']],
  [/\b(rash\w*|hives|itch\w*|blisters?|red spots)\b/, ['rash']],
  [/\b(nause\w*|queasy|vomit\w*|throw(?:s|ing)? up|feels? sick)\b/, ['nausea']],
  [/\b(confus\w*|disorient\w*|forgetful|memory loss)\b/, ['confused']],
  [
    /\b(an idea|eureka|realis(?:es|ing)|realiz(?:es|ing)|light ?bulb)\b/,
    ['idea'],
  ],
];
/** Tingling, and where: the hands, the feet, or both when the words say neither. */
const TINGLING =
  /\b(tingl\w*|numb\w*|pins and needles|prickl\w*|(?:altered|strange|odd|unusual|funny|weird) (?:sensations?|feelings?)|feel(?:s|ing)? (?:strange|odd|funny|weird))\b/;
const HANDS = /\b(hands?|arms?|fingers?|wrists?)\b/;
const FEET = /\b(feet|foot|legs?|toes?|ankles?)\b/;

/** The words that say how someone is placed. */
const POSE_WORDS: [RegExp, FigurePose][] = [
  [
    /\b(in (?:a |the |their |his |her )?(?:hospital )?bed|bedridden|bedside)\b/,
    'in bed',
  ],
  [/\b(lying|lies|laid|collapsed|fallen|on the (?:floor|ground))\b/, 'lying'],
  [
    /\b(headaches?|migraines?|holding (?:their|his|her|the) head|hand on (?:their|his|her|the) head)\b/,
    'hand on head',
  ],
  [
    /\b(stomach ?aches?|tummy ?aches?|belly ?aches?|stomach (?:pain|cramps?)|abdominal pain|holding (?:their|his|her) (?:stomach|belly|tummy))\b/,
    'hands on belly',
  ],
  [
    /\b(cough\w*|sneez\w*|yawn\w*|(?:hand over|covering) (?:their|his|her) mouth)\b/,
    'hand on mouth',
  ],
  [/\b(cheer\w*|celebrat\w*|arms (?:raised|up)|hands up|hooray)\b/, 'arms up'],
  [/\b(point(?:s|ing)(?: at| to)?)\b/, 'pointing'],
  [/\b(wav(?:e|es|ing)(?! a flag)|greet\w*|saying hello)\b/, 'waving'],
];

/** The words for what someone holds, after a word for holding it: "holding a book", "with a lantern". */
const HELD =
  /\b(?:holding|holds|carrying|carries|with|reading|reads|using|uses|taking|takes|showing|shows|waving|waves)\s+(?:(?:an?|the|some|their|his|her|a few)\s+)?(?:[a-z]+\s+)?(books?|textbooks?|notebooks?|phones?|smartphones?|mobile phones?|cups?|mugs?|glass of water|thermometers?|syringes?|injections?|needles?|pills?|tablets?|medicines?|medication|flags?|umbrellas?|magnifying glass|magnifiers?|bags?|handbags?|briefcases?|suitcases?|balls?|lanterns?|lamps?|torch|torches)\b/;
const PROP_WORDS: [RegExp, FigureProp][] = [
  [/^(books?|textbooks?|notebooks?)$/, 'book'],
  [/^(phones?|smartphones?|mobile phones?)$/, 'phone'],
  [/^(cups?|mugs?|glass of water)$/, 'cup'],
  [/^thermometers?$/, 'thermometer'],
  [/^(syringes?|injections?|needles?)$/, 'syringe'],
  [/^(pills?|tablets?|medicines?|medication)$/, 'pills'],
  [/^flags?$/, 'flag'],
  [/^umbrellas?$/, 'umbrella'],
  [/^(magnifying glass|magnifiers?)$/, 'magnifier'],
  [/^(bags?|handbags?|briefcases?|suitcases?)$/, 'bag'],
  [/^balls?$/, 'ball'],
  [/^(lanterns?|lamps?|torch|torches)$/, 'lantern'],
];

/**
 * What words about someone (a drawing's name and brief, a person's
 * caption) say they are doing and going through: the signs that show it,
 * how they are placed, what they hold. So someone turned from a drawing
 * into a person is never drawn standing still: "Seizure: shaking" shakes,
 * "tingling in the hands and feet" sparkles there, "holding a book"
 * holds one.
 */
export function doingIn(words: string): {
  signs: FigureSign[];
  pose: FigurePose | null;
  holding: FigureProp | null;
} {
  const said = words.toLowerCase().replace(/[’']/g, "'");
  const signs = new Set<FigureSign>();
  for (const [pattern, found] of SIGN_WORDS)
    if (pattern.test(said)) for (const sign of found) signs.add(sign);
  if (TINGLING.test(said)) {
    const hands = HANDS.test(said);
    const feet = FEET.test(said);
    if (hands || !feet) signs.add('tingling hands');
    if (feet || !hands) signs.add('tingling feet');
  }
  const held =
    HELD.exec(said)?.[1] ??
    (/\breading\b/.test(said)
      ? 'book'
      : /\bdrinking\b/.test(said)
        ? 'cup'
        : '');
  return {
    signs: FIGURE_SIGNS.filter((sign) => signs.has(sign)).slice(0, MAX_SIGNS),
    pose: POSE_WORDS.find(([pattern]) => pattern.test(said))?.[1] ?? null,
    holding: PROP_WORDS.find(([pattern]) => pattern.test(held))?.[1] ?? null,
  };
}

/** A value a model wrote, as the kit's lists write theirs: lower case, single spaces. */
const listWord = (value: unknown) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ')
    : '';

/**
 * A person's or a character's pose, signs and prop on a page, as the
 * writer gave them, made sound: only what is on the kit's lists; lying
 * down and in bed for one person, and no walk or jump there; at most
 * four signs. A prop needs a free hand, and one held with no pose for
 * it is held up.
 */
export function postureOf(
  id: string,
  raw: { pose?: unknown; signs?: unknown; holding?: unknown },
  count: number,
  mended: string[],
): { pose?: FigurePose; signs?: FigureSign[]; holding?: FigureProp } {
  const asked = listWord(raw.pose);
  let pose: FigurePose = (FIGURE_POSES as readonly string[]).includes(asked)
    ? (asked as FigurePose)
    : 'standing';
  if (asked && asked !== pose)
    mended.push(`${id}: no pose "${String(raw.pose)}"; standing`);
  if (count > 1 && LYING_POSES.includes(pose)) {
    mended.push(`${id}: a group stands; not ${pose}`);
    pose = 'standing';
  }
  const signs: FigureSign[] = [];
  for (const one of Array.isArray(raw.signs) ? raw.signs : []) {
    const sign = listWord(one);
    if (!(FIGURE_SIGNS as readonly string[]).includes(sign)) {
      mended.push(`${id}: no sign "${String(one)}"`);
      continue;
    }
    if (LYING_POSES.includes(pose) && ON_FOOT.includes(sign as FigureSign)) {
      mended.push(`${id}: ${pose}, so not ${sign}`);
      continue;
    }
    if (!signs.includes(sign as FigureSign)) signs.push(sign as FigureSign);
  }
  if (signs.length > MAX_SIGNS)
    mended.push(`${id}: ${signs.length} signs; the first ${MAX_SIGNS} kept`);
  const prop = listWord(raw.holding);
  let holding = (FIGURE_PROPS as readonly string[]).includes(prop)
    ? (prop as FigureProp)
    : undefined;
  if (prop && !holding) mended.push(`${id}: nothing called "${prop}" to hold`);
  if (holding && pose === 'standing') pose = 'holding';
  if (holding && !canHold(pose)) {
    mended.push(`${id}: no hand free for the ${holding}`);
    holding = undefined;
  }
  // Held up, with nothing in the hand: standing.
  if (!holding && pose === 'holding') pose = 'standing';
  return {
    ...(pose !== 'standing' ? { pose } : {}),
    ...(signs.length ? { signs: signs.slice(0, MAX_SIGNS) } : {}),
    ...(holding ? { holding } : {}),
  };
}

/**
 * Whether the words just before a place in a brief say there is none
 * there: "no person", "without people", "no face or person attached".
 */
function denied(brief: string, at: number): boolean {
  const before = brief.slice(Math.max(0, at - 40), at);
  return /\b(no|not|without|never|nor|none)\b[^.;:!?,]*$/i.test(before);
}

/** Whether a brief asks the artist for anyone. */
export function mentionsPeople(brief: string): boolean {
  return [
    ...brief.matchAll(
      /\b(persons?|people|man|men|woman|women|boys?|girls?|child|children|kids?|patients?|doctors?|nurses?|farmers?|workers?|teachers?|students?|scientists?|explorers?|soldiers?|family|families|crowds?|someone|stick figures?|human figures?|figures? of (a|an) (person|man|woman|child))\b/gi,
    ),
  ].some((one) => !denied(brief, one.index));
}

/** The story's character or place the writer means: by its id, else by a name or alias. */
export function storyEntry<
  T extends { id: string; name: string; aliases: string[] },
>(characters: readonly T[], ref: string | null, name: string): T | null {
  const byRef = characters.find((c) => c.id === clean(ref));
  if (byRef) return byRef;
  const keys = [clean(ref), name].map(nameKey).filter(Boolean);
  return (
    characters.find((c) =>
      [c.id, c.name, ...c.aliases].map(nameKey).some((k) => keys.includes(k)),
    ) ?? null
  );
}

/**
 * A thing code draws, made sound: working whose sums hold, a graph whose
 * function has values, a quotation that is the page's own words. One the
 * document's formats do not include is set in type instead.
 */
function codeThing(
  id: string,
  raw: SceneScriptDraft['cast'][number],
  name: string,
  formats: ReadonlySet<SceneFormat>,
  material: string | undefined,
  /** A young learner's page: a sum is shown as a picture too. */
  young = false,
): { thing: SceneThing; problems: string[]; mended: string[] } {
  const problems: string[] = [];
  const mended: string[] = [];
  const words = (why: string) => ({
    thing: {
      id,
      kind: 'words' as const,
      text: name || raw.id,
      style: 'keyword' as const,
    },
    problems,
    mended: [...mended, `${id}: ${why}; set in type`],
  });
  if (raw.kind === 'math') {
    // Working on any page that works a calculation: a law page's interest,
    // a biology page's dose, not only a maths book's.
    const lines = (raw.lines ?? [])
      .map((line) => ({
        latex: clean(line.latex),
        check: clean(line.check) || null,
      }))
      .filter((line) => line.latex)
      .slice(0, MAX_MATH_LINES);
    if (!lines.length) {
      problems.push(`The working "${raw.id}" has no lines.`);
      return words('working with no lines');
    }
    lines.forEach((line, k) => {
      if (!line.check) return;
      const checked = checkArithmetic(line.check);
      if (checked && !checked.holds)
        problems.push(
          `Line ${k + 1} of "${raw.id}" does not add up: ${line.check} (the left side is ${Number(checked.value.toPrecision(8))}). Put the sum right.`,
        );
    });
    // Every line checked as a working is: a line its problem's solution
    // does not satisfy goes back; the working on the stage stops before it.
    const verdicts = checkLines(
      lines.map((line) => line.latex.replace(/\\term\{[^{}]*\}/g, '')),
    );
    const wrong = verdicts.indexOf('false');
    if (wrong >= 0) {
      problems.push(
        `Line ${wrong + 1} of "${raw.id}", ${lines[wrong].latex.slice(0, 60)}, is not true: it does not follow from the lines before it. Work it again.`,
      );
      if (wrong > 0) {
        mended.push(
          `${id}: the working stops before its wrong line ${wrong + 1}`,
        );
        lines.splice(wrong);
      }
    }
    const picture = young ? numberPicture(lines) : null;
    return {
      thing: {
        id,
        kind: 'math',
        name: clean(raw.name),
        lines,
        ...(picture ? { picture } : {}),
      },
      problems,
      mended,
    };
  }
  if (raw.kind === 'plot') {
    if (!formats.has('maths')) return words('not a maths book');
    const plot = raw.plot;
    const fn = clean(plot?.fn);
    if (!plot || !fn || !(Number(plot.xTo) > Number(plot.xFrom))) {
      problems.push(
        `The graph "${raw.id}" needs a function and a stretch of x from low to high.`,
      );
      return words('a graph with nothing to draw');
    }
    const values = (() => {
      try {
        return sample(fn, [plot.xFrom, plot.xTo], 60).filter(
          (p) => p.y !== null,
        ).length;
      } catch {
        return 0;
      }
    })();
    if (values < 18) {
      problems.push(
        `The graph "${raw.id}" cannot be worked out: ${fn} has no values from ${plot.xFrom} to ${plot.xTo}. Write it as mathjs reads it, in x.`,
      );
      return words('a graph with no values');
    }
    const y: [number, number] | null =
      plot.yFrom !== null && plot.yTo !== null && plot.yTo > plot.yFrom
        ? [plot.yFrom, plot.yTo]
        : null;
    return {
      thing: {
        id,
        kind: 'plot',
        name: clean(raw.name),
        plot: {
          fn,
          x: [plot.xFrom, plot.xTo],
          y,
          points: (plot.points ?? [])
            .filter((p) => Number.isFinite(p.x) && clean(p.name))
            .slice(0, 4)
            .map((p) => ({ x: p.x, name: clean(p.name) })),
          xLabel: clean(plot.xLabel) || null,
          yLabel: clean(plot.yLabel) || null,
        },
      },
      problems,
      mended,
    };
  }
  if (raw.kind === 'timeline') {
    const events = (raw.timeline ?? [])
      .map((e) => ({ when: clean(e.when), name: clean(e.name) }))
      .filter((e) => e.when || e.name)
      .slice(0, MAX_EVENTS);
    if (events.length < 2) {
      problems.push(`The timeline "${raw.id}" needs at least two events.`);
      return words('a timeline with fewer than two events');
    }
    // A date the page does not give goes back, as a sum that does not add
    // up does: every number in it must be one the page gives.
    if (material) {
      const given = new Set(numbersIn(material).map(Math.abs));
      const unknown = events.filter((e) =>
        numbersIn(e.when).some((n) => !given.has(Math.abs(n))),
      );
      if (unknown.length)
        problems.push(
          `The timeline "${raw.id}" has dates the page does not give: ${unknown.map((e) => e.when).join(', ')}. Use only the page's own dates.`,
        );
    }
    return {
      thing: {
        id,
        kind: 'timeline',
        name: clean(raw.name),
        timeline: { events },
      },
      problems,
      mended,
    };
  }
  if (raw.kind === 'chart') {
    const bars = (raw.chart?.bars ?? [])
      .map((b) => ({ label: clean(b.label), value: Number(b.value) }))
      .filter((b) => b.label && Number.isFinite(b.value))
      .slice(0, MAX_BARS);
    if (bars.length < 2) {
      problems.push(
        `The chart "${raw.id}" needs at least two of the page's numbers.`,
      );
      return words('a chart with fewer than two numbers');
    }
    if (material) {
      const given = numbersIn(material).map(Math.abs);
      const unknown = bars.filter(
        (b) =>
          !given.some(
            (n) => Math.abs(n - Math.abs(b.value)) <= 1e-9 * Math.max(1, n),
          ),
      );
      if (unknown.length)
        problems.push(
          `The chart "${raw.id}" has numbers the page does not give: ${unknown.map((b) => `${b.label} ${b.value}`).join(', ')}. Chart only the page's own numbers.`,
        );
    }
    return {
      thing: {
        id,
        kind: 'chart',
        name: clean(raw.name),
        chart: {
          kind: raw.chart?.kind === 'line' ? 'line' : 'bar',
          unit: clean(raw.chart?.unit) || null,
          bars,
        },
      },
      problems,
      mended,
    };
  }
  if (!formats.has('reading')) return words('not a book to read closely');
  // A quotation keeps its line breaks; only spaces within a line are tidied.
  const text = (raw.quote ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (!text) {
    problems.push(`The quotation "${raw.id}" has no words.`);
    return words('a quotation with no words');
  }
  if (material && !isVerbatim(text, material)) {
    problems.push(
      `The quotation "${raw.id}" is not the page's own words. Copy it exactly from the page.`,
    );
    return words("not the page's own words");
  }
  const passage = text.split(/\s+/);
  const phrases = (raw.phrases ?? [])
    .map((p) => ({
      name: clean(p.name),
      phrase: clean(p.phrase),
      note: clean(p.note) || null,
    }))
    .filter((p) => {
      const ok = p.name && p.phrase && findPhrase(passage, p.phrase) >= 0;
      if (!ok && p.phrase)
        mended.push(`${id}: "${p.phrase}" is not in the quotation`);
      return ok;
    })
    .slice(0, MAX_PARTS);
  return {
    thing: { id, kind: 'quote', name: clean(raw.name), text, phrases },
    problems,
    mended,
  };
}

/** The most lines one working holds: more is a second working. */
export const MAX_MATH_LINES = 6;

/** An effect made sound, or why it was dropped. */
function effectOf(
  effect: { target: string; do: SceneEffectKind },
  resolve: (ref: string) => string | null,
  byId: Map<string, SceneThing>,
  onStage: string[],
): SceneEffect | string {
  const target = clean(effect.target);
  const dot = target.indexOf('.');
  const ref = dot < 0 ? target : target.slice(0, dot);
  const partName = dot < 0 ? '' : target.slice(dot + 1);
  const id = resolve(ref);
  if (!id) return `no thing called "${ref}" for ${effect.do}`;
  if (!onStage.includes(id))
    return `${effect.do} on ${id}, which is not on the stage`;
  const thing = byId.get(id);
  const kind: SceneEffectKind = (
    SCENE_EFFECTS as readonly SceneEffectKind[]
  ).includes(effect.do)
    ? effect.do
    : 'pulse';
  // Words in a bubble come only from the story's characters.
  if (kind === 'say')
    return thing?.kind === 'character'
      ? { target: id, part: null, do: 'say' }
      : `say on ${id}, which is not one of the story's characters`;
  const parts = thing ? partNames(thing) : [];
  const states = thing ? stateNames(thing) : [];
  // Someone toward someone or something else on the stage: a look, a
  // reach, a hug, a point at it; the camera on the two of them.
  const acts = thing?.kind === 'character' || thing?.kind === 'person';
  // The other by id, or by the name the page gives them ("fox.Mira").
  const other = partName
    ? (resolve(partName) ??
      [...byId.values()].find(
        (one) =>
          (one.kind === 'character' || one.kind === 'person') &&
          one.name.toLowerCase() === partName.toLowerCase(),
      )?.id ??
      null)
    : null;
  const toward =
    other &&
    other !== id &&
    onStage.includes(other) &&
    !parts.some((name) => idKey(name) === idKey(partName)) &&
    !states.some((name) => idKey(name) === idKey(partName))
      ? other
      : null;
  if ((ACTING_EFFECTS as readonly string[]).includes(kind)) {
    if (!acts) return `${kind} on ${id}, who is no one to act`;
    if (!toward)
      return `${kind} from ${id} toward "${partName}", which is not on the stage`;
    return { target: id, part: toward, do: kind };
  }
  if (toward && (kind === 'zoom' || (kind === 'point' && acts)))
    return { target: id, part: toward, do: kind };
  if (!partName || (!parts.length && !states.length)) {
    // A thing with no parts or states: the whole thing moves.
    return {
      target: id,
      part: null,
      do:
        kind === 'point' || kind === 'show' || kind === 'hide' ? 'pulse' : kind,
    };
  }
  const key = idKey(partName);
  const part = parts.find((name) => idKey(name) === key);
  // A person's or a character's state by another word ("convulsing",
  // "pins and needles") is the sign the word names.
  const state =
    states.find((name) => idKey(name) === key) ??
    (thing?.kind === 'person' || thing?.kind === 'character'
      ? doingIn(partName).signs[0]
      : undefined);
  if (state) {
    const does: SceneEffectKind = kind === 'hide' ? 'hide' : 'show';
    return { target: id, part: state, do: does };
  }
  if (part) {
    const does: SceneEffectKind = kind === 'pulse' ? 'pulse' : 'point';
    return { target: id, part, do: does };
  }
  return { target: id, part: null, do: 'pulse' };
}

/** How many spoken words pass between one change on the stage and the next: the writer's cadence, before any audio. */
/**
 * Spoken words with nothing new to see that send a lesson's draft back on
 * their own, about sixteen seconds: a picture that sits still that long
 * has lost the learner.
 */
export const STILL_WORDS = 40;

export function quietStretches(script: SceneScript, limit = 30): string[] {
  const positions: number[] = [];
  let before = 0;
  const offsets = script.beats.map((beat) => {
    const at = before;
    before += wordsOf(beat.say).length;
    return at;
  });
  // What a learner sees change: the stage, a part named, a state shown.
  // A pulse on what is already there is not something new to look at.
  for (const step of script.steps)
    if (step.stage || step.effects.some((e) => e.do !== 'pulse'))
      positions.push(offsets[step.at.beat] + step.word);
  // A character's line opens a bubble, and they start to speak.
  script.beats.forEach((beat, k) => {
    for (const line of beat.lines ?? [])
      positions.push(
        offsets[k] + wordsOf(beat.say.slice(0, line.span[0])).length,
      );
  });
  positions.sort((a, b) => a - b);
  positions.push(before);
  const out: string[] = [];
  let last = 0;
  for (const at of positions) {
    if (at - last > limit)
      out.push(
        `${at - last} spoken words pass with nothing new to see, from word ${last} (about ${Math.round((at - last) / 2.5)} seconds): give each small idea in them its own change on its first words (a part pointed at, a state shown, a new thing, a zoom).`,
      );
    last = at;
  }
  return out;
}

/**
 * Why a written draft goes back to its writer: its problems, and for a
 * lesson a picture that sits still too long. Nothing for a page the writer
 * said cannot be taught this way.
 */
export function sendBack(mended: MendedScript, lesson: boolean): string[] {
  if (mended.script.fit === 'poor') return [];
  return [
    ...mended.problems,
    ...(lesson ? quietStretches(mended.script, STILL_WORDS) : []),
    ...(lesson ? fewStageChanges(mended.script) : []),
  ];
}

/**
 * Spoken words a lesson's stage may go without changing what it shows, on
 * average: about twelve seconds. Pages built up a thing at a time (System
 * Design p253, a stage every five seconds) are the ones that hold a learner.
 */
export const WORDS_A_STAGE = 30;

/**
 * A lesson whose stage itself hardly changes: points and states on one
 * picture are not enough for a page of any length. Nothing for a short one.
 */
export function fewStageChanges(script: SceneScript): string[] {
  const words = script.beats.reduce((n, b) => n + wordsOf(b.say).length, 0);
  const stages = script.steps.filter((step) => step.stage).length;
  const wanted = Math.floor(words / WORDS_A_STAGE);
  if (words < 2 * WORDS_A_STAGE || stages >= wanted) return [];
  return [
    `The stage changes ${stages} times in ${words} spoken words; change what is shown, or how it is laid out, about every sentence or two (${wanted} times or more): bring on each thing, term or list item as it is named, and send off what the voice is done with.`,
  ];
}

/** Of a draft and the one written again, the one to keep: the second, unless it is worse. */
export function betterDraft(
  first: MendedScript,
  second: MendedScript,
  lesson: boolean,
): MendedScript {
  const faults = (m: MendedScript) =>
    m.problems.length +
    (lesson
      ? quietStretches(m.script, STILL_WORDS).length +
        fewStageChanges(m.script).length
      : 0);
  return faults(second) <= faults(first) ? second : first;
}

/** An item of a list said aloud: its words, and where in the sentence it starts. */
export interface SpokenItem {
  text: string;
  /** Its first word's index among the sentence's words. */
  word: number;
}

/** Words that open a clause, never a list's item: "he came, he saw, and he won". */
const NOT_AN_ITEM =
  /^(?:he|she|it|they|we|you|i|this|that|these|those|there|then|so|but|which|who|when|if)\b/iu;
/** Where a list's first item begins, after what leads into it: "three kinds: …", "such as …". */
const LEADS_INTO =
  /(?::|\bsuch as|\bincluding|\blike|\bnamely|\bare|\bwere|\bis|\binclude|\bincludes)\s+/giu;

/**
 * The lists a sentence reads out: three or more short items (four words at
 * most each) set apart by commas, the last after "and" or "or" ("storage,
 * compute, and the network"; "three parts: the disk, memory and cache").
 * A clause is never an item.
 */
export function listsIn(sentence: string): SpokenItem[][] {
  const out: SpokenItem[][] = [];
  const parts: { text: string; at: number }[] = [];
  let at = 0;
  for (const piece of sentence.split(',')) {
    parts.push({ text: piece, at });
    at += piece.length + 1;
  }
  const wordAt = (chars: number) => wordsOf(sentence.slice(0, chars)).length;
  const short = (text: string) => {
    const words = wordsOf(text);
    return (
      words.length >= 1 && words.length <= 4 && !NOT_AN_ITEM.test(text.trim())
    );
  };
  let i = 0;
  while (i < parts.length) {
    // The run of short parts ending in one that says "and" or "or".
    let j = i;
    const run: { text: string; at: number }[] = [];
    // Its first item: the part's tail past what leads into the list.
    const head = parts[i];
    let lead = -1;
    for (const m of head.text.matchAll(LEADS_INTO))
      lead = m.index + m[0].length;
    let firstText = lead >= 0 ? head.text.slice(lead) : head.text;
    let firstAt = head.at + (lead >= 0 ? lead : 0);
    // "they need sunlight, water and …": the first item is the clause's
    // last words, as many as the next item has.
    if (!short(firstText) && i + 1 < parts.length) {
      const next = parts[i + 1].text
        .replace(/^\s*(?:and|or)\s+/iu, '')
        .split(/\s+(?:and|or)\s+/iu)[0];
      const n = Math.min(3, Math.max(1, wordsOf(next).length));
      const tail = head.text.trimEnd().split(/\s+/).slice(-n).join(' ');
      if (short(tail) && short(next)) {
        firstText = tail;
        firstAt = head.at + head.text.trimEnd().length - tail.length;
      }
    }
    if (!short(firstText)) {
      i += 1;
      continue;
    }
    run.push({ text: firstText, at: firstAt });
    j = i + 1;
    let closed = false;
    while (j < parts.length) {
      const piece = parts[j].text;
      const last = /^\s*(?:and|or)\s+([^.;:!?]+)/iu.exec(piece);
      if (last) {
        if (!short(last[1])) break;
        run.push({ text: last[1], at: parts[j].at + piece.indexOf(last[1]) });
        closed = true;
        break;
      }
      // "memory and cache": the last two joined without a comma.
      const pair = /^([^.;:!?]+?)\s+(?:and|or)\s+([^.;:!?]+)/iu.exec(piece);
      if (pair && short(pair[1]) && short(pair[2])) {
        run.push({ text: pair[1], at: parts[j].at + piece.indexOf(pair[1]) });
        run.push({
          text: pair[2],
          at: parts[j].at + piece.lastIndexOf(pair[2]),
        });
        closed = true;
        break;
      }
      if (!short(piece)) break;
      run.push({ text: piece, at: parts[j].at });
      j += 1;
    }
    if (closed && run.length >= 3)
      out.push(
        run.map((item) => {
          const lead = item.text.length - item.text.trimStart().length;
          return {
            text: item.text.trim().replace(/[.;:!?)"'”’]+$/u, ''),
            word: wordAt(item.at + lead),
          };
        }),
      );
    i = closed ? j + 1 : i + 1;
  }
  return out;
}

/** Things the stage needs room for: a list is never squeezed in beside them. */
const ROOMY = new Set(['math', 'code', 'quote', 'graph', 'timeline', 'table']);
/** The most items of a list shown at once, beside the thing it is about. */
const LIST_MOST = 4;

/**
 * Each list the voice reads out, not already on the stage, brought on
 * item by item as it is said: a card for each, beside the one thing the
 * stage was showing, until the stage next changes. What was on the stage
 * comes back where the page goes on to point at something the list took
 * the place of.
 */
function showSpokenLists(
  beats: SceneBeat[],
  cast: SceneThing[],
  steps: SceneStep[],
  mended: string[],
): void {
  const before = (a: SceneStep, beat: number, word: number) =>
    a.at.beat < beat || (a.at.beat === beat && a.word <= word);
  const stageAt = (beat: number, word: number) =>
    [...steps].reverse().find((step) => step.stage && before(step, beat, word))
      ?.stage ?? null;
  const byId = new Map(cast.map((thing) => [thing.id, thing]));
  const nameOf = (id: string) => {
    const thing = byId.get(id);
    if (!thing) return '';
    if (thing.kind === 'words') return thing.text;
    return 'name' in thing && typeof thing.name === 'string' ? thing.name : id;
  };
  const keys = (text: string) =>
    wordsOf(text.toLowerCase())
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((word) => word.length >= 3);
  const taken = new Set(cast.map((thing) => thing.id));
  beats.forEach((beat, k) => {
    for (const list of listsIn(beat.say)) {
      const items = list.slice(0, 6);
      // Shown already: the writer put most of them on the stage by now.
      const shown = steps
        .filter((step) => step.stage && step.at.beat <= k + 1)
        .flatMap((step) => step.stage!.show.map(nameOf));
      const onStage = items.filter((item) =>
        keys(item.text).some((key) =>
          shown.some((name) => keys(name).includes(key)),
        ),
      ).length;
      if (onStage * 2 >= items.length) continue;
      const stage = stageAt(k, items[0].word);
      if (stage?.show.some((id) => ROOMY.has(byId.get(id)?.kind ?? '')))
        continue;
      // What the list is about stays, two things at most; the rest make
      // room.
      const base = (stage?.show ?? [])
        .filter((id) => !id.startsWith('item-'))
        .slice(0, 2);
      const cards = items.map((item) => {
        let id = `item-${groupId(item.text).slice(0, 24)}`;
        for (let n = 2; taken.has(id); n += 1)
          id = `item-${groupId(item.text).slice(0, 22)}-${n}`;
        taken.add(id);
        const text = item.text.replace(/^(?:the|a|an)\s+/iu, '');
        const card: WordsThing = {
          id,
          kind: 'words',
          text: text.charAt(0).toUpperCase() + text.slice(1),
          style: 'keyword',
        };
        cast.push(card);
        byId.set(id, card);
        return { id, word: item.word, text: item.text };
      });
      cards.forEach((card, n) => {
        const upTo = cards
          .slice(0, n + 1)
          .map((c) => c.id)
          .slice(-Math.min(LIST_MOST, MAX_ON_STAGE - base.length));
        const show = [...base, ...upTo];
        steps.push({
          at: { beat: k, phrase: wordsOf(card.text).slice(0, 3).join(' ') },
          word: card.word,
          stage: {
            layout: fitLayout(base.length === 1 ? 'focus' : 'row', show.length),
            show,
            arrows: [],
          },
          effects: [],
        });
      });
      mended.push(
        `line ${k + 1}: a list of ${cards.length} said aloud; each shown as it is said`,
      );
    }
  });
  steps.sort((a, b) => a.at.beat - b.at.beat || a.word - b.word);
  // Where the page goes on to point at something a list took the place
  // of, what was on the stage comes back.
  let current: SceneStage | null = null;
  let lastWriters: SceneStage | null = null;
  for (const step of steps) {
    if (step.stage) {
      current = step.stage;
      if (!step.stage.show.some((id) => id.startsWith('item-')))
        lastWriters = step.stage;
      continue;
    }
    const missing = step.effects.some(
      (effect) => current && !current.show.includes(effect.target),
    );
    if (missing && lastWriters) {
      step.stage = { ...lastWriters };
      current = lastWriters;
    }
  }
}

/** Layouts read in order, where an arrow should run forward: left to right, or down. */
const IN_ORDER = new Set<SceneLayout>(['row', 'stack', 'compare']);

/**
 * The things of a row, a stack or a pair set so every arrow between them
 * runs forward, to the next one where it can: the writer lists what is
 * shown in any order ("the queue, the client" for the client sending to
 * the queue), and an arrow drawn backward, or across the thing between
 * two, reads wrong. What stood on the stage before keeps its order where
 * the arrows allow, so nothing moves without a reason.
 */
export function flowOrder(
  show: readonly string[],
  arrows: readonly { from: string; to: string }[],
  before: readonly string[] = [],
): string[] {
  const edges = arrows.filter(
    (a) => a.from !== a.to && show.includes(a.from) && show.includes(a.to),
  );
  if (!edges.length) return [...show];
  const priority = (id: string) => {
    const was = before.indexOf(id);
    return was >= 0 ? was : 100 + show.indexOf(id);
  };
  const incoming = new Map(show.map((id) => [id, 0]));
  for (const e of edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const out: string[] = [];
  const left = new Set(show);
  while (left.size) {
    const ready = [...left].filter((id) => (incoming.get(id) ?? 0) === 0);
    // A ring of arrows: the rest as they stood.
    const pool = ready.length ? ready : [...left];
    const last = out[out.length - 1];
    // Next to the one just set, what it points at; else as it stood.
    const next =
      pool.find((id) => edges.some((e) => e.from === last && e.to === id)) ??
      [...pool].sort((a, b) => priority(a) - priority(b))[0];
    out.push(next);
    left.delete(next);
    for (const e of edges)
      if (e.from === next) incoming.set(e.to, (incoming.get(e.to) ?? 1) - 1);
  }
  return out;
}

/** Every row, stack and pair with arrows, set so its arrows run forward. */
function flowForward(steps: SceneStep[], mended: string[]): void {
  let before: string[] = [];
  steps.forEach((step, k) => {
    const stage = step.stage;
    if (!stage) return;
    if (IN_ORDER.has(stage.layout) && stage.arrows.length) {
      const order = flowOrder(stage.show, stage.arrows, before);
      if (order.some((id, i) => id !== stage.show[i])) {
        mended.push(
          `step ${k + 1}: ${stage.show.join(', ')} set as ${order.join(', ')}, so its arrows run forward`,
        );
        stage.show = order;
      }
    }
    before = stage.show;
  });
}

/** A word as names are matched by: four letters or more, without a plural's end. */
export const nameKeys = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4)
    .map((word) => word.replace(/(?:es|s)$/u, ''));

/**
 * A zoom kept only where its sentence names the thing, or one of its
 * parts: the camera moves in on what the voice is talking about, never on
 * a thing it has left or not reached.
 */
function zoomsOnWhatIsSaid(
  beats: SceneBeat[],
  cast: SceneThing[],
  steps: SceneStep[],
  mended: string[],
): void {
  const byId = new Map(cast.map((thing) => [thing.id, thing]));
  const namesOf = (id: string): string[] => {
    const thing = byId.get(id);
    if (!thing) return [id];
    const own =
      thing.kind === 'words'
        ? [thing.text]
        : 'name' in thing && typeof thing.name === 'string'
          ? [thing.name]
          : [];
    return [id.replace(/[-_]/gu, ' '), ...own, ...partNames(thing)];
  };
  for (let k = steps.length - 1; k >= 0; k -= 1) {
    const step = steps[k];
    if (!step.effects.some((effect) => effect.do === 'zoom')) continue;
    const said = new Set(nameKeys(beats[step.at.beat]?.say ?? ''));
    step.effects = step.effects.filter((effect) => {
      if (effect.do !== 'zoom') return true;
      // People are framed as a film frames them, named or "she".
      const kind = byId.get(effect.target)?.kind;
      if (kind === 'character' || kind === 'person') return true;
      const named = namesOf(effect.target).some((name) => {
        const keys = nameKeys(name);
        return keys.length > 0 && keys.some((key) => said.has(key));
      });
      if (!named)
        mended.push(
          `step ${k + 1}: a zoom on ${effect.target}, which its sentence does not name; left out`,
        );
      return named;
    });
    if (!step.stage && !step.effects.length) steps.splice(k, 1);
  }
}

/**
 * Each stage that brings on two or more new things at once, split so each
 * comes on where the voice first names it (or something first points at
 * it), before the stage next changes: "a web server, a database and file
 * storage" built up as they are said, not shown at once and then talked
 * through. A thing the voice does not name by then comes on with the
 * stage, as the writer had it.
 */
function buildUp(
  beats: SceneBeat[],
  cast: SceneThing[],
  steps: SceneStep[],
  mended: string[],
): void {
  const byId = new Map(cast.map((thing) => [thing.id, thing]));
  const keysOf = (id: string) => {
    const thing = byId.get(id);
    const names =
      thing?.kind === 'words'
        ? [thing.text]
        : thing && 'name' in thing && typeof thing.name === 'string'
          ? [thing.name]
          : [];
    return [
      ...new Set([...names, id.replace(/[-_]/gu, ' ')].flatMap(nameKeys)),
    ];
  };
  const words = beats.map((beat) => wordsOf(beat.say).map(nameKeys));
  const before = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  /** Where a thing is first named, from one point up to another. */
  const namedAt = (
    id: string,
    from: [number, number],
    to: [number, number] | null,
  ): [number, number] | null => {
    const keys = keysOf(id);
    if (!keys.length) return null;
    for (let b = from[0]; b < beats.length; b += 1)
      for (let w = b === from[0] ? from[1] : 0; w < words[b].length; w += 1) {
        const at: [number, number] = [b, w];
        if (to && !before(at, to)) return null;
        if (words[b][w].some((key) => keys.includes(key))) return at;
      }
    return null;
  };
  steps.sort((a, b) => a.at.beat - b.at.beat || a.word - b.word);
  const added: SceneStep[] = [];
  let shown: string[] = [];
  steps.forEach((step, k) => {
    const stage = step.stage;
    if (!stage) return;
    const was = shown;
    shown = stage.show;
    // People are staged by their own rules: a stage with them is left be.
    const person = (id: string) => {
      const kind = byId.get(id)?.kind;
      return kind === 'person' || kind === 'character';
    };
    if (stage.show.some(person)) return;
    const newcomers = stage.show.filter((id) => !was.includes(id));
    if (newcomers.length < 2) return;
    const here: [number, number] = [step.at.beat, step.word];
    const next = steps.slice(k + 1).find((later) => later.stage);
    const end: [number, number] | null = next
      ? [next.at.beat, next.word]
      : null;
    // Where each newcomer comes on: where it is first named after the
    // stage's own words, or first pointed at, whichever is sooner.
    const when = new Map<string, [number, number]>();
    for (const id of newcomers) {
      // Named on the stage's own words, or just before: it comes on now.
      const now = namedAt(
        id,
        [here[0], Math.max(0, here[1] - 3)],
        [here[0], here[1] + 3],
      );
      if (now) continue;
      let at = namedAt(id, [here[0], here[1] + 1], end);
      for (const later of steps.slice(k + 1)) {
        if (end && !before([later.at.beat, later.word], end)) break;
        if (later.effects.some((effect) => effect.target === id)) {
          const pointed: [number, number] = [later.at.beat, later.word];
          if (!at || before(pointed, at)) at = pointed;
          break;
        }
      }
      if (at && before(here, at)) when.set(id, at);
    }
    if (!when.size) return;
    // Something must be on the stage now: the one named soonest, if all wait.
    if (stage.show.every((id) => when.has(id))) {
      const soonest = [...when.entries()].sort((a, b) =>
        before(a[1], b[1]) ? -1 : 1,
      )[0][0];
      when.delete(soonest);
    }
    const fullShow = stage.show;
    const fullArrows = stage.arrows;
    const partial = (ids: string[]): SceneStage => {
      const show = fullShow.filter((id) => ids.includes(id));
      return {
        ...stage,
        layout: fitLayout(stage.layout, show.length),
        show,
        arrows: fullArrows.filter(
          (a) => show.includes(a.from) && show.includes(a.to),
        ),
      };
    };
    const on = fullShow.filter((id) => !when.has(id));
    step.stage = partial(on);
    const order = [...when.entries()].sort((a, b) =>
      before(a[1], b[1]) ? -1 : 1,
    );
    for (const [id, [beat, word]] of order) {
      on.push(id);
      added.push({
        at: {
          beat,
          phrase: wordsOf(beats[beat].say)
            .slice(word, word + 3)
            .join(' '),
        },
        word,
        stage: partial([...on]),
        effects: [],
      });
    }
    mended.push(
      `step ${k + 1}: ${order.map(([id]) => id).join(', ')} brought on as the voice names them`,
    );
  });
  steps.push(...added);
  steps.sort((a, b) => a.at.beat - b.at.beat || a.word - b.word);
}
