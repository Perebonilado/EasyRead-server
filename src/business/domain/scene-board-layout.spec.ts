/**
 * A continuous build's board as it is seen (E5 fixes): on the water
 * cycle's three scenes, nothing is set on anything, the whole board fills
 * the frame and sits in its middle, and no view the camera takes cuts
 * through a thing.
 */
import { composeWaterBuild } from './__fixtures__/water-cycle-scenes';
import {
  BOARD_ROWS,
  BOARD_ROW_GAP,
  boardOverlaps,
  cellBox,
  slices,
  unsliced,
  type BoardItem,
} from './scene-board';
import { boardExtents } from './scene-compose';
import { measureText } from './scene-font';
import { arrowPath, crosses, pillBox, tieOf } from './scene-labels';
import { STAGINGS } from './scene-layout';
import type { SceneDto } from '../../contracts';

type Rect = { x: number; y: number; w: number; h: number };

let scenes: SceneDto[] = [];
let audits: Awaited<ReturnType<typeof composeWaterBuild>>[number]['audit'][] =
  [];

beforeAll(async () => {
  const made = await composeWaterBuild();
  scenes = made.map((m) => m.scene);
  audits = made.map((m) => m.audit);
}, 60_000);

const STAGING_NAMES = ['box', 'wide'] as const;

/** Every thing, caption and arrow's label on a board at a step, measured afresh from the scene as the player gets it. */
function itemsAt(
  scene: SceneDto,
  staging: (typeof STAGING_NAMES)[number],
  k: number,
): BoardItem[] {
  const { places, pills } = scene.stagings[staging];
  const at = places[k];
  const items: BoardItem[] = [];
  for (const [id, p] of Object.entries(at)) {
    items.push({ owner: id, what: 'thing', box: p });
    const c = p.caption;
    if (c) {
      const w = Math.max(...c.lines.map((l) => measureText(l, c.size, 600)));
      items.push({
        owner: id,
        what: 'caption',
        box: {
          x: c.x + c.w / 2 - w / 2,
          y: c.y,
          w,
          h: c.lines.length * c.size * 1.2,
        },
      });
    }
    for (const label of p.labels ?? [])
      items.push({ owner: id, what: 'label', box: label });
  }
  for (const arrow of scene.steps[k].arrows) {
    const pill = pills?.[k]?.[arrow.id];
    const a = at[arrow.from];
    const b = at[arrow.to];
    if (!pill || !a || !b) continue;
    items.push({
      owner: arrow.id,
      what: 'pill',
      box: pillBox(arrowPath(a, b, false, scene.stagings[staging]), pill),
    });
  }
  return items;
}

