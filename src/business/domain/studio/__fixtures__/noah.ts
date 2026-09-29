/**
 * The Noah case (studio-scenery-plan §8.6): a yard where Noah builds the
 * ark, its feature named "the half-built ark" but of the stage's
 * `vehicle` kind, so the stage draws it as its danfo bus. Built by code
 * with no model asked: the yard in the biblical-village pack, one and a
 * half frames wide, with Noah and his son Shem drawn by the figure kit
 * and standing on its floor near and far, each where the stage's own
 * stations put them (their feet on the floor at their depth, their box
 * their drawing's shape), and the ark where the stage stands a vehicle. For the picture check's tests,
 * and for one real look by the judge.
 */
import type {
  SceneDto,
  ScenePlaceDto,
  SceneThingDto,
} from '../../../../contracts';
import { PLAIN_FIGURE, drawFigure } from '../../scene-figure';
import {
  STAGINGS,
  SOLID_BESIDE,
  layoutStations,
  placeFeature,
  stationScale,
  type LaidThing,
} from '../../scene-layout';
import { floorOf, buildSet, layoutOf } from '../../scene-set-layout';
import { drawPiece } from '../../scene-set-pieces';
import type { StoryPlace } from '../../scene-story';

export const NOAH_YARD: StoryPlace = {
  id: 'ark-yard',
  name: 'The ark yard',
  aliases: [],
  look: 'a dusty yard outside the village where Noah builds the ark',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [
    { id: 'ark', name: 'the half-built ark', kind: 'vehicle', spot: 'right' },
  ],
};

/** Who is on the stage, as the sheet has them: for the claims. */
export const NOAH_CAST = [
  { id: 'noah', name: 'Noah', look: 'an old man with a white beard' },
  { id: 'shem', name: 'Shem', look: "Noah's young son" },
];

const drawing = (
  id: string,
  svg: string,
  patch: Partial<Extract<SceneThingDto, { kind: 'drawing' }>> = {},
): SceneThingDto => ({
  id,
  kind: 'drawing',
  svg,
  aspect: 1,
  caption: null,
  parts: {},
  labels: {},
  states: {},
  hidden: [],
  moves: false,
  ...patch,
});

/** Every face but the one they wear at rest: hidden until an effect shows it. */
const faces = (states: Record<string, string>) =>
  Object.entries(states).flatMap(([name, id]) =>
    name === 'neutral' ? [] : [id],
  );

/** Where each stands at each step: a station, and how far back where the floor is open. */
export type NoahStep = {
  atMs: number;
  at: Record<string, string>;
  depth?: Record<string, number>;
};

/** The yard's first step: Noah near the ark, Shem across the yard at the back. */
export const NOAH_FIRST: NoahStep = {
  atMs: 0,
  at: { noah: '@0.45', shem: '@0.2' },
  depth: { noah: 0.62, shem: 0.2 },
};

/**
 * The yard's scene: Noah by the ark, pointing at it, and Shem across the
 * yard at the back; one step, eight seconds, a film's. `more`: steps
 * after the first, as the stage stations them (Shem going to the ark:
 * "by:ark:1").
 */
