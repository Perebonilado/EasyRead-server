/**
 * A scene's voice made as loud as every other scene's (studio-explainer-
 * plan, Ask 6 §2): measured as broadcast loudness is (ITU-R BS.1770-4,
 * integrated, in LUFS: K-weighted, 400 ms blocks, gated at −70 LUFS and
 * 10 LU under the mean), brought to about −16 LUFS by one gain, and its
 * few peaks held under −1 dBFS by a look-ahead limiter so the gain never
 * clips. Once per scene, after voicing (scene.processor paceVoice), so the
 * player's music and effects (tuned against a −16 voice) always sit where
 * they were set, whatever voice spoke.
 *
 * Why in code and not ffmpeg's `loudnorm`: ffmpeg is not on the worker
 * (time-stretch.ts); echogarden's own copy only decodes. A voice is one
 * steady speaker, so the linear gain `loudnorm` would choose in its second
 * pass is what this applies.
 *
 * Pure: samples in, samples out.
 */
import type { Pcm } from './wav';

/** Where every scene's voice is brought to, in LUFS. */
export const VOICE_LUFS = -16;
/** The highest a sample may reach after the gain, in dBFS. */
export const CEILING_DBFS = -1;
/** Within this of the target, the voice is left as it came (and not encoded again). */
export const CLOSE_LU = 0.5;
/** The most the gain moves a voice either way, in dB: a voice further off is a fault, not a level. */
export const MOST_GAIN_DB = 15;

const BLOCK_S = 0.4;
const STEP_S = 0.1;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

/** One biquad's coefficients (a0 = 1). */
interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** BS.1770's K-weighting at any rate: a high shelf (the head) then a high pass (RLB), as libebur128 derives them. */
function kWeighting(rate: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const pass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [shelf, pass];
}

function filter(input: Float64Array, f: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i];
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

const loudnessOf = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

/** A voice's integrated loudness, in LUFS; null for one too short or too quiet to measure. */
export function integratedLufs(pcm: Pcm): number | null {
  const { samples, sampleRate } = pcm;
  const block = Math.round(BLOCK_S * sampleRate);
  const step = Math.round(STEP_S * sampleRate);
  if (samples.length < block) return null;
  const x = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) x[i] = samples[i] / 32768;
  const [shelf, pass] = kWeighting(sampleRate);
  const weighted = filter(filter(x, shelf), pass);
  // Each block's mean square, from a running sum of squares.
  const squares = new Float64Array(weighted.length + 1);
  for (let i = 0; i < weighted.length; i += 1)
    squares[i + 1] = squares[i] + weighted[i] * weighted[i];
  const blocks: number[] = [];
  for (let at = 0; at + block <= weighted.length; at += step)
    blocks.push((squares[at + block] - squares[at]) / block);
  const heard = blocks.filter((ms) => ms > 0 && loudnessOf(ms) > ABSOLUTE_GATE);
  if (!heard.length) return null;
  const mean = heard.reduce((a, b) => a + b, 0) / heard.length;
  const gate = loudnessOf(mean) + RELATIVE_GATE;
  const kept = heard.filter((ms) => loudnessOf(ms) > gate);
  if (!kept.length) return null;
  return loudnessOf(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/** The loudest sample, in dBFS. */
export function peakDbfs(pcm: Pcm): number {
  let peak = 0;
  for (const v of pcm.samples) peak = Math.max(peak, Math.abs(v));
  return peak ? 20 * Math.log10(peak / 32768) : -Infinity;
}

/** How long the limiter looks ahead and lets go, in seconds. */
const LOOKAHEAD_S = 0.005;
const RELEASE_S = 0.08;

/**
 * Samples times a gain in dB, with a look-ahead limiter holding every
 * peak under the ceiling: the gain dips just before a peak, as far as it
 * must, and comes back over RELEASE_S.
 */
function gained(pcm: Pcm, gainDb: number, ceilingDbfs: number): Pcm {
  const { samples, sampleRate } = pcm;
  const g = Math.pow(10, gainDb / 20);
  const ceiling = Math.pow(10, ceilingDbfs / 20) * 32767;
  const n = samples.length;
  // The gain each sample can take, at most.
  const need = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = Math.abs(samples[i]) * g;
    need[i] = v > ceiling ? ceiling / v : 1;
  }
  // The least of it over the next look-ahead (a sliding minimum, from the end).
  const ahead = Math.max(1, Math.round(LOOKAHEAD_S * sampleRate));
  const least = new Float64Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    while (tail > head && need[queue[tail - 1]] >= need[i]) tail -= 1;
    queue[tail] = i;
    tail += 1;
    while (queue[head] > i + ahead) head += 1;
    least[i] = need[queue[head]];
  }
  // Down over the look-ahead, up over RELEASE_S; never past what a sample can take.
  const attack = 1 - Math.exp(-3 / ahead);
  const release = 1 - Math.exp(-1 / (RELEASE_S * sampleRate));
  const out = new Int16Array(n);
  let level = 1;
  for (let i = 0; i < n; i += 1) {
    level += (least[i] - level) * (least[i] < level ? attack : release);
    const v = Math.round(samples[i] * g * Math.min(level, need[i]));
    out[i] = Math.max(-32768, Math.min(32767, v));
  }
  return { sampleRate, samples: out };
}

export interface LoudnessResult {
  /** The voice as it came, in LUFS; null where it could not be measured. */
  before: number | null;
  /** As it is now. */
  after: number | null;
  /** The gain it took, in dB; 0 when it was left. */
  gainDb: number;
  /** The voice brought to the target; null when it was left as it came. */
  pcm: Pcm | null;
}

/** A voice brought to `target` LUFS (VOICE_LUFS), its peaks under the ceiling; left alone when close already or not measurable. */
export function normaliseLoudness(
  pcm: Pcm,
  target = VOICE_LUFS,
  ceilingDbfs = CEILING_DBFS,
): LoudnessResult {
  const before = integratedLufs(pcm);
  if (before === null || Math.abs(before - target) < CLOSE_LU)
    return { before, after: before, gainDb: 0, pcm: null };
  const gainDb = Math.max(
    -MOST_GAIN_DB,
    Math.min(MOST_GAIN_DB, target - before),
  );
  let out = gained(pcm, gainDb, ceilingDbfs);
  let after = integratedLufs(out);
  // Where the limiter took more than a little, a touch more gain makes it up (once).
  if (after !== null && target - after > CLOSE_LU && gainDb < MOST_GAIN_DB) {
    const more = Math.min(MOST_GAIN_DB, gainDb + (target - after));
    out = gained(pcm, more, ceilingDbfs);
    after = integratedLufs(out);
    return { before, after, gainDb: Math.round(more * 100) / 100, pcm: out };
  }
  return { before, after, gainDb: Math.round(gainDb * 100) / 100, pcm: out };
}
