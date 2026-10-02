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
});
