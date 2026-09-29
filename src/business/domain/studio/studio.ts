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
  FIGURE_SIGNS,
  PLAIN_FIGURE,
  figureOf,
  isGear,
  type FigureFace,
  type FigurePose,
  type FigureSign,
  type FigureSpec,
} from '../scene-figure';
import { ASKED_FACES, KIT_FACES } from '../scene-figure';
import { animalOf, type AnimalSpec } from '../scene-animal';
import { creatureOf, type CreatureSpec } from '../scene-creature';
import { faceNamed } from '../scene-feeling';
import {
  ACTION_DOINGS,
  FEATURE_KINDS,
  FEATURE_WORDS,
  HANDLE_DOINGS,
  OPENING_FEATURES,
  PROP_ACTIONS,
  SIDES,
  THINGS,
  TRAVEL_PACES,
  doingOf,
  featureIdOf,
  isDoing,
  isStageProp,
  isThingWord,
  type AnyFeatureKind,
  type DoingId,
  type FeatureKind,
  type PropAction,
  type ThingId,
  type TravelPace,
} from '../scene-doings';
import { DRAWN, mayBeFeature, mayBeThing, nounOf, ownIdOf } from '../scene-own';
import { PROP_KIND, STAGE_PROPS, type StageProp } from '../scene-props';
import {
  LINE_FROMS,
  LINE_PACES,
  SCENE_AMBIENCES,
  SCENE_MOODS,
  SCENE_MUSIC,
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

/**
 * What a character is: a person the kit draws; an animal, drawn by the
 * animal kit when its species is one the kit has (its `animal`), else by
 * the artist in the kit's style; or a creature, drawn by the creature
 * kit when its body is one the kit has (its `creature`), else by the
 * artist.
 */
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
  /**
   * An animal's look, as the animal kit draws it (scene-animal): present
   * when its species is one the kit has. Absent, the artist draws it.
   */
  animal?: AnimalSpec;
  /**
   * A creature's look, as the creature kit draws it (scene-creature):
   * present when it fits the kit's bodies. Absent, the artist draws it.
   */
  creature?: CreatureSpec;
  /** An animal's or a creature's size beside people. */
  size: StorySize | null;
  voice: StudioVoice;
  /** Which of their kind's voices is theirs, from 0. */
  voicePick: number;
  /** Two or three words each on what they are like: how they move and speak. */
  traits: string[];
  /** What they carry when a scene gives them nothing else: gear drawn in their hand, or a thing of the stage's. */
  carries: ThingId | null;
  /**
   * One the artist drew: which drawing of theirs the maker chose, when
   * they chose a new one. Scenes that show them are made again with it;
   * absent until then.
   */
  drawn?: string;
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
  /** The fixed things its stories act on: a gate, a bench, a goalpost. Absent, none yet. */
  features?: StudioFeature[];
}

/**
 * A fixed thing of a set that a story acts on: a gate someone goes out by,
 * a bench someone looks under, a goalpost someone stands by; or one of the
 * show's own, which no list has (a bicycle leant on a wall, a signpost),
 * drawn by the artist once for the show. Kept on the set for good once a
 * scene names it, as new places and people are.
 */
export interface StudioFeature {
  /** Its id in every sheet: the word for it, "gate", "danfo". */
  id: string;
  name: string;
  /** One of the list's kinds, or "drawn": one of the show's own, which the artist draws. */
  kind: AnyFeatureKind;
  /** Where it stands, as the viewer sees it: a spot, or at the back. */
  spot: Spot | 'back';
  /** Whether it opens and shuts: a gate, a door, a window. */
  opens: boolean;
}

/** The kinds the stage draws as one particular thing, whatever they are called. */
const ONE_LOOK = new Set<FeatureKind>([
  'vehicle',
  'stall',
  'goalpost',
  'swing',
  'well',
]);

/** The most features a set keeps. */
export const MAX_FEATURES = 8;

/** The list's kind a name is, when its last word or two say so: "a wooden gate", "the goal post"; never "a bus stop". */
function kindNamed(noun: string): FeatureKind | null {
  return (
    FEATURE_KINDS.find((kind) => {
      const m = FEATURE_WORDS[kind].exec(noun);
      return m !== null && m.index + m[0].length === noun.length;
    }) ?? null
  );
}

