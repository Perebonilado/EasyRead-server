/**
 * A three-scene continuous build (studio-explainer-plan, part C), for the
 * tests and the board lab: the water cycle, one diagram that grows from
 * the sun and the sea to the rain running back to it. Written by hand, as
 * the writer would; no model is asked.
 */
import type {
  ExplainerSheet,
  OutlineScene,
  StudioPicture,
} from '../studio/studio';

type Cast = ExplainerSheet['draft']['cast'][number];
type Step = ExplainerSheet['draft']['steps'][number];

const drawing = (
  id: string,
  name: string,
  brief: string,
  shape: Cast['shape'] = 'square',
): Cast => ({
  id,
  kind: 'drawing',
  name,
  brief,
  motion: null,
  parts: null,
  states: null,
  shape,
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  timeline: null,
  chart: null,
});

const step = (
  beat: number,
  phrase: string,
  show: string[] | null,
  arrows: [string, string, string | null][] = [],
  effects: Step['effects'] = null,
): Step => ({
  beat,
  phrase,
  layout: show ? 'row' : null,
  show,
  arrows: show
    ? arrows.map(([from, to, label]) => ({ from, to, label, flow: true }))
    : null,
  effects,
});

const sheet = (
  title: string,
  beats: [string, ExplainerSheet['draft']['beats'][number]['delivery']][],
  cast: Cast[],
  steps: Step[],
): ExplainerSheet => ({
  kind: 'explainer',
  title,
  transition: 'cut',
  draft: {
    fit: 'good',
    fitReason: null,
    title,
    mood: 'curious',
    beats: beats.map(([say, delivery]) => ({
      say,
      pause: 'short',
      delivery,
    })),
    cast,
    steps,
  },
});

export const WATER_PICTURES: StudioPicture[] = [
  { name: 'sun', is: 'the star that heats the Earth', draw: 'a yellow disc' },
  { name: 'sea', is: 'the ocean', draw: 'blue waves' },
  { name: 'water vapour', is: 'water as a gas', draw: 'rising wisps' },
  { name: 'cloud', is: 'tiny drops together', draw: 'a white cloud' },
  { name: 'rain', is: 'drops falling', draw: 'falling drops' },
  { name: 'river', is: 'water running to the sea', draw: 'a winding river' },
];

export const WATER_OUTLINE: OutlineScene[] = [
  {
    title: 'The sun warms the sea',
    summary: 'The sun heats the sea and water rises as water vapour.',
    set: null,
    cast: [],
    seconds: 20,
    teach: 'The sun heats the sea; warm water evaporates into water vapour.',
    points: ['sun and sea', 'evaporation into water vapour'],
    build: 'start',
  },
  {
    title: 'Vapour becomes a cloud',
    summary: 'Water vapour cools high up and condenses into a cloud.',
    set: null,
    cast: [],
    seconds: 20,
    teach:
      'Water vapour rising from the sea cools, turns to drops and makes a cloud.',
    points: ['water vapour cools', 'condensation into a cloud'],
    build: 'continue',
  },
  {
    title: 'Rain runs back to the sea',
    summary:
      'The cloud drops rain, rivers carry it to the sea, the sun starts again.',
    set: null,
    cast: [],
    seconds: 24,
    teach: 'Rain falls from the cloud, runs into a river and back to the sea.',
    points: ['rain from the cloud', 'river to the sea', 'the cycle again'],
    build: 'continue',
  },
];

export const WATER_SHEETS: ExplainerSheet[] = [
  sheet(
    'The sun warms the sea',
    [
      ['Where does rain come from?', 'hook'],
      ['It starts with the sun shining on the sea.', 'explain'],
      ["The sun's heat warms the water at the surface.", 'explain'],
      ['Warm water rises into the air as water vapour.', 'key'],
      ['We call this evaporation.', 'explain'],
    ],
    [
      drawing('sun', 'Sun', 'a round yellow sun with short rays', 'square'),
      drawing('sea', 'Sea', 'blue sea waves seen from the side', 'wide'),
      drawing('vapour', 'Water vapour', 'wavy wisps rising upward'),
    ],
    [
      step(1, 'the sun', ['sun']),
      step(1, 'the sea', ['sun', 'sea'], [['sun', 'sea', 'heat']]),
      step(2, 'warms the water', null, [], [{ target: 'sea', do: 'pulse' }]),
      step(
        3,
        'as water vapour',
        ['sun', 'sea', 'vapour'],
        [
          ['sun', 'sea', 'heat'],
          ['sea', 'vapour', 'evaporation'],
        ],
      ),
    ],
  ),
  sheet(
    'Vapour becomes a cloud',
    [
      ['High in the sky, the air is cold.', 'explain'],
      ['The water vapour cools and turns into tiny drops.', 'explain'],
      ['Millions of drops crowd together and make a cloud.', 'key'],
      ['We call this condensation.', 'explain'],
      ['The cloud grows heavy and grey.', 'explain'],
    ],
    [
      drawing('wisps', 'Water vapour', 'wavy wisps rising upward'),
      drawing(
        'drops',
        'Tiny drops',
        'a cluster of small water drops',
        'square',
      ),
      drawing('cloud', 'Cloud', 'a fluffy white cloud', 'wide'),
    ],
    [
      step(1, 'The water vapour', ['wisps']),
      step(1, 'tiny drops', ['wisps', 'drops'], [['wisps', 'drops', 'cools']]),
      step(
        2,
        'make a cloud',
        ['wisps', 'drops', 'cloud'],
        [['drops', 'cloud', 'condensation']],
      ),
      step(4, 'grows heavy', null, [], [{ target: 'cloud', do: 'pulse' }]),
    ],
  ),
  sheet(
    'Rain runs back to the sea',
    [
      ['When the drops get too heavy, they fall as rain.', 'explain'],
      ['Rain runs down the hills into a river.', 'explain'],
      ['The river carries the water back to the sea.', 'key'],
      ['Then the sun warms the sea again.', 'explain'],
      [
        'Evaporation, condensation, rain and rivers: the water cycle goes round and round.',
        'recap',
      ],
    ],
    [
      drawing('cloud', 'Cloud', 'a fluffy white cloud', 'wide'),
      drawing('rain', 'Rain', 'blue raindrops falling in lines'),
      drawing(
        'river',
        'River',
        'a winding blue river between green hills',
        'wide',
      ),
      drawing('sea', 'Sea', 'blue sea waves seen from the side', 'wide'),
    ],
    [
      step(0, 'fall as rain', ['cloud', 'rain'], [['cloud', 'rain', 'rain']]),
      step(1, 'into a river', ['rain', 'river'], [['rain', 'river', null]]),
      step(2, 'back to the sea', ['river', 'sea'], [['river', 'sea', 'back']]),
    ],
  ),
];
