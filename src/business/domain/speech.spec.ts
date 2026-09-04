import { mp3DurationMs, speechTooShort } from './speech';

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
