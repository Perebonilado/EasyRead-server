import type { Position } from 'geojson';
import { readMap, type MapDraft } from '../scene-map';
import {
  GEO_MOST_BYTES,
  WORLD_PX,
  clipLine,
  clipRing,
  mapGeo,
  mercator,
  mercatorBox,
  simplifyLine,
} from './shot-geo';

/** The show map of a history of Nigeria's regions (the Regional Turn's world.base, as the editor wrote it). */
const BASE = {
  kind: 'map',
  region: 'Nigeria',
  year: 1960,
  bordersDiffer: true,
  groups: [
    {
      name: 'North Region',
      colour: 'chart0',
      members: [
        'Kaduna',
        'Kano',
        'Katsina',
        'Sokoto',
        'Kebbi',
        'Zamfara',
        'Jigawa',
        'Borno',
        'Yobe',
        'Bauchi',
        'Gombe',
        'Adamawa',
        'Taraba',
        'Niger',
        'Kwara',
        'Kogi',
        'Plateau',
        'Benue',
        'Nasarawa',
        'Federal Capital Territory',
      ],
    },
    {
      name: 'West Region',
      colour: 'chart1',
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
      name: 'East Region',
      colour: 'chart2',
      members: [
        'Abia',
        'Anambra',
        'Ebonyi',
        'Enugu',
        'Imo',
        'Akwa Ibom',
        'Cross River',
        'Rivers',
        'Bayelsa',
      ],
    },
  ],
  seams: [
    {
      name: 'self-government pace',
      style: 'glow',
      between: ['North Region', 'West Region'],
    },
    {
      name: 'federal balance',
      style: 'glow',
      between: ['North Region', 'East Region'],
    },
  ],
};

const specOf = (draft: Partial<MapDraft>) =>
  readMap({
    region: 'Nigeria',
    highlight: null,
    places: null,
    routes: null,
    groups: BASE.groups,
    seams: BASE.seams as MapDraft['seams'],
    year: 1960,
    bordersDiffer: true,
    base: BASE as MapDraft['base'],
    ...draft,
  }).spec!;

type Feature = {
  id: string;
  properties: {
    id: string;
    kind: string;
    name?: string;
    region?: boolean;
    colour?: string;
    style?: string;
  };
  geometry: { type: string; coordinates: unknown };
};
const featuresOf = (asset: { features: { features: unknown[] } }) =>
  asset.features.features as Feature[];

/** Every position of a feature's geometry. */
function positions(coordinates: unknown): Position[] {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number')
    return [coordinates as Position];
  return Array.isArray(coordinates) ? coordinates.flatMap(positions) : [];
}

describe('Web Mercator, as the player projects', () => {
  it('puts the meeting of the equator and the prime meridian in the middle of the world, and north up', () => {
    expect(mercator(0, 0)).toEqual([WORLD_PX / 2, WORLD_PX / 2]);
    expect(mercator(-180, 0)[0]).toBe(0);
    expect(mercator(0, 60)[1]).toBeLessThan(WORLD_PX / 2);
    expect(mercator(0, 85.0511287798)[1]).toBeCloseTo(0, 3);
  });

  it('makes a box on the earth a box of pixels, north at its top', () => {
    const [x, y, w, h] = mercatorBox([2, 4, 15, 14]);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(x).toBeCloseTo(mercator(2, 14)[0], 0);
    expect(y).toBeCloseTo(mercator(2, 14)[1], 0);
  });
});

