/**
 * A film's shape (studio-vertical-plan §2): wide exactly as it always was,
 * byte for byte, and tall composed on its own 900 × 1600 stage from the
 * same parts, its sets built again by code for the tall frame, its walks
 * timed by the world they cross.
 */
import { createHash } from 'node:crypto';
import { composeNativity } from './studio/__fixtures__/nativity';
import { composeAdolescentFilm } from './studio/__fixtures__/adolescent-health';
import { composeWaterBuild } from './__fixtures__/water-cycle-scenes';
import { noahScene, NOAH_FIRST } from './studio/__fixtures__/noah';
import { classroomScene } from './studio/__fixtures__/classroom';
import { marketSet } from './studio/__fixtures__/market';
import { SET_BENCH } from './set-bench';
import {
  FLOOR_LINE,
  SET_H,
  SET_W,
  buildSet,
  layoutOf,
} from './scene-set-layout';
import { stillPlan } from './scene-still';
import { STAGINGS } from './scene-layout';
import { walkBetween, walkLength, WALK_STAGE_MS } from './scene-film';
import {
  SET_FRAMES,
  STAGES,
  metresOf,
  metresPerSecond,
  setFrameFor,
  setWidthFor,
  shapeOf,
  stageOf,
  stagingsOf,
  stillSize,
  walkReach,
  worldHeightOf,
} from './scene-shape';

const hash = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/**
 * What the stage composed wide before shapes (studio at 9f92ade, 2026-09-30):
 * films, lessons, builds, still plans and sets. A shape added anywhere must
 * leave every one of these as it was. A deliberate change to wide output
 * updates them in the same commit, and says why.
 */
const WIDE_BEFORE: Record<string, string> = {
  'nativity-0': 'edde70ca65ccee53',
  'nativity-0-staging': '882a058ef7e63dc9',
  'nativity-1': 'c003c94cf97e8ec3',
  'nativity-1-staging': '818191ee16187de2',
  'nativity-2': '6b5a5ea947c2040d',
  'nativity-2-staging': '4f53cda18c2baa0c',
  'nativity-3': '8ccec3650e34b1e5',
  'nativity-3-staging': 'bf93bf5a0216a4d1',
  'nativity-4': 'b75fb97df561b538',
  'nativity-4-staging': 'db7d5962540776ef',
  'nativity-0-still-1500': '2e1e8e8de27ecb52',
  'nativity-0-still-6000': '2ffbfb61617f47e8',
  'nativity-0-still-12000': '803add83a96654ef',
  'nativity-1-still-1500': '96c2c53876062156',
  'nativity-1-still-6000': 'fa21894c213920de',
  'nativity-1-still-12000': '9de5c85dca42fcb0',
  'nativity-2-still-1500': '5ad78ebe50d86720',
  'nativity-2-still-6000': 'c4ce5bf06ae3fd68',
  'nativity-2-still-12000': '8ed30bf71198b749',
  'nativity-3-still-1500': '77921f1b74e64971',
  'nativity-3-still-6000': '18c480a36bacdc05',
  'nativity-3-still-12000': 'f9045b21e9b7decf',
  'nativity-4-still-1500': '608835bb02bd12e2',
  'nativity-4-still-6000': 'ebbfa10914543791',
  'nativity-4-still-12000': '88dab1ff7d4c1624',
  'adolescent-0': 'c80815531128de14',
  'adolescent-0-audit': '8001023547a986fd',
  'adolescent-1': 'b4b9c2590b8a728d',
  'adolescent-1-audit': '8230f81e984c7c19',
  'adolescent-2': '27f6e7edf0c37564',
  'adolescent-2-audit': '41c5799707d0e02b',
  'adolescent-3': 'f04d7c4a9ede1d65',
  'adolescent-3-audit': '5cfc8bd06e5544a5',
  'adolescent-4': '2b73eff726b21b1a',
  'adolescent-4-audit': 'b53f7f45aac00dbc',
  'adolescent-5': '24ae68ea9697b0c9',
  'adolescent-5-audit': '25366d089780002d',
  'water-0': '9b24775166e26d80',
  'water-1': '496119fb04a85eb4',
  'water-2': '285859ae5ff761fb',
  noah: 'ccd62d6fae4dfecb',
  'class-a': '2332cfa9429b93fc',
  'class-b': '194741ca9c0c1fbf',
  market: '11068cc6a4722b64',
  'bench-lagos-market': '4f481af1b45e17e8',
  'bench-lagos-street': '7d31b354599073fe',
  'bench-new-york-street': '1e9287ddc381fdc9',
  'bench-moses-riverside': '0ec869edfbd300c5',
  'bench-egypt-temple': '06dfd572df28bec2',
  'bench-desert-pyramids': '4d5aa2b18440a299',
  'bench-biblical-village': 'e62ae3d9e516588b',
  'bench-galilee-shore': '85afc5f09b55d5d9',
  'bench-farm': 'dfc61756dddf1f7c',
  'bench-forest': 'db5b65ad4460e399',
  'bench-town-park': '077dcb4940a88188',
  'bench-classroom': '760afedd814f5844',
  'bench-church': '94001cce65ccc8ea',
};

