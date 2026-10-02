import { shotLook } from './shot-build';
import {
  MAP_ASSET,
  drawnMapSet,
  featureCentre,
  mapSetAsset,
  stillMap,
} from './shot-map';
import { mercator } from './shot-geo';

describe('today’s map made a still asset', () => {
  const drawn =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">' +
    '<style>@keyframes show{from{opacity:0}}.show{animation:show .6s}</style>' +
    '<rect x="0" y="0" width="100" height="80" rx="14" fill="#1A99CE"/>' +
    '<defs><clipPath id="map-frame"><rect width="100" height="80" rx="14"/></clipPath></defs>' +
    '<g clip-path="url(#map-frame)">' +
    '<g id="group-north"><g class="show keep" style="animation-delay:0.30s;opacity:.9"><use href="#land"/></g></g>' +
    '<g id="seam-a"><path d="M0 0L10 10"/></g>' +
    '<g id="label-north"><text>North</text></g>' +
    '<g id="period"><text>Today’s borders</text></g>' +
    '</g></svg>';
  const still = stillMap(drawn, ['group-north', 'seam-a'], 'map-');

  it('keeps no animation, no rounded card, no names of its own and no corner note', () => {
    expect(still.svg).not.toContain('<style');
    expect(still.svg).not.toContain('animation');
    expect(still.svg).not.toContain('class="show');
    expect(still.svg).toContain('class="keep"');
    expect(still.svg).toContain('opacity:.9');
    expect(still.svg).not.toContain('rx=');
    expect(still.svg).not.toContain('North</text>');
    expect(still.svg).not.toContain('borders');
  });

  it('marks its parts and makes every id and reference its own', () => {
    expect(still.parts).toEqual(['group-north', 'seam-a']);
    expect(still.svg).toContain('id="map-group-north" data-part="group-north"');
    expect(still.svg).toContain('id="map-map-frame"');
    expect(still.svg).toContain('clip-path="url(#map-map-frame)"');
    expect(still.svg).toContain('href="#map-land"');
  });
});

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
    expect(set.chip?.text).toContain('Natural Earth');
    // Made once, for every shape and theme.
    expect(await mapSetAsset(base, look, 'tall', 'nightsky')).toBe(set);
  }, 30_000);

  it('keeps today’s drawing for whatever cannot draw geography: regions and seam as measured parts, places pointed at on it', async () => {
    const set = (await drawnMapSet(base, look, 'wide'))!;
    expect(set.id).toBe(MAP_ASSET);
    expect(set.flat).toBe(true);
    if (set.asset.kind !== 'svg') throw new Error('a drawn map');
    expect(Object.keys(set.asset.parts).sort()).toEqual([
      'group-north-region',
      'group-west-region',
      'seam-the-line',
    ]);
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
    expect(set.chip?.text).toContain('Natural Earth');
    expect(set.asset.svg).not.toContain('animation');
    // Drawn once and kept.
    expect(await drawnMapSet(base, look, 'wide')).toBe(set);
    expect(await mapSetAsset(base, look, 'wide', 'paper', 'drawn')).toBe(set);
  }, 30_000);

  it('is nothing for a show with no map code can draw', async () => {
    expect(await mapSetAsset(null, look, 'wide')).toBeNull();
    expect(
      await mapSetAsset({ kind: 'map', region: 'Nowhere Land' }, look, 'wide'),
    ).toBeNull();
  });
});
