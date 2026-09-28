import type {
  SceneEffectDto,
  ScenePlaceDto,
  SceneStepDto,
} from '../../contracts';
import {
  PARALLAX,
  againstScenery,
  apart,
  hurried,
  settledOf,
  viewOf,
  withoutJumps,
} from './scene-film';

const W = 1600;
const H = 900;

/** Someone standing on the wide stage, their left edge at `x`. */
const at = (x: number, w = 200): ScenePlaceDto => ({ x, y: 300, w, h: 500 });

const step = (
  atMs: number,
  show: string[],
  enter: SceneStepDto['enter'] = {},
): SceneStepDto => ({
  atMs,
  layout: 'row',
  show,
  arrows: [],
  enter,
  focus: null,
});

const line = (startMs: number, endMs: number) => ({
  text: 'Hello.',
  startMs,
  endMs,
  words: [],
});

type Settling = Parameters<typeof settledOf>[0];

/** Maya and Tobi talk; Tobi walks off to the right after the last line. */
const talk = (more: Partial<Settling> = {}): Settling => ({
  beats: [line(400, 3000), line(3500, 6000)],
  durationMs: 6300,
  steps: [
    step(0, ['maya', 'tobi'], {
      maya: { how: 'fade' },
      tobi: { how: 'fade' },
    }),
    step(6200, ['maya']),
  ],
  effects: [],
  acting: { maya: { walks: true }, tobi: { walks: true } },
  stagings: {
    box: { w: 1200, h: 900, places: [{}, {}] },
    wide: {
      w: W,
      h: H,
      places: [{ maya: at(500), tobi: at(1100) }, { maya: at(500) }],
    },
  },
  ...more,
});

describe("a film's scene, settled", () => {
  it('holds until whoever walks off is off: past the voice, when it stopped short', () => {
    // Tobi, right of centre, walks off the right side: 504 of 1600, a
    // walk of 1.64 s (5.2 s a stage) from 6.2 s.
    expect(settledOf(talk())).toBe(6200 + 1638);
  });

  it('waits for the last acting move, cheer and bubble, and is never before the last word', () => {
    expect(
      settledOf(
        talk({
          acting: {
            maya: { walks: true, moves: [[6500, 'laugh', 1500]] },
            tobi: { walks: true },
          },
        }),
      ),
    ).toBe(8000);
    expect(
      settledOf(
        talk({
          setting: { crowd: { id: '@crowd', moves: [[7000, 'cheer', 1400]] } },
        }),
      ),
    ).toBe(8400);
    const said: SceneEffectDto = {
      atMs: 3500,
      target: 'maya',
      part: null,
      do: 'say',
      say: { id: 's1', text: 'Hello.', untilMs: 9000 },
    };
    expect(settledOf(talk({ effects: [said] }))).toBe(9000);
    // Nothing after the words: the last word.
    expect(
      settledOf(talk({ steps: [talk().steps[0]], durationMs: 6000 })),
    ).toBe(6000);
  });

  it('waits for someone to be down, sitting or lying, not for as long as they stay so', () => {
    const sat = (move: 'sit' | 'lie' | 'laugh') =>
      settledOf(
        talk({
          steps: [talk().steps[0]],
          durationMs: 6000,
          acting: {
            maya: { walks: true, moves: [[5800, move, 4000]] },
            tobi: { walks: true },
          },
        }),
      );
    expect(sat('sit')).toBe(5800 + 500);
    expect(sat('lie')).toBe(5800 + 500);
    expect(sat('laugh')).toBe(9800);
  });

  it('waits for a thing handled at the end to be done with: the drink after the lips', () => {
    const cup = {
      id: 'cup',
      svg: '',
      viewBox: [0, 0, 1, 1] as [number, number, number, number],
      grip: [0, 0] as [number, number],
      mouth: [0, 0] as [number, number],
      near: 'maya',
      does: [[8000, 'maya', 'drink']] as [number, string, 'drink'][],
    };
    // Its moment halfway through a drink of 1.8 s: done at 8.9 s.
    expect(settledOf(talk({ props: [cup] }))).toBe(8900);
  });

  it('counts one who leaves without walking by how long they take to go', () => {
    const still = talk({
      acting: {},
      steps: [talk().steps[0], step(6200, [])],
    });
    expect(settledOf(still)).toBe(6200 + 380);
  });
});

