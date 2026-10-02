/**
 * Sample scenes of the UI kit for the client's /dev/shots lab, made the
 * way a real scene is: a plan as the board writes it (closed lists and
 * the devices' part names), built (shot-build with shot-ui), timed on the
 * voice's words (shot-time; the words here are spread evenly over each
 * line), mended (shot-check-timed), the cursor timed into its changes
 * (shot-ui uiTimed) and given its sounds (shot-sound), in both shapes:
 *
 *  - ui-callouts: a phone with a product page, five problems numbered in
 *    order, the camera pushing into the last;
 *  - ui-theme: the cursor clicking the dark mode switch, the whole screen
 *    turning dark;
 *  - ui-slider: a slider dragged all the way up;
 *  - ui-dashboard: a laptop with a dashboard whose chart grows;
 *  - ui-frost: a sign-in walkthrough in two chapters, a frost between
 *    them, the cursor typing an address;
 *  - ui-before: a before and an after, the same screen in two states.
 *
 *   npx ts-node --transpile-only scripts/ui-samples.ts <client dir>
 *
 * writes <client>/public/dev-scenes/shots/ui-*.json (the lab's; gitignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FilmShape } from '../src/contracts';
import type { TimedBeat } from '../src/business/domain/scene-timing';
import { buildShots } from '../src/business/domain/shots/shot-build';
import { mendTimed } from '../src/business/domain/shots/shot-check-timed';
import { registryOf } from '../src/business/domain/shots/shot-registry';
import { soundsOf } from '../src/business/domain/shots/shot-sound';
import { timeShots } from '../src/business/domain/shots/shot-time';
import { uiTimed } from '../src/business/domain/shots/shot-ui';
import type { PlanShot, ShotPlan } from '../src/business/domain/shots/types';

const client = process.argv[2] ?? '../client';
const LAB = join(client, 'public/dev-scenes/shots');

/** Lines as a voice says them: each word an even share of its line's time, a pause between lines. */
function beatsOf(lines: string[]): { beats: TimedBeat[]; durationMs: number } {
  let at = 400;
  const beats = lines.map((text) => {
    const found = [...text.matchAll(/\S+/g)];
    const each = 330;
    const startMs = at;
    const endMs = startMs + found.length * each;
    at = endMs + 450;
    return {
      text,
      startMs,
      endMs,
      words: found.map((m, i) => [m.index!, m.index! + m[0].length, startMs + i * each, startMs + (i + 1) * each - 40]),
    };
  });
  return { beats, durationMs: at + 600 };
}

const shot = (s: Partial<PlanShot> & Pick<PlanShot, 'on'>): PlanShot => ({
  set: { kind: 'screen' },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'continue',
  ...s,
});

interface Sample {
  name: string;
  title: string;
  lines: string[];
  plan: ShotPlan;
}

const product = {
  id: 'phone',
  kit: 'ui.phone',
  params: { screen: 'product', title: 'Organic Strawberries', words: 'Add to cart', items: 'Free delivery, Fresh, Organic, Local' },
};
const settings = {
  id: 'phone',
  kit: 'ui.phone',
  params: { screen: 'settings', title: 'Settings', items: 'Dark mode, Notifications, Brightness' },
};
const login = {
  id: 'phone',
  kit: 'ui.phone',
  params: { screen: 'login', title: 'Welcome back', words: 'Sign in', items: 'Email, Password, Remember me' },
};

