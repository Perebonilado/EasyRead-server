import type { ShotSvgAssetDto } from '../../../contracts';
import { MAP, PALETTE, PLAN, REGISTRY } from './__fixtures__/regional-turn';
import {
  buildShots,
  shotLook,
  travelMs,
  type BuildContext,
} from './shot-build';
import { chartAsset } from './shot-charts';
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
      {
        box: [number, number, number, number];
        value?: number;
        later?: boolean;
        path?: string;
      }
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
      strike: {
        box: [280, 380, 640, 40],
        later: true,
        path: 'M280 400L920 390',
      },
      new: { box: [300, 520, 600, 200], later: true },
    }),
    document: asset({
      page: { box: [400, 100, 800, 700] },
      stamp: { box: [900, 500, 250, 120], later: true },
    }),
    calendar: asset({
      'day-1': { box: [300, 300, 200, 200] },
      'day-2': { box: [700, 300, 200, 200], later: true },
    }),
    quote: asset({
      'quote-line-1': { box: [200, 300, 1200, 120] },
      speaker: { box: [200, 600, 500, 80] },
    }),
  };
  return {
    chartAsset: jest.fn(
      (kind: string): ShotSvgAssetDto | null => kinds[kind] ?? null,
    ),
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
  it('builds every shot, each set it shows among the assets and nothing else', () => {
    expect(built.shots.map((s) => s.id)).toEqual([
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
    // Every asset is shown: a shot's set or one of its actors.
    const shown = new Set(
      built.shots.flatMap((s) => [
        'asset' in s.set ? s.set.asset : '',
        ...s.actors.map((a) => a.asset),
      ]),
    );
    shown.delete('');
    expect(new Set(Object.keys(built.assets))).toEqual(shown);
    expect(built.shots[0].set).toMatchObject({
      kind: 'map',
      style: 'atlas',
      // A drawn map cannot tilt: it lies flat until the map work package.
      tilt: 0,
      bearing: 0,
      terrain: false,
    });
    expect(built.shots[0].chip?.text).toContain("Today's borders");
  });

  it('starts a region neutral in the run it is first filled in, and coloured in every run after', () => {
    const first = built.shots[0].set as { asset: string };
    const later = built.shots[4].set as { asset: string };
    expect(first.asset).toMatch(/^map~/);
    expect(later.asset).toMatch(/^map~/);
    expect(later.asset).not.toBe(first.asset);
    // The runs: shot 1 alone (a chart follows), then shots 3 to 5 on one copy.
    expect((built.shots[2].set as { asset: string }).asset).toBe(later.asset);
    const svg = (id: string) => (built.assets[id] as { svg: string }).svg;
    const fillOf = (markup: string, part: string) =>
      /fill="([^"]+)"/.exec(
        markup.slice(markup.indexOf(`data-part="${part}"`)),
      )?.[1];
    // North is filled in the first run, so it starts neutral there; West later.
    expect(fillOf(svg(first.asset), 'group-north-region')).not.toBe('#0050BE');
    expect(fillOf(svg(first.asset), 'group-west-region')).toBe('#BB7907');
    expect(fillOf(svg(later.asset), 'group-north-region')).toBe('#0050BE');
    expect(fillOf(svg(later.asset), 'group-west-region')).not.toBe('#BB7907');
    // And a fill with no colour of its own lands on its side's.
    expect(built.shots[0].info.find((i) => i.recipe === 'fill')?.colour).toBe(
      'North Region',
    );
  });

  it('resolves a region to its part and a place to a box round its point on the drawn map', () => {
    const [pin, fill] = built.shots[0].info;
    expect(fill).toMatchObject({
      recipe: 'fill',
      target: { kind: 'asset', part: 'group-north-region' },
    });
    expect(pin.recipe).toBe('pin');
    expect(pin.target?.kind).toBe('box');
    const [x, y, w, h] = (pin.target as { box: number[] }).box;
    const [px, py] = MAP.project!(3.38, 6.52)!;
    expect(x + w / 2).toBeCloseTo(px, 0);
    expect(y + h / 2).toBeCloseTo(py, 0);
    expect(built.shots[0].focal).toMatchObject({
      kind: 'asset',
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
    });
    // Where the camera last was: round the seam the shot before pushed in on.
    const aim = portrait.camera[0].target as { kind: string; box: number[] };
    expect(aim.kind).toBe('box');
    expect(aim.box[0]).toBeLessThanOrEqual(450);
    expect(aim.box[0] + aim.box[2]).toBeGreaterThanOrEqual(800);
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

  it('frames a push on what it names, with room round it when it is thin', () => {
    const push = built.shots[2].camera[0];
    expect(push).toMatchObject({ move: 'push', amount: CAMERA_AMOUNT.medium });
    // The seam is a line: the camera takes half the map round it.
    const [x, y, w, h] = (push.target as { box: number[] }).box;
    expect(w).toBeGreaterThanOrEqual(350);
    expect(h).toBeGreaterThanOrEqual(350);
    expect(x).toBeLessThanOrEqual(450);
    expect(x + w).toBeGreaterThanOrEqual(800);
    expect(y).toBeLessThanOrEqual(398);
    expect(y + h).toBeGreaterThanOrEqual(402);
  });

  it('aims the camera at a place with room round it, while its pin points at the place itself', () => {
    const last = built.shots[4];
    const pin = last.info.find((i) => i.recipe === 'pin')!.target as {
      box: number[];
    };
    const travel = last.camera[0].target as { kind: string; box: number[] };
    expect(pin.box[2]).toBeLessThan(30);
    expect(travel.kind).toBe('box');
    expect(travel.box[2]).toBeCloseTo(700 * 0.5, 0);
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

  it('takes "set" as the set’s own subject: a chart whole, a map by the box its drawing frames', () => {
    expect(timeline.focal).toEqual({ kind: 'asset', asset: 'chart-1' });
    expect(strike.focal).toEqual({ kind: 'asset', asset: 'chart-2' });
    const map = buildShots(
      { shots: [{ ...plan.shots[1], focal: 'set' }] },
      entries,
      ctx,
    );
    expect(map.shots[0].focal).toEqual({
      kind: 'box',
      box: [100, 50, 700, 600],
    });
  });

  it('finds a part by the words it shows, and a date as its event; a label on a chart brings its part on, never a second name', () => {
    expect(timeline.info[0]).toMatchObject({
      recipe: 'enter',
      text: 'rise',
      target: { kind: 'asset', asset: 'chart-1', part: 'event-1951' },
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

  it('draws a strike chart’s own line through the old words, its new words coming in after', () => {
    expect(
      strike.info.map((i) => [i.recipe, (i.target as { part?: string }).part]),
    ).toEqual([
      ['draw', 'strike'],
      ['enter', 'new'],
    ]);
    expect(strike.info[1]).toMatchObject({ text: 'rise', lag: 400 });
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

describe('a set’s later state and its own names, brought on by the changes they belong to', () => {
  const entries = registryOf(REGISTRY);
  const labelled = {
    ...MAP,
    asset: {
      ...MAP.asset,
      svg: MAP.asset.svg.replace(
        '</svg>',
        '<g data-part="label-north-region"><text>North Region</text></g></svg>',
      ),
      parts: {
        ...MAP.asset.parts,
        'label-north-region': { box: [400, 200, 200, 40] },
      },
    },
  } as typeof MAP;
  const plan: ShotPlan = {
    shots: [
      {
        on: 'After the 1945 strikes',
        set: { kind: 'map' },
        actors: [],
        info: [
          {
            recipe: 'label',
            target: 'region:North Region',
            text: 'North Region',
            on: 'colonial Nigeria',
          },
        ],
        life: [],
        camera: [],
        join: 'cut',
      },
      {
        on: 'Then the fight changed',
        set: {
          kind: 'chart',
          chart: { kind: 'document', spec: { title: 'The Act' } },
        },
        actors: [],
        info: [{ recipe: 'stamp', text: 'PASSED', on: 'independence' }],
        life: [],
        camera: [],
        join: 'cut',
      },
      {
        on: 'Why did self-government',
        set: { kind: 'chart', chart: { kind: 'calendar', spec: {} } },
        actors: [],
        info: [
          {
            recipe: 'mark',
            target: 'part:day-1',
            on: 'become a regional fight',
          },
        ],
        life: [],
        camera: [],
        join: 'cut',
      },
    ],
  };
  const made = buildShots(plan, entries, { ...ctx, map: labelled });
  const [map, document, calendar] = made.shots;

  it('names a region the map names itself by bringing its own name on, never writing a second', () => {
    expect(map.info).toEqual([
      expect.objectContaining({
        recipe: 'enter',
        target: {
          kind: 'asset',
          asset: expect.stringMatching(/^map/) as string,
          part: 'label-north-region',
        },
        text: 'rise',
        on: 'colonial Nigeria',
      }),
    ]);
  });

  it('lands a stamp with the document’s own stamp coming down, not a second one', () => {
    expect(
      document.info.map((i) => [
        i.recipe,
        (i.target as { part?: string }).part,
        i.text,
      ]),
    ).toEqual([
      ['stamp', 'stamp', undefined],
      ['enter', 'stamp', 'scale'],
    ]);
  });

  it('names a region as the run fills it when the plan names it only in a later shot', () => {
    const named = buildShots(
      {
        shots: [
          {
            ...plan.shots[0],
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'colonial Nigeria',
              },
            ],
            join: 'continue',
          },
          {
            ...plan.shots[0],
            on: 'Then the fight changed',
            info: [
              {
                recipe: 'label',
                target: 'region:North Region',
                on: 'independence',
              },
            ],
          },
        ],
      },
      entries,
      { ...ctx, map: labelled },
    );
    const [filling, naming] = named.shots;
    expect(
      filling.info.map((i) => [
        i.recipe,
        (i.target as { part?: string }).part,
        i.on,
      ]),
    ).toEqual([
      ['fill', 'group-north-region', 'colonial Nigeria'],
      ['enter', 'label-north-region', 'colonial Nigeria'],
    ]);
    expect(naming.info).toEqual([]);
  });

  it('brings on a later part nothing brings on with the shot’s last change', () => {
    expect(
      calendar.info.map((i) => [
        i.recipe,
        (i.target as { part?: string }).part,
      ]),
    ).toEqual([
      ['mark', 'day-1'],
      ['enter', 'day-2'],
    ]);
    expect(made.notes.join(' ')).toContain(
      'day-2 brought on with its last change',
    );
  });
});

describe('the camera and the fills, as the stage plays them', () => {
  const entries = registryOf(REGISTRY);
  const shot = (
    more: Partial<ShotPlan['shots'][number]>,
  ): ShotPlan['shots'][number] => ({
    on: 'After the 1945 strikes',
    set: { kind: 'map' },
    actors: [],
    info: [],
    life: [],
    camera: [],
    join: 'continue',
    ...more,
  });

  it('lets a highlight go back to the part’s own colour, and never starts its part neutral', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'colonial Nigeria',
                until: 'began shifting',
              },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    const fill = made.shots[0].info[0];
    expect(fill.colour).toBeUndefined();
    expect((made.shots[0].set as { asset: string }).asset).toBe('map');
  });

  it('leaves out a lasting fill of a part already that colour in the run', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'colonial Nigeria',
              },
            ],
          }),
          shot({
            on: 'Then the fight changed',
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'independence',
              },
              { recipe: 'fill', target: 'region:West Region', on: 'but three' },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    expect(
      made.shots[1].info.map((i) => (i.target as { part: string }).part),
    ).toEqual(['group-west-region']);
    expect(made.notes.join(' ')).toContain(
      'fill of group-north-region left out',
    );
  });

  it('drops a flow with no path to run along and nowhere to go, and travels where a follow has nothing moving', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            info: [
              { recipe: 'flow', target: 'place:Lagos', on: 'colonial Nigeria' },
            ],
            camera: [
              { move: 'follow', target: 'place:Lagos', on: 'began shifting' },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    expect(made.shots[0].info).toEqual([]);
    expect(made.shots[0].camera[0].move).toBe('travel');
  });

  it('takes in what a shot shows away from where the camera is, with one travel', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            focal: 'region:East Region',
            info: [
              {
                recipe: 'fill',
                target: 'region:East Region',
                on: 'colonial Nigeria',
              },
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'regional legislatures',
              },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    const travels = made.shots[0].camera.filter((c) => c.move === 'travel');
    expect(travels).toHaveLength(1);
    expect(travels[0].on).toBe('regional legislatures');
    const [x, y, w, h] = (travels[0].target as { box: number[] }).box;
    // The North (100, 50 to 800, 400) and the East together.
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeLessThanOrEqual(50);
    expect(x + w).toBeGreaterThanOrEqual(800);
    expect(y + h).toBeGreaterThanOrEqual(650);
  });

  it('makes a move already on the words of what it would leave out that travel, never two moves at once', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            focal: 'region:East Region',
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'regional legislatures',
              },
            ],
            camera: [
              {
                move: 'push',
                target: 'region:East Region',
                on: 'regional legislatures',
              },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    const camera = made.shots[0].camera;
    expect(camera.filter((c) => c.on === 'regional legislatures')).toEqual([
      expect.objectContaining({ move: 'travel' }),
    ]);
    const [x, y] = (camera[0].target as { box: number[] }).box;
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeLessThanOrEqual(50);
  });

  it('follows a flow from a part that stands still by travelling once to take in its whole way', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            set: {
              kind: 'chart',
              chart: {
                kind: 'timeline',
                spec: {
                  events: [
                    { when: '1951', name: '1951' },
                    { when: '1954', name: '1954' },
                  ],
                },
              },
            },
            focal: 'part:1951',
            info: [
              {
                recipe: 'flow',
                target: 'part:1951',
                to: 'part:1954',
                on: 'colonial Nigeria',
              },
            ],
            camera: [
              { move: 'establish', on: 'After the 1945 strikes' },
              { move: 'follow', target: 'part:1951', on: 'colonial Nigeria' },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    const travels = made.shots[0].camera.filter((c) => c.move === 'travel');
    expect(travels).toHaveLength(1);
    const [x, , w] = (travels[0].target as { box: number[] }).box;
    // 1951 (300 to 400) and 1954 (800 to 900) both in the frame.
    expect(x).toBeLessThanOrEqual(300);
    expect(x + w).toBeGreaterThanOrEqual(900);
  });

  it('keeps what a change makes to the picture when the plan lets it go: a count stays, a cue and a highlight leave', () => {
    const made = buildShots(
      {
        shots: [
          shot({
            set: { kind: 'chart', chart: { kind: 'counter', spec: {} } },
            info: [
              {
                recipe: 'count',
                target: 'part:number',
                value: 3,
                on: 'colonial Nigeria',
                until: 'began shifting',
              },
              {
                recipe: 'mark',
                target: 'part:number',
                on: 'began shifting',
                until: 'regional legislatures',
              },
            ],
          }),
          shot({
            on: 'Then the fight changed',
            info: [
              {
                recipe: 'fill',
                target: 'region:North Region',
                on: 'independence',
                until: 'but three',
              },
            ],
          }),
        ],
      },
      entries,
      ctx,
    );
    expect(made.shots[0].info.map((i) => [i.recipe, i.until])).toEqual([
      ['count', undefined],
      ['mark', 'regional legislatures'],
    ]);
    expect(made.shots[1].info[0].until).toBe('but three');
  });
});

