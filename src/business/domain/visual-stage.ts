/**
 * A scene as a stage that keeps moving, in place of a card a moment.
 *
 * The card model laid everything a moment needed at once and held it for
 * the ten or twelve seconds the moment took, then wiped the stage. That
 * is a slideshow. A good explainer keeps a small cast on one stage for a
 * stretch at a time and does something to it every second or two: a thing
 * arrives, a name attaches to it, a cross goes over it, an arrow grows to
 * the next thing, something travels down the arrow, the whole lot shifts
 * to make room. Nothing is wiped until the subject changes.
 *
 * So the model here is a cast and a stream of events, not a card. A
 * section is a run of sentences that share one stage. A beat is one
 * sentence, carrying one or two events. This file turns that into the
 * elements and cues the player already understands, and says what is
 * wrong with a scene before anything is drawn.
 *
 * Words are the other half of it. Nothing on this stage is a sentence:
 * the most any one piece of text may be is four words, and the whole
 * stage holds twelve. A learner listening cannot read a paragraph as
 * well, and the paragraph is already in the document they are reading.
 */
import {
  STAGES,
  type Stage,
  type VisualColor,
  type VisualCue,
  type VisualElement,
  type VisualIcon,
  type VisualPlace,
  type VisualScript,
  type VisualSegment,
} from './visual';
import { PAUSE_S, SCENE_SPEED, findWord } from './visual-cards';
import { resolveDrawing } from './visual-figures';

/**
 * The form a thing takes when the library has no drawing of it. These
 * are not art; they are the shapes a person draws on a whiteboard, and
 * between them they carry most of what a page names.
 */
export const STAGE_FORMS = [
  'box',
  'stack',
  'store',
  'person',
  'people',
  'doc',
  'gate',
  'ring',
  'cloud',
  'note',
  'clock',
  'money',
] as const;
export type StageForm = (typeof STAGE_FORMS)[number];

/** What a beat does to the stage. Eleven, and no more. */
export const EVENT_KINDS = [
  /** A thing arrives and takes its place. */
  'place',
  /** A short name attaches to a thing. */
  'name',
  /** A cross, a tick, a warning or a number goes on top of a thing. */
  'mark',
  /** An arrow grows from one thing to another, with a word or two on it. */
  'link',
  /** Something travels along a link. */
  'send',
  /** A thing multiplies. */
  'copy',
  /** The cast takes new places. */
  'move',
  /** A thing becomes another in the same place. */
  'swap',
  /** A number beside a thing changes. */
  'count',
  /** Everything but these dims. */
  'focus',
  /** A thing leaves. */
  'drop',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The badges a mark may be: a symbol laid on a thing, never a word. */
export const BADGES = ['cross', 'tick', 'warn', 'star', 'number'] as const;
export type Badge = (typeof BADGES)[number];

/** A thing on the stage. It takes a place when it arrives and keeps it. */
export interface StageThing {
  /** What a beat calls it, in the page's own words, one to three words. */
  name: string;
  /** A drawing from the library, by name. */
  picture?: string | null;
  /** The form it takes when there is no drawing. */
  form?: StageForm | null;
  /** What is written under it, one to three words; its name when absent. */
  label?: string | null;
  color?: VisualColor;
}

export interface StageEvent {
  do: EventKind;
  /** The things it acts on, by name: one for most, two for a link or a send. */
  what: string[];
  /** A word or two riding on it: a link's label, a count, a swap's new name. */
  text?: string | null;
  badge?: Badge | null;
  color?: VisualColor;
  /** How many a copy makes, two to five. */
  n?: number | null;
}

/** One sentence and what it does to the stage. */
export interface StageBeat {
  /** The sentence, zero-based, in the scene's own numbering. */
  sentence: number;
  events: StageEvent[];
}

/** A run of sentences that share one stage. */
export interface StageSection {
  /** Shown at the top while the section runs: up to four words. */
  title?: string | null;
  cast: StageThing[];
  beats: StageBeat[];
}

export interface StageScene {
  title: string;
  sentences: string[];
  sections: StageSection[];
  fit?: 'good' | 'poor';
  fitReason?: string | null;
}

export const STAGE_LIMITS = {
  /** Things on one stage. More than six and none of them is legible. */
  maxCast: 6,
  minCast: 1,
  /** Words in any one piece of text on the stage. */
  maxRunWords: 4,
  /** Words visible at once, counting every name, label and badge. */
  maxWordsOnStage: 12,
  maxTitleWords: 4,
  maxEventsPerBeat: 2,
  maxSections: 8,
  minSentences: 8,
  maxSentences: 48,
  /** A sentence this long or longer is expected to carry two events. */
  longSentence: 13,
  maxCopies: 5,
} as const;

/** A sentence at least this long has room for the stage to stand still in. */
const LONG_ENOUGH_TO_WANDER = 9;

const words = (text: string): string[] =>
  text.trim().split(/\s+/).filter(Boolean);

/** Text cut to a number of words at a word boundary, never mid-word. */
export function shorten(
  text: string | null | undefined,
  maxWords: number = STAGE_LIMITS.maxRunWords,
): string | null {
  const ws = words((text ?? '').replace(/[.;:,]+$/, ''));
  return ws.length ? ws.slice(0, maxWords).join(' ') : null;
}

/* ------------------------------------------------------------------ *
 * Where things stand
 * ------------------------------------------------------------------ */

/** The band the cast stands in, under the title and above the floor. */
const BAND = { top: 62, bottom: 232 };
/** How big one thing is drawn, by how many share the stage. */
const SIZES = [120, 116, 96, 80, 70, 62, 56];
/** A name sits this far under the thing it names. */
const NAME_DROP = 11;

export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the cast stands: in a row across the middle, which is how a
 * person draws two or three things that act on one another, or in a
 * column down the left, which is where they go when something new needs
 * the room. Every thing has both places from the start, so a move is one
 * cue and not a re-layout.
 */
export function placesFor(
  count: number,
  stage: Stage = STAGES.box,
): { row: Placed[]; column: Placed[] } {
  const n = Math.max(1, Math.min(STAGE_LIMITS.maxCast, count));
  const size = SIZES[n] ?? SIZES[SIZES.length - 1];
  const midY = (BAND.top + BAND.bottom) / 2;
  const row: Placed[] = [];
  if (n <= 3) {
    const span = stage.W - 2 * stage.M - size;
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      row.push({
        x: stage.M + size / 2 + span * t,
        y: midY,
        w: size,
        h: size,
      });
    }
  } else {
    // Two rows, the fuller one on top, so the eye reads it as a group.
    const top = Math.ceil(n / 2);
    const rows = [top, n - top];
    let k = 0;
    rows.forEach((many, r) => {
      const span = stage.W - 2 * stage.M - size;
      const y = midY + (r === 0 ? -1 : 1) * (size / 2 + 14);
      for (let i = 0; i < many; i += 1) {
        const t = many === 1 ? 0.5 : i / (many - 1);
        row.push({ x: stage.M + size / 2 + span * t, y, w: size, h: size });
        k += 1;
      }
    });
    if (k !== n) row.length = n;
  }
  // The column: smaller, down the left, leaving the right two thirds free.
  const small = Math.min(size, 58);
  const step = Math.min(
    small + 12,
    (BAND.bottom - BAND.top - small) / Math.max(1, n - 1),
  );
  const height = small + step * (n - 1);
  const startY = midY - height / 2 + small / 2;
  const column: Placed[] = [];
  for (let i = 0; i < n; i += 1)
    column.push({
      x: stage.M + small / 2 + 6,
      y: startY + step * i,
      w: small,
      h: small,
    });
  return { row, column };
}

