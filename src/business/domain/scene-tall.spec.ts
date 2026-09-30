/**
 * Tall stories (studio-vertical-plan §3, V3): a tall set's raised eye;
 * people stood in depth and on diagonals at the world's own scale, their
 * faces above the subtitles; the tall shot grammar, with no far-off shot
 * (Richard's decision, 2026-09-30: the key character at least a medium);
 * a walk toward the camera; a painted set laid on the tall frame whole;
 * and the tall shot check (scene-safe) that holds all of it.
 */
import type { SceneDto } from '../../contracts';
import { SET_BENCH } from './set-bench';
import { buildSet, layoutOf } from './scene-set-layout';
import {
  SET_FRAMES,
  STAGES,
  SUBTITLE_BAND,
  TALL_FIGURE_LEAST,
  TALL_SHOT,
  figureShare,
  raisedEye,
  tallDepth,
} from './scene-shape';
import { SET_UNIT_SHARE } from './scene-ink';
import { floorAt, stationScale, stationShares } from './scene-layout';
import { tallOne, tallTwo, viewOf } from './scene-film';
import { grammarCamera, type GrammarLine } from './scene-shots';
import { grammarRead } from './scene-performance';
import { headOf, keyAt, tallShotFaults } from './scene-safe';
import { extendedTall } from './scene-set-shape';
import { voiced } from './studio/__fixtures__/voiced';
import { marketNewsStaged } from './studio/__fixtures__/market-news';
import { composeNativity } from './studio/__fixtures__/nativity';
import type { GatedDrawing } from './scene-svg';

const { w: W, h: H } = STAGES.tall;

describe('a tall set', () => {
  const bench = SET_BENCH.find((one) => one.id === 'town-park')!;
  const layout = layoutOf(bench.layout, bench.place, bench.world);
  const tall = buildSet(layout, bench.place, {}, null, null, SET_FRAMES.tall);

  it('raises its eye above a grown-up’s crown where people stand, so heads in depth part', () => {
    const eye = raisedEye(SET_FRAMES.tall, SET_UNIT_SHARE * 900)!;
    expect(tall.layered.floor.eye).toBeCloseTo(eye, 0);
    // A grown-up's crown is 192 of the kit's units up: the eye is above it.
    const crown = (feet: number, k: number) =>
      feet - 192 * SET_UNIT_SHARE * 900 * k;
    const far = floorAt(0.3, SET_FRAMES.tall.feet, eye, H - 12);
    const near = floorAt(0.75, SET_FRAMES.tall.feet, eye, H - 12);
    expect(crown(far.feet, far.k)).toBeLessThan(crown(near.feet, near.k) - 20);
    // The wide frame keeps its own eye rule.
    expect(raisedEye(SET_FRAMES.wide, 2.357)).toBeNull();
  });

  it('stands its people on its own floor, their faces above the subtitles', () => {
    const [back, front] = [tall.layered.floor.back, tall.layered.floor.front];
    expect(SET_FRAMES.tall.feet).toBeGreaterThan(back);
    expect(SET_FRAMES.tall.feet).toBeLessThan(front);
    // A grown-up at the kit's own size where people stand: chin above 0.69.
    const h = 234 * SET_UNIT_SHARE * 900;
    const box = {
      x: 300,
      y: SET_FRAMES.tall.feet - h * (224 / 234),
      w: 160,
      h,
    };
    const head = headOf(box);
    expect(head.y + head.h).toBeLessThan(SUBTITLE_BAND.tall.from * H);
  });
});

describe('people on a tall stage', () => {
  it('are the world’s own size, as on a wide stage, fitting half the group across', () => {
    const adult = {
      kind: 'drawing' as const,
      aspect: 160 / 234,
      caption: null,
      stands: { units: 234 },
    };
    const wide = stationScale([adult], 2, 'wide', 'wide');
    const tall = stationScale([adult], 2, 'wide', 'tall');
    expect(tall.unit).toBeCloseTo(wide.unit!, 6);
    expect(tall.floor).toBe(SET_FRAMES.tall.feet);
    // Four fit two across, not four.
    expect(stationScale([adult], 4, 'wide', 'tall').unit).toBeGreaterThan(
      stationScale([adult], 4, 'wide', 'wide').unit! * 0.9,
    );
    expect(stationShares(2, 'tall')['centre-left']).toBeGreaterThan(0.3);
  });

  it('stand two on a diagonal, talking distance apart, the one who opens nearer', () => {
    expect(tallDepth(0, 2)).toBeGreaterThan(tallDepth(1, 2) + 0.2);
    const { script } = marketNewsStaged();
    const { scene } = voiced(
      script,
      [],
      {},
      {},
      { stands: true, shape: 'tall' },
    );
    const [first] = scene.stagings.wide.places;
    // Theo calls from far back; Mina at her stall.
    expect(first.theo.d).toBeLessThan(0.3);
    expect(first.mina.d).toBeGreaterThan(first.theo.d!);
  });
});

