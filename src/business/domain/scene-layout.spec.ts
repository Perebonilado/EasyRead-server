import {
  LAYOUT_CAPACITY,
  SCENE_LAYOUTS,
  type SceneLayout,
} from './scene-script';
import { figureFrame } from './scene-figure';
import {
  BACK_DEPTH,
  STAGINGS,
  TALLEST_ADULT,
  captionLines,
  extentOf,
  layoutStations,
  layoutStep,
  overlaps,
  placeFeature,
  slotsFor,
  slotsOf,
  stationScale,
  standTogether,
  type LaidThing,
  type StagingName,
} from './scene-layout';
import { drawPiece } from './scene-set-pieces';

const things = new Map<string, LaidThing>([
  ['a', { kind: 'drawing', aspect: 1.6, caption: 'Kidney' }],
  [
    'b',
    {
      kind: 'drawing',
      aspect: 0.6,
      caption: 'A very long caption about the renal pelvis and its calyces',
    },
  ],
  [
    'c',
    { kind: 'stat', value: '1.5 million', caption: 'nephrons in each kidney' },
  ],
  ['d', { kind: 'words', text: 'filtration', style: 'keyword' }],
  ['e', { kind: 'words', text: 'Blood in, urine out', style: 'title' }],
  ['f', { kind: 'drawing', aspect: 1, caption: 'Bladder' }],
]);
const ids = [...things.keys()];

describe('the stage layout', () => {
  for (const staging of Object.keys(STAGINGS) as StagingName[]) {
    for (const layout of SCENE_LAYOUTS as readonly SceneLayout[]) {
      const { min, max } = LAYOUT_CAPACITY[layout];
      for (let n = min; n <= max; n += 1) {
        it(`${layout} with ${n} in the ${staging} staging: inside the stage, nothing over anything`, () => {
          const slots = slotsFor(layout, n, staging);
          expect(slots).toHaveLength(n);
          const { w, h } = STAGINGS[staging];
          for (let i = 0; i < n; i += 1) {
            const s = slots[i];
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.x + s.w).toBeLessThanOrEqual(w);
            expect(s.y + s.h).toBeLessThanOrEqual(h);
            for (let j = i + 1; j < n; j += 1)
              expect(overlaps(s, slots[j])).toBe(false);
          }
          // Every mix of things, placed, stays inside its own slot.
          for (let shift = 0; shift < ids.length; shift += 1) {
            const show = Array.from(
              { length: n },
              (_, i) => ids[(i + shift) % ids.length],
            );
            const places = layoutStep(layout, show, things, staging);
            const own = slotsOf(layout, show, things, staging);
            const extents = show.map((id) => extentOf(places[id]));
            for (let i = 0; i < n; i += 1) {
              const e = extents[i];
              expect(e.x).toBeGreaterThanOrEqual(own[i].x - 1);
              expect(e.x + e.w).toBeLessThanOrEqual(own[i].x + own[i].w + 1);
              expect(e.y).toBeGreaterThanOrEqual(own[i].y - 1);
              expect(e.y + e.h).toBeLessThanOrEqual(own[i].y + own[i].h + 1);
              for (let j = i + 1; j < n; j += 1)
                expect(overlaps(e, extents[j])).toBe(false);
            }
          }
        });
      }
    }
  }

  it('breaks a long caption into two lines and cuts what still does not fit', () => {
    const fit = captionLines(
      'A very long caption about the renal pelvis and its calyces',
      300,
      38,
    );
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.lines[1].endsWith('…')).toBe(true);
    expect(captionLines('Kidney', 300, 38)).toEqual({
      lines: ['Kidney'],
      size: 38,
    });
  });

  it('keeps a drawing at its own proportions', () => {
    const places = layoutStep('one', ['a'], things, 'wide');
    expect(places.a.w / places.a.h).toBeCloseTo(1.6, 1);
  });
});

