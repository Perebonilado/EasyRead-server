/**
 * Samples to mp3, in this process: a voice that answers in WAV (Gemini)
 * is stored and played as every other page's audio is, an mp3, at a
 * fifteenth of the size.
 *
 * LAME ported to JavaScript: there is no ffmpeg on the worker, and a
 * minute and a half of mono speech encodes in about a second. The
 * package's CommonJS entry is broken under Node 20, so it is loaded as
 * the ES module it is.
 */
type Lame = typeof import('@breezystack/lamejs');

let lame: Promise<Lame> | null = null;

/** Mono 16-bit samples as an mp3 at `kbps`; speech needs no more than 64. */
export async function encodeMp3(
  samples: Int16Array,
  sampleRate: number,
  kbps = 64,
): Promise<Buffer> {
  lame ??= import('@breezystack/lamejs');
  const { Mp3Encoder } = await lame;
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Buffer[] = [];
  // LAME takes a frame of 1152 samples at a time.
  for (let i = 0; i < samples.length; i += 1152) {
    const chunk = encoder.encodeBuffer(samples.subarray(i, i + 1152));
    if (chunk.length) parts.push(Buffer.from(chunk));
  }
  const end = encoder.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}
