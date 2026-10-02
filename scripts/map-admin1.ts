/**
 * Areas inside countries, for a map drawn by code (scene-map): Natural
 * Earth's admin-1 states and provinces (ne_10m_admin_1_states_provinces,
 * 4,596 of them in 253 countries and territories), made into one compact
 * TopoJSON, assets/maps/admin1.json, so a map can colour Kano State,
 * Bavaria or California, merge a country's states into a named region
 * ("the Northern Region"), and draw the border two such regions share.
 *
 * Each area keeps only what a map needs to find it and draw it:
 *
 *  - k: its key, its ISO 3166-2 code ("NG-KN"), or one made from its
 *    country's where it has none or shares one;
 *  - n: its name as a map writes it, the English one where the local one
 *    is another language's (Bayern: Bavaria);
 *  - a: its other names (the local one, Natural Earth's alternates, its
 *    name with its kind, "Kano State"), Latin script only, "|" between;
 *  - c: its country, as world-atlas names it (scene-map-places);
 *  - t: what kind of area it is ("State", "Province", "Region");
 *  - r: the larger region it is in, where Natural Earth gives one (a
 *    United States census region, a French région, an Italian regione);
 *  - p: the part of its country it is in, where the country is made of
 *    parts (Scotland, Wales; Zanzibar; Flanders).
 *
 * Its outlines are simplified to a kilometre and quantized to about 400
 * metres, keeping every shape however small, with mapshaper
 * (mapshaper.org, github.com/mbloch/mapshaper), which keeps the borders
 * areas share as one line, so two areas merged have no seam and two
 * regions' shared border can be drawn on its own.
 *
 * Natural Earth is public domain (naturalearthdata.com/about/terms-of-use).
 * The GeoJSON is from its official repository, nvkelso/natural-earth-vector,
 * release v5.1.2 (geojson/ne_10m_admin_1_states_provinces.geojson), and is
 * not kept here:
 *
 *   curl -L -o ne_10m_admin_1_states_provinces.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
 *   npx ts-node --transpile-only scripts/map-admin1.ts ne_10m_admin_1_states_provinces.geojson
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ATLAS_COUNTRIES,
  countriesNamed,
  placeKey,
} from '../src/business/domain/scene-map-places';

const MAPSHAPER = 'mapshaper@0.7.72';
/** Outlines simplified to this, in metres: finer than a map of a country shows. */
const SIMPLIFY_METRES = 1000;
/** Coordinates quantized to this many steps across the world: about 400 metres. */
const QUANTIZATION = 100_000;
/** Other names longer than this are descriptions, not names. */
const LONGEST_NAME = 40;
/** The most other names an area keeps. */
const MOST_OTHERS = 8;

const SOURCE =
  'Natural Earth (naturalearthdata.com), public domain; ne_10m_admin_1_states_provinces from github.com/nvkelso/natural-earth-vector v5.1.2 (geojson/)';

/** Natural Earth's countries world-atlas names otherwise, or holds inside another. */
const COUNTRY_OF: Record<string, string | null> = {
  'Gaza Strip': 'Palestine',
  'West Bank': 'Palestine',
  'Republic of Serbia': 'Serbia',
  'Hong Kong S.A.R.': 'Hong Kong',
  'Macau S.A.R': 'Macao',
  'United States Virgin Islands': 'U.S. Virgin Is.',
  'Indian Ocean Territories': 'Indian Ocean Ter.',
  'South Georgia and the Islands': 'S. Geo. and the Is.',
  'Ashmore and Cartier Islands': 'Ashmore and Cartier Is.',
  'Caribbean Netherlands': 'Netherlands',
  'Baykonur Cosmodrome': 'Kazakhstan',
  // Territories world-atlas does not draw: left out, as the map cannot show them.
  'Dhekelia Sovereign Base Area': null,
  'Akrotiri Sovereign Base Area': null,
  'US Naval Base Guantanamo Bay': null,
  Gibraltar: null,
  'United States Minor Outlying Islands': null,
  Tuvalu: null,
  'Coral Sea Islands': null,
  'Spratly Is.': null,
  'Clipperton Island': null,
};

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

const text = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