describe('wide, byte for byte as before shapes', () => {
  it('composes every film, lesson, build, still and set exactly as it did', async () => {
    const now: Record<string, string> = {};
    for (const [i, one] of (await composeNativity()).entries()) {
      now[`nativity-${i}`] = hash(one.scene);
      now[`nativity-${i}-staging`] = hash(one.staging);
      for (const t of [1500, 6000, 12000])
        now[`nativity-${i}-still-${t}`] = hash(stillPlan(one.scene, t));
    }
    for (const [i, one] of (await composeAdolescentFilm()).entries()) {
      now[`adolescent-${i}`] = hash(one.scene);
      now[`adolescent-${i}-audit`] = hash([one.audit, one.staging, one.pacing]);
    }
    for (const [i, one] of (await composeWaterBuild()).entries())
      now[`water-${i}`] = hash(one.scene);
    now.noah = hash(noahScene([NOAH_FIRST]));
    now['class-a'] = hash(classroomScene(true));
    now['class-b'] = hash(classroomScene(false));
    now.market = hash(marketSet());
    for (const one of SET_BENCH)
      now[`bench-${one.id}`] = hash(
        buildSet(layoutOf(one.layout, one.place, one.world), one.place),
      );
    expect(now).toEqual(WIDE_BEFORE);
  }, 60_000);

  it('says nothing of its shape on a wide scene, and keeps the stagings every reader of them knows', async () => {
    const [one] = await composeAdolescentFilm();
    expect('shape' in one.scene).toBe(false);
    expect(shapeOf(one.scene)).toBe('wide');
    expect(stagingsOf('wide')).toEqual(STAGINGS);
    expect(stageOf('box')).toBe(STAGINGS.box);
    expect(stageOf('wide')).toBe(STAGINGS.wide);
  });
});

describe('a tall film’s stage and frame', () => {
  it('is the wide stage turned, at both stagings, with a tall set frame', () => {
    expect(stagingsOf('tall')).toEqual({
      box: { w: 900, h: 1600, margin: 48 },
      wide: { w: 900, h: 1600, margin: 48 },
    });
    expect(setFrameFor(900, 1600)).toBe(SET_FRAMES.tall);
    expect(setFrameFor(1600, 900)).toBe(SET_FRAMES.wide);
    expect(setFrameFor(1200, 900)).toBe(SET_FRAMES.wide);
    // The same world: a metre, a kit unit and the ink are as many set units.
    expect(worldHeightOf(900, 1600)).toBe(900);
    expect(worldHeightOf(2400, 900)).toBe(900);
    expect(setWidthFor('wide', 1.5)).toBe(1.5);
    expect(setWidthFor('tall', 1)).toBe(1.5);
    expect(setWidthFor('tall', 2)).toBe(2);
  });

  it('sizes a still by its long side: the same pixels, so a picture check costs the same', () => {
    expect(stillSize(STAGES.wide)).toEqual({ w: 960, h: 540 });
    expect(stillSize(STAGES.tall)).toEqual({ w: 540, h: 960 });
  });
});

