/**
 * A map on the stage, drawn by code from real geographic data, as a chart
 * is drawn from the page's own numbers. The writer names the region, the
 * countries to colour, the places to mark and the journeys between them;
 * code looks every one up (scene-map-places) and draws them from Natural
 * Earth's coastlines and borders (world-atlas) with d3-geo, projected to
 * suit the region and fitted to the frame of the film. A model asked to
 * draw a map draws the idea of one, with coastlines and borders where it
 * remembers them; this is the map.
 *
 * Countries are drawn flat in the house tokens (scene-themes): the sea a
 * tint of the second accent, the land shown in the region white, its
 * neighbours muted, borders thin; the highlighted countries in the
 * accent colours, a colour for each group. Each highlight, place and
 * route is a part the voice can point at, and the names are labels the
 * stage sets, placed by the same code as a drawing's (scene-labels).
 */
import { readFileSync } from 'node:fs';
import { feature, merge, mesh } from 'topojson-client';
import type {
  GeometryCollection,
  GeometryObject,
  Topology,
} from 'topojson-specification';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import type { GeoProjection, GeoStream } from 'd3-geo';
import type { Callout } from './scene-callouts';
import { measureText } from './scene-font';
import { groupId } from './scene-ids';
import {
  CONTINENT_OF,
  countriesNamed,
  highlightCountries,
  placeNamed,
  readRegion,
  type GeoBox,
  type PlaceKind,
} from './scene-map-places';
import {
  naturalLakes,
  naturalRivers,
  type NaturalLake,
} from './scene-map-data';
import { PAPER } from './scene-themes';

// ── The map as the writer gives it, read ──────────────────────────────────

/** A map as the writer asks for it: names only, never a coordinate. */
export interface MapDraft {
  /** "world", a continent, a region, a country, or a list of them. */
  region: string;
  highlight:
    { name: string; label?: boolean | null; group?: string | null }[] | null;
  places: string[] | null;
  routes: { from: string; to: string; name?: string | null }[] | null;
}

/** One end of a route: a place's point, or a country (its middle, found when drawn). */
export interface RouteEnd {
  name: string;
  at: [number, number] | null;
  countries: string[];
}

/** A map as code reads it: every name looked up. */
export interface MapSpec {
  region: {
    name: string;
    kind: 'world' | 'continent' | 'region' | 'countries';
    /** The countries it is of (none for the world). */
    countries: string[];
    /** A continent's frame, in degrees (west, south, east, north). */
    box: GeoBox | null;
  };
  highlights: {
    name: string;
    countries: string[];
    label: boolean;
    /** Its group's place in `groups`. */
    group: number;
  }[];
  /** The groups' names, in order; "" for one the writer did not name. */
  groups: string[];
  places: {
    name: string;
    /** Where its mark or its name goes. */
    lon: number;
    lat: number;
    kind: PlaceKind;
    /** A river: Natural Earth's names for its stretches, drawn as lines. */
    river?: string[];
    /** A lake: Natural Earth's name for it, drawn as itself. */
    lake?: string;
    /** A sea: other points in it (longitude, latitude), to name it at when the first is out of view. */
    alts?: [number, number][];
  }[];
  routes: { name: string; from: RouteEnd; to: RouteEnd }[];
}

/** The most a map holds: what a learner can follow on one picture. */
export const MAP_LIMITS = {
  highlights: 60,
  groups: 4,
  places: 10,
  routes: 4,
} as const;

const tidy = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The writer's map looked up by code: its region, the countries each
 * highlight colours, each place's coordinates and each route's ends.
 * A name code does not know is left off and said in `dropped`; a map
 * with nothing it knows to show is null.
 */
