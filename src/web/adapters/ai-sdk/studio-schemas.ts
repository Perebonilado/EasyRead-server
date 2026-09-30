/**
 * The Studio's structured answers. Flat, every field present and null
 * where unused, because a model fills a flat shape more reliably than a
 * union; the domain makes each sound again whatever arrives.
 */
import { z } from 'zod';
import {
  BEAT_KINDS,
  LINE_AIMS,
  NARRATOR_MODES,
  STUDIO_ENDINGS,
  STUDIO_GENRES,
  STUDIO_PACES,
  STUDIO_STYLES,
  SHEET_DEPTHS,
  SHOTS,
  SPOTS,
  STUDIO_AUDIENCES,
  STUDIO_POSES,
  STUDIO_FACES,
  SHEET_FEELINGS,
  STUDIO_FORMATS,
  STUDIO_KINDS,
  STUDIO_ROLES,
  STUDIO_TONES,
  STUDIO_VOICES,
  TRANSITIONS,
} from '../../../business/domain/studio/studio';
import {
  DOING_IDS,
  FEATURE_KINDS,
  THINGS,
  TRAVEL_PACES,
} from '../../../business/domain/scene-doings';
import { STAGE_PROPS } from '../../../business/domain/scene-props';
import { THEME_IDS } from '../../../business/domain/scene-themes';
import { BEAT_ROLES } from '../../../business/domain/studio/studio-story';
import {
  genreNamed,
  toneNamed,
} from '../../../business/domain/studio/studio-heard';
import {
  RUBRIC_KEYS,
  type RubricKey,
} from '../../../business/domain/studio/studio-script';
import {
  BOTTOMS,
  CLOTH_COLOURS,
  FACIAL_HAIR,
  FIGURE_AGES,
  FIGURE_BUILDS,
  FIGURE_SIGNS,
  HAIR_COLOURS,
  HAIR_STYLES,
  HEADWEAR,
  TOPS,
} from '../../../business/domain/scene-figure';
import {
  LINE_FROMS,
  LINE_PACES,
  SCENE_AMBIENCES,
  SCENE_MOODS,
  SCENE_MUSIC,
} from '../../../business/domain/scene-script';
import {
  ANIMAL_BUILDS,
  ANIMAL_EARS,
  ANIMAL_HORNS,
  ANIMAL_MANES,
  ANIMAL_PATTERNS,
  ANIMAL_SIZES,
  ANIMAL_TAILS,
  BACK_WEAR,
  FEET_WEAR,
  HEAD_WEAR,
  NECK_WEAR,
} from '../../../business/domain/scene-animal';
import {
  CREATURE_ARMS,
  CREATURE_BODY_WEAR,
  CREATURE_BUILDS,
  CREATURE_FACE_WEAR,
  CREATURE_HEADS,
  CREATURE_LEGS,
  CREATURE_NECK_WEAR,
  CREATURE_NOSES,
  CREATURE_SIZES,
  CREATURE_TAILS,
  CREATURE_TEXTURES,
  CREATURE_TOPS,
  CREATURE_WINGS,
} from '../../../business/domain/scene-creature';
import {
  PLACE_KINDS,
  PLACE_STANDS,
  STORY_CROWDS,
  STORY_SIZES,
  STORY_TIMES,
  STORY_WEATHERS,
} from '../../../business/domain/scene-story';

export const STUDIO_ACTIONS = [
  'none',
  'outline',
  'approve',
  'cast',
  'redraw',
  'choose',
  'scene',
  'make',
  'episode',
  'repace',
  'pages',
] as const;

/**
 * A value the model got a little wrong (a word not in the list, a number
 * as text) is caught as nothing rather than failing the whole answer: the
 * domain makes every field sound again, and a turn or a scene is not lost
 * to one stray word. The lists still go to the model as its choices.
 */