/* ------------------------------------------------------------------ *
 * The drawing of one thing
 * ------------------------------------------------------------------ */

/** The plain shape a form is drawn as, when there is no picture. */
const FORM_SHAPE: Record<StageForm, string> = {
  box: 'roundRect',
  stack: 'server',
  store: 'database',
  person: 'person',
  people: 'people',
  doc: 'document',
  gate: 'diamond',
  ring: 'circle',
  cloud: 'cloud',
  note: 'document',
  clock: 'clock',
  money: 'money',
};

/** What the form falls back to when the library has no drawing of it either. */
const FORM_PLAIN: Record<StageForm, string> = {
  box: 'roundRect',
  stack: 'rect',
  store: 'ellipse',
  person: 'circle',
  people: 'circle',
  doc: 'rect',
  gate: 'diamond',
  ring: 'circle',
  cloud: 'ellipse',
  note: 'rect',
  clock: 'circle',
  money: 'circle',
};

/**
 * How a thing is drawn: the library's picture, what its own words say it
 * is shaped like, the form's shape, or — when none of those answer — its
 * name, written.
 *
 * The last of those is the point. Asking only whether the library knows
 * a name leaves every abstract word falling through to a plain box, and
 * a box with nothing in it and its name underneath reads as a picture
 * that failed to arrive. A labelled card is not a failure: a learner who
 * is told what they are looking at has been taught something, and a
 * confident wrong picture teaches them something false.
 */
export function shapeOf(
  thing: StageThing,
  known: (name: string) => boolean,
): { kind: string; words: boolean } {
  const picture = thing.picture?.trim();
  if (picture && known(picture)) return { kind: picture, words: false };
  // The name the library actually files this under: a search by meaning
  // places "screen images" on `images`, and a living thing on the figure
  // its words say it is. Asking `known` alone never reaches either.
  if (picture) {
    const found = resolveDrawing(picture);
    if (found?.kind === 'picture' && known(found.name))
      return { kind: found.name, words: false };
  }
  const form = thing.form ?? 'box';
  const drawn = FORM_SHAPE[form];
  if (drawn && known(drawn)) return { kind: drawn, words: false };
  // Nothing in the library draws this, so what is left is a plain
  // shape — and a plain shape carries the name inside it.
  //
  // The narrator gives nearly everything the form "box", so treating a
  // named form as a drawing in its own right meant almost every
  // undrawable thing became an empty rounded rectangle with its name
  // underneath: a picture that failed to arrive. A diamond still reads
  // as a decision and a cloud as a cloud, and both read better with the
  // word in them than without it.
  return { kind: FORM_PLAIN[form] ?? 'roundRect', words: true };
}

