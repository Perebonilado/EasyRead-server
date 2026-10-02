/**
 * Four sample scenes for the shots stage's lab (/dev/shots), built from
 * the charts' real assets with hand-timed shots: a number, a timeline the
 * camera travels, a chamber lighting by party, and the map with a fill, a
 * pin and a route. Each in both shapes.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/shots-samples-scenes.ts <client dir> [<client dir> …]
 *
 * Writes <client>/public/dev-scenes/shots/<name>[-tall].json and the same
 * into <client>/src/lib/shots/__fixtures__/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FilmShape,
  SceneDto,
  ShotDto,
  ShotInfoDto,
  ShotSvgAssetDto,
} from '../src/contracts';
import {
  CHART_SPECS,
  LIGHT_LOOK,
} from '../src/business/domain/shots/__fixtures__/chart-specs';
import { chartAsset, mapAsset } from '../src/business/domain/shots/shot-charts';
import { STAGES } from '../src/business/domain/scene-shape';

const part = (asset: string, id: string) => ({
  kind: 'asset' as const,
  asset,
  part: id,
});
const info = (
  id: string,
  recipe: ShotInfoDto['recipe'],
  asset: string,
  target: string,
  atMs: number,
  durMs: number,
  more: Partial<ShotInfoDto> = {},
): ShotInfoDto => ({
  id,
  recipe,
  target: part(asset, target),
  atMs,
  durMs,
  ...more,
});

function scene(
  title: string,
  shape: FilmShape,
  asset: string,
  svg: ShotSvgAssetDto,
  shot: Omit<
    ShotDto,
    'id' | 'startMs' | 'set' | 'join' | 'joinMs' | 'actors' | 'life'
  >,
  durationMs: number,
): SceneDto {
  const { w, h } = STAGES[shape];
  return {
    version: 4,
    generator: 'shots-samples',
    title,
    shape,
    durationMs,
    timing: { beats: [] } as unknown as SceneDto['timing'],
    beats: [],
    things: [],
    steps: [],
    effects: [],
    stagings: { box: { w, h, places: [] }, wide: { w, h, places: [] } },
    engine: 'shots',
    shots: {
      version: 1,
      look: LIGHT_LOOK,
      assets: { [asset]: svg },
      shots: [
        {
          id: `${asset}-1`,
          startMs: 0,
          set: { kind: 'chart', asset },
          actors: [],
          life: [],
          join: 'cut',
          joinMs: 0,
          ...shot,
        },
      ],
      sounds: [],
    },
  } as unknown as SceneDto;
}

async function build(shape: FilmShape): Promise<Record<string, SceneDto>> {
  const regions = chartAsset(
    'chart',
    CHART_SPECS.chart.regions,
    LIGHT_LOOK,
    shape,
  )!;
  const road = chartAsset(
    'timeline',
    CHART_SPECS.timeline.road,
    LIGHT_LOOK,
    shape,
  )!;
  const house = chartAsset(
    'seats',
    CHART_SPECS.seats.house,
    LIGHT_LOOK,
    shape,
  )!;
  const map = (await mapAsset(
    {
      region: 'Nigeria',
      highlight: null,
      places: ['Kano', 'Lagos'],
      routes: [{ from: 'Lagos', to: 'Kano', name: 'The tour north' }],
      groups: [
        { name: 'Northern Region' },
        { name: 'Western Region' },
        { name: 'Eastern Region' },
      ],
      base: {
        kind: 'map',
        region: 'Nigeria',
        groups: [
          {
            name: 'Northern Region',
            members: [
              'Kano',
              'Kaduna',
              'Sokoto',
              'Borno',
              'Bauchi',
              'Plateau',
              'Benue',
              'Kwara',
              'Niger',
              'Katsina',
              'Jigawa',
              'Yobe',
              'Gombe',
              'Adamawa',
              'Taraba',
              'Kogi',
              'Nassarawa',
              'Kebbi',
              'Zamfara',
              'Federal Capital Territory',
            ],
          },
          {
            name: 'Western Region',
            members: [
              'Lagos',
              'Ogun',
              'Oyo',
              'Osun',
              'Ondo',
              'Ekiti',
              'Edo',
              'Delta',
            ],
          },
          {
            name: 'Eastern Region',
            members: [
              'Enugu',
              'Anambra',
              'Imo',
              'Abia',
              'Ebonyi',
              'Rivers',
              'Bayelsa',
              'Cross River',
              'Akwa Ibom',
            ],
          },
        ],
      },
    },
    LIGHT_LOOK,
    shape,
  ))!;
  const events = Object.keys(road.parts).filter((id) =>
    id.startsWith('event-'),
  );
  return {
    numbers: scene(
      'Numbers',
      shape,
      'regions',
      regions,
      {
        endMs: 9000,
        focal: part('regions', 'bars'),
        info: [
          info(
            'grow-north',
            'grow',
            'regions',
            'bar-northern-region',
            400,
            900,
          ),
          info('grow-east', 'grow', 'regions', 'bar-eastern-region', 900, 900),
          info('grow-west', 'grow', 'regions', 'bar-western-region', 1400, 900),
          info(
            'count-north',
            'count',
            'regions',
            'value-northern-region',
            2600,
            1500,
            { value: 16.8, from: 0, unit: 'million' },
          ),
          info(
            'label-north',
            'label',
            'regions',
            'bar-northern-region',
            4600,
            300,
            { text: 'Largest' },
          ),
          info(
            'mark-north',
            'mark',
            'regions',
            'bar-northern-region',
            6200,
            450,
          ),
        ],
        camera: [
          { move: 'establish', atMs: 0, durMs: 1200 },
          {
            move: 'push',
            atMs: 4400,
            durMs: 1200,
            target: part('regions', 'bar-northern-region'),
            amount: 0.12,
          },
          { move: 'pull', atMs: 7600, durMs: 1000, amount: 0.12 },
        ],
      },
      9000,
    ),
    timeline: scene(
      'Timeline',
      shape,
      'road',
      road,
      {
        endMs: 4000 + events.length * 1600,
        focal: part('road', 'spine'),
        info: [
          info('draw-spine', 'draw', 'road', 'spine', 200, 800),
          ...events.map((id, i) =>
            info(`enter-${id}`, 'enter', 'road', id, 1200 + i * 1600, 500),
          ),
        ],
        camera: [
          { move: 'establish', atMs: 0, durMs: 1000 },
          ...events.map((id, i) => ({
            move: 'travel' as const,
            atMs: 1100 + i * 1600,
            durMs: 900,
            target: part('road', id),
          })),
          {
            move: 'pull',
            atMs: 1200 + events.length * 1600,
            durMs: 1200,
            amount: 0.3,
          },
        ],
      },
      4000 + events.length * 1600,
    ),
    seats: scene(
      'Seats',
      shape,
      'house',
      house,
      {
        endMs: 10000,
        focal: part('house', 'chamber'),
        info: [
          info('light-npc', 'enter', 'house', 'group-npc', 800, 900),
          info('light-ncnc', 'enter', 'house', 'group-ncnc', 2300, 900),
          info('light-ag', 'enter', 'house', 'group-action-group', 3800, 900),
          info('light-others', 'enter', 'house', 'group-others', 5300, 700),
          ...(house.parts.total
            ? [
                info('count-total', 'count', 'house', 'total', 6400, 1200, {
                  value: 312,
                }),
              ]
            : []),
          info('draw-majority', 'draw', 'house', 'majority', 8000, 800),
        ],
        camera: [{ move: 'establish', atMs: 0, durMs: 1200 }],
      },
      10000,
    ),
    map: scene(
      'Map',
      shape,
      'map',
      map,
      {
        endMs: 9000,
        focal: part('map', 'group-northern-region'),
        info: [
          info(
            'fill-north',
            'fill',
            'map',
            'group-northern-region',
            1500,
            650,
            { colour: 'accent' },
          ),
          info('pin-kano', 'pin', 'map', 'place-kano', 3200, 350, {
            text: 'Kano',
          }),
          info('draw-route', 'draw', 'map', 'route-the-tour-north', 4800, 1200),
        ],
        camera: [
          { move: 'establish', atMs: 0, durMs: 1500 },
          {
            move: 'push',
            atMs: 3000,
            durMs: 1400,
            target: part('map', 'place-kano'),
            amount: 0.2,
          },
          { move: 'return', atMs: 6800, durMs: 1400 },
        ],
      },
      9000,
    ),
  };
}

void (async () => {
  const dirs = process.argv.slice(2);
  for (const shape of ['wide', 'tall'] as FilmShape[]) {
    const scenes = await build(shape);
    for (const [name, dto] of Object.entries(scenes)) {
      const file = `${name}${shape === 'tall' ? '-tall' : ''}.json`;
      for (const dir of dirs)
        for (const sub of [
          'public/dev-scenes/shots',
          'src/lib/shots/__fixtures__',
        ]) {
          const out = join(dir, sub);
          mkdirSync(out, { recursive: true });
          writeFileSync(join(out, file), `${JSON.stringify(dto, null, 2)}\n`);
        }
      console.log(
        file,
        Object.keys(Object.values(dto.shots!.assets)[0]).length ? 'ok' : '',
      );
    }
  }
})();