export const studioTurnSchema = z.object({
  reply: z.string(),
  choices: z.array(z.string()).catch([]),
  brief: z
    .object({
      format: z.enum(STUDIO_FORMATS).nullable().catch(null),
      idea: z.string().nullable().catch(null),
      audience: z.enum(STUDIO_AUDIENCES).nullable().catch(null),
      minutes: z.union([z.number(), z.string()]).nullable().catch(null),
      // A tone or a genre written in words ("dry and ironic", "dark
      // comedy") is caught as the one it belongs to, never lost.
      tone: z
        .enum(STUDIO_TONES)
        .nullable()
        .catch(({ input }) =>
          typeof input === 'string' ? toneNamed(input) : null,
        ),
      setting: z.string().nullable().catch(null),
      characters: z.string().nullable().catch(null),
      include: z.string().nullable().catch(null),
      // The maker's own choices, null unless they said them.
      narrator: z.enum(NARRATOR_MODES).nullable().catch(null),
      narratorCharacter: z.string().nullable().catch(null),
      genre: z
        .enum(STUDIO_GENRES)
        .nullable()
        .catch(({ input }) =>
          typeof input === 'string' ? genreNamed(input) : null,
        ),
      ending: z.enum(STUDIO_ENDINGS).nullable().catch(null),
      pace: z.enum(STUDIO_PACES).nullable().catch(null),
      style: z.enum(STUDIO_STYLES).nullable().catch(null),
      look: z.enum(THEME_IDS).nullable().catch(null),
    })
    .catch({
      format: null,
      idea: null,
      audience: null,
      minutes: null,
      tone: null,
      setting: null,
      characters: null,
      include: null,
      narrator: null,
      narratorCharacter: null,
      genre: null,
      ending: null,
      pace: null,
      style: null,
      look: null,
    }),
  action: z.enum(STUDIO_ACTIONS).catch('none'),
  scene: z.union([z.number(), z.string()]).nullable().catch(null),
  // A change to several scenes: each one's number.
  scenes: z
    .array(z.union([z.number(), z.string()]))
    .nullable()
    .catch(null),
  request: z.string().nullable().catch(null),
  // An "outline" change to the story itself: developed again with it.
  story: z.boolean().nullable().catch(null),
  // The one character a "redraw" changes the look of, by name; or whose
  // new drawing a "choose" chooses.
  character: z.string().nullable().catch(null),
  // Which of the new drawings waiting a "choose" chooses, from 1; 0 keeps theirs.
  pick: z.union([z.number(), z.string()]).nullable().catch(null),
  // What of a change to a scene the stage cannot show, left out of it.
  cannot: z.string().nullable().catch(null),
  refuse: z.boolean().catch(false),
});

/** The table read: the rubric's scores, the overall, notes scene by scene, and lines anyone could say. */
export const studioTableReadSchema = z.object({
  scores: z.object(
    Object.fromEntries(
      RUBRIC_KEYS.map((key) => [key, z.number().nullable().catch(null)]),
    ) as Record<RubricKey, z.ZodCatch<z.ZodNullable<z.ZodNumber>>>,
  ),
  overall: z.number(),
  scenes: z.array(
    z.object({
      scene: z.number(),
      score: z.number(),
      notes: z.array(z.string()).catch([]),
    }),
  ),
  voice: z
    .array(
      z.object({
        scene: z.number(),
        who: z.string(),
        line: z.string(),
        why: z.string().catch(''),
      }),
    )
    .catch([]),
  verdict: z.string().catch(''),
});

/** The cold read: what a first-time viewer made of the opening. */
export const studioColdReadSchema = z.object({
  about: z.string().catch(''),
  sentence: z.string().catch(''),
  who: z.string().catch(''),
  wants: z.string().catch(''),
  obstacle: z.string().catch(''),
  stakes: z.string().catch(''),
  clock: z.string().catch(''),
  confused: z.array(z.string()).catch([]),
  // The questions the film means them to ask: never counted as confusion.
  wondering: z.array(z.string()).catch([]),
  sure: z.number().catch(0),
  // Who is who: each person seen, and what they are to the hero.
  people: z
    .array(z.object({ who: z.string(), is: z.string().catch('') }))
    .catch([]),
  // Anything impossible seen, and its rules as understood.
  impossible: z.string().catch(''),
});

/** The retelling: the whole film as a first-time viewer retells it, scene by scene with its join. */
export const studioRetellSchema = z.object({
  scenes: z
    .array(
      z.object({
        scene: z.number(),
        link: z.string().catch('and then'),
        what: z.string().catch(''),
      }),
    )
    .catch([]),
  finally: z.string().catch(''),
  about: z.string().catch(''),
});

