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
import { contentWords, type WordTimes } from './board';
import { grounded } from './sketch';
import type { SpokenForm } from './spoken';

export const VISUAL_GENERATOR_VERSION = 'visual-1';

export const VISUAL_SPACE = { w: 360, h: 270 } as const;
/** Nothing sits closer than this to an edge. */
export const VISUAL_MARGIN = 12;
/** The least gap between two visible boxes. */
export const VISUAL_GAP = 10;
export const VISUAL_LIMITS = {
  minElements: 1,
  maxElements: 24,
  minSegments: 3,
  maxSegments: 14,
  maxCuesPerSegment: 8,
  minWordsPerSegment: 4,
  maxWordsPerSegment: 30,
  minWords: 60,
  maxWords: 330,
  maxLabelChars: 40,
  maxChipChars: 16,
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
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

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
      size?: 'sm' | 'md' | 'lg' | 'xl';
      color?: VisualColor;
      anchor?: 'start' | 'middle' | 'end';
    }
  | {
      id: string;
      type: 'chip';
      x: number;
      y: number;
      text: string;
      color?: VisualColor;
    }
  | {
      id: string;
      type: 'shape';
      x: number;
      y: number;
      w: number;
      h: number;
      kind: ShapeKind;
      /** A short word inside the shape, when it needs one. */
      text?: string;
      color?: VisualColor;
      fill?: 'solid' | 'outline' | 'tint';
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
]);
/** The actions that bring an element on screen. */
const SHOWS = new Set<VisualAction>(['draw', 'fade']);

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
export interface VisualTimeline {
  version: 1;
  generator: string;
  title: string;
  space: { w: number; h: number };
  elements: VisualElement[];
  segments: TimedSegment[];
  durationMs: number;
  /** How the words were measured: the aligner, or an estimate from the length. */
  timing: 'aligned' | 'estimated';
}

// ── Words ─────────────────────────────────────────────────────────────────

/** The words of a sentence as cues count them: a whitespace split after trimming, punctuation kept. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
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
        if (!(SHAPE_KINDS as readonly string[]).includes(element.kind)) {
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
        element.type === 'label' || element.type === 'chip'
          ? element.text
          : element.type === 'shape'
            ? (element.text ?? '')
            : '';
      if (text && !grounded(text, pool)) {
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
    if (segment.cues.length > VISUAL_LIMITS.maxCuesPerSegment) {
      problems.push(
        `Sentence ${n} has ${segment.cues.length} cues; at most ${VISUAL_LIMITS.maxCuesPerSegment}.`,
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
export const LABEL_SIZE = { sm: 10, md: 12, lg: 15, xl: 19 } as const;
/** A glyph's width as a share of the type size, for the reading font at its average. */
const GLYPH = 0.56;
export const CHIP_HEIGHT = 26;
export const CHIP_PAD = 24;
export const CHIP_MIN_WIDTH = 44;

export function textWidth(text: string, size: number): number {
  return Math.round(text.length * size * GLYPH);
}

