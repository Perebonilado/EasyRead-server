/**
 * The show's one map as geography the player draws itself (explainer-
 * animation-tech.md §6.1, work package 8): what scene-map reads from the
 * show's base map (its named regions, the seams between them, its places,
 * pins and routes), taken before any projection, as GeoJSON in longitude
 * and latitude. Every feature keeps the id the drawn map's parts have
 * always had (group-*, seam-*, place-*, pin-*, route-*, country-*,
 * area-*), so a shot names a region the same way on either map, and says
 * what it is in `kind`.
 *
 * Round them: the show's land and its neighbours (world-atlas 50m) as far
 * as a tilted camera sees past the show's frame, the sea, the lakes, the
 * coast, the borders, and the lines of the show's own country's states,
 * faint. A tilted map looks a long way north of its middle, so the land
 * there has to be real land, never a sea that is not there.
 *
 * Outlines are simplified on the topology, one arc at a time, so two
 * neighbours keep one border between them (no slivers where they meet);
 * the tolerance is a share of the frame's size, coarser for land far from
 * it, and raised until the asset is light enough to travel with the scene.
 *
 * Pure but for reading the map data once (scene-map-data, world-atlas).
 */
import { merge, mesh, feature as topoFeature } from 'topojson-client';
import type {
  GeometryCollection,
  GeometryObject,
  Topology,
} from 'topojson-specification';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import type { ShotBox, ShotGeoAssetDto } from '../../../contracts';
import { groupId } from '../scene-ids';
import {
  atlasOf,
  d3Geo,
  mainlandOf,
  mapColourHex,
  type MapLand,
  type MapRegion,
  type MapSpec,
} from '../scene-map';
import { areasOf } from '../scene-map-places';
import { naturalAreas, naturalLakes } from '../scene-map-data';

/** West, south, east, north, in degrees. */
export type GeoBounds = [number, number, number, number];

/** What a feature of the map is: the land, the water, its lines, and what the voice can point at. */
export type GeoKind =
  | 'sea'
  | 'land'
  | 'lake'
  | 'admin'
  | 'border'
  | 'coast'
  | 'region'
  | 'highlight'
  | 'area'
  | 'seam'
  | 'route'
  | 'place'
  | 'pin';

/** The map as the player draws it, and how the build names and measures its parts. */
export interface GeoMap {
  asset: ShotGeoAssetDto;
  /** Each region, seam, place, pin and route by the name the show gives it, to its feature's id. */
  parts: Record<string, string>;
  /** Each feature's bounds, by id (west, south, east, north). */
  boxes: Record<string, GeoBounds>;
  /** The asset's size as JSON, in bytes. */
  bytes: number;
  /** The simplification it was made at, in degrees. */
  tolerance: number;
}

export interface GeoMapOptions {
  /** How far past the show's frame the land reaches, as a share of the frame's larger side: a tilted camera sees far beyond it. */
  margin?: number;
  /** The most the asset may weigh as JSON; past it, outlines are simplified further. */
  maxBytes?: number;
  /** The simplification to start from, as a share of the frame's larger side. */
  tolerance?: number;
}

/** A scene's map travels with the scene: about this much at most (the brief's 250 KB). */
export const GEO_MOST_BYTES = 250_000;
/** Land round the frame, as a share of its larger side: a camera tilted 55° sees about 1.6 frame heights past its middle. */
const MARGIN = 1.5;
/** Within this share of the frame's size round it, outlines are kept at the finest; past it, coarser. */
const NEAR = 0.25;
/** The finest simplification, as a share of the frame's larger side: under a pixel when the frame fills a 1920 px film. */
const TOLERANCE = 1 / 2400;
/** How much coarser the land far from the frame is drawn. */
const FAR = 3;
/** A country of more areas than this has none of their lines drawn: a web of lines, not a map (scene-map's own limit). */
const AREA_LINES_MOST = 80;
/** A route bows to one side by this share of its length: a journey, not a border (as scene-map draws it). */
const ROUTE_BOW = 0.2;
const ROUTE_POINTS = 33;

// ── Web Mercator, as the player's map projects ───────────────────────────

