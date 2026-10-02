/**
 * The shot board's answer (explainer_shots; explainer-animation-tech
 * §4.1): a lesson scene's plan of shots, each a set, its information, its
 * camera and its life, every name from a closed list or the scene's
 * registry. Flat, as the Studio's answers are, and lenient field by
 * field: a value a little wrong is caught as nothing, never the whole
 * answer lost, and one bad item never loses its list. shot-check's planOf
 * makes every field sound again, and checkPlan and mendPlan hold it to
 * the rules.
 *
 * A chart's fields are the scene writer's own (infographicFields, and
 * its chart, plot, timeline and flow), so the readers each kind already
 * has read them; a name card is not among them: a person is shown by a
 * verified portrait or a trace of them, never a card of their name.
 * Actors are kit pieces (kit/registry), each setting a field of its own
 * (the kit's settings are closed lists; code reads each as the nearest).
 */
import { z } from 'zod';
import {
  AMOUNTS,
  CAMERA_MOVES,
  CHART_KINDS,
  INFO_RECIPES,
  LIFE_EFFECTS,
  SET_KINDS,
  SET_CLIMATES,
  SET_LANDS,
  SET_PLACES,
  SET_STATES,
  SET_TIMES,
  SET_TOWNS,
  SET_WEATHERS,
  SHOT_JOINS,
} from '../../../business/domain/shots/shot-lists';
import { infographicFields } from './schemas';

const words = () => z.string().catch('');
const maybe = () => z.string().nullable().catch(null);
const looseNumber = () =>
  z.union([z.number(), z.string()]).nullable().catch(null);
const oneOf = <T extends string>(list: readonly T[]) =>
  z
    .enum(list as unknown as [T, ...T[]])
    .nullable()
    .catch(null);

/** Every kind's fields but the name card's. */
const { namecard: _namecard, ...kindFields } = infographicFields;
void _namecard;

/** A chart: its kind, and that kind's own fields (the others null). */
export const shotChartSchema = z
  .object({
    kind: oneOf(CHART_KINDS),
    ...kindFields,
    chart: z
      .object({
        kind: z.enum(['bar', 'line']).catch('bar'),
        unit: maybe(),
        bars: z
          .array(z.object({ label: words(), value: looseNumber() }))
          .catch([]),
      })
      .nullable()
      .catch(null),
    plot: z
      .object({
        fn: words(),
        xFrom: z.number().catch(0),
        xTo: z.number().catch(1),
        yFrom: z.number().nullable().catch(null),
        yTo: z.number().nullable().catch(null),
        xLabel: maybe(),
        yLabel: maybe(),
        points: z
          .array(z.object({ x: z.number().catch(0), name: words() }))
          .nullable()
          .catch(null),
      })
      .nullable()
      .catch(null),
    timeline: z
      .array(z.object({ when: words(), name: words() }))
      .nullable()
      .catch(null),
    flow: z
      .object({
        direction: z.enum(['down', 'across', 'cycle']).nullable().catch(null),
        nodes: z
          .array(
            z.object({
              label: words(),
              kind: z
                .enum(['step', 'decision', 'start', 'end'])
                .nullable()
                .catch(null),
            }),
          )
          .catch([]),
        edges: z
          .array(z.object({ from: words(), to: words(), label: maybe() }))
          .nullable()
          .catch(null),
      })
      .nullable()
      .catch(null),
    quote: z
      .object({
        text: maybe(),
        speaker: maybe(),
        when: maybe(),
        claim: maybe(),
      })
      .nullable()
      .catch(null),
  })
  .nullable()
  .catch(null);

/** A shot's set: its kind, and the fields of that kind (the others null). Blank paper is never offered. */
export const shotSetSchema = z.object({
  kind: oneOf(SET_KINDS.filter((k) => k !== 'plain')),
  // A map: the show's own; flat or tilted, with its terrain or not.
  tilt: oneOf(['flat', 'tilted'] as const),
  terrain: z.boolean().nullable().catch(null),
  // A portrait, a photo or a document: its name in the list.
  target: maybe(),
  chart: shotChartSchema,
  // A drawn set: a kind of place, never a named one.
  land: oneOf(SET_LANDS),
  time: oneOf(SET_TIMES),
  weather: oneOf(SET_WEATHERS),
  town: oneOf(SET_TOWNS),
  era: maybe(),
  place: oneOf(SET_PLACES),
  climate: oneOf(SET_CLIMATES),
  // The light changing while the shot is on, and the exact words it changes on.
  becomes: oneOf(SET_STATES),
  becomesOn: maybe(),
  // It stands for a real event: it carries an "Illustration" tag.
  illustration: z.boolean().nullable().catch(null),
});

export const shotInfoSchema = z.object({
  recipe: oneOf(INFO_RECIPES),
  target: maybe(),
  to: maybe(),
  on: words(),
  until: maybe(),
  text: maybe(),
  colour: maybe(),
});

export const shotCameraSchema = z.object({
  move: oneOf(CAMERA_MOVES),
  target: maybe(),
  on: words(),
  amount: oneOf(AMOUNTS),
});

/** A kit piece on the set: its id, where it stands, its side, its settings, its moves on their words. */
export const shotActorSchema = z.object({
  id: words(),
  kit: maybe(),
  place: maybe(),
  side: maybe(),
  pose: maybe(),
  kind: maybe(),
  count: looseNumber(),
  era: maybe(),
  who: maybe(),
  dress: maybe(),
  facing: maybe(),
  wagons: looseNumber(),
  // An illustrated show's characters: their role, face, what they hold, and a named person's name.
  role: maybe(),
  expression: maybe(),
  prop: maybe(),
  name: maybe(),
  moves: z
    .array(z.object({ move: words(), on: words(), to: maybe() }))
    .catch([]),
});

export const shotBoardSchema = z.object({
  shots: z
    .array(
      z.object({
        on: words(),
        set: shotSetSchema,
        actors: z.array(shotActorSchema).catch([]),
        info: z.array(shotInfoSchema).catch([]),
        camera: z.array(shotCameraSchema).catch([]),
        life: z.array(oneOf(LIFE_EFFECTS)).catch([]),
        join: oneOf(SHOT_JOINS),
        focal: maybe(),
        eyes: z
          .array(z.object({ at: maybe(), to: maybe(), face: maybe() }))
          .catch([]),
      }),
    )
    .catch([]),
});
