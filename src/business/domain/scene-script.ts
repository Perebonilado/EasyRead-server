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

import { checkArithmetic, markTerms, type MathLine } from './scene-math';
import { sample, type PlotSpec } from './scene-plot';
import { findPhrase, isVerbatim } from './scene-quote';

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
] as const;
export type SceneEffectKind = (typeof SCENE_EFFECTS)[number];

/**
 * How a sentence is said. The writer tags each one and code turns the tag
 * into a pace and a silence (scene-voice.ts): a hook a touch quicker, the
 * point slower with room after it, time to think after a question. One
 * pace and two pauses for every sentence was a metronome.
 */
export const SCENE_DELIVERIES = [
  'hook',
  'explain',
  'key',
  'aside',
  'question',
  'recap',
] as const;
export type SceneDelivery = (typeof SCENE_DELIVERIES)[number];

/** The page's feeling, for the music under the voice. */
export const SCENE_MOODS = [
  'calm',
  'bright',
  'curious',
  'serious',
  'playful',
] as const;
export type SceneMood = (typeof SCENE_MOODS)[number];

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

/** A thing drawn by code and not by the artist. */
export type CodeThing = MathThing | PlotThing | QuoteThing;

export type SceneThing = DrawingThing | StatThing | WordsThing | CodeThing;

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
  return [];
}

/** The names of the states a thing can show and hide: a drawing's overlays, a working's later lines. */
export function stateNames(thing: SceneThing): string[] {
  if (thing.kind === 'drawing') return thing.states.map((s) => s.name);
  if (thing.kind === 'math')
    return thing.lines.slice(1).map((_, k) => `line ${k + 2}`);
  return [];
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
  }[];
  cast: {
    id: string;
    kind: 'drawing' | 'stat' | 'words' | 'math' | 'plot' | 'quote';
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

const clean = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

export interface MendedScript {
  script: SceneScript;
  /** What the writer should redo; empty means the storyboard is sound. */
  problems: string[];
  /** What code put right on its own, for the log. */
  mended: string[];
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
  options: {
    /** The page, to hold a quotation to its own words. */
    material?: string;
    /** The formats the document may use; a kind of another is set in type. */
    formats?: readonly SceneFormat[];
  } = {},
): MendedScript {
  const problems: string[] = [];
  const mended: string[] = [];
  const formats = new Set(options.formats ?? SCENE_FORMATS);

  const beats: SceneBeat[] = draft.beats
    .map((beat) => ({
      say: clean(beat.say),
      pause: beat.pause === 'long' ? ('long' as const) : ('short' as const),
      delivery: SCENE_DELIVERIES.includes(beat.delivery)
        ? beat.delivery
        : ('explain' as const),
    }))
    .filter((beat) => wordsOf(beat.say).length > 0);

  // Ids: safe, unique, and every way the writer might refer to one.
  const idFor = new Map<string, string>();
  const used = new Set<string>();
  const cast: SceneThing[] = [];
  draft.cast.forEach((raw, index) => {
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
    if (raw.kind === 'math' || raw.kind === 'plot' || raw.kind === 'quote') {
      const made = codeThing(id, raw, name, formats, options.material);
      mended.push(...made.mended);
      problems.push(...made.problems);
      cast.push(made.thing);
      return;
    }
    const brief = clean(raw.brief);
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
      for (const ref of raw.show) {
        const id = resolve(ref);
        if (!id) {
          mended.push(
            `step ${one.index + 1}: nothing in the cast is called "${ref}"`,
          );
          continue;
        }
        if (!show.includes(id)) show.push(id);
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
        stage = { layout, show, arrows: arrows.slice(0, MAX_ARROWS) };
        // The stage restated as it stands is no change: its effects only.
        const last = [...steps].reverse().find((s) => s.stage)?.stage;
        if (
          last &&
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
    const spoken = beats.reduce((n, beat) => n + beat.say.length, 0);
    if (spoken > MAX_SPOKEN_CHARS)
      problems.push(
        `The narration is ${spoken} characters; keep it under ${MAX_SPOKEN_CHARS}.`,
      );
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

  return {
    script: {
      fit: draft.fit === 'poor' ? 'poor' : 'good',
      fitReason: clean(draft.fitReason) || null,
      title: clean(draft.title).slice(0, 80) || 'This page',
      mood: SCENE_MOODS.includes(draft.mood) ? draft.mood : 'curious',
      beats,
      cast: cast.filter((thing) =>
        steps.some((step) => step.stage?.show.includes(thing.id)),
      ),
      steps,
    },
    problems,
    mended,
  };
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
    if (!formats.has('maths')) return words('not a maths book');
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
    return {
      thing: { id, kind: 'math', name: clean(raw.name), lines },
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
  const kind: SceneEffectKind = SCENE_EFFECTS.includes(effect.do)
    ? effect.do
    : 'pulse';
  const parts = thing ? partNames(thing) : [];
  const states = thing ? stateNames(thing) : [];
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
  const state = states.find((name) => idKey(name) === key);
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
  positions.push(before);
  const out: string[] = [];
  let last = 0;
  for (const at of positions) {
    if (at - last > limit)
      out.push(
        `${at - last} words pass with nothing changing, from word ${last}`,
      );
    last = at;
  }
  return out;
}
