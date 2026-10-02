/**
 * Sample scenes of the life layer for the client's /dev/shots lab, made
 * through the real path a scene of shots takes (shot-build with its life
 * defaults, shot-time, shot-sound), in both shapes. Open each with
 * `&life=0` beside it for the before.
 *
 *  - life-factory-town: a works town at dusk, workers walking home, the
 *    lights coming on: the stacks smoke, the windows waver;
 *  - life-coast-rain: a fishing village on the coast in the rain: rain
 *    nearer than the set's own, rings on the water, light on the water;
 *  - life-port-night: a port at dusk going to night: light on the water,
 *    the town's and the ship's lights wavering;
 *  - life-ceremony: a ceremony ground, a crowd waiting: its flag stirs,
 *    the people shift their weight;
 *  - life-hall: an assembly hall, dust in the light from its high windows;
 *  - life-turbofan: the jet engine with its flow, held on its question,
 *    the camera drifting;
 *  - life-fire: people gathered on open land at night (the lab adds a
 *    test flame on their ground: the Lottie catalogue has no fire yet).
 *
 *   npx ts-node --transpile-only scripts/life-samples.ts <client dir>
 *
 * writes <client>/public/dev-scenes/shots/life-*.json (gitignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FilmShape } from '../src/contracts';
import { timedBeats } from '../src/business/domain/shots/__fixtures__/regional-turn';
import {
  buildShots,
  type BuildContext,
} from '../src/business/domain/shots/shot-build';
import { registryOf } from '../src/business/domain/shots/shot-registry';
import { soundsOf } from '../src/business/domain/shots/shot-sound';
import { timeShots } from '../src/business/domain/shots/shot-time';
import type {
  PlanSetScene,
  PlanShot,
  ShotPlan,
} from '../src/business/domain/shots/types';

const client = process.argv[2] ?? '../client';
const LAB = join(client, 'public/dev-scenes/shots');
mkdirSync(LAB, { recursive: true });

const shot = (on: string, more: Partial<PlanShot>): PlanShot => ({
  on,
  set: { kind: 'set', set: { land: 'plain', time: 'day', place: 'display' } },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'continue',
  ...more,
});
const drawn = (set: PlanSetScene): PlanShot['set'] => ({ kind: 'set', set });

interface Sample {
  name: string;
  title: string;
  lines: string[];
  plan: ShotPlan;
}

const SAMPLES: Sample[] = [
  {
    name: 'life-factory-town',
    title: 'The mill towns',
    lines: [
      'By 1910 the mill towns ran day and night.',
      'As evening came, the lights came on, street by street.',
    ],
    plan: {
      shots: [
        shot('By 1910 the', {
          set: drawn({
            land: 'plain',
            time: 'dusk',
            town: 'town',
            place: 'industry',
            era: '1910',
            becomes: { state: 'lights-on', on: 'the lights came on' },
          }),
          actors: [
            {
              id: 'workers',
              kit: 'people.group',
              params: { pose: 'walking', count: 5 },
              place: 'left',
              moves: [{ move: 'walk', on: 'As evening came', to: 'right' }],
            },
          ],
          camera: [
            { move: 'establish', on: 'By 1910 the' },
            { move: 'push', amount: 'small', on: 'As evening came' },
          ],
        }),
      ],
    },
  },
  {
    name: 'life-coast-rain',
    title: 'The wet season',
    lines: [
      'On the coast, the rains came early that year.',
      'The boats stayed in, and the village waited.',
    ],
    plan: {
      shots: [
        shot('On the coast,', {
          set: drawn({
            land: 'coast',
            time: 'day',
            weather: 'rain',
            town: 'village',
            place: 'open',
            era: 'today',
          }),
          camera: [
            { move: 'establish', on: 'On the coast,' },
            { move: 'push', amount: 'small', on: 'The boats stayed' },
          ],
        }),
      ],
    },
  },
  {
    name: 'life-port-night',
    title: 'The port',
    lines: [
      'Container ships made the port the busiest place in town.',
      'The cranes worked on through the night.',
    ],
    plan: {
      shots: [
        shot('Container ships made', {
          set: drawn({
            land: 'coast',
            time: 'dusk',
            town: 'town',
            place: 'port',
            era: 'today',
            becomes: { state: 'night', on: 'through the night' },
          }),
          camera: [
            { move: 'establish', on: 'Container ships made' },
            { move: 'push', amount: 'small', on: 'The cranes worked' },
          ],
        }),
      ],
    },
  },
  {
    name: 'life-ceremony',
    title: 'The handover',
    lines: [
      'At midnight the crowd waited for the new flag.',
      'For a long moment, nobody moved.',
    ],
    plan: {
      shots: [
        shot('At midnight the', {
          set: drawn({
            land: 'plain',
            time: 'night',
            place: 'ceremony-ground',
            era: '1960',
          }),
          actors: [
            {
              id: 'crowd',
              kit: 'people.group',
              params: { pose: 'standing', count: 9 },
              place: 'centre',
            },
          ],
          life: ['crowd'],
          camera: [
            { move: 'establish', on: 'At midnight the' },
            { move: 'hold', on: 'For a long moment' },
          ],
        }),
      ],
    },
  },
  {
    name: 'life-hall',
    title: 'The vote',
    lines: [
      'In the assembly, the vote was called.',
      'Then the room went quiet.',
    ],
    plan: {
      shots: [
        shot('In the assembly,', {
          set: drawn({ land: 'plain', time: 'day', place: 'assembly-hall' }),
          life: ['dust'],
          camera: [
            { move: 'establish', on: 'In the assembly,' },
            { move: 'push', amount: 'small', on: 'Then the room' },
          ],
        }),
      ],
    },
  },
  {
    name: 'life-turbofan',
    title: 'How a jet engine works',
    lines: [
      'Air rushes in through the fan.',
      'The air is packed tight and hot.',
      'What lights it?',
    ],
    plan: {
      shots: [
        shot('Air rushes in', {
          actors: [{ id: 'engine', kit: 'machine.turbofan', place: 'centre' }],
          life: ['drift'],
          info: [
            { recipe: 'run', target: 'actor:engine', on: 'Air rushes in' },
            {
              recipe: 'flow',
              target: 'actor:engine.bypass-flow',
              text: 'stream',
              on: 'through the fan',
            },
            {
              recipe: 'flow',
              target: 'actor:engine.core-flow',
              text: 'compress',
              on: 'Air rushes in',
            },
            {
              recipe: 'label',
              target: 'actor:engine.compressor',
              text: 'Compressor',
              on: 'tight and hot',
            },
            {
              recipe: 'label',
              target: 'actor:engine.combustor',
              text: 'Combustor',
              on: 'lights it',
            },
            {
              recipe: 'ask',
              target: 'actor:engine.combustor',
              on: 'What lights it',
            },
          ],
          camera: [
            { move: 'establish', on: 'Air rushes in' },
            {
              move: 'push',
              target: 'actor:engine.combustor',
              amount: 'small',
              on: 'What lights it',
            },
          ],
          focal: 'actor:engine',
        }),
      ],
    },
  },
  {
    name: 'life-fire',
    title: 'The night watch',
    lines: [
      'Through the long nights, the strikers kept a fire burning.',
      'Nobody went home.',
    ],
    plan: {
      shots: [
        shot('Through the long', {
          set: drawn({
            land: 'plain',
            time: 'night',
            town: 'none',
            place: 'open',
            era: '1910',
          }),
          actors: [
            {
              id: 'strikers',
              kit: 'people.group',
              params: { pose: 'standing', count: 6 },
              place: 'right',
            },
          ],
          life: ['crowd', 'fire'],
          camera: [
            { move: 'establish', on: 'Through the long' },
            { move: 'hold', on: 'Nobody went home' },
          ],
        }),
      ],
    },
  },
];

const ctxOf = (shape: FilmShape, seed: string): BuildContext => ({
  shape,
  palette: [
    { thing: 'Workers', token: 'chart3' },
    { thing: 'Owners', token: 'chart0' },
  ],
  held: 'chart5',
  theme: 'paper',
  map: null,
  seed,
  look: 'editorial',
});

for (const sample of SAMPLES)
  for (const shape of ['wide', 'tall'] as FilmShape[]) {
    const built = buildShots(
      sample.plan,
      registryOf([]),
      ctxOf(shape, sample.name),
    );
    const beats = timedBeats(sample.lines, {
      startMs: 300,
      wordMs: 330,
      gapMs: 500,
    });
    const durationMs = beats[beats.length - 1].endMs + 2600;
    const notes: string[] = [];
    const shots = timeShots(built.shots, beats, durationMs, { notes });
    const [w, h] = shape === 'tall' ? [900, 1600] : [1600, 900];
    const scene = {
      version: 4,
      generator: 'life-samples',
      title: sample.title,
      ...(shape === 'tall' ? { shape: 'tall' } : {}),
      durationMs,
      settledMs: durationMs,
      timing: 'estimated',
      beats,
      things: [],
      steps: [],
      effects: [],
      sound: { mood: 'curious' },
      stagings: { box: { w, h, places: [] }, wide: { w, h, places: [] } },
      engine: 'shots',
      shots: {
        version: 1,
        look: built.look,
        assets: built.assets,
        shots,
        sounds: soundsOf(shots),
      },
    };
    const file = join(
      LAB,
      `${sample.name}${shape === 'tall' ? '-tall' : ''}.json`,
    );
    writeFileSync(file, JSON.stringify(scene));
    console.log(
      file,
      `${Math.round(JSON.stringify(scene).length / 1024)} KB`,
      shots.map((one) => one.life.map((l) => l.effect).join('+')).join(' | '),
      [...built.notes, ...notes].join(' | '),
    );
  }
