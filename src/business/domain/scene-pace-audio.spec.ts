import type { SceneDto } from '../../contracts';
import {
  applyPaceEdits,
  planPaceEdits,
  retimeBeats,
  retimeScene,
  timeMapOf,
} from './scene-pace-audio';

const RATE = 24_000;

/** Speech-like sound where each [from, to] in ms says, silence between. */
function voiced(spans: [number, number][], totalMs: number): Int16Array {
  const out = new Int16Array(Math.round((totalMs * RATE) / 1000));
  for (const [a, b] of spans)
    for (
      let i = Math.round((a * RATE) / 1000);
      i < Math.round((b * RATE) / 1000);
      i += 1
    )
      out[i] = Math.round(9000 * Math.sin((2 * Math.PI * 150 * i) / RATE));
  return out;
}

/** Five words of seven syllables: five words of average length (scene-pace paceWords). */
const CYCLE = ['open', 'river', 'stone', 'lake', 'bright'];
const said = (n: number) =>
  Array.from({ length: n }, (_, i) => CYCLE[i % CYCLE.length]).join(' ');

/** A sentence of `n` words evenly over [from, to]. */
function sentence(n: number, from: number, to: number) {
  const each = (to - from) / n;
  const words = Array.from({ length: n }, (_, i) => [
    i * 5,
    i * 5 + 4,
    Math.round(from + i * each),
    Math.round(from + (i + 1) * each - 20),
  ]);
  return {
    text: said(n),
    startMs: from,
    endMs: to,
    words,
  };
}

describe('the voice put right after voicing', () => {
  it('stretches a sentence said too fast to its target, and moves the words with it', () => {
    // Ten words in three seconds: 200 a minute; the target is 160.
    const beats = [sentence(10, 0, 3000), sentence(10, 3400, 6400)];
    const pcm = {
      samples: voiced(
        [
          [0, 3000],
          [3400, 6400],
        ],
        7000,
      ),
      sampleRate: RATE,
    };
    const { edits, notes } = planPaceEdits({
      pcm,
      beats,
      targets: [160, null],
      pauses: [0.4, 0.5],
      trimInside: true,
    });
    expect(notes.stretched).toBe(1);
    const out = applyPaceEdits(pcm, edits);
    const map = timeMapOf(edits, RATE);
    const timed = retimeBeats(beats, map);
    // The first sentence now runs about 3 s × 200/160 (the stretch is held to 14 %).
    expect(timed[0].endMs - timed[0].startMs).toBeGreaterThan(3300);
    expect(timed[0].endMs - timed[0].startMs).toBeLessThanOrEqual(3430);
    // The one after is moved, not changed.
    expect(timed[1].endMs - timed[1].startMs).toBe(3000);
    expect(out.samples.length).toBeGreaterThan(pcm.samples.length);
    expect(
      Math.abs((out.samples.length / RATE) * 1000 - map(7000)),
    ).toBeLessThan(2);
  });

  it('trims a long gap the voice left inside a sentence', () => {
    const beat = sentence(6, 0, 3000);
    // Words 0–2, then a second of silence, then words 3–5.
    beat.words = [
      [0, 4, 0, 300],
      [5, 9, 350, 650],
      [10, 14, 700, 1000],
      [15, 19, 2000, 2300],
      [20, 24, 2350, 2650],
      [25, 29, 2700, 3000],
    ];
    const pcm = {
      samples: voiced(
        [
          [0, 1000],
          [2000, 3000],
        ],
        3500,
      ),
      sampleRate: RATE,
    };
    const { edits, notes } = planPaceEdits({
      pcm,
      beats: [beat],
      targets: [null],
      pauses: [null],
      trimInside: true,
    });
    expect(notes.trimmed).toBe(1);
    const out = applyPaceEdits(pcm, edits);
    // A second of quiet became a quarter of one.
    expect((pcm.samples.length - out.samples.length) / RATE).toBeCloseTo(
      0.75,
      1,
    );
    const map = timeMapOf(edits, RATE);
    expect(map(2000) - map(1000)).toBeLessThan(300);
  });

  it('puts in a pause the voice never left, and cuts one it held too long', () => {
    const beats = [
      sentence(5, 0, 1500),
      sentence(5, 1550, 3000),
      sentence(5, 5000, 6500),
    ];
    const pcm = {
      samples: voiced(
        [
          [0, 1500],
          [1550, 3000],
          [5000, 6500],
        ],
        7000,
      ),
      sampleRate: RATE,
    };
    const { edits, notes } = planPaceEdits({
      pcm,
      beats,
      targets: [null, null, null],
      pauses: [0.6, 0.5, 0.5],
      trimInside: false,
    });
    expect(notes.added).toBe(1);
    expect(notes.shortened).toBe(1);
    const timed = retimeBeats(beats, timeMapOf(edits, RATE));
    expect(timed[1].startMs - timed[0].endMs).toBeGreaterThanOrEqual(550);
    expect(timed[2].startMs - timed[1].endMs).toBeLessThan(700);
    expect(timed[2].startMs - timed[1].endMs).toBeGreaterThanOrEqual(450);
  });

  it('changes nothing in a scene already as planned', () => {
    // Ten words in 3.75 s: 160 a minute, its target.
    const beats = [sentence(10, 0, 3750), sentence(10, 4150, 7900)];
    const pcm = {
      samples: voiced(
        [
          [0, 3750],
          [4150, 7900],
        ],
        8500,
      ),
      sampleRate: RATE,
    };
    const { edits } = planPaceEdits({
      pcm,
      beats,
      targets: [160, 160],
      pauses: [0.4, 0.5],
      trimInside: true,
    });
    expect(edits).toEqual([]);
    expect(applyPaceEdits(pcm, edits)).toBe(pcm);
  });

  it('quickens a whole made scene for a maker’s nudge, pauses kept', () => {
    const beats = [sentence(8, 0, 3000), sentence(8, 3400, 6400)];
    const pcm = {
      samples: voiced(
        [
          [0, 3000],
          [3400, 6400],
        ],
        7000,
      ),
      sampleRate: RATE,
    };
    const { edits } = planPaceEdits({
      pcm,
      beats,
      targets: [null, null],
      pauses: [null, null],
      trimInside: false,
      tempo: 1.06,
    });
    const timed = retimeBeats(beats, timeMapOf(edits, RATE));
    expect(timed[0].endMs).toBe(Math.round(3000 / 1.06));
    expect(timed[1].startMs - timed[0].endMs).toBe(400);
  });
});

