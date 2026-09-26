/**
 * The Studio: animated episodes made from nothing but a conversation.
 *
 * A show is what someone makes: its brief (what, for whom, how long, in
 * what tone), and for a story its bible (the characters and the places,
 * the same in every episode). An episode is one film, made of scenes.
 * Every scene is decided in full before anything is drawn or voiced: a
 * story's scene sheet says where it is, exactly who is there and where
 * each stands, and every line, action and thing handled in order, each
 * with who does it; an explainer's is its narration and what is shown on
 * which words. Code checks each sheet (studio-check.ts) and the stage
 * plays it exactly (studio-stage.ts), adding nothing of its own.
 *
 * Everything here is made sound from whatever a model or a person sent:
 * unknown values fall back to known ones, lists are capped, text is
 * trimmed. What cannot be made sound is left for the check to name.
 */
import { createHash } from 'node:crypto';
import {
  FIGURE_POSES,
  FIGURE_PROPS,
  FIGURE_SIGNS,
  PLAIN_FIGURE,
  figureOf,
  type FigureFace,
  type FigurePose,
  type FigureProp,
  type FigureSign,
  type FigureSpec,
} from '../scene-figure';
import { KIT_FACES } from '../scene-figure';
import { faceNamed } from '../scene-feeling';
import { PROP_ACTIONS, type PropAction } from '../scene-directions';
import { STAGE_PROPS, type StageProp } from '../scene-props';
import {
  LINE_FROMS,
  LINE_PACES,
  SCENE_AMBIENCES,
  SCENE_MOODS,
  SCENE_MUSIC,
  STORY_MOVES,
  type LineFrom,
  type LinePace,
  type SceneAmbience,
  type SceneMood,
  type SceneMusic,
  type SceneScriptDraft,
  type StoryMove,
} from '../scene-script';
import type { LearningStage } from '../scene-stage';
import {
  EXPRESSIONS,
  PLACE_KINDS,
  PLACE_STANDS,
  STORY_CROWDS,
  STORY_SIZES,
  STORY_TIMES,
  STORY_VOICES,
  STORY_WEATHERS,
  type PlaceKind,
  type PlaceStand,
  type StoryCrowd,
  type StorySize,
  type StoryTime,
  type StoryWeather,
  type StoryWorld,
} from '../scene-story';

// ── The brief ─────────────────────────────────────────────────────────────

/** What a show is: a story its characters play, or a lesson a narrator teaches with pictures. */
export const STUDIO_FORMATS = ['story', 'explainer'] as const;
export type StudioFormat = (typeof STUDIO_FORMATS)[number];

export const STUDIO_AUDIENCES = [
  'young children',
  'children',
  'teens',
  'adults',
] as const;
export type StudioAudience = (typeof STUDIO_AUDIENCES)[number];

export const STUDIO_TONES = [
  'funny',
  'gentle',
  'exciting',
  'serious',
  'calm',
] as const;
export type StudioTone = (typeof STUDIO_TONES)[number];

/** How long an episode may be, in minutes. */
export const EPISODE_MINUTES = [0.5, 5] as const;

export interface StudioBrief {
  format: StudioFormat | null;
  /** What it is about, in the maker's own words. */
  idea: string;
  audience: StudioAudience | null;
  /** How long an episode runs. */
  minutes: number | null;
  tone: StudioTone | null;
  /** A story's where and when: "a busy market in Lagos, today". */
  setting: string | null;
  /** A story's people, as the maker said them. */
  characters: string | null;
  /** Anything they asked to be in it. */
  include: string | null;
  /** Text they gave to make it from: notes, a syllabus, a story. */
  source: string | null;
}

export const EMPTY_BRIEF: StudioBrief = {
  format: null,
  idea: '',
  audience: null,
  minutes: null,
  tone: null,
  setting: null,
  characters: null,
  include: null,
  source: null,
};

/** The most of a maker's own text a brief keeps. */
export const SOURCE_CHARS = 12_000;

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): T | null =>
    typeof value === 'string' && list.includes(value as T)
      ? (value as T)
      : null;

/** Text made sound: a string, its spaces tidied, no longer than `most`; empty for anything else. */
export const text = (value: unknown, most = 400): string =>
  typeof value === 'string'
    ? value
        // eslint-disable-next-line no-control-regex -- control characters are what it takes out
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
        .slice(0, most)
    : '';
