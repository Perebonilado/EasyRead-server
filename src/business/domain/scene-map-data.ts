/**
 * Natural Earth's places, rivers and lakes, as a map drawn by code reads
 * them (scene-map, scene-map-places). Natural Earth is public domain
 * (naturalearthdata.com/about/terms-of-use). The files in assets/maps are
 * its 1:50m populated places, rivers and lake centrelines, and lakes,
 * trimmed by scripts/map-data.ts from the GeoJSON in its official
 * repository (github.com/nvkelso/natural-earth-vector, geojson/): names,
 * countries, coordinates and outlines only, rounded to what a screen
 * shows. Each is read once, when a map first needs it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Position = [number, number];

/** assets/maps, found from here: in the source tree and in the build alike. */
function dataPath(file: string): string {
  let at = __dirname;
  for (let up = 0; up < 8; up++) {
    const path = join(at, 'assets', 'maps', file);
    if (existsSync(path)) return path;
    at = dirname(at);
  }
  throw new Error(`the map data ${file} is missing from assets/maps`);
}

const kept = new Map<string, unknown>();
function load<T>(file: string): T {
  if (!kept.has(file))
    kept.set(file, JSON.parse(readFileSync(dataPath(file), 'utf8')));
  return kept.get(file) as T;
}

/** A populated place as Natural Earth lists it. */
export interface NaturalPlace {
  name: string;
  others: string[];
  /** Natural Earth's name for its country ("Congo (Kinshasa)", "Ivory Coast"). */
  country: string;
  lat: number;
  lon: number;
  /** 0 a place, 1 a country's capital, 2 its other capital, 3 a territory's, 4 a province's, 5 a station. */
  kind: number;
  population: number;
}

let places: NaturalPlace[] | null = null;
/** Natural Earth's populated places (1:50m): about 1,250 capitals and great cities. */
export function naturalPlaces(): NaturalPlace[] {
  places ??= load<{
    places: [string, string, string, number, number, number, number, number][];
  }>('places.json').places.map(
    ([name, others, country, lat, lon, kind, population]) => ({
      name,
      others: others ? others.split('|') : [],
      country,
      lat,
      lon,
      kind,
      population,
    }),
  );
  return places;
}

/** Natural Earth's rivers (1:50m), by its names for them: each a list of lines. */
export const naturalRivers = (): Record<string, Position[][]> =>
  load<{ rivers: Record<string, Position[][]> }>('rivers.json').rivers;

/** The planar area of a ring, in degrees: below zero, clockwise as the map is drawn. */
const signedArea = (ring: Position[]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
};

export interface NaturalLake {
  name: string;
  /** Its polygons, wound as d3 draws them: the outer ring clockwise, an island in it the other way. */
  polygons: Position[][][];
}

let lakes: NaturalLake[] | null = null;
/** Natural Earth's lakes and reservoirs (1:50m), named or not. */
export function naturalLakes(): NaturalLake[] {
  lakes ??= load<{ lakes: [string, Position[][][]][] }>('lakes.json').lakes.map(
    ([name, polygons]) => ({
      name,
      polygons: polygons.map((rings) =>
        rings.map((ring, k) => {
          const clockwise = signedArea(ring) < 0;
          // The outer ring clockwise, and every ring inside it the other way.
          return clockwise === (k === 0) ? ring : [...ring].reverse();
        }),
      ),
    }),
  );
  return lakes;
}