/* ------------------------------------------------------------------ *
 * Laying a scene out
 * ------------------------------------------------------------------ */

export interface StageContext {
  /** Whether the library can draw a name. Everything is drawable in a test. */
  known?: (name: string) => boolean;
  stage?: Stage;
}

/** Where a badge is written: the corner of the place its thing stands in. */
const cornerOf = (
  place: Placed,
  corner: 'topRight' | 'centre',
  stage: Stage,
): { x: number; y: number } =>
  corner === 'centre'
    ? { x: place.x, y: place.y }
    : {
        x: Math.min(place.x + place.w / 2 - 2, stage.W - stage.M - 14),
        y: Math.max(place.y - place.h / 2 + 2, stage.M + 14),
      };

const BADGE_ICON: Record<Exclude<Badge, 'number'>, VisualIcon> = {
  cross: 'x-circle',
  tick: 'check-circle',
  warn: 'warning-circle',
  star: 'star',
};
const BADGE_COLOR: Record<Badge, VisualColor> = {
  cross: 'red',
  tick: 'green',
  warn: 'amber',
  star: 'amber',
  number: 'ink',
};

/** The colour a thread takes when a beat does not say: they cycle, so two flows never read as one. */
const THREADS: VisualColor[] = ['blue', 'orange', 'green', 'violet'];

/**
 * The scene as elements and cues.
 *
 * Every thing of every section is laid once, with both its places, and
 * the beats turn into cues on the words that carry them. The stage is
 * cleared only where a section opens, and even then the next section's
 * cast comes in on its own beats rather than all at once.
 */