export function noahScene(more: readonly NoahStep[] = []): SceneDto {
  const layout = layoutOf(
    {
      sky: 'day',
      ground: 'sand',
      backdrop: 'hills',
      items: [
        { kind: 'palm', x: 0.1, row: 'back', scale: 1 },
        { kind: 'house', x: 0.35, row: 'far', scale: 1 },
      ],
      own: [],
      focal: { x: 0.62, feature: 'ark', words: 'at the ark' },
    },
    NOAH_YARD,
    {
      era: 'ancient, BC',
      region: 'Mesopotamia',
      culture: '',
      landscape: 'dry plain',
      homes: 'mud-brick houses',
    },
  );
  const set = buildSet(layout, NOAH_YARD);
  const floor = floorOf('outdoor');
  const noah = drawFigure(
    {
      ...PLAIN_FIGURE,
      age: 'elder',
      hair: 'balding',
      hairColour: 'white',
      facialHair: 'beard',
    },
    'noah',
  );
  const shem = drawFigure({ ...PLAIN_FIGURE, age: 'teen' }, 'shem');
  const aspectOf = (box: [number, number, number, number]) => box[2] / box[3];
  const people = new Map<string, LaidThing>([
    [
      'noah',
      {
        kind: 'drawing',
        aspect: aspectOf(noah.viewBox),
        caption: null,
        stands: { units: noah.viewBox[3] },
      },
    ],
    [
      'shem',
      {
        kind: 'drawing',
        aspect: aspectOf(shem.viewBox),
        caption: null,
        stands: { units: shem.viewBox[3] },
      },
    ],
  ]);
  // The people's scale and floor, as the stage has them on its wide stage:
  // the floor's depth by the set's own eye line.
  const scale = stationScale([...people.values()], 2, 'wide');
  const unit = scale.unit!;
  const eye = floor.eye;
  const bottom = STAGINGS.wide.h - 12;
  // The ark where the stage stands a vehicle: at the back, at the right.
  const ark = drawPiece('vehicle', 'the half-built ark');
  const arkAt = placeFeature({
    staging: 'wide',
    spot: 'right',
    piece: ark,
    back: true,
    unit,
    floor: scale.floor,
    horizon: eye,
  });
  const arkBox = { x: arkAt.x, y: arkAt.y, w: arkAt.w, h: arkAt.h };
  const steps = [NOAH_FIRST, ...more];
  const laid = layoutStations({
    steps: steps.map((step) => ({
      show: ['noah', 'shem'],
      at: step.at,
      ...(step.depth ? { depth: step.depth } : {}),
    })),
    things: people,
    staging: 'wide',
    scale,
    floor: { eye, bottom },
    features: new Map([
      [
        'ark',
        {
          x: arkAt.x + arkAt.w / 2,
          w: arkAt.w,
          way: {
            y: arkAt.way.y,
            k: arkAt.way.k,
            perch: arkAt.up.perch,
            upX: arkAt.up.x,
            ground: arkAt.feet,
          },
          ...(SOLID_BESIDE.has('vehicle') ? { solid: true } : {}),
        },
      ],
    ]),
  });
  const placesAt = laid.map(
    (step) =>
      Object.fromEntries(
        Object.entries(step).map(([id, p]) => [
          id,
          {
            x: p.x,
            y: p.y,
            w: p.w,
            h: p.h,
            ...(p.d !== undefined ? { d: p.d } : {}),
          },
        ]),
      ) as Record<string, ScenePlaceDto>,
  );
  const beats = [
    {
      text: 'Noah points at the ark he is building.',
      startMs: 600,
      endMs: 3200,
      words: [],
    },
    {
      text: 'Shem watches from across the yard.',
      startMs: 3400,
      endMs: 6200,
      words: [],
    },
  ];
  const durationMs = Math.max(8000, ...more.map((s) => s.atMs + 4000));
  return {
    version: 1,
    title: 'The ark yard',
    durationMs,
    settledMs: durationMs - 1000,
    beats,
    things: [
      drawing('place-ark-yard', set.svg, {
        backdrop: true,
        layers: set.layered.layers.map((one) => ({ ...one })),
        setWidth: set.layered.width,
        ...(set.layered.focal !== undefined
          ? { focal: set.layered.focal }
          : {}),
        floor: [floor.back, floor.front],
      }),
      drawing('noah', noah.svg, {
        rig: true,
        aspect: aspectOf(noah.viewBox),
        states: noah.states,
        hidden: faces(noah.states),
      }),
      drawing('shem', shem.svg, {
        rig: true,
        aspect: aspectOf(shem.viewBox),
        states: shem.states,
        hidden: faces(shem.states),
      }),
    ],
    steps: steps.map((step) => ({
      atMs: step.atMs,
      layout: 'free',
      show: ['place-ark-yard', 'noah', 'shem'],
      arrows: [],
      enter: {},
      focus: 'noah',
      backdrop: 'place-ark-yard',
    })),
    effects: [],
    stagings: {
      box: { w: 1600, h: 900, places: placesAt, bubbles: {} },
      wide: {
        w: 1600,
        h: 900,
        places: placesAt.map((places) => ({
          ...places,
          'place-ark-yard': { x: 0, y: 0, w: 1600, h: 900 },
        })),
        bubbles: {},
      },
    },
    acting: {
      noah: { moves: [[600, 'point', 2600, 'f:ark']] },
      ...(more.length ? { shem: { walks: true } } : {}),
    },
    setting: {
      full: true,
      film: true,
      features: [
        {
          id: 'ark',
          name: 'the half-built ark',
          kind: 'vehicle',
          svg: ark.svg,
          ...(ark.leaf ? { leaf: ark.leaf } : {}),
          at: { box: arkBox, wide: arkBox },
          feet: { box: arkAt.feet, wide: arkAt.feet },
          way: { box: arkAt.way, wide: arkAt.way },
        },
      ],
    },
  } as unknown as SceneDto;
}