describe('a walk toward the camera', () => {
  it('comes from the back of the floor to its front, and ends at least at a medium', () => {
    const { script } = marketNewsStaged();
    const { scene } = voiced(
      script,
      [],
      {},
      {},
      { stands: true, shape: 'tall' },
    );
    const places = scene.stagings.wide.places;
    const before = places[0].theo;
    const after = places[places.length - 1].theo;
    expect(after.d! - before.d!).toBeGreaterThan(0.5);
    expect(after.h).toBeGreaterThan(before.h * 1.25);
    // Once there, whoever the camera is on fills a medium or more.
    const t = scene.steps[1].atMs + 3000;
    expect(keyAt(scene, t)).not.toBeNull();
    expect(tallShotFaults(scene).filter((f) => f.kind === 'far')).toEqual([]);
  });
});

/** Lines one after another, 3 s each. */
const linesOf = (said: [string, string, string?][]): GrammarLine[] =>
  said.map(([speaker, say, to], i) => ({
    beat: i,
    speaker,
    to: to ?? null,
    startMs: 500 + i * 3000,
    endMs: 3000 + i * 3000,
    strong: false,
    sad: false,
    toCrowd: false,
    ...grammarRead(say),
  }));

describe('the tall shot grammar', () => {
  const PLACES = {
    a: { x: 180, y: 780, w: 380, h: 560, d: 0.66 },
    b: { x: 420, y: 760, w: 330, h: 490, d: 0.38 },
  };
  const grammar = (lines: GrammarLine[], tall: boolean) =>
    grammarCamera({
      lines,
      onAt: () => ['a', 'b'],
      placeAt: (id) => PLACES[id as 'a' | 'b'] ?? null,
      standing: () => true,
      small: () => false,
      addressed: false,
      heroes: [],
      W,
      asked: [{ beat: 0, shot: 'wide', on: null, with: null }],
      tall,
    });
  const talk = linesOf([
    ['a', 'The bus comes at noon.', 'b'],
    ['b', 'The shop shuts at six.', 'a'],
    ['a', 'The park is on the way.', 'b'],
    ['b', 'Then we walk there first.', 'a'],
    ['a', 'Fine. Bring the map.', 'b'],
  ]);

  it('never asks for the whole stage, nor a profile two-shot, and has a shot on every line', () => {
    const shots = grammar(talk, true);
    expect(shots.some((one) => one.shot === 'wide')).toBe(false);
    expect(shots.some((one) => one.shot === 'profile')).toBe(false);
    for (const line of talk)
      expect(shots.some((one) => one.beat === line.beat)).toBe(true);
    expect(shots.filter((one) => one.shot === 'ots').length).toBeGreaterThan(2);
  });

  it('leaves a wide film’s grammar as it was', () => {
    const shots = grammar(talk, false);
    expect(shots[0]).toMatchObject({ beat: 0, shot: 'wide' });
    // The first line of a wide film's talk has no shot of code's own.
    expect(shots.filter((one) => one.beat === 0)).toEqual([
      { beat: 0, shot: 'wide', on: null, with: null },
    ]);
  });
});

