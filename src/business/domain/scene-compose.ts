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
  ScenePropDto,
  SceneStepDto,
  SceneSettingDto,
  SceneThingDto,
  SceneTiming,
} from '../../contracts';
import { actingOf, type DirectedMove, type SpokenLine } from './scene-acting';
import {
  crowdHeads,
  asideOf,
  drawCrowd,
  planCrowd,
  type GoingBy,
  type CastAt,
  type CrowdPlan,
} from './scene-crowd';
import { conventionGround } from './scene-ground';
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
  layoutStations,
  restingAt,
  seatedHeight,
  layoutStep,
  placeFeature,
  stationScale,
  stationShares,
  standTogether,
  type FeaturePlace,
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
import {
  CARRIED_CLOTHES,
  PROP_LOOSE,
  drawProp,
  noTallerThan,
  type PropLoose,
} from './scene-props';
import { wearableOf } from './scene-wear';
import {
  ACTED_MOVES,
  HELD_MOVES,
  THING_ACTIONS,
  actionDoing,
  aimedFeature,
  doingOf,
  isStageProp,
  type ThingAction,
} from './scene-doings';
import { FIGURE_FRAME, figureFrame } from './scene-figure';
import { DRAWN } from './scene-own';
import {
  ACTED_PIECES,
  coveredPiece,
  drawPiece,
  featureGroup,
} from './scene-set-pieces';
import type { DocumentProfile } from './scene-profile';
import {
  againstScenery,
  hurried,
  settledOf,
  viewOf,
  walkEase,
  walksOf,
  withoutJumps,
  type StageWalk,
} from './scene-film';
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
 * How a set's frame lies on a stage: covering it, cut to its shape, as
 * the stage lays every set (xMidYMid slice). A point of the stage in the
 * set's own units, and the stage's pixels to one of the set's.
 */