/**
 * A set's features made sound: each an id of its own, a kind from the
 * list (or the artist's), a spot. `others` are the show's characters and
 * its own things, by id and name: never a feature.
 */
export function featuresOf(
  raw: unknown,
  others: readonly string[] = [],
): StudioFeature[] {
  const taken = new Set<string>();
  const notOne = new Set(others.map(ownIdOf));
  return (Array.isArray(raw) ? raw : [])
    .flatMap((one: unknown): StudioFeature[] => {
      if (!one || typeof one !== 'object') return [];
      const f = one as Record<string, unknown>;
      const said = text(f.name, 40) || text(f.id, 40);
      // "a long stick" is a stick: its name without the words before it.
      const noun = nounOf(said);
      const last = noun.split(/\s+/).pop() ?? '';
      // A kind none of the list's is the list's own when its name says so
      // ("a wooden gate"), else the artist's to draw if its name could be
      // one: never a thing handled or carried, one of the cast, a place,
      // the ground or the weather.
      // A kind the stage draws as one thing (a vehicle is a danfo, a stall
      // a market stall) only when its name says so: "the half-built ark"
      // put down as a vehicle is the artist's to draw, never a bus.
      const given = oneOf(FEATURE_KINDS)(f.kind);
      const listed =
        given && (!ONE_LOOK.has(given) || FEATURE_WORDS[given].test(noun))
          ? given
          : null;
      const kind: AnyFeatureKind | null =
        listed ??
        kindNamed(noun) ??
        (noun &&
        mayBeFeature(last) &&
        !isThingWord(noun) &&
        !isThingWord(last) &&
        !isGear(last) &&
        ![said, noun, text(f.id, 40)].some((w) => notOne.has(ownIdOf(w)))
          ? DRAWN
          : null);
      if (!said || !kind) return [];
      const name = kind === DRAWN ? noun : said;
      const id =
        kind === DRAWN
          ? ownIdOf(text(f.id, 40) || noun)
          : featureIdOf(text(f.id, 40) || said);
      // Nor known by a thing's id or someone's, which aims at them would find first.
      if (
        kind === DRAWN &&
        (isStageProp(id) || isThingWord(id) || notOne.has(id))
      )
        return [];
      if (!id || taken.has(id)) return [];
      taken.add(id);
      return [
        {
          id,
          name,
          kind,
          spot: f.spot === 'back' ? 'back' : (oneOf(SPOTS)(f.spot) ?? 'back'),
          // One the list's by its name opens as its kind does, unless said to.
          opens:
            typeof f.opens === 'boolean' &&
            (f.opens || listed || kind === DRAWN)
              ? f.opens
              : kind !== DRAWN && OPENING_FEATURES.includes(kind),
        },
      ];
    })
    .slice(0, MAX_FEATURES);
}

/**
 * A thing of the show's own, which no list has, that its stories handle:
 * a kite, a drum, an umbrella. Drawn by the artist once for the show,
 * held, thrown and carried as the lists' things are, and kept for good
 * once a scene's words name it.
 */
export interface StudioThing {
  /** Its id in every sheet: its name, singular. */
  id: string;
  name: string;
  /** Eaten, drunk from, or neither: what may be done with it. */
  kind: 'food' | 'drink' | 'thing';
  /** What it looks like, as the words say it before its name: "red". Absent, nothing said. */
  look?: string;
}

/** The most things of its own a show keeps. */
export const MAX_THINGS = 24;

/** A show's own things made sound: each a name that is no word of the lists', once. */
export function thingsOf(raw: unknown): StudioThing[] {
  const taken = new Set<string>();
  return (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_THINGS)
    .flatMap((one: unknown): StudioThing[] => {
      if (!one || typeof one !== 'object') return [];
      const t = one as Record<string, unknown>;
      const name = text(t.name, 40) || text(t.id, 40);
      const id = ownIdOf(text(t.id, 40) || name);
      if (!name || !id || taken.has(id) || isThingWord(id)) return [];
      taken.add(id);
      const look = text(t.look, 40);
      return [
        {
          id,
          name,
          kind: t.kind === 'food' || t.kind === 'drink' ? t.kind : 'thing',
          ...(look ? { look } : {}),
        },
      ];
    });
}