export function readMap(draft: MapDraft | null | undefined): {
  spec: MapSpec | null;
  dropped: string[];
} {
  const dropped: string[] = [];
  if (!draft) return { spec: null, dropped };
  // Highlights: each its countries, a country coloured once.
  const groups: string[] = [];
  const coloured = new Set<string>();
  const highlights: MapSpec['highlights'] = [];
  for (const raw of (draft.highlight ?? []).slice(
    0,
    MAP_LIMITS.highlights * 2,
  )) {
    const name = tidy(raw?.name);
    if (!name) continue;
    const countries = highlightCountries(name).filter((c) => !coloured.has(c));
    if (!countries.length) {
      if (!highlightCountries(name).length)
        dropped.push(`"${name}" is no country or region the map knows`);
      continue;
    }
    if (highlights.length >= MAP_LIMITS.highlights) {
      dropped.push(`"${name}": a map colours ${MAP_LIMITS.highlights} at most`);
      continue;
    }
    const group = tidy(raw.group);
    let index = groups.indexOf(group);
    if (index < 0) {
      if (groups.length < MAP_LIMITS.groups) {
        groups.push(group);
        index = groups.length - 1;
      } else {
        dropped.push(
          `"${name}": a map has ${MAP_LIMITS.groups} colours at most; in the last`,
        );
        index = groups.length - 1;
      }
    }
    for (const c of countries) coloured.add(c);
    highlights.push({
      name,
      countries,
      label: raw.label === true,
      group: index,
    });
  }
  // Places, by name only.
  const places: MapSpec['places'] = [];
  const addPlace = (said: string): MapSpec['places'][number] | null => {
    const found = placeNamed(said);
    if (!found) return null;
    const kept = places.find((p) => p.name === found.name);
    if (kept) return kept;
    if (places.length >= MAP_LIMITS.places) return null;
    const place: MapSpec['places'][number] = {
      name: found.name,
      lon: found.lon,
      lat: found.lat,
      kind: found.kind,
      ...(found.river ? { river: [...found.river] } : {}),
      ...(found.lake ? { lake: found.lake } : {}),
      ...(found.alts
        ? { alts: found.alts.map(([lat, lon]): [number, number] => [lon, lat]) }
        : {}),
    };
    places.push(place);
    return place;
  };
  for (const raw of draft.places ?? []) {
    const said = tidy(
      typeof raw === 'string' ? raw : (raw as { name?: string })?.name,
    );
    if (!said) continue;
    if (addPlace(said)) continue;
    dropped.push(
      countriesNamed(said).length
        ? `"${said}" is a country, not a place: colour it as a highlight`
        : placeNamed(said) && places.length >= MAP_LIMITS.places
          ? `"${said}": a map marks ${MAP_LIMITS.places} places at most`
          : `"${said}" is no place the map knows`,
    );
  }
  // Routes: from a place or a country to another.
  const endOf = (said: string): RouteEnd | null => {
    const place = addPlace(said);
    if (place)
      return { name: place.name, at: [place.lon, place.lat], countries: [] };
    const countries = countriesNamed(said);
    return countries.length
      ? { name: said, at: null, countries: [...countries] }
      : null;
  };
  const routes: MapSpec['routes'] = [];
  for (const raw of (draft.routes ?? []).slice(0, MAP_LIMITS.routes)) {
    const [fromSaid, toSaid] = [tidy(raw?.from), tidy(raw?.to)];
    if (!fromSaid || !toSaid) continue;
    const [from, to] = [endOf(fromSaid), endOf(toSaid)];
    if (!from || !to) {
      dropped.push(
        `the route from "${fromSaid}" to "${toSaid}": ${!from ? fromSaid : toSaid} is no place the map knows`,
      );
      continue;
    }
    routes.push({
      name: tidy(raw.name) || `${from.name} to ${to.name}`,
      from,
      to,
    });
  }
  // The region; failing that, what it colours and marks.
  const read = readRegion(tidy(draft.region));
  for (const one of read.unknown)
    dropped.push(`"${one}" is no part of the world the map knows`);
  let region: MapSpec['region'] | null = read.region
    ? read.region.kind === 'world'
      ? { name: 'World', kind: 'world', countries: [], box: null }
      : read.region.kind === 'countries'
        ? {
            name: read.region.name,
            kind: 'countries',
            countries: read.region.countries,
            box: null,
          }
        : {
            name: read.region.name,
            kind: read.region.kind,
            countries: [...read.region.entry.members],
            box: read.region.entry.box,
          }
    : null;
  if (!region) {
    const countries = [...coloured];
    if (countries.length)
      region = {
        name: highlights.map((h) => h.name).join(', '),
        kind: 'countries',
        countries,
        box: null,
      };
    else if (places.length || routes.length)
      region = { name: '', kind: 'countries', countries: [], box: null };
  }
  if (!region) return { spec: null, dropped };
  return {
    spec: { region, highlights, groups, places, routes },
    dropped,
  };
}

/** The names of a map's parts, as the voice points at them: each highlight, place and route. */
export const mapPartNames = (spec: MapSpec): string[] => [
  ...spec.highlights.map((h) => h.name),
  ...spec.places.map((p) => p.name),
  ...spec.routes.map((r) => r.name),
];

// ── The data ──────────────────────────────────────────────────────────────

type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

interface Atlas {
  topology: Topology;
  countries: CountryFeature[];
  byName: Map<string, CountryFeature>;
}

const atlases = new Map<'50m' | '110m', Atlas>();

/** world-atlas's countries at a resolution, read once while the process runs. */
export function atlasOf(resolution: '50m' | '110m'): Atlas {
  const kept = atlases.get(resolution);
  if (kept) return kept;
  const topology = JSON.parse(
    readFileSync(
      require.resolve(`world-atlas/countries-${resolution}.json`),
      'utf8',
    ),
  ) as Topology;
  const collection = feature(
    topology,
    topology.objects.countries,
  ) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const countries = collection.features.filter((f) => f.geometry);
  const atlas: Atlas = {
    topology,
    countries,
    byName: new Map(countries.map((f) => [f.properties.name, f])),
  };
  atlases.set(resolution, atlas);
  return atlas;
}

type D3Geo = typeof import('d3-geo');
let d3: Promise<D3Geo> | null = null;
/** d3-geo, an ES module, loaded once as one. */
export const d3Geo = (): Promise<D3Geo> => (d3 ??= import('d3-geo'));

// ── Drawing ───────────────────────────────────────────────────────────────

/**
 * The drawing's area by the film's shape: a wide film's map wide or tall
 * as its region is, between these; a tall film's square or portrait
 * (studio-vertical-plan §4.2, as drawingShapeFor asks of a drawing).
 */
const FRAME = {
  wide: { area: 1000 * 640, aspect: [0.8, 1.9] as const, text: 40 },
  tall: { area: 820 * 820, aspect: [0.75, 1.15] as const, text: 46 },
} as const;

/** How far apart two points of an outline are kept, in the drawing's units: closer, one is dropped. */
const THIN = 1.3;
/** The most a map's drawing may weigh; past it, drawn again with its outlines thinned further. */
export const MAP_MOST_BYTES = 72_000;
/** An island smaller than this, in square units, is not drawn: a speck. */
const SPECK = 5;

const INK = PAPER.ink;
const MUTED = PAPER.muted;
/** The sea: the chart's sky blue, which is blue in every theme, as a tint. */
const SEA = PAPER.chart[4];
const LAND = PAPER.card;
const NEIGHBOUR = PAPER.grid;
const HALO = PAPER.card;
/**
 * Each group's colour: one group in the accent; two or more in the
 * chart's orange, blue, green and purple, told apart in every theme and
 * by colour-blind viewers too (an accent and a chart colour can meet:
 * Clean Lab's accent is blue).
 */
