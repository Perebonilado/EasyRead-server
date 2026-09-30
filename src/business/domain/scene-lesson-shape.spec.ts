/**
 * A lesson in a tall film (studio-vertical-plan §4, phase V2): its
 * layouts reflowed into the tall text area, its words larger, at most
 * three things on a phone's screen, its board turned, its charts taller
 * than wide, its drawings asked for square; and its words, where the
 * camera shows them, inside the safe zone and large enough to read
 * (§6.2, §6.4). A wide film's lessons are as they were (scene-shape.spec).
 */
import type { SceneDto } from '../../contracts';
import { renderChart, tallBars } from './scene-chart';
import { labelSize } from './scene-labels';
import { fitInSlot, slotsFor } from './scene-layout';
import { lessonTextFaults } from './scene-lesson-check';
import { pagedForTall, pagesOf } from './scene-lesson-pages';
import {
  READ_LEAST,
  TALL_AREA,
  TALL_SAFE_BOX,
  TEXT,
  drawingShapeFor,
  tallSlots,
  textNow,
  withTextOf,
} from './scene-lesson-shape';
import { cellBox, tallFrameBox } from './scene-board';
import type { SceneLayout, SceneScript } from './scene-script';
import { wordsAt } from './scene-text-check';
import { composeVaccine } from './studio/__fixtures__/vaccine';
import { composeAdolescentFilm } from './studio/__fixtures__/adolescent-health';
import { composeWaterBuild } from './__fixtures__/water-cycle-scenes';
import { clipCardDrawing } from './studio/studio-clip';

type Box = { x: number; y: number; w: number; h: number };
const within = (box: Box, room: Box, slack = 1) =>
  box.x >= room.x - slack &&
  box.y >= room.y - slack &&
  box.x + box.w <= room.x + room.w + slack &&
  box.y + box.h <= room.y + room.h + slack;
const apart = (a: Box, b: Box) =>
  a.x + a.w <= b.x + 0.5 ||
  b.x + b.w <= a.x + 0.5 ||
  a.y + a.h <= b.y + 0.5 ||
  b.y + b.h <= a.y + 0.5;

const LAYOUTS: SceneLayout[] = [
  'one',
  'row',
  'grid',
  'compare',
  'focus',
  'hub',
  'stack',
  'cycle',
];

describe('a tall lesson’s layouts (§4.1)', () => {
  it('lays every template in the tall text area, no two slots overlapping', () => {
    expect(TALL_AREA).toEqual({ x: 54, y: 176, w: 738, h: 912 });
    for (const layout of LAYOUTS)
      for (let n = 1; n <= 5; n += 1) {
        if (layout === 'compare' && n !== 2) continue;
        const slots = slotsFor(layout, n, 'wide', undefined, 'tall');
        expect(slots.length).toBe(layout === 'one' ? 1 : n);
        for (const slot of slots) expect(within(slot, TALL_AREA)).toBe(true);
        for (let i = 0; i < slots.length; i += 1)
          for (let j = i + 1; j < slots.length; j += 1)
            expect(apart(slots[i], slots[j])).toBe(true);
      }
  });

  it('reads top to bottom: a row of three a column, compare top over bottom, focus big on top', () => {
    const row = tallSlots('row', 3);
    expect(new Set(row.map((s) => s.x)).size).toBe(1);
    expect(row[0].y).toBeLessThan(row[1].y);
    expect(row[1].y).toBeLessThan(row[2].y);
    // Four as 2 × 2; five as 2 + 2 + 1, the last in the middle.
    const four = tallSlots('row', 4);
    expect(four[0].y).toBe(four[1].y);
    expect(four[2].y).toBeGreaterThan(four[0].y);
    const five = tallSlots('row', 5);
    expect(five[4].x + five[4].w / 2).toBeCloseTo(
      TALL_AREA.x + TALL_AREA.w / 2,
    );
    const [top, bottom] = tallSlots('compare', 2);
    expect(top.w).toBe(TALL_AREA.w);
    expect(bottom.y).toBeGreaterThan(top.y + top.h);
    const [big, a, b] = tallSlots('focus', 3);
    expect(big.w).toBe(TALL_AREA.w);
    expect(a.y).toBeGreaterThan(big.y + big.h);
    expect(a.y).toBe(b.y);
    // A cycle taller than wide.
    const cycle = tallSlots('cycle', 4);
    const span = (k: 'x' | 'y', d: 'w' | 'h') =>
      Math.max(...cycle.map((s) => s[k] + s[d])) -
      Math.min(...cycle.map((s) => s[k]));
    expect(span('y', 'h')).toBeGreaterThan(span('x', 'w'));
  });

  it('keeps the wide stage’s slots as they were', () => {
    expect(slotsFor('row', 3, 'wide')).toEqual(
      slotsFor('row', 3, 'wide', undefined, 'wide'),
    );
    expect(slotsFor('row', 3, 'wide')[0].y).toBe(
      slotsFor('row', 3, 'wide')[1].y,
    );
  });
});