/** Whether a thing is handled apart from anyone on a show's stage: one of the lists', or the show's own. */
export const handledOn =
  (bible: Pick<StudioBible, 'things'> | null) =>
  (thing: string | null | undefined): thing is string =>
    isStageProp(thing) ||
    Boolean(thing && bible?.things?.some((t) => t.id === thing));

/** What a thing on a show's stage is, for what may be done with it: food, a drink, or neither. */
export const kindOn =
  (bible: Pick<StudioBible, 'things'> | null) =>
  (prop: string): StudioThing['kind'] =>
    isStageProp(prop)
      ? PROP_KIND[prop]
      : (bible?.things?.find((t) => t.id === prop)?.kind ?? 'thing');

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
  /** The show's own things its stories handle, drawn by the artist. Absent, none yet. */
  things?: StudioThing[];
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

/**
 * The names the words may call a character by: their name, its first
 * word, and their id as a word ("Grandma", for the grandmother whose id is
 * grandma).
 */
export function namesOf(c: Pick<StudioCharacter, 'id' | 'name'>): string[] {
  const id = c.id.replace(/-\d+$/, '').replace(/-/g, ' ');
  return [
    ...new Set([
      c.name,
      c.name.split(/\s+/)[0],
      `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
    ]),
  ];
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
      // Only an animal is the animal kit's, and only one of its species.
      const animal = kind === 'animal' && c.animal ? animalOf(c.animal) : null;
      // And only a creature the creature kit's, when its body is the kit's.
      const creature =
        kind === 'creature' && c.creature ? creatureOf(c.creature) : null;
      return [
        {
          id: freeId(studioId(text(c.id, 40) || name), taken),
          name,
          kind,
          role: oneOf(STUDIO_ROLES)(c.role) ?? 'supporting',
          look: text(c.look, 300),
          figure: kind === 'person' ? figureFrom(c.figure, voice) : null,
          // Kept only when there is one, so a character without is as it was.
          ...(animal ? { animal } : {}),
          ...(creature ? { creature } : {}),
          // A creature the kit draws stands at its spec's size.
          size:
            kind === 'person'
              ? null
              : (creature?.size ?? oneOf(STORY_SIZES)(c.size) ?? 'medium'),
          voice,
          voicePick:
            Number.isFinite(pick) && pick >= 0 ? pick % VOICE_PICKS : 0,
          traits: (Array.isArray(c.traits) ? c.traits : [])
            .map((t) => text(t, 30))
            .filter(Boolean)
            .slice(0, 3),
          carries: oneOf(THINGS)(c.carries),
          ...(typeof c.drawn === 'string' && /^[a-f0-9]{6,32}$/.test(c.drawn)
            ? { drawn: c.drawn }
            : {}),
        },
      ];
    });
  const things = thingsOf(said.things);
  const places = new Set<string>();
  const sets = (Array.isArray(said.sets) ? said.sets : [])
    .slice(0, MAX_SETS)
    .flatMap((one: unknown): StudioSet[] => {
      if (!one || typeof one !== 'object') return [];
      const s = one as Record<string, unknown>;
      const name = text(s.name, 60);
      if (!name) return [];
      const features = featuresOf(s.features, [
        ...characters.flatMap((c) => [c.id, c.name, c.name.split(/\s+/)[0]]),
        ...things.map((t) => t.id),
      ]);
      return [
        {
          id: freeId(studioId(text(s.id, 40) || name, 'place'), places),
          name,
          look: text(s.look, 400),
          kind: oneOf(PLACE_KINDS)(s.kind) ?? 'outdoor',
          stand: oneOf(PLACE_STANDS)(s.stand) ?? 'on',
          front: textOrNull(s.front, 60),
          sound: oneOf(SCENE_AMBIENCES)(s.sound),
          // Kept only when there are some, so a set without is as it was.
          ...(features.length ? { features } : {}),
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
    // Kept only when there are some, so a bible without is as it was.
    ...(things.length ? { things } : {}),
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
 * What someone can be seen doing, besides saying their lines: the one list
 * of doings (scene-doings.ts). An action moves the body or goes somewhere;
 * business handles a thing. Nothing else is ever asked of the stage, and
 * the stage has something to show for every one.
 */
export const STUDIO_DOINGS = ACTION_DOINGS;
export type StudioDoing = DoingId;

/** Every face someone can wear: the story's seven, the kit's own, and eyes closed (drawn when a scene shows it). */
export const STUDIO_FACES = [
  ...EXPRESSIONS,
  ...KIT_FACES,
  ...ASKED_FACES,
] as const;

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
 * narrator; an action is `who` doing `do` (toward `target`, or to `spot`,
 * by `via`, at a `pace`); business is `who` doing `do` with `thing` (given
 * `to` someone); a reaction is `who` showing `feeling` (or a `sign`); a
 * pause is quiet. The words of an action or business are what it shows,
 * and the stage is held to them.
 */
export interface SheetBeat {
  kind: BeatKind;
  who: string | null;
  to: string | null;
  /** A line's words; the narrator's; for anything else what it shows, unspoken. */
  say: string;
  feeling: FigureFace | null;
  sign: FigureSign | null;
  do: DoingId | null;
  /** The thing handled: one of the lists', or one of the show's own. */
  prop: string | null;
  spot: Spot | null;
  from: LineFrom | null;
  /** How a line is said; how someone goes: at a walk, or a run. */
  pace: LinePace | TravelPace | null;
  seconds: number | null;
  /**
   * Toward whom or what: a character's id, a feature's, a thing's, or a
   * side ("@left", "@right", "@up", "@down"). Absent, toward no one.
   */
  target?: string;
  /** The thing handled or named: a thing on the stage (one of the show's own too), or one carried. */
  thing?: string;
  /** The feature someone goes in or out by: "gate", "door". */
  via?: string;
  /** What the writer asked for that is none of the doings, kept as they wrote it. */
  doSaid?: string;
}

/**
 * How someone is as a Studio scene opens: standing, sitting (on a seat
 * of the set, or the ground), lying down (on the ground, or along a bed
 * or a sofa), or in bed, sitting up under its cover. Whoever is not
 * standing gets up before they go anywhere.
 */
export const STUDIO_POSES = ['standing', 'sitting', 'lying', 'in bed'] as const;
export type StudioPose = (typeof STUDIO_POSES)[number];
/** A pose a sheet may carry: the Studio's own, or one of the kit's from a sheet written before (an arm's, played as a move). */
export type SheetPose = StudioPose | FigurePose;

/** Someone on the stage as a scene opens. */
export interface SheetPlace {
  who: string;
  spot: Spot;
  pose: SheetPose;
  face: FigureFace;
  /** What they hold as it opens, in a hand or an animal's mouth; null for nothing. */
  holding: string | null;
  /** The feature of the set they sit or lie on, or are in, as it opens: "bed", "bench". Absent, the ground where they are. */
  on?: string;
  /** Things they wear as it opens besides their usual clothes, by the things' ids: the coat the scene before left them holding. */
  wears?: string[];
  /** How far back they stand as it opens, where it matters (studio-scenery-plan §4.1): absent, as the stager spreads them. */
  depth?: SheetDepth;
}

/** How far back someone stands on the floor, in a sheet's words. */
export const SHEET_DEPTHS = ['back', 'middle', 'front'] as const;
export type SheetDepth = (typeof SHEET_DEPTHS)[number];

/** A thing on the stage to be handled (one of the lists', or the show's own), resting before whom. */
export interface SheetProp {
  prop: string;
  near: string | null;
  /** Caught up in a feature of the set, by its id, as the scene before left it: the kite in the palm. */
  in?: string;
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

/**
 * A thing as a model or a person named it: one of the lists', else a
 * name of a word or two that may be one of the show's own (the check
 * holds it to the scene's words); null for anything else.
 */
export function thingNamed(value: unknown): string | null {
  const listed = oneOf(THINGS)(value);
  if (listed) return listed;
  const said = text(value, 32);
  if (
    !said ||
    !/^\p{L}[\p{L}\s'’-]*$/u.test(said) ||
    said.split(/\s+/).length > 3
  )
    return null;
  // "a red kite" is a kite: the colour is the words', and the drawing's.
  const id = ownIdOf(nounOf(said));
  return id && mayBeThing(id.split('-').pop() ?? '') ? id : null;
}

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
  const acts = kind === 'action' || kind === 'business';
  const doing = acts && isDoing(b.do) ? b.do : null;
  // A doing none of the list is kept as it was written, for the words to
  // be read by; "still" is no doing at all.
  const doSaid =
    acts && !doing && typeof b.do === 'string' ? text(b.do, 40) : '';
  const aimed = acts ? text(b.target, 40) : '';
  const target = (SIDES as readonly string[]).includes(aimed)
    ? aimed
    : aimed
      ? studioId(aimed)
      : '';
  const thing = acts ? thingNamed(b.thing) : null;
  const via = kind === 'action' ? text(b.via, 40) : '';
  // Gear is drawn in a hand for good, never a thing handled apart.
  const own = (named: string | null) =>
    named && !isGear(named) ? named : null;
  const prop =
    kind === 'business'
      ? (oneOf(STAGE_PROPS)(b.prop) ?? own(thingNamed(b.prop)) ?? own(thing))
      : null;
  const out: SheetBeat = {
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
    prop,
    spot: kind === 'action' ? oneOf(SPOTS)(b.spot) : null,
    from: kind === 'line' ? oneOf(LINE_FROMS)(b.from) : null,
    pace:
      kind === 'line'
        ? oneOf(LINE_PACES)(b.pace)
        : kind === 'action'
          ? oneOf(TRAVEL_PACES)(b.pace)
          : null,
    seconds:
      (kind === 'pause' || kind === 'action') && Number.isFinite(seconds)
        ? Math.min(4, Math.max(0.4, Math.round(seconds * 10) / 10))
        : null,
  };
  // What a beat is aimed at, handles and goes by: kept only when said, so
  // a sheet written before them reads as it was.
  if (target) out.target = target;
  if (thing) out.thing = thing;
  if (via) out.via = featureIdOf(via);
  if (doSaid) out.doSaid = doSaid;
  return out;
}

/** Every pose a sheet may carry, the Studio's first. */
const SHEET_POSES: readonly SheetPose[] = [
  ...STUDIO_POSES,
  ...FIGURE_POSES.filter(
    (pose) => !(STUDIO_POSES as readonly string[]).includes(pose),
  ),
];

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
      const on = id(p.on);
      const depth = oneOf(SHEET_DEPTHS)(p.depth);
      const wears = (Array.isArray(p.wears) ? p.wears : [])
        .map(thingNamed)
        .filter((w): w is string => Boolean(w))
        .slice(0, 3);
      return [
        {
          who,
          spot: oneOf(SPOTS)(p.spot) ?? 'centre',
          pose: oneOf(SHEET_POSES)(p.pose) ?? 'standing',
          face: asFace(p.face) ?? 'neutral',
          holding: thingNamed(p.holding),
          // Where they sit or lie, and what they wear: kept only when said.
          ...(on ? { on: featureIdOf(on) } : {}),
          ...(wears.length ? { wears } : {}),
          ...(depth ? { depth } : {}),
        },
      ];
    });
  const props = (Array.isArray(said.props) ? said.props : [])
    .slice(0, 6)
    .flatMap((one: unknown): SheetProp[] => {
      if (!one || typeof one !== 'object') return [];
      const p = one as Record<string, unknown>;
      const named = thingNamed(p.prop);
      const prop = named && !isGear(named) ? named : null;
      const up = id(p.in);
      return prop
        ? [{ prop, near: id(p.near) || null, ...(up ? { in: up } : {}) }]
        : [];
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
    else if (beat.kind === 'reaction') seconds += 0.6;
    else
      seconds += Math.min(
        3,
        (doingOf(beat.do)?.ms ?? (beat.seconds ?? 1) * 1000) / 1000,
      );
  }
  return Math.round(seconds);
}

/** What someone's face is: one of the kit's, or the nearest. */
export { asFace };

/** What someone may hold (every thing, and the gear drawn in a hand), and the things on a stage to be handled: for the writer's menu. */
export const HELD_THINGS = THINGS;
export const STAGE_THINGS = STAGE_PROPS;
/** What a business beat may do with a thing: the handling doings. */
export const PROP_DOINGS = HANDLE_DOINGS;
/** The handlings a book's page plays, kept for the pages that use them. */
export const PAGE_PROP_ACTIONS = PROP_ACTIONS;
export type { StageProp, PropAction, StoryMove, FigureSign, ThingId };
