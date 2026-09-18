/**
 * A visual: a short timed scene about one chapter.
 *
 * The model says what is on the canvas and what happens at which word;
 * everything here is the pure part: the catalogue of what may be drawn,
 * the checks that keep a scene sound and grounded, the layout checks, the
 * mendings that need no model, and the timing that puts each cue on the
 * audio once the words are measured. Nothing here touches a model, a
 * file or a clock; the processor does that around it.
 *
 * Coordinates are centres in a fixed design space, the way a model places
 * things best; the client scales the space to its canvas once. Cues name a
 * word of their sentence by index; the timing turns that into
 * milliseconds through the spoken form and the measured words, so no
 * voice's tokenizing can move a cue.
 */
import { contentWords, type WordTimes, estimateWordTimes } from './board';
import { grounded } from './sketch';
import type { SpokenForm } from './spoken';
import type { FigureManner, FigureOutline, FigurePart } from './visual-figures';
import type { MechanismKind } from './visual-mechanisms';
import { MOTIONS } from './living.generated/motion';
import { measureText } from './visual-font';
import {
  knownPicture,
  PRESET_SHAPES,
  type PresetShape,
} from './visual-presets';

export const VISUAL_GENERATOR_VERSION = 'visual-4';

export const VISUAL_SPACE = { w: 360, h: 270 } as const;

/**
 * The two stagings every script is laid out in: the box, 4:3, for the
 * pane beside the page, and the wide, 16:9, for the full screen. One
 * tutorial, one set of cues; only where things sit differs.
 */
export const VISUAL_STAGINGS = {
  box: { w: 360, h: 270, margin: 12 },
  wide: { w: 480, h: 270, margin: 18 },
} as const;
export type StagingName = keyof typeof VISUAL_STAGINGS;

/** A staging as the layouts read it: its size, margin and middle. */
export interface Stage {
  name: StagingName;
  W: number;
  H: number;
  M: number;
  CX: number;
  CY: number;
}

const stageOf = (name: StagingName): Stage => {
  const { w, h, margin } = VISUAL_STAGINGS[name];
  return { name, W: w, H: h, M: margin, CX: w / 2, CY: h / 2 };
};
export const STAGES: Record<StagingName, Stage> = {
  box: stageOf('box'),
  wide: stageOf('wide'),
};
/** Nothing sits closer than this to an edge. */
export const VISUAL_MARGIN = 12;
/** The least gap between two visible boxes. */
export const VISUAL_GAP = 10;
export const VISUAL_LIMITS = {
  minElements: 1,
  /** A tutorial is many moments, each a few parts. */
  maxElements: 200,
  minSegments: 3,
  maxSegments: 48,
  /** The app writes a card's cues itself; a hub with its arrows and names takes many at once. */
  maxCuesPerSegment: 24,
  minWordsPerSegment: 4,
  maxWordsPerSegment: 36,
  minWords: 60,
  maxWords: 720,
  maxLabelChars: 64,
  maxChipChars: 30,
  maxVisible: 12,
  maxDots: 40,
} as const;

export const VISUAL_COLORS = [
  'green',
  'amber',
  'blue',
  'violet',
  'orange',
  'red',
  'ink',
  'muted',
] as const;
export type VisualColor = (typeof VISUAL_COLORS)[number];

export const VISUAL_ICONS = [
  'person',
  'people',
  'clock',
  'book',
  'money',
  'heart',
  'building',
  'globe',
  'gear',
  'bulb',
  'warning',
  'check',
  'question',
  'scale',
  'arrows',
  'star',
] as const;
export type VisualIcon = (typeof VISUAL_ICONS)[number];

export const SHAPE_KINDS = [
  'rect',
  'roundRect',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  /** Two circles overlapping by half, one element so the checks know they belong together. */
  'overlap',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
/** Every kind a shape may be: the plain kinds, the presets drawn by hand, and a path of its own. */
export const ALL_SHAPE_KINDS: readonly string[] = [
  ...SHAPE_KINDS,
  ...PRESET_SHAPES,
  'path',
];

/** The most commands a drawn outline may carry. */
const PATH_MAX_COMMANDS = 40;
const PATH_MAX_CHARS = 700;

/**
 * What is wrong with a drawn outline, or null when it is sound: only
 * move, line, cubic and quadratic curves and close; every coordinate on
 * the unit square, with a little room past its edges for a curve's
 * control point; not too long to read or to trace.
 */
export function pathProblem(d: string): string | null {
  if (d.length > PATH_MAX_CHARS)
    return `the outline is ${d.length} characters; keep it under ${PATH_MAX_CHARS}`;
  const tokens = d.trim().match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  if (!tokens.length) return 'the outline is empty';
  const arity: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
  let command: string | null = null;
  let commands = 0;
  let numbers: number[] = [];
  const check = () => {
    if (!command) return 'the outline must start with M';
    const need = arity[command];
    if (numbers.length === 0 && need > 0)
      return `the ${command} command has no numbers`;
    if (need > 0 && numbers.length % need !== 0) {
      return `the ${command} command needs numbers in groups of ${need}`;
    }
    for (const n of numbers) {
      if (!Number.isFinite(n) || n < -0.15 || n > 1.15) {
        return `the coordinate ${n} is off the unit square`;
      }
    }
    return null;
  };
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      const upper = token.toUpperCase();
      if (!(upper in arity))
        return `the command ${token} is not allowed; use M, L, C, Q and Z only`;
      if (token !== upper)
        return `the command ${token} is relative; use absolute ${upper}`;
      if (command) {
        const bad = check();
        if (bad) return bad;
      }
      command = upper;
      numbers = [];
      commands += 1;
      if (commands > PATH_MAX_COMMANDS)
        return `the outline has more than ${PATH_MAX_COMMANDS} commands`;
    } else {
      numbers.push(Number(token));
    }
  }
  return check();
}

/** How a drawn thing moves once it is on screen; every motion is a function of the clock, shared with the player. */
export const VISUAL_MOTIONS = MOTIONS;
export type VisualMotion = (typeof VISUAL_MOTIONS)[number];

export type VisualPoint = [number, number];
/** An end of a line or arrow: a point, or the id of an element to attach to. */
export type VisualEnd = VisualPoint | string;

