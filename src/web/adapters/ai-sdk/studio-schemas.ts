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
  STUDIO_DOINGS,
  STUDIO_FACES,
  STUDIO_FORMATS,
  STUDIO_KINDS,
  STUDIO_ROLES,
  STUDIO_TONES,
  STUDIO_VOICES,
  TRANSITIONS,
} from '../../../business/domain/studio/studio';
import { PROP_ACTIONS } from '../../../business/domain/scene-directions';
import { STAGE_PROPS } from '../../../business/domain/scene-props';
import {
  FIGURE_POSES,
  FIGURE_PROPS,
  FIGURE_SIGNS,
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
import { figureSchema } from './schemas';

export const STUDIO_ACTIONS = [
  'none',
  'outline',
  'approve',
  'cast',
  'scene',
  'make',
  'episode',
] as const;

export const studioTurnSchema = z.object({
  reply: z.string(),
  choices: z.array(z.string()),
  brief: z.object({
    format: z.enum(STUDIO_FORMATS).nullable(),
    idea: z.string().nullable(),
    audience: z.enum(STUDIO_AUDIENCES).nullable(),
    minutes: z.number().nullable(),
    tone: z.enum(STUDIO_TONES).nullable(),
    setting: z.string().nullable(),
    characters: z.string().nullable(),
    include: z.string().nullable(),
  }),
  action: z.enum(STUDIO_ACTIONS),
  scene: z.number().int().nullable(),
  request: z.string().nullable(),
  refuse: z.boolean(),
});

export const studioBibleSchema = z.object({
  characters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(STUDIO_KINDS),
      role: z.enum(STUDIO_ROLES),
      look: z.string(),
      figure: figureSchema.nullable(),
      size: z.enum(STORY_SIZES).nullable(),
      voice: z.enum(STUDIO_VOICES as [string, ...string[]]),
      voicePick: z.number().int(),
      traits: z.array(z.string()),
      carries: z.enum(FIGURE_PROPS).nullable(),
    }),
  ),
  sets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      look: z.string(),
      kind: z.enum(PLACE_KINDS),
      stand: z.enum(PLACE_STANDS),
      front: z.string().nullable(),
      sound: z.enum(SCENE_AMBIENCES).nullable(),
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
  time: z.enum(STORY_TIMES),
  weather: z.enum(STORY_WEATHERS),
  crowd: z.enum(STORY_CROWDS),
  mood: z.enum(SCENE_MOODS),
  music: z.enum(SCENE_MUSIC),
  transition: z.enum(TRANSITIONS),
  onStage: z.array(
    z.object({
      who: z.string(),
      spot: z.enum(SPOTS),
      pose: z.enum(FIGURE_POSES),
      face: z.enum(STUDIO_FACES),
      holding: z.enum(FIGURE_PROPS).nullable(),
    }),
  ),
  props: z.array(
    z.object({ prop: z.enum(STAGE_PROPS), near: z.string().nullable() }),
  ),
  beats: z.array(
    z.object({
      kind: z.enum(BEAT_KINDS),
      who: z.string().nullable(),
      to: z.string().nullable(),
      say: z.string(),
      feeling: z.enum(STUDIO_FACES).nullable(),
      sign: z.enum(FIGURE_SIGNS).nullable(),
      do: z.enum([...STUDIO_DOINGS, ...PROP_ACTIONS]).nullable(),
      prop: z.enum(STAGE_PROPS).nullable(),
      spot: z.enum(SPOTS).nullable(),
      from: z.enum(LINE_FROMS).nullable(),
      pace: z.enum(LINE_PACES).nullable(),
      seconds: z.number().nullable(),
    }),
  ),
  camera: z.array(
    z.object({
      beat: z.number().int(),
      shot: z.enum(SHOTS),
      on: z.string().nullable(),
      with: z.string().nullable(),
    }),
  ),
});