/** Whether a scene made again as asked shows it: the check's verdict. */
export const studioCheckSchema = z.object({
  resolved: z.boolean().catch(false),
  reason: z.string().catch(''),
  tell: z.string().catch(''),
  faults: z.array(z.string()).catch([]),
});

/**
 * A person's look from the kit's lists, each field caught as the plain
 * choice when it is not one of them; a skin that is none caught as 0, for
 * the domain to choose by who they are (never one skin for everyone).
 */
const lenientFigure = z.object({
  age: z.enum(FIGURE_AGES).catch('adult'),
  build: z.enum(FIGURE_BUILDS).catch('average'),
  skin: z.number().catch(0),
  hair: z.enum(HAIR_STYLES).catch('short'),
  hairColour: z.enum(HAIR_COLOURS).catch('brown'),
  facialHair: z.enum(FACIAL_HAIR).catch('none'),
  headwear: z.enum(HEADWEAR).catch('none'),
  top: z.enum(TOPS).catch('jumper'),
  topColour: z.enum(CLOTH_COLOURS).catch('blue'),
  bottom: z.enum(BOTTOMS).catch('trousers'),
  bottomColour: z.enum(CLOTH_COLOURS).catch('navy'),
  accentColour: z.enum(CLOTH_COLOURS).catch('red'),
  extras: z.array(z.string()).catch([]),
});

/**
 * An animal's look from the animal kit's lists, each field caught as the
 * species' own when it is not one of them. Its species and colours are
 * words the domain reads (a puppy is a dog, "gray" is grey).
 */
const lenientAnimal = z.object({
  species: z.string().catch(''),
  build: z.enum(ANIMAL_BUILDS).catch('average'),
  size: z.enum(ANIMAL_SIZES).catch('medium'),
  coat: z.string().catch(''),
  second: z.string().nullable().catch(null),
  pattern: z.enum(ANIMAL_PATTERNS).catch('plain'),
  ears: z.enum(ANIMAL_EARS).nullable().catch(null),
  tail: z.enum(ANIMAL_TAILS).nullable().catch(null),
  mane: z.enum(ANIMAL_MANES).nullable().catch(null),
  horns: z.enum(ANIMAL_HORNS).nullable().catch(null),
  wear: z
    .object({
      neck: z.enum(NECK_WEAR).nullable().catch(null),
      back: z.enum(BACK_WEAR).nullable().catch(null),
      head: z.enum(HEAD_WEAR).nullable().catch(null),
      feet: z.enum(FEET_WEAR).nullable().catch(null),
    })
    .catch({ neck: null, back: null, head: null, feet: null }),
  wearColour: z.enum(CLOTH_COLOURS).nullable().catch(null),
});

/**
 * A creature's look from the creature kit's lists, each field caught as
 * the plain one when it is not one of them. Its body and colours are
 * words the domain reads ("boxy" is a box, "gray" is grey).
 */
const lenientCreature = z.object({
  body: z.string().catch(''),
  build: z.enum(CREATURE_BUILDS).catch('average'),
  size: z.enum(CREATURE_SIZES).catch('medium'),
  bodyColour: z.string().catch(''),
  texture: z.enum(CREATURE_TEXTURES).catch('none'),
  textureColour: z.string().nullable().catch(null),
  eyes: z.number().catch(2),
  nose: z.enum(CREATURE_NOSES).catch('none'),
  head: z.enum(CREATURE_HEADS).catch('none'),
  top: z.enum(CREATURE_TOPS).catch('none'),
  arms: z.enum(CREATURE_ARMS).catch('stick'),
  legs: z.enum(CREATURE_LEGS).catch('stick'),
  limbColour: z.string().nullable().catch(null),
  wings: z.enum(CREATURE_WINGS).catch('none'),
  tail: z.enum(CREATURE_TAILS).catch('none'),
  wear: z
    .object({
      neck: z.enum(CREATURE_NECK_WEAR).nullable().catch(null),
      body: z.enum(CREATURE_BODY_WEAR).nullable().catch(null),
      face: z.enum(CREATURE_FACE_WEAR).nullable().catch(null),
    })
    .catch({ neck: null, body: null, face: null }),
  wearColour: z.enum(CLOTH_COLOURS).nullable().catch(null),
});

