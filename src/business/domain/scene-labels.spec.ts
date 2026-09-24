import { fitInSlot, overlaps, slotsFor, type Rect } from './scene-layout';
import { renderQuote } from './scene-quote';
import {
  LABEL,
  arrowPath,
  auditStep,
  crosses,
  gutters,
  labelLines,
  normalOf,
  pillBox,
  placeBubble,
  placeLabels,
  placePill,
  segmentsOf,
  sidesOf,
  type Point,
} from './scene-labels';

/** A small seeded generator, so a failing case can be found again. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

const PARTS = [
  'cortex',
  'medulla',
  'renal pelvis',
  'ureter',
  'renal artery',
  'glomerulus',
  "Bowman's capsule",
  'loop of Henle',
];

describe('labels set beside their drawing', () => {
  it('breaks a label onto two lines, smaller, before it cuts one short', () => {
    expect(labelLines('loop of Henle', 400, 30)).toEqual({
      lines: ['loop of Henle'],
      size: 30,
    });
    const tight = labelLines('proximal convoluted tubule', 180, 30);
    expect(tight.lines.length).toBeLessThanOrEqual(2);
    expect(tight.lines.join(' ')).toContain('proximal');
    const cut = labelLines(
      'supercalifragilisticexpialidocious nephron',
      60,
      30,
    );
    expect(cut.lines[cut.lines.length - 1]).toMatch(/…$|nephron/);
  });

  it('sets each label on the side it points from, evened out', () => {
    const box: [number, number, number, number] = [0, 0, 100, 100];
    expect(
      sidesOf(
        [{ anchor: [10, 10] }, { anchor: [90, 50] }, { anchor: [20, 80] }],
        box,
      ),
    ).toEqual(['left', 'right', 'left']);
    const allLeft = sidesOf(
      [10, 20, 30, 40, 45].map((x) => ({ anchor: [x, x] as Point })),
      box,
    );
    expect(allLeft.filter((s) => s === 'right').length).toBeGreaterThanOrEqual(
      1,
    );
    // The one nearest the middle is the one that crosses.
    expect(allLeft[4]).toBe('right');
  });

  it('makes room beside a drawing for its labels, and the drawing gives it up', () => {
    const slot: Rect = { x: 44, y: 44, w: 1112, h: 812 };
    const callouts = [
      { text: 'renal pelvis', anchor: [100, 300] as Point },
      { text: 'cortex', anchor: [700, 200] as Point },
    ];
    const viewBox: [number, number, number, number] = [0, 0, 800, 800];
    const room = gutters(callouts, viewBox, slot);
    expect(room.left).toBeGreaterThan(100);
    expect(room.right).toBeGreaterThan(80);
    const bare = fitInSlot(
      { kind: 'drawing', aspect: 1.6, caption: 'Kidney' },
      slot,
    );
    const labelled = fitInSlot(
      { kind: 'drawing', aspect: 1.6, caption: 'Kidney', callouts, viewBox },
      slot,
    );
    expect(labelled.w).toBeLessThan(bare.w);
    expect(labelled.x).toBeGreaterThanOrEqual(slot.x + room.left - 0.5);
    expect(labelled.x + labelled.w).toBeLessThanOrEqual(
      slot.x + slot.w - room.right + 0.5,
    );
  });

  it("sets a passage's notes in its margin, leaders stopping at the line ends, and lists them under it where the margin would shrink its words", () => {
    const set = renderQuote({
      text: "I wandered lonely as a cloud\nThat floats on high o'er vales and hills,\nWhen all at once I saw a crowd,\nA host, of golden daffodils;",
      phrases: [
        { name: 'simile', phrase: 'lonely as a cloud', note: 'begins alone' },
        {
          name: 'crowd',
          phrase: 'a crowd, A host',
          note: 'flowers described as people',
        },
      ],
    });
    const passage = {
      kind: 'drawing' as const,
      aspect: set.viewBox[2] / set.viewBox[3],
      caption: null,
      source: 'quote' as const,
      callouts: set.callouts,
      viewBox: set.viewBox,
      words: { size: set.size },
    };
    const callouts = set.callouts;
    const wordsOnStage = (w: number) => (set.size * w) / set.viewBox[2];

    // A whole wide stage: a margin on the right, every note in it.
    const wide: Rect = { x: 56, y: 56, w: 1488, h: 788 };
    const inMargin = fitInSlot(passage, wide);
    expect(inMargin.labelsAt).toBe('sides');
    const margin = placeLabels({
      place: inMargin,
      room: wide,
      viewBox: set.viewBox,
      callouts,
      avoid: { boxes: [], segments: [] },
    });
    const s = inMargin.w / set.viewBox[2];
    for (const [i, label] of margin.entries()) {
      expect(label.align).toBe('start');
      expect(label.x).toBeGreaterThan(inMargin.x + inMargin.w);
      // The leader ends past the end of its line: it crosses no words.
      const end = set.callouts[i].ends!.right;
      expect(label.leader![2]).toBeCloseTo(
        inMargin.x + (end[0] - set.viewBox[0]) * s,
        0,
      );
      expect(label.size).toBeLessThanOrEqual(
        Math.max(LABEL.min, wordsOnStage(inMargin.w) * 0.8) + 0.5,
      );
    }

    // A narrow room: listed under it, with no leaders, the passage as wide
    // as the room.
    const narrow: Rect = { x: 44, y: 44, w: 560, h: 812 };
    const listed = fitInSlot(passage, narrow);
    expect(listed.labelsAt).toBe('list');
    expect(listed.w).toBeCloseTo(narrow.w, 0);
    const list = placeLabels({
      place: listed,
      room: narrow,
      viewBox: set.viewBox,
      callouts,
      avoid: { boxes: [], segments: [] },
    });
    expect(list.map((l) => l.part)).toEqual(['simile', 'crowd']);
    for (const label of list) {
      expect(label.leader).toBeNull();
      expect(label.y).toBeGreaterThanOrEqual(listed.y + listed.h);
      expect(label.y + label.h).toBeLessThanOrEqual(narrow.y + narrow.h);
      expect(label.x + label.w).toBeLessThanOrEqual(narrow.x + narrow.w + 0.5);
    }
    expect(overlaps(list[0], list[1])).toBe(false);
  });

  it('never lets two labels touch, or touch the drawing, in any layout, even with an arrow running past', () => {
    const random = seeded(7);
    let cases = 0;
    for (const staging of ['box', 'wide'] as const)
      for (const layout of ['one', 'row', 'focus', 'compare'] as const)
        for (let trial = 0; trial < 25; trial += 1) {
          const n = layout === 'one' ? 1 : 2;
          const [slot] = slotsFor(layout, n, staging);
          const count = 1 + Math.floor(random() * 6);
          const callouts = Array.from({ length: count }, (_, i) => ({
            part: PARTS[i],
            text: PARTS[i],
            anchor: [100 + random() * 600, 100 + random() * 600] as Point,
          }));
          const place = fitInSlot(
            {
              kind: 'drawing',
              aspect: 0.7 + random() * 1.2,
              caption: 'A kidney, cut in half',
              callouts,
              viewBox: [0, 0, 800, 800 / (0.7 + random() * 1.2)],
            },
            slot,
          );
          // An arrow leaving the drawing sideways, as it does in a row.
          const arrow: [Point, Point] = [
            [place.x + place.w + 16, place.y + place.h * random()],
            [slot.x + slot.w + 200, place.y + place.h * random()],
          ];
          const labels = placeLabels({
            place,
            room: slot,
            viewBox: [0, 0, 800, 800 / (place.w / place.h)],
            callouts,
            avoid: { boxes: [], segments: [arrow] },
          });
          expect(labels).toHaveLength(count);
          for (let i = 0; i < labels.length; i += 1) {
            expect(overlaps(labels[i], place, 1)).toBe(false);
            for (let j = i + 1; j < labels.length; j += 1)
              expect(overlaps(labels[i], labels[j], 1)).toBe(false);
            expect(labels[i].x).toBeGreaterThanOrEqual(slot.x - 1);
            expect(labels[i].x + labels[i].w).toBeLessThanOrEqual(
              slot.x + slot.w + 1,
            );
          }
          cases += 1;
        }
    expect(cases).toBe(200);
  });

  it('sets short labels in a band over a wide drawing that leaves room above it, over their parts', () => {
    const random = seeded(11);
    let banded = 0;
    for (let trial = 0; trial < 60; trial += 1) {
      const [slot] = slotsFor('row', 2, trial % 2 ? 'box' : 'wide');
      const count = 1 + Math.floor(random() * 4);
      const aspect = 1.8 + random() * 0.8;
      const viewBox: [number, number, number, number] = [
        0,
        0,
        900,
        900 / aspect,
      ];
      const callouts = Array.from({ length: count }, (_, i) => ({
        part: PARTS[i],
        text: PARTS[i].split(' ')[0],
        anchor: [
          60 + random() * 780,
          40 + random() * (900 / aspect - 80),
        ] as Point,
      }));
      const place = fitInSlot(
        { kind: 'drawing', aspect, caption: 'Nephron', callouts, viewBox },
        slot,
      );
      const labels = placeLabels({
        place,
        room: slot,
        viewBox,
        callouts,
        avoid: { boxes: [], segments: [] },
      });
      expect(labels).toHaveLength(count);
      if (place.labelsAt !== 'above') continue;
      banded += 1;
      for (let i = 0; i < labels.length; i += 1) {
        expect(labels[i].align).toBe('middle');
        expect(labels[i].y + labels[i].h).toBeLessThanOrEqual(place.y);
        expect(labels[i].y).toBeGreaterThanOrEqual(slot.y - 1);
        for (let j = i + 1; j < labels.length; j += 1)
          expect(overlaps(labels[i], labels[j], 1)).toBe(false);
      }
    }
    // Wide drawings in a row leave room above: most go in a band.
    expect(banded).toBeGreaterThan(30);
  });

  it('keeps a column clear of an arrow that crosses it, when there is room', () => {
    const slot: Rect = { x: 44, y: 44, w: 700, h: 800 };
    const place = { x: 300, y: 100, w: 300, h: 500 };
    const callouts = [
      { part: 'a', text: 'artery', anchor: [700, 400] as Point },
      { part: 'b', text: 'vein', anchor: [700, 420] as Point },
    ];
    const across: [Point, Point] = [
      [616, 360],
      [900, 360],
    ];
    const labels = placeLabels({
      place,
      room: slot,
      viewBox: [0, 0, 800, 800 * (500 / 300)],
      callouts,
      avoid: { boxes: [], segments: [across] },
    });
    for (const label of labels) expect(crosses(across, label)).toBe(false);
  });

  it('puts an arrow label beside the middle of its arrow, and elsewhere when that is taken', () => {
    const stage = { w: 1600, h: 900 };
    const from: Rect = { x: 100, y: 300, w: 300, h: 300 };
    const to: Rect = { x: 1000, y: 300, w: 300, h: 300 };
    const path = arrowPath(from, to, false, stage);
    const free = placePill({
      label: 'blood',
      path,
      avoid: { boxes: [], segments: [] },
      stage,
    });
    expect(free).toMatchObject({ t: 0.5, side: 1 });
    // Above the line: the normal of an arrow running across points up.
    expect(normalOf([1, 0])[1]).toBeLessThan(0);
    const taken = pillBox(path, free!);
    const moved = placePill({
      label: 'blood',
      path,
      avoid: { boxes: [taken], segments: [] },
      stage,
    });
    expect(overlaps(pillBox(path, moved!), taken, 1)).toBe(false);
    // An arrow too short to hold its label anywhere clear: no label.
    const short = arrowPath(
      { x: 100, y: 300, w: 300, h: 300 },
      { x: 480, y: 300, w: 300, h: 300 },
      false,
      stage,
    );
    expect(
      placePill({
        label: 'gluconeogenesis',
        path: short,
        avoid: {
          boxes: [
            { x: 100, y: 0, w: 300, h: 900 },
            { x: 480, y: 0, w: 300, h: 900 },
          ],
          segments: [],
        },
        stage,
      }),
    ).toBeNull();
  });

  it('bows an arrow on a ring outward, and the pill rides on the bow', () => {
    const stage = { w: 1200, h: 900 };
    const path = arrowPath(
      { x: 500, y: 60, w: 200, h: 200 },
      { x: 900, y: 500, w: 200, h: 200 },
      true,
      stage,
    );
    expect(path.length).toBeGreaterThan(2);
    expect(segmentsOf(path)).toHaveLength(path.length - 1);
  });

  it('finds words on words, on ink, across an arrow, and off the stage', () => {
    const found = auditStep({
      words: [
        { owner: 'a', what: 'caption', box: { x: 0, y: 0, w: 100, h: 30 } },
        { owner: 'b', what: 'caption', box: { x: 50, y: 10, w: 100, h: 30 } },
        { owner: 'c', what: 'label x', box: { x: 400, y: 400, w: 80, h: 30 } },
        { owner: 'd', what: 'caption', box: { x: 1180, y: 880, w: 80, h: 30 } },
      ],
      inks: [{ owner: 'e', boxes: [{ x: 390, y: 390, w: 100, h: 50 }] }],
      arrows: [
        {
          id: 'f>g',
          segments: [
            [
              [440, 300],
              [440, 600],
            ],
          ],
        },
      ],
      stage: { w: 1200, h: 900 },
    });
    expect(found.map((c) => c.kind).sort()).toEqual([
      'words-arrow',
      'words-ink',
      'words-off',
      'words-words',
    ]);
    // A drawing's own caption is not on its own ink; its label would be.
    expect(
      auditStep({
        words: [
          {
            owner: 'e',
            what: 'caption',
            box: { x: 400, y: 400, w: 50, h: 20 },
          },
        ],
        inks: [{ owner: 'e', boxes: [{ x: 390, y: 390, w: 100, h: 50 }] }],
        arrows: [],
        stage: { w: 1200, h: 900 },
      }),
    ).toEqual([]);
  });
});

describe('a speech bubble', () => {
  const stage = { w: 1600, h: 900 };
  const body = { x: 700, y: 200, w: 200, h: 600 };
  const head: Point = [800, 280];
  const text = 'You are holding the matches upside down';

  it('stands up and to the side of the head, its tail toward it', () => {
    const bubble = placeBubble({
      text,
      head,
      body,
      stage,
      avoid: { boxes: [], segments: [] },
    })!;
    expect(bubble.y + bubble.h).toBeLessThanOrEqual(head[1]);
    expect(bubble.x).toBeGreaterThan(head[0]);
    expect(bubble.lines.length).toBeLessThanOrEqual(3);
    expect(
      Math.hypot(bubble.tail[0] - head[0], bubble.tail[1] - head[1]),
    ).toBeLessThan(
      Math.hypot(bubble.x - head[0], bubble.y + bubble.h - head[1]),
    );
  });

  it('goes where nothing is, and nowhere when nothing is clear', () => {
    const right = { x: 780, y: 0, w: 820, h: 900 };
    const bubble = placeBubble({
      text,
      head,
      body,
      stage,
      avoid: { boxes: [right], segments: [] },
    })!;
    expect(bubble.x + bubble.w).toBeLessThanOrEqual(right.x);
    const everywhere = { x: 0, y: 0, w: 1600, h: 900 };
    expect(
      placeBubble({
        text,
        head,
        body,
        stage,
        avoid: { boxes: [everywhere], segments: [] },
      }),
    ).toBeNull();
  });

  it('says a long speech in three lines at most, cut short past that', () => {
    const bubble = placeBubble({
      text: 'and then the fox said a great many things about lanterns and wicks and the wind and the sea and the boats coming home late',
      head: [300, 500],
      body: { x: 200, y: 400, w: 200, h: 400 },
      stage,
      avoid: { boxes: [], segments: [] },
    })!;
    expect(bubble.lines).toHaveLength(3);
    expect(bubble.lines[2].endsWith('…')).toBe(true);
  });
});
