import {
  MUSIC_MOST_CHANGES,
  moodMusic,
  paletteOf,
  placeMusic,
} from './scene-music';
import type { SceneMusic } from './scene-script';

/** Sentences four seconds apart, each three long, with the writer's music on some. */
const sentences = (
  music: Record<number, SceneMusic | [SceneMusic, 'high']>,
  count: number,
) =>
  Array.from({ length: count }, (_, k) => {
    const said = music[k];
    return {
      startMs: k * 4000,
      endMs: k * 4000 + 3000,
      ...(Array.isArray(said)
        ? { music: said[0], energy: said[1] }
        : said
          ? { music: said }
          : {}),
    };
  });

const place = (
  beats: ReturnType<typeof sentences>,
  more: Partial<Parameters<typeof placeMusic>[0]> = {},
) =>
  placeMusic({
    beats,
    mood: 'calm',
    steps: [],
    things: [],
    durationMs: beats.length * 4000,
    ...more,
  });

describe('where the music changes on a page', () => {
  it('starts from the mood, and a serious page is calm (in its minor colour)', () => {
    expect(place(sentences({}, 5))).toEqual([{ atMs: 0, state: 'calm' }]);
    expect(place(sentences({}, 5), { mood: 'curious' })).toEqual([
      { atMs: 0, state: 'curious' },
    ]);
    expect(moodMusic('serious')).toBe('calm');
    expect(place([], { mood: 'bright' })).toEqual([
      { atMs: 0, state: 'bright' },
    ]);
  });

  it("changes on the writer's sentence, and carries the change on", () => {
    expect(place(sentences({ 0: 'curious', 4: 'motion' }, 9))).toEqual([
      { atMs: 0, state: 'curious' },
      { atMs: 16000, state: 'motion' },
    ]);
  });

  it('folds a state too short to be heard as one into its neighbour', () => {
    // Bright for one sentence (4 s) between two long calms: it goes.
    expect(place(sentences({ 4: 'bright', 5: 'calm' }, 10))).toEqual([
      { atMs: 0, state: 'calm' },
    ]);
    // A short opening folds into what follows it.
    expect(place(sentences({ 0: 'bright', 2: 'motion' }, 8))).toEqual([
      { atMs: 0, state: 'motion' },
    ]);
  });

  it('lets a death told in one sentence stay solemn a while, not be lost', () => {
    // Solemn for one sentence: it takes the sentences after it until it is
    // long enough to be heard, and the calm comes back after.
    expect(place(sentences({ 4: 'solemn', 5: 'calm' }, 10))).toEqual([
      { atMs: 0, state: 'calm' },
      { atMs: 16000, state: 'solemn' },
      { atMs: 28000, state: 'calm' },
    ]);
  });

  it('turns a flurry of short changes into its strongest feeling', () => {
    // As the writer once did on the race to the South Pole: a sentence of
    // each at the end, grief among them.
    const cues = place(
      sentences(
        {
          0: 'curious',
          8: 'bright',
          9: 'curious',
          10: 'bright',
          11: 'calm',
          12: 'solemn',
          13: 'calm',
        },
        16,
      ),
    );
    expect(cues).toEqual([
      { atMs: 0, state: 'curious' },
      { atMs: 32000, state: 'bright' },
      { atMs: 44000, state: 'solemn' },
    ]);
  });

  it('keeps an opening before a working, when it is long enough to hear', () => {
    const cues = place(sentences({}, 12), {
      mood: 'curious',
      steps: [
        { atMs: 0, show: ['title'] },
        { atMs: 8000, show: ['working'] },
      ],
      things: [{ id: 'title' }, { id: 'working', source: 'math' }],
    });
    expect(cues).toEqual([
      { atMs: 0, state: 'curious' },
      { atMs: 8000, state: 'none' },
    ]);
  });

  it('changes at most three times on a page', () => {
    const cues = place(
      sentences(
        { 0: 'calm', 3: 'curious', 6: 'motion', 9: 'bright', 12: 'solemn' },
        15,
      ),
    );
    expect(cues.length - 1).toBeLessThanOrEqual(MUSIC_MOST_CHANGES);
    expect(cues[0]).toEqual({ atMs: 0, state: 'calm' });
  });

  it('keeps energy only where the music can run high, until the music changes', () => {
    expect(
      place(sentences({ 0: 'calm', 3: ['motion', 'high'], 6: 'motion' }, 9)),
    ).toEqual([
      { atMs: 0, state: 'calm' },
      { atMs: 12000, state: 'motion', energy: 'high' },
      { atMs: 24000, state: 'motion' },
    ]);
    // Solemn never runs high.
    expect(place(sentences({ 0: ['solemn', 'high'] }, 4))).toEqual([
      { atMs: 0, state: 'solemn' },
    ]);
  });

  it('leaves a working or a passage in quiet while it is on the stage', () => {
    const cues = place(sentences({}, 10), {
      mood: 'curious',
      steps: [
        { atMs: 0, show: ['title'] },
        { atMs: 12000, show: ['working'] },
        { atMs: 28000, show: ['title'] },
      ],
      things: [{ id: 'title' }, { id: 'working', source: 'math' }],
    });
    expect(cues).toEqual([
      { atMs: 0, state: 'curious' },
      { atMs: 12000, state: 'none' },
      { atMs: 28000, state: 'curious' },
    ]);
  });

  it('keeps the music under a working shown too briefly to fade for', () => {
    const cues = place(sentences({}, 10), {
      steps: [
        { atMs: 0, show: ['title'] },
        { atMs: 12000, show: ['graph'] },
        { atMs: 16000, show: ['title'] },
      ],
      things: [{ id: 'title' }, { id: 'graph', source: 'plot' }],
    });
    expect(cues).toEqual([{ atMs: 0, state: 'calm' }]);
  });

  it('stays out between two workings rather than coming back for a moment', () => {
    const cues = place(sentences({}, 14), {
      steps: [
        { atMs: 0, show: ['title'] },
        { atMs: 12000, show: ['working'] },
        { atMs: 24000, show: ['title'] },
        { atMs: 36000, show: ['working'] },
      ],
      things: [{ id: 'title' }, { id: 'working', source: 'math' }],
    });
    // The 12 s between the two workings stay quiet: one quiet from 12 s on.
    expect(cues).toEqual([
      { atMs: 0, state: 'calm' },
      { atMs: 12000, state: 'none' },
    ]);
  });

  it("keeps a chart's or a timeline's music: its numbers are shown, not worked", () => {
    const cues = place(sentences({}, 10), {
      steps: [{ atMs: 0, show: ['chart'] }],
      things: [{ id: 'chart', source: 'chart' }],
    });
    expect(cues).toEqual([{ atMs: 0, state: 'calm' }]);
  });

  it("holds the music to the book's tone", () => {
    expect(
      place(sentences({ 0: 'tense' }, 5), { tone: 'light' })[0].state,
    ).toBe('curious');
    expect(
      place(sentences({ 0: 'playful' }, 5), { tone: 'serious' })[0].state,
    ).toBe('calm');
    expect(
      place(sentences({ 0: 'tense' }, 5), { tone: 'serious' })[0].state,
    ).toBe('tense');
  });

  it("makes one quiet of the writer's and a working's", () => {
    const cues = place(sentences({ 0: 'calm', 3: 'none' }, 10), {
      steps: [
        { atMs: 0, show: ['a'] },
        { atMs: 20000, show: ['working'] },
      ],
      things: [{ id: 'a' }, { id: 'working', source: 'quote' }],
    });
    expect(cues).toEqual([
      { atMs: 0, state: 'calm' },
      { atMs: 12000, state: 'none' },
    ]);
  });
});

describe("a document's instruments", () => {
  it("are a story's for fiction, drama and any story, verse for poetry, else a lesson's", () => {
    expect(paletteOf(null)).toBe('lesson');
    expect(paletteOf({ kind: 'textbook' })).toBe('lesson');
    expect(paletteOf({ kind: 'fiction' })).toBe('story');
    expect(paletteOf({ kind: 'drama' })).toBe('story');
    expect(paletteOf({ kind: 'other', story: true })).toBe('story');
    expect(paletteOf({ kind: 'poetry' })).toBe('verse');
  });
});