export type VisualElement =
  | {
      id: string;
      type: 'label';
      x: number;
      y: number;
      text: string;
      /** eyebrow: small caps with a dot each side; huge: one big figure. */
      size?: 'sm' | 'md' | 'lg' | 'xl' | 'eyebrow' | 'huge';
      color?: VisualColor;
      anchor?: 'start' | 'middle' | 'end';
      /** Words of the text drawn in the accent colour. */
      emphasis?: string[];
      accent?: VisualColor;
      /** A tick before the text, for an item in a list. */
      tick?: boolean;
      /** A figure that counts up to itself when it appears. */
      count?: boolean;
    }
  | {
      id: string;
      type: 'chip';
      x: number;
      y: number;
      text: string;
      color?: VisualColor;
      /** A small picture from the library at the chip's left. */
      icon?: string;
      carry?: string;
    }
  | {
      id: string;
      type: 'bar';
      x: number;
      y: number;
      w: number;
      /** How much of the bar is filled, zero to one. */
      value: number;
      color?: VisualColor;
      /** Small text above the bar, left and right. */
      left?: string;
      right?: string;
      /** Ticks below the bar, at a fraction of its width. */
      markers?: { at: number; text: string }[];
    }
  | {
      id: string;
      type: 'figure';
      x: number;
      y: number;
      w: number;
      h: number;
      /** What the thing is, in the page's own words. */
      of: string;
      outline: FigureOutline;
      parts: FigurePart[];
      manner: FigureManner;
      seed: number;
      color?: VisualColor;
      carry?: string;
    }
  | {
      id: string;
      type: 'chart';
      x: number;
      y: number;
      w: number;
      h: number;
      /** bars side by side; a line over the series; shares of a whole as one bar; a pair of magnitudes. */
      kind: 'bars' | 'line' | 'shares' | 'pair';
      series: { label: string; value: number }[];
      unit?: string;
      color?: VisualColor;
    }
  | {
      id: string;
      type: 'bubble';
      x: number;
      y: number;
      text: string;
      color?: VisualColor;
      /** Which way the tail points. */
      tail?: 'left' | 'right';
    }
  | {
      id: string;
      type: 'shape';
      x: number;
      y: number;
      w: number;
      h: number;
      /** A plain kind, a preset's name from the library, or `path`. */
      kind: ShapeKind | (PresetShape & Record<never, never>) | 'path';
      /**
       * The shape's own outline when the kind is `path`: on a unit square,
       * move, line, curve and close commands only, scaled into the box.
       * The one door through which the model draws the thing itself.
       */
      d?: string;
      /** A short word inside the shape, when it needs one. */
      text?: string;
      color?: VisualColor;
      fill?: 'solid' | 'outline' | 'tint';
      /** How a drawn picture moves once shown. */
      motion?: VisualMotion;
      /** Where an `along` thing goes: the centre of the thing after it. */
      motionTo?: { x: number; y: number };
      /** What the thing is, so the player can carry it from one card to the next. */
      carry?: string;
    }
  | {
      id: string;
      type: 'callout';
      x: number;
      y: number;
      text: string;
      /** The figure or mechanism the leader line runs to, and the part it points at. */
      of: string;
      part: string;
      anchor?: 'start' | 'end';
      color?: VisualColor;
    }
  | {
      id: string;
      type: 'mechanism';
      x: number;
      y: number;
      w: number;
      h: number;
      kind: MechanismKind;
      params: Record<string, number>;
      /** The stages shown, in order; each runs from the word its phase chip comes in on. */
      stages: string[];
      /** The phase chips, one per stage, in order. */
      phaseIds: string[];
      seed: number;
      color?: VisualColor;
    }
  | {
      id: string;
      type: 'line';
      from: VisualEnd;
      to: VisualEnd;
      color?: VisualColor;
      dashed?: boolean;
    }
  | {
      id: string;
      type: 'arrow';
      from: VisualEnd;
      to: VisualEnd;
      /** Curve, minus forty to forty; zero is straight. */
      bend?: number;
      color?: VisualColor;
      double?: boolean;
    }
  | {
      id: string;
      type: 'icon';
      name: VisualIcon;
      x: number;
      y: number;
      size: number;
      color?: VisualColor;
    }
  | {
      id: string;
      /** A picture drawn anew: a PNG on a transparent ground, sized into its box. */
      type: 'image';
      x: number;
      y: number;
      w: number;
      h: number;
      data: string;
      color?: VisualColor;
      carry?: string;
    }
  | {
      id: string;
      type: 'dots';
      points: VisualPoint[];
      r?: number;
      color?: VisualColor;
    };

export type VisualElementType = VisualElement['type'];

export const VISUAL_ACTIONS = [
  'draw',
  'fade',
  'hide',
  'dim',
  'undim',
  'pulse',
  'flow',
  'highlight',
  'settle',
  'clear',
] as const;
export type VisualAction = (typeof VISUAL_ACTIONS)[number];

/** The actions that need the element on screen already. */
const NEEDS_SHOWN = new Set<VisualAction>([
  'pulse',
  'flow',
  'dim',
  'undim',
  'highlight',
  'settle',
]);
/** The actions that bring an element on screen. */
export const SHOWS = new Set<VisualAction>(['draw', 'fade']);

export interface VisualCue {
  /** The word of the sentence the cue lands on, zero-based, after a whitespace split. */
  at: number;
  do: VisualAction;
  /** An element id, or "*" for clear. */
  target: string;
}

export interface VisualSegment {
  /** One spoken sentence, four to thirty words, no symbols. */
  text: string;
  cues: VisualCue[];
}

/** What the model writes. */
export interface VisualScript {
  title: string;
  elements: VisualElement[];
  segments: VisualSegment[];
}

export type VisualFit = 'good' | 'partial' | 'poor';

/** What the planner returns before anything is drawn. */
export interface VisualPlan {
  learningGoal: string;
  keyTerms: string[];
  diagramConcept: string;
  /** The one thing at the centre of the picture: a preset from the library by name, or a plain shape when the chapter is about an idea. */
  centre: { what: string; how: 'picture' | 'shape'; picture: string | null };
  beats: string[];
  fit: VisualFit;
  /** Why the fit is what it is, one sentence; shown to the student when poor. */
  fitReason: string | null;
}

/** A cue on the audio. */
export interface TimedCue {
  atMs: number;
  do: VisualAction;
  target: string;
}

export interface TimedSegment {
  text: string;
  startMs: number;
  endMs: number;
  /** Each word of the spoken sentence: [charStart, charEnd, startMs, endMs], chars into the spoken text of the whole scene. */
  words: number[][];
  cues: TimedCue[];
}

/** The scene as stored and played: the script with every cue on the audio. */
/** What the judge said of a page's stills. */
export interface VisualJudgement {
  moments: {
    moment: number;
    drawings: { name: string; looksRight: boolean; wrong: string | null }[];
    textTrouble: string | null;
    crowded: boolean;
    /** Whether the moment shows what the director said a learner should see. */
    showsBrief: boolean;
    verdict: 'go' | 'redo';
    note: string | null;
  }[];
}