/** The world's width in the units boxes on a geo map are measured in: Web Mercator pixels at zoom 8. */
export const WORLD_PX = 512 * 2 ** 8;
/** Web Mercator stops short of the poles. */
const MAX_LAT = 85.0511287798;

/** A point on the earth in Web Mercator pixels at zoom 8: x east, y south, from the top left of the world. */
export function mercator(lng: number, lat: number): [number, number] {
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const x = (lng + 180) / 360;
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
  return [x * WORLD_PX, y * WORLD_PX];
}

/** Bounds on the earth as a box in Web Mercator pixels (x, y, w, h): what a camera frames on a geo map. */
export function mercatorBox([w, s, e, n]: GeoBounds): ShotBox {
  const [x0, y0] = mercator(w, n);
  const [x1, y1] = mercator(e, s);
  const r = (v: number) => Math.round(v * 10) / 10;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}

// ── Geometry ──────────────────────────────────────────────────────────────

type Ring = Position[];

const expand = ([w, s, e, n]: GeoBounds, by: number): GeoBounds => [
  Math.max(-180, w - by),
  Math.max(-MAX_LAT, s - by),
  Math.min(180, e + by),
  Math.min(MAX_LAT, n + by),
];

const intersects = (a: GeoBounds, b: GeoBounds) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** The bounds of some points; null for none. */
function boundsOf(points: Iterable<Position>): GeoBounds | null {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** Every position of a geometry, in order. */
function* positionsOf(geometry: Geometry): Generator<Position> {
  switch (geometry.type) {
    case 'Point':
      yield geometry.coordinates;
      break;
    case 'MultiPoint':
    case 'LineString':
      yield* geometry.coordinates;
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const line of geometry.coordinates) yield* line;
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates)
        for (const ring of polygon) yield* ring;
      break;
    case 'GeometryCollection':
      for (const one of geometry.geometries) yield* positionsOf(one);
      break;
  }
}

/**
 * Douglas and Peucker's simplification of a line: the fewest of its points
 * that stay within `tolerance` of it, its ends always kept. A closed line
 * (a ring of one arc) keeps its first point and the one farthest from it.
 */
export function simplifyLine(
  points: readonly Position[],
  tolerance: number,
): Position[] {
  const n = points.length;
  if (n <= 2 || !(tolerance > 0)) return points.slice();
  // Past the land kept: a line between its ends, which stays inside its own bounds.
  if (!Number.isFinite(tolerance)) return [points[0], points[n - 1]];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const limit = tolerance * tolerance;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    let far = -1;
    let most = limit;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      let qx = ax;
      let qy = ay;
      if (length2 > 0) {
        const t = Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2),
        );
        qx = ax + t * dx;
        qy = ay + t * dy;
      }
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 > most) {
        most = d2;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: Position[] = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(points[i]);
  return out;
}

/** The signed area of a ring, in square degrees. */
function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** A ring cut to a box (Sutherland and Hodgman), closed; null when nothing of it is inside. */
export function clipRing(ring: Ring, [w, s, e, n]: GeoBounds): Ring | null {
  let points =
    ring.length > 1 && same(ring[0], ring[ring.length - 1])
      ? ring.slice(0, -1)
      : ring.slice();
  const edges: [
    (p: Position) => boolean,
    (a: Position, b: Position) => Position,
  ][] = [
    [(p) => p[0] >= w, (a, b) => at(a, b, (w - a[0]) / (b[0] - a[0]))],
    [(p) => p[0] <= e, (a, b) => at(a, b, (e - a[0]) / (b[0] - a[0]))],
    [(p) => p[1] >= s, (a, b) => at(a, b, (s - a[1]) / (b[1] - a[1]))],
    [(p) => p[1] <= n, (a, b) => at(a, b, (n - a[1]) / (b[1] - a[1]))],
  ];
  for (const [inside, cross] of edges) {
    if (!points.length) break;
    const out: Position[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const previous = points[(i + points.length - 1) % points.length];
      const nowIn = inside(current);
      if (nowIn) {
        if (!inside(previous)) out.push(cross(previous, current));
        out.push(current);
      } else if (inside(previous)) out.push(cross(previous, current));
    }
    points = out;
  }
  if (points.length < 3) return null;
  return [...points, points[0]];
}