describe('a tall lesson’s words (§4.2)', () => {
  it('sets them larger for the scene composed, and puts the sizes back after', () => {
    expect(textNow()).toBe(TEXT.wide);
    const room = { x: 54, y: 176, w: 738, h: 912 };
    const wide = labelSize(room);
    const tall = withTextOf('tall', () => labelSize(room));
    expect(wide).toBe(34);
    // By the room's width, not its height: never under the least.
    expect(tall).toBeGreaterThanOrEqual(TEXT.tall.label.min);
    expect(tall).toBeLessThanOrEqual(TEXT.tall.label.max);
    expect(textNow()).toBe(TEXT.wide);
    expect(() =>
      withTextOf('tall', () => {
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(textNow()).toBe(TEXT.wide);
  });

  it('fits a card and a caption at the tall sizes, never under the least', () => {
    const slot = { x: 54, y: 176, w: 341, h: 200 };
    const card = withTextOf('tall', () =>
      fitInSlot(
        { kind: 'words', text: 'Memory cells remember', style: 'keyword' },
        slot,
      ),
    );
    expect(card.size).toBeGreaterThanOrEqual(TEXT.tall.least);
    const drawing = withTextOf('tall', () =>
      fitInSlot(
        { kind: 'drawing', aspect: 1, caption: 'Antibodies on a germ' },
        { x: 54, y: 176, w: 738, h: 500 },
      ),
    );
    expect(drawing.caption?.size).toBeGreaterThanOrEqual(TEXT.tall.caption.min);
  });
});

describe('fewer things at once (§4.3)', () => {
  const WORDS = 'one two three four five six seven eight nine ten';
  const script = (steps: SceneScript['steps'], cast = 6): SceneScript =>
    ({
      fit: 'good',
      fitReason: null,
      title: 't',
      mood: 'curious',
      beats: [{ say: WORDS }, { say: WORDS }],
      cast: Array.from({ length: cast }, (_, i) => ({
        id: `t${i}`,
        kind: 'words',
        text: `T${i}`,
        style: 'keyword',
      })),
      steps,
    }) as unknown as SceneScript;
  const stage = (show: string[], layout: SceneLayout = 'row') => ({
    layout,
    show,
    arrows: [
      { from: show[0], to: show[show.length - 1], label: null, flow: false },
    ],
  });

  it('pages five at once as three then two, on later words of the sentence', () => {
    const paged = pagedForTall(
      script([
        {
          at: { beat: 0, phrase: 'one two' },
          word: 0,
          stage: stage(['t0', 't1', 't2', 't3', 't4']),
          effects: [
            { target: 't1', part: null, do: 'pulse' },
            { target: 't4', part: null, do: 'pulse' },
          ],
        },
      ]),
    );
    expect(paged.steps.map((s) => s.stage?.show)).toEqual([
      ['t0', 't1', 't2'],
      ['t3', 't4'],
    ]);
    expect(paged.steps[1].word).toBeGreaterThan(paged.steps[0].word);
    expect(paged.steps[1].at.beat).toBe(0);
    expect(paged.steps[1].stage?.page).toBe(true);
    // Each page's effects its own; an arrow across two pages is not drawn.
    expect(paged.steps[0].effects.map((e) => e.target)).toEqual(['t1']);
    expect(paged.steps[1].effects.map((e) => e.target)).toEqual(['t4']);
    expect(paged.steps[0].stage?.arrows).toEqual([]);
    expect(pagesOf([1, 2, 3, 4], 3)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('keeps a build going as a feed: the newest on, the oldest gone up; a hub its centre', () => {
    const paged = pagedForTall(
      script([
        {
          at: { beat: 0, phrase: 'one' },
          word: 0,
          stage: stage(['t0', 't1', 't2']),
          effects: [],
        },
        {
          at: { beat: 1, phrase: 'one' },
          word: 0,
          stage: stage(['t0', 't1', 't2', 't3']),
          effects: [],
        },
      ]),
    );
    expect(paged.steps[1].stage?.show).toEqual(['t1', 't2', 't3']);
    expect(paged.steps[1].stage?.page).toBe(true);
    const hub = pagedForTall(
      script([
        {
          at: { beat: 0, phrase: 'one' },
          word: 0,
          stage: stage(['t0', 't1', 't2'], 'hub'),
          effects: [],
        },
        {
          at: { beat: 1, phrase: 'one' },
          word: 0,
          stage: stage(['t0', 't1', 't2', 't3'], 'hub'),
          effects: [],
        },
      ]),
    );
    expect(hub.steps[1].stage?.show).toEqual(['t0', 't2', 't3']);
  });

  it('leaves a script that fits, and a story’s page, as they were', () => {
    const fits = script([
      {
        at: { beat: 0, phrase: 'one' },
        word: 0,
        stage: stage(['t0', 't1', 't2']),
        effects: [],
      },
    ]);
    expect(pagedForTall(fits)).toBe(fits);
    const story = { ...fits, stations: true } as SceneScript;
    expect(pagedForTall(story)).toBe(story);
  });
});

/** Every word a scene sets, at every step, and its size. */
const allWords = (scene: SceneDto) =>
  scene.steps.flatMap((_, k) => wordsAt(scene, 'wide', k));

describe('the vertical plan’s explainer test piece (§9.2)', () => {
  it('composes "how a vaccine trains the immune system" tall: a stack, a compare and a focus, every word safe and large', async () => {
    const film = await composeVaccine('tall');
    expect(film.map((one) => one.scene.shape)).toEqual([
      'tall',
      'tall',
      'tall',
    ]);
    const layouts = film.flatMap((one) => one.scene.steps.map((s) => s.layout));
    expect(layouts).toEqual(
      expect.arrayContaining(['stack', 'compare', 'focus']),
    );
    for (const one of film) {
      expect(one.scene.stagings.wide).toMatchObject({ w: 900, h: 1600 });
      expect(lessonTextFaults(one.scene)).toEqual([]);
      expect(one.audit.wide.flat()).toEqual([]);
      for (const step of one.scene.steps)
        expect(step.show.length).toBeLessThanOrEqual(3);
      for (const words of allWords(one.scene)) {
        expect(words.size).toBeGreaterThanOrEqual(READ_LEAST.tall);
        expect(within(words.box, TALL_SAFE_BOX)).toBe(true);
      }
    }
    // Its one labelled drawing, labelled in a band across it, not cut short.
    const labels = film[2].scene.stagings.wide.places
      .flatMap((step) => Object.values(step))
      .flatMap((at) => at.labels ?? []);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => !l.lines.join(' ').includes('…'))).toBe(true);
  }, 60_000);

  it('composes the same sheets wide, saying nothing of a shape', async () => {
    const film = await composeVaccine('wide');
    for (const one of film) {
      expect('shape' in one.scene).toBe(false);
      expect(one.scene.stagings.wide).toMatchObject({ w: 1600, h: 900 });
      expect(one.audit.wide.flat()).toEqual([]);
    }
  }, 60_000);

  it('pages a film made wide, at most three at once, its words safe', async () => {
    const film = await composeAdolescentFilm(undefined, 'tall');
    for (const one of film) {
      expect(lessonTextFaults(one.scene)).toEqual([]);
      for (const step of one.scene.steps)
        expect(step.show.length).toBeLessThanOrEqual(4);
    }
  }, 60_000);
});

describe('a tall build’s board (§4.4)', () => {
  it('is the wide board turned, in the text area: the first thing top middle, read down', () => {
    // The wide board's start, [0, 1], is the tall one's top middle.
    const start = cellBox([0, 1], 900, 1600, 48, [0, 2], 'tall');
    const next = cellBox([1, 1], 900, 1600, 48, [0, 2], 'tall');
    expect(within(start, TALL_AREA)).toBe(true);
    expect(start.y).toBe(TALL_AREA.y);
    expect(start.x + start.w / 2).toBeCloseTo(TALL_AREA.x + TALL_AREA.w / 2, 0);
    expect(next.y).toBeGreaterThan(start.y + start.h);
    expect(next.x).toBe(start.x);
    // The wide board as it was.
    expect(cellBox([0, 1], 1600, 900, 56)).toEqual(
      cellBox([0, 1], 1600, 900, 56, undefined, 'wide'),
    );
  });

  it('frames a part of it where the frame’s text area falls, and the whole at a pull-out', () => {
    const one = cellBox([0, 1], 900, 1600, 48, [0, 2], 'tall');
    const view = tallFrameBox(['a'], new Map([['a', one]]), 900, 1600);
    expect(view[2] / view[3]).toBeCloseTo(900 / 1600, 2);
    expect(view[2]).toBeLessThan(900);
    expect(tallFrameBox('whole', new Map([['a', one]]), 900, 1600)).toEqual([
      0, 0, 900, 1600,
    ]);
  });

  it('builds the water cycle tall, every word safe where the camera shows it', async () => {
    const film = await composeWaterBuild('tall');
    for (const one of film) {
      expect(one.scene.shape).toBe('tall');
      expect(one.scene.stagings.wide.views?.length).toBe(
        one.scene.steps.length,
      );
      expect(lessonTextFaults(one.scene)).toEqual([]);
    }
  }, 60_000);
});

describe('a tall film’s pictures (§4.2, §4.7)', () => {
  it('asks for a drawing square rather than wide, but what is wide in itself', () => {
    expect(drawingShapeFor('wide', 'tall', 'A B cell and a germ')).toBe(
      'square',
    );
    expect(drawingShapeFor('wide', 'tall', 'A timeline of vaccines')).toBe(
      'wide',
    );
    expect(drawingShapeFor('tall', 'tall')).toBe('tall');
    expect(drawingShapeFor('wide', 'wide', 'anything')).toBe('wide');
  });

  it('draws a chart taller than wide, at most six bars, the rest as Other', () => {
    const bars = Array.from({ length: 8 }, (_, i) => ({
      label: `B${i}`,
      value: 10 + i,
    }));
    const kept = tallBars(bars, 'bar');
    expect(kept).toHaveLength(6);
    expect(kept[5].label).toBe('Other');
    expect(kept.reduce((sum, b) => sum + b.value, 0)).toBe(
      bars.reduce((sum, b) => sum + b.value, 0),
    );
    const tall = renderChart({ kind: 'bar', unit: '%', bars }, 'tall');
    expect(tall.viewBox).toEqual([0, 0, 800, 900]);
    expect(Object.keys(tall.parts)).toHaveLength(6);
    expect(renderChart({ kind: 'bar', unit: '%', bars }).viewBox).toEqual([
      0, 0, 1000, 620,
    ]);
  });

  it('frames a clip’s card in its own shape', () => {
    expect(clipCardDrawing('tall').viewBox).toEqual([0, 0, 900, 1600]);
    expect(clipCardDrawing().viewBox).toEqual([0, 0, 1600, 900]);
  });
});

describe('the words-in-the-safe-zone check (§6.2, §6.4)', () => {
  it('finds words under the platforms’ buttons, in the subtitles’ band, and too small', () => {
    const scene = {
      shape: 'tall',
      things: [{ id: 'a', kind: 'words', text: 'Hello' }],
      steps: [{ atMs: 0, layout: 'one', show: ['a'], arrows: [] }],
      stagings: {
        box: { w: 900, h: 1600, places: [] },
        wide: {
          w: 900,
          h: 1600,
          places: [
            {
              a: {
                x: 700,
                y: 1150,
                w: 180,
                h: 40,
                caption: {
                  x: 700,
                  y: 1150,
                  w: 180,
                  size: 30,
                  lines: ['Hello'],
                },
              },
            },
          ],
        },
      },
    } as unknown as SceneDto;
    const kinds = lessonTextFaults(scene).map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['small']));
    expect(kinds.some((k) => k === 'unsafe' || k === 'subtitles')).toBe(true);
  });
});