const textOrNull = (value: unknown, most = 400): string | null =>
  text(value, most) || null;

/** A brief made sound; `patch` over `base`, field by field, a null leaving the base as it was. */
export function briefOf(
  raw: unknown,
  base: StudioBrief = EMPTY_BRIEF,
): StudioBrief {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const has = (key: string) => said[key] !== undefined && said[key] !== null;
  const minutes = Number(said.minutes);
  return {
    format: has('format')
      ? (oneOf(STUDIO_FORMATS)(said.format) ?? base.format)
      : base.format,
    idea: has('idea') ? text(said.idea, 600) || base.idea : base.idea,
    audience: has('audience')
      ? (oneOf(STUDIO_AUDIENCES)(said.audience) ?? base.audience)
      : base.audience,
    minutes:
      has('minutes') && Number.isFinite(minutes)
        ? Math.round(
            Math.min(
              EPISODE_MINUTES[1],
              Math.max(EPISODE_MINUTES[0], minutes),
            ) * 2,
          ) / 2
        : base.minutes,
    tone: has('tone')
      ? (oneOf(STUDIO_TONES)(said.tone) ?? base.tone)
      : base.tone,
    setting: has('setting') ? textOrNull(said.setting) : base.setting,
    characters: has('characters')
      ? textOrNull(said.characters, 600)
      : base.characters,
    include: has('include') ? textOrNull(said.include, 600) : base.include,
    source: has('source') ? textOrNull(said.source, SOURCE_CHARS) : base.source,
  };
}

/** What a brief still needs before its outline can be written; none when it is complete. */
export function briefMissing(brief: StudioBrief): (keyof StudioBrief)[] {
  const missing: (keyof StudioBrief)[] = [];
  if (!brief.format) missing.push('format');
  if (!brief.idea) missing.push('idea');
  if (!brief.audience) missing.push('audience');
  if (!brief.minutes) missing.push('minutes');
  if (!brief.tone) missing.push('tone');
  return missing;
}

/** Whom an explainer teaches, as the lesson writer's stages have it. */
export const AUDIENCE_STAGE: Record<StudioAudience, LearningStage> = {
  'young children': 'early',
  children: 'early',
  teens: 'middle',
  adults: 'higher',
};

/** How an episode feels, as the voice and the music take it. */
export const TONE_MOOD: Record<StudioTone, SceneMood> = {
  funny: 'playful',
  gentle: 'calm',
  exciting: 'bright',
  serious: 'serious',
  calm: 'calm',
};

/** Spoken words a second, for reckoning how long a scene runs before it is voiced. */
export const WORDS_A_SECOND = 2.4;

// ── The bible ─────────────────────────────────────────────────────────────

/** What a character is: a person the kit draws, or an animal or a creature the artist draws in its style. */
export const STUDIO_KINDS = ['person', 'animal', 'creature'] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const STUDIO_ROLES = ['main', 'supporting', 'minor'] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];

/** The voices a character may speak in: the story's, but for a god's or a crowd's. */
export const STUDIO_VOICES = STORY_VOICES.filter(
  (voice) => voice !== 'divine' && voice !== 'crowd',
);
export type StudioVoice = (typeof STUDIO_VOICES)[number];
/** How many voices of each kind there are to choose from. */
export const VOICE_PICKS = 3;

export interface StudioCharacter {
  /** Theirs for the whole show: every sheet names them by it. */
  id: string;
  name: string;
  kind: StudioKind;
  role: StudioRole;
  /** How they look, in words: an animal's or a creature's drawing is made from it. */
  look: string;
  /** A person's look, as the kit draws them. */
  figure: FigureSpec | null;
  /** An animal's or a creature's size beside people. */
  size: StorySize | null;
  voice: StudioVoice;
  /** Which of their kind's voices is theirs, from 0. */
  voicePick: number;
  /** Two or three words each on what they are like: how they move and speak. */
  traits: string[];
  /** What they carry when a scene gives them nothing else. */
  carries: FigureProp | null;
}