describe('outlines simplified and cut to the land kept', () => {
  it('keeps a line’s ends and drops what lies within the tolerance of it', () => {
    const line: Position[] = [
      [0, 0],
      [1, 0.001],
      [2, -0.001],
      [3, 0],
      [3, 1],
    ];
    expect(simplifyLine(line, 0.01)).toEqual([
      [0, 0],
      [3, 0],
      [3, 1],
    ]);
    expect(simplifyLine(line, 0)).toEqual(line);
    expect(simplifyLine(line, Infinity)).toEqual([
      [0, 0],
      [3, 1],
    ]);
  });

  it('keeps a ring of one arc a ring', () => {
    const ring: Position[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const kept = simplifyLine(ring, 0.1);
    expect(kept[0]).toEqual(kept[kept.length - 1]);
    expect(kept.length).toBeGreaterThanOrEqual(3);
  });

  it('cuts a ring to a box, closed, and drops one outside it', () => {
    const square: Position[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    const cut = clipRing(square, [0, 0, 5, 5])!;
    expect(cut[0]).toEqual(cut[cut.length - 1]);
    for (const [x, y] of cut) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    expect(clipRing(square, [-5, -5, 5, 5])).toEqual(square);
    expect(clipRing(square, [10, 10, 20, 20])).toBeNull();
  });

  it('cuts a line to a box: the runs of it inside, their ends on its edges', () => {
    const runs = clipLine(
      [
        [-2, 0.5],
        [2, 0.5],
        [2, 3],
        [0.5, 3],
        [0.5, 0.2],
      ],
      [0, 0, 1, 1],
    );
    expect(runs).toEqual([
      [
        [0, 0.5],
        [1, 0.5],
      ],
      [
        [0.5, 1],
        [0.5, 0.2],
      ],
    ]);
  });
});

describe('the show’s map as geography the player draws', () => {
  let geo: Awaited<ReturnType<typeof mapGeo>>;
  beforeAll(async () => {
    geo = await mapGeo(specOf({}));
  }, 60_000);

  it('names its regions and seams as the drawn map named its parts, each a feature with its id and kind', () => {
    const features = featuresOf(geo.asset);
    const ids = features.map((one) => one.properties.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sea',
        'borders',
        'coast',
        'admin-lines',
        'group-north-region',
        'group-west-region',
        'group-east-region',
        'seam-self-government-pace',
        'seam-federal-balance',
        'land-nigeria',
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const one of features) {
      expect(one.id).toBe(one.properties.id);
      expect(one.properties.kind).toBeTruthy();
    }
    expect(geo.parts).toEqual({
      'North Region': 'group-north-region',
      'West Region': 'group-west-region',
      'East Region': 'group-east-region',
      'self-government pace': 'seam-self-government-pace',
      'federal balance': 'seam-federal-balance',
    });
    const north = features.find(
      (one) => one.properties.id === 'group-north-region',
    )!;
    expect(north.properties).toMatchObject({
      kind: 'region',
      name: 'North Region',
    });
    expect(north.properties.colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(
      features.find((one) => one.properties.id === 'land-nigeria')!.properties
        .region,
    ).toBe(true);
    expect(
      features.find((one) => one.properties.id === 'land-niger')!.properties
        .region,
    ).toBe(false);
  });

  it('frames the show’s country, with real land round it as far as a tilted camera sees', () => {
    const [w, s, e, n] = geo.asset.bounds;
    // Nigeria: about 2.7°E to 14.7°E, 4.3°N to 13.9°N.
    expect(w).toBeGreaterThan(2);
    expect(w).toBeLessThan(3.5);
    expect(e).toBeGreaterThan(14);
    expect(e).toBeLessThan(15.5);
    expect(s).toBeGreaterThan(3.5);
    expect(n).toBeLessThan(14.5);
    const reach = geo.boxes.sea;
    expect(reach[3] - n).toBeGreaterThan(10);
    // The Sahara north of it is land, not sea.
    const lands = featuresOf(geo.asset)
      .filter((one) => one.properties.kind === 'land')
      .map((one) => one.properties.name);
    expect(lands).toEqual(
      expect.arrayContaining(['Niger', 'Chad', 'Algeria', 'Cameroon', 'Benin']),
    );
  });

  it('says nothing of a past year’s borders it does not draw: today’s borders carry no period', () => {
    expect(geo.asset.period).toBeUndefined();
  });

  it('weighs no more than a scene can carry', () => {
    expect(geo.bytes).toBe(JSON.stringify(geo.asset).length);
    expect(geo.bytes).toBeLessThanOrEqual(GEO_MOST_BYTES);
  });

  it('keeps one border between two regions: the seam’s points are both regions’ own (no slivers)', () => {
    const features = featuresOf(geo.asset);
    const points = (id: string) =>
      new Set(
        positions(
          features.find((one) => one.properties.id === id)!.geometry
            .coordinates,
        ).map((p) => p.join(',')),
      );
    const seam = points('seam-federal-balance');
    const north = points('group-north-region');
    const east = points('group-east-region');
    expect(seam.size).toBeGreaterThan(5);
    for (const point of seam) {
      expect(north.has(point)).toBe(true);
      expect(east.has(point)).toBe(true);
    }
  });

  it('simplifies further until it weighs what it is asked to', async () => {
    const light = await mapGeo(specOf({}), { maxBytes: 90_000 });
    expect(light.bytes).toBeLessThanOrEqual(90_000);
    expect(light.tolerance).toBeGreaterThan(geo.tolerance);
  }, 60_000);

  it('draws the places, pins and routes a map names, each its own feature', async () => {
    const more = await mapGeo(
      specOf({
        places: ['Kano', 'Lagos'],
        routes: [{ from: 'Lagos', to: 'Kano', name: 'the tour' }],
        pins: [{ place: 'Kaduna', label: 'Kaduna' }],
      }),
    );
    const features = featuresOf(more.asset);
    const kinds = Object.fromEntries(
      features.map((one) => [one.properties.id, one.properties.kind]),
    );
    expect(kinds).toMatchObject({
      'place-kano': 'place',
      'place-lagos': 'place',
      'route-the-tour': 'route',
      'pin-kaduna': 'pin',
    });
    const route = features.find(
      (one) => one.properties.id === 'route-the-tour',
    )!;
    const line = route.geometry.coordinates as Position[];
    expect(line[0][0]).toBeCloseTo(3.4, 0);
    expect(line[line.length - 1][1]).toBeCloseTo(12, 0);
    expect(more.parts['the tour']).toBe('route-the-tour');
  }, 60_000);
});
