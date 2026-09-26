import { Resvg } from '@resvg/resvg-js';
import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import { walk, elements } from './scene-dom';
import {
  DETAIL_PX,
  MOST_DEPTH,
  MOST_DEPTH_INDOORS,
  cameraOf,
  clearOf,
  crowdHeads,
  depthOf,
  detailFor,
  drawCrowd,
  dressedAlike,
  hazed,
  keepOutsOf,
  planCrowd,
  reactionFrames,
  scaleAt,
  type CastAt,
  type CrowdInput,
  type CrowdPlan,
} from './scene-crowd';
import { rigOf } from './scene-figure';
import { conventionGround, topAt, type SetGround } from './scene-ground';

const LAGOS = {
  era: 'today',
  region: 'Lagos, Nigeria',
  culture: 'a Yoruba family in a busy city neighbourhood',
  landscape: 'flat sandy streets and a crowded market road',
  homes: 'low bungalows with walled compounds',
};

/** Two children drawn by the kit, standing as the Maya market scene has them, in each staging (the box's mapped into the set, 200 in). */
const child = (x: number, w: number, staging: 'box' | 'wide'): CastAt =>
  staging === 'wide'
    ? {
        x,
        y: 396.1,
        w,
        h: 447.9,
        head: [x + w / 2, 565.9],
        rig: true,
        stands: { feet: 820.4, unit: 2.357 },
        lead: true,
        child: true,
      }
    : {
        x,
        y: 394.5,
        w,
        h: 461.5,
        head: [x + w / 2, 569.4],
        rig: true,
        stands: { feet: 831.7, unit: 2.429 },
        lead: true,
        child: true,
      };
/** The market scene: Maya and Tobi most of it, then Tobi alone, then no one. */
const MARKET: CrowdInput['seen'] = [
  { share: 0.4369, cast: [child(297, 388.6, 'box'), child(869, 428.5, 'box')] },
  { share: 0.0434, cast: [child(585.8, 428.5, 'box')] },
  { share: 0.0197, cast: [] },
  {
    share: 0.4369,
    cast: [child(204.2, 377.2, 'wide'), child(964.8, 415.8, 'wide')],
    wide: true,
  },
  { share: 0.0434, cast: [child(592.1, 415.8, 'wide')], wide: true },
  { share: 0.0197, cast: [], wide: true },
];
/** An animal the artist drew: its feet at the foot of its box. */
const pip = (x: number, y: number, w: number, h: number): CastAt => ({
  x,
  y,
  w,
  h,
  head: [x + w * 0.4, y + h * 0.24],
  rig: false,
  stands: { feet: y + h, unit: 2.357 },
  lead: true,
  child: false,
});
/** The bus scene: Pip, then Maya and Pip, then the three of them in a row, then the children. */
const BUS: CrowdInput['seen'] = [
  { share: 0.0604, cast: [pip(710.7, 625.2, 178.4, 230.8)] },
  {
    share: 0.027,
    cast: [child(320.8, 388.7, 'box'), pip(1017.9, 625.2, 178.4, 230.8)],
  },
  {
    share: 0.2407,
    cast: [
      {
        ...child(244, 320.4, 'box'),
        y: 475.5,
        h: 380.5,
        head: [404.2, 619.7],
        stands: { feet: 836, unit: 2.003 },
      },
      pip(710, 665.8, 147.2, 190.3),
      {
        ...child(1002.7, 353.3, 'box'),
        y: 475.5,
        h: 380.5,
        head: [1163.1, 619.7],
        stands: { feet: 836, unit: 2.003 },
      },
    ],
  },
  { share: 0.1719, cast: [child(297, 388.6, 'box'), child(869, 428.5, 'box')] },
  { share: 0.0604, cast: [pip(713.4, 620.1, 173.2, 223.9)], wide: true },
  {
    share: 0.027,
    cast: [child(236.5, 377.2, 'wide'), pip(1118.5, 620.1, 173.2, 223.9)],
    wide: true,
  },
  {
    share: 0.2407,
    cast: [
      child(89.9, 377.2, 'wide'),
      pip(690.6, 620.1, 173.2, 223.9),
      child(1090.8, 415.8, 'wide'),
    ],
    wide: true,
  },
  {
    share: 0.1719,
    cast: [child(204.2, 377.2, 'wide'), child(964.8, 415.8, 'wide')],
    wide: true,
  },
];
/** The story's people somewhere out of the way: the crowd has the whole place. */
const CLEAR: CrowdInput['seen'] = [
  {
    share: 1,
    cast: [{ ...child(0, 1, 'wide'), h: 1, head: null }],
    wide: true,
  },
];