const GROUP_COLOURS = [
  PAPER.chart[1],
  PAPER.chart[0],
  PAPER.chart[2],
  PAPER.chart[5],
] as const;
export const groupColour = (i: number, groups: number) =>
  groups <= 1 ? PAPER.accent : GROUP_COLOURS[i % GROUP_COLOURS.length];

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const r = (n: number) => Math.round(n * 10) / 10;

type Point = [number, number];

/**
 * A projection's stream thinned for the screen: points nearer than THIN to
 * the last kept are dropped, and a ring that is a speck, or a line of one
 * point, is not drawn. What keeps a map small enough to play smoothly on
 * a phone.
 */
function thinned(out: GeoStream, speck: number, thin: number): GeoStream {
  let inPolygon = false;
  let line: Point[] = [];
  const flush = () => {
    const least = inPolygon ? 3 : 2;
    if (line.length >= least) {
      if (inPolygon && speck > 0) {
        let area = 0;
        for (let i = 0, j = line.length - 1; i < line.length; j = i++)
          area += (line[j][0] + line[i][0]) * (line[j][1] - line[i][1]);
        if (Math.abs(area / 2) < speck) {
          line = [];
          return;
        }
      }
      out.lineStart();
      for (const [x, y] of line) out.point(x, y);
      out.lineEnd();
    }
    line = [];
  };
  return {
    point(x, y) {
      const last = line[line.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= thin)
        line.push([x, y]);
      else if (line.length > 1) line[line.length - 1] = [x, y];
      else line.push([x, y]);
    },
    lineStart() {
      line = [];
    },
    lineEnd() {
      flush();
    },
    polygonStart() {
      inPolygon = true;
      out.polygonStart();
    },
    polygonEnd() {
      inPolygon = false;
      out.polygonEnd();
    },
    sphere() {
      out.sphere?.();
    },
  };
}

/** A country's polygons, each as one feature, so the near ones can be told from the far (an empire's islands). */
const polygonsOf = (f: CountryFeature): Position[][][] =>
  f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;

/**
 * A country's mainland, for framing it: its largest piece and the pieces
 * near it, not its far islands and territories (France's Guiana, the
 * United States' Hawaii, Norway's Svalbard).
 */
function mainlandOf(g: D3Geo, f: CountryFeature): Feature<MultiPolygon> {
  const pieces = polygonsOf(f).map((coordinates) => {
    const polygon: Polygon = { type: 'Polygon', coordinates };
    return {
      coordinates,
      area: g.geoArea(polygon),
      at: g.geoCentroid(polygon),
    };
  });
  const largest = pieces.reduce((a, b) => (b.area > a.area ? b : a));
  // Near: within twice the largest piece's own size, and at least 12°.
  const reach = Math.max(
    (12 * Math.PI) / 180,
    2 * Math.sqrt(largest.area / Math.PI),
  );
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: pieces
        .filter(
          (p) => p === largest || g.geoDistance(p.at, largest.at) <= reach,
        )
        .map((p) => p.coordinates),
    },
  };
}

/** Whether a point is inside a set of rings (even-odd, holes out). */
function pointIn(rings: Point[][], [x, y]: Point): boolean {
  let odd = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        odd = !odd;
    }
  return odd;
}

/** The point inside a set of rings farthest from their edges: where a name or a route's end sits. */
function insidePoint(rings: Point[][]): Point | null {
  return insidePoints(rings)[0] ?? null;
}

/** Points inside a set of rings, the farthest from their edges first: where a name may sit. */
function insidePoints(rings: Point[][]): Point[] {
  if (!rings.length) return [];
  // The largest ring, and the rings inside it (holes, lakes) counted against it.
  const area = (ring: Point[]) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(a / 2);
  };
  const outer = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const inside = (x: number, y: number) => {
    let odd = false;
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          odd = !odd;
      }
    return odd;
  };
  const edgeDistance = (x: number, y: number) => {
    let least = Infinity;
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j];
        const [bx, by] = ring[i];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
        least = Math.min(
          least,
          Math.hypot(x - (ax + t * dx), y - (ay + t * dy)),
        );
      }
    return least;
  };
  const found: { at: Point; d: number }[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      if (inside(x, y)) found.push({ at: [x, y], d: edgeDistance(x, y) });
    }
  if (!found.length) return [[(x0 + x1) / 2, (y0 + y1) / 2]];
  return found.sort((a, b) => b.d - a.d).map((one) => one.at);
}

/** The rings a geometry makes on the drawing, after the projection's clip. */
function ringsOf(
  g: D3Geo,
  projection: GeoProjection,
  geometry: Geometry,
): Point[][] {
  const rings: Point[][] = [];
  let ring: Point[] = [];
  const sink: GeoStream = {
    point: (x, y) => void ring.push([x, y]),
    lineStart: () => void (ring = []),
    lineEnd: () => {
      if (ring.length >= 3) rings.push(ring);
    },
    polygonStart: () => {},
    polygonEnd: () => {},
  };
  // d3's own stream for any GeoJSON object, through the projection.
  g.geoStream(geometry, projection.stream(sink));
  return rings;
}

const boxOf = (rings: Point[][]): [number, number, number, number] | null => {
  const all = rings.flat();
  if (!all.length) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return [r(x0), r(y0), r(Math.max(...xs) - x0), r(Math.max(...ys) - y0)];
};

