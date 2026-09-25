/**
 * The scene put together: the storyboard on the audio, every thing placed
 * for both stagings, and the decisions a storyboard leaves to code: how
 * each newcomer arrives, where the camera leans, what is hidden until it
 * is pointed at, and what fills a stretch where nothing would change.
 */
import type {
  SceneArrowDto,
  SceneBubbleDto,
  SceneDto,
  SceneEffectDto,
  SceneEffectName,
  SceneEnterName,
  SceneLineFrom,
  ScenePillDto,
  ScenePlaceDto,
  SceneStepDto,
  SceneThingDto,
  SceneTiming,
} from '../../contracts';
import { actingOf, type DirectedMove, type SpokenLine } from './scene-acting';
import { CROWD_CANVAS, drawCrowd } from './scene-crowd';
import type { Callout, InkField } from './scene-callouts';
import { numbersIn } from './scene-chart';
import { measureText } from './scene-font';
import {
  auditStep,
  arrowPath,
  pillBox,
  placeBubble,
  placeStrip,
  placeVoice,
  placeLabels,
  placePill,
  segmentsOf,
  type Collision,
  type Ink,
  type Words,
} from './scene-labels';
import {
  STAGINGS,
  extentOf,
  layoutStep,
  standTogether,
  type LaidThing,
  type Place,
  type Rect,
  type StagingName,
} from './scene-layout';
import {
  FACES,
  STORY_MOVES,
  isCodeThing,
  quotedSpans,
  type CharacterThing,
  type SceneScript,
  type SceneStep,
  type SceneThing,
} from './scene-script';
import { paletteOf, placeMusic } from './scene-music';
import type { DocumentProfile } from './scene-profile';
import type { GatedDrawing } from './scene-svg';
import { anchorMs, quietGaps, spaced, type TimedBeat } from './scene-timing';
import { numberWords } from './spoken';

/** How strongly the scene behind the stage shows on its paper: enough to be there, faint enough to read over. */
export const BACKDROP_OPACITY = 0.5;

/** Effects in one step come this far apart, so each is seen. */
const EFFECT_STAGGER_MS = 180;
/**
 * The first word must come at least this late for a "previously" to be
 * shown: the voice waited for it. A voice that did not starts at once,
 * and the page opens as any page does.
 */
export const OPENING_MIN_MS = 1200;
/** Who says words from above that no one in the cast says: the narrator, from heaven. */
const ABOVE = '@above';

/** The crowd's thing, when a story page has one. */
export const CROWD_ID = '@crowd';

/**
 * Where a crowd stands on a stage: across its width, its feet a little
 * above the story's people's, as those farther back are; and the point
 * over their heads a group's words come from. The stage draws it there.
 */
export function crowdBand(stage: { w: number; h: number }): {
  box: { x: number; y: number; w: number; h: number };
  head: [number, number];
} {
  const h = (stage.w * CROWD_CANVAS.h) / CROWD_CANVAS.w;
  const y = stage.h * 0.86 - h;
  return {
    box: { x: 0, y, w: stage.w, h },
    head: [stage.w / 2, y + h * 0.3],
  };
}

/** Words that say a crowd cheers, and that it gasps. */
const CHEERS =
  /\b(?:cheer(?:s|ed|ing)?|shout(?:s|ed|ing)?|roar(?:s|ed)?|applaud(?:s|ed)?|clap(?:s|ped)?|rejoic(?:e|es|ed|ing)|hosanna|praised?)\b/iu;
const GASPS =
  /\b(?:gasp(?:s|ed)?|marvel(?:l?ed|s)?|amaz(?:ed|ement)|astonish(?:ed|ment)|terrified|frightened|afraid|fear(?:ed)?|trembl(?:e|ed))\b/iu;
const CROWD_WORDS =
  /\b(?:crowds?|people|multitude|throng|everyone|all of them|they all|villagers|townspeople|disciples)\b/iu;
/** How long the crowd cheers or gasps. */
const CROWD_MOVE_MS = 1400;

/** How long a speech bubble stays after the voice has said its words. */
const SAY_AFTER_MS = 700;
/** A moment of quiet after a line starts this long after its last word. */
const AFTER_WORDS_MS = 150;
/** Walking over to someone before a hug: the hug comes this much later. */
const TOGETHER_MS = 1100;

/** The most a bubble holds, in characters: a line or two, read at a glance. */
const SAY_CHARS = 80;

/**
 * A line's words as its bubble holds them: all of a line or two, or of a
 * speech the sentences that start it, as many as a bubble holds at a
 * glance. Null for words with no letter in them.
 */