describe('what a chart writes', () => {
  it('writes a source given as a claim’s id as where the claim comes from, or writes none', () => {
    const entries = registryOf([
      ...REGISTRY,
      {
        name: 'claim:c9',
        kind: 'claim',
        about: 'the regions kept their revenues',
        claim: 'c9',
        source: 'Nigeria: a country study',
      },
    ]);
    const counter = (on: string, source: string) => ({
      on,
      set: {
        kind: 'chart' as const,
        chart: { kind: 'counter', spec: { value: 4, source } },
      },
      actors: [],
      info: [],
      life: [],
      camera: [],
      join: 'cut' as const,
    });
    const asked = chartAsset as jest.Mock;
    asked.mockClear();
    buildShots(
      {
        shots: [
          counter('After the 1945 strikes', 'c9'),
          counter('Then the fight changed', 'claim:c99'),
        ],
      },
      entries,
      ctx,
    );
    const specs = asked.mock.calls.map(
      (call: unknown[]) => call[1] as Record<string, unknown>,
    );
    expect(specs[0]).toMatchObject({
      value: 4,
      source: 'Nigeria: a country study',
    });
    expect(specs[1]).not.toHaveProperty('source');
  });

  it('ends a source too long for a chart on a whole word', () => {
    const asked = chartAsset as jest.Mock;
    asked.mockClear();
    const source =
      'Reports by the Resumed Nigeria Constitutional Conference held in London in September and October, 1958';
    buildShots(
      {
        shots: [
          {
            on: 'After the 1945 strikes',
            set: {
              kind: 'chart',
              chart: { kind: 'counter', spec: { value: 4, source } },
            },
            actors: [],
            info: [],
            life: [],
            camera: [],
            join: 'cut',
          },
        ],
      },
      registryOf(REGISTRY),
      ctx,
    );
    const [[, spec]] = asked.mock.calls as [string, { source: string }][];
    expect(spec.source).toBe(
      'Reports by the Resumed Nigeria Constitutional Conference held in London in September and…',
    );
    expect(spec.source.length).toBeLessThanOrEqual(90);
  });
});