describe('people standing together', () => {
  // A grown-up's frame and a child's, as the kit frames them.
  const adult = figureFrame('adult');
  const child = figureFrame('child');
  const person = (frame: number[]): LaidThing => ({
    kind: 'drawing',
    aspect: frame[2] / frame[3],
    caption: null,
    stands: { units: frame[3] },
  });
  const people = new Map<string, LaidThing>([
    ['mum', person(adult)],
    ['kid', person(child)],
    ['gran', person(adult)],
    ['lamp', { kind: 'drawing', aspect: 0.5, caption: 'The lantern' }],
  ]);
  const scaleOf = (at: { h: number }, frame: number[]) => at.h / frame[3];

  it('draws everyone in a line at one scale, a child shorter than a grown-up', () => {
    for (const staging of Object.keys(STAGINGS) as StagingName[]) {
      const places = layoutStep('row', ['mum', 'kid'], people, staging);
      standTogether(places, people, ['mum', 'kid'], staging, false);
      expect(scaleOf(places.mum, adult)).toBeCloseTo(
        scaleOf(places.kid, child),
        3,
      );
      expect(places.kid.h).toBeLessThan(places.mum.h);
      // Their feet on one floor.
      expect(places.kid.y + places.kid.h).toBeCloseTo(
        places.mum.y + places.mum.h,
        1,
      );
    }
  });

  it('never stands a grown-up taller than seven tenths of the stage', () => {
    for (const staging of Object.keys(STAGINGS) as StagingName[]) {
      const places = layoutStep('one', ['mum'], people, staging);
      standTogether(places, people, ['mum'], staging, false);
      const { h, margin } = STAGINGS[staging];
      expect(places.mum.h).toBeLessThanOrEqual(
        (h - margin * 2) * TALLEST_ADULT + 0.1,
      );
      // On the floor of its slot, in the middle of it.
      expect(places.mum.y + places.mum.h).toBeCloseTo(h - margin, 0);
    }
  });

  it('sets a floating line down on the floor in front of a set, everything in it', () => {
    const show = ['mum', 'lamp', 'gran'];
    const floating = layoutStep('row', show, people, 'wide');
    standTogether(floating, people, show, 'wide', false);
    const grounded = layoutStep('row', show, people, 'wide');
    standTogether(grounded, people, show, 'wide', true);
    const { h, margin } = STAGINGS.wide;
    const floor = h - margin;
    expect(floating.mum.y + floating.mum.h).toBeLessThan(floor - 20);
    const drop = grounded.mum.y - floating.mum.y;
    expect(grounded.mum.y + grounded.mum.h).toBeCloseTo(floor, 0);
    // What stands with them comes down with them, caption and all.
    expect(grounded.lamp.y - floating.lamp.y).toBeCloseTo(drop, 1);
    expect(grounded.lamp.caption!.y - floating.lamp.caption!.y).toBeCloseTo(
      drop,
      1,
    );
    expect(grounded.lamp.room!.y - floating.lamp.room!.y).toBeCloseTo(drop, 1);
  });

  it('leaves alone a stage with no one standing on it', () => {
    const show = ['lamp'];
    const before = layoutStep('one', show, people, 'box');
    const after = layoutStep('one', show, people, 'box');
    standTogether(after, people, show, 'box', true);
    expect(after).toEqual(before);
  });
});

