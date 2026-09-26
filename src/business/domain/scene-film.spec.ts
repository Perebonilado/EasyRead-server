import type {
  SceneEffectDto,
  ScenePlaceDto,
  SceneStepDto,
} from '../../contracts';
import { apart, settledOf, viewOf, withoutJumps } from './scene-film';

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
    // walk of 1.26 s from 6.2 s.
    expect(settledOf(talk())).toBe(6200 + 1260);
  });

  it('waits for the last acting move, cheer and bubble, and is never before the last word', () => {
    expect(
      settledOf(
        talk({
          acting: {
            maya: { walks: true, moves: [[6000, 'laugh', 1500]] },
            tobi: { walks: true },
          },
        }),
      ),
    ).toBe(7500);
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

  it('counts one who leaves without walking by how long they take to go', () => {
    const still = talk({
      acting: {},
      steps: [talk().steps[0], step(6200, [])],
    });
    expect(settledOf(still)).toBe(6200 + 380);
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
