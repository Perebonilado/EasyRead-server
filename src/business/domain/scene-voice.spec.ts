import {
  BEFORE_KEY_S,
  DELIVERY,
  IDEA_CHANGE_S,
  PAUSE_RANGE,
  SLOWEST,
  SPEED_RANGE,
  TURN_S,
  characterVoice,
  deliveryPieces,
  sentenceStarts,
  voiceSlug,
  voiceStyle,
  voicedPieces,
} from './scene-voice';
import type { StoryBible, StoryCharacter } from './scene-story';
import { SCENE_DELIVERIES, SCENE_MOODS, quotedSpans } from './scene-script';

describe('how the voice says each sentence', () => {
  it('gives every tag a pace and a silence inside the bounds', () => {
    for (const delivery of SCENE_DELIVERIES) {
      const [piece] = deliveryPieces([{ delivery, pause: 'short' }]);
      expect(piece.speed).toBeGreaterThanOrEqual(SPEED_RANGE[0]);
      expect(piece.speed).toBeLessThanOrEqual(SPEED_RANGE[1]);
      expect(piece.pauseAfter).toBeGreaterThanOrEqual(PAUSE_RANGE[0]);
      expect(piece.pauseAfter).toBeLessThanOrEqual(PAUSE_RANGE[1]);
    }
  });

  it('slows on the point, quickens on an aside, and waits after a question', () => {
    const [hook, key, aside, question] = deliveryPieces([
      { delivery: 'hook', pause: 'short' },
      { delivery: 'key', pause: 'short' },
      { delivery: 'aside', pause: 'short' },
      { delivery: 'question', pause: 'short' },
    ]);
    expect(key.speed).toBeLessThan(1);
    expect(aside.speed).toBeGreaterThan(1);
    expect(hook.speed).toBeGreaterThan(key.speed);
    expect(question.pauseAfter).toBeGreaterThan(DELIVERY.explain.pause);
  });

  it('leaves a beat of silence before a key point, and more where the idea changes', () => {
    const [before, , changing] = deliveryPieces([
      { delivery: 'explain', pause: 'short' },
      { delivery: 'key', pause: 'short' },
      { delivery: 'explain', pause: 'long' },
    ]);
    expect(before.pauseAfter).toBeGreaterThanOrEqual(BEFORE_KEY_S);
    expect(changing.pauseAfter).toBeCloseTo(
      DELIVERY.explain.pause + IDEA_CHANGE_S,
    );
  });

  it('keeps a long question within the longest silence', () => {
    const [piece] = deliveryPieces([{ delivery: 'question', pause: 'long' }]);
    expect(piece.pauseAfter).toBeLessThanOrEqual(PAUSE_RANGE[1]);
  });

  it('directs a voice that takes direction in a few words, for every mood and tag', () => {
    for (const mood of SCENE_MOODS)
      for (const delivery of SCENE_DELIVERIES) {
        const style = voiceStyle(mood, delivery);
        expect(style.split(';')).toHaveLength(3);
        expect(style.length).toBeLessThan(140);
      }
    expect(voiceStyle('serious', 'key')).toMatch(/sober.*landing the point/);
  });

  it('names a blend of voices so it can go in a file name', () => {
    expect(voiceSlug('af_heart,af_bella')).toBe('af_heart+af_bella');
    expect(voiceSlug('Kore')).toBe('kore');
  });
});