export interface StudioSet {
  id: string;
  name: string;
  /** How it looks, for the painter. */
  look: string;
  kind: PlaceKind;
  /** How people are in it: on its ground, or in it behind a table or a side. */
  stand: PlaceStand;
  /** What stands in front of people's legs: a table, a counter, a boat's side; null for nothing. */
  front: string | null;
  sound: SceneAmbience | null;
}

/** A thing an explainer draws the same way in every scene: the cell, the atom, the heart. */
export interface StudioPicture {
  name: string;
  /** What it is, in the subject's terms. */
  is: string;
  /** How to draw it. */
  draw: string;
}

export interface StudioBible {
  characters: StudioCharacter[];
  sets: StudioSet[];
  world: StoryWorld | null;
  /** An explainer's subject, a few words: "physics: forces". */
  subject: string;
  /** An explainer whose subject works on a board: maths and graphs set by code. */
  maths: boolean;
  /** An explainer's recurring pictures. */
  pictures: StudioPicture[];
}

export const EMPTY_BIBLE: StudioBible = {
  characters: [],
  sets: [],
  world: null,
  subject: '',
  maths: false,
  pictures: [],
};

/** The most characters a show keeps, sets it paints and pictures it repeats. */
export const MAX_CHARACTERS = 8;
export const MAX_SETS = 6;
export const MAX_PICTURES = 6;

/** An id from a name: lower case, words joined by hyphens, never empty. */
export function studioId(name: string, fallback = 'someone'): string {
  const id = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return id || fallback;
}

/** An id not yet taken: `id`, else `id-2`, `id-3`… */
function freeId(id: string, taken: Set<string>): string {
  let out = id;
  for (let n = 2; taken.has(out); n += 1) out = `${id}-${n}`;
  taken.add(out);
  return out;
}

/** A person's figure as sent, made sound by the kit; plain when nothing usable came. */
function figureFrom(raw: unknown, voice: StudioVoice): FigureSpec {
  const age =
    voice === 'girl' || voice === 'boy'
      ? 'child'
      : voice === 'old woman' || voice === 'old man'
        ? 'elder'
        : 'adult';
  if (!raw || typeof raw !== 'object')
    return {
      ...PLAIN_FIGURE,
      age,
      hair: voice === 'girl' || voice === 'woman' ? 'long' : PLAIN_FIGURE.hair,
    };
  return figureOf({ age, ...(raw as Record<string, unknown>) });
}

/** A bible made sound: ids unique and kept, every character a voice, every person a figure. */
export function bibleOf(raw: unknown): StudioBible {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const taken = new Set<string>();
  const characters = (Array.isArray(said.characters) ? said.characters : [])
    .slice(0, MAX_CHARACTERS)
    .flatMap((one: unknown): StudioCharacter[] => {
      if (!one || typeof one !== 'object') return [];
      const c = one as Record<string, unknown>;
      const name = text(c.name, 40);
      if (!name) return [];
      const kind = oneOf(STUDIO_KINDS)(c.kind) ?? 'person';
      const voice =
        oneOf(STUDIO_VOICES)(c.voice) ??
        (kind === 'person' ? 'woman' : 'creature');
      const pick = Math.round(Number(c.voicePick));
      return [
        {
          id: freeId(studioId(text(c.id, 40) || name), taken),
          name,
          kind,
          role: oneOf(STUDIO_ROLES)(c.role) ?? 'supporting',
          look: text(c.look, 300),
          figure: kind === 'person' ? figureFrom(c.figure, voice) : null,
          size:
            kind === 'person' ? null : (oneOf(STORY_SIZES)(c.size) ?? 'medium'),
          voice,
          voicePick:
            Number.isFinite(pick) && pick >= 0 ? pick % VOICE_PICKS : 0,
          traits: (Array.isArray(c.traits) ? c.traits : [])
            .map((t) => text(t, 30))
            .filter(Boolean)
            .slice(0, 3),
          carries: oneOf(FIGURE_PROPS)(c.carries),
        },
      ];
    });
  const places = new Set<string>();
  const sets = (Array.isArray(said.sets) ? said.sets : [])
    .slice(0, MAX_SETS)
    .flatMap((one: unknown): StudioSet[] => {
      if (!one || typeof one !== 'object') return [];
      const s = one as Record<string, unknown>;
      const name = text(s.name, 60);
      if (!name) return [];
      return [
        {
          id: freeId(studioId(text(s.id, 40) || name, 'place'), places),
          name,
          look: text(s.look, 400),
          kind: oneOf(PLACE_KINDS)(s.kind) ?? 'outdoor',
          stand: oneOf(PLACE_STANDS)(s.stand) ?? 'on',
          front: textOrNull(s.front, 60),
          sound: oneOf(SCENE_AMBIENCES)(s.sound),
        },
      ];
    });
  const world =
    said.world && typeof said.world === 'object'
      ? (() => {
          const w = said.world as Record<string, unknown>;
          const out = {
            era: text(w.era, 80),
            region: text(w.region, 120),
            culture: text(w.culture, 120),
            landscape: text(w.landscape, 160),
            homes: text(w.homes, 160),
          };
          return Object.values(out).some(Boolean) ? out : null;
        })()
      : null;
  return {
    characters,
    sets,
    world,
    subject: text(said.subject, 80),
    maths: said.maths === true,
    pictures: (Array.isArray(said.pictures) ? said.pictures : [])
      .slice(0, MAX_PICTURES)
      .flatMap((one: unknown): StudioPicture[] => {
        if (!one || typeof one !== 'object') return [];
        const p = one as Record<string, unknown>;
        const name = text(p.name, 60);
        return name
          ? [{ name, is: text(p.is, 200), draw: text(p.draw, 300) }]
          : [];
      }),
  };
}

