/**
 * Everyone on the ground (scene-grounding): the Noah yard, where Shem
 * walks to the half-built ark (the stage's danfo) and was drawn floating
 * against its side, and the rules that keep anyone from hanging there.
 */
import type { SceneDto, ScenePlaceDto } from '../../contracts';
import {
  BEHIND_BACK,
  BODY_HALF,
  STAGINGS,
  floorAt,
  layoutStations,
  pinholeK,
  placeFeature,
  stationScale,
  type LaidThing,
} from './scene-layout';
import { keepGrounded } from './scene-grounding';
import { floorFactor } from './scene-film';
import { stillPlan, stillSvg, type StillCamera } from './scene-still';
import { DEPTH_TIE } from './scene-faces-seen';
import { drawPiece } from './scene-set-pieces';
import { noahScene } from './studio/__fixtures__/noah';

jest.setTimeout(60_000);

const feetOf = (p: { y: number; h: number }) => p.y + p.h;
/** Shem walks to the ark, beside it on the side he comes from. */
const walked = () =>
  noahScene([
    {
      atMs: 3800,
      at: { noah: '@0.45', shem: 'by:ark:-1' },
      depth: { noah: 0.62 },
    },
  ]);

describe('the Noah yard, Shem at the ark', () => {
  const scene = walked();
  const ark = scene.setting!.features![0];
  const [first, at] = scene.stagings.wide.places;

  it('stands Shem on the ground the ark stands on, beside it, clear of its body', () => {
    // On its ground line: his feet where its wheels are, not up at its
    // door's sill (its way), where one goes in.
    expect(feetOf(at.shem)).toBeCloseTo(ark.feet!.wide, 1);
    expect(ark.way.wide.y).toBeLessThan(ark.feet!.wide - 10);
    // As big as the floor makes anyone there.
    const eye = 496;
    const inFront = feetOf(first.noah);
    const k = (feet: number) => pinholeK(feet, 844, eye);
    expect(at.shem.h / first.shem.h).toBeCloseTo(
      k(feetOf(at.shem)) / k(feetOf(first.shem)),
      2,
    );
    expect(inFront).toBeGreaterThan(feetOf(at.shem));
    // Beside it: his body clear of its box.
    const box = ark.at.wide;
    const middle = at.shem.x + at.shem.w / 2;
    const half = at.shem.w * BODY_HALF;
    expect(
      Math.min(middle + half, box.x + box.w) - Math.max(middle - half, box.x),
    ).toBeLessThanOrEqual(at.shem.w * 0.08);
  });

  it('has no one off the floor at any step or along the walk, at any pan of the camera', () => {
    const floor =
      scene.things[0].kind === 'drawing' ? scene.things[0].floor! : null;
    const arkFeet = ark.feet!.wide;
    const onGround = (feet: number, d: number | undefined) =>
      Math.abs(feet - arkFeet) < 1 ||
      (d !== undefined &&
        Math.abs(feet - floorAt(d, 844, 496, STAGINGS.wide.h - 12).feet) < 1);
    const samples: Record<string, ScenePlaceDto>[] = [first, at];
    // Along the walk, the floor's own size for where the feet are.
    for (const p of [0.25, 0.5, 0.75]) {
      const mid = { ...first.shem };
      for (const key of ['x', 'y', 'w', 'h'] as const)
        mid[key] = first.shem[key] + (at.shem[key] - first.shem[key]) * p;
      const k0 = pinholeK(feetOf(first.shem), 844, 496);
      const km = pinholeK(feetOf(mid), 844, 496);
      expect(mid.h / km).toBeCloseTo(first.shem.h / k0, 0);
      samples.push({ ...first, shem: mid });
    }
    for (const places of [first, at])
      for (const id of ['noah', 'shem'])
        expect(onGround(feetOf(places[id]), places[id].d)).toBe(true);
    // In the picture, at pans left and right and pushed in: Shem's feet
    // and the ark's wheels on one line, moved alike by the camera.
    const cameras: StillCamera[] = [-300, 0, 150, 400].flatMap((px) =>
      [1, 1.3].map((s) => ({
        s,
        cx: 800,
        cy: 450,
        px,
        span: [400, 400] as [number, number],
      })),
    );
    for (const camera of cameras) {
      const plan = stillPlan(scene, 6000, 960, { camera });
      const shem = plan.parts.find((p) => p.key === 'thing:shem')!;
      const drawn = plan.parts.find((p) => p.key === 'feature:ark')!;
      const wheels =
        drawn.box.y + (arkFeet - ark.at.wide.y) * (drawn.box.h / ark.at.wide.h);
      expect(shem.box.y + shem.box.h).toBeCloseTo(wheels, 4);
      expect(shem.depth).toBeCloseTo(floorFactor(arkFeet, floor), 6);
      expect(drawn.depth).toBeCloseTo(shem.depth, 6);
    }
  });

  it('draws Shem before the ark he stands beside, and someone farther off behind it', () => {
    const plan = stillPlan(scene, 6000, 960);
    const keys = plan.parts.map((p) => p.key);
    expect(keys.indexOf('feature:ark')).toBeLessThan(
      keys.indexOf('thing:shem'),
    );
    // Stood a step back of the ark's feet: behind it, under it in the picture.
    const back = JSON.parse(JSON.stringify(scene)) as SceneDto;
    const shem = back.stagings.wide.places[1].shem;
    shem.y -= 900 * DEPTH_TIE * 2;
    const behind = stillPlan(back, 6000, 960).parts.map((p) => p.key);
    expect(behind.indexOf('thing:shem')).toBeLessThan(
      behind.indexOf('feature:ark'),
    );
    // And Noah, before them both, last.
    expect(keys.indexOf('thing:noah')).toBeGreaterThan(
      keys.indexOf('thing:shem'),
    );
    expect(keys.indexOf('thing:noah')).toBeGreaterThan(
      keys.indexOf('feature:ark'),
    );
  });

  it('lays each one on the foot of their box in a still, whatever its shape', () => {
    const plan = stillPlan(scene, 6000, 960);
    const pngs = new Map(plan.parts.map((p) => [p.key, Buffer.from('x')]));
    const svg = stillSvg(plan, pngs);
    const things = plan.parts.filter((p) => p.kind === 'thing').length;
    expect(svg.match(/preserveAspectRatio="xMidYMax meet"/g)).toHaveLength(
      things,
    );
  });
});