describe("a story's characters, in their own voices", () => {
  const person = (over: Partial<StoryCharacter>): StoryCharacter => ({
    id: 'x',
    name: 'X',
    aliases: [],
    role: 'main',
    look: '',
    traits: [],
    firstPage: 1,
    met: 0,
    voice: null,
    ...over,
  });
  const bible: StoryBible = {
    characters: [
      person({
        id: 'mira',
        name: 'Mira',
        voice: 'girl',
        met: 0,
        traits: ['brave'],
      }),
      person({ id: 'tobi', name: 'Tobi', voice: 'old man', met: 1 }),
      person({ id: 'ember', name: 'Ember', voice: 'creature', met: 2 }),
      person({ id: 'lily', name: 'Lily', voice: 'girl', met: 3 }),
      person({ id: 'crowd', name: 'The crowd', voice: null, met: 4 }),
    ],
    places: [],
    pages: [],
  };
  const at = (id: string) => bible.characters.find((c) => c.id === id)!;

  it("gives each the next voice of their kind in the order met, never the narrator's, the same every time", () => {
    expect(characterVoice(bible, at('mira'), 'kokoro', 'am_puck')?.voice).toBe(
      'af_sky',
    );
    expect(characterVoice(bible, at('lily'), 'kokoro', 'am_puck')?.voice).toBe(
      'af_nova',
    );
    // The narrator speaks in the first creature voice: Ember takes the next.
    expect(
      characterVoice(bible, at('ember'), 'kokoro', 'bm_fable')?.voice,
    ).toBe('am_fenrir');
    expect(
      characterVoice(bible, at('tobi'), 'gemini', 'Sulafat'),
    ).toMatchObject({
      voice: 'Algenib',
      pace: 0.92,
      style: 'as Tobi, an old man, saying their own line',
    });
    expect(characterVoice(bible, at('mira'), 'gemini', 'Sulafat')?.style).toBe(
      'as Mira, a girl, brave, saying their own line',
    );
    // No kind of voice, or a voice with no palette: the narrator says it.
    expect(characterVoice(bible, at('crowd'), 'kokoro', 'am_puck')).toBeNull();
    expect(characterVoice(bible, at('mira'), null, 'alloy')).toBeNull();
  });

  it("parts a sentence at its quotation: the quoted words theirs, the rest the narrator's", () => {
    const speaker = { voice: 'am_fenrir', pace: 1, style: 'as Ember' };
    const pieces = voicedPieces({
      texts: [
        'A fox steps out.',
        '"You are holding the matches upside down," says the fox.',
        'Mira stares.',
      ],
      delivered: [
        { speed: 1, pauseAfter: 0.35 },
        { speed: 1.02, pauseAfter: 0.5 },
        { speed: 1, pauseAfter: 0.4 },
      ],
      styles: ['calm', 'calm', 'calm'],
      lines: [
        [],
        [
          {
            span: quotedSpans(
              '"You are holding the matches upside down," says the fox.',
            )[0],
            speaker,
          },
        ],
        [],
      ],
    });
    expect(pieces).toEqual([
      {
        text: 'A fox steps out.',
        speed: 1,
        pauseAfter: 0.35,
        style: 'calm',
        beat: 0,
      },
      {
        text: '"You are holding the matches upside down,',
        speed: 1.02,
        pauseAfter: TURN_S,
        style: 'as Ember',
        voice: 'am_fenrir',
        beat: 1,
      },
      {
        text: '" says the fox.',
        speed: 1.02,
        pauseAfter: 0.5,
        style: 'calm',
        beat: 1,
      },
      {
        text: 'Mira stares.',
        speed: 1,
        pauseAfter: 0.4,
        style: 'calm',
        beat: 2,
      },
    ]);
    // Every word still said, in order: the times fall on the same words.
    expect(
      pieces
        .map((p) => p.text)
        .join(' ')
        .replace(/[^a-z ]/gi, '')
        .split(/\s+/),
    ).toEqual(
      'A fox steps out You are holding the matches upside down says the fox Mira stares'.split(
        ' ',
      ),
    );
  });

  it('speaks to young learners more slowly, with longer pauses', () => {
    const beats = [
      { delivery: 'explain' as const, pause: 'short' as const },
      { delivery: 'key' as const, pause: 'long' as const },
    ];
    const usual = deliveryPieces(beats);
    const child = deliveryPieces(beats, { pace: 0.9, pause: 1.3 });
    child.forEach((piece, i) => {
      expect(piece.speed).toBeLessThan(usual[i].speed);
      expect(piece.speed).toBeGreaterThanOrEqual(SLOWEST);
      expect(piece.pauseAfter).toBeGreaterThanOrEqual(usual[i].pauseAfter);
    });
    // The same for anyone else as before.
    expect(deliveryPieces(beats, { pace: 1, pause: 1 })).toEqual(usual);
  });

  it('gives two characters in one sentence each their own voice', () => {
    const mira = { voice: 'af_sky', pace: 1.06, style: 'as Mira' };
    const ember = { voice: 'am_fenrir', pace: 1, style: 'as Ember' };
    const text = '"Ready?" asks Mira. "Always," says Ember.';
    const [first, second] = quotedSpans(text);
    const pieces = voicedPieces({
      texts: [text],
      delivered: [{ speed: 1, pauseAfter: 0.5 }],
      styles: ['calm'],
      lines: [
        [
          { span: first, speaker: mira },
          { span: second, speaker: ember },
        ],
      ],
    });
    expect(pieces.map((p) => [p.text, p.voice ?? 'narrator'])).toEqual([
      ['"Ready?', 'af_sky'],
      ['" asks Mira. "', 'narrator'],
      ['Always,', 'am_fenrir'],
      ['" says Ember.', 'narrator'],
    ]);
    expect(pieces[0].speed).toBe(1.06);
    expect(pieces.map((p) => p.pauseAfter)).toEqual([
      TURN_S,
      TURN_S,
      TURN_S,
      0.5,
    ]);
  });

  it('starts each sentence where its first piece does', () => {
    const pieces = [{ beat: 0 }, { beat: 1 }, { beat: 1 }, { beat: 2 }];
    expect(sentenceStarts(pieces, [0, 1200, 3000, 4100], 3)).toEqual([
      0, 1200, 4100,
    ]);
    // A voice that left a piece out: no starts to trust.
    expect(sentenceStarts(pieces, [0, 1200, 4100], 3)).toBeUndefined();
  });
});

describe('a screenplay, as the voice says it', () => {
  it('keeps a conversation close, lets the narrator breathe, and holds the quiet an action takes', () => {
    const pieces = deliveryPieces([
      { delivery: 'explain', pause: 'short', kind: 'narration' },
      { delivery: 'explain', pause: 'short', kind: 'line', holdS: 1 },
      { delivery: 'explain', pause: 'short', kind: 'line', pace: 'quick' },
      { delivery: 'explain', pause: 'short', kind: 'line', pace: 'whisper' },
      { delivery: 'explain', pause: 'short', kind: 'narration', holdS: 5 },
    ]);
    expect(pieces).toEqual([
      { speed: 0.95, pauseAfter: 0.55 },
      // A groan after the line: its second of quiet.
      { speed: 1, pauseAfter: 1 },
      { speed: 1.07, pauseAfter: 0.3 },
      // Before the narrator comes in, a breath more.
      { speed: 0.9, pauseAfter: 0.55 },
      // No quiet longer than the voice holds.
      { speed: 0.95, pauseAfter: 3 },
    ]);
  });
});