// ── The outline ───────────────────────────────────────────────────────────

export interface OutlineScene {
  title: string;
  /** What happens, or what it teaches, in a sentence or two. */
  summary: string;
  /** A story's scene: where it is, by the set's id. */
  set: string | null;
  /** A story's scene: who is in it, by id. */
  cast: string[];
  /** How long it runs, about. */
  seconds: number;
  /** An explainer's scene: what it teaches, as a page of a good book would say it. */
  teach: string | null;
  /** An explainer's scene: its small ideas, each with what to show for it. */
  points: string[];
}

export interface StudioOutline {
  title: string;
  /** The episode in a sentence. */
  logline: string;
  scenes: OutlineScene[];
}

export const MAX_SCENES = 12;
/** A scene runs at least this, and at most this, in seconds. */
export const SCENE_SECONDS = [10, 90] as const;

export function outlineOf(raw: unknown): StudioOutline {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    title: text(said.title, 80) || 'Untitled',
    logline: text(said.logline, 300),
    scenes: (Array.isArray(said.scenes) ? said.scenes : [])
      .slice(0, MAX_SCENES)
      .flatMap((one: unknown): OutlineScene[] => {
        if (!one || typeof one !== 'object') return [];
        const s = one as Record<string, unknown>;
        const title = text(s.title, 80);
        const summary = text(s.summary, 500);
        if (!title && !summary) return [];
        const seconds = Number(s.seconds);
        return [
          {
            title: title || summary.split(/[.!?]/)[0].slice(0, 60),
            summary,
            set: textOrNull(s.set, 40),
            cast: (Array.isArray(s.cast) ? s.cast : [])
              .map((id) => text(id, 40))
              .filter(Boolean)
              .slice(0, 6),
            seconds: Number.isFinite(seconds)
              ? Math.round(
                  Math.min(
                    SCENE_SECONDS[1],
                    Math.max(SCENE_SECONDS[0], seconds),
                  ),
                )
              : 30,
            teach: textOrNull(s.teach, 2000),
            points: (Array.isArray(s.points) ? s.points : [])
              .map((p) => text(p, 240))
              .filter(Boolean)
              .slice(0, 6),
          },
        ];
      }),
  };
}

// ── A story's scene sheet ─────────────────────────────────────────────────

/** Where someone stands, left to right as the viewer sees it. */
export const SPOTS = [
  'left',
  'centre-left',
  'centre',
  'centre-right',
  'right',
] as const;
export type Spot = (typeof SPOTS)[number];

/** The most people standing on a scene at once: more stand on each other. */
export const MOST_ON_STAGE = 4;

/**
 * What someone can be seen doing, besides saying their lines: come on, go
 * off, walk to another spot, reach, point, look, hug, and the rig's moves.
 * Nothing else is ever asked of the stage, so nothing is promised that it
 * cannot show.
 */