describe('a walk in time for what comes next', () => {
  /** Mama walks back to the cup at 1 s, from 1200 to 100 across: then takes it up, as `take` has it. */
  const fetch = (
    take: number,
    walks = true,
  ): Parameters<typeof hurried>[0] => ({
    steps: [step(0, ['mama']), step(1000, ['mama'])],
    acting: { mama: walks ? { walks } : {} },
    props: [
      {
        id: 'cup',
        does: [[take, 'mama', 'take']],
      } as never,
    ],
    stagings: {
      box: { w: 1200, h: 900, places: [{}, {}] },
      wide: {
        w: W,
        h: H,
        places: [{ mama: at(1200) }, { mama: at(100) }],
      },
    },
  });

  it('leaves a walk with the time it takes as it is', () => {
    const steps = hurried(fetch(6000));
    expect(steps[1]).toEqual(step(1000, ['mama']));
  });

  it('hurries one who would take the cup before reaching it, briskly or at a run', () => {
    // The walk takes 3.58 s (5.2 s a stage); the hand goes to the cup at
    // 3.54 s. She sets off as soon as the step before has settled (0.7 s),
    // then goes briskly.
    const brisk = hurried(fetch(4090))[1];
    expect(brisk.atMs).toBe(700);
    expect(brisk.pace).toBeUndefined();
    expect(brisk.hurry?.mama).toBeGreaterThan(1);
    expect(brisk.hurry?.mama).toBeLessThanOrEqual(1.35);
    // Given no more than a second, it is a run.
    expect(hurried(fetch(1900))[1].pace).toEqual({ mama: 'run' });
    // One who does not walk (a figure that pops) is left alone.
    expect(hurried(fetch(1900, false))[1]).toEqual(step(1000, ['mama']));
  });

  /** Maya and Mama talk; after a line ending at 4 s, Mama walks back to the cup and takes it up, her hand going to it at `reach`. */
  const afterLine = (
    reach: number,
    mouths: Record<string, [number, string][]> = {},
  ): Parameters<typeof hurried>[0] => ({
    steps: [step(0, ['maya', 'mama']), step(4000, ['maya', 'mama'])],
    acting: {
      maya: { walks: true, mouth: mouths.maya ?? [] },
      mama: { walks: true, mouth: mouths.mama ?? [] },
    },
    props: [{ id: 'cup', does: [[reach + 550, 'mama', 'take']] } as never],
    stagings: {
      box: { w: 1200, h: 900, places: [{}, {}] },
      wide: {
        w: W,
        h: H,
        places: [
          { maya: at(700), mama: at(1200) },
          { maya: at(700), mama: at(100) },
        ],
      },
    },
  });
  /** Someone speaking from `from` to `to`: their mouth's shapes, 30 a second. */
  const says = (from: number, to: number): [number, string][] => [
    [from, '3'.repeat(((to - from) * 30) / 1000)],
  ];

  it('sets a walk off early, into the end of the line before, rather than hurry it', () => {
    // The walk takes 3.58 s; from 4 s, her hand would reach the cup 0.6 s
    // too soon. Maya says the line: Mama sets off 0.6 s into its end, at
    // her own pace.
    const early = hurried(afterLine(6825, { maya: says(2000, 4000) }))[1];
    expect(early.atMs).toBe(3400);
    expect(early.hurry).toBeUndefined();
    expect(early.pace).toBeUndefined();
    // Never more than a second early: given less, she hurries the rest.
    const soon = hurried(afterLine(5643))[1];
    expect(soon.atMs).toBe(3000);
    expect(soon.hurry?.mama).toBeGreaterThan(1);
  });

  it('never sets a walk off while its walker is still speaking, and runs past a third quicker', () => {
    // Mama says the line herself, to 3.8 s: she sets off only then.
    const after = hurried(afterLine(6705, { mama: says(2000, 3800) }))[1];
    expect(after.atMs).toBe(3800);
    expect(after.hurry?.mama).toBeCloseTo(1.18, 2);
    // Speaking to the step, she cannot go early; half as quick again is a run.
    const run = hurried(afterLine(6233, { mama: says(2000, 4000) }))[1];
    expect(run.atMs).toBe(4000);
    expect(run.pace).toEqual({ mama: 'run' });
  });

  it('settles a hurried walk as sooner done', () => {
    const scene = {
      ...fetch(4090),
      props: [],
      beats: [line(0, 500)],
      durationMs: 1000,
      effects: [],
    };
    const steps = hurried(fetch(4090));
    expect(settledOf({ ...scene, steps })).toBeLessThan(settledOf(scene));
  });
});