describe('a station at a feature', () => {
  const people = new Map<string, LaidThing>([
    [
      'tobi',
      {
        kind: 'drawing',
        aspect: 160 / 208,
        caption: null,
        stands: { units: 208 },
      },
    ],
  ]);
  const scale = stationScale([...people.values()], 1, 'wide');
  const danfo = placeFeature({
    staging: 'wide',
    spot: 'right',
    piece: drawPiece('vehicle', 'the danfo'),
    back: true,
    unit: scale.unit!,
    floor: scale.floor,
    horizon: 496,
  });
  const across = (solid: boolean) =>
    new Map([
      [
        'danfo',
        {
          x: danfo.x + danfo.w / 2,
          w: danfo.w,
          way: {
            y: danfo.way.y,
            k: danfo.way.k,
            perch: danfo.up.perch,
            upX: danfo.up.x,
            ground: danfo.feet,
          },
          ...(solid ? { solid: true } : {}),
        },
      ],
    ]);
  const stand = (station: string) =>
    layoutStations({
      steps: [{ show: ['tobi'], at: { tobi: station } }],
      things: people,
      staging: 'wide',
      scale,
      floor: { eye: 496, bottom: 888 },
      features: across(true),
    })[0].tobi;

  it('stands one by a danfo on its ground, not up at its door sill, as big as the floor makes them there', () => {
    const tobi = stand('by:danfo:-1');
    expect(feetOf(tobi)).toBeCloseTo(danfo.feet, 1);
    const alone = stand('centre');
    expect(tobi.h / alone.h).toBeCloseTo(
      pinholeK(danfo.feet, scale.floor, 496) /
        pinholeK(feetOf(alone), scale.floor, 496),
      2,
    );
  });

  it('stands one behind it a step back of its ground, and one under it on it', () => {
    expect(feetOf(stand('behind:danfo'))).toBeCloseTo(
      danfo.feet - STAGINGS.wide.h * BEHIND_BACK,
      1,
    );
    expect(feetOf(stand('under:danfo'))).toBeCloseTo(danfo.feet, 1);
  });
});