export const STUDIO_DOINGS = [
  'enter',
  'leave',
  'walk',
  'hug',
  'reach',
  'point',
  'look',
  ...STORY_MOVES,
  'still',
] as const;
export type StudioDoing = (typeof STUDIO_DOINGS)[number];

/** Every face someone can wear: the story's seven and the kit's own. */
export const STUDIO_FACES = [...EXPRESSIONS, ...KIT_FACES] as const;

export const BEAT_KINDS = [
  'line',
  'narration',
  'action',
  'business',
  'reaction',
  'pause',
] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];

/**
 * One beat of a scene, flat: every field present, null where its kind
 * does not use it. A line is said by `who` to `to`; a narration by the
 * narrator; an action is `who` doing `do` (toward `to`, or to `spot`);
 * business is `who` doing `do` with `prop` (given `to` someone); a
 * reaction is `who` showing `feeling` (or a `sign`); a pause is quiet.
 */
export interface SheetBeat {
  kind: BeatKind;
  who: string | null;
  to: string | null;
  /** A line's words; the narrator's; for anything else what it shows, unspoken. */
  say: string;
  feeling: FigureFace | null;
  sign: FigureSign | null;
  do: StudioDoing | PropAction | null;
  prop: StageProp | null;
  spot: Spot | null;
  from: LineFrom | null;
  pace: LinePace | null;
  seconds: number | null;
}

/** Someone on the stage as a scene opens. */
export interface SheetPlace {
  who: string;
  spot: Spot;
  pose: FigurePose;
  face: FigureFace;
  holding: FigureProp | null;
}

/** A thing on the stage to be handled, resting before whom. */
export interface SheetProp {
  prop: StageProp;
  near: string | null;
}

export const SHOTS = ['wide', 'close', 'two'] as const;
export type Shot = (typeof SHOTS)[number];

/** Where the camera is from a beat on: the whole stage, one person close, or two framed together. */
export interface SheetShot {
  beat: number;
  shot: Shot;
  on: string | null;
  with: string | null;
}

export const TRANSITIONS = ['cut', 'fade'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface StorySheet {
  kind: 'story';
  title: string;
  /** The set it is in, by id. */
  set: string;
  time: StoryTime;
  weather: StoryWeather;
  /** Other people about: a crowd is drawn behind the story's own. */
  crowd: StoryCrowd;
  mood: SceneMood;
  music: SceneMusic;
  /** How the film comes into it from the scene before. */
  transition: Transition;
  /** Exactly who is there as it opens, and where. */
  onStage: SheetPlace[];
  props: SheetProp[];
  beats: SheetBeat[];
  camera: SheetShot[];
}

/** An explainer's scene: the narration and the storyboard, as the lesson writer writes a page. */
export interface ExplainerSheet {
  kind: 'explainer';
  title: string;
  transition: Transition;
  draft: SceneScriptDraft;
}

export type SceneSheet = StorySheet | ExplainerSheet;

/** The most beats a scene holds. */
export const MAX_BEATS = 40;
/** The most words one line or narration holds. */
export const LINE_WORDS = 40;

const FIGURE_FACE_LIST = STUDIO_FACES as readonly string[];
const asFace = (value: unknown): FigureFace | null =>
  typeof value === 'string' && FIGURE_FACE_LIST.includes(value)
    ? (value as FigureFace)
    : null;

/** A beat made sound: its kind's fields kept, the rest null. */
export function beatOf(raw: unknown): SheetBeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const kind = oneOf(BEAT_KINDS)(b.kind);
  if (!kind) return null;
  const id = (value: unknown) => {
    const said = text(value, 40);
    return said ? studioId(said) : null;
  };
  const seconds = Number(b.seconds);
  const doing =
    kind === 'business'
      ? oneOf(PROP_ACTIONS)(b.do)
      : kind === 'action'
        ? oneOf(STUDIO_DOINGS)(b.do)
        : null;
  return {
    kind,
    who: kind === 'narration' || kind === 'pause' ? null : id(b.who),
    to:
      kind === 'line' || kind === 'action' || kind === 'business'
        ? id(b.to)
        : null,
    say: text(b.say, 600),
    feeling:
      kind === 'line' || kind === 'reaction'
        ? (asFace(b.feeling) ??
          (typeof b.feeling === 'string' ? faceNamed(b.feeling) : null))
        : null,
    sign: kind === 'reaction' ? oneOf(FIGURE_SIGNS)(b.sign) : null,
    do: doing,
    prop: kind === 'business' ? oneOf(STAGE_PROPS)(b.prop) : null,
    spot: kind === 'action' ? oneOf(SPOTS)(b.spot) : null,
    from: kind === 'line' ? oneOf(LINE_FROMS)(b.from) : null,
    pace: kind === 'line' ? oneOf(LINE_PACES)(b.pace) : null,
    seconds:
      (kind === 'pause' || kind === 'action') && Number.isFinite(seconds)
        ? Math.min(4, Math.max(0.4, Math.round(seconds * 10) / 10))
        : null,
  };
}

