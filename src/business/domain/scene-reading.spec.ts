import type { SceneDto, ScenePlaceDto, SceneStepDto } from '../../contracts';
import type { SceneScript } from './scene-script';
import {
  ACCENT_APART_MS,
  STAGE_READING,
  keyPhrase,
  readMs,
  readingOf,
  readingRhythm,
  textPacing,
  trimCards,
  windowsOf,
  wordsOnArrival,
} from './scene-reading';

const W = 1600;
const H = 900;

const step = (atMs: number, show: string[]): SceneStepDto => ({
  atMs,
  layout: 'stack',
  show,
  arrows: [],
  enter: {},
  focus: null,
});

const card = (id: string, text: string) =>
  ({ id, kind: 'words', text, style: 'keyword' }) as const;

/** A box on the wide stage, the n-th down. */
const row = (n: number): ScenePlaceDto => ({
  x: 400,
  y: 100 + n * 180,
  w: 800,
  h: 140,
});

/** Words said one each 300 ms from `from` for `ms`. */
const wordsFrom = (from: number, ms: number): number[][] =>
  Array.from({ length: Math.floor(ms / 300) }, (_, i) => [
    0,
    0,
    from + i * 300,
    from + i * 300 + 250,
  ]);

/** A lesson with the steps, things and places given, on both stagings. */
function lesson(input: {
  steps: SceneStepDto[];
  things: SceneDto['things'];
  places: Record<string, ScenePlaceDto>[];
  effects?: SceneDto['effects'];
  durationMs?: number;
  stage?: SceneDto['stage'];
}): SceneDto {
  const durationMs = input.durationMs ?? 20_000;
  return {
    version: 4,
    generator: 'test',
    title: 'A lesson',
    durationMs,
    timing: 'aligned',
    ...(input.stage ? { stage: input.stage } : {}),
    beats: [
      {
        text: 'words',
        startMs: 0,
        endMs: durationMs - 500,
        words: wordsFrom(0, durationMs - 500),
      },
    ],
    things: input.things,
    steps: input.steps,
    effects: input.effects ?? [],
    stagings: {
      wide: {
        w: W,
        h: H,
        places: structuredClone(input.places),
        pills: input.places.map(() => ({})),
      },
      box: {
        w: W,
        h: H,
        places: structuredClone(input.places),
        pills: input.places.map(() => ({})),
      },
    },
  } as unknown as SceneDto;
}

describe('reading windows (Ask 3 B)', () => {
  it('reads at the pace of whom it is for: a moment to find the words, then each word, never under 1.2 s', () => {
    expect(readMs(1, 200)).toBe(1200);
    expect(readMs(10, 200)).toBe(3400);
    expect(readMs(10, 60)).toBe(10_400);
    expect(readingOf({ stage: 'early' }).wpm).toBe(130);
    expect(readingOf({}).wpm).toBe(200);
    expect(
      readingOf({ reading: { wpm: 60, motion: 0.75 }, stage: 'higher' }).wpm,
    ).toBe(60);
  });

  it("gives each text the client's window: from when it comes up until it is read", () => {
    const scene = lesson({
      steps: [step(1000, ['a']), step(2500, ['a', 'b'])],
      things: [card('a', 'Energy store'), card('b', 'Heat')],
      places: [{ a: row(0) }, { a: row(0), b: row(1) }],
    });
    expect(wordsOnArrival(scene.things[0])).toBe(2);
    const windows = windowsOf(scene);
    expect(windows).toEqual([
      { id: 'a', from: 1000, to: 1000 + 520 + 1200, words: 2 },
      { id: 'b', from: 2500, to: 2500 + 520 + 1200, words: 1 },
    ]);
    // A young child's entrance is slower, and their reading.
    const young = windowsOf({ ...scene, reading: { wpm: 60, motion: 0.75 } });
    expect(young[0].to).toBe(1000 + 650 + readMs(2, 60));
  });
});