export const studioBibleSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(STUDIO_KINDS).catch('person'),
      role: z.enum(STUDIO_ROLES).catch('supporting'),
      look: z.string().catch(''),
      figure: lenientFigure.nullable().catch(null),
      animal: lenientAnimal.nullable().catch(null),
      creature: lenientCreature.nullable().catch(null),
      size: z.enum(STORY_SIZES).nullable().catch(null),
      voice: z.enum(STUDIO_VOICES as [string, ...string[]]).catch('woman'),
      voicePick: z.number().catch(0),
      traits: z.array(z.string()).catch([]),
      carries: z
        .enum(THINGS as [string, ...string[]])
        .nullable()
        .catch(null),
    }),
  ),
  sets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      look: z.string().catch(''),
      kind: z.enum(PLACE_KINDS).catch('outdoor'),
      stand: z.enum(PLACE_STANDS).catch('on'),
      front: z.string().nullable().catch(null),
      sound: z.enum(SCENE_AMBIENCES).nullable().catch(null),
      features: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            // One none of the list's is the artist's to draw.
            kind: z.union([z.enum(FEATURE_KINDS), z.string()]).catch('drawn'),
            spot: z.enum([...SPOTS, 'back']).catch('back'),
            opens: z.boolean().catch(false),
          }),
        )
        .catch([]),
    }),
  ),
  world: z
    .object({
      era: z.string(),
      region: z.string(),
      culture: z.string(),
      landscape: z.string(),
      homes: z.string(),
    })
    .nullable(),
  subject: z.string(),
  maths: z.boolean(),
  pictures: z.array(
    z.object({ name: z.string(), is: z.string(), draw: z.string() }),
  ),
});

export const studioOutlineSchema = z.object({
  title: z.string(),
  logline: z.string(),
  scenes: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      set: z.string().nullable(),
      cast: z.array(z.string()),
      seconds: z.number(),
      teach: z.string().nullable(),
      points: z.array(z.string()),
      // An explainer made from a document: the pages it teaches, [first, last].
      pages: z.array(z.number()).nullable().catch(null),
    }),
  ),
});

/** Story development: the premise (studio-story.ts). */
export const studioPremiseSchema = z.object({
  title: z.string(),
  logline: z.string(),
  theme: z.string(),
  hook: z.string(),
  genre: z.enum(STUDIO_GENRES).catch('comedy'),
  ending: z.enum(STUDIO_ENDINGS).catch('happy'),
  stakes: z.string(),
  tools: z.array(z.string()).catch([]),
  gag: z.string().nullable().catch(null),
  clues: z.array(z.string()).catch([]),
  hero: z.string().catch(''),
  want: z.string().catch(''),
  obstacle: z.string().catch(''),
  clock: z.string().nullable().catch(null),
  normalDay: z.string().catch(''),
  whyToday: z.string().catch(''),
  whyCare: z.string().catch(''),
  oddity: z
    .object({ what: z.string(), rule: z.string().catch('') })
    .nullable()
    .catch(null),
  spine: z.array(z.string()).catch([]),
});

/** Story development: each character's personality, by id. */
export const studioCharactersSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      want: z.string(),
      need: z.string(),
      flaw: z.string(),
      fear: z.string(),
      personality: z.array(z.string()),
      voice: z.string(),
      habits: z.array(z.string()),
      relationships: z
        .array(
          z.object({ with: z.string(), is: z.string(), tension: z.string() }),
        )
        .catch([]),
      arc: z.object({ from: z.string(), to: z.string() }),
    }),
  ),
});

/** Story development: the beat sheet, each beat with its planned intensity. */
export const studioBeatsSchema = z.object({
  beats: z.array(
    z.object({
      role: z.enum(BEAT_ROLES).catch('attempt'),
      what: z.string(),
      wants: z.string(),
      stops: z.string(),
      changes: z.string(),
      intensity: z.number(),
      // Each plant with a short id; a payoff names the ids it pays.
      plants: z.array(z.object({ id: z.string(), what: z.string() })).catch([]),
      pays: z.array(z.string()).catch([]),
      // How it follows the beat before: "therefore" or "but"; null for the first.
      link: z.string().nullable().catch(null),
    }),
  ),
});

