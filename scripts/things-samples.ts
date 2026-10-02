/**
 * Sample scenes of the things kit and the code-drawn sets for the client's
 * /dev/shots lab, made through the real path a scene of shots takes: a
 * plan as the board writes one, built (shot-build: the drawn sets, the
 * kit's pieces standing on them, their parts as targets), timed on the
 * lines' words (shot-time), with their sounds (shot-sound); in both shapes.
 *
 *  - things-turbofan: a jet engine cut open on a display, running, its
 *    bypass air streaming cool and its core air squeezed and heated, its
 *    parts labelled, the camera pushing to the combustor for a question;
 *  - things-factory-town: a works town at dusk, workers walking home, the
 *    lights coming on street by street;
 *  - things-port: a port across the water, its cranes, night falling;
 *  - things-farm: a farm in the rain;
 *  - things-newspaper: a newspaper on a display, stamped;
 *  - things-assembly: an assembly hall, the light of the hour going.
 *
 *   npx ts-node --transpile-only scripts/things-samples.ts <client dir>
 *
 * writes <client>/public/dev-scenes/shots/things-*.json (gitignored).
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
import type { PlanShot, ShotPlan } from '../src/business/domain/shots/types';

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

interface Sample {
  name: string;
  title: string;
  lines: string[];
  plan: ShotPlan;
}

const SAMPLES: Sample[] = [
  {
    name: 'things-turbofan',
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
          info: [
            { recipe: 'run', target: 'actor:engine', on: 'Air rushes in' },
            {
              recipe: 'label',
              target: 'actor:engine.fan',
              text: 'Fan',
              on: 'through the fan',
            },
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
              recipe: 'spotlight',
              target: 'actor:engine.combustor',
              on: 'What lights it',
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
              amount: 'medium',
              on: 'What lights it',
            },
          ],
          focal: 'actor:engine',
        }),
      ],
    },
  },
  {
    name: 'things-factory-town',
    title: 'The mill towns',
    lines: [
      'By 1910 the mill towns ran day and night.',
      'As evening came, the lights came on, street by street.',
    ],
    plan: {
      shots: [
        shot('By 1910 the', {
          set: {
            kind: 'set',
            set: {
              land: 'plain',
              time: 'dusk',
              town: 'town',
              place: 'industry',
              era: '1910',
              becomes: { state: 'lights-on', on: 'the lights came on' },
            },
          },
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
          life: ['smoke'],
        }),
      ],
    },
  },
  {
    name: 'things-port',
    title: 'The port',
    lines: [
      'Container ships made the port the busiest place in town.',
      'The cranes worked on through the night.',
    ],
    plan: {
      shots: [
        shot('Container ships made', {
          set: {
            kind: 'set',
            set: {
              land: 'coast',
              time: 'dusk',
              town: 'town',
              place: 'port',
              era: 'today',
              becomes: { state: 'night', on: 'through the night' },
            },
          },
          camera: [
            { move: 'establish', on: 'Container ships made' },
            { move: 'push', amount: 'small', on: 'The cranes worked' },
          ],
        }),
      ],
    },
  },
  {
    name: 'things-farm',
    title: 'The wet years',
    lines: [
      'In the wet years the harvest failed.',
      'Farms waited for the rain to stop.',
    ],
    plan: {
      shots: [
        shot('In the wet', {
          set: {
            kind: 'set',
            set: {
              land: 'plain',
              time: 'day',
              weather: 'rain',
              place: 'farm',
              era: '1950',
            },
          },
          camera: [
            { move: 'establish', on: 'In the wet' },
            { move: 'push', amount: 'small', on: 'Farms waited' },
          ],
        }),
      ],
    },
  },
  {
    name: 'things-newspaper',
    title: 'The verdict',
    lines: ['The next morning, every paper carried the verdict.', 'Approved.'],
    plan: {
      shots: [
        shot('The next morning,', {
          actors: [
            {
              id: 'paper',
              kit: 'document',
              params: { kind: 'newspaper' },
              place: 'centre',
            },
          ],
          info: [
            {
              recipe: 'stamp',
              target: 'actor:paper.stamp',
              text: 'Approved',
              on: 'Approved',
            },
          ],
          camera: [
            { move: 'establish', on: 'The next morning,' },
            {
              move: 'push',
              target: 'actor:paper',
              amount: 'small',
              on: 'carried the verdict',
            },
          ],
          focal: 'actor:paper',
        }),
      ],
    },
  },
  {
    name: 'things-assembly',
    title: 'The vote',
    lines: [
      'In the assembly, the vote was called.',
      'The debate ran on into the evening.',
    ],
    plan: {
      shots: [
        shot('In the assembly,', {
          set: {
            kind: 'set',
            set: {
              land: 'plain',
              time: 'day',
              place: 'assembly-hall',
              becomes: { state: 'dusk', on: 'into the evening' },
            },
          },
          camera: [
            { move: 'establish', on: 'In the assembly,' },
            { move: 'push', amount: 'small', on: 'The debate ran' },
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
    const durationMs = beats[beats.length - 1].endMs + 2200;
    const notes: string[] = [];
    const shots = timeShots(built.shots, beats, durationMs, { notes });
    const [w, h] = shape === 'tall' ? [900, 1600] : [1600, 900];
    const scene = {
      version: 4,
      generator: 'things-samples',
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
      [...built.notes, ...notes].join(' | '),
    );
  }