/** Flat ground, its far edge at `edge` (a share of the height), and anything standing on it: [from, to, its foot]. */
const ground = (
  edge: number,
  standing: [number, number, number][] = [],
): SetGround => ({
  top: Array.from({ length: 320 }, (_, i) => {
    const x = ((i + 0.5) / 320) * 1600;
    const on = standing.find(([a, b]) => x >= a && x <= b);
    return on ? on[2] / 900 : edge;
  }),
  horizon: edge - 4 / 900,
  haze: '#dfe6ea',
  source: 'colour',
});

const market = (patch: Partial<CrowdInput> = {}): CrowdInput => ({
  size: 'many',
  kind: 'outdoor',
  ground: ground(600 / 900, [
    [520, 820, 662],
    [830, 980, 700],
  ]),
  frame: [0, 0, 1600, 900],
  scale: 1,
  seen: MARKET,
  seed: 'studio/maya/sets.json:market',
  world: LAGOS,
  ...patch,
});

const rootOf = (svg: string) =>
  elements(parseDocument(svg, { xmlMode: true }).children)[0];
const people = (svg: string): Element[] =>
  [...walk(rootOf(svg))].filter((n) => n.name === 'svg' && n.attribs.x);
const adultPx = (plan: CrowdPlan, i: number) =>
  -rigOf('adult').top * plan.people[i].sc;
/** Each extra's head as the planner keeps it clear. */
const headOf = (p: CrowdPlan['people'][number]) => {
  const R = rigOf(p.spec.age, p.spec.build);
  return {
    x0: p.x - 54 * p.sc,
    x1: p.x + 54 * p.sc,
    y0: p.feet + (R.top - 14) * p.sc,
    y1: p.feet + (R.cy + 42) * p.sc,
  };
};

