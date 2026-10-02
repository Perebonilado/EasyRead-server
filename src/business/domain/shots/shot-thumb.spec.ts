import type { SceneDto, ShotDto } from '../../../contracts';
import { MAP_ASSET } from './__fixtures__/regional-turn';
import { shotsThumbSvg } from './shot-thumb';

const shot = (more: Partial<ShotDto>): ShotDto => ({
  id: 's1',
  startMs: 0,
  endMs: 4000,
  set: { kind: 'plain' },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  joinMs: 0,
  ...more,
});

const scene = (shots: ShotDto[]): SceneDto =>
  ({
    stagings: {
      box: { w: 1600, h: 900, places: [] },
      wide: { w: 1600, h: 900, places: [] },
    },
    engine: 'shots',
    shots: {
      version: 1,
      look: {
        palette: {
          paper: '#101820',
          ink: '#fff',
          muted: '#999',
          accent: '#f60',
          sides: {},
        },
        fonts: { display: 'serif', text: 'sans-serif' },
        grain: 0.15,
        motion: 'springy',
      },
      assets: { map: MAP_ASSET },
      shots,
      sounds: [],
    },
  }) as unknown as SceneDto;

describe('a scene of shots as its card’s still', () => {
  it('lays its first drawn set into the stage, framed on its subject, on the look’s paper', () => {
    const svg = shotsThumbSvg(
      scene([
        shot({}),
        shot({
          id: 's2',
          set: {
            kind: 'map',
            asset: 'map',
            style: 'atlas',
            tilt: 0,
            bearing: 0,
            terrain: false,
          },
          focal: { kind: 'asset', asset: 'map', part: 'group-north-region' },
        }),
      ]),
    );
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1600 900"/,
    );
    expect(svg).toContain('fill="#101820"');
    expect(svg).toContain('data-part="group-north-region"');
    expect(svg).toMatch(
      /<g transform="translate\([-\d.]+ [-\d.]+\) scale\([\d.]+\)">/,
    );
    // The asset's own root is not nested inside.
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(
      shotsThumbSvg(
        scene([
          shot({}),
          shot({
            id: 's2',
            set: {
              kind: 'map',
              asset: 'map',
              style: 'atlas',
              tilt: 0,
              bearing: 0,
              terrain: false,
            },
          }),
        ]),
      ),
    ).toBe(
      shotsThumbSvg(
        scene([
          shot({
            set: {
              kind: 'map',
              asset: 'map',
              style: 'atlas',
              tilt: 0,
              bearing: 0,
              terrain: false,
            },
          }),
        ]),
      ),
    );
  });

  it('is the paper alone when no shot shows a drawn set', () => {
    expect(shotsThumbSvg(scene([shot({})]))).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="1600" height="900" fill="#101820"/></svg>',
    );
  });

  it('draws the player’s own map flat, framed on the shot’s subject, its regions in the colour the scene leaves them', () => {
    const square = (w: number, s: number, e: number, n: number) => [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ];
    const geo = {
      kind: 'geo',
      bounds: [2, 4, 15, 14],
      features: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: 'sea', kind: 'sea' },
            geometry: { type: 'Polygon', coordinates: square(-10, -5, 27, 30) },
          },
          {
            type: 'Feature',
            properties: { id: 'land-nigeria', kind: 'land', region: true },
            geometry: {
              type: 'Polygon',
              coordinates: square(3, 4.5, 14.5, 13.8),
            },
          },
          {
            type: 'Feature',
            properties: {
              id: 'group-north-region',
              kind: 'region',
              name: 'North',
            },
            geometry: { type: 'Polygon', coordinates: square(4, 9, 14, 13.5) },
          },
          {
            type: 'Feature',
            properties: {
              id: 'group-west-region',
              kind: 'region',
              name: 'West',
            },
            geometry: { type: 'Polygon', coordinates: square(3, 5, 6, 9) },
          },
          {
            type: 'Feature',
            properties: { id: 'seam-a', kind: 'seam' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [4, 9],
                  [14, 9],
                ],
              ],
            },
          },
        ],
      },
    };
    const made = scene([
      shot({
        set: {
          kind: 'map',
          asset: 'map',
          style: 'atlas',
          tilt: 50,
          bearing: 0,
          terrain: true,
        },
        focal: { kind: 'feature', asset: 'map', id: 'group-north-region' },
        info: [
          {
            id: 'i1',
            recipe: 'fill',
            target: { kind: 'feature', asset: 'map', id: 'group-north-region' },
            atMs: 100,
            durMs: 600,
            colour: 'accent',
          },
          {
            id: 'i2',
            recipe: 'fill',
            target: { kind: 'feature', asset: 'map', id: 'group-west-region' },
            atMs: 200,
            durMs: 600,
            untilMs: 900,
            colour: 'accent',
          },
        ],
      }),
    ]);
    (made.shots!.assets as Record<string, unknown>).map = geo;
    const svg = shotsThumbSvg(made);
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg).toContain('<path d="M');
    // The North stays filled in the accent; the West's fill left before the end.
    expect(svg).toContain('fill="#f60" fill-opacity="0.85"');
    expect(svg.match(/fill-opacity="0.85"/g)).toHaveLength(1);
    expect(svg).toContain('stroke-dasharray="12 9"');
    expect(shotsThumbSvg(made)).toBe(svg);
  });
});
