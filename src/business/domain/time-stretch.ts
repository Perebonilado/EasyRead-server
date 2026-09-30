/**
 * Speech made a little faster or slower without its pitch changing: WSOLA
 * (waveform-similarity overlap-add), in this process, on 16-bit samples.
 *
 * Why our own: Rubber Band (the plan's first choice) is GPL, and its WASM
 * build is only an optional peer of echogarden, not installed; ffmpeg is
 * not on the worker. For speech within about ±14 %, WSOLA is what most
 * players' speed controls use: the voice is cut into overlapping windows
 * of about 25 ms, and each is laid down at the new spacing where it best
 * continues the one before, so the pitch periods line up and nothing
 * warbles. Beyond ±14 % a voice starts to smear, so callers keep inside
 * it (scene-pace TEMPO_RANGE).
 */

/** The window, in seconds: two or three pitch periods of any voice. */
const WINDOW_S = 0.025;
/** How far a window may be moved to find where it fits best, in seconds. */
const SEEK_S = 0.008;

/** A Hann window of `n` samples, cached by length. */
const hanns = new Map<number, Float32Array>();
function hann(n: number): Float32Array {
  let w = hanns.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i += 1)
      w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    hanns.set(n, w);
  }
  return w;
}

/** A plain resample, for a stretch too short to window: a few ms of it. */
function resampled(input: Int16Array, length: number): Int16Array {
  const out = new Int16Array(length);
  if (!input.length || !length) return out;
  const step =
    input.length > 1 ? (input.length - 1) / Math.max(1, length - 1) : 0;
  for (let i = 0; i < length; i += 1) {
    const at = i * step;
    const a = Math.floor(at);
    const b = Math.min(input.length - 1, a + 1);
    out[i] = Math.round(input[a] + (input[b] - input[a]) * (at - a));
  }
  return out;
}

/**
 * `input` played in `factor` of its time (1.1 is ten per cent longer,
 * slower; 0.9 quicker), its pitch kept, exactly `length` samples long
 * (by default its length times the factor).
 */
export function stretchPcm(
  input: Int16Array,
  rate: number,
  factor: number,
  length = Math.round(input.length * factor),
): Int16Array {
  if (length <= 0) return new Int16Array(0);
  if (Math.abs(factor - 1) < 1e-3 && length === input.length)
    return input.slice();
  let n = Math.round(rate * WINDOW_S);
  n += n % 2;
  const half = n / 2;
  if (input.length < 2 * n) return resampled(input, length);
  const seek = Math.max(1, Math.round(rate * SEEK_S));
  const window = hann(n);
  // The real ratio of analysis to synthesis, from the lengths asked for.
  const hopIn = (half * input.length) / length;
  const out = new Float32Array(length + n);
  const weight = new Float32Array(length + n);
  const sample = (i: number) => (i >= 0 && i < input.length ? input[i] : 0);
  let previous = 0;
  for (let k = 0; k * half < length; k += 1) {
    const nominal = Math.round(k * hopIn);
    let at = nominal;
    if (k > 0) {
      // Where the window laid last would carry on, naturally: the best
      // match for it near where this window should start.
      const follow = previous + half;
      let best = -Infinity;
      const from = Math.max(0, nominal - seek);
      const to = Math.min(input.length - n, nominal + seek);
      for (let c = from; c <= to; c += 2) {
        let sum = 0;
        let energy = 1;
        for (let i = 0; i < half; i += 2) {
          const x = sample(c + i);
          sum += x * sample(follow + i);
          energy += x * x;
        }
        const score = sum / Math.sqrt(energy);
        if (score > best) {
          best = score;
          at = c;
        }
      }
      if (to < from) at = Math.max(0, Math.min(input.length - n, nominal));
    }
    const put = k * half;
    for (let i = 0; i < n; i += 1) {
      out[put + i] += sample(at + i) * window[i];
      weight[put + i] += window[i];
    }
    previous = at;
  }
  const result = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    // The first and last few samples lie under one window's tail alone.
    const w = weight[i];
    const value = w > 0.05 ? out[i] / w : out[i];
    result[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }
  return result;
}
