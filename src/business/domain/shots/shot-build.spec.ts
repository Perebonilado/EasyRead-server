import type { ShotSvgAssetDto } from '../../../contracts';
import { MAP, PALETTE, PLAN, REGISTRY } from './__fixtures__/regional-turn';
import {
  buildShots,
  registryFrom,
  shotLook,
  travelMs,
  type BuildContext,
} from './shot-build';
import { CAMERA_AMOUNT } from './shot-time';
import type { ShotPlan } from './types';

// The chart kinds are the charts work package's; here a counter is drawn
// and every other kind is not, so both paths are seen.
jest.mock('./shot-charts', () => ({
  chartAsset: (kind: string): ShotSvgAssetDto | null =>
    kind === 'counter'
      ? {
          kind: 'svg',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><text data-part="number">3</text></svg>',
          box: [0, 0, 1600, 900],
          parts: { number: { box: [600, 300, 400, 300], value: 3 } },
          focal: [600, 300, 400, 300],
        }
      : null,
}));

const ctx: BuildContext = {
  shape: 'wide',
  palette: PALETTE,
  held: 'chart5',
  theme: 'paper',
  map: MAP,
  seed: 'scene-1',
};
const registry = registryFrom(REGISTRY);
const built = buildShots(PLAN, registry, ctx);

describe('the look', () => {
  it('is the theme’s paper and ink, its accent, the held colour and each side by name, springy, with grain', () => {
    const look = shotLook(ctx);
    expect(look.palette).toMatchObject({
      paper: '#FBF7EF',
      ink: '#1F2A37',
      accent: '#E0663A',
      held: '#733359',
      sides: {
        'North Region': '#0050BE',
        'West Region': '#BB7907',
        'East Region': '#28825A',
      },
    });
    expect(look.fonts.text).toContain('Plus Jakarta Sans');
    expect(look.motion).toBe('springy');
    expect(look.grain).toBe(0.15);
    // A dark theme's colours are its own.
    expect(shotLook({ ...ctx, theme: 'nightsky' }).palette.paper).not.toBe(
      look.palette.paper,
    );
    expect(shotLook({ ...ctx, theme: 'nightsky' }).fonts.display).toContain(
      'serif',
    );
  });
});

describe('the registry as the build reads it', () => {
  it('finds a name as written, in another case, or without its kind when only one has it', () => {
    expect(registry.resolve('place:Lagos')?.name).toBe('place:Lagos');
    expect(registry.resolve('PLACE:lagos')?.name).toBe('place:Lagos');
    expect(registry.resolve('Lagos')?.name).toBe('place:Lagos');
    expect(registry.resolve('North Region')?.kind).toBe('region');
    expect(registry.resolve('Nowhere')).toBeNull();
    expect(registry.resolve(undefined as unknown as string)).toBeNull();
  });
});