describe('a made lesson scene timed again', () => {
  const scene = {
    version: 4,
    generator: 'x',
    title: 't',
    durationMs: 7000,
    timing: 'aligned',
    beats: [
      {
        text: 'a b',
        startMs: 1000,
        endMs: 2000,
        words: [
          [0, 1, 1000, 1400],
          [2, 3, 1500, 2000],
        ],
      },
    ],
    things: [],
    steps: [{ atMs: 800, layout: 'one', show: [], arrows: [], enter: {} }],
    effects: [
      { atMs: 1500, target: 'x', part: null, do: 'point', untilMs: 1900 },
    ],
    sound: { mood: 'calm', music: [{ atMs: 0, state: 'calm' }] },
    stagings: {
      box: { w: 1, h: 1, places: [] },
      wide: { w: 1, h: 1, places: [] },
    },
  } as unknown as SceneDto;

  it('moves its sentences, steps, effects and music with the voice', () => {
    const again = retimeScene(scene, (ms) => ms * 2, 14000)!;
    expect(again.durationMs).toBe(14000);
    expect(again.beats[0]).toMatchObject({ startMs: 2000, endMs: 4000 });
    expect(again.beats[0].words[1]).toEqual([2, 3, 3000, 4000]);
    expect(again.steps[0].atMs).toBe(1600);
    expect(again.effects[0]).toMatchObject({ atMs: 3000, untilMs: 3800 });
    expect(again.sound?.music?.[0].atMs).toBe(0);
  });

  it('is not done to a story’s scene', () => {
    expect(retimeScene({ ...scene, acting: {} }, (ms) => ms, 7000)).toBeNull();
  });
});
