import { pcmMs, readPcm16, readWav, writeWav } from './wav';

const tone = (seconds: number, rate = 24000) => {
  const samples = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i += 1)
    samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * 330 * i) / rate));
  return { sampleRate: rate, samples };
};

describe('a WAV file read down to its samples', () => {
  it('reads back what it wrote, and knows how long it plays', () => {
    const pcm = tone(1.5);
    const read = readWav(writeWav(pcm));
    expect(read?.sampleRate).toBe(24000);
    expect(read?.samples.length).toBe(pcm.samples.length);
    expect(read?.samples[123]).toBe(pcm.samples[123]);
    expect(pcmMs(read!)).toBe(1500);
  });

  it('skips chunks it does not need, and reads a stream that overstates its length', () => {
    const plain = writeWav(tone(0.25));
    // A LIST chunk between fmt and data, as some encoders write.
    const list = Buffer.concat([
      Buffer.from('LIST', 'ascii'),
      Buffer.from([5, 0, 0, 0]),
      Buffer.from('INFOx\0', 'ascii'),
    ]);
    const withList = Buffer.concat([
      plain.subarray(0, 36),
      list,
      plain.subarray(36),
    ]);
    expect(readWav(withList)?.samples.length).toBe(6000);
    const streamed = Buffer.from(plain);
    streamed.writeUInt32LE(0xffffffff, 40);
    expect(readWav(streamed)?.samples.length).toBe(6000);
  });

  it('takes the first channel of a stereo file, and refuses what is not 16-bit PCM', () => {
    const mono = writeWav(tone(0.1));
    const stereo = Buffer.from(mono);
    stereo.writeUInt16LE(2, 22);
    expect(readWav(stereo)?.samples.length).toBe(1200);
    const float = Buffer.from(mono);
    float.writeUInt16LE(3, 20);
    expect(readWav(float)).toBeNull();
    expect(readWav(Buffer.from('not a wav at all'))).toBeNull();
  });

  it('reads raw samples a voice sends without a header', () => {
    const raw = Buffer.alloc(48000);
    expect(pcmMs(readPcm16(raw, 24000))).toBe(1000);
  });
});