export function layoutStage(
  scene: StageScene,
  ctx: StageContext = {},
): VisualScript {
  const stage = ctx.stage ?? STAGES.box;
  const known = ctx.known ?? (() => true);
  const elements: VisualElement[] = [];
  const cues: VisualCue[][] = scene.sentences.map(() => []);
  const lastSentence = scene.sentences.length - 1;
  const clamp = (n: number) => Math.max(0, Math.min(lastSentence, n));
  const lastWord = (sentence: number) =>
    Math.max(0, words(scene.sentences[sentence] ?? '').length - 1);

  scene.sections.forEach((section, s) => {
    const cast = section.cast.slice(0, STAGE_LIMITS.maxCast);
    const places = placesFor(cast.length, stage);
    const key = (i: number) => `s${s}t${i}`;
    const byName = new Map<string, number>();
    cast.forEach((thing, i) => byName.set(thing.name.toLowerCase(), i));
    const find = (name: string): number | null => {
      const wanted = (name ?? '').trim().toLowerCase();
      if (!wanted) return null;
      const exact = byName.get(wanted);
      if (exact !== undefined) return exact;
      for (const [had, i] of byName)
        if (had.includes(wanted) || wanted.includes(had)) return i;
      return null;
    };

    // The cast, each with the place it stands in and the place it takes
    // when the stage rearranges.
    cast.forEach((thing, i) => {
      const at = places.row[i];
      const then = places.column[i];
      const other: VisualPlace[] = [
        { x: then.x, y: then.y, scale: then.w / at.w },
      ];
      const drawn = shapeOf(thing, known);
      const name = shorten(thing.label ?? thing.name, 3);
      elements.push({
        id: key(i),
        type: 'shape',
        kind: drawn.kind,
        x: at.x,
        y: at.y,
        w: at.w,
        h: at.h,
        // Nothing draws this, so the card carries its name instead of
        // standing empty over it.
        ...(drawn.words && name ? { text: name } : {}),
        color: thing.color ?? 'ink',
        fill: 'solid',
        carry: thing.name.toLowerCase(),
        places: other,
      });
      // The name goes under the drawing, or inside the card when the
      // card is all there is — never both.
      if (name && !drawn.words)
        elements.push({
          id: `${key(i)}_n`,
          type: 'label',
          x: at.x,
          y: at.y + at.h / 2 + NAME_DROP,
          text: name,
          size: 'sm',
          anchor: 'middle',
          color: 'muted',
          on: { of: key(i), corner: 'under' },
        });
    });

    if (section.title) {
      const title = shorten(section.title, STAGE_LIMITS.maxTitleWords);
      if (title)
        elements.push({
          id: `s${s}_h`,
          type: 'label',
          x: stage.CX,
          y: 30,
          text: title,
          size: 'md',
          anchor: 'middle',
          color: 'amber',
        });
    }

    // Walking the beats: what is on the stage, what is lit, what a link
    // was called, so a drop can take its arrows with it.
    const shown = new Set<string>();
    const linksOf = new Map<number, string[]>();
    /** The mark a thing is wearing, so the next one takes its place. */
    const worn = new Map<string, string>();
    /** The same, for the number beside it. */
    const counts = new Map<string, string>();
    let extra = 0;
    let focused = false;
    let thread = 0;
    const beats = [...section.beats].sort((a, b) => a.sentence - b.sentence);

    const show = (sentence: number, at: number, id: string) => {
      const element = elements.find((e) => e.id === id);
      if (!element || shown.has(id)) return;
      cues[sentence].push({
        at,
        do:
          element.type === 'shape' || element.type === 'figure'
            ? 'draw'
            : 'fade',
        target: id,
      });
      shown.add(id);
    };
    /**
     * A thing and the name under it. The name lands two words after the
     * thing, the way a hand draws the box and then writes under it, which
     * is one more moment on the stage and nothing more to write.
     */
    const bring = (sentence: number, at: number, i: number) => {
      if (shown.has(key(i))) {
        // Already there: a sentence that names it again taps it, the way
        // a hand taps the box on a whiteboard it is talking about.
        tap(sentence, at, key(i));
        return;
      }
      show(sentence, at, key(i));
      show(sentence, Math.min(lastWord(sentence), at + 2), `${key(i)}_n`);
    };
    /**
     * A tap on a thing at a word. Twice on the same word would read as a
     * stutter; twice in a sentence, once early and once late, is a thing
     * being talked about and is what keeps a long sentence alive.
     */
    const tapped = new Set<string>();
    const tap = (sentence: number, at: number, id: string) => {
      const once = `${sentence}:${id}:${at}`;
      if (tapped.has(once)) return;
      tapped.add(once);
      cues[sentence].push({ at, do: 'pulse', target: id });
    };
    const hide = (sentence: number, at: number, id: string) => {
      if (!shown.has(id)) return;
      cues[sentence].push({ at, do: 'hide', target: id });
      shown.delete(id);
    };

    beats.forEach((beat) => {
      const sentence = clamp(beat.sentence);
      const text = scene.sentences[sentence] ?? '';
      const total = words(text).length;
      const events = beat.events.slice(0, STAGE_LIMITS.maxEventsPerBeat);

      // Where in the sentence each event lands: on the word that names
      // its thing where the sentence says it, and spread across the
      // sentence where it does not, so two events are never one.
      const spots = events.map((event, k) => {
        const named = event.what
          .map((name) => findWord(text, name))
          .filter((w): w is number => w !== null)
          .sort((a, b) => a - b);
        const spread = Math.round((total * (k + 0.5)) / (events.length + 0.5));
        const at = named[0] ?? spread;
        return Math.max(0, Math.min(Math.max(0, total - 1), at));
      });
      // The stage answers as the sentence begins. A thing named late in a
      // long sentence would otherwise leave the stage standing for the
      // first half of it, which is where the stillness comes from.
      if (spots.length) spots[0] = Math.min(spots[0], Math.floor(total * 0.4));
      for (let k = 1; k < spots.length; k += 1)
        if (spots[k] <= spots[k - 1])
          spots[k] = Math.min(total - 1, spots[k - 1] + 2);

      // A section's own stage: cleared where it opens, once.
      if (s > 0 && beat === beats[0])
        cues[sentence].unshift({ at: 0, do: 'clear', target: '*' });
      if (beat === beats[0] && section.title) show(sentence, 0, `s${s}_h`);

      // The light goes back up the moment a beat stops being about one thing.
      if (focused && !events.some((e) => e.do === 'focus')) {
        cues[sentence].push({ at: spots[0] ?? 0, do: 'undim', target: '*' });
        focused = false;
      }

      const before = cues[sentence].length;
      events.forEach((event, k) => {
        const at = spots[k];
        const subject = find(event.what[0] ?? '');
        const object = find(event.what[1] ?? '');
        const colour = event.color ?? THREADS[thread % THREADS.length];
        switch (event.do) {
          case 'place':
          case 'name': {
            if (subject === null) break;
            bring(sentence, at, subject);
            break;
          }
          case 'mark': {
            if (subject === null) break;
            bring(sentence, at, subject);
            const badge = event.badge ?? 'warn';
            const id = `s${s}b${extra}`;
            extra += 1;
            const before = worn.get(key(subject));
            if (before) hide(sentence, at, before);
            worn.set(key(subject), id);
            const spot = cornerOf(places.row[subject], 'topRight', stage);
            if (badge === 'number' || event.text) {
              elements.push({
                id,
                type: 'label',
                x: spot.x,
                y: spot.y,
                text: shorten(event.text, 2) ?? '',
                size: 'md',
                anchor: 'middle',
                color: event.color ?? BADGE_COLOR[badge],
                on: { of: key(subject), corner: 'topRight' },
              });
            } else {
              elements.push({
                id,
                type: 'icon',
                name: BADGE_ICON[badge],
                x: spot.x,
                y: spot.y,
                size: 20,
                color: event.color ?? BADGE_COLOR[badge],
                on: { of: key(subject), corner: 'topRight' },
              });
            }
            cues[sentence].push({ at, do: 'fade', target: id });
            shown.add(id);
            cues[sentence].push({
              at: Math.min(lastWord(sentence), at + 1),
              do: 'pulse',
              target: key(subject),
            });
            break;
          }
          case 'link': {
            if (subject === null || object === null || subject === object)
              break;
            bring(sentence, at, subject);
            bring(sentence, at, object);
            const id = `s${s}l${extra}`;
            extra += 1;
            thread += 1;
            elements.push({
              id,
              type: 'arrow',
              from: key(subject),
              to: key(object),
              color: colour,
            });
            cues[sentence].push({ at, do: 'draw', target: id });
            shown.add(id);
            for (const end of [subject, object])
              linksOf.set(end, [...(linksOf.get(end) ?? []), id]);
            const label = shorten(event.text, 3);
            if (label) {
              const lid = `${id}_n`;
              const mid = {
                x: (places.row[subject].x + places.row[object].x) / 2,
                y: (places.row[subject].y + places.row[object].y) / 2 - 12,
              };
              elements.push({
                id: lid,
                type: 'label',
                x: mid.x,
                y: mid.y,
                text: label,
                size: 'sm',
                anchor: 'middle',
                color: colour,
                on: { of: id, corner: 'centre' },
              });
              cues[sentence].push({
                at: Math.min(lastWord(sentence), at + 1),
                do: 'fade',
                target: lid,
              });
              shown.add(lid);
            }
            break;
          }
          case 'send': {
            if (subject === null || object === null || subject === object)
              break;
            bring(sentence, at, subject);
            bring(sentence, at, object);
            const id = `s${s}p${extra}`;
            extra += 1;
            const to = places.row[object];
            const home = places.row[subject];
            elements.push({
              id,
              type: 'shape',
              kind: 'roundRect',
              x: home.x,
              y: home.y,
              w: 18,
              h: 14,
              color: colour,
              fill: 'solid',
              places: [{ x: to.x, y: to.y }],
            });
            cues[sentence].push({ at, do: 'fade', target: id });
            cues[sentence].push({
              at: Math.min(lastWord(sentence), at + 1),
              do: 'move',
              target: id,
              to: 0,
            });
            cues[sentence].push({
              at: Math.min(lastWord(sentence), at + 3),
              do: 'hide',
              target: id,
            });
            break;
          }
          case 'copy': {
            if (subject === null) break;
            bring(sentence, at, subject);
            const source = places.row[subject];
            const n = Math.max(
              2,
              Math.min(STAGE_LIMITS.maxCopies, event.n ?? 3),
            );
            const step = Math.min(14, (source.w * 0.55) / (n - 1));
            // Fanned back and up, so several read as several and not as a
            // smudge, and small enough that the original still leads.
            for (let i = 1; i < n; i += 1) {
              const id = `s${s}c${extra}`;
              extra += 1;
              const template = elements.find((e) => e.id === key(subject));
              if (!template || template.type !== 'shape') break;
              elements.push({
                ...template,
                id,
                x: template.x + step * i,
                y: template.y - step * i,
                bornAt: key(subject),
                // It keeps the fan when the stage rearranges, so three of
                // a thing stay three and do not come apart.
                places: template.places?.map((place) => ({
                  ...place,
                  x: place.x + step * i * (place.scale ?? 1),
                  y: place.y - step * i * (place.scale ?? 1),
                })),
                carry: undefined,
              });
              cues[sentence].push({
                at: Math.min(lastWord(sentence), at + i),
                do: 'draw',
                target: id,
              });
              shown.add(id);
            }
            break;
          }
          case 'move': {
            let step = 0;
            cast.forEach((_, i) => {
              if (!shown.has(key(i))) return;
              // The thing, and anything that came out of it, so a stack
              // of three travels as three and not as one with two left
              // behind.
              const going = [
                key(i),
                ...elements
                  .filter((e) => e.bornAt === key(i) && shown.has(e.id))
                  .map((e) => e.id),
              ];
              for (const id of going)
                cues[sentence].push({
                  at: Math.min(lastWord(sentence), at + step),
                  do: 'move',
                  target: id,
                  to: 0,
                });
              step += 1;
            });
            break;
          }
          case 'swap': {
            if (subject === null || object === null) break;
            const from = places.row[subject];
            const target = elements.find((e) => e.id === key(object));
            // The thing coming in takes the place of the thing going out,
            // so the swap reads as one thing becoming another.
            if (target && target.type === 'shape') {
              target.x = from.x;
              target.y = from.y;
            }
            hide(sentence, at, key(subject));
            hide(sentence, at, `${key(subject)}_n`);
            bring(sentence, Math.min(lastWord(sentence), at + 1), object);
            break;
          }
          case 'count': {
            if (subject === null) break;
            bring(sentence, at, subject);
            const id = `s${s}n${extra}`;
            extra += 1;
            const counted = `${key(subject)}#`;
            const before = counts.get(counted);
            if (before) hide(sentence, at, before);
            counts.set(counted, id);
            const spot = cornerOf(places.row[subject], 'topRight', stage);
            elements.push({
              id,
              type: 'label',
              x: spot.x,
              y: spot.y,
              text: shorten(event.text, 2) ?? '',
              size: 'md',
              anchor: 'middle',
              color: event.color ?? 'ink',
              count: true,
              // The top left, so a number and a mark are never the same spot.
              on: { of: key(subject), corner: 'topLeft' },
            });
            cues[sentence].push({ at, do: 'fade', target: id });
            shown.add(id);
            break;
          }
          case 'focus': {
            const lit = new Set(
              event.what
                .map((name) => find(name))
                .filter((i): i is number => i !== null),
            );
            if (!lit.size) break;
            const keys = new Set([...lit].map((i) => key(i)));
            const heading = `s${s}_h`;
            for (const id of shown) {
              if (id === heading) continue;
              // A thing's name is lit with the thing, and a badge on it too.
              const owner = id.replace(/_n$/, '');
              const badge = elements.find((e) => e.id === id)?.on?.of;
              if (keys.has(owner) || (badge && keys.has(badge))) continue;
              cues[sentence].push({ at, do: 'dim', target: id });
            }
            for (const i of lit) bring(sentence, at, i);
            focused = true;
            break;
          }
          case 'drop': {
            if (subject === null) break;
            hide(sentence, at, key(subject));
            hide(sentence, at, `${key(subject)}_n`);
            for (const link of linksOf.get(subject) ?? []) {
              hide(sentence, at, link);
              hide(sentence, at, `${link}_n`);
            }
            linksOf.set(subject, []);
            break;
          }
        }
      });

      // A sentence whose last change lands in its first half leaves the
      // stage standing for the rest of it. The thing it is about takes a
      // beat late on: one more moment, and nothing more to write. Only a
      // thing still on the stage, so a packet already gone is never
      // tapped after it left.
      const mine = cues[sentence];
      if (mine.length && total >= LONG_ENOUGH_TO_WANDER) {
        const last = Math.max(...mine.map((c) => c.at));
        if (last < total * 0.55) {
          const standing = [...mine]
            .reverse()
            .map((c) => c.target)
            .find((id) => shown.has(id));
          if (standing)
            tap(
              sentence,
              Math.min(total - 1, Math.round(total * 0.75)),
              standing,
            );
        }
      }

      // A sentence whose events all found nothing to do would leave the
      // stage standing. The thing it was about takes a beat instead.
      if (cues[sentence].length === before) {
        const about = events
          .flatMap((event) => event.what)
          .map((name) => find(name))
          .find((i): i is number => i !== null && shown.has(key(i)));
        const last = [...shown].reverse().find((id) => /t\d+$/.test(id));
        const target =
          about !== null && about !== undefined ? key(about) : last;
        if (target) tap(sentence, spots[0] ?? 0, target);
      }
    });
  });

  const segments: VisualSegment[] = scene.sentences.map((text, i) => ({
    text,
    cues: cues[i].sort((a, b) => a.at - b.at),
  }));
  return { title: scene.title, elements, segments };
}

