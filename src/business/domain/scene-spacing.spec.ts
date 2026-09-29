/**
 * How far apart people stand (scene-spacing): never in each other's
 * bodies, two talking at a social distance, one gone over to another
 * beside them, a thing handed over within reach; and the check that says
 * so of a made scene.
 */
import type { SceneDto } from '../../contracts';
import {
  STAGINGS,
  layoutStations,
  stationScale,
  type LaidThing,
} from './scene-layout';
import {
  KIT_PER_METRE,
  NEAR_M,
  apartM,
  spaceOut,
  spacingFaults,
  type Spaced,
} from './scene-spacing';

/** Two grown-ups on the wide stage at one scale, a metre about 266 pixels. */
const PER_M = 2.357 * KIT_PER_METRE;
const person = (id: string, x: number, more: Partial<Spaced> = {}): Spaced => ({
  id,
  x,
  half: 377 * 0.28,
  d: 0.5,
  perM: PER_M,
  free: true,
  ...more,
});
const bounds = { least: 100, most: 1500 };

describe('spacing people out, as people stand', () => {
  it('steps two apart whose bodies meet, the one who came back the way they came', () => {
    const at = spaceOut(
      [person('dee', 800), person('tessa', 820, { was: 1200 })],
      [],
      bounds,
    );
    const dee = at.get('dee')!;
    const tessa = at.get('tessa')!;
    // Clear of each other: their bodies no nearer than touching.
    expect(tessa - dee).toBeGreaterThanOrEqual(2 * 377 * 0.28);
    // Tessa came from the right, and keeps to it; Dee stays put.
    expect(tessa).toBeGreaterThan(dee);
    expect(dee).toBe(800);
  });

  it('brings two talking far apart to a social distance, each halfway', () => {
    const at = spaceOut(
      [person('dee', 400), person('tessa', 1200)],
      [{ a: 'dee', b: 'tessa', why: 'talk' }],
      bounds,
    );
    const metres = (at.get('tessa')! - at.get('dee')!) / PER_M;
    expect(metres).toBeGreaterThanOrEqual(NEAR_M.talk.least);
    expect(metres).toBeLessThanOrEqual(NEAR_M.talk.most);
    // Both came: the middle of them is where it was.
    expect((at.get('dee')! + at.get('tessa')!) / 2).toBeCloseTo(800, 0);
  });

  it("steps two apart who talk in each other's faces", () => {
    const at = spaceOut(
      [person('dee', 780), person('gus', 1000)],
      [{ a: 'dee', b: 'gus', why: 'talk' }],
      bounds,
    );
    expect((at.get('gus')! - at.get('dee')!) / PER_M).toBeGreaterThanOrEqual(
      NEAR_M.talk.least - 0.01,
    );
  });

  it('never moves one a feature holds: the other comes to them, near enough to hand a thing over', () => {
    const at = spaceOut(
      [person('gus', 1300, { free: false }), person('dee', 300)],
      [{ a: 'gus', b: 'dee', why: 'reach' }],
      bounds,
    );
    expect(at.get('gus')).toBe(1300);
    expect((1300 - at.get('dee')!) / PER_M).toBeLessThanOrEqual(
      NEAR_M.reach.most,
    );
  });

  it('keeps two talking across rows beside each other, never one behind the other', () => {
    const at = spaceOut(
      [person('dee', 400, { d: 0.85 }), person('gus', 1300, { d: 0.3 })],
      [{ a: 'dee', b: 'gus', why: 'talk' }],
      bounds,
    );
    const across = Math.abs(at.get('gus')! - at.get('dee')!) / PER_M;
    expect(across).toBeGreaterThanOrEqual(NEAR_M.talk.least * 0.8 - 0.01);
    expect(
      apartM(
        { x: at.get('dee')!, d: 0.85, perM: PER_M },
        { x: at.get('gus')!, d: 0.3, perM: PER_M },
      ),
    ).toBeLessThanOrEqual(NEAR_M.talk.most + 0.8);
  });

  it('lets two who hug come close', () => {
    const at = spaceOut(
      [person('a', 500), person('b', 1100)],
      [{ a: 'a', b: 'b', why: 'touch' }],
      bounds,
    );
    expect((at.get('b')! - at.get('a')!) / PER_M).toBeLessThanOrEqual(
      NEAR_M.touch.most,
    );
  });
});