describe("a Studio scene's stations", () => {
  const kid: LaidThing = {
    kind: 'drawing',
    aspect: 160 / 190,
    caption: null,
    stands: { units: 190 },
  };
  const grown: LaidThing = {
    kind: 'drawing',
    aspect: 160 / 234,
    caption: null,
    stands: { units: 234 },
  };
  const people = new Map<string, LaidThing>([
    ['maya', kid],
    [
      'pip',
      { kind: 'drawing', aspect: 1.1, caption: null, stands: { units: 110 } },
    ],
    ['mama', grown],
  ]);
  const middle = (p: { x: number; w: number }) => p.x + p.w / 2;

  for (const staging of ['box', 'wide'] as StagingName[])
    it(`keeps each one where they stand until their station changes, at one scale (${staging})`, () => {
      const scale = stationScale([...people.values()], 3, staging);
      const gate = { x: STAGINGS[staging].w * 0.88, w: 180 };
      const steps = layoutStations({
        steps: [
          {
            show: ['maya', 'pip', 'mama'],
            at: { maya: 'left', pip: 'centre', mama: 'right' },
          },
          // Pip runs to the gate: beside it, the side he comes from.
          {
            show: ['maya', 'pip', 'mama'],
            at: { maya: 'left', pip: 'by:gate:-1', mama: 'right' },
          },
          // He goes; no one else moves.
          { show: ['maya', 'mama'], at: { maya: 'left', mama: 'right' } },
          // Mama comes over beside the gate where no one stands now.
          { show: ['maya', 'mama'], at: { maya: 'left', mama: 'by:gate:-1' } },
        ],
        things: people,
        staging,
        scale,
        features: new Map([['gate', gate]]),
      });
      expect(steps[1].maya).toEqual(steps[0].maya);
      expect(steps[2].maya).toEqual(steps[1].maya);
      expect(steps[2].mama).toEqual(steps[1].mama);
      expect(steps[1].mama).toEqual(steps[0].mama);
      // Beside the gate, on its left, not on it.
      const pip = steps[1].pip;
      expect(middle(pip)).toBeLessThan(gate.x - gate.w / 2);
      expect(middle(pip)).toBeGreaterThan(middle(steps[0].pip));
      // Everyone at one scale, feet on one ground, all the scene through.
      const feet = (p: { y: number; h: number }) => p.y + p.h;
      expect(feet(steps[0].maya)).toBe(feet(steps[0].mama));
      expect(steps[0].mama.h / 234).toBeCloseTo(steps[0].maya.h / 190, 2);
      expect(steps[3].mama.h).toBe(steps[0].mama.h);
      // No one stands off the stage.
      for (const step of steps)
        for (const p of Object.values(step)) {
          expect(middle(p)).toBeGreaterThan(0);
          expect(middle(p)).toBeLessThan(STAGINGS[staging].w);
        }
    });

  it('takes the other side of a feature where someone already stands on the near one', () => {
    const scale = stationScale([...people.values()], 3, 'wide');
    const bench = { x: 800, w: 220 };
    const [step] = layoutStations({
      steps: [
        {
          show: ['maya', 'mama'],
          at: { maya: 'centre-left', mama: 'by:bench:-1' },
        },
      ],
      things: people,
      staging: 'wide',
      scale,
      features: new Map([['bench', bench]]),
    });
    // Maya stands where the bench's left side would put Mama: Mama goes round.
    expect(middle(step.mama)).toBeGreaterThan(bench.x + bench.w / 2);
  });

  it('draws a gate and a goalpost as they are beside the people: wider than high, a gate lower than a grown-up', () => {
    const [, , gw, gh] = drawPiece('gate').viewBox;
    expect(gw / gh).toBeGreaterThan(1.1);
    expect(gh).toBeLessThan(-figureFrame('adult')[1] * 0.9);
    const [, , pw, ph] = drawPiece('goalpost').viewBox;
    expect(pw / ph).toBeGreaterThan(1.5);
  });

  it('stands a piece the stage draws among the people at their scale, or farther off at the back', () => {
    const piece = drawPiece('gate');
    const front = placeFeature({
      staging: 'wide',
      spot: 'right',
      piece,
      back: false,
      unit: 2,
      floor: 844,
      horizon: 576,
    });
    expect(front.y + front.h).toBeGreaterThan(844);
    expect(front.w).toBeCloseTo(piece.viewBox[2] * 2, 0);
    expect(front.way).toMatchObject({ y: 844, k: 1 });
    const back = placeFeature({
      staging: 'wide',
      spot: 'back',
      piece,
      back: true,
      unit: 2,
      floor: 844,
      horizon: 576,
    });
    expect(back.w).toBeCloseTo(front.w * BACK_DEPTH, 0);
    expect(back.way.y).toBeLessThan(front.way.y);
    expect(back.way.k).toBeCloseTo(BACK_DEPTH, 2);
    // Where the painter drew it, as large as it was drawn.
    const painted = placeFeature({
      staging: 'wide',
      spot: 'left',
      piece,
      painted: { x: 100, y: 500, w: 150, h: 180 },
      back: false,
      unit: 2,
      floor: 844,
      horizon: 576,
    });
    expect(painted.way.y).toBe(680);
    expect(middle(painted)).toBeCloseTo(175, 0);
  });
});