const at = (a: Position, b: Position, t: number): Position => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** A segment cut to a box (Liang and Barsky); null when it misses it. */
function clipSegment(
  a: Position,
  b: Position,
  [w, s, e, n]: GeoBounds,
): [Position, Position] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const sides: [number, number][] = [
    [-dx, a[0] - w],
    [dx, e - a[0]],
    [-dy, a[1] - s],
    [dy, n - a[1]],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [t0 === 0 ? a : at(a, b, t0), t1 === 1 ? b : at(a, b, t1)];
}

/** A line cut to a box: the runs of it inside. */
export function clipLine(
  line: readonly Position[],
  box: GeoBounds,
): Position[][] {
  const runs: Position[][] = [];
  let run: Position[] = [];
  const close = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 1; i < line.length; i += 1) {
    const cut = clipSegment(line[i - 1], line[i], box);
    if (!cut) {
      close();
      continue;
    }
    const [a, b] = cut;
    if (!run.length || !same(run[run.length - 1], a)) {
      close();
      run = [a];
    }
    run.push(b);
    if (!same(b, line[i])) close();
  }
  close();
  return runs;
}

/** Polygons cut to a box, rounded, specks and empty rings left out; null when nothing is left. */
function polygonsIn(
  geometry: Polygon | MultiPolygon | null,
  box: GeoBounds,
  round: (p: Position) => Position,
  speck: number,
): MultiPolygon | null {
  if (!geometry) return null;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out: Position[][][] = [];
  for (const polygon of polygons) {
    const rings: Ring[] = [];
    polygon.forEach((ring, k) => {
      const cut = clipRing(ring, box);
      if (!cut) return;
      const rounded = dedupe(cut.map(round));
      if (rounded.length < 4 || Math.abs(ringArea(rounded)) < speck) return;
      // A hole is kept only inside an outline that was.
      if (k > 0 && !rings.length) return;
      rings.push(rounded);
    });
    if (rings.length) out.push(rings);
  }
  return out.length ? { type: 'MultiPolygon', coordinates: out } : null;
}

/** Lines cut to a box and rounded; null when nothing is left. */
function linesIn(
  geometry: MultiLineString | null,
  box: GeoBounds,
  round: (p: Position) => Position,
): MultiLineString | null {
  if (!geometry) return null;
  const out: Position[][] = [];
  for (const line of geometry.coordinates)
    for (const run of clipLine(line, box)) {
      const rounded = dedupe(run.map(round));
      if (rounded.length > 1) out.push(rounded);
    }
  return out.length ? { type: 'MultiLineString', coordinates: out } : null;
}

/** Points in a row that rounding made the same, made one. */
function dedupe(points: Position[]): Position[] {
  const out: Position[] = [];
  for (const p of points)
    if (!out.length || !same(out[out.length - 1], p)) out.push(p);
  return out;
}

// ── Topologies, simplified an arc at a time ──────────────────────────────

type Arcs = Position[][];

/** Every arc a geometry uses, by its index. */
function arcsOf(geometry: GeometryObject, into: Set<number>): Set<number> {
  const add = (i: number) => into.add(i < 0 ? ~i : i);
  switch (geometry.type) {
    case 'LineString':
      geometry.arcs.forEach(add);
      break;
    case 'MultiLineString':
    case 'Polygon':
      geometry.arcs.forEach((ring) => ring.forEach(add));
      break;
    case 'MultiPolygon':
      geometry.arcs.forEach((polygon) =>
        polygon.forEach((ring) => ring.forEach(add)),
      );
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach((one) => arcsOf(one, into));
      break;
  }
  return into;
}

/** An arc's points in degrees, undoing the topology's quantisation. */
function arcPoints(topology: Topology, i: number): Position[] {
  const arc = topology.arcs[i];
  const t = topology.transform;
  if (!t) return arc.map((p) => [p[0], p[1]]);
  let x = 0;
  let y = 0;
  return arc.map((p) => {
    x += p[0];
    y += p[1];
    return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]];
  });
}

/**
 * A topology with the arcs some geometries use simplified, each by the
 * tolerance where it lies (and left out where it is past the land kept, a
 * line between its ends): the arcs are shared, so the shapes that meet
 * along one still meet. Arcs no geometry asked for are left empty.
 */
