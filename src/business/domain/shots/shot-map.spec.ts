import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { shotLook } from './shot-build';
import { mercator } from './shot-geo';
import { MAP_ASSET, drawnMapSet, featureCentre, mapSetAsset } from './shot-map';
import { buildRegistry } from './shot-registry';

describe('the show’s map as a shot’s set', () => {
  const base = {
    kind: 'map',
    region: 'Nigeria',
    year: 1960,
    bordersDiffer: true,
    groups: [
      {
        name: 'North Region',
        colour: 'chart0',
        members: [
          'Kano',
          'Kaduna',
          'Sokoto',
          'Borno',
          'Niger',
          'Kwara',
          'Benue',
          'Plateau',
        ],
      },
      {
        name: 'West Region',
        colour: 'chart1',
        members: ['Lagos', 'Ogun', 'Oyo', 'Osun', 'Ondo', 'Ekiti'],
      },
    ],
    seams: [
      {
        between: ['North Region', 'West Region'],
        name: 'the line',
        style: 'glow',
      },
    ],
  };
  const look = shotLook({
    palette: [
      { thing: 'North Region', token: 'chart0' },
      { thing: 'West Region', token: 'chart1' },
    ],
    held: null,
    theme: 'paper',
  });

  it('is geography the player draws: its regions and seam features, its frame in Web Mercator, tiltable', async () => {
    const set = (await mapSetAsset(base, look, 'wide'))!;
    expect(set.id).toBe(MAP_ASSET);
    expect(set.flat).toBe(false);
    expect(set.project).toBeUndefined();
    if (set.asset.kind !== 'geo') throw new Error('a geo map');
    const ids = (
      set.asset.features.features as { properties: { id: string } }[]
    ).map((one) => one.properties.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'group-north-region',
        'group-west-region',
        'seam-the-line',
      ]),
    );
    expect(set.parts['West Region']).toBe('group-west-region');
    // Kano is inside the North's box; its point is a point on the earth.
    const north = set.boxOf!({
      kind: 'feature',
      asset: MAP_ASSET,
      id: 'group-north-region',
    })!;
    const [kx, ky] = mercator(8.52, 12.0);
    expect(kx).toBeGreaterThan(north[0]);
    expect(kx).toBeLessThan(north[0] + north[2]);
    expect(ky).toBeGreaterThan(north[1]);
    expect(ky).toBeLessThan(north[1] + north[3]);
    expect(set.boxOf!({ kind: 'geo', lng: 8.52, lat: 12 })).toEqual([
      kx,
      ky,
      0,
      0,
    ]);
    expect(set.boxOf!({ kind: 'asset', asset: MAP_ASSET })).toEqual(set.box);
    const middle = featureCentre(set, 'group-north-region')!;
    expect(middle[1]).toBeGreaterThan(8);
    // It writes no note of its own, so its chip says whose borders they are.
    expect(set.chip?.text).toContain('Natural Earth');
    // Made once, for every shape and theme.
    expect(await mapSetAsset(base, look, 'tall', 'nightsky')).toBe(set);
  }, 30_000);

  it('is drawn full frame by the charts for whatever cannot draw geography: the regions and seam as measured parts, with their names, places pointed at on it', async () => {
    const set = (await drawnMapSet(base, look, 'wide'))!;
    if (set.asset.kind !== 'svg') throw new Error('a drawn map');
    expect(set.id).toBe(MAP_ASSET);
    expect(set.flat).toBe(true);
    expect(set.asset.box).toEqual([0, 0, 1600, 900]);
    expect(Object.keys(set.asset.parts)).toEqual(
      expect.arrayContaining([
        'group-north-region',
        'group-west-region',
        'seam-the-line',
        'label-north-region',
      ]),
    );
    expect(set.asset.parts['seam-the-line'].path).toBeDefined();
    const north = set.asset.parts['group-north-region'];
    expect(north.role).toBe('North Region');
    const [, , W, H] = set.asset.box;
    expect(north.box[0]).toBeGreaterThanOrEqual(0);
    expect(north.box[0] + north.box[2]).toBeLessThanOrEqual(W + 1);
    expect(north.box[1] + north.box[3]).toBeLessThanOrEqual(H + 1);
    expect(set.parts['West Region']).toBe('group-west-region');
    // Kano is in the North's box; Paris is off the map.
    const kano = set.project!(8.52, 12.0)!;
    expect(kano[0]).toBeGreaterThan(north.box[0]);
    expect(kano[0]).toBeLessThan(north.box[0] + north.box[2]);
    expect(kano[1]).toBeLessThan(north.box[1] + north.box[3]);
    expect(set.project!(2.35, 48.85)).toBeNull();
    // Its borders' note is the drawing's own, so no chip says it again.
    expect(set.asset.parts.period).toBeDefined();
    expect(set.chip).toBeUndefined();
    expect(set.asset.svg).not.toContain('animation');
    // Drawn once and kept, and the same asked of mapSetAsset by name.
    expect(await drawnMapSet(base, look, 'wide')).toBe(set);
    expect(await mapSetAsset(base, look, 'wide', 'paper', 'drawn')).toBe(set);
  }, 30_000);

  it('is nothing for a show with no map code can draw', async () => {
    expect(await mapSetAsset(null, look, 'wide')).toBeNull();
    expect(
      await mapSetAsset({ kind: 'map', region: 'Nowhere Land' }, look, 'wide'),
    ).toBeNull();
    expect(await drawnMapSet(null, look, 'wide')).toBeNull();
  });
});

describe('the show’s map, as the board names it', () => {
  it('draws every region and seam of the show map that the registry names, under the same ids, drawn or as geography', async () => {
    const registry = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
    });
    const features = registry
      .entries()
      .filter((e) => e.kind === 'region' || e.kind === 'seam')
      .map((e) => e.feature);
    expect(features.length).toBeGreaterThanOrEqual(3);
    const look = shotLook({
      palette: WALL_WORLD.palette,
      held: null,
      theme: 'paper',
    });
    for (const shape of ['wide', 'tall'] as const) {
      const set = (await drawnMapSet(WALL_WORLD.base, look, shape))!;
      if (set.asset.kind !== 'svg') throw new Error('a drawn map');
      for (const feature of features) {
        expect(feature?.asset).toBe(set.id);
        expect(set.asset.parts[feature!.id]).toBeDefined();
        expect(set.asset.svg).toContain(`data-part="${feature!.id}"`);
      }
    }
    const geo = (await mapSetAsset(WALL_WORLD.base, look, 'wide'))!;
    if (geo.asset.kind !== 'geo') throw new Error('a geo map');
    const ids = (
      geo.asset.features.features as { properties: { id: string } }[]
    ).map((one) => one.properties.id);
    for (const feature of features) {
      expect(feature?.asset).toBe(geo.id);
      expect(ids).toContain(feature!.id);
    }
  }, 30_000);
});