export interface VisualTimeline {
  version: 2;
  generator: string;
  title: string;
  space: { w: number; h: number };
  elements: VisualElement[];
  segments: TimedSegment[];
  durationMs: number;
  /** How the words were measured: the aligner, or an estimate from the length. */
  timing: 'aligned' | 'estimated';
  /** Moments that shipped plain, as words, after the judge said redo twice; by position. */
  plain?: number[];
  /** The same script placed for each staging; `elements` and `space` are the box's. */
  stagings: Record<
    StagingName,
    { space: { w: number; h: number }; elements: VisualElement[] }
  >;
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The words of a sentence as cues count them: a whitespace split after trimming, punctuation kept. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * A label is grounded when every content word is the chapter's, as the
 * sketch demands of its own; a label of two or more content words may
 * carry one word of its own, since "better health" for a chapter about
 * improving health is a fair name and not an invention.
 */
export function labelGrounded(text: string, pool: Set<string>): boolean {
  if (grounded(text, pool)) return true;
  const words = contentWords(text);
  if (words.length < 2) return false;
  const stray = words.filter((word) => !grounded(word, pool));
  return stray.length <= 1;
}

/** The material's content words, for grounding labels the way the sketch grounds its own; built once per scene. */
export function materialPool(material: string): Set<string> {
  return new Set(contentWords(material));
}

// ── Problems ──────────────────────────────────────────────────────────────

const ID = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

/**
 * Everything wrong with a script before it is worth laying out or
 * voicing, each with the ids and numbers a repair needs. Empty means sound.
 */
export function visualProblems(
  script: VisualScript,
  pool: Set<string> | null = null,
): string[] {
  const shapeIds = new Set(
    script.elements.filter((e) => e.type === 'shape').map((e) => e.id),
  );
  /** Name labels the layout put under a picture, id `${picture}_name`. */
  const companions = new Set(
    script.elements
      .filter(
        (e) =>
          e.type === 'label' &&
          e.id.endsWith('_name') &&
          shapeIds.has(e.id.slice(0, -'_name'.length)),
      )
      .map((e) => e.id),
  );
  const problems: string[] = [];
  const ids = new Set<string>();
  const byId = new Map<string, VisualElement>();
  if (!script.title?.trim() || script.title.length > 60) {
    problems.push('The title must be one to sixty characters.');
  }
  if (
    script.elements.length < VISUAL_LIMITS.minElements ||
    script.elements.length > VISUAL_LIMITS.maxElements
  ) {
    problems.push(
      `There are ${script.elements.length} elements; between ${VISUAL_LIMITS.minElements} and ${VISUAL_LIMITS.maxElements} are allowed.`,
    );
  }
  for (const element of script.elements) {
    if (!ID.test(element.id)) {
      problems.push(`Element id "${element.id}" is not a plain identifier.`);
    }
    if (ids.has(element.id))
      problems.push(`Element id "${element.id}" is used twice.`);
    ids.add(element.id);
    byId.set(element.id, element);
    if (
      element.color &&
      !(VISUAL_COLORS as readonly string[]).includes(element.color)
    ) {
      problems.push(
        `Element "${element.id}" uses colour "${element.color}", which is not in the palette.`,
      );
    }
    switch (element.type) {
      case 'label':
        if (
          !element.text?.trim() ||
          element.text.length > VISUAL_LIMITS.maxLabelChars
        ) {
          problems.push(
            `Label "${element.id}" must be one to ${VISUAL_LIMITS.maxLabelChars} characters.`,
          );
        }
        break;
      case 'chip':
        if (
          !element.text?.trim() ||
          element.text.length > VISUAL_LIMITS.maxChipChars
        ) {
          problems.push(
            `Chip "${element.id}" must be one to ${VISUAL_LIMITS.maxChipChars} characters.`,
          );
        }
        break;
      case 'shape':
        if (element.kind === 'path') {
          const bad = element.d
            ? pathProblem(element.d)
            : 'no outline was given';
          if (bad) {
            problems.push(
              `Shape "${element.id}" draws its own outline but ${bad}.`,
            );
          }
        }
        if (
          !ALL_SHAPE_KINDS.includes(element.kind) &&
          !knownPicture(element.kind)
        ) {
          problems.push(
            `Shape "${element.id}" has kind "${element.kind}", which is not in the catalogue.`,
          );
        }
        if (!(element.w > 0 && element.h > 0)) {
          problems.push(
            `Shape "${element.id}" needs a positive width and height.`,
          );
        }
        if (element.text && element.text.length > VISUAL_LIMITS.maxChipChars) {
          problems.push(
            `Shape "${element.id}" carries a text over ${VISUAL_LIMITS.maxChipChars} characters.`,
          );
        }
        break;
      case 'icon':
        if (!(VISUAL_ICONS as readonly string[]).includes(element.name)) {
          problems.push(
            `Icon "${element.id}" names "${element.name}", which is not in the icon set.`,
          );
        }
        if (!(element.size >= 16 && element.size <= 80)) {
          problems.push(
            `Icon "${element.id}" must be sixteen to eighty units.`,
          );
        }
        break;
      case 'dots':
        if (
          !element.points?.length ||
          element.points.length > VISUAL_LIMITS.maxDots
        ) {
          problems.push(
            `Dots "${element.id}" must have one to ${VISUAL_LIMITS.maxDots} points.`,
          );
        }
        break;
      case 'line':
      case 'arrow':
        if (
          element.type === 'arrow' &&
          element.bend !== undefined &&
          Math.abs(element.bend) > 40
        ) {
          problems.push(
            `Arrow "${element.id}" bends ${element.bend}; the limit is forty either way.`,
          );
        }
        break;
    }
  }
  // Ends after every id is known.
  for (const element of script.elements) {
    if (element.type !== 'line' && element.type !== 'arrow') continue;
    for (const end of [element.from, element.to]) {
      if (typeof end === 'string' && !byId.has(end)) {
        problems.push(
          `${element.type === 'arrow' ? 'Arrow' : 'Line'} "${element.id}" points at "${end}", which is not an element.`,
        );
      }
      if (typeof end === 'string' && end === element.id) {
        problems.push(`"${element.id}" points at itself.`);
      }
    }
  }
  // Grounding: every word a student reads on the canvas is a word of the chapter.
  if (pool) {
    for (const element of script.elements) {
      const text =
        element.type === 'label' ||
        element.type === 'chip' ||
        element.type === 'callout'
          ? element.text
          : element.type === 'shape'
            ? (element.text ?? '')
            : '';
      if (text && !labelGrounded(text, pool)) {
        problems.push(
          `"${element.id}" says "${text}", which is not built from the chapter's words.`,
        );
      }
    }
  }

  // Segments and cues.
  if (
    script.segments.length < VISUAL_LIMITS.minSegments ||
    script.segments.length > VISUAL_LIMITS.maxSegments
  ) {
    problems.push(
      `There are ${script.segments.length} sentences; between ${VISUAL_LIMITS.minSegments} and ${VISUAL_LIMITS.maxSegments} are allowed.`,
    );
  }
  const shown = new Set<string>();
  const used = new Set<string>();
  let totalWords = 0;
  script.segments.forEach((segment, index) => {
    const n = index + 1;
    const words = wordsOf(segment.text);
    totalWords += words.length;
    if (
      words.length < VISUAL_LIMITS.minWordsPerSegment ||
      words.length > VISUAL_LIMITS.maxWordsPerSegment
    ) {
      problems.push(
        `Sentence ${n} has ${words.length} words; four to thirty are allowed.`,
      );
    }
    const symbol = /[<>{}[\]*_#`]/.exec(segment.text);
    if (symbol) {
      problems.push(
        `Sentence ${n} carries the symbol "${symbol[0]}" ("${segment.text.slice(0, 60)}"); it is spoken, so plain words only.`,
      );
    }
    // Dims and undims are housekeeping, some of them added by the mender,
    // and a picture's name label rides along with its picture; the cap is
    // on what a sentence makes happen.
    const busy = segment.cues.filter(
      (cue) =>
        cue.do !== 'dim' && cue.do !== 'undim' && !companions.has(cue.target),
    ).length;
    if (busy > VISUAL_LIMITS.maxCuesPerSegment) {
      problems.push(
        `Sentence ${n} has ${busy} cues; at most ${VISUAL_LIMITS.maxCuesPerSegment}.`,
      );
    }
    let lastAt = -1;
    for (const cue of segment.cues) {
      if (!(VISUAL_ACTIONS as readonly string[]).includes(cue.do)) {
        problems.push(
          `Sentence ${n} uses action "${cue.do}", which is not in the catalogue.`,
        );
        continue;
      }
      if (!Number.isInteger(cue.at) || cue.at < 0 || cue.at >= words.length) {
        problems.push(
          `Sentence ${n} has a cue at word ${cue.at}, but it has ${words.length} words (zero to ${words.length - 1}).`,
        );
      }
      if (cue.at < lastAt)
        problems.push(`Sentence ${n}'s cues are not in word order.`);
      lastAt = Math.max(lastAt, cue.at);
      if (cue.do === 'clear') {
        if (cue.target !== '*')
          problems.push(
            `Sentence ${n} clears "${cue.target}"; clear must target "*".`,
          );
        shown.clear();
        continue;
      }
      const target = byId.get(cue.target);
      if (!target) {
        problems.push(
          `Sentence ${n} cues "${cue.target}", which is not an element.`,
        );
        continue;
      }
      used.add(cue.target);
      if (
        cue.do === 'flow' &&
        target.type !== 'line' &&
        target.type !== 'arrow'
      ) {
        problems.push(
          `Sentence ${n} flows "${cue.target}", but flow only runs along a line or an arrow.`,
        );
      }
      if (NEEDS_SHOWN.has(cue.do) && !shown.has(cue.target)) {
        problems.push(
          `Sentence ${n} does "${cue.do}" on "${cue.target}" before it is drawn or faded in.`,
        );
      }
      if (SHOWS.has(cue.do)) shown.add(cue.target);
      if (cue.do === 'hide') shown.delete(cue.target);
    }
  });
  if (
    totalWords < VISUAL_LIMITS.minWords ||
    totalWords > VISUAL_LIMITS.maxWords
  ) {
    problems.push(
      `The narration is ${totalWords} words; between ${VISUAL_LIMITS.minWords} and ${VISUAL_LIMITS.maxWords} are allowed.`,
    );
  }
  for (const element of script.elements) {
    if (!used.has(element.id)) {
      problems.push(
        `Element "${element.id}" is never drawn or faded in; drop it or cue it.`,
      );
    }
  }
  return problems;
}

// ── Layout ────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Type sizes in design units, matching the client's. */
export const LABEL_SIZE = {
  sm: 10,
  md: 12,
  lg: 15,
  xl: 19,
  eyebrow: 8.5,
  huge: 34,
} as const;
/** An eyebrow is set in capitals with letter spacing, and a dot each side. */
export const EYEBROW_SPREAD = 1.32;
export const EYEBROW_DOTS = 26;
/** The tick before a list item, and the room it takes. */
export const TICK_ROOM = 16;
/** The bar: its own height, and the markers below it. */
export const BAR_HEIGHT = 16;
export const BAR_MARKER_ROOM = 24;
export const BAR_CAPTION_ROOM = 14;
/** A speech bubble's text size, padding and tail. */
export const BUBBLE_TEXT_SIZE = 11.5;
export const BUBBLE_PAD = 22;
export const BUBBLE_HEIGHT = 26;
export const BUBBLE_TAIL = 9;
export const CHIP_ICON_ROOM = 20;
export const CHIP_HEIGHT = 26;
/** A callout's text has a dot before it; the room that takes. */
export const CALLOUT_PAD = 10;
export const CHIP_TEXT_SIZE = 12.5;
export const CHIP_PAD = 24;
export const CHIP_MIN_WIDTH = 44;
/** The text inside a shape: its size, and the room it needs each side. */
export const SHAPE_TEXT_SIZE = 11.5;
const SHAPE_TEXT_PAD = 10;

/** The width of a run of text at a type size, measured in the reading font. */
export function textWidth(text: string, size: number, bold = false): number {
  return Math.round(measureText(text, size, bold ? 700 : 600));
}

/** A label's width as drawn: capitals spread out for an eyebrow, a tick's room for an item. */
export function labelWidth(
  element: Extract<VisualElement, { type: 'label' }>,
): number {
  const kind = element.size ?? 'md';
  const size = LABEL_SIZE[kind];
  if (kind === 'eyebrow')
    return (
      Math.round(
        textWidth(element.text.toUpperCase(), size, true) * EYEBROW_SPREAD,
      ) + EYEBROW_DOTS
    );
  const heavy = kind === 'lg' || kind === 'xl' || kind === 'huge';
  return textWidth(element.text, size, heavy) + (element.tick ? TICK_ROOM : 0);
}

/** A chip's width: its text with padding, and room for an icon. */
export function chipWidthOf(text: string, icon = false): number {
  return (
    Math.max(CHIP_MIN_WIDTH, textWidth(text, CHIP_TEXT_SIZE, true) + CHIP_PAD) +
    (icon ? CHIP_ICON_ROOM : 0)
  );
}

/** The bounding box of an element, or null for a line or an arrow, which are not boxes. */
export function boxOf(element: VisualElement): Box | null {
  switch (element.type) {
    case 'label': {
      const size = LABEL_SIZE[element.size ?? 'md'];
      const w = labelWidth(element);
      const left =
        element.anchor === 'start'
          ? element.x
          : element.anchor === 'end'
            ? element.x - w
            : element.x - w / 2;
      return { x: left, y: element.y - size * 0.7, w, h: size * 1.4 };
    }
    case 'chip': {
      const w = chipWidthOf(element.text, Boolean(element.icon));
      return {
        x: element.x - w / 2,
        y: element.y - CHIP_HEIGHT / 2,
        w,
        h: CHIP_HEIGHT,
      };
    }
    case 'bar': {
      const above = element.left || element.right ? BAR_CAPTION_ROOM : 0;
      const below = element.markers?.length ? BAR_MARKER_ROOM : 0;
      return {
        x: element.x - element.w / 2,
        y: element.y - BAR_HEIGHT / 2 - above,
        w: element.w,
        h: BAR_HEIGHT + above + below,
      };
    }
    case 'figure':
    case 'chart':
    case 'mechanism':
      return {
        x: element.x - element.w / 2,
        y: element.y - element.h / 2,
        w: element.w,
        h: element.h,
      };
    case 'callout': {
      const size = LABEL_SIZE.sm;
      const w = textWidth(element.text, size, true) + CALLOUT_PAD;
      const left = element.anchor === 'end' ? element.x - w : element.x;
      return { x: left, y: element.y - size * 0.7, w, h: size * 1.4 };
    }
    case 'bubble': {
      const w = textWidth(element.text, BUBBLE_TEXT_SIZE, true) + BUBBLE_PAD;
      return {
        x: element.x - w / 2,
        y: element.y - BUBBLE_HEIGHT / 2,
        w,
        h: BUBBLE_HEIGHT + BUBBLE_TAIL,
      };
    }
    case 'shape':
    case 'image':
      return {
        x: element.x - element.w / 2,
        y: element.y - element.h / 2,
        w: element.w,
        h: element.h,
      };
    case 'icon':
      return {
        x: element.x - element.size / 2,
        y: element.y - element.size / 2,
        w: element.size,
        h: element.size,
      };
    case 'dots': {
      const r = element.r ?? 3;
      const xs = element.points.map((p) => p[0]);
      const ys = element.points.map((p) => p[1]);
      return {
        x: Math.min(...xs) - r,
        y: Math.min(...ys) - r,
        w: Math.max(...xs) - Math.min(...xs) + 2 * r,
        h: Math.max(...ys) - Math.min(...ys) + 2 * r,
      };
    }
    case 'line':
    case 'arrow':
      return null;
  }
}

/** A point for an end: the point itself, or the centre of the named element. */
export function endPoint(
  end: VisualEnd,
  byId: Map<string, VisualElement>,
): VisualPoint | null {
  if (typeof end !== 'string') return end;
  const element = byId.get(end);
  if (!element) return null;
  const box = boxOf(element);
  return box ? [box.x + box.w / 2, box.y + box.h / 2] : null;
}

/** Which elements are on screen at the end of each sentence, in order. */
export function visibleAfterEach(script: VisualScript): Set<string>[] {
  const shown = new Set<string>();
  return script.segments.map((segment) => {
    for (const cue of segment.cues) {
      if (cue.do === 'clear') shown.clear();
      else if (SHOWS.has(cue.do)) shown.add(cue.target);
      else if (cue.do === 'hide') shown.delete(cue.target);
    }
    return new Set(shown);
  });
}

/** Whether one box sits wholly inside the other: a chip inside a shape is a composition, not a collision. */
function contained(a: Box, b: Box): boolean {
  const inside = (inner: Box, outer: Box) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h;
  return inside(a, b) || inside(b, a);
}

/** The elements whose boxes may collide: dots are scatter, placed inside things on purpose. */
function collides(element: VisualElement): boolean {
  return element.type !== 'dots';
}

function overlap(a: Box, b: Box): { x: number; y: number } {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { x, y };
}

const round = (n: number) => Math.round(n);

/** The room a shape's text needs across, with its padding. */
export function shapeTextWidth(text: string): number {
  return textWidth(text, SHAPE_TEXT_SIZE, true) + 2 * SHAPE_TEXT_PAD;
}

/** Where a line or arrow attaches: the edge of the named box nearest the other end, a gap short of it; a point as given. */
export function attachPoint(
  end: VisualEnd,
  other: VisualPoint,
  byId: Map<string, VisualElement>,
): VisualPoint | null {
  if (typeof end !== 'string') return end;
  const element = byId.get(end);
  const own = element ? boxOf(element) : null;
  if (!own) return null;
  // A picture and the name under it are one thing to a line: the name
  // makes the box taller, never wider, so a line still meets the picture.
  const name = byId.get(`${end}_name`);
  const box = name ? below(own, boxOf(name)) : own;
  // A drawn picture is met on its body, not the corner of its box.
  const deep =
    element?.type === 'shape' &&
    element.kind !== 'rect' &&
    element.kind !== 'roundRect';
  return leave(box, other, 6, deep);
}

/** The first box stretched down to take in the second, its sides as they were. */
function below(a: Box, b: Box | null): Box {
  if (!b) return a;
  const y = Math.min(a.y, b.y);
  return { x: a.x, y, w: a.w, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Where a line to `other` leaves a box: from the side that faces it when
 * the other end is wholly beside, above or below the box, at the height
 * (or width) nearest the other end, so a stack of boxes on one edge all
 * send their lines outward and never through each other; else where the
 * ray from the centre leaves. The player draws with the same rule.
 */
export function leave(
  box: Box,
  other: VisualPoint,
  gap: number,
  deep = false,
): VisualPoint {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const inset = (v: number, lo: number, hi: number) =>
    Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
  // How far in from a corner a line may meet the side: a drawn thing is
  // thin at its corners, so lines meet it nearer the middle.
  const dx = deep ? box.w * 0.3 : 8;
  const dy = deep ? box.h * 0.3 : 8;
  const [ox, oy] = other;
  // How far the other end lies beyond the box on each axis; the line
  // leaves by the side it is further past, so a thing just below and a
  // little to the left is met from below, not from the side.
  const outX =
    ox > box.x + box.w ? ox - box.x - box.w : ox < box.x ? box.x - ox : 0;
  const outY =
    oy > box.y + box.h ? oy - box.y - box.h : oy < box.y ? box.y - oy : 0;
  if (outX || outY) {
    if (outY > outX)
      return oy > box.y
        ? [inset(ox, box.x + dx, box.x + box.w - dx), box.y + box.h + gap]
        : [inset(ox, box.x + dx, box.x + box.w - dx), box.y - gap];
    return ox > box.x
      ? [box.x + box.w + gap, inset(oy, box.y + dy, box.y + box.h - dy)]
      : [box.x - gap, inset(oy, box.y + dy, box.y + box.h - dy)];
  }
  const rx = ox - cx;
  const ry = oy - cy;
  if (!rx && !ry) return [cx, cy];
  const hx = box.w / 2 + gap;
  const hy = box.h / 2 + gap;
  const t = Math.min(
    rx ? hx / Math.abs(rx) : Infinity,
    ry ? hy / Math.abs(ry) : Infinity,
  );
  return [cx + rx * t, cy + ry * t];
}

/** Eleven points along a line or arrow, bend and all, for the crossing check. */
export function arrowSamples(
  element: Extract<VisualElement, { type: 'line' | 'arrow' }>,
  byId: Map<string, VisualElement>,
): VisualPoint[] {
  const roughFrom = endPoint(element.from, byId);
  const roughTo = endPoint(element.to, byId);
  if (!roughFrom || !roughTo) return [];
  const from = attachPoint(element.from, roughTo, byId);
  const to = attachPoint(element.to, roughFrom, byId);
  if (!from || !to) return [];
  const bend = element.type === 'arrow' ? (element.bend ?? 0) : 0;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  // The bow is capped by the arrow's length, so a short arrow never curls.
  const bow = Math.sign(bend) * Math.min(Math.abs(bend) * 2, len * 0.6);
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  // The middle of the arrow only: a chip beside the thing an arrow points
  // at sits near the arrow's end by design, and is not in its way.
  const points: VisualPoint[] = [];
  for (let i = 2; i < 11; i += 1) {
    const t = i / 12;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push([
      a * from[0] + b * cx + c * to[0],
      a * from[1] + b * cy + c * to[1],
    ]);
  }
  return points;
}

/**
 * What the model should know but need not fix: more on screen than a
 * student takes in at once. Logged, shown to the model on a repair, never
 * a failure on its own.
 */
export function visualWarnings(script: VisualScript): string[] {
  const warnings: string[] = [];
  visibleAfterEach(script).forEach((visible, index) => {
    if (visible.size > VISUAL_LIMITS.maxVisible) {
      warnings.push(
        `After sentence ${index + 1}, ${visible.size} elements are on screen; keep it to ${VISUAL_LIMITS.maxVisible} by dimming or hiding what is no longer discussed.`,
      );
    }
  });
  return warnings;
}

/**
 * What is wrong with where things sit: a box over an edge, two visible
 * boxes over each other by more than four units both ways, a shape too
 * narrow for its text, or an arrow running through a label or chip.
 * Reported with the numbers a repair needs.
 */
export function layoutProblems(
  script: VisualScript,
  stage: Stage = STAGES.box,
): string[] {
  const problems: string[] = [];
  const { W, H, M } = stage;
  const byId = new Map(script.elements.map((e) => [e.id, e] as const));
  const boxes = new Map<string, Box>();
  for (const element of script.elements) {
    if (element.type === 'shape' && element.text) {
      const need = shapeTextWidth(element.text);
      if (need > element.w) {
        problems.push(
          `"${element.id}" is ${round(element.w)} wide but its text "${element.text}" needs ${round(need)}; widen it or shorten the text.`,
        );
      }
    }
    const box = boxOf(element);
    if (!box) continue;
    boxes.set(element.id, box);
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    if (box.x < M || box.y < M || right > W - M || bottom > H - M) {
      problems.push(
        `"${element.id}" runs outside the canvas margin: it spans ${round(box.x)} to ${round(right)} across and ${round(box.y)} to ${round(bottom)} down; keep everything ${M} units inside 0 to ${W} by 0 to ${H}.`,
      );
    }
  }
  const seen = new Set<string>();
  visibleAfterEach(script).forEach((visible, index) => {
    const ids = [...visible].filter(
      (id) => boxes.has(id) && collides(byId.get(id)!),
    );
    // An arrow through a word: any visible line or arrow whose path
    // passes through a visible label or chip it does not attach to.
    for (const id of visible) {
      const element = byId.get(id);
      if (!element || (element.type !== 'line' && element.type !== 'arrow')) {
        continue;
      }
      const owns = new Set(
        [element.from, element.to].filter((e) => typeof e === 'string'),
      );
      for (const target of visible) {
        const other = byId.get(target);
        if (!other || owns.has(target)) continue;
        if (other.type !== 'label' && other.type !== 'chip') continue;
        const box = boxes.get(target);
        if (!box) continue;
        const pair = `${id}>${target}`;
        if (seen.has(pair)) continue;
        const crosses = arrowSamples(element, byId).some(
          ([x, y]) =>
            x > box.x - 2 &&
            x < box.x + box.w + 2 &&
            y > box.y - 2 &&
            y < box.y + box.h + 2,
        );
        if (crosses) {
          seen.add(pair);
          problems.push(
            `"${id}" runs through "${target}" (${round(box.x)} to ${round(box.x + box.w)}, ${round(box.y)} to ${round(box.y + box.h)}) after sentence ${index + 1}; move "${target}" off the arrow's path or bend the arrow the other way.`,
          );
        }
      }
    }
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const pair = `${ids[i]}|${ids[j]}`;
        if (seen.has(pair)) continue;
        const a = boxes.get(ids[i])!;
        const b = boxes.get(ids[j])!;
        const o = overlap(a, b);
        if (o.x > 4 && o.y > 4 && !contained(a, b)) {
          seen.add(pair);
          problems.push(
            `"${ids[i]}" (${round(a.x)} to ${round(a.x + a.w)}, ${round(a.y)} to ${round(a.y + a.h)}) and "${ids[j]}" (${round(b.x)} to ${round(b.x + b.w)}, ${round(b.y)} to ${round(b.y + b.h)}) overlap after sentence ${index + 1}; move one by at least ${round(Math.min(o.x, o.y) + VISUAL_GAP)} units.`,
          );
        }
      }
    }
  });
  return problems;
}

/**
 * What can be mended without asking again: coordinates clamped inside
 * the margin, cues sorted, and overlapping boxes nudged apart along the
 * axis of least overlap. Returns a new script; the model's is untouched.
 */
/**
 * A pulse, dim, flow or highlight on something not yet on screen does
 * nothing but fail the checks; it is dropped, and the model is not asked.
 */
function withoutEarlyCues(script: VisualScript): VisualScript {
  const shown = new Set<string>();
  return {
    ...script,
    segments: script.segments.map((segment) => ({
      ...segment,
      cues: segment.cues.filter((cue) => {
        if (cue.do === 'clear') {
          shown.clear();
          return true;
        }
        if (NEEDS_SHOWN.has(cue.do) && !shown.has(cue.target)) return false;
        if (SHOWS.has(cue.do)) shown.add(cue.target);
        if (cue.do === 'hide') shown.delete(cue.target);
        return true;
      }),
    })),
  };
}

export function repairVisual(
  script: VisualScript,
  stage: Stage = STAGES.box,
): VisualScript {
  // Text is one line: a newline the model put in to make a chip "short"
  // would draw as nothing and measure as everything.
  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
  const tidied = script.elements.map((element) =>
    element.type === 'label' || element.type === 'chip'
      ? { ...element, text: tidy(element.text) }
      : element.type === 'shape' && element.text
        ? { ...element, text: tidy(element.text) }
        : element,
  );
  // A shape narrower than its text grows to fit it, centred where it was.
  const elements = clampAll(
    tidied.map((element) =>
      element.type === 'shape' &&
      element.text &&
      shapeTextWidth(element.text) > element.w
        ? { ...element, w: round(shapeTextWidth(element.text) + 4) }
        : element,
    ),
    stage,
  );
  // Nudge pairs that overlap in any sentence, a few rounds, later one moves.
  const draft: VisualScript = { ...withoutEarlyCues(script), elements };
  for (let pass = 0; pass < 8; pass += 1) {
    const map = new Map(draft.elements.map((e) => [e.id, e] as const));
    let moved = false;
    for (const visible of visibleAfterEach(draft)) {
      const ids = [...visible].filter(
        (id) => map.has(id) && collides(map.get(id)!) && boxOf(map.get(id)!),
      );
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = boxOf(map.get(ids[i])!)!;
          const b = boxOf(map.get(ids[j])!)!;
          const o = overlap(a, b);
          if (o.x <= 4 || o.y <= 4 || contained(a, b)) continue;
          // A picture and the name under it move as one: a name that is
          // in the way moves its picture, and a picture takes its name.
          const owner = ids[j].endsWith('_name')
            ? ids[j].slice(0, -'_name'.length)
            : ids[j];
          const mover = (map.get(owner) ?? map.get(ids[j])) as VisualElement & {
            x?: number;
            y?: number;
          };
          const tag = map.get(`${owner}_name`);
          if (mover.type === 'dots' || mover.x === undefined) continue;
          // Four ways out, tried in order: along the axis of least overlap
          // away from the other box, then back the other way, then along
          // the other axis both ways. The first that lands inside the
          // margin and on no other lit box wins; a nudge that only lands on
          // a neighbour would ping between them for ever.
          const others = ids
            .filter((id) => id !== ids[i] && id !== ids[j])
            .map((id) => boxOf(map.get(id)!)!);
          const fits = (candidate: Box) =>
            candidate.x >= stage.M &&
            candidate.y >= stage.M &&
            candidate.x + candidate.w <= stage.W - stage.M &&
            candidate.y + candidate.h <= stage.H - stage.M &&
            others.every((o) => {
              const ov = overlap(candidate, o);
              return ov.x <= 4 || ov.y <= 4 || contained(candidate, o);
            });
          const stepX = o.x + VISUAL_GAP;
          const stepY = o.y + VISUAL_GAP;
          const dirX = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1;
          const dirY = b.y + b.h / 2 >= a.y + a.h / 2 ? 1 : -1;
          const moves: [number, number][] =
            o.x < o.y
              ? [
                  [dirX * stepX, 0],
                  [-dirX * stepX, 0],
                  [0, dirY * stepY],
                  [0, -dirY * stepY],
                ]
              : [
                  [0, dirY * stepY],
                  [0, -dirY * stepY],
                  [dirX * stepX, 0],
                  [-dirX * stepX, 0],
                ];
          const chosen =
            moves.find(([dx, dy]) =>
              fits({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }),
            ) ?? moves[0];
          mover.x = round(mover.x + chosen[0]);
          mover.y = round((mover.y ?? 0) + chosen[1]);
          if (tag && tag !== mover && tag.type === 'label') {
            tag.x = round(tag.x + chosen[0]);
            tag.y = round(tag.y + chosen[1]);
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  // Cues in word order, and a cue past the sentence's last word lands on
  // it: the element is still shown, just late, which beats a lost cue.
  const ordered = draft.segments.map((segment) => {
    const last = Math.max(wordsOf(segment.text).length - 1, 0);
    return {
      ...segment,
      text: tidy(segment.text),
      cues: [...segment.cues]
        .map((cue) => ({
          ...cue,
          at: Math.min(Math.max(Math.round(cue.at), 0), last),
        }))
        .sort((a, b) => a.at - b.at),
    };
  });
  const segments = calmed({ ...draft, segments: ordered });
  // A nudge can push a box over the edge; the edge wins, and a box that
  // then overlaps again is the model's to mend.
  const placed = clampAll(draft.elements, stage);
  const withBends = bent({ ...draft, elements: placed, segments });
  return {
    ...draft,
    elements: unblocked({ ...draft, elements: withBends, segments }, stage),
    segments,
  };
}

/** Whether an arrow's middle passes through a box, with a little room. */
function through(samples: VisualPoint[], box: Box): boolean {
  return samples.some(
    ([x, y]) =>
      x > box.x - 2 &&
      x < box.x + box.w + 2 &&
      y > box.y - 2 &&
      y < box.y + box.h + 2,
  );
}

/**
 * A word an arrow still runs through after the bends is moved out of its
 * way: up or down, then sideways, by a step or two, to the first spot
 * inside the margin, clear of that arrow and on no other lit box. A word
 * with no such spot is left for the model.
 */
function unblocked(script: VisualScript, stage: Stage): VisualElement[] {
  const elements = script.elements.map((e) => ({ ...e }));
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const visible = visibleAfterEach(script);
  for (const arrow of elements) {
    if (arrow.type !== 'line' && arrow.type !== 'arrow') continue;
    const owns = new Set(
      [arrow.from, arrow.to].filter((e) => typeof e === 'string'),
    );
    for (const ids of visible) {
      if (!ids.has(arrow.id)) continue;
      for (const id of ids) {
        const word = byId.get(id) as VisualElement & {
          x?: number;
          y?: number;
        };
        if (!word || owns.has(id) || word.x === undefined) continue;
        if (word.type !== 'label' && word.type !== 'chip') continue;
        // A picture's name stays under its picture.
        if (word.id.endsWith('_name')) continue;
        const box = boxOf(word);
        if (!box || !through(arrowSamples(arrow, byId), box)) continue;
        const others = [...ids]
          .filter((other) => other !== id && byId.has(other))
          .filter((other) => collides(byId.get(other)!))
          .map((other) => boxOf(byId.get(other)!))
          .filter((b): b is Box => Boolean(b));
        const original = { x: word.x, y: word.y ?? 0 };
        const up = box.h + VISUAL_GAP;
        const side = box.w / 2 + VISUAL_GAP;
        const steps = [
          [0, -up],
          [0, up],
          [-side, 0],
          [side, 0],
          [-side, -up],
          [side, -up],
          [-side, up],
          [side, up],
          [0, -2 * up],
          [0, 2 * up],
          [-2 * side, 0],
          [2 * side, 0],
        ];
        for (const [dx, dy] of steps) {
          word.x = round(original.x + dx);
          word.y = round(original.y + dy);
          const moved = boxOf(word)!;
          const inside =
            moved.x >= stage.M &&
            moved.y >= stage.M &&
            moved.x + moved.w <= stage.W - stage.M &&
            moved.y + moved.h <= stage.H - stage.M;
          const clear =
            inside &&
            !through(arrowSamples(arrow, byId), moved) &&
            others.every((o) => {
              const ov = overlap(moved, o);
              return ov.x <= 4 || ov.y <= 4 || contained(moved, o);
            });
          if (clear) break;
          word.x = original.x;
          word.y = original.y;
        }
      }
    }
  }
  return elements;
}

/** The bends tried, in order, for an arrow that runs through a word; the mender may bend further than the model. */
const BENDS = [16, -16, 30, -30, 40, -40, 55, -55];

/**
 * An arrow through a label or chip is bent until it clears them, the
 * gentlest bend first, either way. One that clears nothing is left for
 * the model, which can move the word instead.
 */
function bent(script: VisualScript): VisualElement[] {
  const elements = script.elements.map((e) => ({ ...e }));
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const visible = visibleAfterEach(script);
  const crossesAny = (
    arrow: Extract<VisualElement, { type: 'line' | 'arrow' }>,
  ): boolean => {
    const owns = new Set(
      [arrow.from, arrow.to].filter((e) => typeof e === 'string'),
    );
    return visible.some((ids) => {
      if (!ids.has(arrow.id)) return false;
      const samples = arrowSamples(arrow, byId);
      for (const id of ids) {
        const other = byId.get(id);
        if (!other || owns.has(id)) continue;
        if (other.type !== 'label' && other.type !== 'chip') continue;
        const box = boxOf(other);
        if (!box) continue;
        if (
          samples.some(
            ([x, y]) =>
              x > box.x - 2 &&
              x < box.x + box.w + 2 &&
              y > box.y - 2 &&
              y < box.y + box.h + 2,
          )
        ) {
          return true;
        }
      }
      return false;
    });
  };
  for (const element of elements) {
    if (element.type !== 'arrow') continue;
    if (!crossesAny(element)) continue;
    const original = element.bend ?? 0;
    for (const bend of BENDS) {
      element.bend = bend;
      if (!crossesAny(element)) break;
      element.bend = original;
    }
  }
  return elements;
}

/** How many elements a student takes in at once; beyond it, older ones are dimmed. */
export const CALM_VISIBLE = 8;

/**
 * Crowd control the model did not do: after any sentence that leaves more
 * than CALM_VISIBLE elements lit, the ones shown longest ago that this
 * sentence does not touch are dimmed, oldest first, with the arrows that
 * hang off them. The centre of the picture, its shapes, stays lit.
 */
function calmed(script: VisualScript): VisualSegment[] {
  const byId = new Map(script.elements.map((e) => [e.id, e] as const));
  const lit = new Map<string, number>(); // element -> sentence it was shown in
  const dimmed = new Set<string>();
  return script.segments.map((segment, index) => {
    const touched = new Set(segment.cues.map((cue) => cue.target));
    for (const cue of segment.cues) {
      if (cue.do === 'clear') {
        lit.clear();
        dimmed.clear();
      } else if (SHOWS.has(cue.do)) {
        lit.set(cue.target, index);
        dimmed.delete(cue.target);
      } else if (cue.do === 'hide') {
        lit.delete(cue.target);
        dimmed.delete(cue.target);
      } else if (cue.do === 'dim') dimmed.add(cue.target);
      else if (cue.do === 'undim') dimmed.delete(cue.target);
    }
    const bright = [...lit.keys()].filter((id) => !dimmed.has(id));
    if (bright.length <= CALM_VISIBLE) return segment;
    const extra: VisualCue[] = [];
    const candidates = bright
      .filter((id) => {
        const element = byId.get(id);
        return (
          element &&
          element.type !== 'shape' &&
          element.type !== 'line' &&
          element.type !== 'arrow' &&
          !touched.has(id) &&
          (lit.get(id) ?? index) < index
        );
      })
      .sort((a, b) => (lit.get(a) ?? 0) - (lit.get(b) ?? 0));
    let count = bright.length;
    const last = Math.max(wordsOf(segment.text).length - 1, 0);
    for (const id of candidates) {
      if (count <= CALM_VISIBLE) break;
      extra.push({ at: last, do: 'dim', target: id });
      dimmed.add(id);
      count -= 1;
      // An arrow attached to a dimmed thing dims with it.
      for (const element of script.elements) {
        if (
          (element.type === 'arrow' || element.type === 'line') &&
          lit.has(element.id) &&
          !dimmed.has(element.id) &&
          (element.from === id || element.to === id)
        ) {
          extra.push({ at: last, do: 'dim', target: element.id });
          dimmed.add(element.id);
          count -= 1;
        }
      }
    }
    return extra.length
      ? { ...segment, cues: [...segment.cues, ...extra] }
      : segment;
  });
}

/** Every box inside the margin, a unit to spare so rounding cannot put it back over. */
function clampAll(elements: VisualElement[], stage: Stage): VisualElement[] {
  return elements.map((element) => {
    const copy = { ...element };
    const box = boxOf(copy);
    if (!box || copy.type === 'dots') return copy;
    // A unit inside the margin, so rounding the centre cannot put the box
    // back over it.
    const clampedX = Math.min(
      Math.max(box.x, stage.M + 1),
      stage.W - stage.M - 1 - box.w,
    );
    const clampedY = Math.min(
      Math.max(box.y, stage.M + 1),
      stage.H - stage.M - 1 - box.h,
    );
    const dx = clampedX - box.x;
    const dy = clampedY - box.y;
    if (dx || dy) {
      const placed = copy as { x: number; y: number };
      placed.x = round(placed.x + dx);
      placed.y = round(placed.y + dy);
    }
    return copy;
  });
}

// ── Timing ────────────────────────────────────────────────────────────────

/** Visuals that begin a breath before the word feel in sync; on the word feels late. */
export const ANTICIPATION_MS = 120;
/** A card comes in this long before its first word, inside the pause before the sentence. */
export const CARD_LEAD_MS = 450;
/** The least silence kept after the sentence before, so a card never lands on its last word. */
export const CARD_CLEAR_MS = 40;
/** Two effects on different targets closer than this are staggered so each reads. */
export const CROWDING_MS = 100;
/** Silence the voice leaves between sentences, for the estimate. */
export const SENTENCE_GAP_MS = 350;

/**
 * The spoken text of a whole scene: each sentence's spoken form, one
 * per line, with where each sentence starts in it. The voice and the
 * aligner both see exactly this text.
 */
export function sceneSpoken(forms: SpokenForm[]): {
  text: string;
  starts: number[];
} {
  const starts: number[] = [];
  let text = '';
  forms.forEach((form, index) => {
    if (index > 0) text += '\n';
    starts.push(text.length);
    text += form.text;
  });
  return { text, starts };
}

/**
 * Word times guessed for a voice that was never measured, pinned to the
 * sentences: the silences the voice was asked for are taken out first,
 * each sentence gets a share of what is left by its length, and its
 * words are spread inside it. The guess never crosses a sentence.
 */
export function estimateVisualWordTimes(input: {
  forms: SpokenForm[];
  /** Silence after each sentence, in seconds, as the voice was asked. */
  pausesS: number[];
  durationMs: number;
  audioKey: string;
  /** Where each sentence starts, when the voice measured its pieces; the guess is pinned to them. */
  pieceStartsMs?: number[];
}): WordTimes {
  const { forms, pausesS, durationMs, audioKey } = input;
  const { text, starts } = sceneSpoken(forms);
  const whole = estimateWordTimes(text, durationMs, audioKey);
  const windows = sentenceWindows(
    forms.length,
    pausesS,
    durationMs,
    input.pieceStartsMs,
  );
  const silence = pausesS.reduce((sum, s) => sum + s, 0) * 1000;
  const speech = Math.max(durationMs * 0.4, durationMs - silence);
  const chars = forms.reduce((sum, form) => sum + form.text.length, 0) || 1;
  const perChar = speech / chars;
  const words: number[][] = [];
  let cursor = 0;
  forms.forEach((form, index) => {
    const start = starts[index];
    const window = windows?.[index];
    const from0 = window ? window[0] : cursor;
    const span = window
      ? Math.max(200, window[1] - window[0])
      : form.text.length * perChar;
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(form.text)) !== null) {
      const from = match.index;
      const to = from + match[0].length;
      words.push([
        start + from,
        start + to,
        Math.round(from0 + (from / form.text.length) * span),
        Math.round(from0 + (to / form.text.length) * span),
      ]);
    }
    cursor = window
      ? window[1] + (pausesS[index] ?? 0) * 1000
      : cursor + span + (pausesS[index] ?? 0) * 1000;
  });
  return { ...whole, words };
}

/**
 * The span each sentence is spoken in, from where the voice said its
 * pieces start: a sentence runs from its start to the next start less
 * the pause after it; the last to the end less its pause. Null when the
 * voice measured nothing or the count does not match.
 */
export function sentenceWindows(
  count: number,
  pausesS: number[],
  durationMs: number,
  pieceStartsMs?: number[],
): [number, number][] | null {
  if (!pieceStartsMs || pieceStartsMs.length !== count || count === 0)
    return null;
  for (let i = 1; i < count; i += 1)
    if (pieceStartsMs[i] < pieceStartsMs[i - 1]) return null;
  return pieceStartsMs.map((start, i) => {
    const next = i + 1 < count ? pieceStartsMs[i + 1] : durationMs;
    const end = Math.max(start + 200, next - (pausesS[i] ?? 0) * 1000);
    return [start, end];
  });
}

/**
 * Measured words pinned to the sentences the voice said it spoke: a
 * sentence whose words the aligner put outside its own span, by more
 * than a hearing's worth, is remapped into that span, so the aligner
 * only ever decides where a word falls inside its sentence.
 */
export function pinWordTimes(
  times: WordTimes,
  forms: SpokenForm[],
  pausesS: number[],
  durationMs: number,
  pieceStartsMs?: number[],
): WordTimes {
  const windows = sentenceWindows(
    forms.length,
    pausesS,
    durationMs,
    pieceStartsMs,
  );
  if (!windows) return times;
  const { starts } = sceneSpoken(forms);
  const words = times.words.map((w) => [...w]);
  forms.forEach((form, index) => {
    const start = starts[index];
    const end = start + form.text.length;
    const own = words.filter((w) => w[0] >= start && w[1] <= end && w[2] >= 0);
    if (!own.length) return;
    const [ws, we] = windows[index];
    const first = Math.min(...own.map((w) => w[2]));
    const last = Math.max(...own.map((w) => w[3]));
    if (first >= ws - PIN_SLACK_MS && last <= we + PIN_SLACK_MS) return;
    const scale = last > first ? (we - ws) / (last - first) : 1;
    for (const w of own) {
      w[2] = Math.round(ws + (w[2] - first) * scale);
      w[3] = Math.round(ws + (w[3] - first) * scale);
    }
  });
  return { ...times, words };
}

/** How far outside its sentence's span a measured word may fall before the sentence is pinned. */
export const PIN_SLACK_MS = 150;

/** No card shorter than this, so a learner can take it in. */
export const SHORTEST_CARD_MS = 3000;

/**
 * What is wrong with a timeline's beats: a cue outside its sentence, a
 * card's parts out of order, a card gone before it can be read, two
 * cards on one beat. Deterministic, so a page that fails is remade on
 * the estimate rather than saved wrong.
 */
export function timingProblems(timeline: VisualTimeline): string[] {
  const problems: string[] = [];
  timeline.segments.forEach((segment, index) => {
    const low = segment.startMs - CARD_LEAD_MS - 250;
    const high = segment.endMs + 400;
    for (const cue of segment.cues) {
      if (cue.atMs < low || cue.atMs > high)
        problems.push(
          `Sentence ${index + 1}: "${cue.do}" on "${cue.target}" lands at ${cue.atMs} ms, outside its sentence (${segment.startMs} to ${segment.endMs}).`,
        );
    }
  });
  // A card's parts in the card's order: m3_p0 before m3_p1, and so on.
  const shows = new Map<string, number>();
  for (const segment of timeline.segments)
    for (const cue of segment.cues)
      if ((cue.do === 'draw' || cue.do === 'fade') && !shows.has(cue.target))
        shows.set(cue.target, cue.atMs);
  const parts = new Map<string, { k: number; at: number }[]>();
  for (const [target, at] of shows) {
    const match = /^(m\d+)_p(\d+)$/.exec(target);
    if (!match) continue;
    const list = parts.get(match[1]) ?? [];
    list.push({ k: Number(match[2]), at });
    parts.set(match[1], list);
  }
  for (const [moment, list] of parts) {
    list.sort((a, b) => a.k - b.k);
    for (let i = 1; i < list.length; i += 1)
      if (list[i].at < list[i - 1].at)
        problems.push(
          `${moment}: part ${list[i].k + 1} shows at ${list[i].at} ms, before part ${list[i - 1].k} at ${list[i - 1].at} ms.`,
        );
  }
  const clears = timeline.segments
    .flatMap((s) => s.cues.filter((c) => c.do === 'clear').map((c) => c.atMs))
    .sort((a, b) => a - b);
  const stops = [0, ...clears, timeline.durationMs];
  for (let i = 1; i < stops.length; i += 1) {
    const span = stops[i] - stops[i - 1];
    if (span < CROWDING_MS)
      problems.push(
        `Two cards change within ${span} ms of each other at ${stops[i]} ms.`,
      );
    else if (span < SHORTEST_CARD_MS && i < stops.length - 1)
      problems.push(
        `The card from ${stops[i - 1]} ms to ${stops[i]} ms is on screen ${span} ms; a card holds at least ${SHORTEST_CARD_MS}.`,
      );
  }
  return problems;
}

/**
 * Every cue on the audio. A cue names a word of its written sentence; the
 * spoken form says which spoken words that became; the measured words say
 * when the first of those is heard. Draws and fades land a breath early;
 * crowded cues on different targets are staggered.
 */
export function timeVisual(input: {
  script: VisualScript;
  /** The wide staging's elements, laid out from the same tutorial; the script's are the box's. */
  wide?: VisualElement[];
  forms: SpokenForm[];
  times: WordTimes;
  durationMs: number;
  timing: 'aligned' | 'estimated';
  generator?: string;
  plain?: number[];
}): VisualTimeline {
  const { script, forms, times } = input;
  const { starts } = sceneSpoken(forms);
  let previousEnd = 0;
  const segments: TimedSegment[] = script.segments.map((segment, index) => {
    const form = forms[index];
    const start = starts[index];
    const end = start + form.text.length;
    // The measured words of this sentence, by their place in the scene's text.
    const words = times.words.filter((w) => w[0] >= start && w[1] <= end);
    const startMs = words.length ? words[0][2] : 0;
    const endMs = words.length ? words[words.length - 1][3] : startMs;
    // What comes in on the sentence's first word lands before the voice,
    // in the pause the reader hears before it: the card is there when
    // the words begin. Inside the sentence, a breath early.
    const lead = Math.max(previousEnd + CARD_CLEAR_MS, startMs - CARD_LEAD_MS);
    const cues: TimedCue[] = segment.cues.map((cue) => {
      const span = form.spans[cue.at];
      const spokenIndex = span ? span[0] : cue.at;
      const word = words[Math.min(spokenIndex, Math.max(words.length - 1, 0))];
      let atMs = word ? word[2] : startMs;
      if (cue.at === 0 && (SHOWS.has(cue.do) || cue.do === 'clear'))
        atMs = Math.min(startMs, lead);
      else if (SHOWS.has(cue.do))
        atMs = Math.max(startMs, atMs - ANTICIPATION_MS);
      return { atMs, do: cue.do, target: cue.target };
    });
    previousEnd = endMs;
    return { text: segment.text, startMs, endMs, words, cues };
  });
  // Crowding, across the whole scene in time order.
  const all = segments.flatMap((s) => s.cues).sort((a, b) => a.atMs - b.atMs);
  for (let i = 1; i < all.length; i += 1) {
    const prev = all[i - 1];
    const cue = all[i];
    if (cue.target !== prev.target && cue.atMs - prev.atMs < CROWDING_MS) {
      cue.atMs = prev.atMs + CROWDING_MS;
    }
  }
  for (const segment of segments) segment.cues.sort((a, b) => a.atMs - b.atMs);
  const box = VISUAL_STAGINGS.box;
  const wide = VISUAL_STAGINGS.wide;
  return {
    version: 2,
    generator: input.generator ?? VISUAL_GENERATOR_VERSION,
    title: script.title,
    space: { w: box.w, h: box.h },
    elements: script.elements,
    segments,
    durationMs: input.durationMs,
    timing: input.timing,
    ...(input.plain?.length ? { plain: input.plain } : {}),
    stagings: {
      box: { space: { w: box.w, h: box.h }, elements: script.elements },
      wide: {
        space: { w: wide.w, h: wide.h },
        elements: input.wide ?? script.elements,
      },
    },
  };
}