export function setFrameOn(
  frame: [number, number, number, number],
  stage: { w: number; h: number },
): {
  scale: number;
  toSet: (x: number, y: number) => [number, number];
  toStage: (x: number, y: number) => [number, number];
} {
  const [vx, vy, vw, vh] = frame;
  const scale = Math.max(stage.w / vw, stage.h / vh);
  const ox = (stage.w - vw * scale) / 2;
  const oy = (stage.h - vh * scale) / 2;
  return {
    scale,
    toSet: (x, y) => [(x - ox) / scale + vx, (y - oy) / scale + vy],
    toStage: (x, y) => [(x - vx) * scale + ox, (y - vy) * scale + oy],
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

/** Two things one person does with things are at least this far apart: a take, then a break. */
const BUSINESS_APART_MS = 650;

/** How long each handling of a thing takes on the stage, and how far into it the thing changes hands: as the list of doings has it. */
const HANDLING_MS = Object.fromEntries(
  THING_ACTIONS.map((id) => [id, doingOf(actionDoing(id))!.ms]),
) as Record<ThingAction, number>;
const HANDLING_AT = Object.fromEntries(
  THING_ACTIONS.map((id) => [id, doingOf(actionDoing(id))!.keyAt]),
) as Record<ThingAction, number>;

/** A point in a drawing's own units, as shares of its box across and down. */
const shareOf = (
  viewBox: [number, number, number, number],
  [x, y]: [number, number],
): [number, number] => [
  Math.round(((x - viewBox[0]) / viewBox[2]) * 1000) / 1000,
  Math.round(((y - viewBox[1]) / viewBox[3]) * 1000) / 1000,
];

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
    // And where each arm's shoulder, elbow and hand are, as shares of the
    // box: so a hand goes where it means to, not just up by so much.
    ...(drawing.acts && drawing.joints
      ? {
          joints: {
            r: drawing.joints.r.map((p) => shareOf(drawing.viewBox, p)),
            l: drawing.joints.l.map((p) => shareOf(drawing.viewBox, p)),
          },
        }
      : {}),
    // And each leg's hip, knee and foot: the knees bend by them.
    ...(drawing.acts && drawing.legs
      ? {
          legs: {
            r: drawing.legs.r.map((p) => shareOf(drawing.viewBox, p)),
            l: drawing.legs.l.map((p) => shareOf(drawing.viewBox, p)),
          },
        }
      : {}),
    ...(thing.kind === 'character' && thing.minor
      ? { minor: true as const }
      : {}),
    ...(drawing.head ? { head: shareOf(drawing.viewBox, drawing.head) } : {}),
    // One drawn by the artist carries what it holds at its mouth, at the
    // kit's size beside the people it stands with.
    ...(drawing.mouth && !drawing.acts
      ? { mouth: shareOf(drawing.viewBox, drawing.mouth) }
      : {}),
    // Where its rig turns its head, and which way it faces as drawn: it
    // dips its head to lick and sniff, and turns to face where it goes.
    ...(drawing.neck && drawing.dip && !drawing.acts
      ? { neck: shareOf(drawing.viewBox, drawing.neck), dip: drawing.dip }
      : {}),
    ...(drawing.sinks && !drawing.acts ? { sinks: drawing.sinks } : {}),
    ...(drawing.faces && !drawing.acts ? { faces: drawing.faces } : {}),
    ...(drawing.stands && !drawing.acts ? { units: drawing.stands.units } : {}),
    // What a person the kit drew wears, in words: as drawn, and each
    // outfit they change into, as the film shows them.
    ...(drawing.acts && drawing.outfits?.length
      ? { wears: drawing.outfits }
      : {}),
    // A person the kit drew in bed or lying for the whole scene: so said.
    ...(drawing.acts &&
    (thing.kind === 'character' || thing.kind === 'person') &&
    (thing.pose === 'in bed' || thing.pose === 'lying')
      ? { drawnAs: thing.pose }
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
  /** Someone who stands with people: the kit's units their frame is tall; how high they sit and how long they lie, when the kit draws them. */
  stands?: { units: number; seated?: number; length?: number };
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
  /**
   * The book: its instruments, the bounds on its music, whether it is a
   * story, whom it is for; and `film` on a Studio film's scene, played as a
   * clip of the film.
   */
  profile?:
    | (Pick<DocumentProfile, 'kind' | 'tone' | 'story' | 'stage'> & {
        film?: boolean;
      })
    | null;
  /** The book's or the show's own key: each of its places keeps the same crowd, its regulars, whenever the story comes back to it. */
  key?: string | null;
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
/** Things that fly on a string once raised. */
const FLIES = /\b(?:kites?|balloons?)\b/iu;

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

/** How long something done takes to be seen, when nothing says: a walk across, a move. */
const DOING_SEEN_MS = 1500;
/** A gate or a door swinging is seen from this long before its moment until this long after. */
const SWING_SEEN_MS = 400;
/** Something done with no more than this of it left is done, for a shot that would begin then. */
const DOING_ENDS_MS = 400;
/** A close or two-shot the scene asked for holds this long at most: then the whole stage again. */
const DIRECTED_MOST_MS = 8000;
/**
 * A cut comes in the quiet before a line: this long after the last word
 * said, and no sooner than this before the line, so the eye is on the new
 * shot as the words begin and never leaves anyone in the middle of theirs.
 */
const CUT_AFTER_WORDS_MS = 120;
const CUT_BEFORE_LINE_MS = 250;
/** No shot changes this near a directed scene's end: the last shot holds, and the film goes on to the next from it. */
const HOLD_LAST_MS = 1500;

/**
 * Where cuts can go between a scene's lines. `before(b)`: in the quiet
 * before line `b`. `from(t)`: at `t` when it is between lines, else in
 * the quiet after the line it falls in.
 */
export function quietCuts(
  beats: readonly Pick<TimedBeat, 'startMs' | 'endMs'>[],
  durationMs: number,
): { before: (b: number) => number; from: (t: number) => number } {
  const before = (b: number) => {
    const start = beats[b].startMs;
    const said = b > 0 ? beats[b - 1].endMs : -Infinity;
    return Math.max(
      0,
      Math.min(
        start,
        Math.max(said + CUT_AFTER_WORDS_MS, start - CUT_BEFORE_LINE_MS),
      ),
    );
  };
  const from = (t: number) => {
    const b = beats.findIndex((beat) => beat.endMs + CUT_AFTER_WORDS_MS > t);
    if (b < 0 || beats[b].startMs > t) return t;
    return b + 1 < beats.length
      ? before(b + 1)
      : Math.min(durationMs, beats[b].endMs + CUT_AFTER_WORDS_MS);
  };
  return { before, from };
}

/** A shot on something done in a quiet comes in this long before its moment. */
const SHOT_BEFORE_MOMENT_MS = 250;
/** Gone off the stage within this long of a moment: they leave at it. */
const LEAVING_MS = 600;

/** Something someone does that a shot on anyone else would hide: from when, until when. */
export interface Doing {
  who: string;
  fromMs: number;
  toMs: number;
}

/**
 * The camera as a scene says it (the Studio's sheets), cut as a film is:
 * the whole stage, one person close, or two framed together, each from
 * the quiet before its line (or, on something done in a quiet, from its
 * moment) until the next the sheet asks for (the whole stage between). A
 * shot ends before the stage changes, so an arrival is seen whole, and
 * before a line said by anyone it leaves out; one held 8 s goes back to
 * the whole stage in the quiet after the line it has reached. Nothing
 * anyone else does is hidden by it: a shot comes in once what is being
 * done as it would begin is done, and goes back to the whole stage before
 * anything else is. Two in a row on the same are one shot, a shot too
 * short to take in is none, and nothing changes in the scene's last
 * moments. Only on who is there. Every shot comes in by a cut.
 */
export function directedShots(
  script: SceneScript,
  beats: readonly TimedBeat[],
  steps: readonly SceneStepDto[],
  durationMs: number,
  options: {
    /** When a moment in a quiet comes: after spoken beat `beat`, `after` seconds in. */
    momentMs?: (beat: number, after: number) => number;
    /** What everyone does, that no shot on anyone else may hide. */
    doings?: readonly Doing[];
  } = {},
): SceneEffectDto[] {
  if (!beats.length) return [];
  const stageAt = (t: number) =>
    [...steps].reverse().find((step) => step.atMs <= t)?.show ?? [];
  const changeAfter = (t: number) =>
    steps.find((step) => step.atMs > t + 50)?.atMs ?? durationMs;
  const cuts = quietCuts(beats, durationMs);
  /** The line a moment falls in the words of, or -1. */
  const lineAt = (t: number) =>
    beats.findIndex((beat) => beat.startMs <= t && t < beat.endMs);
  /** Who says each line: none for the narrator. */
  const speakerOf = (b: number) =>
    script.beats[b]?.kind === 'line' ? (script.beats[b].speaker ?? null) : null;
  // What the sheet asks for, from where: a shot on who is there, or the
  // whole stage (null). Two for one line: the later.
  const wanted: {
    at: number;
    /** From a moment in a quiet: the stage may change at it, as its doing does. */
    moment: boolean;
    shot: { on: string; with: string | null } | null;
  }[] = [];
  for (const shot of [...(script.camera ?? [])].sort(
    (a, b) => a.beat - b.beat || (a.after ?? -1) - (b.after ?? -1),
  )) {
    const b = Math.max(0, Math.min(shot.beat, beats.length - 1));
    const moment =
      shot.after !== undefined && options.momentMs
        ? options.momentMs(shot.beat, shot.after)
        : null;
    // One who goes off at the moment is seen close as the line before it
    // is said, until they go.
    const leaving =
      moment !== null &&
      Boolean(shot.on) &&
      stageAt(moment - 1).includes(shot.on!) &&
      !stageAt(moment + LEAVING_MS).includes(shot.on!);
    // Never before the words before it are said.
    const at = Math.round(
      moment !== null && !leaving
        ? Math.max(
            0,
            moment - SHOT_BEFORE_MOMENT_MS,
            shot.beat >= 0 && beats[shot.beat]
              ? beats[shot.beat].endMs + CUT_AFTER_WORDS_MS
              : 0,
          )
        : cuts.before(b),
    );
    const on = stageAt(moment !== null ? moment - 1 : beats[b].startMs + 50);
    const framed =
      shot.shot !== 'wide' && shot.on && on.includes(shot.on)
        ? {
            on: shot.on,
            with:
              shot.shot === 'two' &&
              shot.with &&
              shot.with !== shot.on &&
              on.includes(shot.with)
                ? shot.with
                : null,
          }
        : null;
    if (wanted[wanted.length - 1]?.at === at) wanted.pop();
    wanted.push({ at, moment: moment !== null && !leaving, shot: framed });
  }
  const shots: SceneEffectDto[] = [];
  wanted.forEach(({ at: asked, moment, shot }, i) => {
    if (!shot) return;
    const framed = (who: string) => who === shot.on || who === shot.with;
    const others = (options.doings ?? []).filter((one) => !framed(one.who));
    // Something being done by someone else as it would begin: once it is,
    // unless it is all but done.
    let at = asked;
    for (const one of others)
      if (one.fromMs <= at + SHOT_LEAST_MS && one.toMs > at + DOING_ENDS_MS)
        at = Math.max(at, Math.round(cuts.from(one.toMs - DOING_ENDS_MS)));
    let until = Math.min(wanted[i + 1]?.at ?? durationMs, durationMs);
    if (until - at < SHOT_LEAST_MS) return;
    // Before the stage changes; in the quiet before the line it changes in.
    // A change in the shot's own first line comes on in the shot, which
    // runs on to the quiet after that line: never lost, nor cut mid-line.
    // A shot on something done in a quiet sees it through its moment.
    const change = changeAfter(moment ? asked + SHOT_BEFORE_MOMENT_MS : at);
    if (change < until) {
      const line = lineAt(change);
      const quiet = line >= 0 ? cuts.before(line) : change;
      until = quiet > at ? quiet : Math.min(until, cuts.from(change));
    }
    // Before a line said by anyone it leaves out, and before anything
    // anyone else does next.
    for (let b = 0; b < beats.length; b += 1) {
      const speaker = speakerOf(b);
      if (!speaker || framed(speaker) || beats[b].startMs <= at + 50) continue;
      until = Math.min(until, cuts.before(b));
      break;
    }
    for (const one of others)
      if (one.fromMs > at && one.fromMs < until) {
        const line = lineAt(one.fromMs);
        until = Math.min(
          until,
          line >= 0 ? cuts.before(line) : one.fromMs - 100,
        );
      }
    if (until - at > DIRECTED_MOST_MS)
      until = Math.min(until, cuts.from(at + DIRECTED_MOST_MS));
    until = Math.round(until);
    if (until <= at) return;
    const last = shots[shots.length - 1];
    // The same framing again at once: one shot.
    if (
      last &&
      last.untilMs === at &&
      last.target === shot.on &&
      last.part === shot.with
    ) {
      last.untilMs = until;
      return;
    }
    shots.push({
      atMs: at,
      target: shot.on,
      part: shot.with,
      do: 'zoom',
      untilMs: until,
      shot: { enter: 'cut' },
    });
  });
  const same = (a: SceneEffectDto, b: SceneEffectDto) =>
    a.target === b.target && a.part === b.part;
  // A shot too short to take in is none: what was on before holds through it.
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    if (shot.untilMs! - shot.atMs >= SHOT_LEAST_MS) continue;
    const before = shots[i - 1];
    if (before?.untilMs === shot.atMs) before.untilMs = shot.untilMs;
    shots.splice(i, 1);
  }
  // So is a stretch of the whole stage between two shots: the shot before
  // holds through it, and is one shot with the next where they frame the same.
  for (let i = shots.length - 2; i >= 0; i -= 1) {
    const [a, b] = [shots[i], shots[i + 1]];
    if (b.atMs - a.untilMs! >= SHOT_LEAST_MS) continue;
    a.untilMs = b.atMs;
    if (same(a, b)) {
      a.untilMs = b.untilMs;
      shots.splice(i + 1, 1);
    }
  }
  // Nothing changes in the last moments: a shot that would end there holds
  // to the end, and none begins there.
  const tail = durationMs - HOLD_LAST_MS;
  return shots
    .filter((shot) => shot.atMs < tail)
    .map((shot) =>
      shot.untilMs! > tail ? { ...shot, untilMs: durationMs } : shot,
    );
}

/**
 * The shots on someone who goes across the stage as it would run: one
 * that would begin as they set off comes in once they are there, framed
 * where they end up; one they would set off in ends as they do. A shot
 * left too short to take in is none. Going on or off is the shot's own.
 */
export function shotsBesideWalks(
  shots: readonly SceneEffectDto[],
  walks: readonly StageWalk[],
  W: number,
): SceneEffectDto[] {
  const across = walks.filter(
    (one) =>
      one.start.x + one.start.w > 0 &&
      one.start.x < W &&
      one.end.x + one.end.w > 0 &&
      one.end.x < W,
  );
  return shots.flatMap((shot) => {
    let at = shot.atMs;
    let until = shot.untilMs ?? at;
    for (const one of across) {
      if (one.id !== shot.target && one.id !== shot.part) continue;
      if (one.from >= until || one.to <= at) continue;
      if (one.from <= at + SHOT_LEAST_MS) at = Math.max(at, Math.round(one.to));
      else until = Math.min(until, Math.round(one.from));
    }
    return until - at >= SHOT_LEAST_MS
      ? [{ ...shot, atMs: at, untilMs: until }]
      : [];
  });
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
  /** A Studio film's scene; and one whose camera its sheet directs. */
  const film = input.profile?.film === true;
  const cameraDirected = Boolean(script.camera?.length);
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
  // code for its world once everyone's place is known (below).
  const crowdSize = story ? script.setting?.crowd : null;
  const crowd = crowdSize === 'few' || crowdSize === 'many' ? crowdSize : null;
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
  /**
   * How much of the quiet after a line the voice left, as a share of what
   * the script asked: a voice that holds a pause only so long (three
   * seconds, Kokoro's) has all that happens in the quiet quickened to fit
   * it, so none of it runs on into the next line.
   */
  const quietShare = (beat: number): number => {
    const asked = script.beats[beat]?.holdS;
    if (!asked || !beats[beat]) return 1;
    const next = beats[beat + 1]?.startMs ?? durationMs;
    const left = (next - beats[beat].endMs) / 1000;
    return left > 0 && left < asked * QUIET_CUT ? left / asked : 1;
  };
  const momentMs = (beat: number, after: number) =>
    beat >= 0 && beats[beat]
      ? beats[beat].endMs + AFTER_WORDS_MS + after * 1000 * quietShare(beat)
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
  /** A Studio scene's stations at each step: where each one stands (SceneStage.at). */
  const stationed = script.stations === true;
  const stationsAt: Record<string, string>[] = [];
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
    (!stationed ||
      JSON.stringify(stationsAt[steps.indexOf(a)] ?? {}) ===
        JSON.stringify(stage.at ?? {})) &&
    !stage.going &&
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
    stationsAt.push({});
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
      // How those who go go: at a run, off by a side or through a feature,
      // on by one.
      const going = step.stage.going ?? {};
      const exit: NonNullable<SceneStepDto['exit']> = {};
      const pace: NonNullable<SceneStepDto['pace']> = {};
      // Who stands behind a feature, hidden by it, or under one: it is
      // drawn over them.
      const behind: NonNullable<SceneStepDto['behind']> = Object.fromEntries(
        Object.entries(step.stage.at ?? {}).flatMap(([id, station]) => {
          const at = /^(?:behind|under):(.+)$/.exec(station);
          return at ? [[id, at[1]]] : [];
        }),
      );
      // Who is in a bed, under its cover: it is drawn over them.
      const abed: NonNullable<SceneStepDto['abed']> = Object.fromEntries(
        Object.entries(step.stage.at ?? {}).flatMap(([id, station]) => {
          const rests = restingAt(station);
          return rests?.in ? [[id, rests.feature]] : [];
        }),
      );
      for (const [id, how] of Object.entries(going)) {
        if (how.pace === 'run') pace[id] = 'run';
        if (before.includes(id) && !step.stage.show.includes(id))
          exit[id] = {
            side: how.side === '@left' ? 'left' : 'right',
            ...(how.via ? { via: how.via } : {}),
            ...(how.squeeze
              ? { how: 'squeeze' as const }
              : how.pace === 'run'
                ? { how: 'run' as const }
                : {}),
          };
        else if (enter[id] && how.via)
          enter[id] = { ...enter[id], via: how.via };
        if (enter[id] && how.side)
          enter[id] = {
            ...enter[id],
            side: how.side === '@left' ? 'left' : 'right',
          };
      }
      steps.push({
        atMs: Math.round(atMs),
        layout: step.stage.layout,
        show: step.stage.show,
        arrows,
        enter,
        focus,
        ...(backdrop ? { backdrop } : {}),
        ...(cut ? { cut: true as const } : {}),
        ...(Object.keys(exit).length ? { exit } : {}),
        ...(Object.keys(pace).length ? { pace } : {}),
        ...(Object.keys(behind).length ? { behind } : {}),
        ...(Object.keys(abed).length ? { abed } : {}),
      });
      stationsAt.push({ ...(step.stage.at ?? {}) });
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
      // What a story's people do, played by the rig (and on a Studio's
      // stage the body's own moves: a jump, sitting down, a wag): toward
      // whom or what it names, or up at the sky.
      if (
        acts &&
        ((STORY_MOVES as readonly string[]).includes(effect.do) ||
          (ACTED_MOVES as readonly string[]).includes(effect.do) ||
          ((effect.do === 'look' ||
            effect.do === 'point' ||
            effect.do === 'reach') &&
            (effect.part?.startsWith('@') ||
              aimedFeature(effect.part) !== null)))
      ) {
        directed.push({
          atMs: at,
          target: effect.target,
          other: effect.part,
          do: effect.do as DirectedMove['do'],
          ...(effect.ms ? { ms: effect.ms } : {}),
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
          !stationed &&
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
          stationsAt.push({ ...(stationsAt[stationsAt.length - 1] ?? {}) });
          delete steps[steps.length - 1].cut;
          before = show;
        }
        directed.push({
          atMs: apart ? at + TOGETHER_MS : at,
          target: effect.target,
          other,
          do: effect.do,
          ...(effect.ms ? { ms: effect.ms } : {}),
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
        ...(beat.kind === 'line' && beat.pace ? { pace: beat.pace } : {}),
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
      // The writer staged it already, near here: once is enough.
      if (
        directed.some(
          (move) =>
            move.target === act.who &&
            move.do === act.do &&
            Math.abs(move.atMs - word[2]) < 2500,
        )
      )
        continue;
      directed.push({
        atMs: Math.round(word[2]),
        target: act.who,
        other: act.toward,
        do: act.do,
      });
    }
  });
  directed.sort((a, b) => a.atMs - b.atMs);

  // The things on the stage, and what is done with each, at the word
  // that says it: taken, blessed, broken, given, eaten, drunk. A
  // screenplay's own moments instead, in its order across everyone: each
  // one's moment where its clip starts, and none starts before the one
  // before has changed hands and is done.
  const handled = new Map<string, ScenePropDto['does']>();
  /** When each person last did something with a thing: the next is at least a beat later. */
  const lastDone = new Map<string, number>();
  /** When the last of a screenplay's handlings is done. */
  let doneAt = -Infinity;
  /** When each thing was last let go of in a throw or a kick: a catch comes as long after as it flies. */
  const letGo = new Map<string, number>();
  script.beats.forEach((beat, k) => {
    const words = beats[k]?.words ?? [];
    for (const one of beat.business ?? []) {
      let at: number;
      const released = letGo.get(one.prop);
      if (
        one.does === 'catch' &&
        one.flies !== undefined &&
        released !== undefined
      ) {
        // Caught as it arrives, however the quiet runs; done once held.
        at = Math.round(released + one.flies * 1000);
        doneAt = Math.max(
          doneAt,
          at + HANDLING_MS.catch * (1 - HANDLING_AT.catch),
        );
      } else if (one.after !== undefined) {
        const clip = HANDLING_MS[one.does];
        const key = clip * HANDLING_AT[one.does];
        const start = Math.max(momentMs(one.lead ? -1 : k, one.after), doneAt);
        const quick = one.lead ? 1 : quietShare(k);
        at = Math.round(start + key * quick);
        // The next may begin once this has changed hands, and as long as
        // its moment in the quiet runs, quickened to fit it: never later.
        doneAt =
          start +
          Math.max(
            key * quick,
            Math.min(clip, one.s !== undefined ? one.s * 1000 * quick : clip),
          );
      } else {
        const word =
          words.find((w) => w[1] > one.at) ?? words[words.length - 1];
        if (!word) continue;
        at = Math.max(
          Math.round(word[2]),
          (lastDone.get(one.who) ?? -Infinity) + BUSINESS_APART_MS,
        );
        lastDone.set(one.who, at);
      }
      if (one.does === 'throw' || one.does === 'kick') letGo.set(one.prop, at);
      const list = handled.get(one.prop) ?? [];
      list.push(
        one.to ? [at, one.who, one.does, one.to] : [at, one.who, one.does],
      );
      handled.set(one.prop, list);
    }
  });
  /** The features something is caught up in: a kite in a palm. */
  const upIn = new Set<string>([
    ...Object.values(script.propsIn ?? {}).flatMap((id) => (id ? [id] : [])),
    ...[...handled.values()]
      .flat()
      .flatMap((one) =>
        typeof one[3] === 'string' && one[3].startsWith('up:')
          ? [one[3].slice(3)]
          : [],
      ),
  ]);
  /** The hands each one holds something in as it opens: a second thing is in the other. */
  const handsFull = new Map<string, Set<'r' | 'l'>>();
  /** The hand a thing is held in as it opens: a bag hangs from the left, the rest the right, a hand full the other. */
  const handFor = (by: string, hangs: boolean): 'r' | 'l' => {
    const full = handsFull.get(by) ?? new Set<'r' | 'l'>();
    const first = hangs ? 'l' : 'r';
    const hand = full.has(first) ? (first === 'r' ? 'l' : 'r') : first;
    full.add(hand);
    handsFull.set(by, full);
    return hand;
  };
  const props: ScenePropDto[] = (script.props ?? []).map((prop) => {
    // A show's own as the artist drew it; one whose drawing could not be
    // made is a parcel, so what a scene handles is never missing.
    // Clothes are carried held up or over an arm, never as tall as whoever
    // wears them: a show's own uniform drawn as worn is drawn smaller.
    const kept = script.drawn?.things?.[prop];
    const own =
      kept && wearableOf(prop) ? noTallerThan(kept, CARRIED_CLOTHES) : kept;
    const drawn = own ?? drawProp(isStageProp(prop) ? prop : 'box');
    const loose: PropLoose =
      own?.loose ?? (isStageProp(prop) ? PROP_LOOSE[prop] : PROP_LOOSE.box);
    const held = script.propsHeld?.[prop];
    const does = (handled.get(prop) ?? []).sort((a, b) => a[0] - b[0]);
    return {
      id: prop,
      svg: drawn.svg,
      viewBox: drawn.viewBox,
      grip: drawn.grip,
      mouth: drawn.mouth,
      bite: drawn.bite,
      ...(drawn.half ? { half: drawn.half } : {}),
      near: script.propsNear?.[prop] ?? does[0]?.[1] ?? null,
      // Caught up in a feature from the start: the kite in the palm.
      ...(script.propsIn?.[prop] ? { in: script.propsIn[prop] } : {}),
      // A kite flies on its string once raised.
      ...(FLIES.test(
        script.ownThings?.find((one) => one.id === prop)?.name ?? prop,
      )
        ? { flies: true as const }
        : {}),
      // In a hand from the start, or a mouth.
      ...(held
        ? {
            held: {
              by: held.by,
              in:
                held.in === 'mouth'
                  ? ('mouth' as const)
                  : handFor(held.by, Boolean(loose.hangs)),
            },
          }
        : {}),
      ...(loose.bounce ? { bounce: loose.bounce } : {}),
      ...(loose.rolls ? { rolls: true as const } : {}),
      ...(loose.spins ? { spins: true as const } : {}),
      ...(loose.hangs ? { hangs: true as const } : {}),
      does,
    };
  });
  // A change of clothes shows as the thing goes on, or comes off: at its
  // handling's own moment, which waits on whatever they handled before.
  for (const effect of effects) {
    if (!effect.part?.startsWith('dress-')) continue;
    const on = props
      .flatMap((prop) => prop.does)
      .filter(
        ([at, who, does]) =>
          who === effect.target &&
          (does === 'wear' || does === 'doff') &&
          Math.abs(at - effect.atMs) < DRESSED_NEAR_MS,
      )
      .sort(
        (a, b) => Math.abs(a[0] - effect.atMs) - Math.abs(b[0] - effect.atMs),
      )[0];
    if (on) effect.atMs = on[0];
  }

  /** When each one on the stage goes to another station: they are up and walking. */
  const goesAt = (): Map<string, number[]> => {
    const out = new Map<string, number[]>();
    steps.forEach((step, k) => {
      if (!k) return;
      for (const id of step.show) {
        const was = stationsAt[k - 1]?.[id];
        const now = stationsAt[k]?.[id];
        if (!steps[k - 1].show.includes(id) || !was || was === now) continue;
        out.set(id, [...(out.get(id) ?? []), step.atMs]);
      }
    });
    return out;
  };
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
    goes: goesAt(),
    film,
  });
  /**
   * When the crowd reacts: it cheers when a group's line is a shout or the
   * words say it cheers, and gasps when they say it marvels or is afraid.
   */
  const crowdMoves = (): [number, 'cheer' | 'gasp', number][] => {
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
    return moves;
  };
  /** Where one lies along a feature, as the player gets it. */
  const liesOn = (lies: FeaturePlace['lies']) => ({
    y: lies?.y ?? 0,
    head: lies?.head ?? 0,
    foot: lies?.foot ?? 0,
  });
  /**
   * The set's features as the player gets them: the stage's own drawing
   * of each it draws, where each stands at each staging and where one goes
   * through or by it, and the painter's group for it that the stage's
   * drawing stands in for.
   */
  const featuresDto = (): NonNullable<SceneSettingDto['features']> =>
    setFeatures.map(({ feature, piece, group }) => {
      const at = (staging: StagingName) => {
        const f = featurePlaces[staging].get(feature.id);
        return f
          ? { x: f.x, y: f.y, w: f.w, h: f.h }
          : { x: 0, y: 0, w: 0, h: 0 };
      };
      const way = (staging: StagingName) =>
        featurePlaces[staging].get(feature.id)?.way ?? { x: 0, y: 0, k: 1 };
      const up = (staging: StagingName) => {
        const f = featurePlaces[staging].get(feature.id)?.up;
        return f ? { x: f.x, y: f.y } : { x: 0, y: 0 };
      };
      return {
        id: feature.id,
        name: feature.name,
        kind: feature.kind,
        ...(piece
          ? {
              svg: piece.svg,
              ...(piece.leaf ? { leaf: piece.leaf } : {}),
              ...(piece.front ? { front: true as const } : {}),
              ...(piece.enters ? { enters: true as const } : {}),
            }
          : {}),
        at: { box: at('box'), wide: at('wide') },
        way: { box: way('box'), wide: way('wide') },
        // Up in it, where something caught there rests: only where something is.
        ...(upIn.has(feature.id)
          ? { up: { box: up('box'), wide: up('wide') } }
          : {}),
        ...(piece && group ? { painted: group } : {}),
        ...(feature.open ? { open: true as const } : {}),
        ...(feature.open && feature.ajar ? { ajar: true as const } : {}),
        // What covers whoever is in it, and where one sits or lies on it.
        ...(piece?.cover ? { cover: piece.cover } : {}),
        ...(featurePlaces.wide.get(feature.id)?.seat !== undefined
          ? {
              seat: {
                box: featurePlaces.box.get(feature.id)?.seat ?? 0,
                wide: featurePlaces.wide.get(feature.id)?.seat ?? 0,
              },
            }
          : {}),
        ...(featurePlaces.wide.get(feature.id)?.lies
          ? {
              lies: {
                box: liesOn(featurePlaces.box.get(feature.id)?.lies),
                wide: liesOn(featurePlaces.wide.get(feature.id)?.lies),
              },
            }
          : {}),
      };
    });
  /** When each feature opens or shuts: at its word, or its moment in a quiet. */
  const featureStates: [number, string, 'open' | 'shut'][] = (
    script.featureStates ?? []
  )
    .map((one): [number, string, 'open' | 'shut'] => [
      Math.round(
        one.after !== undefined
          ? momentMs(one.beat, one.after)
          : anchorMs(beats, one.beat, one.word ?? 0),
      ),
      one.feature,
      one.state,
    ])
    .sort((a, b) => a[0] - b[0]);
  /**
   * A story page's setting: its set at full strength, the light of its
   * time and its weather, and its crowd, drawn in its place's frame, with
   * when it reacts.
   */
  const settingOf = (): NonNullable<SceneDto['setting']> => {
    const moves = crowdMoves();
    const time = script.setting?.time;
    const weather = script.setting?.weather;
    // A vessel with an engine is going somewhere: a danfo on the road.
    const set = script.backdrop ? castById.get(script.backdrop) : undefined;
    const moving =
      script.setting?.place === 'vessel' &&
      set?.kind === 'place' &&
      set.sound === 'machine';
    return {
      full: true,
      ...(time && time !== 'day' ? { time } : {}),
      ...(weather && weather !== 'clear' ? { weather } : {}),
      ...(moving ? { moving: true as const } : {}),
      ...(setFeatures.length ? { features: featuresDto() } : {}),
      ...(featureStates.length ? { featureStates } : {}),
      ...(crowdDrawn
        ? {
            crowd: {
              id: CROWD_ID,
              ...(crowdPlace ? { place: crowdPlace } : {}),
              frame: 'set' as const,
              ...(moves.length ? { moves } : {}),
            },
          }
        : {}),
    };
  };
  /**
   * What everyone does that a shot on someone else would hide: what the
   * writer asked of them (not sitting or lying there), things handled,
   * going on, off or across the stage, and a gate or a door swinging.
   */
  const doingsSeen = (): Doing[] => [
    ...(script.featureStates ?? []).map((one) => {
      const at = Math.round(
        one.after !== undefined
          ? momentMs(one.beat, one.after)
          : anchorMs(beats, one.beat, one.word ?? 0),
      );
      return {
        who: `f:${one.feature}`,
        fromMs: at - SWING_SEEN_MS,
        toMs: at + SWING_SEEN_MS,
      };
    }),
    ...directed
      .filter(
        (move) =>
          move.do !== 'attend' &&
          !(HELD_MOVES as readonly string[]).includes(move.do),
      )
      .map((move) => ({
        who: move.target,
        fromMs: move.atMs,
        toMs: move.atMs + (move.ms ?? DOING_SEEN_MS),
      })),
    ...props.flatMap((prop) =>
      prop.does.map(([at, who, does]) => ({
        who,
        fromMs: at - HANDLING_MS[does] * HANDLING_AT[does],
        toMs: at + HANDLING_MS[does] * (1 - HANDLING_AT[does]),
      })),
    ),
    ...steps.flatMap((step, k) => {
      if (!k) return [];
      const was = steps[k - 1].show;
      return [...new Set([...was, ...step.show])]
        .filter(
          (id) =>
            !was.includes(id) ||
            !step.show.includes(id) ||
            (stationsAt[k]?.[id] ?? null) !== (stationsAt[k - 1]?.[id] ?? null),
        )
        .map((who) => ({
          who,
          fromMs: step.atMs,
          toMs: step.atMs + DOING_SEEN_MS,
        }));
    }),
  ];
  // A screenplay's camera: the whole stage as it opens and while the
  // narrator speaks; on two who trade lines while others stand by; close
  // on a whisper, a shout or a strong face.
  if (cameraDirected)
    effects.push(
      ...directedShots(script, beats, steps, durationMs, {
        momentMs,
        doings: doingsSeen(),
      }),
    );
  else if (script.beats.some((beat) => beat.kind))
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

  // The quiet stretches, filled with changes the words bring: a part the
  // voice names pointed at, the camera in close on a thing it names, or
  // on the one in focus; a pulse only when there is nothing else. Not on
  // someone who acts: they are never still, and a pulse is no way to move.
  const filled = fillQuiet({
    steps,
    effects,
    beats,
    durationMs,
    names: (id) => namesOf(castById.get(id)),
    parts: (id) => {
      const thing = castById.get(id);
      const dto = byId.get(id);
      return thing?.kind === 'drawing' && dto?.kind === 'drawing'
        ? thing.parts
            .map((part) => part.name)
            .filter((name) => dto.parts[name] ?? dto.labels[name])
        : [];
    },
    acting: (id) => Boolean(acting[id]),
    // The camera a sheet directs is the whole of it.
    shots: !cameraDirected,
  });
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
        ...(drawing.stands
          ? {
              stands: {
                ...drawing.stands,
                // One the kit draws: how high they sit, how long they lie.
                ...(drawing.legs
                  ? {
                      seated: seatedHeight(drawing.legs),
                      length: Math.max(
                        0,
                        -drawing.viewBox[1] - FIGURE_FRAME.headroom,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
      });
  }
  const introduced = new Set(
    script.cast.flatMap((thing) =>
      thing.kind === 'character' && thing.intro.length ? [thing.id] : [],
    ),
  );
  // A Studio scene's set features: each drawn by the stage (those people
  // act on, and any the painting has not got) or the painter's own, where
  // it stands at each staging, among the people at their scale.
  const setId = painted(script.backdrop);
  const setDrawing = setId ? drawings.get(setId) : null;
  const setFrame: [number, number, number, number] = setDrawing?.viewBox ?? [
    0, 0, 1600, 900,
  ];
  /** The features gone through, in or out: drawn by the stage wherever they are. */
  const gone = new Set(
    script.steps.flatMap((step) =>
      Object.values(step.stage?.going ?? {}).flatMap((g) =>
        g.via ? [g.via] : [],
      ),
    ),
  );
  const setFeatures = (script.features ?? []).map((feature) => {
    // The painter's group for it: asked for, or drawn unasked.
    const group = featureGroup(feature.id);
    const found =
      setDrawing?.parts[group] ??
      (setDrawing?.ground?.boxes?.[group] ? group : null);
    const box = found ? setDrawing?.ground?.boxes?.[found] : undefined;
    // A show's own is always the stage's, drawn by the artist for the show.
    const acted = feature.kind === DRAWN || ACTED_PIECES.includes(feature.kind);
    // One the painting shows where the painter drew it, the stage stands
    // in for when people act on it; one it shows somewhere far off is left
    // as painted, unless it opens or is gone through.
    const drawn = box
      ? acted
      : acted
        ? feature.opens ||
          gone.has(feature.id) ||
          !(feature.looked && feature.spot === 'back')
        : !feature.looked;
    return {
      feature,
      piece: !drawn
        ? null
        : feature.kind === DRAWN
          ? (script.drawn?.features?.[feature.id] ?? coveredPiece())
          : drawPiece(feature.kind, feature.name),
      group: box ? found : null,
      box: box ?? null,
    };
  });
  /** Each feature where it stands at a staging, once the people's scale is known. */
  const featurePlaces: Record<StagingName, Map<string, FeaturePlace>> = {
    box: new Map(),
    wide: new Map(),
  };
  const placeFeatures = (
    staging: StagingName,
    unit: number,
    floor: number,
  ): Map<string, FeaturePlace> => {
    const stage = STAGINGS[staging];
    const on = setFrameOn(setFrame, stage);
    const [, vy, , vh] = setFrame;
    const horizon = setDrawing?.ground
      ? on.toStage(0, vy + setDrawing.ground.horizon * vh)[1]
      : stage.h * 0.64;
    const out = new Map<string, FeaturePlace>();
    /** Where the pieces stood so far stand across the stage: the next keeps clear of them. */
    const taken: [number, number][] = [];
    for (const one of setFeatures) {
      const [x0, y0] = one.box
        ? on.toStage(
            setFrame[0] + one.box[0] * setFrame[2],
            vy + one.box[1] * vh,
          )
        : [0, 0];
      const [x1, y1] = one.box
        ? on.toStage(
            setFrame[0] + one.box[2] * setFrame[2],
            vy + one.box[3] * vh,
          )
        : [0, 0];
      const back =
        one.feature.spot === 'back' || one.feature.kind === 'vehicle';
      let placed = placeFeature({
        staging,
        spot: one.feature.spot,
        ...(one.piece ? { piece: one.piece } : {}),
        ...(one.feature.kind === DRAWN ? { own: true } : {}),
        painted: one.box ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null,
        back,
        unit,
        floor,
        horizon: Math.min(horizon, floor - 60),
      });
      // Two pieces the stage stands at one spot stand side by side: the
      // later toward the middle of the stage, clear of the first.
      if (one.piece && !one.box && !back) {
        const toMiddle = placed.x + placed.w / 2 > stage.w / 2 ? -1 : 1;
        let shift = 0;
        for (let n = 0; n < 4; n += 1) {
          const at: [number, number] = [
            placed.x + shift,
            placed.x + placed.w + shift,
          ];
          const hit = taken.find(([a, b]) => at[0] < b - 8 && a < at[1] - 8);
          if (!hit) break;
          shift =
            toMiddle > 0 ? shift + (hit[1] - at[0]) : shift - (at[1] - hit[0]);
        }
        if (shift)
          placed = {
            ...placed,
            x: Math.round((placed.x + shift) * 10) / 10,
            way: {
              ...placed.way,
              x: Math.round((placed.way.x + shift) * 10) / 10,
            },
            up: {
              ...placed.up,
              x: Math.round((placed.up.x + shift) * 10) / 10,
            },
          };
        taken.push([placed.x, placed.x + placed.w]);
      }
      out.set(one.feature.id, placed);
    }
    featurePlaces[staging] = out;
    return out;
  };
  /** Every step of a staging laid out: each thing in its slot, and people standing together. */
  const layoutsOf = (staging: StagingName): Record<string, Place>[] => {
    const lookup = new Map(
      things.map((thing) => [thing.id, laid(thing, geometry.get(thing.id))]),
    );
    if (stationed) {
      // Everyone at their station, the whole scene at one scale.
      const people = [...new Set(steps.flatMap((step) => step.show))];
      const largest = Math.max(1, ...steps.map((step) => step.show.length));
      const scale = stationScale(
        people.flatMap((id) => (lookup.get(id) ? [lookup.get(id)!] : [])),
        largest,
        staging,
      );
      // No one stands with people: a grown-up's height in a slot of the row.
      const unit = scale.unit ?? scale.slot.h / figureFrame('adult')[3];
      // The set's features where they stand in every scene there; its
      // people's spots spread for how many stand at once.
      const placed = placeFeatures(staging, unit, scale.floor);
      return layoutStations({
        shares: stationShares(largest),
        steps: steps.map((step, k) => ({
          show: step.show,
          at: stationsAt[k],
        })),
        things: lookup,
        staging,
        scale,
        features: new Map(
          [...placed].map(([id, f]) => [
            id,
            {
              x: f.x + f.w / 2,
              w: f.w,
              way: { y: f.way.y, k: f.way.k, perch: f.up.perch, upX: f.up.x },
              ...(f.seat !== undefined ? { seat: f.seat } : {}),
              ...(f.lies ? { lies: f.lies } : {}),
            },
          ]),
        ),
        // The ways through the stage stands on the people's ground: no
        // one at a spot stands in the gateway or the doorway.
        pieces: setFeatures.flatMap(({ feature, piece }) => {
          const f = placed.get(feature.id);
          return piece &&
            f &&
            feature.spot !== 'back' &&
            (feature.kind === 'gate' ||
              feature.kind === 'door' ||
              (feature.kind === DRAWN && piece.enters))
            ? [{ x: f.x + f.w / 2, w: f.w }]
            : [];
        }),
      });
    }
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
    return steps.map((step) => {
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
      return laidOut;
    });
  };
  const layouts = { box: layoutsOf('box'), wide: layoutsOf('wide') };
  // A thing thrown or kicked to a feature comes down on the ground before
  // it, wherever each staging stands it: the player finds it there. One
  // the stage has not got goes on ahead, toward the middle.
  for (const prop of props)
    for (const one of prop.does) {
      const feature = aimedFeature(one[3]);
      if (feature && !featurePlaces.wide.has(feature)) one[3] = '@0.5';
    }
  const refOf = (thing: SceneThing | undefined) =>
    thing && 'ref' in thing ? thing.ref : undefined;
  /** The stagings a crowd is planned for: a film's, wide alone. */
  const crowdStagings = (): readonly StagingName[] =>
    film ? ['wide'] : ['box', 'wide'];
  /**
   * The story's people wherever the crowd is seen with them: each step its
   * place is behind, in each staging, in the set's own units, with its
   * share of the time. Close in, the set moves less than the people in
   * front of it, so each close shot is a stretch of its own, with them
   * where they show against the set: larger, and across it. A set people
   * are in (a boat's side before them) moves with them, and has none.
   */
  const crowdSeen = (): Parameters<typeof planCrowd>[0]['seen'] => {
    const shown = steps
      .map((step, k) => ({
        step,
        k,
        ms: (steps[k + 1]?.atMs ?? durationMs) - step.atMs,
      }))
      .filter(
        ({ step, ms }) => (step.backdrop ?? null) === crowdPlace && ms > 0,
      );
    const total = shown.reduce((n, one) => n + one.ms, 0) || 1;
    const shots = crowdSet?.parts.front
      ? []
      : effects.filter((effect) => effect.do === 'zoom');
    // A film is only ever played wide: its crowd keeps clear of the story's
    // people as they stand there; a page's, in either staging.
    const stagings = crowdStagings();
    return stagings.flatMap((staging) => {
      const stage = STAGINGS[staging];
      const on = setFrameOn(crowdFrame, stage);
      /** The pieces the stage draws, in the set's units: no one is placed hidden behind one. */
      const piecesSeen = (at: StagingName): CastAt[] =>
        setFeatures.flatMap(({ feature, piece }) => {
          const f = featurePlaces[at].get(feature.id);
          if (!piece || !f) return [];
          const [x, y] = on.toSet(f.x, f.y);
          return [
            {
              x,
              y,
              w: f.w / on.scale,
              h: f.h / on.scale,
              head: null,
              rig: false,
              stands: null,
              lead: false,
              child: false,
            },
          ];
        });
      const castOf = (
        step: SceneStepDto,
        k: number,
        view: ReturnType<typeof viewOf> | null,
      ) =>
        step.show.flatMap((id): CastAt[] => {
          const placed = layouts[staging][k][id];
          const dto = byId.get(id);
          const found = geometry.get(id);
          if (!placed || dto?.kind !== 'drawing') return [];
          // Out of the shot, no one is beside them.
          if (
            view &&
            (placed.x + placed.w < view.x - stage.w / (2 * view.s) ||
              placed.x > view.x + stage.w / (2 * view.s))
          )
            return [];
          const shot = view && againstScenery(view, stage.w, stage.h);
          const [sx, sy] = shot ? shot.at(placed.x, placed.y) : [0, 0];
          const at = shot
            ? { x: sx, y: sy, w: placed.w * shot.k, h: placed.h * shot.k }
            : placed;
          const [x, y] = on.toSet(at.x, at.y);
          const w = at.w / on.scale;
          const h = at.h / on.scale;
          const box = found?.viewBox;
          const u = box ? h / box[3] : 0;
          const rig = dto.rig === true;
          const who = castById.get(id);
          // The kit's feet are at its 0; anyone else's at their foot.
          const zero = box ? box[1] < 0 && box[1] + box[3] > 0 : false;
          return [
            {
              x,
              y,
              w,
              h,
              head:
                found?.head && box
                  ? [
                      x + (found.head[0] - box[0]) * u,
                      y + (found.head[1] - box[1]) * u,
                    ]
                  : null,
              rig,
              stands:
                found?.stands && box
                  ? {
                      feet: rig && zero ? y - box[1] * u : y + h,
                      unit: h / found.stands.units,
                    }
                  : null,
              lead: who?.kind === 'character' && !who.minor,
              // A child's head is lower in the kit's frame than anyone's.
              child: rig && (found?.head?.[1] ?? -200) > -117,
            },
          ];
        });
      return shown.flatMap(({ step, k, ms }) => {
        const until = step.atMs + ms;
        const seen: Parameters<typeof planCrowd>[0]['seen'] = [];
        let rest = ms;
        for (const shot of shots) {
          const from = Math.max(step.atMs, shot.atMs);
          const to = Math.min(until, shot.untilMs ?? durationMs);
          if (to <= from) continue;
          const view = viewOf(
            shot,
            step.show,
            Object.fromEntries(
              Object.entries(layouts[staging][k]).map(([id, p]) => [
                id,
                { x: p.x, y: p.y, w: p.w, h: p.h },
              ]),
            ),
            stage.w,
            stage.h,
          );
          if (view.s <= 1.01) continue;
          rest -= to - from;
          seen.push({
            share: (to - from) / total / stagings.length,
            wide: staging === 'wide',
            close: true,
            cast: castOf(step, k, view),
          });
        }
        if (rest > 0)
          seen.unshift({
            share: rest / total / stagings.length,
            wide: staging === 'wide',
            cast: [...castOf(step, k, null), ...piecesSeen(staging)],
          });
        return seen;
      });
    });
  };
  /** The pieces the stage draws over the crowd, where each staging stands them, in the set's units. */
  const piecesOverCrowd = () =>
    crowdStagings().flatMap((staging) => {
      const on = setFrameOn(crowdFrame, STAGINGS[staging]);
      return setFeatures.flatMap(({ feature, piece }) => {
        const f = featurePlaces[staging].get(feature.id);
        if (!piece || !f) return [];
        const [x0, y0] = on.toSet(f.x, f.y);
        const [x1, y1] = on.toSet(f.x + f.w, f.y + f.h);
        return [{ x0, x1, y0, y1 }];
      });
    });
  /**
   * Where a crowd's words come from on a stage: over the heads of its
   * group farthest from the story's people, in view; null with no crowd,
   * or at a step its place is not behind, where it is not seen.
   */
  const crowdVoice = (
    staging: StagingName,
    step: SceneStepDto,
    laidOut: Record<string, Place>,
  ): {
    head: [number, number];
    body: { x: number; y: number; w: number; h: number };
  } | null => {
    if (!crowdDrawn || (step.backdrop ?? null) !== crowdPlace) return null;
    const stage = STAGINGS[staging];
    const on = setFrameOn(crowdFrame, stage);
    const people = Object.entries(laidOut)
      .filter(([id]) => castById.get(id)?.kind === 'character')
      .map(([, at]) => at.x + at.w / 2);
    let best: { head: [number, number]; body: Rect; clear: number } | null =
      null;
    for (const group of crowdHeads(crowdDrawn)) {
      const [x, y] = on.toStage(group.x, group.y);
      if (x < stage.w * 0.08 || x > stage.w * 0.92) continue;
      const clear = Math.min(...people.map((p) => Math.abs(p - x)), stage.w);
      if (best && clear <= best.clear) continue;
      const [x0] = on.toStage(group.x0, group.y);
      const [x1, feet] = on.toStage(group.x1, group.feet);
      best = {
        head: [x, y],
        body: { x: x0, y, w: x1 - x0, h: feet - y },
        clear,
      };
    }
    return best && { head: best.head, body: best.body };
  };

  // The crowd, now everyone's place is known: planned about the story's
  // people in the set's own frame, on its ground, and drawn.
  const crowdPlace = crowd ? painted(script.backdrop) : null;
  const crowdSet = crowdPlace ? drawings.get(crowdPlace) : null;
  const crowdFrame: [number, number, number, number] = crowdSet?.viewBox ?? [
    0, 0, 1600, 900,
  ];
  const crowdPlan: CrowdPlan | null = crowd
    ? planCrowd({
        size: crowd,
        kind: script.setting?.place ?? 'outdoor',
        ground: crowdSet?.ground ?? conventionGround(),
        frame: crowdFrame,
        scale: setFrameOn(crowdFrame, STAGINGS.wide).scale,
        seen: crowdSeen(),
        pieces: piecesOverCrowd(),
        // What the story's people wear, for no one in it to wear the same.
        wearing: script.cast.flatMap((thing) => {
          const wears = drawings.get(thing.id)?.wears;
          return wears ? [wears] : [];
        }),
        seed: `${input.key || script.setting?.world?.region || script.title}:${
          (crowdPlace && refOf(castById.get(crowdPlace))) ||
          crowdPlace ||
          'stage'
        }`,
        world: script.setting?.world ?? null,
      })
    : null;
  const crowdDrawn = crowdPlan?.people.length ? crowdPlan : null;
  /**
   * The story's people going by the crowd, as the player walks them on the
   * wide stage (a film's hurried where they must be), in the set's units: their
   * middle, and their feet, where the crowd makes way for them.
   */
  const goingBy = (): GoingBy[] => {
    const wideStage = {
      w: STAGINGS.wide.w,
      h: STAGINGS.wide.h,
      places: layouts.wide,
    };
    const paced = {
      steps,
      stagings: { box: wideStage, wide: wideStage },
      acting,
      props,
      setting: { features: featuresDto() },
    };
    const on = setFrameOn(crowdFrame, STAGINGS.wide);
    return walksOf({ ...paced, steps: film ? hurried(paced) : steps }).map(
      (one) => {
        const found = geometry.get(one.id);
        const box = found?.viewBox;
        const dto = byId.get(one.id);
        const rig = dto?.kind === 'drawing' && dto.rig === true;
        /** Their feet, in a box they stand in: the kit's at its 0, anyone else's at its foot. */
        const feet = (at: Place) =>
          rig && box && box[1] < 0 && box[1] + box[3] > 0
            ? at.y - (box[1] * at.h) / box[3]
            : at.y + at.h;
        const [x0, f0] = on.toSet(
          one.start.x + one.start.w / 2,
          feet(one.start),
        );
        const [x1, f1] = on.toSet(one.end.x + one.end.w / 2, feet(one.end));
        return {
          from: one.from,
          to: one.to,
          x: [x0, x1],
          feet: [f0, f1],
          w: Math.max(one.start.w, one.end.w) / on.scale,
        };
      },
    );
  };
  if (crowdDrawn) {
    const [, , vw, vh] = crowdFrame;
    things.push({
      id: CROWD_ID,
      kind: 'drawing',
      svg: drawCrowd(crowdDrawn, {
        moves: crowdMoves(),
        durationMs,
        // Made way for as a film walks them, on its one, wide staging: a
        // book's page is played boxed too, where no one would go by.
        ...(film ? { asides: asideOf(crowdDrawn, goingBy(), walkEase) } : {}),
      }),
      aspect: vw / vh,
      caption: null,
      parts: {},
      labels: {},
      states: {},
      hidden: [],
      moves: true,
      ambience: null,
    });
  }

  const place = (staging: StagingName) => {
    const stage = STAGINGS[staging];
    const places: Record<string, ScenePlaceDto>[] = [];
    const pills: Record<string, ScenePillDto | null>[] = [];
    const bubbles: Record<string, SceneBubbleDto | null> = {};
    const audit: Collision[][] = [];
    for (const [k, step] of steps.entries()) {
      const crowded = step.show.length > 2;
      const laidOut = layouts[staging][k];
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
        // A crowd's words, over the crowd: from the group of it farthest
        // from the story's people, so the words are never taken for theirs.
        const group =
          !bubble && voice?.from === 'crowd'
            ? crowdVoice(staging, step, laidOut)
            : null;
        if (group) {
          head = group.head;
          const asked = {
            text: effect.say!.text,
            head,
            body: group.body,
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
  // A directed scene's shots with no jump cut: judged where the wide stage
  // stands everyone, as the film shows it.
  if (cameraDirected) {
    const wideStage = {
      w: STAGINGS.wide.w,
      h: STAGINGS.wide.h,
      places: wide.places,
    };
    const paced = {
      steps,
      stagings: { box: wideStage, wide: wideStage },
      acting,
      props,
      setting: { features: featuresDto() },
    };
    const kept = withoutJumps(
      shotsBesideWalks(
        effects.filter((e) => e.do === 'zoom'),
        walksOf({ ...paced, steps: film ? hurried(paced) : steps }),
        STAGINGS.wide.w,
      ),
      steps,
      { ...STAGINGS.wide, places: wide.places },
      durationMs,
    );
    effects.splice(
      0,
      effects.length,
      ...[...effects.filter((e) => e.do !== 'zoom'), ...kept].sort(
        (a, b) => a.atMs - b.atMs,
      ),
    );
  }
  const setting = story ? settingOf() : null;

  const composed: ReturnType<typeof composeScene> = {
    scene: {
      version: 4,
      generator: input.generator,
      title: script.title,
      durationMs,
      timing: input.timing,
      ...(input.profile?.stage ? { stage: input.profile.stage } : {}),
      ...(Object.keys(acting).length ? { acting } : {}),
      ...(props.length ? { props } : {}),
      ...(setting || film
        ? { setting: { ...setting, ...(film ? { film: true as const } : {}) } }
        : {}),
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
  // A film's walks as long as the time they have, hurried where they are
  // not; and when all it plans has finished, which may be after its
  // voice: the film's edit holds on it until then.
  if (film) {
    composed.scene.steps = hurried(composed.scene);
    composed.scene.settledMs = settledOf(composed.scene);
  }
  return composed;
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

/**
 * Whether a step shows the page's crowd: one drawn in its set's frame,
 * while its place is behind the stage (or, with no place, always). A
 * crowd stored before stood in a band the stills never drew.
 */
export function crowdShown(scene: SceneDto, index: number): boolean {
  const crowd = scene.setting?.crowd;
  const step = scene.steps[index];
  if (!crowd || crowd.frame !== 'set' || !step) return false;
  return (step.backdrop ?? null) === (crowd.place ?? null);
}

/** A feature's still: its drawing by the stage (by its id, "f:gate"), its leaf as open as it is at `t`. */
export const featureStill = (id: string) => `f:${id}`;

/**
 * A feature the stage draws, as a still shows it at `t`: its leaf turned
 * or slid as far as the scene has it open then. Null for one the painter
 * drew, which the set's own still has.
 */
export function featureSvgAt(
  scene: SceneDto,
  feature: NonNullable<SceneSettingDto['features']>[number],
  t: number,
): string | null {
  if (!feature.svg) return null;
  let open = feature.open ? 1 : 0;
  for (const [at, id, state] of scene.setting?.featureStates ?? [])
    if (id === feature.id && at <= t) open = state === 'open' ? 1 : 0;
  const leaf = feature.leaf;
  if (!leaf || !open) return feature.svg;
  const [hx, hy] = leaf.hinge;
  const turned =
    leaf.slide !== undefined
      ? `translate(${leaf.slide} 0)`
      : `translate(${hx} ${hy}) scale(0.18 1) translate(${-hx} ${-hy})`;
  return feature.svg.replace(
    new RegExp(`<g id="${leaf.id}"`),
    `<g id="${leaf.id}" transform="${turned}"`,
  );
}

/** A set's drawing with the painter's own gates and benches hidden, where the stage draws its own in their place. */
export function withoutStandIns(scene: SceneDto, svg: string): string {
  const groups = (scene.setting?.features ?? []).flatMap((f) =>
    f.svg && f.painted ? [`[id="${f.painted.replace(/"/g, '')}"]`] : [],
  );
  return groups.length
    ? svg.replace(
        /(<svg\b[^>]*>)/i,
        `$1<style>${groups.join(',')}{visibility:hidden}</style>`,
      )
    : svg;
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
  // The scene behind the stage, covering it, and its crowd over it, laid
  // as the set is: the two faded together, as the player fades them.
  const scenery = step.backdrop ? pngs.get(step.backdrop) : undefined;
  const crowd = crowdShown(scene, index) ? pngs.get(CROWD_ID) : undefined;
  const cover = (png: Buffer) =>
    `<image x="0" y="0" width="${staging.w}" height="${staging.h}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${png.toString('base64')}"/>`;
  if (scenery || crowd)
    parts.push(
      `<g opacity="${scenery ? BACKDROP_OPACITY : 1}">${scenery ? cover(scenery) : ''}${crowd ? cover(crowd) : ''}</g>`,
    );
  // The set's features the stage draws, behind its people, where it stands them.
  for (const feature of scene.setting?.features ?? []) {
    const png = pngs.get(featureStill(feature.id));
    const at = feature.at[stagingName];
    if (png && at.w > 0)
      parts.push(
        `<image x="${at.x}" y="${at.y}" width="${at.w}" height="${at.h}" preserveAspectRatio="none" href="data:image/png;base64,${png.toString('base64')}"/>`,
      );
  }
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

/** A code-made change fills a quiet stretch this often, and keeps this far from any other change. */
const FILL_EVERY_MS = 6500;
const FILL_CLEAR_MS = 2500;
/** How long the camera stays in close on a thing, at most, and at least. */
/** A quiet the voice left this much shorter than asked, or less, was cut short by it: what happens in it is quickened to fit. */
const QUIET_CUT = 0.9;
/** A change of clothes this close to someone putting a thing on or taking it off, in ms, is that handling's. */
const DRESSED_NEAR_MS = 4000;
const FILL_SHOT_MS = 3500;
const FILL_SHOT_LEAST_MS = 1500;

/** The words of a name or a part, as they are said: "red-blood-cells" is red, blood, cells. */
const keysIn = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4)
    .map((word) => word.replace(/(?:es|s)$/u, ''));

/** A thing's names: what it is called, and the words on a card. */
function namesOf(thing: SceneThing | undefined): string[] {
  if (!thing) return [];
  if (thing.kind === 'words') return [thing.text];
  return 'name' in thing && typeof thing.name === 'string' ? [thing.name] : [];
}

/**
 * The quiet stretches of a page filled with changes to see, one about
 * every FILL_EVERY_MS and none nearer another change than FILL_CLEAR_MS,
 * each tied to what the voice says then:
 *
 * 1. a part of a drawing on the stage that the voice names: pointed at,
 *    so it glows and its label shows;
 * 2. with two or more on the stage, a thing the voice names then: the
 *    camera in close on it for a few seconds, all of it and its labels,
 *    then back to the whole stage; never on one it is not talking about;
 * 3. else a pulse on what holds the eye, as before.
 *
 * Each is marked a filler: silent, and never what the camera follows.
 * Returns how many it added.
 */
export function fillQuiet(input: {
  steps: SceneStepDto[];
  effects: SceneEffectDto[];
  beats: TimedBeat[];
  durationMs: number;
  names: (id: string) => string[];
  parts: (id: string) => string[];
  acting: (id: string) => boolean;
  /** Whether the camera may go in close: not where a sheet directs it. */
  shots?: boolean;
}): number {
  const { steps, effects, beats, durationMs } = input;
  // A pulse draws the eye to what is already there: nothing new to see,
  // so a stretch of pulses is still a quiet one.
  const changes = [
    ...steps.map((s) => s.atMs),
    ...effects.filter((e) => e.do !== 'pulse').map((e) => e.atMs),
  ];
  /** The words said from one time to another, as keys. */
  const saidBetween = (from: number, to: number) =>
    new Set(
      beats.flatMap((beat) =>
        beat.words
          .filter(([, , start]) => start >= from && start <= to)
          .flatMap(([a, b]) => keysIn(beat.text.slice(a, b))),
      ),
    );
  const named = (keys: string[], said: Set<string>) =>
    keys.length > 0 && keys.every((key) => said.has(key));
  const pointed = new Set<string>();
  let lastShot: string | null = null;
  let added = 0;
  for (const [from, to] of quietGaps(changes, durationMs)) {
    const span = to - from;
    const count = Math.max(1, Math.floor(span / FILL_EVERY_MS));
    for (let i = 1; i <= count; i += 1) {
      const at = Math.round(from + (span * i) / (count + 1));
      if (at - from < FILL_CLEAR_MS || to - at < FILL_CLEAR_MS) continue;
      // Clear of a pulse of the writer's, by a second at least, the close
      // up's lead in too.
      if (effects.some((e) => Math.abs(e.atMs - at) < 1200)) continue;
      const current = [...steps].reverse().find((s) => s.atMs <= at);
      if (!current) continue;
      const on = current.show.filter((id) => !input.acting(id));
      const said = saidBetween(at - 1000, at + 3000);
      // 1. A part the voice names.
      let made: SceneEffectDto | null = null;
      for (const id of on) {
        const part = input
          .parts(id)
          .find(
            (name) =>
              !pointed.has(`${id}.${name}`) && named(keysIn(name), said),
          );
        if (part) {
          pointed.add(`${id}.${part}`);
          made = { atMs: at, target: id, part, do: 'point', filler: true };
          break;
        }
      }
      // 2. The camera in close on a thing the voice names then, and only
      // then: never on one it is not talking about.
      const until = Math.min(at + FILL_SHOT_MS, to - 400);
      if (
        !made &&
        input.shots !== false &&
        current.show.length >= 2 &&
        until - at >= FILL_SHOT_LEAST_MS
      ) {
        const target = current.show.find(
          (id) =>
            id !== lastShot &&
            input.names(id).some((name) => named(keysIn(name), said)),
        );
        if (target) {
          lastShot = target;
          made = {
            atMs: at - 200,
            target,
            part: null,
            do: 'zoom',
            untilMs: until,
            filler: true,
          };
        }
      }
      // 3. A pulse on what holds the eye.
      if (!made) {
        const target = [current.focus, ...on].find(
          (id): id is string => id !== null && !input.acting(id),
        );
        if (target)
          made = { atMs: at, target, part: null, do: 'pulse', filler: true };
      }
      if (made) {
        effects.push(made);
        added += 1;
      }
    }
  }
  return added;
}

/**
 * How a page's picture keeps up with its voice: the longest it sits still,
 * and how many changes a learner sees a minute. A change is the stage, or
 * anything but a pulse, which draws the eye to what is already there.
 */
export function rhythmOf(scene: {
  steps: { atMs: number }[];
  effects: { atMs: number; do: string }[];
  durationMs: number;
}): { stillMs: number; perMinute: number; stagesPerMinute: number } {
  const times = [
    0,
    ...scene.steps.map((s) => s.atMs),
    ...scene.effects.filter((e) => e.do !== 'pulse').map((e) => e.atMs),
    scene.durationMs,
  ].sort((a, b) => a - b);
  let stillMs = 0;
  for (let i = 1; i < times.length; i += 1)
    stillMs = Math.max(stillMs, times[i] - times[i - 1]);
  const minutes = Math.max(scene.durationMs, 1) / 60_000;
  return {
    stillMs,
    perMinute: Math.round(((times.length - 2) / minutes) * 10) / 10,
    stagesPerMinute: Math.round((scene.steps.length / minutes) * 10) / 10,
  };
}
