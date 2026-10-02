/**
 * The illustrated look's sample scenes (WP17) for the client's /dev/shots
 * lab: plans written as the board would write them for an illustrated
 * show, read and mended by the board's own code, then built, timed and
 * composed by the shots engine, each on the show's map (MapLibre, the
 * natural relief an illustrated show is drawn on), in both shapes:
 *
 *  - chars-romans: Roman legionaries marching across the map to Rome;
 *  - chars-arabs: a pair of Arab horsemen on Arabia, filled;
 *  - chars-king: a medieval king pointing at the Franks' lands;
 *  - chars-officer: a 19th-century officer's "Wait!";
 *  - chars-eyes: Britain, France and the German states eyeing each other;
 *  - chars-named: a named character, labelled, beside a portrait's slot
 *    (the picture desk's, which this lab does not fetch).
 *
 * The voice is a stand-in (a word every 330 ms); nothing is read from or
 * written to the database, and no model is called.
 *
 *   npx ts-node --transpile-only scripts/characters-samples.ts <client dir>
 *
 * Writes <client>/public/dev-scenes/shots/chars-<name>[-tall].json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FilmShape,
  SceneDto,
  ShotDto,
  ShotSvgAssetDto,
} from '../src/contracts';
import { makeKit } from '../src/business/domain/kit/registry';
import { toAsset } from '../src/business/domain/kit/rig';
import { kitStyle } from '../src/business/domain/kit/style';
import type { ShowMapBase } from '../src/business/domain/scene-map';
import type { PaletteToken } from '../src/business/domain/scene-palette';
import { STAGES } from '../src/business/domain/scene-shape';
import { shotLook } from '../src/business/domain/shots/shot-build';
import { mendPlan, planOf } from '../src/business/domain/shots/shot-check';
import {
  composeShotScene,
  shotsInputOf,
  shotsScriptOf,
} from '../src/business/domain/shots/shot-compose';
import { mapSetAsset } from '../src/business/domain/shots/shot-map';
import { registryOf } from '../src/business/domain/shots/shot-registry';
import type { RegistryEntry } from '../src/business/domain/shots/types';
import { timedBeats } from '../src/business/domain/shots/__fixtures__/regional-turn';
import { explainerSheetOf } from '../src/business/domain/studio/studio';

const KIT = ['character.person', 'character.group'];

interface Sample {
  name: string;
  lines: string[];
  base: ShowMapBase;
  palette: { thing: string; token: PaletteToken }[];
  registry: RegistryEntry[];
  plan: unknown;
}

const place = (name: string, lng: number, lat: number): RegistryEntry => ({
  name: `place:${name}`,
  kind: 'place',
  about: 'a city',
  geo: { lng, lat },
});
const region = (name: string): RegistryEntry => ({
  name: `region:${name}`,
  kind: 'region',
  about: 'a region of the map',
});
/** A side of the show's palette, as the board's registry lists it. */
const sideEntries = (palette: Sample['palette']): RegistryEntry[] =>
  palette.map((one) => ({
    name: `side:${one.thing}`,
    kind: 'side',
    about: `colour ${one.token}`,
    colour: one.token,
  }));

