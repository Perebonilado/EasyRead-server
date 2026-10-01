/**
 * The extra map data, trimmed from Natural Earth's own GeoJSON to what a
 * map drawn by code needs (scene-map), and written to assets/maps/:
 *
 *  - places.json: populated places (ne_50m_populated_places_simple):
 *    each name, its other names, its country, latitude and longitude,
 *    what it is (a capital, a populated place) and how many live there;
 *  - rivers.json: named rivers and lake centrelines
 *    (ne_50m_rivers_lake_centerlines), as lines;
 *  - lakes.json: lakes and reservoirs (ne_50m_lakes), as polygons.
 *
 * Natural Earth is public domain (naturalearthdata.com/about/terms-of-use);
 * the files came from its official repository, nvkelso/natural-earth-vector
 * (geojson/), and are not kept here. Coordinates are rounded to what a
 * map on a screen can show: places to four decimal places, rivers and
 * lakes to two (about a kilometre), their points thinned where closer.
 *
 *   npx ts-node --transpile-only scripts/map-data.ts <folder of the downloaded geojson>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Position = [number, number];
interface Feature {
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
}

const from = resolve(process.argv[2] ?? '.');
const to = resolve(__dirname, '..', 'assets', 'maps');
mkdirSync(to, { recursive: true });
const read = (name: string) =>
  (
    JSON.parse(readFileSync(join(from, `${name}.geojson`), 'utf8')) as {
      features: Feature[];
    }
  ).features;
const SOURCE =
  'Natural Earth (naturalearthdata.com), public domain; from github.com/nvkelso/natural-earth-vector, geojson/';

const round = (n: number, d: number) => Number(n.toFixed(d));
const text = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

/** A line's points rounded, those that round to the last dropped, and those within `least` of a straight run thinned (Douglas–Peucker). */
function thin(line: Position[], least: number): Position[] {
  const rounded: Position[] = [];
  for (const [x, y] of line) {
    const p: Position = [round(x, 2), round(y, 2)];
    const last = rounded[rounded.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) rounded.push(p);
  }
  if (rounded.length <= 2) return rounded;
  const keep = new Array<boolean>(rounded.length).fill(false);
  keep[0] = keep[rounded.length - 1] = true;
  const stack: [number, number][] = [[0, rounded.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = rounded[a];
    const [bx, by] = rounded[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let farD = 0;
    for (let i = a + 1; i < b; i++) {
      const d =
        Math.abs(dy * rounded[i][0] - dx * rounded[i][1] + bx * ay - by * ax) /
        length;
      if (d > farD) [far, farD] = [i, d];
    }
    if (far > 0 && farD > least) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return rounded.filter((_, i) => keep[i]);
}

/** A closed ring thinned as two halves, so its ends (one point) are never taken for a straight run. */
function thinRing(ring: Position[], least: number): Position[] {
  if (ring.length < 8) return thin(ring, least);
  const mid = Math.floor(ring.length / 2);
  const a = thin(ring.slice(0, mid + 1), least);
  const b = thin(ring.slice(mid), least);
  return [...a, ...b.slice(1)];
}

// Places: [name, other names ("|" between), country, lat, lon, kind, population, rank].
const KINDS: Record<string, number> = {
  'Admin-0 capital': 1,
  'Admin-0 capital alt': 2,
  'Admin-0 region capital': 3,
  'Admin-1 capital': 4,
  'Admin-1 region capital': 4,
  'Populated place': 0,
  'Historic place': 0,
  'Scientific station': 5,
};
const places = read('ne_50m_populated_places_simple').map((f) => {
  const p = f.properties;
  const name = text(p.name);
  const others = [
    text(p.nameascii),
    text(p.namealt),
    text(p.namepar),
    text(p.meganame),
    text(p.ls_name),
  ]
    .flatMap((n) => n.split('|'))
    .map((n) => n.trim())
    .filter((n, i, all) => n && n !== name && all.indexOf(n) === i);
  return [
    name,
    others.join('|'),
    text(p.adm0name),
    round(Number(p.latitude), 4),
    round(Number(p.longitude), 4),
    KINDS[text(p.featurecla)] ?? 0,
    Number(p.pop_max) || 0,
    Number(p.scalerank) || 0,
  ];
});
writeFileSync(
  join(to, 'places.json'),
  JSON.stringify({
    source: `${SOURCE}ne_50m_populated_places_simple.geojson`,
    columns: [
      'name',
      'other names',
      'country',
      'lat',
      'lon',
      'kind (0 place, 1 capital, 2 other capital, 3 territory capital, 4 province capital, 5 station)',
      'population',
      'rank',
    ],
    places,
  }),
);

// Rivers: by Natural Earth's name, each a list of lines.
const rivers: Record<string, Position[][]> = {};
for (const f of read('ne_50m_rivers_lake_centerlines')) {
  const name = text(f.properties.name);
  if (!name || !f.geometry) continue;
  const lines = (
    f.geometry.type === 'LineString'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates
  ) as Position[][];
  for (const line of lines) {
    const kept = thin(line, 0.02);
    if (kept.length >= 2) (rivers[name] ??= []).push(kept);
  }
}
writeFileSync(
  join(to, 'rivers.json'),
  JSON.stringify({
    source: `${SOURCE}ne_50m_rivers_lake_centerlines.geojson`,
    rivers,
  }),
);

// Lakes: [name ("" for one with none), its polygons].
const lakes: [string, Position[][][]][] = [];
for (const f of read('ne_50m_lakes')) {
  if (!f.geometry) continue;
  const polygons = (
    f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates
  ) as Position[][][];
  const kept = polygons
    .map((rings) =>
      rings
        .map((ring) => thinRing(ring, 0.02))
        .filter((ring) => ring.length >= 4),
    )
    .filter((rings) => rings.length);
  if (kept.length) lakes.push([text(f.properties.name), kept]);
}
writeFileSync(
  join(to, 'lakes.json'),
  JSON.stringify({ source: `${SOURCE}ne_50m_lakes.geojson`, lakes }),
);
console.log(
  `places ${places.length}, rivers ${Object.keys(rivers).length}, lakes ${lakes.length}`,
);
