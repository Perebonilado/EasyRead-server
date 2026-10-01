/**
 * The editor's desk's structured answers (infographic-editor-plan §3).
 * Flat, as the Studio's are, and lenient field by field: a value a little
 * wrong is caught as nothing, never the whole answer lost, and one bad
 * item never loses its list; the domain makes every field sound again
 * (studio-editor, studio-editorial).
 */
import { z } from 'zod';
import {
  CLAIM_KINDS,
  CONFIDENCES,
  CHAIN_LINKS,
  ERAS,
  ITEM_DECISIONS,
  LOOK_KINDS,
  PALETTE_TOKENS,
  WORLD_PLACE_KINDS,
} from '../../../business/domain/studio/studio-editor';
import {
  FACT_VERDICTS,
  HOOK_KINDS,
  ROW_VISUALS,
} from '../../../business/domain/studio/studio-editorial';
import { STUDIO_VOICES } from '../../../business/domain/studio/studio';
import {
  SCENE_DELIVERIES,
  SCENE_MUSIC,
} from '../../../business/domain/scene-script';
import { STORY_TIMES } from '../../../business/domain/scene-story';
import {
  BOTTOMS,
  CLOTH_COLOURS,
  FACIAL_HAIR,
  FIGURE_AGES,
  FIGURE_BUILDS,
  FIGURE_EXTRAS,
  HAIR_COLOURS,
  HAIR_STYLES,
  HEADWEAR,
  TOPS,
} from '../../../business/domain/scene-figure';

const words = () => z.string().catch('');
const ids = () => z.array(z.string().catch('')).catch([]);
const sources = () =>
  z
    .array(
      z.object({ url: words(), title: words() }).catch({ url: '', title: '' }),
    )
    .catch([]);

export const editorAnglesSchema = z.object({
  takeaway: z.string().nullable().catch(null),
  notThis: z.array(words()).catch([]),
  angles: z
    .array(
      z.object({
        question: words(),
        pitch: words(),
        scores: z
          .object({
            gap: z.number().catch(3),
            tension: z.number().catch(3),
            visual: z.number().catch(3),
            payoff: z.number().catch(3),
          })
          .catch({ gap: 3, tension: 3, visual: 3, payoff: 3 }),
        verdict: words(),
      }),
    )
    .catch([]),
});

export const editorResearchSchema = z.object({
  claims: z
    .array(
      z.object({
        id: words(),
        text: words(),
        kind: z.enum(CLAIM_KINDS).catch('claim'),
        confidence: z.enum(CONFIDENCES).catch('medium'),
        sources: sources(),
        visual: words(),
        contested: z.boolean().catch(false),
        who: z.string().nullable().catch(null),
      }),
    )
    .catch([]),
  timeline: z
    .array(z.object({ date: words(), event: words(), claims: ids() }))
    .catch([]),
  numbers: z
    .array(z.object({ label: words(), value: words(), claims: ids() }))
    .catch([]),
  myths: z
    .array(
      z.object({
        belief: words(),
        truth: words(),
        handle: words(),
        claims: ids(),
      }),
    )
    .catch([]),
  perspectives: z
    .array(z.object({ side: words(), view: words(), claims: ids() }))
    .catch([]),
  looks: z
    .array(
      z.object({
        subject: words(),
        kind: z.enum(LOOK_KINDS).catch('object'),
        description: words(),
        claims: ids(),
      }),
    )
    .catch([]),
  pronunciations: z.array(z.object({ word: words(), say: words() })).catch([]),
  open: z.array(words()).catch([]),
});

export const editorFactsSchema = z.object({
  checks: z
    .array(
      z.object({
        claim: words(),
        verdict: z.enum(FACT_VERDICTS).catch('verified'),
        note: words(),
        rewrites: z
          .array(z.object({ row: z.number().catch(-1), say: words() }))
          .catch([]),
        sources: sources(),
      }),
    )
    .catch([]),
});

export const editorPlanSchema = z.object({
  spine: z.array(words()).catch([]),
  chain: z
    .array(
      z.object({
        beat: words(),
        link: z.enum(CHAIN_LINKS).nullable().catch(null),
      }),
    )
    .catch([]),
  items: z
    .array(
      z.object({
        item: words(),
        claims: ids(),
        moves: z.boolean().catch(false),
        setsUp: z.boolean().catch(false),
        visual: z.boolean().catch(false),
        surprise: z.boolean().catch(false),
        decision: z.enum(ITEM_DECISIONS).catch('keep'),
        episode: z.number().nullable().catch(null),
        seconds: z.number().catch(20),
        reason: words(),
      }),
    )
    .catch([]),
  cast: z
    .array(
      z.object({
        name: words(),
        force: words(),
        recurring: z.boolean().catch(true),
        claims: ids(),
      }),
    )
    .catch([]),
  fairness: z.array(words()).catch([]),
  episodes: z
    .array(
      z.object({
        title: words(),
        question: words(),
        covers: z.array(z.number().catch(-1)).catch([]),
        plants: z
          .array(
            z.object({
              id: words(),
              text: words(),
              paidIn: z.number().catch(1),
            }),
          )
          .catch([]),
        endsOn: words(),
      }),
    )
    .catch([]),
  leftOut: z.array(words()).catch([]),
});