describe('textPacing: what comes too fast, fixed by code', () => {
  it('shows four keyword cards that come a second apart two at a time for a young child', () => {
    const scene = lesson({
      stage: 'early',
      reading: undefined,
      steps: [
        step(1000, ['a']),
        step(2000, ['a', 'b']),
        step(3000, ['a', 'b', 'c']),
        step(4000, ['a', 'b', 'c', 'd']),
        step(12_000, ['a', 'b', 'c', 'd']),
      ],
      things: [
        card('a', 'Sun'),
        card('b', 'Water'),
        card('c', 'Air'),
        card('d', 'Soil'),
      ],
      places: [
        { a: row(0) },
        { a: row(0), b: row(1) },
        { a: row(0), b: row(1), c: row(2) },
        { a: row(0), b: row(1), c: row(2), d: row(3) },
        { a: row(0), b: row(1), c: row(2), d: row(3) },
      ],
    } as never);
    const notes = textPacing(scene, { wpm: 60, motion: 0.75 });
    expect(notes.join(' ')).toMatch(/two at a time/);
    // Two by two: the first two at the first's time, the next two at the third's.
    expect(scene.steps.map((s) => s.show.length)).toEqual([2, 4, 4]);
    expect(scene.steps.map((s) => s.atMs)).toEqual([1000, 3000, 12_000]);
    expect(scene.stagings.wide.places).toHaveLength(3);
    expect(scene.stagings.box.places[1]).toHaveProperty('d');
  });

  it('puts off a stage change that would take a card away while it is still read, to the next word after', () => {
    const scene = lesson({
      steps: [step(1000, ['a']), step(1800, ['b']), step(9000, ['c'])],
      things: [
        card('a', 'The water cycle keeps going'),
        card('b', 'Evaporation'),
        card('c', 'Rain'),
      ],
      places: [{ a: row(0) }, { b: row(0) }, { c: row(0) }],
      effects: [{ atMs: 2000, target: 'b', part: null, do: 'pulse' }],
    });
    const read = windowsOf(scene)[0].to;
    expect(read).toBeGreaterThan(1800);
    textPacing(scene, STAGE_READING.higher);
    const moved = scene.steps[1].atMs;
    expect(moved).toBeGreaterThanOrEqual(read);
    // At the start of a word.
    expect(scene.beats[0].words.some((w) => w[2] === moved)).toBe(true);
    // What the voice did to the card meanwhile waits with it.
    expect(scene.effects[0].atMs).toBe(moved);
    expect(readingRhythm(scene).readLeftMs).toBeGreaterThanOrEqual(0);
  });

  it('leaves a change it cannot put off far enough alone, and says the text is taken too soon', () => {
    const scene = lesson({
      steps: [step(1000, ['a']), step(1800, ['b']), step(2400, ['c'])],
      things: [
        card('a', 'The water cycle keeps going'),
        card('b', 'Evaporation'),
        card('c', 'Rain'),
      ],
      places: [{ a: row(0) }, { b: row(0) }, { c: row(0) }],
    });
    textPacing(scene, STAGE_READING.higher);
    expect(scene.steps[1].atMs).toBe(1800);
    expect(readingRhythm(scene).readLeftMs!).toBeLessThan(0);
  });

  it('spaces accents one at a time, but for a thing and its own label', () => {
    const scene = lesson({
      steps: [step(1000, ['a', 'b'])],
      things: [card('a', 'Sun'), card('b', 'Water')],
      places: [{ a: row(0), b: row(1) }],
      effects: [
        { atMs: 5000, target: 'a', part: null, do: 'pulse' },
        { atMs: 5100, target: 'a', part: null, do: 'pulse' },
        { atMs: 5200, target: 'b', part: null, do: 'pulse' },
        { atMs: 5300, target: 'b', part: null, do: 'pulse', filler: true },
      ],
    });
    textPacing(scene, STAGE_READING.higher);
    const times = scene.effects.map((e) => [e.target, e.atMs]);
    // Every accent on the other thing waits until 600 ms after the last on this one.
    expect(times).toEqual([
      ['a', 5000],
      ['a', 5100],
      ['b', 5100 + ACCENT_APART_MS],
      ['b', 5100 + ACCENT_APART_MS],
    ]);
  });

  it('leaves a story alone', () => {
    const scene = lesson({
      steps: [step(1000, ['a']), step(1400, ['b'])],
      things: [card('a', 'Sun'), card('b', 'Water')],
      places: [{ a: row(0) }, { b: row(0) }],
      effects: [
        {
          atMs: 1,
          target: 'a',
          part: null,
          do: 'say',
          say: { id: 's', text: 'hi', untilMs: 2 },
        },
      ],
    });
    expect(textPacing(scene)).toEqual([]);
    expect(scene.steps[1].atMs).toBe(1400);
  });

  it('is the same every time', () => {
    const make = () =>
      lesson({
        steps: [step(1000, ['a']), step(1800, ['b']), step(9000, ['c'])],
        things: [
          card('a', 'The water cycle keeps going'),
          card('b', 'Evaporation'),
          card('c', 'Rain'),
        ],
        places: [{ a: row(0) }, { b: row(0) }, { c: row(0) }],
      });
    const one = make();
    const two = make();
    textPacing(one);
    textPacing(two);
    expect(one).toEqual(two);
  });
});

describe('keyword cards cut to what is read at a glance', () => {
  it('keeps the key noun phrase', () => {
    expect(keyPhrase('Photosynthesis: how plants make food', 3)).toBe(
      'Photosynthesis',
    );
    expect(keyPhrase('The water cycle never stops', 3)).toBe('water cycle');
    expect(keyPhrase('Supply and demand', 3)).toBe('Supply and demand');
    expect(keyPhrase('Red blood cells carry oxygen around the body', 5)).toBe(
      'Red blood cells',
    );
    expect(keyPhrase('Energy', 2)).toBe('Energy');
  });

  it("cuts a script's keyword cards, never its titles", () => {
    const script = {
      cast: [
        {
          id: 'k',
          kind: 'words',
          text: 'The water cycle never stops',
          style: 'keyword',
        },
        {
          id: 't',
          kind: 'words',
          text: 'Where does all the rain come from',
          style: 'title',
        },
      ],
    } as unknown as SceneScript;
    const cut = trimCards(script, 3);
    expect(cut.cast.map((c) => (c as { text: string }).text)).toEqual([
      'water cycle',
      'Where does all the rain come from',
    ]);
    expect(trimCards(script, undefined)).toBe(script);
  });
});