describe('a crowd seen through one camera', () => {
  const plan = planCrowd(market({ ground: ground(600 / 900) }));

  it('sizes everyone by where their feet are, and by nothing else', () => {
    expect(plan.camera.horizon).toBeCloseTo(596, 0);
    for (const p of plan.people) {
      const tall = -rigOf(p.spec.age).top * p.sc;
      const expected = -rigOf(p.spec.age).top * scaleAt(plan.camera, p.feet);
      expect(Math.abs(tall - expected) / expected).toBeLessThan(0.01);
      expect(p.feet).toBeGreaterThan(plan.camera.horizon);
      expect(depthOf(plan.camera, p.feet)).toBeLessThanOrEqual(
        MOST_DEPTH + 1e-6,
      );
    }
    // Of one age, the nearer never the smaller.
    for (const age of ['child', 'teen', 'adult', 'elder'])
      plan.people
        .filter((p) => p.spec.age === age)
        .sort((a, b) => a.feet - b.feet)
        .reduce((last, p) => {
          expect(p.sc).toBeGreaterThanOrEqual(last);
          return p.sc;
        }, 0);
  });

  it('stands a busy place three deep, grown-ups as tall as far off people are', () => {
    // Maya's market: 63, 108 and 163 pixels tall, row by row, against her 349.
    const rows = [0, 1, 2].map((row) => {
      const heights = plan.people
        .map((p, i) => ({ p, h: adultPx(plan, i) }))
        .filter(({ p }) => p.row === row)
        .map(({ h }) => h)
        .sort((a, b) => a - b);
      return heights[Math.floor(heights.length / 2)];
    });
    [63, 108, 163].forEach((want, row) =>
      expect(Math.abs(rows[row] - want) / want).toBeLessThan(0.1),
    );
  });

  it('keeps the horizon near the leads’ eye line, and a room’s at it', () => {
    const high = planCrowd(market({ ground: ground(0.4) }));
    // A child's eye line: 105 of the kit's units over their feet.
    expect(high.camera.eye).toBeCloseTo(820.4 - 105 * 2.357, 0);
    expect(high.camera.horizon).toBeCloseTo(high.camera.eye - 45, 0);
    const room = planCrowd(market({ kind: 'indoor', size: 'few' }));
    expect(room.camera.horizon).toBe(room.camera.eye);
    // Grown-up leads: a grown-up's eye line.
    const grown = planCrowd(
      market({
        seen: MARKET.map((one) => ({
          ...one,
          cast: one.cast.map((c) => ({ ...c, child: false })),
        })),
        kind: 'indoor',
      }),
    );
    expect(grown.camera.eye).toBeCloseTo(820.4 - 149 * 2.357, -1);
  });

  /** The market with grown-ups where the children stood. */
  const grownUps = MARKET.map((one) => ({
    ...one,
    cast: one.cast.map((c) => ({ ...c, child: false })),
  }));

  it('stands as big a crowd before grown-up leads as before children, on the ground as painted', () => {
    for (const ground of [market().ground, conventionGround()]) {
      const children = planCrowd(market({ ground }));
      const grown = planCrowd(market({ ground, seen: grownUps }));
      // The horizon the set was painted with, whoever the leads are.
      expect(grown.camera.horizon).toBe(children.camera.horizon);
      expect(grown.people.length).toBe(children.people.length);
      expect(grown.people.length).toBeGreaterThan(12);
      for (const row of [0, 1, 2])
        expect(grown.people.some((p) => p.row === row)).toBe(true);
    }
  });

  it('stands a few in front of a room’s far wall, however high the camera', () => {
    for (const kind of ['indoor', 'vessel'] as const)
      for (const floor of [0.62, 0.7, 0.72, 0.76])
        for (const seen of [MARKET, grownUps]) {
          const input = market({
            kind,
            size: 'few',
            ground: ground(floor),
            seen,
          });
          const plan = planCrowd(input);
          expect(plan.people.length).toBeGreaterThanOrEqual(1);
          for (const p of plan.people) {
            expect(p.feet).toBeGreaterThanOrEqual(floor * 900 + 3 - 1e-6);
            expect(depthOf(plan.camera, p.feet)).toBeLessThanOrEqual(
              MOST_DEPTH_INDOORS + 1e-6,
            );
          }
        }
    // A floor at 0.7 before grown-ups: the few there are, all of them.
    const room = planCrowd(
      market({
        kind: 'indoor',
        size: 'few',
        ground: ground(0.7),
        seen: grownUps,
      }),
    );
    expect(room.people.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps clear of the story’s people in a close shot, but measures no one from it', () => {
    // Tobi close, as he shows against the set: twice as big, over the middle.
    const close = {
      share: 0.3,
      close: true,
      wide: true,
      cast: [
        {
          ...child(500, 832, 'wide'),
          y: -100,
          h: 1792,
          head: [916, 580] as [number, number],
          stands: { feet: 1692, unit: 4.714 },
        },
      ],
    };
    const seen = [
      ...MARKET.map((one) => ({ ...one, share: one.share * 0.7 })),
      close,
    ];
    const plan = planCrowd(market({ seen }));
    expect(plan.camera).toEqual(cameraOf(market()));
    const keep = keepOutsOf([close]);
    for (const p of plan.people)
      expect(
        keep[0].faces.some((f) => {
          const head = headOf(p);
          return (
            head.x0 < f.x1 && f.x0 < head.x1 && head.y0 < f.y1 && f.y0 < head.y1
          );
        }),
      ).toBe(false);
  });
});

describe('a crowd on the set’s own ground', () => {
  it('never stands anyone on a stall or behind it', () => {
    const input = market();
    const plan = planCrowd(input);
    expect(plan.people.length).toBeGreaterThan(8);
    for (const p of plan.people)
      for (let dx = -0.3 * 96 * p.sc; dx <= 0.3 * 96 * p.sc; dx += 2)
        expect(p.feet).toBeGreaterThanOrEqual(
          topAt(input.ground, (p.x + dx) / 1600) * 900 + 3 - 1e-6,
        );
    // Some stood forward to stand in front of the stall, none on it.
    expect(
      plan.people.some((p) => p.x > 540 && p.x < 800 && p.feet >= 665),
    ).toBe(true);
  });

  it('stands no one where the ground cannot be read but the lower third', () => {
    const plan = planCrowd(market({ ground: conventionGround() }));
    for (const p of plan.people) expect(p.feet).toBeGreaterThan(0.66 * 900);
  });
});

describe('a crowd clear of the story’s faces', () => {
  for (const [name, seen, size] of [
    ['the market', MARKET, 'many'],
    ['the bus', BUS, 'few'],
  ] as const)
    it(`keeps every head off the faces and outlines of ${name}, in both stagings`, () => {
      const plan = planCrowd(
        market({ seen, size, kind: size === 'few' ? 'vessel' : 'outdoor' }),
      );
      const keep = keepOutsOf(seen);
      for (const p of plan.people) {
        const head = headOf(p);
        let face = 0;
        for (const one of keep)
          if (
            one.faces.some(
              (f) =>
                head.x0 < f.x1 &&
                f.x0 < head.x1 &&
                head.y0 < f.y1 &&
                f.y0 < head.y1,
            )
          )
            face += one.share;
        expect(face).toBeLessThanOrEqual(0.2);
        expect(clearOf(head, keep)).toBe(true);
      }
    });

  it('keeps out of the side places the bus’s three stand in', () => {
    const plan = planCrowd(market({ seen: BUS, size: 'few', kind: 'vessel' }));
    const faces = keepOutsOf(BUS).filter((one) => one.share > 0.2);
    for (const p of plan.people)
      for (const one of faces)
        for (const f of one.faces)
          expect(p.x < f.x0 - 20 || p.x > f.x1 + 20).toBe(true);
  });
});

describe('a crowd of people, not of rows', () => {
  const plan = planCrowd(market({ ground: ground(600 / 900), seen: CLEAR }));

  it('stands in groups of one to four, spaced unevenly', () => {
    const groups = new Map<number, number>();
    for (const p of plan.people)
      groups.set(p.cluster, (groups.get(p.cluster) ?? 0) + 1);
    for (const n of groups.values()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
    for (const row of [0, 1]) {
      const xs = plan.people
        .filter((p) => p.row === row)
        .map((p) => p.x)
        .sort((a, b) => a - b);
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(
        gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length,
      );
      expect(sd / mean).toBeGreaterThan(0.5);
    }
  });

  it('is all sorts of people, some turned away, no two alike side by side', () => {
    const ages = new Set(plan.people.map((p) => p.spec.age));
    const tops = new Set(plan.people.map((p) => p.spec.top));
    const builds = new Set(plan.people.map((p) => p.spec.build));
    const views = new Set(plan.people.map((p) => p.view));
    expect(ages.size).toBeGreaterThanOrEqual(3);
    expect(tops.size).toBeGreaterThanOrEqual(3);
    expect(builds.size).toBeGreaterThanOrEqual(2);
    expect(views.size).toBe(2);
    expect(
      plan.people.filter((p) => p.view === 'back').length / plan.people.length,
    ).toBeGreaterThanOrEqual(0.15);
    for (const row of [0, 1, 2]) {
      const line = plan.people
        .filter((p) => p.row === row)
        .sort((a, b) => a.x - b.x);
      line.slice(1).forEach((p, i) => {
        const q = line[i];
        expect(
          p.spec.top === q.spec.top && p.spec.topColour === q.spec.topColour,
        ).toBe(false);
      });
    }
    // Dressed for Lagos, from the kit's own lists.
    expect(
      plan.people.some((p) =>
        ['kaftan', 'agbada', 'dress'].includes(p.spec.top),
      ),
    ).toBe(true);
  });

  it('dresses no one as one of the story’s people', () => {
    const everyone = planCrowd(
      market({ ground: ground(600 / 900), seen: CLEAR }),
    );
    const wearing = everyone.people.slice(0, 4).map((p) => ({
      top: p.spec.top,
      topColour: p.spec.topColour,
      headwear: p.spec.headwear,
    }));
    const plan = planCrowd(
      market({ ground: ground(600 / 900), seen: CLEAR, wearing }),
    );
    expect(plan.people.length).toBeGreaterThan(12);
    for (const p of plan.people)
      for (const lead of wearing)
        expect(dressedAlike(p.spec, lead)).toBe(false);
    // A blue cap over a green top is Tobi's, whatever the top.
    expect(
      dressedAlike(
        { top: 't-shirt', topColour: 'green', headwear: 'cap' },
        { top: 'hoodie', topColour: 'green', headwear: 'cap' },
      ),
    ).toBe(true);
    expect(
      dressedAlike(
        { top: 't-shirt', topColour: 'green', headwear: 'none' },
        { top: 'hoodie', topColour: 'green', headwear: 'none' },
      ),
    ).toBe(false);
  });

  it('has a few wander, to and fro over ground that is free', () => {
    const walking = plan.people.filter((p) => p.walk);
    expect(walking.length).toBeGreaterThanOrEqual(1);
    expect(walking.length).toBeLessThanOrEqual(3);
    for (const p of walking) {
      expect(Math.abs(p.walk)).toBeLessThanOrEqual(180);
      expect(Math.abs(p.walk)).toBeGreaterThanOrEqual(60);
      expect(p.flip).toBe(p.walk < 0);
    }
  });
});

describe('a crowd seen through distance', () => {
  const plan = planCrowd(market({ ground: ground(600 / 900) }));
  const svg = drawCrowd(plan, { durationMs: 30000 });

  it('fades each colour toward the distance’s, and takes the colour out of it', () => {
    // A grey has no colour to take out: it is mixed, exactly.
    expect(hazed('#404040', '#c0c0c0', 0.5)).toBe('#808080');
    expect(hazed('#2d2a32', '#ffffff', 0)).toBe('#2d2a32');
    // A colour loses half as much of its saturation as it fades.
    const [r, g, b] = [0xd9, 0x53, 0x4f];
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    const k = 1 - 0.5 * 0.4;
    const want = [r, g, b].map((v, i) =>
      Math.round((grey + (v - grey) * k) * 0.6 + [0xdf, 0xe6, 0xea][i] * 0.4),
    );
    expect(hazed('#d9534f', '#dfe6ea', 0.4)).toBe(
      `#${want.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    );
  });

  it('draws the far rows paler, and a shape with no outline or face when small', () => {
    const ink = (row: number) => {
      const group = [...walk(rootOf(svg))].find(
        (n) => n.name === 'g' && n.attribs.class === `row r${row}`,
      );
      const strokes = [...walk(group!)]
        .map((n) => n.attribs.stroke)
        .filter((s): s is string => Boolean(s && s.startsWith('#')));
      return strokes.length ? parseInt(strokes[0].slice(1, 3), 16) : Infinity;
    };
    // The ink lightens row by row toward the back; the back row has none.
    expect(ink(1)).toBeGreaterThan(ink(2));
    for (const [i, p] of plan.people.entries()) {
      expect(p.detail).toBe(detailFor(adultPx(plan, i)));
      if (p.detail === 2) expect(p.haze).toBeGreaterThan(0.3);
    }
    // A shape: its outline none, and no face.
    const shapes = people(svg).filter(
      (person) =>
        [...walk(person)].some(
          (n) => n.name === 'g' && n.attribs['stroke-width'] === '2.6',
        ) &&
        [...walk(person)].find((n) => n.attribs['stroke-width'] === '2.6')!
          .attribs.stroke === 'none',
    );
    expect(shapes.length).toBe(
      plan.people.filter((p) => p.detail === 2).length,
    );
    for (const person of shapes)
      expect([...walk(person)].some((n) => n.attribs.class === 'fm')).toBe(
        false,
      );
    expect(detailFor(DETAIL_PX.face)).toBe(0);
    expect(detailFor(DETAIL_PX.dots)).toBe(1);
    expect(detailFor(DETAIL_PX.dots - 1)).toBe(2);
  });
});

describe('a crowd drawn once for its place', () => {
  const input = market();

  it('is the same drawing for the same place every time, and ids are its own', () => {
    const a = drawCrowd(planCrowd(input), { durationMs: 30000 });
    const b = drawCrowd(planCrowd(input), { durationMs: 30000 });
    expect(a).toBe(b);
    const ids = [...walk(rootOf(a))].flatMap((n) =>
      n.attribs.id ? [n.attribs.id] : [],
    );
    expect(new Set(ids).size).toBe(ids.length);
    // Kit faces clip their eyes by their own clip.
    for (const clip of a.matchAll(/url\(#([^)]+)\)/g))
      expect(ids).toContain(clip[1]);
    expect(a.length).toBeLessThan(100 * 1024);
  });

  it('has other people in another place, and the same regulars when the story comes back', () => {
    const here = planCrowd(input);
    const there = planCrowd({ ...input, seed: 'studio/maya/sets.json:field' });
    const dressed = (plan: CrowdPlan) =>
      new Set(plan.people.map((p) => JSON.stringify(p.spec)));
    const same = [...dressed(there)].filter((s) => dressed(here).has(s));
    expect(same.length).toBeLessThan(3);
    // Back at the market, the cast stood elsewhere: the same regulars, mostly.
    const back = planCrowd({
      ...input,
      seen: [{ share: 1, cast: [child(600, 400, 'wide')] }],
    });
    const again = [...dressed(back)].filter((s) => dressed(here).has(s));
    expect(again.length).toBeGreaterThanOrEqual(dressed(here).size / 2);
  });

  it('frames itself as its set is framed', () => {
    const plan = planCrowd({ ...input, frame: [-100, 0, 1800, 1000] });
    expect(drawCrowd(plan, { durationMs: 1000 })).toContain(
      'viewBox="-100 0 1800 1000"',
    );
  });
});

describe('a crowd that moves', () => {
  const plan = planCrowd(market({ ground: ground(600 / 900) }));
  const svg = drawCrowd(plan, {
    durationMs: 20000,
    moves: [
      [5000, 'cheer', 1400],
      [12000, 'gasp', 1400],
    ],
  });

  it('cheers, most of them with their arms up, each a moment apart', () => {
    const cheering = people(svg).filter((p) =>
      [...walk(p)].some((n) => /--cu:/.test(n.attribs.style ?? '')),
    );
    expect(cheering.length / people(svg).length).toBeGreaterThanOrEqual(0.6);
    for (const person of people(svg)) {
      const late = /--late:(\d+)ms/.exec(
        [...walk(person)].map((n) => n.attribs.style ?? '').join(';'),
      );
      expect(Number(late?.[1])).toBeLessThanOrEqual(300);
    }
    // The track is at rest before the cheer and after the gasp.
    const frames = reactionFrames(
      [
        [5000, 'cheer', 1400],
        [12000, 'gasp', 1400],
      ],
      20000,
    );
    expect(frames).toContain(
      '@keyframes cr-x{0%{transform:none}25%{transform:none}',
    );
    expect(frames).toContain('67%{transform:none}100%{transform:none}');
    // Some gasp with a hand to the mouth; none whose hand is talking.
    expect(svg).toMatch(/--gu:-?\d/);
    for (const person of people(svg)) {
      const talking = [...walk(person)].some((n) =>
        /\btk\b/.test(n.attribs.class ?? ''),
      );
      if (talking)
        expect(
          [...walk(person)].some((n) => /--gu:/.test(n.attribs.style ?? '')),
        ).toBe(false);
    }
  });

  it('breathes, sways and talks on each one’s own beat, and a still shows them at rest', () => {
    expect(svg).toContain('@keyframes cr-br');
    expect(svg).toContain('@keyframes cr-tk');
    const breaths = new Set(
      [...svg.matchAll(/class="cb" style="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(breaths.size).toBeGreaterThan(plan.people.length / 2);
    // A still, which runs no CSS, shows everyone at rest: as if none moved.
    const still = (markup: string) =>
      new Resvg(markup, { fitTo: { mode: 'width', value: 400 } })
        .render()
        .asPng();
    expect(
      still(svg).equals(still(svg.replace(/<style>.*?<\/style>/, ''))),
    ).toBe(true);
  });

  it('speaks from over the heads of one of its groups', () => {
    const heads = crowdHeads(plan);
    expect(heads.length).toBeGreaterThan(3);
    for (const h of heads) {
      expect(h.x1).toBeGreaterThan(h.x0);
      expect(h.y).toBeLessThan(h.feet);
    }
  });
});