/** Story development: the scene plan, which the outline is built from. */
export const studioScenePlanSchema = z.object({
  scenes: z.array(
    z.object({
      title: z.string(),
      beats: z.array(z.number()).catch([]),
      purpose: z.string(),
      conflict: z.string(),
      turn: z.string(),
      shift: z.string(),
      moment: z.string(),
      set: z.string().nullable(),
      cast: z.array(z.string()),
      seconds: z.number(),
      summary: z.string(),
      // Scene 1: how each part of the setup reaches the viewer.
      setup: z
        .array(
          z.object({
            part: z.string(),
            how: z.string().catch('line'),
            by: z.string().nullable().catch(null),
            to: z.string().nullable().catch(null),
            what: z.string().catch(''),
          }),
        )
        .catch([]),
      value: z
        .object({ name: z.string(), from: z.string(), to: z.string() })
        .nullable()
        .catch(null),
      start: z.string().catch(''),
      link: z.string().nullable().catch(null),
    }),
  ),
});

export const studioSceneSchema = z.object({
  title: z.string(),
  set: z.string(),
  time: z.enum(STORY_TIMES).catch('day'),
  weather: z.enum(STORY_WEATHERS).catch('clear'),
  crowd: z.enum(STORY_CROWDS).catch('none'),
  mood: z.enum(SCENE_MOODS).catch('calm'),
  music: z.enum(SCENE_MUSIC).catch('calm'),
  transition: z.enum(TRANSITIONS).catch('cut'),
  onStage: z.array(
    z.object({
      who: z.string(),
      spot: z.enum(SPOTS).catch('centre'),
      pose: z.enum(STUDIO_POSES).catch('standing'),
      // The feature they sit or lie on, or are in: "bed", "bench".
      on: z.string().nullable().catch(null),
      face: z.enum(STUDIO_FACES).catch('neutral'),
      // A thing none of the list's may be the show's own: the domain holds
      // it to the scene's words.
      holding: z
        .union([z.enum(THINGS as [string, ...string[]]), z.string()])
        .nullable()
        .catch(null),
      // What they have on as it opens besides their usual clothes.
      wears: z.array(z.string()).nullable().catch(null),
      // How far back they stand, where it matters; the stage spreads the rest.
      depth: z.enum(SHEET_DEPTHS).nullable().catch(null),
    }),
  ),
  props: z.array(
    z.object({
      // A thing the stage has not got is left out by the domain, not failed here.
      prop: z.union([z.enum(STAGE_PROPS), z.string()]),
      near: z.string().nullable().catch(null),
    }),
  ),
  beats: z.array(
    z.object({
      kind: z.enum(BEAT_KINDS),
      who: z.string().nullable().catch(null),
      to: z.string().nullable().catch(null),
      say: z.string().catch(''),
      // The face shown: the kit's, or any of the rigged face's recipes.
      feeling: z
        .enum(SHEET_FEELINGS as [string, ...string[]])
        .nullable()
        .catch(null),
      // What a line's speaker feels beneath it, where they hide it.
      felt: z
        .enum(SHEET_FEELINGS as [string, ...string[]])
        .nullable()
        .catch(null),
      sign: z.enum(FIGURE_SIGNS).nullable().catch(null),
      // A doing none of the list is kept as written, for the domain to
      // read its words: never lost as nothing.
      do: z
        .union([z.enum(DOING_IDS), z.string()])
        .nullable()
        .catch(null),
      target: z.string().nullable().catch(null),
      thing: z
        .union([z.enum(THINGS as [string, ...string[]]), z.string()])
        .nullable()
        .catch(null),
      via: z.string().nullable().catch(null),
      prop: z
        .union([z.enum(STAGE_PROPS), z.string()])
        .nullable()
        .catch(null),
      spot: z.enum(SPOTS).nullable().catch(null),
      from: z.enum(LINE_FROMS).nullable().catch(null),
      // A line's aim: what it does to the one it is said to.
      aim: z.enum(LINE_AIMS).nullable().catch(null),
      pace: z
        .enum([...LINE_PACES, ...TRAVEL_PACES])
        .nullable()
        .catch(null),
      seconds: z.number().nullable().catch(null),
    }),
  ),
  camera: z
    .array(
      z.object({
        beat: z.number(),
        shot: z.enum(SHOTS).catch('wide'),
        on: z.string().nullable().catch(null),
        with: z.string().nullable().catch(null),
      }),
    )
    .catch([]),
});
