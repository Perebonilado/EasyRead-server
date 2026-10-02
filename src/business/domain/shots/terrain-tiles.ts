/**
 * Terrain for the player's map (explainer-animation-plan §6.1, work
 * package 8): the elevation tiles its hillshade and its tilted terrain are
 * drawn from. They come from Terrain Tiles on AWS Open Data (Mapzen's
 * joerd, in the terrarium encoding: height in metres = R × 256 + G + B /
 * 256 − 32768), whose sources are public domain or open with these
 * attribution lines, and are kept in our own bucket the first time they
 * are asked for, so a render never depends on someone else's server.
 *
 * Pure: which tiles there are, where each is kept and fetched from, and
 * the credits an episode that shows them carries.
 */

/** The closest a tile is served: a city's streets are past what a film's map needs. */
export const TERRAIN_MAX_ZOOM = 12;

/** A tile larger than this is not a terrain tile (they run to about 150 KB). */
export const TERRAIN_MOST_BYTES = 2_000_000;

/** Where a tile comes from. */
export const TERRAIN_SOURCE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

export interface TerrainTile {
  z: number;
  x: number;
  y: number;
}

/** A tile's address read from a request's path: whole numbers, zoom 0 to 12, x and y on that zoom's grid; null for anything else. */
export function readTile(
  z: unknown,
  x: unknown,
  y: unknown,
): TerrainTile | null {
  const whole = (v: unknown) =>
    typeof v === 'string' && /^\d{1,5}$/.test(v)
      ? Number(v)
      : typeof v === 'number' && Number.isInteger(v)
        ? v
        : NaN;
  const [tz, tx, ty] = [whole(z), whole(x), whole(y)];
  if (![tz, tx, ty].every(Number.isInteger)) return null;
  if (tz < 0 || tz > TERRAIN_MAX_ZOOM) return null;
  const side = 2 ** tz;
  if (tx < 0 || ty < 0 || tx >= side || ty >= side) return null;
  return { z: tz, x: tx, y: ty };
}

/** Where a tile is kept in our storage. */
export const terrainKey = ({ z, x, y }: TerrainTile): string =>
  `tiles/terrarium/${z}/${x}/${y}.png`;

/** Where a tile is fetched from the first time. */
export const terrainUrl = ({ z, x, y }: TerrainTile): string =>
  `${TERRAIN_SOURCE}/${z}/${x}/${y}.png`;

/** Whether some bytes are a PNG (its eight-byte signature). */
export function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    bytes.length > signature.length && signature.every((b, i) => bytes[i] === b)
  );
}

/**
 * The attribution lines Terrain Tiles asks for (tilezen/joerd,
 * docs/attribution.md), word for word: an episode whose map shows the
 * terrain carries them in its description.
 */
export const TERRAIN_ATTRIBUTION: readonly string[] = [
  'ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736;',
  'Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;',
  'Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich;',
  'Canada terrain data contains information licensed under the Open Government Licence – Canada;',
  'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;',
  'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
  'Mexico terrain data source: INEGI, Continental relief, 2016;',
  'New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved);',
  'Norway terrain data © Kartverket;',
  'United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved;',
  'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.',
];

/** The map's borders and coasts. */
export const BORDERS_CREDIT =
  'Borders, coasts and states: Natural Earth (public domain).';

/**
 * The credits an episode's description carries for its map: the borders'
 * source, and the terrain's lines when the map is drawn from them (the
 * shots engine's map always shades its land from the terrain). None for
 * a show with no map.
 */
export function mapCredits(hasMap: boolean, terrain: boolean): string[] {
  if (!hasMap) return [];
  return [
    BORDERS_CREDIT,
    ...(terrain
      ? ['Terrain: Terrain Tiles, AWS Open Data.', ...TERRAIN_ATTRIBUTION]
      : []),
  ];
}

/** A description with its credits after it, under their own heading; as it was with none. */
export function withCredits(
  description: string,
  credits: readonly string[],
): string {
  if (!credits.length) return description;
  const block = ['Credits', ...credits].join('\n');
  return description.trim() ? `${description.trim()}\n\n${block}` : block;
}