describe('walks timed in metres of the world', () => {
  const place = (x: number, h = 300) => ({ x, w: 100, h });

  it('times a wide stage’s walks exactly as before', () => {
    const W = STAGES.wide.w;
    expect(walkReach(STAGES.wide)).toBe(W);
    // Half the stage across: half a crossing.
    expect(walkBetween(place(100), place(900), walkReach(STAGES.wide))).toBe(
      (800 / W) * WALK_STAGE_MS,
    );
    // The reader's box keeps its own width.
    expect(walkReach({ w: 1200, h: 900 })).toBe(1200);
  });

  it('takes as long to cross the same ground in a tall frame as in a wide one', () => {
    const wide = walkBetween(place(100), place(700), walkReach(STAGES.wide));
    const tall = walkBetween(place(100), place(700), walkReach(STAGES.tall));
    expect(tall).toBe(wide);
    // Toward the camera too: the lens is the world's, not the frame's.
    expect(
      walkLength(place(300, 300), place(300, 420), walkReach(STAGES.tall)),
    ).toBe(
      walkLength(place(300, 300), place(300, 420), walkReach(STAGES.wide)),
    );
    // The pace, said in metres: the wide stage across (about 14 m) in its crossing time.
    expect(metresOf(1600)).toBeCloseTo(14.16, 1);
    expect(metresPerSecond(WALK_STAGE_MS)).toBeCloseTo(14.16 / 5.2, 2);
  });
});

describe('a set built for the tall frame', () => {
  const bench = SET_BENCH.find((one) => one.id === 'town-park')!;
  const layout = layoutOf(bench.layout, bench.place, bench.world);

  it('is the same place in a 900 × 1600 window, wider than its frame so the camera can pan', () => {
    const tall = buildSet(layout, bench.place, {}, null, null, SET_FRAMES.tall);
    expect(tall.svg).toMatch(/viewBox="0 0 900 1600"/);
    expect(tall.layered.width).toBe(
      900 * setWidthFor('tall', layout.width ?? 1),
    );
    expect(tall.layered.width).toBeGreaterThan(900);
    expect(tall.layered.floor.front).toBeGreaterThan(tall.layered.floor.back);
  });

  it('leaves the wide frame as it was for the next set built', () => {
    const before = hash(buildSet(layout, bench.place));
    buildSet(layout, bench.place, {}, null, null, SET_FRAMES.tall);
    expect(hash(buildSet(layout, bench.place))).toBe(before);
    expect(FLOOR_LINE.outdoor).toBe(0.64 * SET_H);
    expect(SET_W).toBe(1600);
  });
});

describe('a tall film composed', () => {
  it('places a lesson on its tall stage, at both stagings, and says it is tall', async () => {
    const film = await composeAdolescentFilm(undefined, 'tall');
    for (const one of film) {
      expect(one.scene.shape).toBe('tall');
      expect(one.scene.stagings.wide).toMatchObject({ w: 900, h: 1600 });
      expect(one.scene.stagings.box).toMatchObject({ w: 900, h: 1600 });
      // Everything placed on the stage it is on. TODO(V2): the tall reflow.
      for (const places of one.scene.stagings.wide.places)
        for (const at of Object.values(places)) {
          expect(at.x).toBeGreaterThanOrEqual(-1);
          expect(at.x + at.w).toBeLessThanOrEqual(901);
        }
    }
  }, 60_000);

  it('stands a story in a set built again for the tall frame, never the wide one cropped', async () => {
    // Scene 4 is in the field, which code can build again (the stable has a
    // piece the artist drew, kept only in its picture: TODO(V3)).
    const [scene] = await composeNativity([3], undefined, 'tall');
    expect(scene.scene.shape).toBe('tall');
    const set = scene.scene.things.find(
      (t) => t.kind === 'drawing' && t.backdrop,
    );
    expect(set?.kind === 'drawing' && set.svg).toMatch(
      /viewBox="0 0 900 1600"/,
    );
    // Its walks timed on the world: as long a walk takes as long.
    expect(scene.scene.walk?.stageMs).toBe(WALK_STAGE_MS);
  }, 60_000);
});