const SAMPLES: Sample[] = [
  {
    name: 'romans',
    lines: [
      "Rome's legions marched south through Italy, mile after mile, back to the city itself.",
    ],
    base: {
      kind: 'map',
      region: 'Southern Europe',
      groups: [{ name: 'Roman Italy', members: ['Italy'], colour: 'chart3' }],
    },
    palette: [{ thing: 'Rome', token: 'chart3' }],
    registry: [
      place('Rome', 12.4964, 41.9028),
      place('Florence', 11.2558, 43.7696),
      region('Roman Italy'),
    ],
    plan: {
      shots: [
        {
          on: "Rome's legions marched south",
          set: { kind: 'map', style: 'relief', terrain: true },
          actors: [
            {
              id: 'legion',
              kit: 'character.group',
              place: 'place:Florence',
              side: 'Rome',
              dress:
                'Roman legionaries, red tunics, banded armour, crested helmets',
              era: 'ancient',
              count: 4,
              pose: 'marching',
              moves: [{ move: 'walk', on: 'marched south', to: 'place:Rome' }],
            },
          ],
          info: [
            {
              recipe: 'fill',
              target: 'region:Roman Italy',
              on: 'through Italy',
              colour: 'Rome',
            },
            { recipe: 'pin', target: 'place:Rome', on: 'the city itself' },
          ],
          camera: [
            { move: 'establish', on: "Rome's legions marched south" },
            {
              move: 'push',
              target: 'region:Roman Italy',
              amount: 'large',
              on: 'mile after mile',
            },
          ],
          life: ['cloud-shadows'],
          join: 'cut',
          focal: 'set',
        },
      ],
    },
  },
  {
    name: 'arabs',
    lines: [
      'Out of Arabia rode the first horsemen of a new empire, ready to carry it far beyond the desert.',
    ],
    base: {
      kind: 'map',
      region: 'Arabian Peninsula',
      groups: [
        {
          name: 'Arabia',
          members: [
            'Saudi Arabia',
            'Yemen',
            'Oman',
            'United Arab Emirates',
            'Qatar',
            'Kuwait',
          ],
          colour: 'chart2',
        },
      ],
    },
    palette: [{ thing: 'Arabia', token: 'chart2' }],
    registry: [
      place('Medina', 39.61, 24.47),
      place('Riyadh', 46.72, 24.71),
      region('Arabia'),
    ],
    plan: {
      shots: [
        {
          on: 'Out of Arabia rode',
          set: { kind: 'map', style: 'relief' },
          actors: [
            {
              id: 'rider-west',
              kit: 'character.person',
              place: 'place:Medina',
              side: 'Arabia',
              dress: 'Arab horseman, white keffiyeh, brown robe, curved sword',
              era: 'medieval',
              expression: 'angry',
              facing: 'right',
              moves: [{ move: 'enter', on: 'the first horsemen' }],
            },
            {
              id: 'rider-east',
              kit: 'character.person',
              place: 'place:Riyadh',
              side: 'Arabia',
              dress:
                'Arab horseman, red and white checked keffiyeh, beige robe, curved sword',
              era: 'medieval',
              expression: 'smug',
              facing: 'left',
              moves: [{ move: 'enter', on: 'of a new empire' }],
            },
          ],
          info: [
            {
              recipe: 'fill',
              target: 'region:Arabia',
              on: 'Out of Arabia',
              colour: 'Arabia',
            },
          ],
          camera: [
            { move: 'establish', on: 'Out of Arabia rode' },
            {
              move: 'push',
              target: 'region:Arabia',
              amount: 'medium',
              on: 'of a new empire',
            },
          ],
          life: [],
          join: 'cut',
          focal: 'region:Arabia',
        },
      ],
    },
  },
  {
    name: 'king',
    lines: [
      'The Frankish king pointed his armies east, and his lands grew into an empire.',
    ],
    base: {
      kind: 'map',
      region: 'Western Europe',
      groups: [
        {
          name: 'Franks',
          members: [
            'France',
            'Belgium',
            'Netherlands',
            'Germany',
            'Switzerland',
          ],
          colour: 'chart5',
        },
      ],
    },
    palette: [{ thing: 'Franks', token: 'chart5' }],
    registry: [place('Aachen', 6.0839, 50.7753), region('Franks')],
    plan: {
      shots: [
        {
          on: 'The Frankish king pointed',
          set: { kind: 'map', style: 'relief' },
          actors: [
            {
              id: 'king',
              kit: 'character.person',
              place: 'foreground left',
              side: 'Franks',
              role: 'ruler',
              dress: 'medieval king, gold crown, red robe with ermine',
              era: 'medieval',
              pose: 'pointing',
              expression: 'happy',
              facing: 'right',
              moves: [
                { move: 'point', on: 'his armies east', to: 'place:Aachen' },
              ],
            },
          ],
          info: [
            {
              recipe: 'fill',
              target: 'region:Franks',
              on: 'his lands grew',
              colour: 'Franks',
            },
            {
              recipe: 'label',
              target: 'region:Franks',
              text: 'Franks',
              on: 'into an empire',
            },
          ],
          camera: [{ move: 'establish', on: 'The Frankish king pointed' }],
          life: [],
          join: 'cut',
          focal: 'region:Franks',
        },
      ],
    },
  },
  {
    name: 'officer',
    lines: [
      "In 1870, Prussia's generals studied the map of Europe, and saw France waiting across the Rhine.",
    ],
    base: {
      kind: 'map',
      region:
        'France, Germany, Poland, Austria, Czech Republic, Belgium, Netherlands, Switzerland, Denmark',
      year: 1870,
      groups: [
        { name: 'France', members: ['France'], colour: 'chart5' },
        { name: 'Prussia', members: ['Germany', 'Poland'], colour: 'chart0' },
      ],
    },
    palette: [
      { thing: 'France', token: 'chart5' },
      { thing: 'Prussia', token: 'chart0' },
    ],
    registry: [region('France'), region('Prussia')],
    plan: {
      shots: [
        {
          on: "In 1870, Prussia's generals",
          set: { kind: 'map', style: 'relief' },
          actors: [
            {
              id: 'officer',
              kit: 'character.person',
              place: 'foreground right',
              side: 'Prussia',
              dress:
                '19th-century Prussian officer, dark blue coat, pickelhaube',
              era: '1800-1900',
              expression: 'surprised',
              facing: 'left',
              moves: [{ move: 'enter', on: "Prussia's generals" }],
            },
          ],
          info: [
            {
              recipe: 'fill',
              target: 'region:Prussia',
              on: 'studied the map',
              colour: 'Prussia',
            },
            {
              recipe: 'fill',
              target: 'region:France',
              on: 'saw France waiting',
              colour: 'France',
            },
            {
              recipe: 'say',
              target: 'officer',
              text: 'Wait!',
              on: 'across the Rhine',
            },
          ],
          camera: [{ move: 'establish', on: "In 1870, Prussia's generals" }],
          life: [],
          join: 'cut',
          focal: 'set',
        },
      ],
    },
  },
  {
    name: 'eyes',
    lines: [
      'Britain and France watched each other across the Channel, and both kept an eye on the German states.',
    ],
    base: {
      kind: 'map',
      region: 'Western Europe',
      groups: [
        { name: 'France', members: ['France'], colour: 'chart5' },
        { name: 'Britain', members: ['United Kingdom'], colour: 'chart3' },
        { name: 'German states', members: ['Germany'], colour: 'chart2' },
      ],
    },
    palette: [
      { thing: 'France', token: 'chart5' },
      { thing: 'Britain', token: 'chart3' },
      { thing: 'German states', token: 'chart2' },
    ],
    registry: [region('France'), region('Britain'), region('German states')],
    plan: {
      shots: [
        {
          on: 'Britain and France watched',
          set: { kind: 'map', style: 'relief' },
          actors: [],
          info: [
            {
              recipe: 'fill',
              target: 'region:Britain',
              on: 'Britain and France',
              colour: 'Britain',
            },
            {
              recipe: 'fill',
              target: 'region:France',
              on: 'watched each other',
              colour: 'France',
            },
            {
              recipe: 'fill',
              target: 'region:German states',
              on: 'the German states',
              colour: 'German states',
            },
          ],
          camera: [{ move: 'establish', on: 'Britain and France watched' }],
          life: [],
          join: 'cut',
          focal: 'set',
          eyes: [
            { at: 'region:France', to: 'region:Britain', face: 'angry' },
            { at: 'region:Britain', to: 'region:France', face: 'worried' },
          ],
        },
      ],
    },
  },
];