/* ------------------------------------------------------------------ *
 * What is wrong with it
 * ------------------------------------------------------------------ */

/**
 * What a scene gets wrong, in the writer's own terms, before anything is
 * drawn: a cast too big to read, a beat that names a thing the section
 * never brought on, a sentence that does nothing, a sentence long enough
 * to need two events and carrying one, and words where there should be
 * none.
 */
export function stageProblems(scene: StageScene): string[] {
  const problems: string[] = [];
  const n = scene.sentences.length;
  if (n < STAGE_LIMITS.minSentences)
    problems.push(
      `The narration is ${n} sentences; a page needs at least ${STAGE_LIMITS.minSentences}.`,
    );
  if (n > STAGE_LIMITS.maxSentences)
    problems.push(
      `The narration is ${n} sentences; keep it under ${STAGE_LIMITS.maxSentences}.`,
    );
  if (!scene.sections.length) problems.push('The scene has no sections.');
  if (scene.sections.length > STAGE_LIMITS.maxSections)
    problems.push(
      `There are ${scene.sections.length} sections; keep it to ${STAGE_LIMITS.maxSections}.`,
    );

  const covered = new Set<number>();
  scene.sections.forEach((section, s) => {
    const where = `Section ${s + 1}`;
    if (section.cast.length < STAGE_LIMITS.minCast)
      problems.push(`${where} has nothing on the stage.`);
    if (section.cast.length > STAGE_LIMITS.maxCast)
      problems.push(
        `${where} has ${section.cast.length} things on the stage; ${STAGE_LIMITS.maxCast} is as many as a learner can hold.`,
      );
    const names = new Set(section.cast.map((t) => t.name.trim().toLowerCase()));
    for (const thing of section.cast) {
      const label = thing.label ?? thing.name;
      if (words(label).length > 3)
        problems.push(
          `${where}: "${label}" is ${words(label).length} words; a name on the stage is one to three.`,
        );
    }
    if (
      section.title &&
      words(section.title).length > STAGE_LIMITS.maxTitleWords
    )
      problems.push(
        `${where}: the title "${section.title}" is more than ${STAGE_LIMITS.maxTitleWords} words.`,
      );
    for (const beat of section.beats) {
      const sentence = scene.sentences[beat.sentence];
      if (sentence === undefined) {
        problems.push(
          `${where}: a beat is on sentence ${beat.sentence}, which does not exist.`,
        );
        continue;
      }
      covered.add(beat.sentence);
      if (!beat.events.length)
        problems.push(
          `${where}: sentence ${beat.sentence + 1} does nothing to the stage.`,
        );
      if (beat.events.length > STAGE_LIMITS.maxEventsPerBeat)
        problems.push(
          `${where}: sentence ${beat.sentence + 1} carries ${beat.events.length} events; two is as many as one sentence can show.`,
        );
      for (const event of beat.events) {
        const needs =
          event.do === 'link' || event.do === 'send' || event.do === 'swap'
            ? 2
            : 1;
        if (event.what.filter(Boolean).length < needs)
          problems.push(
            `${where}: a ${event.do} on sentence ${beat.sentence + 1} names ${event.what.length} things; it needs ${needs}.`,
          );
        for (const name of event.what)
          if (name && !names.has(name.trim().toLowerCase()))
            problems.push(
              `${where}: sentence ${beat.sentence + 1} acts on "${name}", which is not on this stage.`,
            );
        if (event.text && words(event.text).length > STAGE_LIMITS.maxRunWords)
          problems.push(
            `${where}: "${event.text}" is ${words(event.text).length} words; nothing on the stage runs past ${STAGE_LIMITS.maxRunWords}.`,
          );
      }
    }
  });
  for (let i = 0; i < n; i += 1)
    if (!covered.has(i))
      problems.push(`Sentence ${i + 1} does nothing to the stage.`);
  return problems;
}