describe('a tall frame on people', () => {
  const one = { x: 180, y: 780, w: 380, h: 560 };
  const two = { x: 420, y: 760, w: 330, h: 490 };

  it('never goes further out than a medium on the key character, eyes on the upper third', () => {
    for (const share of [0.1, TALL_SHOT.medium, TALL_SHOT.close]) {
      const view = tallOne(one, share, W, H);
      expect(figureShare(one.h, view.s, H)).toBeGreaterThanOrEqual(
        TALL_FIGURE_LEAST - 1e-9,
      );
    }
    const view = tallOne(one, TALL_SHOT.close, W, H);
    const eyes = H / 2 + view.s * (one.y + one.h * (75 / 234) - view.y);
    expect(eyes / H).toBeCloseTo(TALL_SHOT.eyes, 2);
  });

  it('rests on whom the stage is on at a medium, never the whole stage', () => {
    const places = { a: { ...one, d: 0.66 }, b: { ...two, d: 0.38 } };
    const rest = viewOf(null, ['a', 'b'], places, W, H, undefined, 'a');
    expect(rest.s).toBeGreaterThan(1.5);
    // Without whom it rests on (a lesson's), the whole stage.
    expect(viewOf(null, ['a', 'b'], places, W, H).s).toBe(1);
    // Two together with both faces in the frame, or the one alone.
    const both = tallTwo(one, two, W, H);
    expect(figureShare(one.h, both.s, H)).toBeGreaterThanOrEqual(
      TALL_FIGURE_LEAST - 1e-9,
    );
  });
});

describe('the tall shot check', () => {
  const tallScene = (): SceneDto => {
    const { script } = marketNewsStaged();
    return voiced(script, [], {}, {}, { stands: true, shape: 'tall' }).scene;
  };

  it('finds nothing wrong with the market piece: every shot a medium or closer, faces in the safe box', () => {
    expect(tallShotFaults(tallScene())).toEqual([]);
  });

  it('fails a shot where the key character is below the floor: the whole stage, far off', () => {
    const scene = tallScene();
    // The camera left at rest on no one (as a stage with no focus would):
    // the whole stage, the key character far below a medium.
    const far: SceneDto = {
      ...scene,
      steps: scene.steps.map((step) => ({ ...step, focus: null })),
      effects: scene.effects.filter((e) => e.do !== 'zoom'),
    };
    const faults = tallShotFaults(far).filter((f) => f.kind === 'far');
    expect(faults.length).toBeGreaterThan(0);
    expect(faults[0].least!).toBeLessThan(TALL_FIGURE_LEAST);
  });

  it('checks nothing on a wide film', () => {
    const { script } = marketNewsStaged();
    const { scene } = voiced(script, [], {}, {}, { stands: true });
    expect(tallShotFaults(scene)).toEqual([]);
  });
});

describe('a painted set on a tall frame', () => {
  const painted: GatedDrawing = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#88ccee"/><g id="ground"><rect y="600" width="1600" height="300" fill="#aa8844"/></g></svg>',
    viewBox: [0, 0, 1600, 900],
    aspect: 16 / 9,
    parts: { ground: 'ground' },
    labels: {},
    states: {},
    moves: false,
    callouts: [],
    field: null,
  };

  it('is laid whole at the world’s scale, its people’s ground where a tall frame stands people, and extended above and below', async () => {
    const px = (colour: [number, number, number], rows: number) => ({
      cols: 64,
      rows,
      rgba: Buffer.from(
        Array.from({ length: 64 * rows }, () => [...colour, 255]).flat(),
      ),
    });
    const render = () =>
      Promise.resolve({
        ground: [
          {
            ...px([136, 204, 238], 36),
            rgba: Buffer.concat([
              px([136, 204, 238], 18).rgba,
              px([170, 136, 68], 18).rgba,
            ]),
          },
        ],
      });
    const tall = await extendedTall(
      painted,
      render as unknown as Parameters<typeof extendedTall>[1],
    );
    expect(tall?.viewBox).toEqual([0, 0, 900, 1600]);
    expect(tall?.svg).toMatch(/fill="#88ccee"/);
    expect(tall?.svg).toMatch(/fill="#aa8844"/);
    // At the world's scale: 1600 across, centred; its feet (820) at 1300.
    expect(tall?.svg).toMatch(
      /<svg x="-350" y="480" width="1600" height="900"/,
    );
  });

  it('stands a story whose set has a piece the artist drew in that set laid whole, never the wide set cropped', async () => {
    const [scene] = await composeNativity([0], undefined, 'tall');
    const set = scene.scene.things.find(
      (t) => t.kind === 'drawing' && t.backdrop,
    );
    expect(set?.kind === 'drawing' && set.svg).toMatch(
      /viewBox="0 0 900 1600"/,
    );
  }, 60_000);
});