/** The look an illustrated show's samples are drawn in: Paper, its sides. */
const lookFor = (palette: Sample['palette']) => ({
  ...shotLook({ palette, held: null, theme: 'paper', look: 'illustrated' }),
});

async function sampleScene(
  sample: Sample,
  shape: FilmShape,
): Promise<SceneDto> {
  const entries = [...sample.registry, ...sideEntries(sample.palette)];
  const registry = registryOf(entries);
  const narration = sample.lines.join(' ');
  const options = { kit: KIT, look: 'illustrated' as const, map: true };
  const plan = mendPlan(
    planOf(sample.plan, narration, options),
    narration,
    registry,
    options,
  );
  const sheet = explainerSheetOf({
    kind: 'explainer',
    title: sample.name,
    transition: 'cut',
    draft: {
      fit: 'good',
      fitReason: null,
      title: sample.name,
      mood: 'serious',
      pace: 'infographic',
      beats: sample.lines.map((say) => ({
        say,
        pause: 'short',
        delivery: 'explain',
        speaker: null,
        music: null,
        energy: null,
      })),
      cast: [],
      steps: [],
    },
    engine: 'shots',
    shots: plan,
    registry: entries,
    rowClaims: sample.lines.map(() => []),
  });
  const world = { palette: sample.palette, held: null, base: sample.base };
  const input = shotsInputOf(
    sheet,
    world,
    true,
    `chars-${sample.name}`,
    'illustrated',
  )!;
  const look = lookFor(sample.palette);
  const map = await mapSetAsset(sample.base, look, shape, 'paper');
  const beats = timedBeats(sample.lines, {
    startMs: 300,
    wordMs: 330,
    gapMs: 600,
  });
  const durationMs = beats[beats.length - 1].endMs + 1800;
  const { scene, notes } = composeShotScene(input, {
    script: shotsScriptOf(sheet, { stage: 'higher', maths: false }),
    beats,
    durationMs,
    timing: 'voice',
    shape,
    theme: 'paper',
    generator: 'characters-samples',
    profile: null,
    map,
  });
  if (notes.length)
    console.log(`${sample.name} (${shape}):\n  ${notes.join('\n  ')}`);
  return scene;
}

/**
 * A named character beside a portrait's slot: the picture desk's archive
 * portrait goes in the frame (this lab fetches none, so the frame shows
 * where it goes); the character is drawn from their look notes and
 * labelled with their name.
 */
