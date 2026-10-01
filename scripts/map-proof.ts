/**
 * Maps drawn by code on their own, as PNGs, for looking at: the world, a
 * continent, a country, a small country. No model is asked.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/map-proof.ts <out dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readMap,
  renderMap,
  type MapDraft,
} from '../src/business/domain/scene-map';
import { rasterise } from '../src/business/domain/scene-raster';

const MAPS: Record<string, MapDraft> = {
  world: {
    region: 'world',
    highlight: [
      { name: 'Brazil', label: true, group: null },
      { name: 'India', label: true, group: null },
      { name: 'Nigeria', label: true, group: null },
    ],
    places: ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean'],
    routes: null,
  },
  europe: {
    region: 'Europe',
    highlight: [
      { name: 'France', label: true, group: 'Founding members' },
      { name: 'Germany', label: true, group: 'Founding members' },
      { name: 'Italy', label: true, group: 'Founding members' },
      { name: 'Belgium', label: false, group: 'Founding members' },
      { name: 'Netherlands', label: false, group: 'Founding members' },
      { name: 'Luxembourg', label: false, group: 'Founding members' },
      { name: 'Spain', label: false, group: 'Joined later' },
      { name: 'Poland', label: false, group: 'Joined later' },
    ],
    places: ['Brussels'],
    routes: null,
  },
  africa: {
    region: 'Africa',
    highlight: [
      { name: 'DRC', label: true, group: 'Sleeping sickness' },
      { name: 'Angola', label: false, group: 'Sleeping sickness' },
      { name: 'Uganda', label: false, group: 'Sleeping sickness' },
    ],
    places: ['Kinshasa', 'Kampala', 'Lake Victoria', 'Sahara'],
    routes: null,
  },
  rwanda: {
    region: 'Rwanda',
    highlight: null,
    places: ['Kigali', 'Lake Victoria'],
    routes: null,
  },
  uk: {
    region: 'UK',
    highlight: null,
    places: ['London', 'Edinburgh', 'Cardiff', 'Belfast'],
    routes: null,
  },
  japan: {
    region: 'Japan',
    highlight: null,
    places: ['Tokyo', 'Mount Fuji', 'Osaka', 'Sapporo'],
    routes: null,
  },
  silk: {
    region: 'Asia',
    highlight: null,
    places: ["Xi'an", 'Samarkand', 'Istanbul'],
    routes: [
      { from: "Xi'an", to: 'Samarkand', name: null },
      { from: 'Samarkand', to: 'Istanbul', name: null },
    ],
  },
  chile: {
    region: 'Chile',
    highlight: null,
    places: ['Santiago', 'Atacama'],
    routes: null,
  },
  usa: {
    region: 'United States',
    highlight: null,
    places: ['Washington, D.C.', 'Chicago', 'Los Angeles'],
    routes: null,
  },
  uganda: {
    region: 'Uganda',
    highlight: null,
    places: ['Kampala', 'Lake Victoria', 'Nile'],
    routes: null,
  },
  egypt: {
    region: 'Egypt',
    highlight: null,
    places: ['Cairo', 'Nile', 'Lake Nasser', 'Red Sea'],
    routes: null,
  },
  brazil: {
    region: 'South America',
    highlight: [{ name: 'Brazil', label: true, group: null }],
    places: ['Brasília', 'Amazon River', 'Rio de Janeiro'],
    routes: null,
  },
};

async function main() {
  const out = process.argv[2] ?? 'scene-out/maps';
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
      console.log(
        `${name} ${shape}: ${map.projection} ${map.resolution}, ${(map.svg.length / 1024).toFixed(1)} KB, ${map.viewBox.join(' ')}, ${Date.now() - t} ms; parts ${Object.keys(map.parts).join(', ')}; callouts ${map.callouts.length}${dropped.length ? `; dropped: ${dropped.join('; ')}` : ''}${map.outside.length ? `; outside: ${map.outside.join(', ')}` : ''}`,
      );
    }
  }
}

void main();