/** A story's sheet made sound. Ids are lower-cased as ids are; the check says what is still wrong. */
export function storySheetOf(raw: unknown): StorySheet {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = (value: unknown) => studioId(text(value, 40), '');
  const onStage = (Array.isArray(said.onStage) ? said.onStage : [])
    .slice(0, 8)
    .flatMap((one: unknown): SheetPlace[] => {
      if (!one || typeof one !== 'object') return [];
      const p = one as Record<string, unknown>;
      const who = id(p.who);
      if (!who) return [];
      return [
        {
          who,
          spot: oneOf(SPOTS)(p.spot) ?? 'centre',
          pose: oneOf(FIGURE_POSES)(p.pose) ?? 'standing',
          face: asFace(p.face) ?? 'neutral',
          holding: oneOf(FIGURE_PROPS)(p.holding),
        },
      ];
    });
  const props = (Array.isArray(said.props) ? said.props : [])
    .slice(0, 6)
    .flatMap((one: unknown): SheetProp[] => {
      if (!one || typeof one !== 'object') return [];
      const p = one as Record<string, unknown>;
      const prop = oneOf(STAGE_PROPS)(p.prop);
      return prop ? [{ prop, near: id(p.near) || null }] : [];
    });
  const beats = (Array.isArray(said.beats) ? said.beats : [])
    .slice(0, MAX_BEATS)
    .map(beatOf)
    .filter((beat): beat is SheetBeat => Boolean(beat));
  const camera = (Array.isArray(said.camera) ? said.camera : [])
    .slice(0, 20)
    .flatMap((one: unknown): SheetShot[] => {
      if (!one || typeof one !== 'object') return [];
      const s = one as Record<string, unknown>;
      const beat = Math.round(Number(s.beat));
      const shot = oneOf(SHOTS)(s.shot);
      if (!shot || !Number.isFinite(beat) || beat < 0) return [];
      return [{ beat, shot, on: id(s.on) || null, with: id(s.with) || null }];
    })
    .sort((a, b) => a.beat - b.beat);
  return {
    kind: 'story',
    title: text(said.title, 80) || 'A scene',
    set: id(said.set),
    time: oneOf(STORY_TIMES)(said.time) ?? 'day',
    weather: oneOf(STORY_WEATHERS)(said.weather) ?? 'clear',
    crowd: oneOf(STORY_CROWDS)(said.crowd) ?? 'none',
    mood: oneOf(SCENE_MOODS)(said.mood) ?? 'calm',
    music: oneOf(SCENE_MUSIC)(said.music) ?? 'calm',
    transition: oneOf(TRANSITIONS)(said.transition) ?? 'cut',
    onStage,
    props,
    beats,
    camera,
  };
}

/** An explainer's sheet made sound: its draft as the writer's schema holds it. */
export function explainerSheetOf(raw: unknown): ExplainerSheet {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const draft =
    said.draft && typeof said.draft === 'object'
      ? (said.draft as SceneScriptDraft)
      : null;
  return {
    kind: 'explainer',
    title: text(said.title, 80) || text(draft?.title, 80) || 'A scene',
    transition: oneOf(TRANSITIONS)(said.transition) ?? 'cut',
    draft: draft ?? {
      fit: 'good',
      fitReason: null,
      title: 'A scene',
      mood: 'curious',
      beats: [],
      cast: [],
      steps: [],
    },
  };
}

