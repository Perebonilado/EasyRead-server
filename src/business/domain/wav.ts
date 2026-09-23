/**
 * A WAV file read down to its samples: what a voice that answers in WAV
 * (Gemini) said, ready to be measured and encoded. Only what a voice
 * sends is read: 16-bit PCM, any rate, mono or the first channel of more.
 */

export interface Pcm {
  sampleRate: number;
  /** One channel of 16-bit samples. */
  samples: Int16Array;
}

/** The samples of a WAV file, or null when it is not a 16-bit PCM WAV. */
export function readWav(file: Buffer): Pcm | null {
  if (
    file.length < 12 ||
    file.toString('ascii', 0, 4) !== 'RIFF' ||
    file.toString('ascii', 8, 12) !== 'WAVE'
  )
    return null;
  let format: { rate: number; channels: number; bits: number } | null = null;
  let offset = 12;
  while (offset + 8 <= file.length) {
    const id = file.toString('ascii', offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= file.length) {
      const audioFormat = file.readUInt16LE(body);
      // 1 is PCM; 0xFFFE is the extensible header a PCM file may also carry.
      if (audioFormat !== 1 && audioFormat !== 0xfffe) return null;
      format = {
        channels: file.readUInt16LE(body + 2),
        rate: file.readUInt32LE(body + 4),
        bits: file.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!format || format.bits !== 16 || format.channels < 1) return null;
      // A streamed file may say its data runs past the end: read what is there.
      const end = Math.min(file.length, body + size);
      return {
        sampleRate: format.rate,
        samples: firstChannel(file.subarray(body, end), format.channels),
      };
    }
    // Chunks are padded to an even length.
    offset = body + size + (size % 2);
  }
  return null;
}

/** Raw little-endian 16-bit mono samples, as a voice sends them without a header. */
export function readPcm16(data: Buffer, sampleRate: number): Pcm {
  return { sampleRate, samples: firstChannel(data, 1) };
}

function firstChannel(data: Buffer, channels: number): Int16Array {
  const frames = Math.floor(data.length / (2 * channels));
  const out = new Int16Array(frames);
  for (let i = 0; i < frames; i += 1)
    out[i] = data.readInt16LE(i * 2 * channels);
  return out;
}

/** How long the samples play, in milliseconds. */
export const pcmMs = (pcm: Pcm) =>
  pcm.sampleRate > 0
    ? Math.round((pcm.samples.length / pcm.sampleRate) * 1000)
    : 0;

/** A 16-bit mono WAV of the samples: what the tests and the aligner can read back. */
export function writeWav(pcm: Pcm): Buffer {
  const data = Buffer.alloc(pcm.samples.length * 2);
  pcm.samples.forEach((sample, i) => data.writeInt16LE(sample, i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(pcm.sampleRate, 24);
  header.writeUInt32LE(pcm.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