/**
 * What is on the stage at any one time, in words. A learner who is
 * listening reads nothing longer than a name, so this counts the whole
 * stage at every cue and says where it went over.
 */
export function wordsOnStage(script: VisualScript): string[] {
  const problems: string[] = [];
  const texts = new Map<string, string>();
  for (const element of script.elements)
    if ('text' in element && typeof element.text === 'string')
      texts.set(element.id, element.text);
  const shown = new Set<string>();
  script.segments.forEach((segment, i) => {
    for (const cue of segment.cues) {
      if (cue.do === 'clear') shown.clear();
      else if (cue.do === 'hide') shown.delete(cue.target);
      else if (cue.do === 'draw' || cue.do === 'fade') shown.add(cue.target);
      else continue;
      let count = 0;
      for (const id of shown) count += words(texts.get(id) ?? '').length;
      if (count > STAGE_LIMITS.maxWordsOnStage) {
        problems.push(
          `Sentence ${i + 1} leaves ${count} words on the stage; ${STAGE_LIMITS.maxWordsOnStage} is as many as a listener can take.`,
        );
        return;
      }
    }
  });
  for (const [, text] of texts)
    if (words(text).length > STAGE_LIMITS.maxRunWords)
      problems.push(
        `"${text}" is ${words(text).length} words; nothing on the stage runs past ${STAGE_LIMITS.maxRunWords}.`,
      );
  return problems;
}

