/**
 * Maps with areas inside countries, named regions, seams, pins and a
 * show's one frame, drawn by code as PNGs for looking at (scene-map). No
 * model is asked.
 *
 *  - Nigeria's three regions of 1946, as groups of today's states, with
 *    the seams between North and South, in the show's frame;
 *  - Germany's Länder as East and West, with the border between them;
 *  - India's states, three coloured, a pin with a number on New Delhi;
 *  - the United States' states as its four census regions.
 *
 * Each in a wide and a tall film, and in a dark theme as the stage would
 * recolour it.
 *
 *   npx ts-node --transpile-only scripts/map-groups-proof.ts <out dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readMap,
  renderMap,
  type MapDraft,
  type ShowMapBase,
} from '../src/business/domain/scene-map';
import { rasterise } from '../src/business/domain/scene-raster';
import { THEMES, themedCode } from '../src/business/domain/scene-themes';

const NIGERIA: ShowMapBase = {
  kind: 'map',
  region: 'Nigeria',
  groups: [
    {
      name: 'Northern Region',
      members: [
        'Sokoto',
        'Kebbi',
        'Zamfara',
        'Katsina',
        'Kano',
        'Jigawa',
        'Yobe',
        'Borno',
        'Kaduna',
        'Bauchi',
        'Gombe',
        'Adamawa',
        'Taraba',
        'Plateau',
        'Nasarawa',
        'Benue',
        'Kogi',
        'Kwara',
        'Niger',
        'Federal Capital Territory',
      ],
      colour: 'chart1',
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
      colour: 'chart2',
    },
    {
      name: 'Eastern Region',
      members: [
        'Anambra',
        'Enugu',
        'Ebonyi',
        'Imo',
        'Abia',
        'Rivers',
        'Bayelsa',
        'Akwa Ibom',
        'Cross River',
      ],
      colour: 'chart0',
    },
  ],
  year: 1946,
};

const MAPS: Record<string, MapDraft> = {
  'nigeria-1946': {
    region: 'Nigeria',
    highlight: null,
    places: null,
    routes: null,
    groups: [
      { name: 'Northern Region' },
      { name: 'Western Region' },
      { name: 'Eastern Region' },
    ],
    seams: [
      { between: ['Northern Region', 'Western Region'], style: 'dashed' },
      { between: ['Northern Region', 'Eastern Region'], style: 'dashed' },
    ],
    pins: [{ place: 'Lagos', label: 'Lagos' }],
    base: NIGERIA,
  },
  germany: {
    region: 'Germany',
    highlight: null,
    routes: null,
    groups: [
      {
        name: 'East Germany',
        members: [
          'Mecklenburg-Vorpommern',
          'Brandenburg',
          'Saxony-Anhalt',
          'Thuringia',
          'Saxony',
          'Berlin',
        ],
        colour: 'chart3',
      },
      {
        name: 'West Germany',
        members: [
          'Schleswig-Holstein',
          'Hamburg',
          'Bremen',
          'Lower Saxony',
          'North Rhine-Westphalia',
          'Hesse',
          'Rhineland-Palatinate',
          'Saarland',
          'Baden-Württemberg',
          'Bavaria',
        ],
        colour: 'chart0',
      },
    ],
    seams: [{ between: ['East Germany', 'West Germany'], style: 'glow' }],
    places: ['Berlin'],
    year: 1961,
  },
  india: {
    region: 'India',
    highlight: null,
    routes: null,
    places: null,
    areas: [
      { name: 'Kerala', label: true, group: 'Above 90% literate' },
      { name: 'Mizoram', label: false, group: 'Above 90% literate' },
      { name: 'Bihar', label: true, group: 'Below 70% literate' },
    ],
    pins: [{ place: 'New Delhi', label: 'New Delhi', number: '1.4 billion' }],
  },
  'usa-census': {
    region: 'United States',
    highlight: null,
    places: null,
    routes: null,
    groups: [
      { name: 'Northeast', members: ['Northeast'] },
      { name: 'Midwest', members: ['Midwest'] },
      { name: 'South', members: ['South'] },
      { name: 'West', members: ['West'] },
    ],
  },
};

async function main() {
  const out = process.argv[2] ?? 'scene-out/map-groups';
  mkdirSync(out, { recursive: true });
  const only = process.argv.slice(3);
  for (const [name, draft] of Object.entries(MAPS)) {
    if (only.length && !only.includes(name)) continue;
    const { spec, dropped } = readMap(draft);
    if (!spec) throw new Error(`${name}: nothing to show`);
    for (const shape of ['wide', 'tall'] as const) {
      const t = Date.now();
      const map = await renderMap(spec, shape);
      writeFileSync(join(out, `${name}-${shape}.svg`), map.svg);
      writeFileSync(
        join(out, `${name}-${shape}.png`),
        await rasterise(map.svg, 1000),
      );
      if (shape === 'wide')
        writeFileSync(
          join(out, `${name}-${shape}-nightsky.png`),
          await rasterise(
            // On the theme's own ground, as the stage shows it.
            themedCode(map.svg, THEMES.nightsky, 'map').replace(
              /<svg([^>]*)>/,
              `<svg$1><rect x="-50" y="-50" width="5000" height="5000" fill="${THEMES.nightsky.paper}"/>`,
            ),
            1000,
          ),
        );
      console.log(
        `${name} ${shape}: ${map.projection} ${map.resolution}${map.framed ? ' framed' : ''}${map.period ? ' period' : ''}, ${(map.svg.length / 1024).toFixed(1)} KB, ${map.viewBox.join(' ')}, ${Date.now() - t} ms; parts ${Object.keys(map.parts).join(', ')}${dropped.length ? `; dropped: ${dropped.join('; ')}` : ''}${map.outside.length ? `; outside: ${map.outside.join(', ')}` : ''}`,
      );
    }
  }
}

void main();