/** The bounding box of an element, or null for a line or an arrow, which are not boxes. */
export function boxOf(element: VisualElement): Box | null {
  switch (element.type) {
    case 'label': {
      const size = LABEL_SIZE[element.size ?? 'md'];
      const w = textWidth(element.text, size);
      const left =
        element.anchor === 'start'
          ? element.x
          : element.anchor === 'end'
            ? element.x - w
            : element.x - w / 2;
      return { x: left, y: element.y - size * 0.7, w, h: size * 1.4 };
    }
    case 'chip': {
      const w = Math.max(
        CHIP_MIN_WIDTH,
        textWidth(element.text, 11) + CHIP_PAD,
      );
      return {
        x: element.x - w / 2,
        y: element.y - CHIP_HEIGHT / 2,
        w,
        h: CHIP_HEIGHT,
      };
    }
    case 'shape':
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

/**
 * What is wrong with where things sit: a box over an edge, or two visible
 * boxes over each other by more than four units both ways. Lines and
 * arrows are not boxes. Reported with the numbers a repair needs.
 */
export function layoutProblems(script: VisualScript): string[] {
  const problems: string[] = [];
  const byId = new Map(script.elements.map((e) => [e.id, e] as const));
  const boxes = new Map<string, Box>();
  for (const element of script.elements) {
    const box = boxOf(element);
    if (!box) continue;
    boxes.set(element.id, box);
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    if (
      box.x < VISUAL_MARGIN ||
      box.y < VISUAL_MARGIN ||
      right > VISUAL_SPACE.w - VISUAL_MARGIN ||
      bottom > VISUAL_SPACE.h - VISUAL_MARGIN
    ) {
      problems.push(
        `"${element.id}" runs outside the canvas margin: it spans ${round(box.x)} to ${round(right)} across and ${round(box.y)} to ${round(bottom)} down; keep everything ${VISUAL_MARGIN} units inside 0 to ${VISUAL_SPACE.w} by 0 to ${VISUAL_SPACE.h}.`,
      );
    }
  }
  const seen = new Set<string>();
  visibleAfterEach(script).forEach((visible, index) => {
    const ids = [...visible].filter(
      (id) => boxes.has(id) && collides(byId.get(id)!),
    );
    if (visible.size > VISUAL_LIMITS.maxVisible) {
      problems.push(
        `After sentence ${index + 1}, ${visible.size} elements are on screen; keep it to ${VISUAL_LIMITS.maxVisible} by dimming or hiding what is no longer discussed.`,
      );
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
export function repairVisual(script: VisualScript): VisualScript {
  const elements = clampAll(script.elements);
  // Nudge pairs that overlap in any sentence, a few rounds, later one moves.
  const draft: VisualScript = { ...script, elements };
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
          const mover = map.get(ids[j]) as VisualElement & {
            x?: number;
            y?: number;
          };
          if (mover.type === 'dots' || mover.x === undefined) continue;
          // Along the axis of least overlap, away from the other box; and
          // when that way runs into the edge, the other way, so the clamp
          // at the end never undoes the nudge.
          if (o.x < o.y) {
            const step = o.x + VISUAL_GAP;
            let dir = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1;
            if (
              b.x + dir * step < VISUAL_MARGIN ||
              b.x + b.w + dir * step > VISUAL_SPACE.w - VISUAL_MARGIN
            ) {
              dir = -dir;
            }
            mover.x = round(mover.x + dir * step);
          } else {
            const step = o.y + VISUAL_GAP;
            let dir = b.y + b.h / 2 >= a.y + a.h / 2 ? 1 : -1;
            if (
              b.y + dir * step < VISUAL_MARGIN ||
              b.y + b.h + dir * step > VISUAL_SPACE.h - VISUAL_MARGIN
            ) {
              dir = -dir;
            }
            mover.y = round((mover.y ?? 0) + dir * step);
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  // Cues in word order, and a cue past the sentence's last word lands on
  // it: the element is still shown, just late, which beats a lost cue.
  const segments = draft.segments.map((segment) => {
    const last = Math.max(wordsOf(segment.text).length - 1, 0);
    return {
      ...segment,
      cues: [...segment.cues]
        .map((cue) => ({
          ...cue,
          at: Math.min(Math.max(Math.round(cue.at), 0), last),
        }))
        .sort((a, b) => a.at - b.at),
    };
  });
  // A nudge can push a box over the edge; the edge wins, and a box that
  // then overlaps again is the model's to mend.
  return { ...draft, elements: clampAll(draft.elements), segments };
}

/** Every box inside the margin, a unit to spare so rounding cannot put it back over. */
function clampAll(elements: VisualElement[]): VisualElement[] {
  return elements.map((element) => {
    const copy = { ...element };
    const box = boxOf(copy);
    if (!box || copy.type === 'dots') return copy;
    // A unit inside the margin, so rounding the centre cannot put the box
    // back over it.
    const clampedX = Math.min(
      Math.max(box.x, VISUAL_MARGIN + 1),
      VISUAL_SPACE.w - VISUAL_MARGIN - 1 - box.w,
    );
    const clampedY = Math.min(
      Math.max(box.y, VISUAL_MARGIN + 1),
      VISUAL_SPACE.h - VISUAL_MARGIN - 1 - box.h,
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
/** Two effects on different targets closer than this are staggered so each reads. */
export const CROWDING_MS = 150;
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
 * Every cue on the audio. A cue names a word of its written sentence; the
 * spoken form says which spoken words that became; the measured words say
 * when the first of those is heard. Draws and fades land a breath early;
 * crowded cues on different targets are staggered.
 */
export function timeVisual(input: {
  script: VisualScript;
  forms: SpokenForm[];
  times: WordTimes;
  durationMs: number;
  timing: 'aligned' | 'estimated';
  generator?: string;
}): VisualTimeline {
  const { script, forms, times } = input;
  const { starts } = sceneSpoken(forms);
  const segments: TimedSegment[] = script.segments.map((segment, index) => {
    const form = forms[index];
    const start = starts[index];
    const end = start + form.text.length;
    // The measured words of this sentence, by their place in the scene's text.
    const words = times.words.filter((w) => w[0] >= start && w[1] <= end);
    const startMs = words.length ? words[0][2] : 0;
    const endMs = words.length ? words[words.length - 1][3] : startMs;
    const cues: TimedCue[] = segment.cues.map((cue) => {
      const span = form.spans[cue.at];
      const spokenIndex = span ? span[0] : cue.at;
      const word = words[Math.min(spokenIndex, Math.max(words.length - 1, 0))];
      let atMs = word ? word[2] : startMs;
      if (SHOWS.has(cue.do)) atMs = Math.max(startMs, atMs - ANTICIPATION_MS);
      return { atMs, do: cue.do, target: cue.target };
    });
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
  return {
    version: 1,
    generator: input.generator ?? VISUAL_GENERATOR_VERSION,
    title: script.title,
    space: { ...VISUAL_SPACE },
    elements: script.elements,
    segments,
    durationMs: input.durationMs,
    timing: input.timing,
  };
}