/* ------------------------------------------------------------------ *
 * How alive it is
 * ------------------------------------------------------------------ */

export interface StageMeasure {
  /** Cues a minute: how often anything at all happens. */
  changesPerMinute: number;
  /** The longest the stage stands with nothing happening, in seconds. */
  longestStillS: number;
  /** How many times it stands still longer than the rule allows. */
  stillsOverRule: number;
  /** The share of cues that are not simply a thing appearing or going. */
  movingShare: number;
  /** Wipes a minute. */
  wipesPerMinute: number;
  /** The longest run of words anywhere on the stage. */
  longestRunWords: number;
}

/**
 * The rule the measured video keeps: it is never still for longer than
 * this, and neither is a page of ours.
 */
export const MAX_STILL_S = 4;

/** A measured scene, as a timeline of cues on the audio. */
export interface MeasurableTimeline {
  durationMs: number;
  elements: { id: string; type: string; text?: string }[];
  segments: { cues: { atMs: number; do: string; target: string }[] }[];
}

/** How alive a finished scene is, measured rather than guessed. */
export function stageMeasure(timeline: MeasurableTimeline): StageMeasure {
  const cues = timeline.segments
    .flatMap((segment) => segment.cues)
    .sort((a, b) => a.atMs - b.atMs);
  const minutes = Math.max(timeline.durationMs, 1) / 60000;
  const moments = [0, ...cues.map((c) => c.atMs), timeline.durationMs];
  let longest = 0;
  for (let i = 1; i < moments.length; i += 1)
    longest = Math.max(longest, moments[i] - moments[i - 1]);
  const stills = moments
    .slice(1)
    .filter((at, i) => at - moments[i] > MAX_STILL_S * 1000).length;
  const appears = new Set(['draw', 'fade', 'hide', 'clear']);
  const moving = cues.filter((c) => !appears.has(c.do)).length;
  const longestRun = timeline.elements.reduce(
    (most, element) => Math.max(most, words(element.text ?? '').length),
    0,
  );
  return {
    changesPerMinute: Math.round(cues.length / minutes),
    longestStillS: Math.round((longest / 1000) * 10) / 10,
    stillsOverRule: stills,
    movingShare: cues.length
      ? Math.round((moving / cues.length) * 100) / 100
      : 0,
    wipesPerMinute:
      Math.round((cues.filter((c) => c.do === 'clear').length / minutes) * 10) /
      10,
    longestRunWords: longestRun,
  };
}