/** The projection that suits a region: the world's, a wide one's away from the equator, or one centred on it. */
function projectionFor(
  g: D3Geo,
  target: Parameters<D3Geo['geoBounds']>[0],
  world: boolean,
): { projection: GeoProjection; name: string } {
  const [[x0, y0], [x1, y1]] = g.geoBounds(target);
  const lonSpan = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
  const latSpan = y1 - y0;
  let lon = x0 + lonSpan / 2;
  if (lon > 180) lon -= 360;
  const lat = (y0 + y1) / 2;
  // A pole's land (Antarctica, the Arctic) seen from above it.
  if (!world && (y0 <= -80 || y1 >= 84))
    return {
      projection: g.geoAzimuthalEqualArea().rotate([0, y0 <= -80 ? 90 : -90]),
      name: 'azimuthalEqualArea',
    };
  if (world || lonSpan > 200)
    return {
      projection: g.geoNaturalEarth1().rotate([world ? 0 : -lon, 0]),
      name: 'naturalEarth1',
    };
  if (lonSpan > 45 && Math.abs(lat) > 20 && latSpan < 80)
    return {
      projection: g
        .geoConicEqualArea()
        .parallels([y0 + latSpan / 6, y1 - latSpan / 6])
        .rotate([-lon, 0]),
      name: 'conicEqualArea',
    };
  return {
    projection: g.geoAzimuthalEqualArea().rotate([-lon, -lat]),
    name: 'azimuthalEqualArea',
  };
}

/** A box's edges as points, for fitting a projection to it. */
function boxPoints([w, s, e, n]: GeoBox): Position[] {
  const out: Position[] = [];
  for (let i = 0; i <= 20; i++) {
    const lon = w + ((e - w) * i) / 20;
    const lat = s + ((n - s) * i) / 20;
    out.push([lon, s], [lon, n], [w, lat], [e, lat]);
  }
  return out;
}

export interface DrawnMap {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  /** In a tall film, the names the map writes itself: part name to its label's group. */
  labels: Record<string, string>;
  /** In a wide one, the names as labels the stage sets beside the map. */
  callouts: Callout[];
  /** For the specs and the logs: what was drawn, and what could not be. */
  projection: string;
  resolution: '50m' | '110m';
  /** Places and routes that fell outside the map, left off. */
  outside: string[];
}

/**
 * A map, drawn: its SVG, each highlight, place and route a part, and the
 * names as labels for the stage. One that would weigh too much to play
 * smoothly on a phone (a coast of a thousand islands) is drawn again with
 * its outlines thinned further, as many as three times.
 */
export async function renderMap(
  spec: MapSpec,
  shape: 'wide' | 'tall' = 'wide',
): Promise<DrawnMap> {
  const g = await d3Geo();
  let drawn = drawMap(g, spec, shape, THIN);
  for (let k = 1; k <= 3 && drawn.svg.length > MAP_MOST_BYTES; k++)
    drawn = drawMap(g, spec, shape, THIN * 1.7 ** k);
  return drawn;
}