export function bubbleText(quote: string): string | null {
  const said = quote.trim().replace(/[,;:]$/, '');
  if (!/\p{L}/u.test(said)) return null;
  if (said.length <= SAY_CHARS) return said;
  // A speech: its first sentences, as many as fit, the first always.
  const sentences = said.split(/(?<=[.!?…])\s+/);
  let kept = sentences[0];
  for (const next of sentences.slice(1)) {
    if (kept.length + 1 + next.length > SAY_CHARS) break;
    kept = `${kept} ${next}`;
  }
  if (kept.length <= SAY_CHARS * 1.5) return kept;
  const cut = kept.slice(0, SAY_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

/** A character's or a person's name, as the page gives it. */
const nameOf = (thing: SceneThing | undefined): string | null =>
  thing?.kind === 'character' || thing?.kind === 'person' ? thing.name : null;

/**
 * What a character says in a sentence: the words it quotes, as the voice
 * says them, or of a speech the sentences that start it, as many as a
 * bubble holds at a glance. Null for a sentence that quotes no one: then
 * there is nothing for a bubble to hold.
 */
export function spokenIn(sentence: string): string | null {
  const quoted = quotedSpans(sentence).map(([start, end]) =>
    sentence.slice(start, end).replace(/[,;:]$/, ''),
  );
  if (!quoted.length) return null;
  return bubbleText(quoted.join(' … '));
}

/**
 * The thing as the client gets it: its drawing, or a card with its name
 * when the drawing failed. On a story's page nothing is labelled: no
 * names, no captions, no labels on a drawing's parts. Who someone is, the
 * story says; the only words on its stage are the ones its people speak.
 */
export function thingDto(
  thing: SceneThing,
  drawing: GatedDrawing | null | undefined,
  story = false,
): SceneThingDto {
  if (thing.kind === 'stat')
    return {
      id: thing.id,
      kind: 'stat',
      value: thing.value,
      caption: thing.caption,
    };
  if (thing.kind === 'words')
    return {
      id: thing.id,
      kind: 'words',
      text: thing.text,
      style: thing.style,
    };
  // What a thing drawn by code is called on a card, if it could not be drawn.
  const called =
    thing.name ||
    (
      {
        math: 'Working',
        plot: 'Graph',
        quote: 'Quotation',
        timeline: 'Timeline',
        chart: 'Chart',
      } as Record<string, string>
    )[thing.kind] ||
    thing.id;
  if (!drawing)
    return { id: thing.id, kind: 'words', text: called, style: 'card' };
  return {
    id: thing.id,
    kind: 'drawing',
    svg: drawing.svg,
    aspect: drawing.aspect,
    // A lesson's drawing is captioned with its name; on a story's page no
    // one and nothing is.
    caption: story || thing.kind === 'character' ? null : thing.name || null,
    parts: drawing.parts,
    // A story's drawing keeps the labels drawn in it hidden, pointed at or not.
    labels: story ? {} : drawing.labels,
    states: drawing.states,
    hidden: story ? [...new Set(Object.values(drawing.labels))] : [],
    moves: drawing.moves,
    ambience:
      thing.kind === 'drawing' || thing.kind === 'place' ? thing.sound : null,
    ...(isCodeThing(thing) ? { source: thing.kind } : {}),
    // A place is the scene behind the stage, never in a slot, and uncaptioned.
    ...(thing.kind === 'place'
      ? { backdrop: true as const, caption: null }
      : {}),
    ...(drawing.callouts.length && !story
      ? {
          callouts: Object.fromEntries(
            drawing.callouts.map((c) => [c.part, c.text]),
          ),
          calloutsLater: [],
        }
      : {}),
    // Someone drawn by the kit acts; where their head is, they look from.
    ...(drawing.acts ? { rig: true as const } : {}),
    ...(thing.kind === 'character' && thing.minor
      ? { minor: true as const }
      : {}),
    ...(drawing.head
      ? {
          head: [
            Math.round(
              ((drawing.head[0] - drawing.viewBox[0]) / drawing.viewBox[2]) *
                1000,
            ) / 1000,
            Math.round(
              ((drawing.head[1] - drawing.viewBox[1]) / drawing.viewBox[3]) *
                1000,
            ) / 1000,
          ] as [number, number],
        }
      : {}),
  };
}

/** What code knows of a drawing that the player never needs: where its labels point, where its ink is. */
interface Geometry {
  callouts: Callout[];
  viewBox: [number, number, number, number];
  field: InkField | null;
  /** A passage's words: their size, which its notes are never set above. */
  words?: { size: number };
  /** A character's head: where their bubbles point. */
  head?: [number, number];
  /** Someone who stands with people: the kit's units their frame is tall. */
  stands?: { units: number };
}

const laid = (thing: SceneThingDto, geometry?: Geometry): LaidThing =>
  thing.kind === 'drawing'
    ? {
        kind: 'drawing',
        aspect: thing.aspect,
        caption: thing.caption,
        ...(thing.source ? { source: thing.source } : {}),
        ...(geometry?.callouts.length
          ? { callouts: geometry.callouts, viewBox: geometry.viewBox }
          : {}),
        ...(geometry?.words ? { words: geometry.words } : {}),
        ...(geometry?.stands ? { stands: geometry.stands } : {}),
      }
    : thing.kind === 'stat'
      ? { kind: 'stat', value: thing.value, caption: thing.caption }
      : { kind: 'words', text: thing.text, style: thing.style };

/**
 * Working, a graph or a passage beside pictures takes the main slot: on
 * such a page they are what is read, and set a third of the stage wide
 * they cannot be. One goes large in a focus with the rest beside it; two
 * or more stand in a column.
 */
export function wordsFirst(
  stage: { layout: SceneStepDto['layout']; show: string[] },
  things: ReadonlyMap<string, SceneThingDto>,
): { layout: SceneStepDto['layout']; show: string[] } {
  const coded = (id: string) => {
    const thing = things.get(id);
    return thing?.kind === 'drawing' && Boolean(thing.source);
  };
  const main = stage.show.filter(coded);
  if (!main.length || stage.show.length === 1 || stage.layout === 'stack')
    return stage;
  const rest = stage.show.filter((id) => !coded(id));
  if (main.length === 1 && rest.length <= 3)
    return { layout: 'focus', show: [...main, ...rest] };
  return { layout: 'stack', show: [...main, ...rest].slice(0, 4) };
}

/**
 * Characters stand the same way round every time: in a row, whoever the
 * book met first stands on the left, so any two who meet again stand as
 * they stood before and never swap across the stage. Only the characters
 * trade places; everything else keeps the writer's order.
 */
export function sidesKept(
  stage: { layout: SceneStepDto['layout']; show: string[] },
  cast: ReadonlyMap<string, SceneThing>,
): { layout: SceneStepDto['layout']; show: string[] } {
  if (stage.layout !== 'row' && stage.layout !== 'compare') return stage;
  const people = stage.show
    .map((id, at) => ({ id, at, thing: cast.get(id) }))
    .filter((one) => one.thing?.kind === 'character');
  if (people.length < 2) return stage;
  const met = (thing: SceneThing | undefined) =>
    thing?.kind === 'character' ? thing.met : 0;
  const leftFirst = [...people].sort(
    (a, b) => met(a.thing) - met(b.thing) || a.at - b.at,
  );
  const show = [...stage.show];
  people.forEach((one, k) => {
    show[one.at] = leftFirst[k].id;
  });
  return { layout: stage.layout, show };
}

/** How long before a character comes on their first face is put on: the player fades a state in over 320ms. */
const FACE_EARLY_MS = 400;

/** A face a drawing does not have, as the nearest one it does: an animal the artist drew has no face of pain. */
const NEAREST_FACE: Record<string, string> = { pain: 'afraid' };

/**
 * A character wears one face at a time: a face shown takes the place of
 * the one before it, and a face hidden leaves them calm again, never with
 * none. Every face is hidden until shown, so the first, the one they come
 * on with, is shown just before they do: seen, not heard. So are the
 * signs they come on with (a shake, a fever), which stay on until an
 * effect hides them.
 */
export function oneFaceAtATime(
  effects: SceneEffectDto[],
  cast: readonly SceneThing[],
  steps: readonly SceneStepDto[],
  /** Whether they were drawn: one set as a card has no faces. */
  drawn: (id: string) => boolean = () => true,
  /** The face each comes on with, when not the one the writer gave: back from the page before. */
  firstFaces: ReadonlyMap<string, string> = new Map(),
  /** Whether their drawing has a face or a sign: an animal the artist drew has only the story's faces. */
  has: (id: string, state: string) => boolean = () => true,
): SceneEffectDto[] {
  const faces = new Set<string>(FACES);
  const faceOf = (id: string, face: string) =>
    has(id, face) ? face : (NEAREST_FACE[face] ?? 'neutral');
  const characters = new Map(
    cast.flatMap((thing) =>
      (thing.kind === 'character' || thing.kind === 'person') && drawn(thing.id)
        ? [[thing.id, thing] as const]
        : [],
    ),
  );
  const isFace = (effect: SceneEffectDto) =>
    characters.has(effect.target) &&
    Boolean(effect.part && faces.has(effect.part)) &&
    (effect.do === 'show' || effect.do === 'hide');
  const out = effects.filter((effect) => !isFace(effect));
  for (const [id, character] of characters) {
    const enters = steps.find((step) => step.show.includes(id));
    if (!enters) continue;
    let wearing = faceOf(
      id,
      firstFaces.get(id) ?? character.state ?? 'neutral',
    );
    const early = Math.max(0, enters.atMs - FACE_EARLY_MS);
    out.push({
      atMs: early,
      target: id,
      part: wearing,
      do: 'show',
      filler: true,
    });
    for (const sign of character.signs ?? [])
      if (has(id, sign))
        out.push({
          atMs: early,
          target: id,
          part: sign,
          do: 'show',
          filler: true,
        });
    const asked = effects
      .filter((effect) => effect.target === id && isFace(effect))
      .sort((a, b) => a.atMs - b.atMs);
    for (const effect of asked) {
      const next =
        effect.do === 'show'
          ? faceOf(id, effect.part!)
          : faceOf(id, effect.part!) === wearing
            ? 'neutral'
            : wearing;
      if (next === wearing) continue;
      out.push(
        { atMs: effect.atMs, target: id, part: wearing, do: 'hide' },
        { atMs: effect.atMs, target: id, part: next, do: 'show' },
      );
      wearing = next;
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Whether words only say what a thing on the stage already says: its caption, its number's caption, its words. */
function repeats(words: string, thing: SceneThingDto | undefined): boolean {
  if (!thing) return false;
  const said =
    thing.kind === 'drawing'
      ? thing.caption
      : thing.kind === 'stat'
        ? thing.caption
        : thing.text;
  const key = (text: string | null) =>
    (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(key(said)) && key(said) === key(words);
}

/** How a newcomer arrives: out of what an arrow brings it from, across in a row, wiped on when wide, else a pop. */
export function entranceFor(
  id: string,
  step: { layout: SceneStepDto['layout']; arrows: SceneArrowDto[] },
  before: string[],
  thing: SceneThingDto | undefined,
): { how: SceneEnterName; from?: string } {
  const source = step.arrows.find(
    (a) => a.to === id && before.includes(a.from),
  );
  if (source) return { how: 'grow', from: source.from };
  if (thing?.kind === 'words' && thing.style === 'title')
    return { how: 'fade' };
  if (step.layout === 'row') return { how: 'slide' };
  if (thing?.kind === 'drawing' && thing.aspect >= 1.6) return { how: 'wipe' };
  return { how: 'pop' };
}

export interface ComposeInput {
  script: SceneScript;
  drawings: ReadonlyMap<string, GatedDrawing | null>;
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  generator: string;
  /** The book: its instruments, the bounds on its music, whether it is a story, whom it is for. */
  profile?: Pick<DocumentProfile, 'kind' | 'tone' | 'story' | 'stage'> | null;
}

/**
 * For learners whose stage takes few labels, a drawing's labels only on
 * the parts the writer labelled: the artist's own extras, lifted from its
 * drawing, are left off the stage. Every label as drawn otherwise.
 */
function labelledOnly(
  drawings: ReadonlyMap<string, GatedDrawing | null>,
  script: SceneScript,
  stage: DocumentProfile['stage'],
): ReadonlyMap<string, GatedDrawing | null> {
  if (!stage) return drawings;
  const out = new Map(drawings);
  for (const thing of script.cast) {
    const drawing = drawings.get(thing.id);
    if (thing.kind !== 'drawing' || !drawing?.callouts.length) continue;
    const labelled = new Set(
      thing.parts.filter((part) => part.label).map((part) => part.name),
    );
    out.set(thing.id, {
      ...drawing,
      callouts: drawing.callouts.filter((c) => labelled.has(c.part)),
    });
  }
  return out;
}

/** A close shot holds at least this long; one comes no sooner than this after the last. */
const SHOT_LEAST_MS = 1200;
const SHOT_APART_MS = 5000;
/** Two framed together this long at most: then the whole stage again. */
const TWO_SHOT_MOST_MS = 9000;
/** How long the camera stays on someone the book meets for the first time. */
const FIRST_SHOT_MS = 2200;
/** Faces the camera moves in on. */
const STRONG_FACES = new Set(['afraid', 'sad', 'surprised', 'angry', 'pain']);

/**
 * The camera on a screenplay's page, as a film cuts it: the whole stage
 * as the page opens and while the narrator speaks; the two in a
 * conversation framed together while others stand by, from its first
 * line to its last; one alone, close, for a whisper, a shout, or a line
 * said with a strong face. A shot ends before the stage changes, so an
 * arrival is seen whole.
 */
export function storyShots(
  script: SceneScript,
  beats: readonly TimedBeat[],
  steps: readonly SceneStepDto[],
  effects: readonly SceneEffectDto[],
  durationMs: number,
): SceneEffectDto[] {
  const shots: SceneEffectDto[] = [];
  const people = new Set(
    script.cast.flatMap((thing) =>
      thing.kind === 'character' || thing.kind === 'person' ? [thing.id] : [],
    ),
  );
  /** Who is on the stage at a moment: people, not things. */
  const stageAt = (t: number) =>
    ([...steps].reverse().find((step) => step.atMs <= t)?.show ?? []).filter(
      (id) => people.has(id),
    );
  const changeAfter = (t: number) =>
    steps.find((step) => step.atMs > t)?.atMs ?? durationMs;
  const faceAt = (id: string, t: number) =>
    [...effects]
      .reverse()
      .find(
        (e) =>
          e.target === id &&
          e.do === 'show' &&
          e.atMs <= t &&
          e.part !== null &&
          (FACES as readonly string[]).includes(e.part),
      )?.part ?? null;
  // A voice from somewhere else is no one on the stage: the camera stays
  // on the whole of it.
  const lines = script.beats.flatMap((beat, k) =>
    beat.kind === 'line' &&
    beat.speaker &&
    beats[k] &&
    (!beat.from || beat.from === 'thought')
      ? [{ beat, k, at: beats[k].startMs, end: beats[k].endMs }]
      : [],
  );
  let lastClose = -Infinity;
  for (let i = 0; i < lines.length;) {
    const { beat, at, end } = lines[i];
    const speaker = beat.speaker!;
    const on = stageAt(at);
    // A conversation of two, line after line, while others stand by.
    const next = lines[i + 1];
    const other =
      beat.to ??
      (next && next.k === lines[i].k + 1 && next.beat.speaker !== speaker
        ? next.beat.speaker
        : undefined);
    if (other && on.includes(other) && on.length >= 3) {
      let j = i;
      while (
        j + 1 < lines.length &&
        lines[j + 1].k === lines[j].k + 1 &&
        [speaker, other].includes(lines[j + 1].beat.speaker!)
      )
        j += 1;
      if (j > i) {
        const from = Math.max(0, at - 200);
        const until = Math.min(
          lines[j].end + 400,
          changeAfter(at),
          from + TWO_SHOT_MOST_MS,
        );
        if (until - from >= SHOT_LEAST_MS)
          shots.push({
            atMs: Math.round(from),
            target: speaker,
            part: other,
            do: 'zoom',
            untilMs: Math.round(until),
          });
        i = j + 1;
        continue;
      }
    }
    // Close on one: a whisper, a shout, a strong face.
    const strong =
      beat.pace === 'whisper' ||
      beat.pace === 'shout' ||
      STRONG_FACES.has(faceAt(speaker, at + 400) ?? '');
    if (strong && on.length >= 2 && at - lastClose >= SHOT_APART_MS) {
      const from = Math.max(0, at - 200);
      const until = Math.min(end + 500, changeAfter(at));
      if (until - from >= SHOT_LEAST_MS) {
        shots.push({
          atMs: Math.round(from),
          target: speaker,
          part: null,
          do: 'zoom',
          untilMs: Math.round(until),
        });
        lastClose = at;
      }
    }
    i += 1;
  }
  // The first time the book meets someone, the camera moves in on them for
  // a moment as they first speak: who they are is in how they look.
  for (const thing of script.cast) {
    if (thing.kind !== 'character' || !thing.first || thing.group) continue;
    const first = lines.find((line) => line.beat.speaker === thing.id);
    if (!first) continue;
    const from = Math.max(0, first.at - 200);
    const until = Math.min(from + FIRST_SHOT_MS, changeAfter(first.at));
    const busy = shots.some(
      (shot) => shot.atMs < until + 400 && (shot.untilMs ?? 0) > from - 400,
    );
    if (busy || stageAt(first.at).length < 2 || until - from < SHOT_LEAST_MS)
      continue;
    shots.push({
      atMs: Math.round(from),
      target: thing.id,
      part: null,
      do: 'zoom',
      untilMs: Math.round(until),
    });
  }
  return shots.sort((a, b) => a.atMs - b.atMs);
}

/** A story's drawings with nothing set beside them: the labels a lesson would, and what a character is like. */
function unlabelled(
  drawings: ReadonlyMap<string, GatedDrawing | null>,
  story: boolean,
): ReadonlyMap<string, GatedDrawing | null> {
  if (!story) return drawings;
  return new Map(
    [...drawings].map(([id, drawing]) => [
      id,
      drawing ? { ...drawing, callouts: [] } : drawing,
    ]),
  );
}

/**
 * The scene the player plays. Steps are timed on their phrases and kept
 * apart; effects follow their step; a stretch longer than the quiet limit
 * gets a pulse on the thing in focus; every step is placed twice.
 */
export function composeScene(input: ComposeInput): {
  scene: SceneDto;
  filled: number;
  /** What the frame audit found wrong, per staging, per step. */
  audit: Record<StagingName, Collision[][]>;
} {
  const { script, beats, durationMs } = input;
  // A story's page: its characters and places are the story's own.
  const story = script.cast.some(
    (thing) => thing.kind === 'character' || thing.kind === 'place',
  );
  const drawings = unlabelled(
    labelledOnly(input.drawings, script, input.profile?.stage),
    story,
  );
  const things = script.cast.map((thing) =>
    thingDto(thing, drawings.get(thing.id), story),
  );
  // A story page that is busy has a crowd behind its people, drawn by
  // code for its world.
  const crowdSize = story ? script.setting?.crowd : null;
  const crowd =
    crowdSize === 'few' || crowdSize === 'many'
      ? drawCrowd({
          size: crowdSize,
          world: script.setting?.world ?? null,
          seed: script.setting?.world?.region || script.title,
        })
      : null;
  if (crowd)
    things.push({
      id: CROWD_ID,
      kind: 'drawing',
      svg: crowd.svg,
      aspect: crowd.aspect,
      caption: null,
      parts: {},
      labels: {},
      states: {},
      hidden: [],
      moves: true,
      ambience: null,
    });
  const byId = new Map(things.map((thing) => [thing.id, thing]));
  const castById = new Map(script.cast.map((thing) => [thing.id, thing]));
  /** Each line from somewhere else, by its say's id: where from, whose head its bubble is by, and the side an off-stage voice is on. */
  const heard = new Map<
    string,
    { from: SceneLineFrom; by: string | null; side: -1 | 1 }
  >();
  /**
   * The side a voice off the stage comes from: the left for someone the
   * book met before everyone else on the page, where they would stand;
   * else the right.
   */
  const offSide = (speaker: string): -1 | 1 => {
    const me = castById.get(speaker);
    if (me?.kind !== 'character') return 1;
    const others = script.cast.filter(
      (t): t is CharacterThing => t.kind === 'character' && t.id !== speaker,
    );
    return others.length && others.every((t) => t.met > me.met) ? -1 : 1;
  };

  // Every step on its words, in order; stage changes kept apart. A moment
  // a screenplay shows without words comes in the quiet after its line,
  // or, before the first, in the quiet the page opens with.
  const firstWord = beats[0]?.startMs ?? 0;
  const momentMs = (beat: number, after: number) =>
    beat >= 0 && beats[beat]
      ? beats[beat].endMs + AFTER_WORDS_MS + after * 1000
      : Math.max(0, firstWord - (script.lead ?? 0) * 1000 + after * 1000);
  const timed = script.steps.map((step) => ({
    step,
    atMs:
      step.after !== undefined
        ? momentMs(step.at.beat, step.after)
        : anchorMs(beats, step.at.beat, step.word),
  }));
  timed.sort((a, b) => a.atMs - b.atMs);
  const stageTimes = spaced(
    timed.filter((t) => t.step.stage).map((t) => t.atMs),
    durationMs,
  );
  let k = 0;
  for (const t of timed) if (t.step.stage) t.atMs = stageTimes[k++];

  const steps: SceneStepDto[] = [];
  const effects: SceneEffectDto[] = [];
  /** What the writer asked someone to do toward someone: acted, below. */
  const directed: DirectedMove[] = [];
  /** Each line as said, with its words' times: for the mouths. */
  const spoken: SpokenLine[] = [];
  let saying = 1;
  let before: string[] = [];
  let focus: string | null = null;
  /** Two who came together (a hug, a hand taken), kept side by side from then on. */
  const together: [string, string][] = [];
  const keepTogether = (show: string[]): string[] => {
    const out = [...show];
    for (const [a, b] of together) {
      const i = out.indexOf(a);
      const j = out.indexOf(b);
      if (i < 0 || j < 0 || Math.abs(i - j) === 1) continue;
      // Someone already beside them they came together with: they stand
      // between the two, one on each side.
      const beside = [out[i - 1], out[i + 1]].find((id) =>
        together.some(
          ([p, q]) =>
            (p === a && q === id) || (q === a && p === id && id !== b),
        ),
      );
      if (beside) {
        out.splice(out.indexOf(a), 1);
        out.splice(out.indexOf(b), 1);
        const at = out.indexOf(beside);
        out.splice(at + 1, 0, a, b);
        continue;
      }
      out.splice(j, 1);
      const at = out.indexOf(a);
      out.splice(j > i ? at + 1 : at, 0, b);
    }
    return out;
  };
  /** Whether the page's people walk: a story's. */
  const walks = story;
  /** Whether a story's character has been on the stage yet, and the sentence the stage was first set in. */
  let charactersSeen = false;
  let firstBeat: number | undefined;
  /** Who a cut took off the stage, until they are back. */
  const cutAway = new Set<string>();
  // The scene behind the stage: the page's own place from the start, and
  // each place the writer shows from its step on, when it was painted.
  const painted = (id: string | null | undefined) =>
    id && byId.get(id)?.kind === 'drawing' ? id : null;
  let backdrop = painted(script.backdrop);
  const same = (a: SceneStepDto, stage: NonNullable<SceneStep['stage']>) =>
    (a.backdrop ?? null) === (painted(stage.backdrop) ?? backdrop) &&
    a.layout === stage.layout &&
    a.show.join() === stage.show.join() &&
    a.arrows
      .map((x) => x.id)
      .sort()
      .join() ===
      stage.arrows
        .map((x) => `${x.from}>${x.to}`)
        .sort()
        .join();
  // A story page's "previously": who comes back from the page before,
  // as they were, on the scene they were in, while the voice waits.
  const opening =
    script.opening && (beats[0]?.startMs ?? 0) >= OPENING_MIN_MS
      ? script.opening.show.filter((id) => byId.get(id)?.kind === 'drawing')
      : [];
  if (opening.length) {
    const stage = sidesKept(
      { layout: opening.length === 1 ? 'one' : 'row', show: opening },
      castById,
    );
    const there = painted(script.opening?.backdrop) ?? backdrop;
    steps.push({
      atMs: 0,
      layout: stage.layout,
      show: stage.show,
      arrows: [],
      enter: Object.fromEntries(
        stage.show.map((id) => [id, { how: 'fade' as const }]),
      ),
      focus: stage.show[0] ?? null,
      ...(there ? { backdrop: there } : {}),
    });
    before = stage.show;
    focus = stage.show[0] ?? null;
    charactersSeen = stage.show.some(
      (id) => castById.get(id)?.kind === 'character',
    );
  }
  for (const timedStep of timed) {
    const { atMs } = timedStep;
    let { step } = timedStep;
    if (step.stage) {
      const kept = sidesKept(wordsFirst(step.stage, byId), castById);
      step = {
        ...step,
        stage: { ...step.stage, ...kept, show: keepTogether(kept.show) },
      };
    }
    // The writer restating the stage as it stands: its effects, and no change.
    if (step.stage && steps.length && same(steps[steps.length - 1], step.stage))
      step = { ...step, stage: null };
    if (step.stage) {
      const arrows: SceneArrowDto[] = step.stage.arrows.map((a) => ({
        id: `${a.from}>${a.to}`,
        from: a.from,
        to: a.to,
        // A label that only says what an end already says is noise.
        label:
          a.label &&
          [a.from, a.to].some((id) => repeats(a.label!, byId.get(id)))
            ? null
            : a.label,
        flow: a.flow,
      }));
      const enter: SceneStepDto['enter'] = {};
      const newcomers = step.stage.show.filter((id) => !before.includes(id));
      const arriving = new Set(step.stage.arrive ?? []);
      const leaving = new Set(step.stage.leave ?? []);
      // A cut: a new place, or everyone on the stage gone or swapped for
      // others, where no words bring anyone or take anyone off. Who leaves
      // fades out and who comes fades in.
      const place = painted(step.stage.backdrop);
      const cut =
        before.length > 0 &&
        (step.stage.cut === true ||
          (place !== null && place !== backdrop) ||
          (!step.stage.show.some((id) => before.includes(id)) &&
            !newcomers.some((id) => arriving.has(id)) &&
            !before.some((id) => leaving.has(id))));
      // A story's characters there as the page opens, in its first
      // sentence, are found in the scene, and one shown as they speak was
      // there all along: they fade in. Those the words bring walk on, and
      // anyone who comes later.
      const character = (id: string) => castById.get(id)?.kind === 'character';
      firstBeat ??= step.at.beat;
      const opening = !charactersSeen && step.at.beat === firstBeat;
      for (const id of newcomers)
        enter[id] =
          character(id) &&
          (cut ||
            step.stage.cutIn?.includes(id) ||
            (opening && !arriving.has(id)) ||
            (cutAway.has(id) && !arriving.has(id)))
            ? { how: 'fade' }
            : entranceFor(
                id,
                { layout: step.stage.layout, arrows },
                before,
                byId.get(id),
              );
      if (step.stage.show.some(character)) charactersSeen = true;
      // Whoever a cut takes off the stage comes back by a cut too, not
      // walking on; whoever walks off is gone.
      for (const id of before)
        if (!step.stage.show.includes(id)) {
          if (cut) cutAway.add(id);
          else cutAway.delete(id);
        }
      for (const id of newcomers) cutAway.delete(id);
      const zoom = step.effects.find((e) => e.do === 'zoom')?.target;
      focus =
        newcomers[0] ??
        zoom ??
        (focus && step.stage.show.includes(focus)
          ? focus
          : step.stage.show[0]) ??
        null;
      backdrop = painted(step.stage.backdrop) ?? backdrop;
      steps.push({
        atMs: Math.round(atMs),
        layout: step.stage.layout,
        show: step.stage.show,
        arrows,
        enter,
        focus,
        ...(backdrop ? { backdrop } : {}),
        ...(cut ? { cut: true as const } : {}),
      });
      before = step.stage.show;
    }
    step.effects.forEach((effect, i) => {
      const at = Math.round(
        atMs + (step.stage ? 350 : 0) + i * EFFECT_STAGGER_MS,
      );
      // A character's words come from the sentence's own lines, below.
      if (effect.do === 'say') return;
      // Someone toward someone: acted, not a change on the stage.
      const actor = castById.get(effect.target)?.kind;
      const acts = actor === 'character' || actor === 'person';
      // What a story's people do, played by the rig: toward whom or what
      // it names, or up at the sky.
      if (
        acts &&
        ((STORY_MOVES as readonly string[]).includes(effect.do) ||
          ((effect.do === 'look' || effect.do === 'point') &&
            effect.part?.startsWith('@')))
      ) {
        directed.push({
          atMs: at,
          target: effect.target,
          other: effect.part,
          do: effect.do as DirectedMove['do'],
        });
        return;
      }
      // On a story's character, a point or a pulse is attention, acted:
      // the others look at them; a pulse, a nod. Never a ring on a face.
      if (
        actor === 'character' &&
        (effect.do === 'pulse' ||
          (effect.do === 'point' && !castById.has(effect.part ?? '')))
      ) {
        directed.push({
          atMs: at,
          target: effect.target,
          other: null,
          do: effect.do === 'pulse' ? 'nod' : 'attend',
        });
        return;
      }
      if (
        effect.part &&
        (effect.do === 'look' ||
          effect.do === 'reach' ||
          effect.do === 'hug' ||
          (effect.do === 'point' &&
            (actor === 'character' || actor === 'person') &&
            castById.has(effect.part)))
      ) {
        // A hug or a hand taken between two with someone between them:
        // the other walks over first, and they stay side by side.
        const other = effect.part;
        const apart =
          (effect.do === 'hug' || effect.do === 'reach') &&
          acts &&
          walks &&
          before.includes(effect.target) &&
          before.includes(other) &&
          Math.abs(before.indexOf(effect.target) - before.indexOf(other)) > 1;
        if (apart) {
          together.push([effect.target, other]);
          const show = keepTogether(before);
          const last = steps[steps.length - 1];
          steps.push({
            ...last,
            atMs: at,
            show,
            enter: {},
            focus: effect.target,
          });
          delete steps[steps.length - 1].cut;
          before = show;
        }
        directed.push({
          atMs: apart ? at + TOGETHER_MS : at,
          target: effect.target,
          other,
          do: effect.do,
        });
        return;
      }
      effects.push({
        atMs: at,
        target: effect.target,
        part: effect.part,
        do: effect.do as SceneEffectName,
      });
    });
  }

  // Back from the page before, a character wears the face it left them
  // with, and the one the writer gave them once the page is under way.
  const faces = new Map<string, string>();
  for (const id of opening) {
    const cast = castById.get(id);
    if (cast?.kind !== 'character' || !cast.before) continue;
    faces.set(id, cast.before);
    // On their next step, or, staying on from the opening, as the voice begins.
    const next = steps.find((step, k) => k > 0 && step.show.includes(id));
    if (cast.state && cast.state !== cast.before)
      effects.push({
        atMs: next ? next.atMs + 350 : Math.round(beats[0]?.startMs ?? 0),
        target: id,
        part: cast.state,
        do: 'show',
      });
  }
  effects.splice(
    0,
    effects.length,
    ...oneFaceAtATime(
      effects,
      script.cast,
      steps,
      (id) => byId.get(id)?.kind === 'drawing',
      faces,
      (id, state) => {
        const drawing = byId.get(id);
        return drawing?.kind === 'drawing' && state in drawing.states;
      },
    ),
  );
  // Each line a character says: a bubble by their head holding only its
  // own words, open from just before its first word until a moment after
  // its last. Their mouth moves while the voice says them. A line from
  // somewhere else (a voice from above, off the stage, down a phone, a
  // letter, a thought) has a bubble that shows where it comes from, and
  // no mouth moves for it; words from above no one in the cast says are
  // the narrator's, at the top.
  script.beats.forEach((beat, k) => {
    const t = beats[k];
    if (!t) return;
    const lines: { span: [number, number]; speaker: string }[] = beat.lines
      ?.length
      ? beat.lines
      : beat.from === 'above'
        ? [{ span: [0, beat.say.length], speaker: ABOVE }]
        : [];
    for (const line of lines) {
      const speaker = castById.get(line.speaker);
      // A group's line, with its crowd behind the stage, comes from it.
      const fromCrowd =
        crowd && speaker?.kind === 'character' && speaker.group && !beat.from;
      const from: SceneLineFrom | undefined = fromCrowd
        ? 'crowd'
        : beat.kind === 'line' || line.speaker === ABOVE
          ? beat.from
          : undefined;
      if (byId.get(line.speaker)?.kind !== 'drawing' && !from) continue;
      const [a, b] = line.span;
      const words = t.words.filter((w) => w[1] > a && w[0] < b);
      const text = bubbleText(beat.say.slice(a, b));
      if (!words.length || !text) continue;
      const to = words[words.length - 1][3];
      spoken.push({
        speaker: line.speaker,
        ...(beat.to ? { to: beat.to } : {}),
        ...(from ? { from, side: offSide(line.speaker) } : {}),
        startMs: words[0][2],
        endMs: to,
        words: words.map((w) => ({
          text: beat.say.slice(w[0], w[1]),
          startMs: w[2],
          endMs: w[3],
        })),
      });
      const id = `say-${saying++}`;
      if (from)
        heard.set(id, {
          from,
          by: from === 'phone' || from === 'letter' ? (beat.to ?? null) : null,
          side: offSide(line.speaker),
        });
      effects.push({
        atMs: Math.round(Math.max(0, words[0][2] - 150)),
        target: line.speaker,
        part: null,
        do: 'say',
        say: {
          id,
          text,
          untilMs: Math.round(to + SAY_AFTER_MS),
          saidUntilMs: Math.round(to),
          ...(from ? { from } : {}),
        },
      });
    }
  });
  effects.sort((a, b) => a.atMs - b.atMs);
  // A bubble stays while its words are said: the next line closes it no
  // sooner than its own last word. It goes with its speaker if they leave
  // the stage; if the stage changes while they stay, the rest of the line
  // carries on in a bubble placed for the new step.
  const lines = effects.filter((effect) => effect.say);
  const carried: SceneEffectDto[] = [];
  lines.forEach((effect, i) => {
    const say = effect.say!;
    const said = say.saidUntilMs ?? say.untilMs;
    const next = lines[i + 1]?.atMs ?? durationMs;
    let until = Math.min(durationMs, say.untilMs, Math.max(said, next));
    let part = effect;
    // A voice from elsewhere is never on the stage: its line runs on.
    const elsewhere = say.from !== undefined && say.from !== 'thought';
    for (const step of steps) {
      if (step.atMs <= part.atMs || step.atMs >= until) continue;
      if (elsewhere) continue;
      if (!step.show.includes(effect.target)) {
        until = step.atMs;
        break;
      }
      // Its words all said, a line's bubble ends at the change: carried,
      // a finished line would flash up again.
      if (step.atMs >= said) {
        until = step.atMs;
        break;
      }
      // The line so far ends at the change of stage; the rest carries on.
      part.say!.untilMs = step.atMs;
      part.say!.saidUntilMs = Math.min(said, step.atMs);
      part.say!.carried = true;
      const rest: SceneEffectDto = {
        atMs: step.atMs,
        target: effect.target,
        part: null,
        do: 'say',
        say: {
          id: `say-${saying++}`,
          text: say.text,
          untilMs: until,
          saidUntilMs: Math.max(step.atMs, said),
          continues: true,
          // A thought carried on is still a thought.
          ...(say.from ? { from: say.from } : {}),
        },
      };
      carried.push(rest);
      part = rest;
    }
    part.say!.untilMs = until;
    part.say!.saidUntilMs = Math.min(part.say!.saidUntilMs ?? said, until);
  });
  effects.push(...carried);
  effects.sort((a, b) => a.atMs - b.atMs);
  const says = effects.filter((effect) => effect.say);

  // What the narration says they do, at the word that says it.
  script.beats.forEach((beat, k) => {
    const words = beats[k]?.words ?? [];
    for (const act of beat.acts ?? []) {
      const word = words.find((w) => w[1] > act.at) ?? words[words.length - 1];
      if (!word) continue;
      directed.push({
        atMs: Math.round(word[2]),
        target: act.who,
        other: act.toward,
        do: act.do,
      });
    }
  });
  directed.sort((a, b) => a.atMs - b.atMs);

  // How each character acts, planned from who says what and when: where
  // they look, their mouths, their gestures, and what the writer asked.
  const acting = actingOf({
    actors: script.cast
      .filter(
        (thing) =>
          (thing.kind === 'character' || thing.kind === 'person') &&
          byId.get(thing.id)?.kind === 'drawing',
      )
      .map((thing) => thing.id),
    names: new Map(
      script.cast.flatMap((thing) =>
        thing.kind === 'character' || thing.kind === 'person'
          ? [[thing.id, [thing.name]] as const]
          : [],
      ),
    ),
    steps,
    lines: spoken,
    narration: script.beats.flatMap((beat, k) => {
      const t = beats[k];
      // A screenplay's line is all the speaker's: no narration in it.
      if (!t || beat.kind === 'line') return [];
      const quoted = quotedSpans(beat.say);
      return t.words
        .filter((w) => !quoted.some(([a, b]) => w[0] >= a && w[1] <= b))
        .map((w) => ({
          text: beat.say.slice(w[0], w[1]),
          startMs: w[2],
          endMs: w[3],
        }));
    }),
    directed,
    durationMs,
    // A story's people walk on and off; a lesson's arrive as things do.
    walks: script.cast.some(
      (thing) => thing.kind === 'character' || thing.kind === 'place',
    ),
    traits: new Map(
      script.cast.flatMap((thing) =>
        thing.kind === 'character' && thing.traits?.length
          ? [[thing.id, thing.traits] as const]
          : [],
      ),
    ),
    firsts: new Set(
      script.cast.flatMap((thing) =>
        thing.kind === 'character' && thing.first ? [thing.id] : [],
      ),
    ),
  });
  /**
   * A story page's setting: its set at full strength, the light of its
   * time and its weather, and its crowd, which cheers when a group's line
   * is a shout or the words say it cheers, and gasps when they say it
   * marvels or is afraid.
   */
  const settingOf = (): NonNullable<SceneDto['setting']> => {
    const moves: [number, 'cheer' | 'gasp', number][] = [];
    if (crowd)
      script.beats.forEach((beat, k) => {
        const t = beats[k];
        if (!t) return;
        const groupLine =
          beat.kind === 'line' &&
          beat.speaker &&
          castById.get(beat.speaker)?.kind === 'character' &&
          (castById.get(beat.speaker) as CharacterThing).group;
        if (groupLine && /!/.test(beat.say)) {
          moves.push([Math.round(t.startMs), 'cheer', CROWD_MOVE_MS]);
          return;
        }
        if (beat.kind === 'line' && !groupLine) return;
        if (!CROWD_WORDS.test(beat.say) && !groupLine) return;
        for (const [pattern, move] of [
          [CHEERS, 'cheer'],
          [GASPS, 'gasp'],
        ] as const) {
          const m = pattern.exec(beat.say);
          if (!m) continue;
          const word = t.words.find((w) => w[1] > m.index) ?? t.words[0];
          if (word) moves.push([Math.round(word[2]), move, CROWD_MOVE_MS]);
          break;
        }
      });
    const time = script.setting?.time;
    const weather = script.setting?.weather;
    return {
      full: true,
      ...(time && time !== 'day' ? { time } : {}),
      ...(weather && weather !== 'clear' ? { weather } : {}),
      ...(crowd
        ? {
            crowd: {
              id: CROWD_ID,
              ...(moves.length ? { moves } : {}),
            },
          }
        : {}),
    };
  };
  // A screenplay's camera: the whole stage as it opens and while the
  // narrator speaks; on two who trade lines while others stand by; close
  // on a whisper, a shout or a strong face.
  if (script.beats.some((beat) => beat.kind))
    effects.push(...storyShots(script, beats, steps, effects, durationMs));
  /** The step a moment falls in. */
  const stepOf = (t: number) => {
    let k = -1;
    steps.forEach((step, i) => {
      if (step.atMs <= t) k = i;
    });
    return k;
  };

  // Working grows as the voice works it: a line the writer never showed
  // appears as the voice says what it comes to (its last number, in
  // figures or in words), or failing that after the line before it,
  // spread through its time on stage.
  const said = script.beats.flatMap((beat, k) =>
    (beats[k]?.words ?? []).map((w) => ({
      word: beat.say
        .slice(w[0], w[1])
        .toLowerCase()
        .replace(/[^\p{L}\p{N}.]/gu, '')
        .replace(/\.$/, ''),
      at: w[2],
    })),
  );
  /** When the voice first says a number after a moment: in figures, or in words. */
  const saysAt = (n: number, after: number, before: number) => {
    const figures = String(n);
    const inWords = numberWords(figures)
      .toLowerCase()
      .split(/[\s-]+/);
    for (let i = 0; i < said.length; i += 1) {
      if (said[i].at <= after || said[i].at >= before) continue;
      if (said[i].word.replace(/,/g, '') === figures) return said[i].at;
      if (inWords.every((w, j) => said[i + j]?.word === w)) return said[i].at;
    }
    return null;
  };
  for (const thing of things) {
    if (thing.kind !== 'drawing' || thing.source !== 'math') continue;
    const source = castById.get(thing.id);
    const latex =
      source?.kind === 'math' ? source.lines.map((l) => l.latex) : [];
    const lines = Object.keys(thing.states)
      .map((name) => ({ name, k: Number(/\d+/.exec(name)?.[0] ?? 0) }))
      .sort((a, b) => a.k - b.k);
    const first = steps.findIndex((step) => step.show.includes(thing.id));
    if (first < 0 || !lines.length) continue;
    const leaves = steps.findIndex(
      (step, i) => i > first && !step.show.includes(thing.id),
    );
    const end = leaves < 0 ? durationMs : steps[leaves].atMs;
    let last = steps[first].atMs + 300;
    lines.forEach(({ name, k }, i) => {
      const shown = effects.find(
        (e) => e.target === thing.id && e.part === name && e.do === 'show',
      );
      if (shown) {
        last = shown.atMs;
        return;
      }
      // What the line comes to: the last number on it.
      const tex = (latex[k - 1] ?? '').replace(/\{,\}/g, '');
      const result = numbersIn(tex.split('=').pop() ?? '').pop();
      const cue =
        result !== undefined
          ? saysAt(Math.abs(result), last + 300, end - 200)
          : null;
      const left = lines.length - i + 1;
      last = Math.round(
        cue !== null
          ? Math.max(last + 400, cue - 150)
          : Math.min(
              end - 200,
              last + Math.min(3200, Math.max(1200, (end - last) / left)),
            ),
      );
      effects.push({ atMs: last, target: thing.id, part: name, do: 'show' });
    });
  }

  // What stays hidden until an effect shows it: a label pointed at later, and every state.
  for (const effect of effects) {
    const thing = byId.get(effect.target);
    if (thing?.kind !== 'drawing' || !effect.part) continue;
    if (effect.do === 'point') {
      const label = thing.labels[effect.part];
      if (label && !thing.hidden.includes(label)) thing.hidden.push(label);
      // A label the stage sets waits for its point the same way.
      if (
        thing.callouts?.[effect.part] !== undefined &&
        !thing.calloutsLater?.includes(effect.part)
      )
        thing.calloutsLater?.push(effect.part);
    }
  }
  for (const thing of things)
    if (thing.kind === 'drawing')
      for (const id of Object.values(thing.states))
        if (!thing.hidden.includes(id)) thing.hidden.push(id);
  // An effect on a part the drawing does not have moves the whole drawing instead.
  for (const effect of effects) {
    const thing = byId.get(effect.target);
    if (!effect.part) continue;
    if (thing?.kind !== 'drawing') {
      effect.part = null;
      if (effect.do !== 'zoom') effect.do = 'pulse';
      continue;
    }
    // The camera on two things: the second is no part, and needs none.
    if (effect.do === 'zoom' && byId.has(effect.part)) continue;
    const known =
      effect.do === 'show' || effect.do === 'hide'
        ? thing.states[effect.part]
        : (thing.parts[effect.part] ??
          thing.labels[effect.part] ??
          thing.callouts?.[effect.part]);
    if (!known) {
      effect.part = null;
      effect.do = 'pulse';
    }
  }

  // The quiet stretches: a pulse on whatever holds the eye then. Not on
  // someone who acts: they are never still, and a pulse is no way to move.
  let filled = 0;
  const changes = [...steps.map((s) => s.atMs), ...effects.map((e) => e.atMs)];
  for (const [from, to] of quietGaps(changes, durationMs)) {
    const span = to - from;
    const count = Math.floor(span / 6000);
    for (let i = 1; i <= count; i += 1) {
      const at = Math.round(from + (span * i) / (count + 1));
      const current = [...steps].reverse().find((s) => s.atMs <= at);
      const target = [current?.focus, ...(current?.show ?? [])].find(
        (id) => id && !acting[id],
      );
      if (!target) continue;
      effects.push({
        atMs: at,
        target,
        part: null,
        do: 'pulse',
        filler: true,
      });
      filled += 1;
    }
  }
  effects.sort((a, b) => a.atMs - b.atMs);

  const geometry = new Map<string, Geometry>();
  for (const thing of script.cast) {
    const drawing = drawings.get(thing.id);
    if (thing.kind !== 'stat' && thing.kind !== 'words' && drawing)
      geometry.set(thing.id, {
        callouts: drawing.callouts,
        viewBox: drawing.viewBox,
        field: drawing.field,
        ...(drawing.words ? { words: drawing.words } : {}),
        ...(drawing.head ? { head: drawing.head } : {}),
        ...(drawing.stands ? { stands: drawing.stands } : {}),
      });
  }
  const introduced = new Set(
    script.cast.flatMap((thing) =>
      thing.kind === 'character' && thing.intro.length ? [thing.id] : [],
    ),
  );
  const place = (staging: StagingName) => {
    const lookup = new Map(
      things.map((thing) => [thing.id, laid(thing, geometry.get(thing.id))]),
    );
    // What a character is like is set beside them only while they have the
    // room for it: with at most one other thing on the stage. In a crowd
    // they stand without it, and give up no room to it.
    const crowd = new Map(lookup);
    for (const id of introduced) {
      const thing = lookup.get(id);
      if (thing?.kind === 'drawing')
        crowd.set(id, {
          kind: 'drawing',
          aspect: thing.aspect,
          caption: thing.caption,
          ...(thing.stands ? { stands: thing.stands } : {}),
        });
    }
    const stage = STAGINGS[staging];
    const places: Record<string, ScenePlaceDto>[] = [];
    const pills: Record<string, ScenePillDto | null>[] = [];
    const bubbles: Record<string, SceneBubbleDto | null> = {};
    const audit: Collision[][] = [];
    for (const [k, step] of steps.entries()) {
      const crowded = step.show.length > 2;
      const laidOut = layoutStep(
        step.layout,
        step.show,
        crowded ? crowd : lookup,
        staging,
      );
      // People stand as people do: one scale, one ground.
      standTogether(
        laidOut,
        crowded ? crowd : lookup,
        step.show,
        staging,
        Boolean(step.backdrop),
      );
      const arrows = step.arrows.flatMap((arrow) => {
        const a = laidOut[arrow.from];
        const b = laidOut[arrow.to];
        return a && b
          ? [{ arrow, path: arrowPath(a, b, step.layout === 'cycle', stage) }]
          : [];
      });
      // What an arrow's label must keep off: every run of words, a
      // drawing's ink (not the empty corners of its box), and anything
      // whose ink is not known, whole.
      const inks = inksOf(laidOut, geometry);
      const inked = new Set(inks.map((ink) => ink.owner));
      const solid = [
        ...wordsOf(laidOut, byId, {}, []).map((w) => w.box),
        ...inks.flatMap((ink) => ink.boxes),
        ...Object.entries(laidOut)
          .filter(([id]) => byId.get(id)?.kind === 'drawing' && !inked.has(id))
          .map(([, at]) => extentOf(at)),
      ];
      // Each arrow's label on its arrow, clear of the things and of one another.
      const stepPills: Record<string, ScenePillDto | null> = {};
      const pillBoxes: Rect[] = [];
      for (const { arrow, path } of arrows) {
        if (!arrow.label) continue;
        const pill = placePill({
          label: arrow.label,
          path,
          avoid: {
            boxes: [...solid, ...pillBoxes],
            segments: arrows
              .filter((other) => other.arrow.id !== arrow.id)
              .flatMap((other) => segmentsOf(other.path)),
          },
          stage,
        });
        stepPills[arrow.id] = pill;
        if (pill) pillBoxes.push(pillBox(path, pill));
      }
      // Each drawing's labels beside it, clear of the arrows and their labels.
      const segments = arrows.flatMap((one) => segmentsOf(one.path));
      for (const id of step.show) {
        const found = geometry.get(id);
        const at = laidOut[id];
        if (!found?.callouts.length || !at?.room) continue;
        if (crowded && introduced.has(id)) continue;
        const labels = placeLabels({
          place: at,
          room: at.room,
          viewBox: found.viewBox,
          callouts: found.callouts,
          avoid: { boxes: pillBoxes, segments },
        });
        // What someone is like, cut short, is better not said at all.
        if (
          introduced.has(id) &&
          labels.some((label) => label.lines.some((l) => l.endsWith('…')))
        )
          continue;
        at.labels = labels;
      }
      // What each character says at this step, in a bubble by their head,
      // clear of every word, ink and arrow; audited as words like the rest.
      const spoken: Words[] = [];
      for (const effect of says) {
        if (stepOf(effect.atMs) !== k) continue;
        const voice = heard.get(effect.say!.id);
        // Whose head it is by: the speaker's, or whoever hears the phone
        // or holds the letter; a voice from above or off the stage, no one's.
        const by = voice && voice.from !== 'thought' ? voice.by : effect.target;
        const at = by ? laidOut[by] : undefined;
        const found = by ? geometry.get(by) : undefined;
        let bubble: SceneBubbleDto | null = null;
        let head: [number, number] | null = null;
        if (at && found?.head) {
          const s = at.w / found.viewBox[2];
          head = [
            at.x + (found.head[0] - found.viewBox[0]) * s,
            at.y + (found.head[1] - found.viewBox[1]) * s,
          ];
          const avoid = {
            boxes: [
              ...solid,
              ...pillBoxes,
              ...wordsOf(laidOut, byId, stepPills, arrows).map((w) => w.box),
            ],
            segments,
          };
          const asked = {
            text: effect.say!.text,
            head,
            body: at,
            stage,
            avoid,
          };
          // By their head, or narrower where the step is crowded.
          bubble = placeBubble(asked) ?? placeBubble({ ...asked, width: 300 });
        }
        // A crowd's words, over the crowd: on the side of it farther from
        // the story's people, so the words are never taken for theirs.
        if (!bubble && voice?.from === 'crowd') {
          const band = crowdBand(stage);
          const people = Object.entries(laidOut)
            .filter(([id]) => castById.get(id)?.kind === 'character')
            .map(([, at]) => at.x + at.w / 2);
          const sides = [0.2, 0.8].map((k) => stage.w * k);
          const clear = (x: number) =>
            Math.min(...people.map((p) => Math.abs(p - x)), Infinity);
          const x = clear(sides[0]) >= clear(sides[1]) ? sides[0] : sides[1];
          head = [x, band.head[1]];
          const asked = {
            text: effect.say!.text,
            head,
            body: {
              x: x - stage.w * 0.15,
              y: band.box.y,
              w: stage.w * 0.3,
              h: band.box.h,
            },
            stage,
            avoid: {
              boxes: [
                ...solid,
                ...pillBoxes,
                ...wordsOf(laidOut, byId, stepPills, arrows).map((w) => w.box),
              ],
              segments,
            },
          };
          bubble = placeBubble(asked) ?? placeBubble({ ...asked, width: 300 });
        }
        // A voice with no one on the stage to be by: across the top, or at
        // the edge it comes from.
        if (!bubble && voice && voice.from !== 'thought')
          bubble = placeVoice({
            text: effect.say!.text,
            from:
              voice.from === 'phone'
                ? 'off'
                : voice.from === 'crowd'
                  ? 'above'
                  : voice.from,
            side: voice.side,
            stage,
          });
        // No room by them, or not on the stage: a strip across the top.
        bubble ??= placeStrip({
          text: effect.say!.text,
          who: nameOf(castById.get(effect.target)) ?? effect.target,
          head,
          stage,
        });
        if (voice)
          bubble = {
            ...bubble,
            from: voice.from,
            ...(by && by !== effect.target && at ? { by } : {}),
          };
        bubbles[effect.say!.id] = bubble;
        if (bubble)
          spoken.push({
            owner: `${effect.target}:say`,
            what: effect.say!.id,
            box: bubble,
          });
      }
      const seen = {
        inks,
        arrows: arrows.map((one) => ({
          id: one.arrow.id,
          segments: segmentsOf(one.path),
        })),
        stage,
      };
      const standing = wordsOf(laidOut, byId, stepPills, arrows);
      const found = auditStep({ words: standing, ...seen });
      // A bubble is on the stage with everything else, but never with the
      // bubble before it: each is checked against the step alone.
      for (const bubble of spoken) {
        const key = `${bubble.owner}:${bubble.what}`;
        found.push(
          ...auditStep({ words: [...standing, bubble], ...seen }).filter(
            (one) => one.a === key || one.b === key,
          ),
        );
      }
      audit.push(found);
      places.push(
        Object.fromEntries(
          Object.entries(laidOut).map(([id, at]) => {
            // The room is code's own business: the player gets the place without it.
            const { room, labelsAt, labelSize, ...seen } = at;
            void room;
            void labelsAt;
            void labelSize;
            return [id, seen];
          }),
        ),
      );
      pills.push(stepPills);
    }
    return { places, pills, bubbles, audit };
  };
  const box = place('box');
  const wide = place('wide');

  return {
    scene: {
      version: 4,
      generator: input.generator,
      title: script.title,
      durationMs,
      timing: input.timing,
      ...(input.profile?.stage ? { stage: input.profile.stage } : {}),
      ...(Object.keys(acting).length ? { acting } : {}),
      ...(story ? { setting: settingOf() } : {}),
      sound: {
        mood: script.mood,
        music: placeMusic({
          beats: beats.map((b, i) => ({
            startMs: b.startMs,
            endMs: b.endMs,
            music: script.beats[i]?.music,
            energy: script.beats[i]?.energy,
          })),
          mood: script.mood,
          steps,
          things,
          durationMs,
          tone: input.profile?.tone,
        }),
        palette: paletteOf(input.profile),
        // The story's few notes, as a page of it opens.
        ...(input.profile?.story || script.opening
          ? { motif: true as const }
          : {}),
      },
      beats: beats.map((b, i) => {
        const beat = script.beats[i];
        const delivery = beat?.delivery;
        // A screenplay's line: who says it, for the caption.
        const who =
          beat?.kind === 'line' && beat.speaker
            ? nameOf(castById.get(beat.speaker))
            : null;
        return {
          text: b.text,
          startMs: b.startMs,
          endMs: b.endMs,
          words: b.words,
          ...(delivery && delivery !== 'explain' ? { delivery } : {}),
          ...(who ? { who } : {}),
        };
      }),
      things: things.filter(
        (thing) =>
          thing.id === CROWD_ID ||
          steps.some(
            (s) => s.show.includes(thing.id) || s.backdrop === thing.id,
          ),
      ),
      steps,
      effects,
      stagings: {
        box: {
          w: STAGINGS.box.w,
          h: STAGINGS.box.h,
          places: box.places,
          pills: box.pills,
          ...(says.length ? { bubbles: box.bubbles } : {}),
        },
        wide: {
          w: STAGINGS.wide.w,
          h: STAGINGS.wide.h,
          places: wide.places,
          pills: wide.pills,
          ...(says.length ? { bubbles: wide.bubbles } : {}),
        },
      },
    },
    filled,
    audit: { box: box.audit, wide: wide.audit },
  };
}

/** Where a run of words sits: its measured width, centred where it is set. */
function textBox(
  lines: string[],
  size: number,
  centreX: number,
  top: number,
  weight: 600 | 700 = 600,
  /** A line's height, in sizes: a number alone, with nothing below its baseline, is shorter than words. */
  line = 1.2,
): Rect {
  const w = Math.max(0, ...lines.map((l) => measureText(l, size, weight)));
  return { x: centreX - w / 2, y: top, w, h: lines.length * size * line };
}

/** Every run of words on the stage at one step, with whose it is. */
function wordsOf(
  places: Record<string, Place>,
  things: ReadonlyMap<string, SceneThingDto>,
  pills: Record<string, ScenePillDto | null>,
  arrows: { arrow: SceneArrowDto; path: [number, number][] }[],
): Words[] {
  const out: Words[] = [];
  for (const [id, at] of Object.entries(places)) {
    const thing = things.get(id);
    const c = at.caption;
    if (thing?.kind === 'words') {
      out.push({ owner: id, what: 'words', box: at });
      continue;
    }
    if (thing?.kind === 'stat')
      out.push({
        owner: id,
        what: 'value',
        // As the layout keeps room for it: its figures and no more.
        box: textBox(
          [thing.value],
          at.size ?? 80,
          at.x + at.w / 2,
          at.y,
          700,
          1.1,
        ),
      });
    if (c)
      out.push({
        owner: id,
        what: 'caption',
        box: textBox(c.lines, c.size, c.x + c.w / 2, c.y),
      });
    for (const label of at.labels ?? [])
      out.push({ owner: id, what: `label ${label.part}`, box: label });
  }
  for (const { arrow, path } of arrows) {
    const pill = pills[arrow.id];
    if (pill)
      out.push({ owner: arrow.id, what: 'pill', box: pillBox(path, pill) });
  }
  return out;
}

/** Where each drawing on the stage has ink at one step: its ink map's filled cells, run by run. */
function inksOf(
  places: Record<string, Place>,
  geometry: ReadonlyMap<string, Geometry>,
): Ink[] {
  const out: Ink[] = [];
  for (const [id, at] of Object.entries(places)) {
    const found = geometry.get(id);
    const field = found?.field;
    if (!found || !field) continue;
    const [vx, vy, vw] = found.viewBox;
    const s = at.w / vw;
    const [fx, fy, fw, fh] = field.viewBox;
    const { cols, rows, bits } = field.map;
    const cw = fw / cols;
    const ch = fh / rows;
    const boxes: Rect[] = [];
    for (let row = 0; row < rows; row += 1) {
      let start = -1;
      for (let col = 0; col <= cols; col += 1) {
        const inked = col < cols && bits[row * cols + col] === '1';
        if (inked && start < 0) start = col;
        if (!inked && start >= 0) {
          boxes.push({
            x: at.x + (fx + start * cw - vx) * s,
            y: at.y + (fy + row * ch - vy) * s,
            w: (col - start) * cw * s,
            h: ch * s,
          });
          start = -1;
        }
      }
    }
    out.push({ owner: id, boxes });
  }
  return out;
}

/**
 * A drawing's groups still hidden at `t`: every one hidden at the start
 * but the states shown by then and not hidden again, and the labels
 * pointed at. What a still of that moment shows, a character's face
 * included.
 */
export function hiddenAt(
  scene: SceneDto,
  thing: Extract<SceneThingDto, { kind: 'drawing' }>,
  t: number,
): string[] {
  const hidden = new Set(thing.hidden);
  const mine = scene.effects
    .filter((e) => e.target === thing.id && e.part && e.atMs <= t)
    .sort((a, b) => a.atMs - b.atMs);
  for (const effect of mine) {
    const state = thing.states[effect.part!];
    const label = thing.labels[effect.part!];
    if (effect.do === 'show' && state) hidden.delete(state);
    if (effect.do === 'hide' && state) hidden.add(state);
    if (effect.do === 'point' && label) hidden.delete(label);
  }
  return [...hidden];
}

/** The step to show on the page's card: the fullest, the later one on a tie. */
export function fullestStep(scene: SceneDto): number {
  let best = 0;
  scene.steps.forEach((step, i) => {
    if (step.show.length >= scene.steps[best].show.length) best = i;
  });
  return best;
}

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The stage colours, matching the player's. */
export const STAGE_PAINT = {
  ground: '#FBF7EF',
  ink: '#1F2A37',
  muted: '#5B6675',
  accent: '#E0663A',
  card: '#FFFFFF',
  cardEdge: '#E4DCCB',
} as const;

/**
 * One still of the page for its card, as SVG: the fullest step in the
 * box staging. Each drawing comes as a PNG already rendered on its own,
 * so no two drawings' ids or styles can meet in one document.
 */
export function thumbSvg(
  scene: SceneDto,
  pngs: ReadonlyMap<string, Buffer>,
): string {
  return stepSvg(scene, pngs, 'box', fullestStep(scene));
}

/**
 * One step of a staging as a still: its drawings from their PNGs, their
 * captions and the labels shown by then, the numbers and the words, and
 * the arrows as dashes. The card's still, and the bench's contact sheet.
 */
export function stepSvg(
  scene: SceneDto,
  pngs: ReadonlyMap<string, Buffer>,
  stagingName: StagingName,
  index: number,
): string {
  const staging = scene.stagings[stagingName];
  const step = scene.steps[index];
  if (!step)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${staging.w} ${staging.h}"><rect width="${staging.w}" height="${staging.h}" fill="${STAGE_PAINT.ground}"/></svg>`;
  const places = staging.places[index];
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const parts: string[] = [];
  // The scene behind the stage, covering it, faded as the player fades it.
  const scenery = step.backdrop ? pngs.get(step.backdrop) : undefined;
  if (scenery)
    parts.push(
      `<image x="0" y="0" width="${staging.w}" height="${staging.h}" preserveAspectRatio="xMidYMid slice" opacity="${BACKDROP_OPACITY}" href="data:image/png;base64,${scenery.toString('base64')}"/>`,
    );
  const text = (
    x: number,
    y: number,
    size: number,
    body: string,
    weight = 600,
    fill: string = STAGE_PAINT.ink,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" font-family="Liberation Sans, sans-serif">${escape(body)}</text>`;
  const caption = (p: ScenePlaceDto, fill: string = STAGE_PAINT.ink) =>
    p.caption
      ? p.caption.lines
          .map((line, i) =>
            text(
              p.caption!.x + p.caption!.w / 2,
              p.caption!.y + p.caption!.size * (0.9 + i * 1.2),
              p.caption!.size,
              line,
              600,
              fill,
            ),
          )
          .join('')
      : '';
  for (const arrow of step.arrows) {
    const a = places[arrow.from];
    const b = places[arrow.to];
    if (!a || !b) continue;
    parts.push(
      `<line x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}" stroke="${STAGE_PAINT.muted}" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 14"/>`,
    );
  }
  for (const id of step.show) {
    const thing = byId.get(id);
    const p = places[id];
    if (!thing || !p) continue;
    if (thing.kind === 'drawing') {
      const png = pngs.get(id);
      if (png)
        parts.push(
          `<image x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" href="data:image/png;base64,${png.toString('base64')}"/>`,
        );
      parts.push(caption(p));
      // Its labels as the stage sets them, those shown by this step.
      const until = scene.steps[index + 1]?.atMs ?? scene.durationMs;
      for (const label of p.labels ?? []) {
        const later = thing.calloutsLater?.includes(label.part);
        const pointed = scene.effects.some(
          (e) =>
            e.target === id &&
            e.part === label.part &&
            e.do === 'point' &&
            e.atMs < until,
        );
        if (later && !pointed) continue;
        if (label.leader) {
          const [x1, y1, x2, y2] = label.leader;
          parts.push(
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STAGE_PAINT.muted}" stroke-width="3" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="5" fill="${STAGE_PAINT.muted}"/>`,
          );
        }
        label.lines.forEach((line, i) =>
          parts.push(
            `<text x="${label.align === 'end' ? label.x + label.w : label.align === 'middle' ? label.x + label.w / 2 : label.x}" y="${label.y + label.size * (0.9 + i * 1.2)}" font-size="${label.size}" font-weight="600" fill="${STAGE_PAINT.ink}" text-anchor="${label.align}" font-family="Liberation Sans, sans-serif">${escape(line)}</text>`,
          ),
        );
      }
    } else if (thing.kind === 'stat') {
      parts.push(
        text(
          p.x + p.w / 2,
          p.y + (p.size ?? 80) * 0.9,
          p.size ?? 80,
          thing.value,
          700,
          STAGE_PAINT.accent,
        ),
      );
      parts.push(caption(p, STAGE_PAINT.muted));
    } else {
      if (thing.style !== 'title')
        parts.push(
          `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${Math.min(p.h / 2, 28)}" fill="${STAGE_PAINT.card}" stroke="${STAGE_PAINT.cardEdge}" stroke-width="3"/>`,
        );
      parts.push(caption(p));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${staging.w} ${staging.h}"><rect width="${staging.w}" height="${staging.h}" fill="${STAGE_PAINT.ground}"/>${parts.join('')}</svg>`;
}

/** The step as one line for the log: when, what layout, what is on it. */
export function describeStep(step: SceneStep, index: number): string {
  return `${index + 1}. [${step.at.beat + 1}:${step.word}] "${step.at.phrase}" ${step.stage ? `${step.stage.layout}(${step.stage.show.join(', ')})` : ''}${step.effects.length ? ` ${step.effects.map((e) => `${e.do} ${e.target}${e.part ? `.${e.part}` : ''}`).join(', ')}` : ''}`;
}
