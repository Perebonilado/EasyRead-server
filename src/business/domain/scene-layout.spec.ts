import {
  LAYOUT_CAPACITY,
  SCENE_LAYOUTS,
  type SceneLayout,
} from './scene-script';
import { figureFrame } from './scene-figure';
import {
  STAGINGS,
  TALLEST_ADULT,
  captionLines,
  extentOf,
  layoutStep,
  overlaps,
  slotsFor,
  slotsOf,
  standTogether,
  type LaidThing,
  type StagingName,
} from './scene-layout';

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