function drawMap(
  g: D3Geo,
  spec: MapSpec,
  shape: 'wide' | 'tall',
  thin: number,
): DrawnMap {
  const world = spec.region.kind === 'world';
  const large =
    world ||
    spec.region.kind === 'continent' ||
    (spec.region.box !== null && spec.region.box[2] - spec.region.box[0] > 40);
  const wanted = [
    ...spec.region.countries,
    ...spec.highlights.flatMap((h) => h.countries),
  ];
  // A continent's coastlines from the lighter data, unless a country it
  // colours is too small to be in it; a country's from the finer.
  const coarse = atlasOf('110m');
  const resolution: '50m' | '110m' =
    large &&
    spec.highlights.every((h) => h.countries.every((c) => coarse.byName.has(c)))
      ? '110m'
      : '50m';
  const atlas = atlasOf(resolution);
  const known = (name: string) => atlas.byName.get(name);
  const showsAntarctica = wanted.includes('Antarctica');
  const countries = atlas.countries.filter(
    (f) => showsAntarctica || f.properties.name !== 'Antarctica',
  );

  // What the map is fitted to: the region, and whatever it colours and marks beyond it.
  const fitFeatures: Feature[] = [];
  const mainlands = (names: readonly string[], dropSmall: boolean) => {
    const found = names.flatMap((n) => {
      const f = known(n) ?? atlasOf('50m').byName.get(n);
      return f ? [mainlandOf(g, f)] : [];
    });
    if (!dropSmall || found.length < 2) return found;
    const areas = found.map((f) => g.geoArea(f));
    const most = Math.max(...areas);
    // A region is framed by its land, not by its smallest islands.
    return found.filter((_, i) => areas[i] >= most * 0.005);
  };
  if (spec.region.box)
    fitFeatures.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: boxPoints(spec.region.box) },
    });
  else if (!world) fitFeatures.push(...mainlands(spec.region.countries, true));
  if (!world) {
    fitFeatures.push(
      ...mainlands(
        spec.highlights.flatMap((h) => h.countries),
        false,
      ),
    );
    // Where a mark goes is in view; a river, a lake, a sea or a desert is
    // named where it is in view, and never widens the map.
    const points = [
      ...spec.places
        .filter((p) => !['river', 'lake', 'sea', 'area'].includes(p.kind))
        .map((p) => [p.lon, p.lat] as Position),
      ...spec.routes.flatMap((route) =>
        [route.from, route.to].flatMap((end) =>
          end.at ? [end.at as Position] : [],
        ),
      ),
    ];
    if (points.length)
      fitFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiPoint', coordinates: points },
      });
    fitFeatures.push(
      ...mainlands(
        spec.routes.flatMap((route) => [
          ...route.from.countries,
          ...route.to.countries,
        ]),
        false,
      ),
    );
  }
  const target: Parameters<D3Geo['geoBounds']>[0] = world
    ? { type: 'Sphere' }
    : { type: 'FeatureCollection', features: fitFeatures };
  if (!world && !fitFeatures.length)
    throw new Error('the map has nothing to show');
  const { projection, name: projectionName } = projectionFor(g, target, world);

  // The frame: as wide as the region is, within the shape's limits.
  const frame = FRAME[shape];
  projection.fitSize([1000, 1000], target);
  const [[bx0, by0], [bx1, by1]] = g.geoPath(projection).bounds(target);
  const natural = (bx1 - bx0) / Math.max(1e-6, by1 - by0);
  const aspect = Math.min(frame.aspect[1], Math.max(frame.aspect[0], natural));
  const W = Math.round(Math.sqrt(frame.area * aspect));
  const H = Math.round(Math.sqrt(frame.area / aspect));
  const pad = world ? 4 : Math.round(Math.min(W, H) * 0.06);
  projection.fitExtent(
    [
      [pad, pad],
      [W - pad, H - pad],
    ],
    target,
  );
  if (!world)
    projection.clipExtent([
      [-4, -4],
      [W + 4, H + 4],
    ]);
  const drawer = (speck: number) =>
    g
      .geoPath({
        stream: (s: GeoStream) => projection.stream(thinned(s, speck, thin)),
      })
      .digits(1);
  const path = drawer(SPECK * (thin / THIN) ** 2);
  const finePath = drawer(0);

  // Who is in the region, who colours, who is a neighbour.
  const region = new Set(
    world ? countries.map((f) => f.properties.name) : spec.region.countries,
  );
  const highlighted = new Map<string, number>();
  spec.highlights.forEach((h, i) =>
    h.countries.forEach((c) => highlighted.set(c, i)),
  );
  const collection = (list: CountryFeature[]): FeatureCollection => ({
    type: 'FeatureCollection',
    features: list,
  });
  const out: string[] = [];
  const parts: Record<string, string> = {};
  const callouts: Callout[] = [];
  const outside: string[] = [];
  const ids = new Set<string>();
  const idFor = (prefix: string, name: string) => {
    let id = `${prefix}-${groupId(name) || 'x'}`;
    for (let k = 2; ids.has(id); k++)
      id = `${prefix}-${groupId(name) || 'x'}-${k}`;
    ids.add(id);
    return id;
  };

  out.push(
    `<style>@keyframes show{from{opacity:0}to{opacity:1}}` +
      `@keyframes pop{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}` +
      `@keyframes draw{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}` +
      `.show{animation:show .6s ease-out both}` +
      `.pop{transform-box:fill-box;transform-origin:center;animation:pop .45s ease-out both}` +
      `.route{stroke-dasharray:var(--l);animation:draw 1.4s ease-in-out both}</style>`,
  );
  // The sea, and the world's own edge on a map of all of it.
  if (world)
    out.push(
      `<path d="${g.geoPath(projection).digits(1)({ type: 'Sphere' })}" fill="${SEA}" fill-opacity="0.14" stroke="${MUTED}" stroke-opacity="0.5" stroke-width="1.5"/>`,
    );
  else
    out.push(
      `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${SEA}" fill-opacity="0.14"/>`,
      // The land cut at the frame, never stroked along it.
      `<defs><clipPath id="map-frame"><rect x="0" y="0" width="${W}" height="${H}" rx="14"/></clipPath></defs>`,
      `<g clip-path="url(#map-frame)">`,
    );
  // The land: all of it once, muted, its outline the coast; the region
  // white over it; each merged, so no border is drawn twice.
  const geometries = (
    atlas.topology.objects.countries as GeometryCollection<{ name: string }>
  ).geometries;
  const nameOf = (a: GeometryObject): string => {
    const properties = (a as unknown as { properties?: { name?: string } })
      .properties;
    return properties?.name ?? '';
  };
  const kept = (a: GeometryObject) =>
    showsAntarctica || nameOf(a) !== 'Antarctica';
  const land = path(merge(atlas.topology, geometries.filter(kept) as never));
  if (land)
    out.push(
      `<defs><path id="map-land" d="${land}"/></defs>`,
      `<use href="#map-land" fill="${world ? LAND : NEIGHBOUR}"/>`,
    );
  if (!world) {
    const shown = path(
      merge(
        atlas.topology,
        geometries.filter((a) => region.has(nameOf(a))) as never,
      ),
    );
    if (shown) out.push(`<path d="${shown}" fill="${LAND}"/>`);
  }
  /** Where in each coloured country its name may sit, the roomiest first. */
  const spotsOf = new Map<string, Point[]>();
  const ringsOf_ = new Map<string, Point[][]>();
  // The coloured countries, one part each, coming in one after another.
  spec.highlights.forEach((h, i) => {
    const features = h.countries.flatMap((c) => {
      const f = known(c);
      return f ? [f] : [];
    });
    if (!features.length) return;
    // A small country is drawn whole, however small: it is what the map is about.
    const d = finePath(collection(features));
    const rings = features.flatMap((f) => ringsOf(g, projection, f.geometry));
    const box = boxOf(rings);
    if (!d || !box) {
      outside.push(h.name);
      return;
    }
    const id = idFor('country', h.name);
    parts[h.name] = id;
    for (const c of h.countries) if (!parts[c]) parts[c] = id;
    const colour = groupColour(h.group, spec.groups.length);
    const delay = (
      0.3 + Math.min(1.6, i * (1.6 / Math.max(1, spec.highlights.length)))
    ).toFixed(2);
    // One too small to see is ringed in its colour.
    const small = box[2] * box[3] < 140;
    const spots = insidePoints(rings);
    const at = spots[0] ?? [box[0] + box[2] / 2, box[1] + box[3] / 2];
    spotsOf.set(h.name, spots.slice(0, 16));
    ringsOf_.set(h.name, rings);
    out.push(
      `<g id="${id}"><g class="show" style="animation-delay:${delay}s">` +
        `<path d="${d}" fill="${colour}" stroke="${HALO}" stroke-width="0.8" stroke-linejoin="round"/>` +
        (small
          ? `<circle cx="${r(at[0])}" cy="${r(at[1])}" r="11" fill="none" stroke="${colour}" stroke-width="3"/>`
          : '') +
        `</g></g>`,
    );
    if (h.label)
      callouts.push({
        part: h.name,
        text: h.name,
        anchor: [r(at[0]), r(at[1])],
        box,
      });
  });
  // Lakes, as the sea is, over the land and its colours: a lake is not a
  // country's. A river or a lake the voice names is a part of its own.
  const lakeFeatures = (lakes: NaturalLake[]): FeatureCollection => ({
    type: 'FeatureCollection',
    features: lakes.flatMap((lake) =>
      lake.polygons.map((coordinates): Feature => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates },
      })),
    ),
  });
  const ownLakes = new Set(
    spec.places.flatMap((p) => (p.lake ? [p.lake] : [])),
  );
  const waters = new Map<string, string>();
  const water = (
    place: MapSpec['places'][number],
    i: number,
    d: string | null | undefined,
    look: string,
  ) => {
    if (!d) return;
    const id = idFor('place', place.name);
    waters.set(place.name, id);
    const delay = (0.5 + i * 0.15).toFixed(2);
    out.push(
      `<g id="${id}"><g class="show" style="animation-delay:${delay}s">${look.replace(/\{d\}/g, d)}</g></g>`,
    );
  };
  // A river first, so where it runs through a lake the lake covers it.
  const rivers = naturalRivers();
  spec.places.forEach((place, i) => {
    if (place.river)
      water(
        place,
        i,
        path({
          type: 'MultiLineString',
          coordinates: place.river.flatMap((one) => rivers[one] ?? []),
        }),
        `<path d="{d}" fill="none" stroke="${SEA}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
  });
  const lakes = path(
    lakeFeatures(naturalLakes().filter((lake) => !ownLakes.has(lake.name))),
  );
  if (lakes)
    out.push(
      `<path d="${lakes}" fill="${PAPER.paper}"/><path d="${lakes}" fill="${SEA}" fill-opacity="0.14" stroke="${MUTED}" stroke-width="1" stroke-opacity="0.8"/>`,
    );
  spec.places.forEach((place, i) => {
    if (place.lake)
      water(
        place,
        i,
        finePath(
          lakeFeatures(
            naturalLakes().filter((lake) => lake.name === place.lake),
          ),
        ),
        `<path d="{d}" fill="${PAPER.paper}"/><path d="{d}" fill="${SEA}" fill-opacity="0.5" stroke="${SEA}" stroke-width="1.5"/>`,
      );
  });
  // Borders thin and the coast clean, over the land and its colours.
  const borders = path(
    mesh(
      atlas.topology,
      atlas.topology.objects.countries as GeometryObject,
      (a, b) => a !== b && kept(a) && kept(b),
    ),
  );
  if (borders)
    out.push(
      `<path d="${borders}" fill="none" stroke="${MUTED}" stroke-opacity="0.55" stroke-width="1.1" stroke-linejoin="round"/>`,
    );
  if (land)
    out.push(
      `<use href="#map-land" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linejoin="round"/>`,
    );
  if (!world) out.push('</g>');

  // Routes: from one end to the other, a curve that draws itself, its arrow at the end.
  const pointOf = (end: RouteEnd): Point | null => {
    if (end.at) {
      const p = projection(end.at);
      return p ? [p[0], p[1]] : null;
    }
    const rings = end.countries.flatMap((c) => {
      const f = known(c);
      return f ? ringsOf(g, projection, mainlandOf(g, f).geometry) : [];
    });
    return insidePoint(rings);
  };
  const within = ([x, y]: Point) => x >= 0 && x <= W && y >= 0 && y <= H;
  spec.routes.forEach((route, i) => {
    const a = pointOf(route.from);
    const b = pointOf(route.to);
    if (!a || !b || !within(a) || !within(b)) {
      outside.push(route.name);
      return;
    }
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(dx, dy);
    if (length < 4) return;
    // Bowed to one side, a fifth of its length: a journey, not a border.
    const c: Point = [
      (a[0] + b[0]) / 2 - dy * 0.2,
      (a[1] + b[1]) / 2 + dx * 0.2,
    ];
    // Stops short of the end for its arrowhead.
    const tx = b[0] - c[0];
    const ty = b[1] - c[1];
    const tl = Math.hypot(tx, ty) || 1;
    const head = 18;
    const end: Point = [
      b[0] - (tx / tl) * head * 0.6,
      b[1] - (ty / tl) * head * 0.6,
    ];
    const curve = Math.ceil(length * 1.08) + 4;
    const id = idFor('route', route.name);
    parts[route.name] = id;
    const nx = -ty / tl;
    const ny = tx / tl;
    const tip: Point = b;
    const back: Point = [b[0] - (tx / tl) * head, b[1] - (ty / tl) * head];
    const delay = (0.6 + i * 0.5).toFixed(2);
    out.push(
      `<g id="${id}">` +
        `<path class="route" style="--l:${curve};animation-delay:${delay}s" d="M${r(a[0])} ${r(a[1])}Q${r(c[0])} ${r(c[1])} ${r(end[0])} ${r(end[1])}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path class="show" style="animation-delay:${(Number(delay) + 1.2).toFixed(2)}s" d="M${r(tip[0])} ${r(tip[1])}L${r(back[0] + nx * head * 0.5)} ${r(back[1] + ny * head * 0.5)}L${r(back[0] - nx * head * 0.5)} ${r(back[1] - ny * head * 0.5)}Z" fill="${INK}"/>` +
        `</g>`,
    );
  });

  // Places: a mark each, and its name a label the stage sets; a sea's or a
  // desert's name written across it.
  const written: [number, number, number, number][] = [];
  const size = frame.text;
  /** Where a river is named: the middle of its longest run in the middle of the map. */
  const riverPoint = (stretches: string[]): Point | null => {
    const all = naturalRivers();
    const inner = (q: Point) =>
      q[0] > W * 0.12 && q[0] < W * 0.88 && q[1] > H * 0.12 && q[1] < H * 0.88;
    let best: Point[] = [];
    for (const line of stretches.flatMap((one) => all[one] ?? [])) {
      let run: Point[] = [];
      for (const v of line) {
        const q = projection(v);
        if (q && inner([q[0], q[1]])) run.push([q[0], q[1]]);
        else run = [];
        if (run.length > best.length) best = [...run];
      }
    }
    return best.length ? best[Math.floor(best.length / 2)] : null;
  };
  spec.places.forEach((place, i) => {
    // A sea is named at the first of its points well in view.
    const inView = (q: Point | null) =>
      q && q[0] > W * 0.1 && q[0] < W * 0.9 && q[1] > H * 0.1 && q[1] < H * 0.9;
    const seaPoint = () =>
      [[place.lon, place.lat] as [number, number], ...(place.alts ?? [])]
        .map((at) => projection(at))
        .find(inView) ?? null;
    const p: Point | null = place.river
      ? riverPoint(place.river)
      : place.alts
        ? seaPoint()
        : projection([place.lon, place.lat]);
    if (!p || !within([p[0], p[1]])) {
      outside.push(place.name);
      return;
    }
    const [x, y] = [r(p[0]), r(p[1])];
    const water = waters.get(place.name);
    if (water) {
      // Drawn as itself: named along it, or in it.
      parts[place.name] = water;
      callouts.push({
        part: place.name,
        text: place.name,
        anchor: [x, y],
        box: [r(x - 10), r(y - 10), 20, 20],
      });
      return;
    }
    const id = idFor('place', place.name);
    parts[place.name] = id;
    const delay = (0.5 + i * 0.15).toFixed(2);
    if (place.kind === 'sea' || place.kind === 'area') {
      const s = place.kind === 'sea' ? size * 0.85 : size * 0.8;
      const w = measureText(place.name, s, 600) * 1.05;
      // Moved down out of the way of a name already written there.
      let ty = y + s * 0.35;
      for (const [ox, oy, ow, oh] of written)
        if (
          x - w / 2 < ox + ow &&
          x + w / 2 > ox &&
          ty - s < oy + oh &&
          ty > oy
        )
          ty = oy + oh + s;
      // Inside the frame, whole.
      const tx = Math.min(Math.max(x, w / 2 + 8), W - w / 2 - 8);
      ty = Math.min(Math.max(ty, s + 8), H - 10);
      written.push([tx - w / 2, ty - s, w, s * 1.2]);
      out.push(
        `<g id="${id}"><text class="show" style="animation-delay:${delay}s" x="${r(tx)}" y="${r(ty)}" font-size="${r(s)}" font-style="italic" font-weight="600" letter-spacing="1" fill="${place.kind === 'sea' ? SEA : MUTED}" text-anchor="middle" paint-order="stroke" stroke="${HALO}" stroke-width="4" stroke-opacity="0.7">${escape(place.name)}</text></g>`,
      );
      return;
    }
    const mark =
      place.kind === 'mountain'
        ? `<path d="M${x} ${r(y - 13)}L${r(x + 12)} ${r(y + 8)}L${r(x - 12)} ${r(y + 8)}Z" fill="${INK}" stroke="${HALO}" stroke-width="3" stroke-linejoin="round"/>`
        : place.kind === 'capital'
          ? `<circle cx="${x}" cy="${y}" r="9" fill="${HALO}" stroke="${INK}" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="3.6" fill="${INK}"/>`
          : place.kind === 'river' || place.kind === 'lake'
            ? `<circle cx="${x}" cy="${y}" r="8" fill="${SEA}" stroke="${HALO}" stroke-width="3"/>`
            : place.kind === 'landmark'
              ? `<path d="M${x} ${r(y - 11)}L${r(x + 11)} ${y}L${x} ${r(y + 11)}L${r(x - 11)} ${y}Z" fill="${INK}" stroke="${HALO}" stroke-width="3" stroke-linejoin="round"/>`
              : `<circle cx="${x}" cy="${y}" r="7.5" fill="${INK}" stroke="${HALO}" stroke-width="3"/>`;
    written.push([x - 12, y - 12, 24, 24]);
    out.push(
      `<g id="${id}"><g class="pop" style="animation-delay:${delay}s">${mark}</g></g>`,
    );
    callouts.push({
      part: place.name,
      text: place.name,
      anchor: [x, y],
      box: [r(x - 10), r(y - 10), 20, 20],
    });
  });

  // The map writes its names itself, as a map does: each beside its mark
  // (a country's in it), clear of the others, the marks and the frame's
  // edge, as a label the stage shows from the start, or when the voice
  // first points at it (a drawing's labels).
  const labels: Record<string, string> = {};
  if (callouts.length) {
    const ls = Math.round(size * 0.9);
    const taken: [number, number, number, number][] = [...written];
    const overlaps = (a: [number, number, number, number]) =>
      taken.some(
        (b) =>
          a[0] < b[0] + b[2] &&
          a[0] + a[2] > b[0] &&
          a[1] < b[1] + b[3] &&
          a[1] + a[3] > b[1],
      );
    const inside = ([x, y, w, h]: [number, number, number, number]) =>
      x >= 6 && y >= 6 && x + w <= W - 6 && y + h <= H - 6;
    /** Where a name goes at a size: the first place clear of the rest, and whether it is beside what it names. */
    const spotFor = (callout: Callout, size: number) => {
      const w = measureText(callout.text, size, 700) + 4;
      const h = size * 1.15;
      const [ax, ay] = callout.anchor;
      const mark = (callout.box?.[2] ?? 0) <= 24;
      const gap = 16;
      const spots = spotsOf.get(callout.part) ?? [];
      const tries: [number, number][] = mark
        ? [
            [ax + gap, ay - h / 2],
            [ax - gap - w, ay - h / 2],
            [ax - w / 2, ay - gap - h],
            [ax - w / 2, ay + gap],
            [ax + gap, ay - h - 2],
            [ax + gap, ay + 2],
            [ax - gap - w, ay - h - 2],
            [ax - gap - w, ay + 2],
          ]
        : // In the country: where it has most room, clear of the rest.
          spots.map(([x, y]): [number, number] => [x - w / 2, y - h / 2]);
      const near = tries.length;
      // Failing those, farther out, ring by ring, with a line to what it names.
      for (let k = mark ? 1 : 0; k <= 4; k++) {
        const d = gap + k * h * 0.9;
        const e = d * 0.7;
        tries.push(
          [ax + d, ay - h / 2],
          [ax - d - w, ay - h / 2],
          [ax - w / 2, ay - d - h],
          [ax - w / 2, ay + d],
          [ax + e, ay - e - h],
          [ax + e, ay + e],
          [ax - e - w, ay - e - h],
          [ax - e - w, ay + e],
        );
      }
      const boxes = tries.map(([x, y]): [number, number, number, number] => [
        x,
        y,
        w,
        h,
      ]);
      const clamp = ([x, y]: [number, number, number, number]): [
        number,
        number,
        number,
        number,
      ] => [
        Math.min(Math.max(6, x), W - 6 - w),
        Math.min(Math.max(6, y), H - 6 - h),
        w,
        h,
      ];
      // A country's name inside it reads as its own only if it is mostly in it.
      const rings = ringsOf_.get(callout.part);
      const within = (b: [number, number, number, number], i: number) => {
        if (mark || i >= near || !rings) return true;
        const [x, y, bw, bh] = b;
        const probes: Point[] = [
          [x + bw / 2, y + bh / 2],
          [x + bw * 0.1, y + bh / 2],
          [x + bw * 0.9, y + bh / 2],
          [x + bw * 0.3, y + bh / 2],
          [x + bw * 0.7, y + bh / 2],
        ];
        return probes.filter((q) => pointIn(rings, q)).length >= 4;
      };
      const at = boxes.findIndex(
        (b, i) => inside(b) && !overlaps(b) && within(b, i),
      );
      const box =
        at >= 0
          ? boxes[at]
          : (boxes.map(clamp).find((b) => !overlaps(b)) ?? clamp(boxes[0]));
      return { box, h, size, near: at >= 0 && at < near };
    };
    // Marks first, where they must be; then the countries, which have room.
    const order = [...callouts].sort(
      (a, b) =>
        Number((b.box?.[2] ?? 0) <= 24) - Number((a.box?.[2] ?? 0) <= 24),
    );
    for (const callout of order) {
      // Smaller, if that puts it beside what it names.
      let spot = spotFor(callout, ls);
      if (!spot.near) {
        const smaller = spotFor(callout, Math.round(ls * 0.8));
        if (smaller.near) spot = smaller;
      }
      const { box, h } = spot;
      const [ax, ay] = callout.anchor;
      taken.push(box);
      const id = idFor('label', callout.part);
      labels[callout.part] = id;
      // Set away from what it names: a line from it to the name.
      const end: Point = [
        Math.min(Math.max(ax, box[0]), box[0] + box[2]),
        Math.min(Math.max(ay, box[1]), box[1] + box[3]),
      ];
      const reach = Math.hypot(end[0] - ax, end[1] - ay);
      const leader =
        !spot.near && reach > 6
          ? `<path d="M${r(ax + ((end[0] - ax) * Math.min(10, reach / 2)) / reach)} ${r(ay + ((end[1] - ay) * Math.min(10, reach / 2)) / reach)}L${r(end[0])} ${r(end[1])}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
          : '';
      out.push(
        `<g id="${id}">${leader}<text x="${r(box[0] + 2)}" y="${r(box[1] + h * 0.8)}" font-size="${spot.size}" font-weight="700" fill="${INK}" paint-order="stroke" stroke="${HALO}" stroke-width="${r(spot.size * 0.2)}" stroke-linejoin="round">${escape(callout.text)}</text></g>`,
      );
    }
    callouts.length = 0;
  }

  // The key: each named group's colour and name, under the map.
  const named = spec.groups
    .map((name, i) => ({ name, i }))
    .filter(
      (one) =>
        one.name &&
        spec.highlights.some((h) => h.group === one.i && parts[h.name]),
    );
  let height = H;
  if (named.length) {
    const swatch = Math.round(size * 1.05);
    const gap = Math.round(size * 1.2);
    let x = 8;
    let y = H + Math.round(size * 0.8);
    const rows: string[] = [];
    for (const one of named) {
      const w = swatch + 12 + measureText(one.name, size, 600);
      if (x > 8 && x + w > W) {
        x = 8;
        y += Math.round(size * 1.6);
      }
      rows.push(
        `<rect x="${x}" y="${y}" width="${swatch}" height="${swatch}" rx="6" fill="${groupColour(one.i, spec.groups.length)}"/>` +
          `<text x="${x + swatch + 12}" y="${r(y + swatch * 0.8)}" font-size="${size}" font-weight="600" fill="${INK}">${escape(one.name)}</text>`,
      );
      x += w + gap;
    }
    out.push(`<g id="key">${rows.join('')}</g>`);
    height = y + swatch + 8;
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}">${out.join('')}</svg>`,
    viewBox: [0, 0, W, height],
    parts,
    labels,
    callouts,
    projection: projectionName,
    resolution,
    outside,
  };
}

/** Which continent a country is in, for the specs and the logs. */
export const continentOf = (country: string) =>
  CONTINENT_OF.get(country) ?? null;
