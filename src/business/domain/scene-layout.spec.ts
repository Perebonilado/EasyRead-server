import {
  LAYOUT_CAPACITY,
  SCENE_LAYOUTS,
  type SceneLayout,
} from './scene-script';
import {
  STAGINGS,
  captionLines,
  extentOf,
  layoutStep,
  overlaps,
  slotsFor,
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
            const extents = show.map((id) => extentOf(places[id]));
            for (let i = 0; i < n; i += 1) {
              const e = extents[i];
              expect(e.x).toBeGreaterThanOrEqual(slots[i].x - 1);
              expect(e.x + e.w).toBeLessThanOrEqual(
                slots[i].x + slots[i].w + 1,
              );
              expect(e.y).toBeGreaterThanOrEqual(slots[i].y - 1);
              expect(e.y + e.h).toBeLessThanOrEqual(
                slots[i].y + slots[i].h + 1,
              );
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
