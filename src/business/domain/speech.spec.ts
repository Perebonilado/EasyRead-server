import {
  joinMp3Pieces,
  mp3DurationMs,
  mp3Frames,
  silentMp3,
  speechTooShort,
} from './speech';

describe('speech that came back short', () => {
  it('reads the playing time off the byte count at the provider rate', () => {
    expect(mp3DurationMs(92_928)).toBeCloseTo(5_808, 0);
    expect(mp3DurationMs(1_587_456)).toBeCloseTo(99_216, 0);
  });

  it('tells a fragment from a page, and never doubts a short line', () => {
    // Page 74: 1040 characters, 5.8 seconds of audio.
    expect(speechTooShort(92_928, 1_040)).toBe(true);
    // A whole page, read slowly: longer than the estimate, never short.
    expect(speechTooShort(1_587_456, 1_489)).toBe(false);
    // Exactly half the estimate is the line.
    expect(speechTooShort(16 * 500 * (1000 / 15) * 0.5 - 1, 500)).toBe(true);
    expect(speechTooShort(16 * 500 * (1000 / 15) * 0.5 + 1, 500)).toBe(false);
    // A one-line bridge is whatever length it is.
    expect(speechTooShort(1_000, 30)).toBe(false);
  });
});

describe('mp3 pieces', () => {
  const shape = {
    version: 2 as const,
    sampleRate: 24000,
    channels: 1 as const,
    bitrateIndex: 12,
    sampleRateIndex: 1,
    channelMode: 3,
  };

  it('writes silence a stream reads back, whole frames long', () => {
    const silence = silentMp3(shape, 550);
    const read = mp3Frames(silence);
    expect(read.shape).toEqual(shape);
    expect(read.durationMs).toBeGreaterThanOrEqual(550);
    expect(read.durationMs).toBeLessThan(550 + 24);
    expect(read.frames).toBe(23);
  });

  it('joins pieces with the pause after each and says where each starts', () => {
    const piece = silentMp3(shape, 480);
    const joined = joinMp3Pieces([
      { audio: piece, pauseAfterS: 0.55 },
      { audio: piece, pauseAfterS: 1 },
    ]);
    const one = mp3Frames(piece).durationMs;
    expect(joined.startsMs[0]).toBe(0);
    expect(joined.startsMs[1]).toBeGreaterThanOrEqual(one + 550);
    expect(joined.startsMs[1]).toBeLessThan(one + 550 + 24);
    expect(joined.durationMs).toBe(mp3Frames(joined.audio).durationMs);
    expect(joined.durationMs).toBeGreaterThanOrEqual(2 * one + 1550);
  });
});
