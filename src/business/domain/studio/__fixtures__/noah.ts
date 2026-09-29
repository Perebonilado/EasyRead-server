/**
 * The Noah case (studio-scenery-plan §8.6): a yard where Noah builds the
 * ark, its feature named "the half-built ark" but of the stage's
 * `vehicle` kind, so the stage draws it as its danfo bus. Built by code
 * with no model asked: the yard in the biblical-village pack, one and a
 * half frames wide, with Noah and his son Shem drawn by the figure kit
 * and standing on its floor near and far. For the picture check's tests,
 * and for one real look by the judge.
 */
import type {
  SceneDto,
  ScenePlaceDto,
  SceneThingDto,
} from '../../../../contracts';
import { PLAIN_FIGURE, drawFigure } from '../../scene-figure';
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

/**
 * The yard's scene: Noah by the ark, pointing at it, and Shem across the
 * yard at the back; one step, eight seconds, a film's.
 */
export function noahScene(): SceneDto {
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
  const ark = drawPiece('vehicle', 'the half-built ark');
  // The ark stands at the right, on the floor's back; its box from its frame.
  const [vx, vy, vw, vh] = ark.viewBox;
  const arkScale = 0.9;
  const arkFeet = floor.back + 40;
  const arkBox = {
    x: 1100 + vx * arkScale,
    y: arkFeet + vy * arkScale,
    w: vw * arkScale,
    h: vh * arkScale,
  };
  const places: Record<string, ScenePlaceDto> = {
    noah: { x: 820, y: 400, w: 190, h: 430, d: 0.62 },
    shem: { x: 330, y: 470, w: 130, h: 300, d: 0.2 },
  };
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
  return {
    version: 1,
    title: 'The ark yard',
    durationMs: 8000,
    settledMs: 7000,
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
        aspect: 190 / 430,
        states: noah.states,
        hidden: faces(noah.states),
      }),
      drawing('shem', shem.svg, {
        rig: true,
        aspect: 130 / 300,
        states: shem.states,
        hidden: faces(shem.states),
      }),
    ],
    steps: [
      {
        atMs: 0,
        layout: 'free',
        show: ['place-ark-yard', 'noah', 'shem'],
        arrows: [],
        enter: {},
        focus: 'noah',
        backdrop: 'place-ark-yard',
      },
    ],
    effects: [],
    stagings: {
      box: { w: 1600, h: 900, places: [places], bubbles: {} },
      wide: {
        w: 1600,
        h: 900,
        places: [
          {
            ...places,
            'place-ark-yard': { x: 0, y: 0, w: 1600, h: 900 },
          },
        ],
        bubbles: {},
      },
    },
    acting: {
      noah: { moves: [[600, 'point', 2600, 'f:ark']] },
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
          at: { box: arkBox, wide: arkBox },
          feet: { box: arkFeet, wide: arkFeet },
          way: {
            box: { x: 1100, y: arkFeet, k: 1 },
            wide: { x: 1100, y: arkFeet, k: 1 },
          },
        },
      ],
    },
  } as unknown as SceneDto;
}