/**
 * What a finished scene falls short on, against the video we measured:
 * 79 changes a minute, never still past four seconds, most of what
 * happens being something other than a thing appearing, and nothing on
 * the stage longer than four words.
 */
export const STAGE_TARGET = {
  changesPerMinute: 60,
  longestStillS: MAX_STILL_S,
  movingShare: 0.33,
  wipesPerMinute: 2.5,
} as const;

export function stageCadence(timeline: MeasurableTimeline): string[] {
  const m = stageMeasure(timeline);
  const said: string[] = [];
  if (m.changesPerMinute < STAGE_TARGET.changesPerMinute)
    said.push(
      `Something happens ${m.changesPerMinute} times a minute; ${STAGE_TARGET.changesPerMinute} is the least that holds a learner.`,
    );
  if (m.longestStillS > MAX_STILL_S)
    said.push(
      `The stage stands still for ${m.longestStillS} seconds; ${MAX_STILL_S} is as long as it may.`,
    );
  if (m.movingShare < STAGE_TARGET.movingShare)
    said.push(
      `Only ${Math.round(m.movingShare * 100)}% of what happens is more than a thing appearing; a third is the least that reads as a film.`,
    );
  if (m.wipesPerMinute > STAGE_TARGET.wipesPerMinute)
    said.push(
      `The stage is wiped ${m.wipesPerMinute} times a minute; at most ${STAGE_TARGET.wipesPerMinute} keeps a learner's place.`,
    );
  if (m.longestRunWords > STAGE_LIMITS.maxRunWords)
    said.push(
      `Something on the stage runs to ${m.longestRunWords} words; ${STAGE_LIMITS.maxRunWords} is the most.`,
    );
  return said;
}

/**
 * The guard on the promise this file makes: every sentence changes the
 * stage, and a long one changes it past its halfway mark.
 *
 * `layoutStage` keeps both by construction, taps included, so on its own
 * output this says nothing. It is here to catch the day something stops
 * keeping them, and to measure a script that came from anywhere else.
 */
export function stillProblems(script: VisualScript): string[] {
  const problems: string[] = [];
  script.segments.forEach((segment, i) => {
    const total = words(segment.text).length;
    if (!segment.cues.length) {
      problems.push(`Sentence ${i + 1} does nothing to the stage.`);
      return;
    }
    const last = Math.max(...segment.cues.map((c) => c.at));
    if (total >= STAGE_LIMITS.longSentence && last < total * 0.5)
      problems.push(
        `Sentence ${i + 1} is ${total} words and nothing changes after its ${last + 1}${last === 0 ? 'st' : 'th'} word; give it a second thing to do, or cut it in half.`,
      );
  });
  return problems;
}

/* ------------------------------------------------------------------ *
 * How it is spoken
 * ------------------------------------------------------------------ */

/**
 * The pace, the silence and the weight of each sentence of a stage
 * scene, on the same three knobs the lecture uses.
 *
 * A figure is said a little slower, because a number said at speed is a
 * number lost. The line a section closes on holds, because that is where
 * a learner puts together what they just watched. And each sentence
 * leans on the thing the screen is doing something to at that instant,
 * which is the one word worth stressing.
 */
export function stageDelivery(scene: StageScene): {
  speed: number;
  pauseAfter: number;
  emphasis: string[];
}[] {
  const beats = new Map<number, StageEvent[]>();
  const closes = new Set<number>();
  const opens = new Set<number>();
  for (const section of scene.sections) {
    const own = [...section.beats].sort((a, b) => a.sentence - b.sentence);
    for (const beat of own) beats.set(beat.sentence, beat.events);
    if (own.length) {
      opens.add(own[0].sentence);
      closes.add(own[own.length - 1].sentence);
    }
  }
  const last = scene.sentences.length - 1;
  const spent = new Set<string>();
  return scene.sentences.map((sentence, i) => {
    const events = beats.get(i) ?? [];
    const counts = events.some((e) => e.do === 'count');
    const held = events.some((e) => e.do === 'focus' || e.do === 'mark');
    const speed = counts
      ? SCENE_SPEED.figure
      : held
        ? SCENE_SPEED.define
        : SCENE_SPEED.plain;
    const pauseAfter =
      i === last
        ? PAUSE_S.tail
        : opens.has(i + 1)
          ? PAUSE_S.title
          : closes.has(i)
            ? PAUSE_S.afterStatement
            : counts
              ? PAUSE_S.afterNumber
              : PAUSE_S.sentence;
    // The thing the stage is acting on, said here and not leaned on before.
    const lower = sentence.toLowerCase();
    const emphasis: string[] = [];
    for (const name of events.flatMap((e) => e.what)) {
      const key = (name ?? '').toLowerCase();
      if (!key || spent.has(key) || !lower.includes(key)) continue;
      if (words(name).length > 3) continue;
      spent.add(key);
      emphasis.push(name);
      break;
    }
    return { speed, pauseAfter, emphasis };
  });
}