/** A person as the kit draws them: every field from its list, null for what the research does not say. */
const editorFigure = z
  .object({
    age: z.enum(FIGURE_AGES).nullable().catch(null),
    build: z.enum(FIGURE_BUILDS).nullable().catch(null),
    skin: z.number().nullable().catch(null),
    hair: z.enum(HAIR_STYLES).nullable().catch(null),
    hairColour: z.enum(HAIR_COLOURS).nullable().catch(null),
    facialHair: z.enum(FACIAL_HAIR).nullable().catch(null),
    headwear: z.enum(HEADWEAR).nullable().catch(null),
    top: z.enum(TOPS).nullable().catch(null),
    topColour: z.enum(CLOTH_COLOURS).nullable().catch(null),
    bottom: z.enum(BOTTOMS).nullable().catch(null),
    bottomColour: z.enum(CLOTH_COLOURS).nullable().catch(null),
    accentColour: z.enum(CLOTH_COLOURS).nullable().catch(null),
    extras: z.array(z.enum(FIGURE_EXTRAS)).nullable().catch(null),
  })
  .nullable()
  .catch(null);

export const editorWorldSchema = z.object({
  subject: words(),
  maths: z.boolean().catch(false),
  era: z.enum(ERAS).catch('today'),
  region: z.string().nullable().catch(null),
  palette: z
    .array(
      z.object({
        thing: words(),
        token: z.enum(PALETTE_TOKENS).nullable().catch(null),
      }),
    )
    .catch([]),
  held: z
    .object({
      token: z.enum(PALETTE_TOKENS).nullable().catch(null),
      for: words(),
    })
    .nullable()
    .catch(null),
  legend: words(),
  picture: words(),
  map: z
    .object({
      region: words(),
      groups: z
        .array(
          z.object({
            name: words(),
            members: z.array(words()).catch([]),
            colour: z.enum(PALETTE_TOKENS).nullable().catch(null),
          }),
        )
        .catch([]),
      seams: z
        .array(
          z.object({
            between: z.array(words()).catch([]),
            style: z.enum(['dashed', 'glow']).nullable().catch(null),
            name: z.string().nullable().catch(null),
          }),
        )
        .catch([]),
      year: z.number().nullable().catch(null),
      bordersDiffer: z.boolean().nullable().catch(null),
    })
    .nullable()
    .catch(null),
  places: z
    .array(
      z.object({
        name: words(),
        kind: z.enum(WORLD_PLACE_KINDS).catch('street'),
        look: words(),
        time: z.enum(STORY_TIMES).catch('day'),
        claims: ids(),
      }),
    )
    .catch([]),
  people: z
    .array(
      z.object({
        name: words(),
        role: words(),
        likeness: words(),
        recurring: z.boolean().catch(true),
        voice: z
          .enum(STUDIO_VOICES as unknown as [string, ...string[]])
          .nullable()
          .catch(null),
        figure: editorFigure,
        claims: ids(),
      }),
    )
    .catch([]),
  things: z.array(z.object({ name: words(), look: words() })).catch([]),
});

export const editorBeatsSchema = z.object({
  acts: z
    .array(
      z.object({
        title: words(),
        job: words(),
        seconds: z.number().catch(60),
        rehook: words(),
        plants: ids(),
        payoffs: ids(),
        grave: z.boolean().catch(false),
      }),
    )
    .catch([]),
});

export const editorHooksSchema = z.object({
  hooks: z
    .array(
      z.object({
        text: words(),
        kind: z.enum(HOOK_KINDS).catch('question'),
        verdict: words(),
        claims: ids(),
      }),
    )
    .catch([]),
  hook: words(),
  claims: ids(),
});

export const editorScriptSchema = z.object({
  rows: z
    .array(
      z.object({
        say: words(),
        visual: z.enum(ROW_VISUALS).catch('why'),
        show: words(),
        claims: ids(),
        act: z.number().catch(1),
        plant: z.string().nullable().catch(null),
        payoff: z.string().nullable().catch(null),
        delivery: z.enum(SCENE_DELIVERIES).catch('explain'),
        music: z.enum(SCENE_MUSIC).nullable().catch(null),
        hold: z.boolean().catch(false),
      }),
    )
    .catch([]),
});

export const editorReadSchema = z.object({
  notes: z.array(words()).catch([]),
});

export const editorPackageSchema = z.object({
  titles: z.array(z.object({ text: words(), verdict: words() })).catch([]),
  title: words(),
  thumbnail: z
    .object({ words: words(), row: z.number().nullable().catch(null) })
    .catch({ words: '', row: null }),
  description: words(),
  pinned: words(),
  hashtags: z.array(words()).catch([]),
  leftOut: words(),
});