function namedScene(shape: FilmShape): SceneDto {
  const { w, h } = STAGES[shape];
  const look = lookFor([{ thing: 'Science', token: 'chart1' }]);
  const tall = shape === 'tall';
  // The slot: a gilt frame, an empty mount, its caption. Side by side
  // with the character in both shapes, a tall frame's inside its safe
  // area and above its caption band (288 to 1040 of 1920).
  const fw = tall ? 290 : 520;
  const fh = tall ? 400 : 640;
  const fx = tall ? 445 : 230;
  const fy = tall ? 300 : 110;
  const slot: ShotSvgAssetDto = {
    kind: 'svg',
    box: [0, 0, w, h],
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<rect width="${w}" height="${h}" fill="${look.palette.paper}"/>` +
      `<g data-part="portrait"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="6" fill="#c9a24a" stroke="#6b4f1d" stroke-width="5"/>` +
      `<rect x="${fx + 34}" y="${fy + 34}" width="${fw - 68}" height="${fh - 68}" fill="#ece6da" stroke="#6b4f1d" stroke-width="3"/>` +
      `<path d="M${fx + fw / 2 - 120} ${fy + fh - 34} C${fx + fw / 2 - 120} ${fy + fh - 190} ${fx + fw / 2 + 120} ${fy + fh - 190} ${fx + fw / 2 + 120} ${fy + fh - 34} Z" fill="#d8d0c2"/>` +
      `<circle cx="${fx + fw / 2}" cy="${fy + fh - 260}" r="88" fill="#d8d0c2"/></g>` +
      // The caption under the frame.
      `<g data-part="caption"><text x="${fx + fw / 2}" y="${fy + fh + 54}" text-anchor="middle" font-size="${tall ? 30 : 34}" fill="${look.palette.muted}" font-family="sans-serif">${tall ? 'Archive portrait' : 'Archive portrait · the picture desk’s'}</text></g>` +
      '</svg>',
    parts: {
      portrait: { box: [fx, fy, fw, fh] },
      caption: { box: [fx, fy + fh + 20, fw, 44] },
    },
    focal: [0, 0, w, h],
  };
  const style = kitStyle(look, { look: 'illustrated', shape });
  const made = makeKit(
    'character.person',
    {
      name: 'Charles Darwin',
      looks: 'an old man, bald, a long white beard, a black frock coat',
      era: '1800-1900',
      role: 'scholar',
      expression: 'thinking',
      pose: 'thinking',
    },
    style,
    17,
    'Science',
  )!;
  const asset = toAsset(made.piece);
  const size = tall ? 560 : 600;
  const shot: ShotDto = {
    id: 'named-1',
    startMs: 0,
    endMs: 6000,
    set: { kind: 'set', asset: 'slot' },
    actors: [
      {
        id: 'darwin',
        asset: 'darwin',
        // Tall: on the left, the portrait on the right, its name inside the safe area.
        at: tall ? { x: 260, y: 900 } : { x: 1130, y: 830 },
        size,
        z: 1,
        moves: [{ move: 'enter', atMs: 300, durMs: 600 }],
      },
    ],
    info: [
      {
        id: 'named-1-label',
        recipe: 'label',
        target: { kind: 'actor', actor: 'darwin', part: 'head' },
        atMs: 1400,
        durMs: 250,
        untilMs: 6000,
        text: 'Charles Darwin',
      },
    ],
    life: [],
    camera: [{ move: 'establish', atMs: 0, durMs: 1200 }],
    focal: { kind: 'box', box: [0, 0, w, h] },
    join: 'cut',
    joinMs: 0,
    illustration: true,
  };
  return {
    version: 4,
    generator: 'characters-samples',
    title: 'named',
    durationMs: 6000,
    timing: { beats: [] } as unknown as SceneDto['timing'],
    beats: [],
    things: [],
    steps: [],
    effects: [],
    stagings: { box: { w, h, places: [] }, wide: { w, h, places: [] } },
    engine: 'shots',
    shots: {
      version: 1,
      look,
      assets: { slot, darwin: asset },
      shots: [shot],
      sounds: [],
    },
  };
}

async function main(): Promise<void> {
  const client = process.argv[2];
  if (!client) throw new Error('give the client folder');
  const out = join(client, 'public', 'dev-scenes', 'shots');
  mkdirSync(out, { recursive: true });
  for (const shape of ['wide', 'tall'] as const) {
    const end = shape === 'tall' ? '-tall' : '';
    for (const sample of SAMPLES) {
      const scene = await sampleScene(sample, shape);
      writeFileSync(
        join(out, `chars-${sample.name}${end}.json`),
        JSON.stringify(scene),
      );
    }
    writeFileSync(
      join(out, `chars-named${end}.json`),
      JSON.stringify(namedScene(shape)),
    );
  }
  console.log('wrote', out);
}

void main();
