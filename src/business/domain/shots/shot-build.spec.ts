import type { ShotSvgAssetDto } from '../../../contracts';
import { MAP, PALETTE, PLAN, REGISTRY } from './__fixtures__/regional-turn';
import {
  buildShots,
  shotLook,
  travelMs,
  type BuildContext,
} from './shot-build';
import { registryOf } from './shot-registry';
import { CAMERA_AMOUNT } from './shot-time';
import type { ShotPlan } from './types';

// The chart kinds are the charts work package's; here a counter, a
// timeline, a strike and a quotation are drawn, and every other kind is
// not, so both paths are seen.
jest.mock('./shot-charts', () => {
  const asset = (
    parts: Record<
      string,
      { box: [number, number, number, number]; value?: number }
    >,
  ): ShotSvgAssetDto => ({
    kind: 'svg',
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">' +
      Object.keys(parts)
        .map((id) => `<g data-part="${id}"/>`)
        .join('') +
      '</svg>',
    box: [0, 0, 1600, 900],
    parts,
    focal: [200, 200, 1200, 500],
  });
  const kinds: Record<string, ShotSvgAssetDto> = {
    counter: asset({ number: { box: [600, 300, 400, 300], value: 3 } }),
    timeline: asset({
      'event-1951': { box: [300, 400, 100, 100] },
      'event-1954': { box: [800, 400, 100, 100] },
    }),
    strike: asset({
      old: { box: [300, 300, 600, 200] },
      new: { box: [300, 520, 600, 200] },
    }),
    quote: asset({
      'quote-line-1': { box: [200, 300, 1200, 120] },
      speaker: { box: [200, 600, 500, 80] },
    }),
  };
  return {
    chartAsset: (kind: string): ShotSvgAssetDto | null => kinds[kind] ?? null,
  };
});

const ctx: BuildContext = {
  shape: 'wide',
  palette: PALETTE,
  held: 'chart5',
  theme: 'paper',
  map: MAP,
  seed: 'scene-1',
};
const registry = registryOf(REGISTRY);
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
    // Faces by name, as the stage takes them.
    expect(look.fonts).toEqual({
      display: 'Plus Jakarta Sans',
      text: 'Plus Jakarta Sans',
    });
    expect(shotLook({ ...ctx, theme: 'nightsky' }).fonts.display).toBe(
      'Georgia',
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
    expect(Object.keys(built.assets).sort()).toEqual(['chart-1', 'map']);
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

  it('leaves actors out until the kit has them, and says so', () => {
    expect(built.shots[2].actors).toEqual([]);
    expect(built.notes.join('\n')).toContain(
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

describe('the board’s names, as the build resolves them', () => {
  const entries = registryOf([
    ...REGISTRY,
    { name: 'date:1951', kind: 'date', about: 'regional legislatures' },
    { name: 'date:1954', kind: 'date', about: 'federalism' },
    {
      name: 'person:Herbert Macaulay',
      kind: 'person',
      about: 'an engineer',
      trace: { kind: 'place', ref: 'place:Lagos' },
    },
    {
      name: 'person:Obafemi Awolowo',
      kind: 'person',
      about: 'the Western leader',
      trace: { kind: 'quote', ref: 'claim:c1' },
    },
  ]);
  const plan: ShotPlan = {
    shots: [
      {
        on: 'After the 1945 strikes',
        set: {
          kind: 'chart',
          chart: {
            kind: 'timeline',
            spec: {
              events: [
                { when: '1951', name: 'Regional legislatures' },
                { when: '1954', name: 'Federalism' },
              ],
            },
          },
        },
        actors: [],
        info: [
          {
            recipe: 'label',
            target: 'part:1951',
            text: '1951',
            on: 'colonial Nigeria',
          },
          { recipe: 'mark', target: 'date:1954', on: 'regional legislatures' },
        ],
        life: [],
        camera: [],
        join: 'cut',
        focal: 'set',
      },
      {
        on: 'Then the fight changed',
        set: { kind: 'map' },
        actors: [],
        info: [
          {
            recipe: 'pin',
            target: 'person:Herbert Macaulay',
            on: 'independence',
          },
        ],
        life: [],
        camera: [],
        join: 'cut',
      },
      {
        on: 'Why did self-government',
        set: {
          kind: 'chart',
          chart: {
            kind: 'strike',
            spec: { old: 'one deadline', new: 'three' },
          },
        },
        actors: [],
        info: [{ recipe: 'strike', on: 'become a regional fight' }],
        life: [],
        camera: [],
        join: 'cut',
        focal: 'set',
      },
      {
        on: 'Those strikes made',
        set: {
          kind: 'chart',
          chart: {
            kind: 'quote',
            spec: { text: 'Regions first', speaker: 'Obafemi Awolowo' },
          },
        },
        actors: [],
        info: [
          {
            recipe: 'mark',
            target: 'person:Obafemi Awolowo',
            on: 'the old order',
          },
          {
            recipe: 'spotlight',
            target: 'claim:c1',
            on: 'pressure for change',
          },
        ],
        life: [],
        camera: [],
        join: 'cut',
      },
    ],
  };
  const named = buildShots(plan, entries, ctx);
  const [timeline, map, strike, quote] = named.shots;

  it('takes "set" as the set’s own subject', () => {
    expect(timeline.focal).toEqual({ kind: 'asset', asset: 'chart-1' });
    expect(strike.focal).toEqual({ kind: 'asset', asset: 'chart-2' });
  });

  it('finds a part by the words it shows, and a date as its event', () => {
    expect(timeline.info[0].target).toEqual({
      kind: 'asset',
      asset: 'chart-1',
      part: 'event-1951',
    });
    expect(timeline.info[1].target).toEqual({
      kind: 'asset',
      asset: 'chart-1',
      part: 'event-1954',
    });
  });

  it('shows a person with no portrait by their trace: their place on the map, their words on a quotation', () => {
    expect(map.info[0].target?.kind).toBe('box');
    const [x, y, w, h] = (map.info[0].target as { box: number[] }).box;
    const [px, py] = MAP.project!(3.38, 6.52)!;
    expect(x + w / 2).toBeCloseTo(px, 0);
    expect(y + h / 2).toBeCloseTo(py, 0);
    expect(quote.info[0].target).toEqual({
      kind: 'asset',
      asset: 'chart-3',
      part: 'speaker',
    });
    // A claim is the quotation that shows it.
    expect(quote.info[1].target).toEqual({ kind: 'asset', asset: 'chart-3' });
  });

  it('strikes a strike’s old words when the plan names nothing', () => {
    expect(strike.info[0]).toMatchObject({
      recipe: 'strike',
      target: { kind: 'asset', asset: 'chart-2', part: 'old' },
    });
  });

  it('drops a part the chart does not have, and a date with no timeline to show it', () => {
    const missing = buildShots(
      {
        shots: [
          {
            ...plan.shots[0],
            info: [
              {
                recipe: 'label',
                target: 'part:1999',
                text: '1999',
                on: 'colonial Nigeria',
              },
              {
                recipe: 'mark',
                target: 'date:1954',
                on: 'regional legislatures',
              },
            ],
          },
          {
            ...plan.shots[1],
            info: [{ recipe: 'mark', target: 'date:1951', on: 'independence' }],
          },
        ],
      },
      entries,
      ctx,
    );
    expect(missing.shots[0].info.map((i) => i.target)).toEqual([
      { kind: 'asset', asset: 'chart-1', part: 'event-1954' },
    ]);
    expect(missing.shots[1].info).toEqual([]);
  });
});