/** Whether a name is in the Latin script, as the writer writes names. */
const latin = (name: string) =>
  /^[\p{Script=Latin}\p{N}\s.,'’()&/-]+$/u.test(name) &&
  /\p{Script=Latin}/u.test(name);

const from = resolve(
  process.argv[2] ?? 'ne_10m_admin_1_states_provinces.geojson',
);
const to = resolve(__dirname, '..', 'assets', 'maps', 'admin1.json');
const features = (
  JSON.parse(readFileSync(from, 'utf8')) as { features: Feature[] }
).features;

/** world-atlas's country for an area, from Natural Earth's names for its country and its part. */
function countryOf(p: Record<string, unknown>): string | null {
  const admin = text(p.admin);
  if (admin in COUNTRY_OF) return COUNTRY_OF[admin];
  const found = countriesNamed(admin)[0] ?? countriesNamed(text(p.geonunit))[0];
  return found && ATLAS_COUNTRIES.includes(found) ? found : null;
}

// Each country's areas' local and English names, to tell when an English
// name is another area's (the District of Columbia's is "Washington").
const namesIn = new Map<string, Set<string>>();
for (const f of features) {
  const country = countryOf(f.properties);
  if (!country) continue;
  const names = namesIn.get(country) ?? new Set<string>();
  names.add(placeKey(text(f.properties.name)));
  namesIn.set(country, names);
}

/** The name a map writes for an area: its English name where its own is another language's. */
function nameOf(p: Record<string, unknown>, country: string): string {
  const local = text(p.name) || text(p.name_en) || text(p.gn_name);
  const english = text(p.name_en);
  if (!english || !latin(english) || english === local) return local;
  const [lk, ek] = [placeKey(local), placeKey(english)];
  // "Kebbi State" is Kebbi with its kind; "Free Hanseatic Bremen", Bremen.
  if (ek.includes(lk)) return local;
  // Another area's own name in the country: not this one's.
  if (namesIn.get(country)?.has(ek)) return local;
  return latin(local) && lk === ek ? local : english;
}

const keys = new Map<string, number>();
const dropped = new Map<string, number>();
const slim: Feature[] = [];
for (const f of features) {
  const p = f.properties;
  const country = countryOf(p);
  if (!country || !f.geometry) {
    const admin = text(p.admin);
    dropped.set(admin, (dropped.get(admin) ?? 0) + 1);
    continue;
  }
  const name = nameOf(p, country);
  // Its key: its ISO 3166-2 code, once; else one from its country's.
  const iso = text(p.iso_3166_2);
  let key = /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(iso)
    ? iso
    : `${text(p.iso_a2) || text(p.adm0_a3) || 'XX'}-${placeKey(name).replace(/ /g, '').slice(0, 6).toUpperCase() || 'X'}`;
  const seen = keys.get(key) ?? 0;
  keys.set(key, seen + 1);
  if (seen) key = `${key}~${seen + 1}`;
  const own = placeKey(name);
  const others = [
    text(p.name),
    text(p.name_en),
    ...text(p.name_alt).split('|'),
    text(p.woe_name),
    text(p.gn_name),
  ]
    .map((one) => one.trim())
    .filter(
      (one, i, all) =>
        one &&
        one.length <= LONGEST_NAME &&
        latin(one) &&
        placeKey(one) !== own &&
        all.findIndex((other) => placeKey(other) === placeKey(one)) === i,
    )
    .slice(0, MOST_OTHERS);
  const part = text(p.geonunit);
  const region = text(p.region);
  slim.push({
    type: 'Feature',
    properties: {
      k: key,
      n: name,
      a: others.join('|'),
      c: country,
      t: text(p.type_en) || text(p.type),
      r: region,
      // A part of its country, not the country by another name.
      p:
        part && part !== text(p.admin) && countriesNamed(part)[0] !== country
          ? part
          : '',
    },
    geometry: f.geometry,
  });
}

const work = mkdtempSync(join(tmpdir(), 'map-admin1-'));
try {
  const input = join(work, 'units.json');
  const output = join(work, 'admin1.json');
  writeFileSync(
    input,
    JSON.stringify({ type: 'FeatureCollection', features: slim }),
  );
  execFileSync(
    'npx',
    [
      '--yes',
      MAPSHAPER,
      '-i',
      input,
      '-rename-layers',
      'units',
      '-simplify',
      `interval=${SIMPLIFY_METRES}`,
      'keep-shapes',
      '-o',
      'format=topojson',
      `quantization=${QUANTIZATION}`,
      output,
    ],
    { stdio: 'inherit' },
  );
  const topology = JSON.parse(readFileSync(output, 'utf8')) as Record<
    string,
    unknown
  >;
  writeFileSync(
    to,
    JSON.stringify({
      source: SOURCE,
      columns: {
        k: 'key: ISO 3166-2 code, or one made from its country',
        n: 'name, as a map writes it',
        a: 'other names, "|" between',
        c: 'country, as world-atlas names it',
        t: 'kind of area',
        r: 'the larger region it is in, where Natural Earth gives one',
        p: 'the part of its country it is in (Scotland), where there is one',
      },
      ...topology,
    }),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
const size = readFileSync(to).length;
console.log(
  `areas ${slim.length} in ${namesIn.size} countries, ${(size / 1024 / 1024).toFixed(2)} MB` +
    (dropped.size
      ? `; left out (no country world-atlas draws): ${[...dropped].map(([c, n]) => `${c} ${n}`).join(', ')}`
      : ''),
);