function simplified(
  topology: Topology,
  wanted: Iterable<number>,
  toleranceFor: (bounds: GeoBounds) => number,
): Topology {
  const arcs: Arcs = Array.from(
    { length: topology.arcs.length },
    (): Position[] => [],
  );
  for (const i of wanted) {
    const points = arcPoints(topology, i);
    const bounds = boundsOf(points);
    arcs[i] = bounds ? simplifyLine(points, toleranceFor(bounds)) : points;
  }
  return {
    type: 'Topology',
    objects: topology.objects,
    arcs: arcs,
  };
}

const nameOf = (one: GeometryObject): string =>
  (one as unknown as { properties?: { name?: string } }).properties?.name ?? '';
const countryOfArea = (one: GeometryObject): string =>
  (one as unknown as { properties?: { c?: string } }).properties?.c ?? '';

/** Each country's bounds in degrees, worked out once from world-atlas. */
let countryBounds: Map<string, GeoBounds> | null = null;
function boundsOfCountries(): Map<string, GeoBounds> {
  if (countryBounds) return countryBounds;
  countryBounds = new Map();
  for (const country of atlasOf('50m').countries) {
    const b = boundsOf(positionsOf(country.geometry));
    if (b) countryBounds.set(country.properties.name, b);
  }
  return countryBounds;
}

// ── The show's frame ──────────────────────────────────────────────────────

/**
 * The show's frame on the earth: a continent's or a region's own box, or
 * its countries' mainlands (as the drawn map frames them: France without
 * its Guiana); the world, all of it but the poles.
 */
export async function regionBounds(region: MapRegion): Promise<GeoBounds> {
  if (region.kind === 'world') return [-180, -60, 180, 80];
  if (region.box) return [...region.box];
  const g = await d3Geo();
  const atlas = atlasOf('50m');
  const mainlands = region.countries.flatMap((name) => {
    const one = atlas.byName.get(name);
    return one ? [mainlandOf(g, one)] : [];
  });
  if (!mainlands.length) return [-180, -60, 180, 80];
  const [[w, s], [e, n]] = g.geoBounds({
    type: 'FeatureCollection',
    features: mainlands,
  });
  // Across the date line, d3 gives west east of east: the world's width then.
  return e >= w ? [w, s, e, n] : [-180, s, 180, n];
}

// ── The map ───────────────────────────────────────────────────────────────

/** Where a route ends and a pin stands, found before the map is built. */
interface Points {
  routes: Map<number, [Position, Position]>;
  pins: Map<number, Position>;
}

/**
 * The show's map as a geo asset: its land, water and lines, its named
 * regions and seams, its places, pins and routes, each a feature with its
 * id and kind, in the frame of the show's map with land round it as far
 * as a tilted camera sees; simplified until it weighs at most `maxBytes`.
 */
export async function mapGeo(
  spec: MapSpec,
  options: GeoMapOptions = {},
): Promise<GeoMap> {
  const g = await d3Geo();
  const region = spec.base ?? spec.region;
  const frame = await regionBounds(region);
  const span = Math.max(frame[2] - frame[0], frame[3] - frame[1], 0.5);
  const reach = expand(frame, span * (options.margin ?? MARGIN));
  const near = expand(frame, span * NEAR);
  const atlas = atlasOf('50m');
  // A route's ends and a pin's spot: a place's point, else its land's middle.
  const middleOf = (countries: readonly string[]): Position | null => {
    const lands = countries.flatMap((c) => {
      const one = atlas.byName.get(c);
      return one ? [mainlandOf(g, one)] : [];
    });
    return lands.length
      ? g.geoCentroid({
          type: 'FeatureCollection',
          features: lands,
        })
      : null;
  };
  const points: Points = { routes: new Map(), pins: new Map() };
  spec.routes.forEach((route, i) => {
    const a = route.from.at ?? middleOf(route.from.countries);
    const b = route.to.at ?? middleOf(route.to.countries);
    if (a && b) points.routes.set(i, [a, b]);
  });
  (spec.pins ?? []).forEach((pin, i) => {
    const spot = pin.at ?? middleOf(pin.countries);
    if (spot) points.pins.set(i, spot);
  });
  const most = options.maxBytes ?? GEO_MOST_BYTES;
  let tolerance = span * (options.tolerance ?? TOLERANCE);
  let made = build(spec, region, frame, near, reach, tolerance, points);
  for (let k = 0; k < 6 && made.bytes > most; k += 1) {
    tolerance *= 1.7;
    made = build(spec, region, frame, near, reach, tolerance, points);
  }
  return { ...made, tolerance };
}