/**
 * An explainer's sentences changed by hand: each kept line by the index
 * it had (null for a new one), in its new order, its words its own. What
 * the storyboard showed on a sentence taken out comes on with the next
 * one kept, so nothing it brings on is lost.
 */
export function mendExplainerLines(
  sheet: ExplainerSheet,
  body: unknown,
): ExplainerSheet {
  const said =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const title = text(said.title, 80) || sheet.title;
  const transition = oneOf(TRANSITIONS)(said.transition) ?? sheet.transition;
  if (!Array.isArray(said.lines)) return { ...sheet, title, transition };
  const draft = sheet.draft;
  const kept = said.lines
    .slice(0, MAX_BEATS)
    .flatMap((line: unknown): { from: number | null; say: string }[] => {
      if (!line || typeof line !== 'object') return [];
      const l = line as Record<string, unknown>;
      const say = text(l.say, 600);
      if (!say) return [];
      const index = Math.round(Number(l.index));
      return [
        {
          from:
            Number.isFinite(index) && index >= 0 && index < draft.beats.length
              ? index
              : null,
          say,
        },
      ];
    });
  if (!kept.length) return { ...sheet, title, transition };
  const beats = kept.map((k) =>
    k.from !== null
      ? { ...draft.beats[k.from], say: k.say }
      : {
          say: k.say,
          pause: 'short' as const,
          delivery: 'explain' as const,
          speaker: null,
          music: null,
          energy: null,
        },
  );
  const moved = new Map<number, number>();
  kept.forEach((k, i) => {
    if (k.from !== null && !moved.has(k.from)) moved.set(k.from, i);
  });
  const steps = draft.steps.map((step) => {
    const own = moved.get(step.beat);
    if (own !== undefined) return { ...step, beat: own };
    let next = step.beat + 1;
    while (next < draft.beats.length && !moved.has(next)) next += 1;
    return { ...step, beat: moved.get(next) ?? beats.length - 1, phrase: '' };
  });
  return { ...sheet, title, transition, draft: { ...draft, beats, steps } };
}

export function sheetOf(raw: unknown): SceneSheet {
  const kind =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).kind
      : null;
  return kind === 'explainer' ? explainerSheetOf(raw) : storySheetOf(raw);
}

/** A sheet's fingerprint: a scene is made again only when it changes, or its cast does. */
export function sheetHash(sheet: SceneSheet, also: unknown = null): string {
  return createHash('sha256')
    .update(JSON.stringify({ sheet, also }))
    .digest('hex')
    .slice(0, 24);
}

/** The spoken words of a sheet, in order: its lines and its narration. */
export function spokenOf(sheet: SceneSheet): string[] {
  if (sheet.kind === 'explainer')
    return sheet.draft.beats.map((beat) => beat.say);
  return sheet.beats
    .filter((beat) => beat.kind === 'line' || beat.kind === 'narration')
    .map((beat) => beat.say);
}

const wordCount = (say: string) => say.split(/\s+/).filter(Boolean).length;

/** How long a sheet runs, about, before it is voiced: its words at a steady pace, and its quiet. */
export function secondsOf(sheet: SceneSheet): number {
  if (sheet.kind === 'explainer')
    return Math.round(
      sheet.draft.beats.reduce(
        (n, beat) =>
          n +
          wordCount(beat.say) / WORDS_A_SECOND +
          (beat.pause === 'long' ? 0.8 : 0.4),
        0,
      ),
    );
  let seconds = 0;
  for (const beat of sheet.beats) {
    if (beat.kind === 'line' || beat.kind === 'narration')
      seconds += wordCount(beat.say) / WORDS_A_SECOND + 0.4;
    else if (beat.kind === 'pause') seconds += beat.seconds ?? 1;
    else seconds += Math.min(3, beat.seconds ?? 1);
  }
  return Math.round(seconds);
}

/** What someone's face is: one of the kit's, or the nearest. */
export { asFace };

/** The props a hand can hold, and the ones on a stage to be handled: for the writer's menu. */
export const HELD_THINGS = FIGURE_PROPS;
export const STAGE_THINGS = STAGE_PROPS;
export const PROP_DOINGS = PROP_ACTIONS;
export type { StageProp, PropAction, StoryMove, FigureSign };