describe("a Studio scene's stations, spaced", () => {
  const grown: LaidThing = {
    kind: 'drawing',
    aspect: 160 / 234,
    caption: null,
    stands: { units: 234 },
  };
  const things = new Map<string, LaidThing>([
    ['dee', grown],
    ['tessa', grown],
    ['gus', grown],
  ]);
  const middle = (p: { x: number; w: number }) => p.x + p.w / 2;

  it('stands two talking from the far spots at a social distance, and two on one point apart', () => {
    const scale = stationScale([...things.values()], 2, 'wide');
    const perM = scale.unit! * KIT_PER_METRE;
    const [talking, crowded] = layoutStations({
      steps: [
        { show: ['dee', 'tessa'], at: { dee: 'left', tessa: 'right' } },
        { show: ['dee', 'tessa'], at: { dee: '@0.5', tessa: '@0.52' } },
      ],
      things,
      staging: 'wide',
      scale,
      features: new Map(),
      floor: { eye: 560, bottom: STAGINGS.wide.h - 12 },
      near: [[{ a: 'dee', b: 'tessa', why: 'talk' }], []],
    });
    const apart = (s: typeof talking) =>
      Math.abs(middle(s.tessa) - middle(s.dee)) / perM;
    expect(apart(talking)).toBeGreaterThanOrEqual(NEAR_M.talk.least);
    expect(apart(talking)).toBeLessThanOrEqual(NEAR_M.talk.most);
    // On one point, they stand apart, not in one body.
    expect(
      Math.abs(middle(crowded.tessa) - middle(crowded.dee)),
    ).toBeGreaterThan(crowded.dee.w * 0.56);
  });
});

describe('the spacing check on a made scene', () => {
  const place = (x: number, d = 0.5) => ({
    x: x - 188,
    y: 300,
    w: 377,
    h: 552,
    d,
  });
  const made = (
    places: Record<string, ReturnType<typeof place>>,
    moves: [number, string, number, string?][] = [],
  ): SceneDto =>
    ({
      durationMs: 6000,
      things: ['dee', 'tessa'].map((id) => ({
        id,
        kind: 'drawing',
        rig: true,
      })),
      steps: [{ atMs: 0, show: ['dee', 'tessa'] }],
      effects: [{ atMs: 500, target: 'dee', do: 'say' }],
      acting: {
        dee: { look: [[0, 'tessa', 0.5]], moves },
        tessa: { look: [[0, 'dee', 0.5]] },
      },
      stagings: { wide: { w: 1600, h: 900, places: [places] } },
    }) as unknown as SceneDto;

  it('reports bodies that meet, and two talking too far apart', () => {
    expect(spacingFaults(made({ dee: place(700), tessa: place(760) }))).toEqual(
      [expect.objectContaining({ kind: 'overlap', a: 'dee', b: 'tessa' })],
    );
    expect(
      spacingFaults(made({ dee: place(300), tessa: place(1400) }))[0],
    ).toMatchObject({ kind: 'too-far', why: 'talk' });
    // At a social distance, nothing.
    expect(spacingFaults(made({ dee: place(640), tessa: place(960) }))).toEqual(
      [],
    );
    // A hug is bodies meeting on purpose.
    expect(
      spacingFaults(
        made({ dee: place(700), tessa: place(760) }, [
          [100, 'hug', 2000, 'tessa'],
        ]),
      ),
    ).toEqual([]);
  });
});