describe('the plan built', () => {
  it('builds every shot, the map once among the assets', () => {
    expect(built.shots.map((s) => s.id)).toEqual([
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
    expect(Object.keys(built.assets).sort()).toEqual([
      'actor-3-1',
      'chart-1',
      'map',
    ]);
    expect(built.shots[0].set).toEqual({
      kind: 'map',
      asset: 'map',
      style: 'atlas',
      // A drawn map cannot tilt: it lies flat until the map work package.
      tilt: 0,
      bearing: 0,
      terrain: false,
    });
    expect(built.shots[0].chip?.text).toContain("Today's borders");
  });

  it('resolves a region to its part and a place to a box round its point on the drawn map', () => {
    const [pin, fill] = built.shots[0].info;
    expect(fill).toMatchObject({
      recipe: 'fill',
      target: { kind: 'asset', asset: 'map', part: 'group-north-region' },
    });
    expect(pin.recipe).toBe('pin');
    expect(pin.target?.kind).toBe('box');
    const [x, y, w, h] = (pin.target as { box: number[] }).box;
    const [px, py] = MAP.project!(3.38, 6.52)!;
    expect(x + w / 2).toBeCloseTo(px, 0);
    expect(y + h / 2).toBeCloseTo(py, 0);
    expect(built.shots[0].focal).toEqual({
      kind: 'asset',
      asset: 'map',
      part: 'group-north-region',
    });
  });

  it('drops what points at nothing on its set, never turning it into words', () => {
    // A person with no picture, and a place with no point.
    expect(built.shots[0].info.map((i) => i.recipe)).toEqual(['pin', 'fill']);
    expect(built.notes.join('\n')).toContain(
      'label on "person:Ahmadu Bello" dropped',
    );
    expect(built.notes.join('\n')).toContain('pin on "place:Atlantis" dropped');
    for (const shot of built.shots)
      for (const item of shot.info)
        expect(item.target ?? item.recipe === 'ask').toBeTruthy();
  });

  it('draws a chart the kind knows, its number a part a count points at with the registry’s value', () => {
    const counter = built.shots[1];
    expect(counter.set).toEqual({ kind: 'chart', asset: 'chart-1' });
    expect(counter.info[0]).toMatchObject({
      recipe: 'count',
      target: { kind: 'asset', asset: 'chart-1', part: 'number' },
      value: 3,
      unit: 'deadlines',
    });
  });

  it('draws a chart once for every shot that shows it', () => {
    const counter = PLAN.shots[1];
    const twice = buildShots(
      { shots: [counter, { ...counter, on: 'Why did self-government' }] },
      registry,
      ctx,
    );
    expect(Object.keys(twice.assets)).toEqual(['chart-1']);
    expect(twice.assets['chart-1']).toBeDefined();
    expect(twice.shots.map((s) => s.set)).toEqual([
      { kind: 'chart', asset: 'chart-1' },
      { kind: 'chart', asset: 'chart-1' },
    ]);
    expect(twice.shots[0].join).toBe('continue');
  });

  it('makes a shot it cannot draw a safe one: the set before carried on, the camera moving in', () => {
    const portrait = built.shots[3];
    expect(portrait.set).toEqual(built.shots[2].set);
    expect(portrait.camera[0]).toMatchObject({
      move: 'push',
      amount: CAMERA_AMOUNT.small,
      // Where the camera last was: the seam the shot before pushed in on.
      target: { kind: 'asset', asset: 'map', part: 'seam-federal-balance' },
    });
    expect(built.notes.join('\n')).toContain(
      'no cleared picture of "person:Ahmadu Bello"',
    );
    // Its label lands on the map it carries on.
    expect(portrait.info[0]).toMatchObject({
      recipe: 'label',
      target: { kind: 'asset', part: 'group-west-region' },
      text: 'the West pressed',
    });
  });

  it('opens on the show’s map when the first shot cannot be drawn, and on paper when nothing can', () => {
    const plan: ShotPlan = {
      shots: [
        {
          ...PLAN.shots[1],
          set: { kind: 'chart', chart: { kind: 'nonsense', spec: {} } },
        },
      ],
    };
    const opened = buildShots(plan, registry, ctx);
    expect(opened.shots[0].set.kind).toBe('map');
    expect(opened.shots[0].camera[0].move).toBe('establish');
    const bare = buildShots(plan, registry, { ...ctx, map: null });
    expect(bare.shots[0].set).toEqual({ kind: 'plain' });
    expect(bare.notes.join(' ')).toContain('no picture could be drawn');
  });

  it('stands the kit’s pieces on the set: a crowd on its place on the map, as a marker, counting no one', () => {
    const [crowd] = built.shots[2].actors;
    expect(crowd).toMatchObject({ id: 'crowd', asset: 'actor-3-1' });
    const asset = built.assets['actor-3-1'];
    expect(asset.kind).toBe('svg');
    expect(asset.kind === 'svg' && asset.rig?.idle?.length).toBeGreaterThan(0);
    // On Kano's point, about a fourteenth of the map tall.
    const [px, py] = MAP.project!(8.52, 12.0)!;
    expect('x' in crowd.at && Math.abs(crowd.at.x - px)).toBeLessThan(40);
    expect('y' in crowd.at && Math.abs(crowd.at.y - py)).toBeLessThan(40);
    expect(crowd.size / 700).toBeCloseTo(0.07, 2);
    expect(crowd.moves).toEqual([
      { move: 'enter', on: 'regional fight', durMs: 2000 },
    ]);
    expect(built.notes.join('\n')).toContain('no number given, none claimed');
  });

  it('leaves out a piece the show’s look has not, and says so', () => {
    const other = buildShots(PLAN, registry, { ...ctx, look: 'illustrated' });
    expect(other.shots[2].actors).toEqual([]);
    expect(other.notes.join('\n')).toContain(
      'actor crowd (people.crowd) left out',
    );
  });

  it('frames a push on what it names, and says when it names what is not there', () => {
    expect(built.shots[2].camera[0]).toMatchObject({
      move: 'push',
      target: { kind: 'asset', part: 'seam-federal-balance' },
      amount: CAMERA_AMOUNT.medium,
    });
  });

  it('aims the camera at a place with room round it, while its pin points at the place itself', () => {
    const last = built.shots[4];
    const pin = last.info.find((i) => i.recipe === 'pin')!.target as {
      box: number[];
    };
    const travel = last.camera[0].target as { kind: string; box: number[] };
    expect(pin.box[2]).toBeLessThan(30);
    expect(travel.kind).toBe('box');
    expect(travel.box[2]).toBeCloseTo(700 * 0.3, 0);
    // Kept inside the map, round Lagos.
    expect(travel.box[0]).toBeGreaterThanOrEqual(0);
    expect(travel.box[0] + travel.box[2]).toBeLessThanOrEqual(900);
    expect(travel.box[1] + travel.box[3]).toBeLessThanOrEqual(700);
  });

  it('opens a shot that travels to its subject where the camera was, the travel measured from there', () => {
    const plan: ShotPlan = {
      shots: [
        {
          on: 'After the 1945 strikes',
          set: { kind: 'map' },
          actors: [],
          info: [],
          life: [],
          camera: [
            { move: 'push', target: 'place:Kano', on: 'colonial Nigeria' },
          ],
          join: 'continue',
        },
        {
          on: 'Then the fight changed',
          set: { kind: 'map' },
          actors: [],
          info: [],
          life: [],
          camera: [
            { move: 'travel', target: 'place:Lagos', on: 'independence' },
          ],
          focal: 'place:Lagos',
          join: 'cut',
        },
      ],
    };
    const [, travelling] = buildShots(plan, registry, ctx).shots;
    expect(travelling.focal).toBeUndefined();
    // From Kano, in the north, down to Lagos: longer than a step on the spot.
    expect(travelling.camera[0].durMs).toBeGreaterThan(400);
  });

  it('times a travel by how far it goes', () => {
    const travel = built.shots[4].camera[0];
    expect(travel.move).toBe('travel');
    expect(travel.durMs).toBeGreaterThanOrEqual(400);
    expect(travel.durMs).toBeLessThanOrEqual(1200);
    expect(travelMs([0, 0, 10, 10], [0, 0, 10, 10], 1000)).toBe(400);
    expect(travelMs([0, 0, 10, 10], [990, 0, 10, 10], 1000)).toBe(894);
    expect(travelMs([0, 0, 10, 10], [5000, 0, 10, 10], 1000)).toBe(1200);
  });

  it('labels a place with its own name and colours by a side the show names', () => {
    const last = built.shots[4];
    expect(last.info.find((i) => i.recipe === 'label')?.text).toBe('Lagos');
    expect(last.info.find((i) => i.recipe === 'fill')?.colour).toBe(
      'West Region',
    );
    expect(last.info.find((i) => i.recipe === 'pin')?.until).toBe('Lagos');
  });

  it('joins as the shots stand: one set carried on continues, a continue onto another set cuts', () => {
    expect(built.shots.map((s) => s.join)).toEqual([
      'cut',
      'dissolve',
      'continue',
      'continue',
      'cut',
    ]);
  });

  it('seeds the life layer from the scene, the same every time', () => {
    expect(built.shots[0].life).toHaveLength(1);
    expect(built.shots[0].life[0]).toMatchObject({
      effect: 'cloud-shadows',
      amount: 0.5,
    });
    expect(Number.isInteger(built.shots[0].life[0].seed)).toBe(true);
    expect(buildShots(PLAN, registry, ctx)).toEqual(built);
    expect(
      buildShots(PLAN, registry, { ...ctx, seed: 'other' }).shots[0].life[0]
        .seed,
    ).not.toBe(built.shots[0].life[0].seed);
  });
});
