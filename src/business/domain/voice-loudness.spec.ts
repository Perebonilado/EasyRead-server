import {
  CEILING_DBFS,
  CLOSE_LU,
  VOICE_LUFS,
  integratedLufs,
  normaliseLoudness,
  peakDbfs,
} from './voice-loudness';
import type { Pcm } from './wav';

const RATE = 24_000;

/** A sine at `amplitude` (of full scale), `seconds` long. */
function sine(
  hz: number,
  amplitude: number,
  seconds: number,
  rate = RATE,
): Pcm {
  const samples = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i += 1)
    samples[i] = Math.round(
      amplitude * 32767 * Math.sin((2 * Math.PI * hz * i) / rate),
    );
  return { sampleRate: rate, samples };
}

/** A small seeded chance. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Something like a voice: syllables of voiced buzz (a pitch and its
 * harmonics, with a breath of noise) at `level` of full scale, their
 * loudness wandering, with short gaps between words and longer ones
 * between sentences; `peaky` makes a few syllables much louder.
 */
function voice(
  seed: number,
  level: number,
  seconds: number,
  peaky = false,
): Pcm {
  const random = seeded(seed);
  const samples = new Int16Array(Math.round(seconds * RATE));
  let at = Math.round(0.3 * RATE);
  let phase = 0;
  while (at < samples.length) {
    const syllable = Math.round((0.12 + random() * 0.18) * RATE);
    const pitch = 110 + random() * 120;
    const loud =
      level * (0.5 + random() * 0.6) * (peaky && random() < 0.08 ? 3 : 1);
    for (let i = 0; i < syllable && at + i < samples.length; i += 1) {
      const env = Math.sin((Math.PI * i) / syllable);
      phase += (2 * Math.PI * pitch) / RATE;
      let v = 0;
      for (let h = 1; h <= 8; h += 1) v += Math.sin(phase * h) / h;
      v = v * 0.5 + (random() * 2 - 1) * 0.08;
      samples[at + i] = Math.max(
        -32768,
        Math.min(32767, Math.round(v * loud * env * 32767)),
      );
    }
    at +=
      syllable +
      Math.round(
        (random() < 0.15 ? 0.5 + random() * 0.5 : 0.04 + random() * 0.08) *
          RATE,
      );
  }
  return { sampleRate: RATE, samples };
}

describe('voice loudness (BS.1770)', () => {
  it('measures a sine as the standard does', () => {
    // A full-scale 1 kHz sine is −3.01 LUFS; every 20 dB down, 20 LU down.
    expect(integratedLufs(sine(997, 1, 5))!).toBeCloseTo(-3.01, 1);
    expect(integratedLufs(sine(997, 0.1, 5))!).toBeCloseTo(-23.01, 1);
    // At another rate the same.
    expect(integratedLufs(sine(997, 0.1, 5, 48_000))!).toBeCloseTo(-23.01, 1);
    // K-weighting: a low tone counts for less than a mid one, a high one for more.
    expect(integratedLufs(sine(60, 0.1, 5))!).toBeLessThan(-23.5);
    expect(integratedLufs(sine(4000, 0.1, 5))!).toBeGreaterThan(-22.5);
  });

  it('gates silence out: a voice with long pauses measures as the voice', () => {
    const tone = sine(997, 0.1, 4);
    const withGaps = new Int16Array(tone.samples.length * 3);
    withGaps.set(tone.samples, tone.samples.length);
    expect(
      integratedLufs({ sampleRate: RATE, samples: withGaps })!,
    ).toBeCloseTo(-23.01, 0);
    expect(
      integratedLufs({ sampleRate: RATE, samples: new Int16Array(RATE * 3) }),
    ).toBeNull();
    expect(
      integratedLufs({ sampleRate: RATE, samples: new Int16Array(100) }),
    ).toBeNull();
  });

  it('brings five voices of every loudness to within 1 LU of −16, their peaks under −1 dBFS', () => {
    // From a quiet voice (about −31 LUFS) to a hot one that clips (about −10).
    const fixtures = [
      voice(1, 0.15, 20),
      voice(2, 0.22, 25),
      voice(3, 0.35, 18, true),
      voice(4, 0.6, 22, true),
      voice(5, 1.6, 20),
    ];
    for (const pcm of fixtures) {
      const result = normaliseLoudness(pcm);
      const out = result.pcm ?? pcm;
      expect(result.before).not.toBeNull();
      expect(Math.abs(integratedLufs(out)! - VOICE_LUFS)).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs(result.after! - VOICE_LUFS)).toBeLessThanOrEqual(1);
      expect(peakDbfs(out)).toBeLessThanOrEqual(CEILING_DBFS + 0.05);
      expect(out.samples.length).toBe(pcm.samples.length);
    }
  });

  it('leaves a voice already at −16 alone, and one it cannot measure', () => {
    const first = normaliseLoudness(voice(6, 0.3, 20));
    const again = normaliseLoudness(first.pcm!);
    expect(again.gainDb).toBe(0);
    expect(again.pcm).toBeNull();
    expect(Math.abs(again.before! - VOICE_LUFS)).toBeLessThan(CLOSE_LU);
    const silent = normaliseLoudness({
      sampleRate: RATE,
      samples: new Int16Array(RATE * 2),
    });
    expect(silent.pcm).toBeNull();
    expect(silent.before).toBeNull();
  });

  it('never clips, however far it lifts', () => {
    const quiet = voice(7, 0.15, 15, true);
    const { pcm, gainDb } = normaliseLoudness(quiet);
    expect(gainDb).toBeGreaterThan(10);
    let clipped = 0;
    for (const v of pcm!.samples) if (Math.abs(v) >= 32767) clipped += 1;
    expect(clipped).toBe(0);
  });
});
