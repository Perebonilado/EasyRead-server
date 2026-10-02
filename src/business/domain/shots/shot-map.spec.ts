import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { shotLook } from './shot-build';
import { MAP_ASSET, mapSetAsset } from './shot-map';
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

  it('draws the regions and seam full frame as measured parts, with their names, and points places on it', async () => {
    const set = (await mapSetAsset(base, look, 'wide'))!;
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
    // Drawn once and kept.
    expect(await mapSetAsset(base, look, 'wide')).toBe(set);
  }, 30_000);

  it('is nothing for a show with no map code can draw', async () => {
    expect(await mapSetAsset(null, look, 'wide')).toBeNull();
    expect(
      await mapSetAsset({ kind: 'map', region: 'Nowhere Land' }, look, 'wide'),
    ).toBeNull();
  });
});

describe('the show’s map, as the board names it', () => {
  it('draws every region and seam of the show map that the registry names, under the same ids', async () => {
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
      const set = (await mapSetAsset(WALL_WORLD.base, look, shape))!;
      for (const feature of features) {
        expect(feature?.asset).toBe(set.id);
        expect(set.asset.parts[feature!.id]).toBeDefined();
        expect(set.asset.svg).toContain(`data-part="${feature!.id}"`);
      }
    }
  }, 30_000);
});