describe('where a shot looks, and a jump cut', () => {
  const places = { maya: at(820), tobi: at(600), mama: at(1300) };
  const show = ['maya', 'tobi', 'mama'];
  const shot = (target: string, part: string | null = null) => ({
    target,
    part,
  });

  it('frames one from the chest up, two from the knees up, and the whole stage', () => {
    expect(viewOf(null, show, places, W, H)).toEqual({ s: 1, x: 800, y: 450 });
    expect(viewOf(shot('tobi'), show, places, W, H)).toEqual({
      s: 2,
      x: 700,
      y: 450,
    });
    const two = viewOf(shot('tobi', 'maya'), show, places, W, H);
    expect(two.s).toBeCloseTo(1.8);
    expect(two.x).toBe(810);
    // Someone not there: the whole stage.
    expect(viewOf(shot('pip'), show, places, W, H).s).toBe(1);
  });

  it('shows the stage’s people larger against the scenery close in, and across it, as the player moves the two', () => {
    const view = viewOf(shot('mama'), show, places, W, H);
    const { k, at: against } = againstScenery(view, W, H);
    const far = 1 + (view.s - 1) * PARALLAX;
    expect(k).toBeCloseTo(view.s / far);
    // The player: each layer scaled about one point, the scenery by less.
    const c = (W / 2 - view.s * view.x) / (1 - view.s);
    const onScreen = (x: number, s: number) => c * (1 - s) + s * x;
    for (const x of [0, 700, 1400]) {
      const [sx] = against(x, 450);
      expect(onScreen(sx, far)).toBeCloseTo(onScreen(x, view.s));
    }
    // On the whole stage, where they stand.
    expect(
      againstScenery(viewOf(null, show, places, W, H), W, H).at(300, 200),
    ).toEqual([300, 200]);
  });

  it('calls a cut between two framings too alike a jump', () => {
    const view = (target: string, part: string | null = null) =>
      viewOf(shot(target, part), show, places, W, H);
    // The two of them, then one of the two: barely closer, barely across.
    expect(apart(view('tobi', 'maya'), view('tobi'), W, H)).toBe(false);
    // One, then someone across the stage; close, then the whole stage.
    expect(apart(view('tobi'), view('mama'), W, H)).toBe(true);
    expect(apart(view('tobi'), viewOf(null, show, places, W, H), W, H)).toBe(
      true,
    );
  });

  it('holds the shot on the screen through one too like it, and takes the rest', () => {
    const zoom = (
      atMs: number,
      untilMs: number,
      target: string,
      part: string | null = null,
    ): SceneEffectDto => ({ atMs, untilMs, target, part, do: 'zoom' });
    const wide = { w: W, h: H, places: [places] };
    const steps = [step(0, show)];
    const kept = withoutJumps(
      [
        zoom(2000, 6000, 'tobi', 'maya'),
        // Tobi alone, straight after the two of them: a jump.
        zoom(6000, 9000, 'tobi'),
        // Mama, across the stage: a cut.
        zoom(9000, 12_000, 'mama'),
      ],
      steps,
      wide,
      20_000,
    );
    expect(kept.map((e) => [e.target, e.part, e.atMs, e.untilMs])).toEqual([
      ['tobi', 'maya', 2000, 9000],
      ['mama', null, 9000, 12_000],
    ]);
  });

  it('never takes a shot that is all but the whole stage', () => {
    // Two at the stage's far ends: framed together, they fill it.
    const apartPlaces = { tobi: at(40, 260), mama: at(1300, 260) };
    const kept = withoutJumps(
      [
        {
          atMs: 3000,
          untilMs: 6000,
          target: 'tobi',
          part: 'mama',
          do: 'zoom',
        },
      ],
      [step(0, ['tobi', 'mama'])],
      { w: W, h: H, places: [apartPlaces] },
      10_000,
    );
    expect(kept).toEqual([]);
  });
});