const SAMPLES: Sample[] = [
  {
    name: 'ui-callouts',
    title: 'Five problems',
    lines: [
      'This page sells strawberries, and it has five problems.',
      'First, the photo crowds out the way back.',
      'Second, the title is easy to miss.',
      'Third, the rating hides how many people rated it.',
      'Fourth, the price gives no sense of the deal.',
      'And fifth, the button sits too far from the thumb.',
    ],
    plan: {
      shots: [
        shot({
          on: 'This page sells',
          actors: [product],
          info: [
            { recipe: 'callout', target: 'phone.nav-back', on: 'First, the photo' },
            { recipe: 'callout', target: 'phone.title', on: 'Second, the title' },
            { recipe: 'callout', target: 'phone.rating', on: 'Third, the rating' },
          ],
          camera: [{ move: 'establish', on: 'This page sells' }],
        }),
        shot({
          on: 'Fourth, the price',
          actors: [product],
          info: [
            { recipe: 'callout', target: 'phone.price', on: 'Fourth, the price' },
            { recipe: 'callout', target: 'phone.btn-primary', on: 'And fifth, the button' },
          ],
          camera: [{ move: 'push', target: 'phone.btn-primary', amount: 'medium', on: 'too far from' }],
          join: 'cut',
        }),
      ],
    },
  },
  {
    name: 'ui-theme',
    title: 'Dark mode',
    lines: ['Open the settings.', 'Dark mode is one switch away.', 'Turn it on, and the whole screen goes calm and dark.'],
    plan: {
      shots: [
        shot({
          on: 'Open the settings',
          actors: [
            settings,
            {
              id: 'cursor',
              kit: 'ui.cursor',
              moves: [
                { move: 'move-to', on: 'one switch away', to: 'phone.toggle-dark' },
                { move: 'click', on: 'Turn it on', to: 'phone.toggle-dark' },
              ],
            },
          ],
          camera: [
            { move: 'push', target: 'phone.setting-dark-mode', amount: 'medium', on: 'Dark mode is' },
            { move: 'pull', on: 'the whole screen' },
          ],
          join: 'cut',
        }),
      ],
    },
  },
  {
    name: 'ui-slider',
    title: 'Brightness',
    lines: ['Brightness is a slider.', 'Drag it all the way up, and the screen is bright again.'],
    plan: {
      shots: [
        shot({
          on: 'Brightness is a slider',
          actors: [
            settings,
            {
              id: 'cursor',
              kit: 'ui.cursor',
              moves: [{ move: 'drag', on: 'Drag it all the way up', to: 'phone.slider-brightness', state: '0.95' }],
            },
          ],
          info: [{ recipe: 'callout', target: 'phone.slider-brightness', on: 'Brightness is a slider' }],
          camera: [{ move: 'push', target: 'phone.slider-brightness', amount: 'medium', on: 'is a slider' }],
          join: 'cut',
        }),
      ],
    },
  },
  {
    name: 'ui-dashboard',
    title: 'Sales',
    lines: ['This dashboard shows a week of sales.', 'Watch the bars grow as the orders come in.', 'The last day is the best of the week.'],
    plan: {
      shots: [
        shot({
          on: 'This dashboard shows',
          actors: [{ id: 'laptop', kit: 'ui.laptop', params: { screen: 'dashboard', title: 'Weekly sales', items: 'Revenue, Orders, Visitors' } }],
          info: [
            { recipe: 'grow', target: 'laptop.chart', on: 'the bars grow' },
            { recipe: 'callout', target: 'laptop.chart.bar-9', on: 'The last day' },
          ],
          camera: [{ move: 'push', target: 'laptop.chart', amount: 'medium', on: 'Watch the bars' }],
          join: 'cut',
        }),
      ],
    },
  },
  {
    name: 'ui-frost',
    title: 'Signing in',
    lines: [
      'Signing in takes two steps.',
      'Step one: type your email.',
      'Step two: press sign in, and wait a moment.',
      'And you are in.',
    ],
    plan: {
      shots: [
        shot({
          on: 'Signing in takes',
          actors: [login],
          camera: [{ move: 'establish', on: 'Signing in takes' }],
          join: 'frost',
        }),
        shot({
          on: 'Step one',
          actors: [
            login,
            {
              id: 'cursor',
              kit: 'ui.cursor',
              moves: [{ move: 'type', on: 'type your email', to: 'phone.input-email', text: 'ana@mail.org' }],
            },
          ],
          camera: [{ move: 'push', target: 'phone.input-email', amount: 'medium', on: 'type your email' }],
          join: 'frost',
        }),
        shot({
          on: 'Step two',
          actors: [
            login,
            {
              id: 'cursor',
              kit: 'ui.cursor',
              moves: [{ move: 'click', on: 'press sign in', to: 'phone.btn-primary', state: 'loading' }],
            },
          ],
          info: [{ recipe: 'swap', target: 'phone.btn-primary', text: 'success', on: 'you are in' }],
          join: 'cut',
        }),
      ],
    },
  },
  {
    name: 'ui-before',
    title: 'Before and after',
    lines: ['Before, the form hid its mistakes.', 'After, it says what is wrong, right where it is.'],
    plan: {
      shots: [
        shot({
          on: 'Before, the form',
          actors: [
            { id: 'before', kit: 'ui.phone', params: { screen: 'login', title: 'Welcome back', words: 'Sign in', items: 'Email, Password', state: 'btn-primary: disabled' } },
            { id: 'after', kit: 'ui.phone', params: { screen: 'login', title: 'Welcome back', words: 'Sign in', items: 'Email, Password', state: 'input-email: error' } },
          ],
          info: [
            { recipe: 'label', target: 'before.screen', text: 'Before', on: 'Before, the form' },
            { recipe: 'label', target: 'after.screen', text: 'After', on: 'After, it says' },
            { recipe: 'callout', target: 'after.input-email', on: 'what is wrong' },
          ],
          join: 'cut',
        }),
      ],
    },
  },
];

function scene(sample: Sample, shape: FilmShape) {
  const { beats, durationMs } = beatsOf(sample.lines);
  const built = buildShots(sample.plan, registryOf([]), {
    shape,
    palette: [],
    held: null,
    theme: 'paper',
    map: null,
    seed: sample.name,
  });
  for (const note of built.notes) console.log(`  ${sample.name} ${shape}: ${note}`);
  const timed = timeShots(built.shots, beats, durationMs);
  const mended = mendTimed(timed, durationMs, {});
  const shots = uiTimed(mended.shots, built.assets);
  const [w, h] = shape === 'tall' ? [900, 1600] : [1600, 900];
  return {
    version: 4,
    generator: 'ui-samples',
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
    shots: { version: 1, look: built.look, assets: built.assets, shots, sounds: soundsOf(shots) },
  };
}

mkdirSync(LAB, { recursive: true });
for (const sample of SAMPLES)
  for (const shape of ['wide', 'tall'] as const) {
    const made = scene(sample, shape);
    const file = join(LAB, `${sample.name}${shape === 'tall' ? '-tall' : ''}.json`);
    writeFileSync(file, JSON.stringify(made));
    console.log(`wrote ${file} (${Math.round(JSON.stringify(made).length / 1024)} KB, ${made.shots.shots.length} shots, ${made.durationMs} ms)`);
  }