function build(
  spec: MapSpec,
  region: MapRegion,
  frame: GeoBounds,
  near: GeoBounds,
  reach: GeoBounds,
  tolerance: number,
  points: Points,
): Omit<GeoMap, 'tolerance'> {
  const atlas = atlasOf('50m');
  const areas = naturalAreas();
  const decimals = Math.max(
    2,
    Math.min(5, Math.ceil(-Math.log10(tolerance)) + 1),
  );
  const k = 10 ** decimals;
  const round = (p: Position): Position => [
    Math.round(p[0] * k) / k,
    Math.round(p[1] * k) / k,
  ];
  const speck = (tolerance * 2) ** 2;
  const toleranceFor = (bounds: GeoBounds) =>
    intersects(bounds, near)
      ? tolerance
      : intersects(bounds, reach)
        ? tolerance * FAR
        : Infinity;

  // The countries in reach, and the show's own.
  const inRegion = new Set(
    region.kind === 'world'
      ? atlas.countries.map((c) => c.properties.name)
      : region.countries,
  );
  const boxes = boundsOfCountries();
  const countryGeometries = (
    atlas.topology.objects.countries as GeometryCollection<{ name: string }>
  ).geometries;
  const kept = countryGeometries.filter((one) => {
    const b = boxes.get(nameOf(one));
    return (
      b !== undefined && nameOf(one) !== 'Antarctica' && intersects(b, reach)
    );
  });
  const world = simplified(
    atlas.topology,
    arcsOf({ type: 'GeometryCollection', geometries: kept }, new Set()),
    toleranceFor,
  );
  const countriesOf = (names: readonly string[]) => {
    const wanted = new Set(names);
    return countryGeometries.filter((one) => wanted.has(nameOf(one)));
  };

  // The areas the map needs: its own countries' (their lines, and what its regions are made of), and any named.
  const units = areas.topology.objects.units.geometries;
  const unitsOf = (keys: readonly string[]) =>
    [...new Set(keys)].flatMap((key) => {
      const i = areas.byKey.get(key);
      return i === undefined ? [] : [units[i]];
    });
  const keysOfLand = (land: MapLand) => [
    ...land.keys,
    ...land.countries.flatMap((c) => areasOf(c)),
  ];
  const usesAreas = (land: MapLand) => land.keys.length > 0;
  // A country's own states, faint, on a map of one country or two; a continent's would be a web of lines.
  const lined =
    region.kind === 'countries' && inRegion.size <= 3
      ? [...inRegion].filter(
          (c) => areasOf(c).length > 0 && areasOf(c).length <= AREA_LINES_MOST,
        )
      : [];
  const wantedUnits = [
    ...unitsOf(lined.flatMap((c) => areasOf(c))),
    ...unitsOf((spec.merged ?? []).filter(usesAreas).flatMap(keysOfLand)),
    ...unitsOf((spec.areas ?? []).flatMap((a) => a.keys)),
    ...unitsOf(
      (spec.seams ?? []).flatMap((s) =>
        usesAreas(s.a) || usesAreas(s.b)
          ? [...keysOfLand(s.a), ...keysOfLand(s.b)]
          : [],
      ),
    ),
  ];
  const admin = simplified(
    areas.topology,
    arcsOf({ type: 'GeometryCollection', geometries: wantedUnits }, new Set()),
    (bounds) => (intersects(bounds, reach) ? tolerance : Infinity),
  );

  /** Land as one shape, as scene-map's landShape makes it: countries alone from world-atlas, with areas all from admin-1. */
  const landShape = (land: MapLand): MultiPolygon | null => {
    if (!land.keys.length) {
      const geometries = countriesOf(land.countries);
      return geometries.length ? merge(world, geometries as never) : null;
    }
    const geometries = unitsOf(keysOfLand(land));
    return geometries.length ? merge(admin, geometries as never) : null;
  };
  /** The border two lands share, as scene-map's sharedBorder finds it. */
  const sharedBorder = (a: MapLand, b: MapLand): MultiLineString | null => {
    if (!a.keys.length && !b.keys.length) {
      const [inA, inB] = [new Set(a.countries), new Set(b.countries)];
      const line = mesh(
        world,
        {
          type: 'GeometryCollection',
          geometries: countriesOf([...a.countries, ...b.countries]),
        } as never,
        (x, y) =>
          x !== y &&
          ((inA.has(nameOf(x)) && inB.has(nameOf(y))) ||
            (inA.has(nameOf(y)) && inB.has(nameOf(x)))),
      );
      return line.coordinates.length ? line : null;
    }
    const [inA, inB] = [
      new Set<GeometryObject>(unitsOf(keysOfLand(a))),
      new Set<GeometryObject>(unitsOf(keysOfLand(b))),
    ];
    const line = mesh(
      admin,
      { type: 'GeometryCollection', geometries: [...inA, ...inB] } as never,
      (x, y) =>
        x !== y && ((inA.has(x) && inB.has(y)) || (inA.has(y) && inB.has(x))),
    );
    return line.coordinates.length ? line : null;
  };

  const features: Feature[] = [];
  const parts: Record<string, string> = {};
  const ids = new Set<string>();
  /** An id as the drawn map gives its part (scene-map's idFor), unique in the map. */
  const idFor = (prefix: string, name: string) => {
    const slug = groupId(name.normalize('NFD').replace(/\p{M}/gu, '')) || 'x';
    let id = `${prefix}-${slug}`;
    for (let n = 2; ids.has(id); n += 1) id = `${prefix}-${slug}-${n}`;
    ids.add(id);
    return id;
  };
  const add = (
    id: string,
    kind: GeoKind,
    geometry: Geometry | null,
    properties: Record<string, string | number | boolean> = {},
  ) => {
    if (!geometry) return false;
    features.push({
      type: 'Feature',
      id,
      properties: { id, kind, ...properties },
      geometry,
    });
    return true;
  };

  // The sea, under everything: the whole of the land kept.
  const [rw, rs, re, rn] = reach;
  add('sea', 'sea', {
    type: 'Polygon',
    coordinates: [
      [
        round([rw, rs]),
        round([re, rs]),
        round([re, rn]),
        round([rw, rn]),
        round([rw, rs]),
      ],
    ],
  });
  // The land, a country at a time: the show's own lighter than its neighbours.
  for (const one of kept) {
    const name = nameOf(one);
    const shape = topoFeature(world, one as never) as unknown as Feature<
      Polygon | MultiPolygon
    >;
    add(
      idFor('land', name),
      'land',
      polygonsIn(shape.geometry, reach, round, speck),
      { name, region: inRegion.has(name) },
    );
  }
  // Lakes, over the land.
  let lake = 0;
  for (const one of naturalLakes()) {
    const rings = one.polygons.flat();
    const bounds = boundsOf(rings.flat());
    if (!bounds || !intersects(bounds, reach)) continue;
    const polygons: Position[][][] = one.polygons.map((polygon) =>
      polygon.map((ring) => simplifyLine(ring, toleranceFor(bounds))),
    );
    const shape = polygonsIn(
      { type: 'MultiPolygon', coordinates: polygons },
      reach,
      round,
      speck * 4,
    );
    if (shape)
      add(`lake-${(lake += 1)}`, 'lake', shape, {
        ...(one.name ? { name: one.name } : {}),
      });
  }

  // The named regions, each one shape; the countries and areas coloured.
  for (const group of spec.merged ?? []) {
    const id = idFor('group', group.name);
    if (
      add(id, 'region', polygonsIn(landShape(group), reach, round, speck), {
        name: group.name,
        token: group.colour,
        colour: mapColourHex(group.colour),
      })
    )
      parts[group.name] = id;
  }
  for (const highlight of spec.highlights) {
    const id = idFor('country', highlight.name);
    const shape = polygonsIn(
      landShape({ countries: highlight.countries, keys: [] }),
      reach,
      round,
      speck,
    );
    if (
      add(id, 'highlight', shape, {
        name: highlight.name,
        ...(highlight.colour
          ? { token: highlight.colour, colour: mapColourHex(highlight.colour) }
          : {}),
      })
    ) {
      parts[highlight.name] = id;
      for (const country of highlight.countries) parts[country] ??= id;
    }
  }
  for (const area of spec.areas ?? []) {
    const id = idFor('area', area.name);
    const shape = polygonsIn(
      area.keys.length ? merge(admin, unitsOf(area.keys) as never) : null,
      reach,
      round,
      speck,
    );
    if (
      add(id, 'area', shape, {
        name: area.name,
        ...(area.colour
          ? { token: area.colour, colour: mapColourHex(area.colour) }
          : {}),
      })
    )
      parts[area.name] = id;
  }

  // The lines: the show's country's states, faint; the borders; the coast.
  const lineOf = (line: MultiLineString | null) => linesIn(line, reach, round);
  const lines = mesh(
    admin,
    {
      type: 'GeometryCollection',
      geometries: unitsOf(lined.flatMap((c) => areasOf(c))),
    } as never,
    (a, b) => a !== b && countryOfArea(a) === countryOfArea(b),
  );
  add('admin-lines', 'admin', lineOf(lines.coordinates.length ? lines : null));
  const collection = { type: 'GeometryCollection', geometries: kept } as never;
  add('borders', 'border', lineOf(mesh(world, collection, (a, b) => a !== b)));
  add('coast', 'coast', lineOf(mesh(world, collection, (a, b) => a === b)));

  // Seams, routes, places and pins: what the voice points at.
  for (const seam of spec.seams ?? []) {
    const id = idFor('seam', seam.name);
    if (
      add(id, 'seam', lineOf(sharedBorder(seam.a, seam.b)), {
        name: seam.name,
        style: seam.style,
      })
    )
      parts[seam.name] = id;
  }
  spec.routes.forEach((route, i) => {
    const ends = points.routes.get(i);
    if (!ends) return;
    const id = idFor('route', route.name);
    if (
      add(
        id,
        'route',
        { type: 'LineString', coordinates: bowed(ends[0], ends[1]).map(round) },
        { name: route.name },
      )
    )
      parts[route.name] = id;
  });
  for (const place of spec.places) {
    const id = idFor('place', place.name);
    if (
      add(
        id,
        'place',
        { type: 'Point', coordinates: round([place.lon, place.lat]) },
        { name: place.name, place: place.kind },
      )
    )
      parts[place.name] = id;
  }
  (spec.pins ?? []).forEach((pin, i) => {
    const spot = points.pins.get(i);
    if (!spot) return;
    const id = idFor('pin', pin.name);
    if (
      add(
        id,
        'pin',
        { type: 'Point', coordinates: round(spot) },
        {
          name: pin.name,
          ...(pin.label ? { label: pin.label } : {}),
          ...(pin.number ? { number: pin.number } : {}),
        },
      )
    )
      parts[pin.name] = id;
  });

  const boxesById: Record<string, GeoBounds> = {};
  for (const one of features) {
    const b = boundsOf(positionsOf(one.geometry));
    if (b)
      boxesById[String(one.id)] = b.map(
        (v) => Math.round(v * 1e4) / 1e4,
      ) as GeoBounds;
  }
  const collectionOut: FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const asset: ShotGeoAssetDto = {
    kind: 'geo',
    features: collectionOut,
    bounds: [r2(frame[0]), r2(frame[1]), r2(frame[2]), r2(frame[3])],
    // The borders are a past year's only where research says that year's were today's.
    ...(spec.year !== null &&
    spec.year !== undefined &&
    spec.year < new Date().getUTCFullYear() &&
    !spec.period
      ? { period: String(spec.year) }
      : {}),
  };
  return {
    asset,
    parts,
    boxes: boxesById,
    bytes: JSON.stringify(asset).length,
  };
}

/** A journey from one point to another, bowed to one side a fifth of its length, as points along it. */
function bowed(a: Position, b: Position): Position[] {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const c: Position = [
    (a[0] + b[0]) / 2 - dy * ROUTE_BOW,
    (a[1] + b[1]) / 2 + dx * ROUTE_BOW,
  ];
  const out: Position[] = [];
  for (let i = 0; i < ROUTE_POINTS; i += 1) {
    const t = i / (ROUTE_POINTS - 1);
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
}
