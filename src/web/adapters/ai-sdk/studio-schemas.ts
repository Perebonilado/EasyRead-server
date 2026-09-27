/**
 * The Studio's structured answers. Flat, every field present and null
 * where unused, because a model fills a flat shape more reliably than a
 * union; the domain makes each sound again whatever arrives.
 */
import { z } from 'zod';
import {
  BEAT_KINDS,
  SHOTS,
  SPOTS,
  STUDIO_AUDIENCES,
  STUDIO_POSES,
  STUDIO_FACES,
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
  'scene',
  'make',
  'episode',
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
      tone: z.enum(STUDIO_TONES).nullable().catch(null),
      setting: z.string().nullable().catch(null),
      characters: z.string().nullable().catch(null),
      include: z.string().nullable().catch(null),
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
    }),
  action: z.enum(STUDIO_ACTIONS).catch('none'),
  scene: z.union([z.number(), z.string()]).nullable().catch(null),
  // A change to several scenes: each one's number.
  scenes: z
    .array(z.union([z.number(), z.string()]))
    .nullable()
    .catch(null),
  request: z.string().nullable().catch(null),
  // What of a change to a scene the stage cannot show, left out of it.
  cannot: z.string().nullable().catch(null),
  refuse: z.boolean().catch(false),
});

/** Whether a scene made again as asked shows it: the check's verdict. */
export const studioCheckSchema = z.object({
  resolved: z.boolean().catch(false),
  reason: z.string().catch(''),
  tell: z.string().catch(''),
  faults: z.array(z.string()).catch([]),
});

/** A person's look from the kit's lists, each field caught as the plain choice when it is not one of them. */
const lenientFigure = z.object({
  age: z.enum(FIGURE_AGES).catch('adult'),
  build: z.enum(FIGURE_BUILDS).catch('average'),
  skin: z.number().catch(4),
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

export const studioBibleSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(STUDIO_KINDS).catch('person'),
      role: z.enum(STUDIO_ROLES).catch('supporting'),
      look: z.string().catch(''),
      figure: lenientFigure.nullable().catch(null),
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
      feeling: z.enum(STUDIO_FACES).nullable().catch(null),
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