describe('the ground check', () => {
  it('stands anyone found hanging on the surface they belong to, at its size, and says so', () => {
    const floor = { floor: 844, eye: 496, bottom: 888 };
    const onFloor = floorAt(0.55, floor.floor, floor.eye, floor.bottom);
    // The old yard's hand-made place: at d 0.55, feet 45 units up.
    const places = [
      {
        shem: { x: 1180, y: 430, w: 150, h: 350, d: 0.55 },
        ark: { x: 900, y: 500, w: 400, h: 200 },
      },
    ];
    const notes = keepGrounded({
      staging: 'wide',
      H: 900,
      steps: [{ show: ['shem', 'ark'] }],
      places,
      stations: [{ shem: '@0.7' }],
      stands: (id) => id === 'shem',
      features: new Map(),
      floor,
      name: (id) => id,
    });
    expect(feetOf(places[0].shem)).toBeCloseTo(onFloor.feet, 1);
    expect(places[0].shem.h).toBeGreaterThan(350);
    // Not a person: left where it is.
    expect(places[0].ark).toEqual({ x: 900, y: 500, w: 400, h: 200 });
    expect(notes).toEqual([
      expect.stringMatching(/^staging: floating shem at step 1/),
    ]);
  });

  it('steps one standing over the solid body they are beside to its side', () => {
    const places = [{ tobi: { x: 1000, y: 400, w: 160, h: 300, d: 0 } }];
    const notes = keepGrounded({
      staging: 'wide',
      H: 900,
      steps: [{ show: ['tobi'] }],
      places,
      stations: [{ tobi: 'by:danfo:1' }],
      stands: () => true,
      features: new Map([
        ['danfo', { ground: 700, x: 900, w: 500, solid: true }],
      ]),
      floor: { floor: 844, eye: 496, bottom: 888 },
      name: (id) => id,
    });
    const tobi = places[0].tobi;
    expect(tobi.x + tobi.w / 2 - tobi.w * BODY_HALF).toBeGreaterThanOrEqual(
      1400 - tobi.w * 0.08,
    );
    expect(feetOf(tobi)).toBe(700);
    expect(notes.join(' ')).toMatch(/stepped to its side/);
  });

  it('leaves alone everyone who stands where they should', () => {
    const scene = walked();
    const before = JSON.stringify(scene.stagings.wide.places);
    const notes = keepGrounded({
      staging: 'wide',
      H: 900,
      steps: scene.steps.map((s) => ({ show: s.show })),
      places: scene.stagings.wide.places,
      stations: [
        { noah: '@0.45', shem: '@0.2' },
        { noah: '@0.45', shem: 'by:ark:-1' },
      ],
      stands: (id) => id === 'noah' || id === 'shem',
      features: new Map([
        [
          'ark',
          {
            ground: scene.setting!.features![0].feet!.wide,
            x: scene.setting!.features![0].at.wide.x,
            w: scene.setting!.features![0].at.wide.w,
            solid: true,
          },
        ],
      ]),
      floor: { floor: 844, eye: 496, bottom: 888 },
      name: (id) => id,
    });
    expect(notes).toEqual([]);
    expect(JSON.stringify(scene.stagings.wide.places)).toBe(before);
  });
});
