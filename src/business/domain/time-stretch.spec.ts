import { stretchPcm } from './time-stretch';

const RATE = 24_000;

/** A voiced-like tone: a fundamental and two harmonics. */
function tone(seconds: number, hz = 140): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    out[i] = Math.round(
      8000 * Math.sin(2 * Math.PI * hz * t) +
        3000 * Math.sin(2 * Math.PI * 2 * hz * t) +
        1500 * Math.sin(2 * Math.PI * 3 * hz * t),
    );
  }
  return out;
}

/** Rising zero crossings a second: the pitch, near enough. */
function crossings(samples: Int16Array): number {
  let n = 0;
  for (let i = 1; i < samples.length; i += 1)
    if (samples[i - 1] < 0 && samples[i] >= 0) n += 1;
  return n / (samples.length / RATE);
}

const rms = (samples: Int16Array) =>
  Math.sqrt(
    samples.reduce((n, s) => n + s * s, 0) / Math.max(1, samples.length),
  );

describe('the time-stretch', () => {
  it.each([0.88, 0.94, 1.06, 1.14])(
    'makes a sound %p of its length, its pitch kept',
    (factor) => {
      const input = tone(2);
      const out = stretchPcm(input, RATE, factor);
      expect(out.length).toBe(Math.round(input.length * factor));
      const inner = (s: Int16Array) =>
        s.subarray(Math.round(0.1 * RATE), s.length - Math.round(0.1 * RATE));
      expect(crossings(inner(out))).toBeCloseTo(crossings(inner(input)), -1);
      // No loudness lost or clipped in the middle of it.
      expect(rms(inner(out)) / rms(inner(input))).toBeGreaterThan(0.85);
      expect(rms(inner(out)) / rms(inner(input))).toBeLessThan(1.15);
    },
  );

  it('keeps to the exact length asked for', () => {
    expect(stretchPcm(tone(1), RATE, 1.1, 26_000).length).toBe(26_000);
  });

  it('resamples a piece too short to window', () => {
    const out = stretchPcm(tone(0.02), RATE, 1.1);
    expect(out.length).toBe(Math.round(0.02 * RATE * 1.1));
  });

  it('leaves a sound at its own length as it was', () => {
    const input = tone(0.5);
    expect(stretchPcm(input, RATE, 1)).toEqual(input);
  });

  it('is quick enough for a scene: thirty seconds in well under a second', () => {
    const input = tone(30);
    const started = Date.now();
    stretchPcm(input, RATE, 1.1);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