describe("the water cycle's board as it is seen", () => {
  it('sets no label, caption or thing on another, at any step, on either staging', () => {
    let pills = 0;
    for (const scene of scenes)
      for (const staging of STAGING_NAMES)
        scene.steps.forEach((_, k) => {
          const items = itemsAt(scene, staging, k);
          pills += items.filter((i) => i.what === 'pill').length;
          expect({ staging, k, clashes: boardOverlaps(items) }).toEqual({
            staging,
            k,
            clashes: [],
          });
          // A label lifted off its arrow is tied to it across nothing else.
          const { places, pills: placed } = scene.stagings[staging];
          for (const arrow of scene.steps[k].arrows) {
            const pill = placed?.[k]?.[arrow.id];
            if (!pill?.lift) continue;
            const path = arrowPath(
              places[k][arrow.from],
              places[k][arrow.to],
              false,
              scene.stagings[staging],
            );
            const tie = tieOf(path, pill);
            const across = items.filter(
              (i) => i.owner !== arrow.id && crosses(tie, i.box),
            );
            expect({ arrow: arrow.id, across }).toEqual({
              arrow: arrow.id,
              across: [],
            });
          }
        });
    // The labels are there to be checked: not all left off.
    expect(pills).toBeGreaterThan(10);
    // And the code's own check on every board step found nothing.
    for (const audit of audits)
      for (const staging of STAGING_NAMES)
        expect(audit[staging].flat()).toEqual([]);
  });

  it('keeps the label "back" clear of the caption "River"', () => {
    const scene = scenes[2];
    const k = scene.steps.findIndex((s) =>
      s.arrows.some((a) => a.id === 'river>sea'),
    );
    expect(k).toBeGreaterThan(0);
    for (const staging of STAGING_NAMES) {
      const items = itemsAt(scene, staging, k);
      const back = items.find((i) => i.owner === 'river>sea')!.box;
      const river = items.find(
        (i) => i.owner === 'river' && i.what === 'caption',
      )!.box;
      expect(back).toBeDefined();
      const apart = Math.max(
        river.x - (back.x + back.w),
        back.x - (river.x + river.w),
        river.y - (back.y + back.h),
        back.y - (river.y + river.h),
      );
      expect(apart).toBeGreaterThanOrEqual(8);
    }
  });

  it('pulls out to the whole board filling at least 70% of the frame top to bottom, centred', () => {
    let wholes = 0;
    for (const scene of scenes)
      for (const staging of STAGING_NAMES) {
        const { views, places, pills, w: W } = scene.stagings[staging];
        views!.forEach((view, k) => {
          const extents = [
            ...boardExtents(
              places[k],
              scene.steps[k].arrows,
              pills?.[k] ?? {},
              scene.stagings[staging],
            ).values(),
          ];
          const y0 = Math.min(...extents.map((b) => b.y));
          const y1 = Math.max(...extents.map((b) => b.y + b.h));
          const x0 = Math.min(...extents.map((b) => b.x));
          const x1 = Math.max(...extents.map((b) => b.x + b.w));
          // The whole board: every thing in the view.
          const all = extents.every(
            (b) =>
              b.x >= view[0] - 1 &&
              b.y >= view[1] - 1 &&
              b.x + b.w <= view[0] + view[2] + 1 &&
              b.y + b.h <= view[1] + view[3] + 1,
          );
          if (!all || scene.steps[k].show.length < 5) return;
          wholes += 1;
          expect((y1 - y0) / view[3]).toBeGreaterThanOrEqual(0.7);
          // In the middle of the frame, both ways.
          expect(
            Math.abs((y0 + y1) / 2 - (view[1] + view[3] / 2)),
          ).toBeLessThanOrEqual(view[3] * 0.02);
          if (view[2] < W - 1)
            expect(
              Math.abs((x0 + x1) / 2 - (view[0] + view[2] / 2)),
            ).toBeLessThanOrEqual(view[2] * 0.02);
        });
      }
    // The recap and the section's end, on both stagings.
    expect(wholes).toBeGreaterThanOrEqual(2);
  });

  it('never takes a view that cuts through a thing', () => {
    for (const scene of scenes)
      for (const staging of STAGING_NAMES) {
        const { views, places, w: W, h: H } = scene.stagings[staging];
        views!.forEach((view, k) => {
          const seen = { x: view[0], y: view[1], w: view[2], h: view[3] };
          // A view the player can take: in the stage, its shape.
          expect(seen.x).toBeGreaterThanOrEqual(0);
          expect(seen.y).toBeGreaterThanOrEqual(0);
          expect(seen.x + seen.w).toBeLessThanOrEqual(W + 0.1);
          expect(seen.y + seen.h).toBeLessThanOrEqual(H + 0.1);
          expect(seen.w / seen.h).toBeCloseTo(W / H, 1);
          for (const [id, extent] of boardExtents(places[k]))
            expect({ k, staging, id, cut: slices(seen, extent) }).toEqual({
              k,
              staging,
              id,
              cut: false,
            });
        });
      }
  });

  it('keeps every carried thing where it was across a join', () => {
    for (let n = 1; n < scenes.length; n += 1)
      for (const staging of STAGING_NAMES) {
        const before = scenes[n - 1].stagings[staging].places;
        const last = before[before.length - 1];
        const first = scenes[n].stagings[staging].places[0];
        for (const id of scenes[n].board!.carried) {
          expect(first[id].x).toBe(last[id].x);
          expect(first[id].y).toBe(last[id].y);
          expect(first[id].w).toBe(last[id].w);
        }
      }
  });
});

describe('the board on a stage', () => {
  const { w: W, h: H, margin } = STAGINGS.wide;

  it('spreads the rows a section uses down the stage, centred, and keeps the room between rows', () => {
    const all = [0, 1, 2].map((r) => cellBox([0, r], W, H, margin));
    const two = [0, 1].map((r) => cellBox([0, r], W, H, margin, [0, 1]));
    // Two rows: taller cells, the room between rows kept, the pair in the middle.
    expect(two[0].h).toBeGreaterThan(all[0].h * 1.3);
    expect(two[1].y - (two[0].y + two[0].h)).toBeCloseTo(BOARD_ROW_GAP, 0);
    expect(all[1].y - (all[0].y + all[0].h)).toBeCloseTo(BOARD_ROW_GAP, 0);
    const mid = (two[0].y + two[1].y + two[1].h) / 2;
    expect(Math.abs(mid - H / 2)).toBeLessThan(1);
    // All rows: the whole content box, top to bottom.
    expect(all[0].y).toBeCloseTo(margin, 0);
    expect(all[BOARD_ROWS - 1].y + all[BOARD_ROWS - 1].h).toBeCloseTo(
      H - margin,
      0,
    );
    // The same rows in the same place however few are in the lower ones.
    expect(cellBox([2, 1], W, H, margin, [1, 2]).y).toBe(
      cellBox([0, 1], W, H, margin, [1, 2]).y,
    );
  });

  it('moves or widens a view as little as it may to cut through nothing', () => {
    const things: Rect[] = [
      { x: 100, y: 100, w: 200, h: 200 },
      { x: 500, y: 100, w: 200, h: 200 },
    ];
    const stage = { w: 1600, h: 900 };
    // Wanted: the first whole and half the second.
    const want = { x: 50, y: 50, w: 560, h: 315 };
    expect(slices(want, things[1])).toBe(true);
    const got = unsliced(want, [things[0]], things, stage)!;
    for (const t of things) expect(slices(got, t)).toBe(false);
    expect(got.x).toBeLessThanOrEqual(things[0].x);
    expect(got.x + got.w).toBeGreaterThanOrEqual(things[0].x + things[0].w);
    // A view that cuts nothing is kept as it is.
    const clear = { x: 0, y: 0, w: 400, h: 225 };
    expect(unsliced(clear, [], [{ x: 20, y: 20, w: 50, h: 50 }], stage)).toBe(
      clear,
    );
  });
});
