import { Logger } from '@nestjs/common';
import type { SceneDto } from '../../contracts';
import type { AudioCodecPort } from '../../business/ports/audio-codec.port';
import type { StoragePort } from '../../business/ports/storage.port';
import type { Pcm } from '../../business/domain/wav';
import type { TimedBeat } from '../../business/domain/scene-timing';
import { SceneProcessor } from './scene.processor';

const RATE = 24_000;

/** Speech-like sound where each [from, to] in ms says, silence between. */
function voiced(spans: [number, number][], totalMs: number): Int16Array {
  const out = new Int16Array(Math.round((totalMs * RATE) / 1000));
  for (const [a, b] of spans)
    for (
      let i = Math.round((a * RATE) / 1000);
      i < Math.round((b * RATE) / 1000);
      i += 1
    )
      out[i] = Math.round(9000 * Math.sin((2 * Math.PI * 150 * i) / RATE));
  return out;
}

/** Five words of seven syllables: five words of average length (scene-pace paceWords). */
const CYCLE = ['open', 'river', 'stone', 'lake', 'bright'];
const said = (n: number) =>
  Array.from({ length: n }, (_, i) => CYCLE[i % CYCLE.length]).join(' ');

/** A sentence of `n` words evenly over [from, to]. */
function sentence(n: number, from: number, to: number): TimedBeat {
  const each = (to - from) / n;
  return {
    text: said(n),
    startMs: from,
    endMs: to,
    words: Array.from({ length: n }, (_, i) => [
      i * 5,
      i * 5 + 4,
      Math.round(from + i * each),
      Math.round(from + (i + 1) * each - 20),
    ]),
  };
}

/** A codec that hands back the samples it was made with, and "encodes" by length. */
function codecOf(pcm: Pcm): AudioCodecPort & { encoded: Pcm[] } {
  const encoded: Pcm[] = [];
  return {
    encoded,
    decode: () => Promise.resolve(pcm),
    encode: (edited) => {
      encoded.push(edited);
      return Promise.resolve(Buffer.from(`mp3:${edited.samples.length}`));
    },
  };
}

function memory() {
  const kept = new Map<string, Buffer>();
  const storage = {
    put: ({ key, body }: { key: string; body: Buffer }) => {
      kept.set(key, body);
      return Promise.resolve({ key });
    },
    get: (key: string) => Promise.resolve(kept.get(key) ?? Buffer.alloc(0)),
  } as unknown as StoragePort;
  return { kept, storage };
}

function pipeline(
  storage: StoragePort,
  codec?: AudioCodecPort,
): SceneProcessor {
  const config = { get: () => undefined };
  return new SceneProcessor(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config as never,
    storage,
    {} as never,
    codec,
  );
}

/** The processor's own pace step, reached for the test. */
const paceVoice = (processor: SceneProcessor, input: Record<string, unknown>) =>
  (
    processor as unknown as {
      paceVoice: (input: Record<string, unknown>) => Promise<{
        beats: TimedBeat[];
        durationMs: number;
        audio: Buffer;
        report?: { wpm: number };
      }>;
    }
  ).paceVoice(input);

describe('a lesson’s voice put right after voicing', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  // Ten words in three seconds: 200 a minute, against a target of 160.
  const beats = [sentence(10, 0, 3000), sentence(10, 3400, 6400)];
  const pcm = {
    samples: voiced(
      [
        [0, 3000],
        [3400, 6400],
      ],
      7000,
    ),
    sampleRate: RATE,
  };
  const input = {
    beats,
    durationMs: 7000,
    audio: Buffer.from('mp3'),
    mimeType: 'audio/mpeg',
    pcm: null,
    targets: [160, 160],
    pauses: [0.4, 0.5],
    lesson: true,
    leadMs: 0,
    who: 'test',
    label: 'general-adult',
  };

  it('stretches what was said too fast, times the words on it, and encodes it once', async () => {
    const codec = codecOf(pcm);
    const processor = pipeline(memory().storage, codec);
    const out = await paceVoice(processor, {
      ...input,
      timing: 'voice',
    });
    expect(codec.encoded).toHaveLength(1);
    expect(out.durationMs).toBeGreaterThan(7500);
    expect(out.beats[0].endMs - out.beats[0].startMs).toBeGreaterThan(3300);
    expect(out.report!.wpm).toBeLessThan(185);
    expect(out.audio.toString()).toMatch(/^mp3:/);
  });

  it('measures nothing on an estimate, and leaves the voice as it came', async () => {
    const codec = codecOf(pcm);
    const processor = pipeline(memory().storage, codec);
    const out = await paceVoice(processor, {
      ...input,
      timing: 'estimated',
    });
    expect(codec.encoded).toHaveLength(0);
    expect(out.beats).toBe(beats);
    expect(out.audio.toString()).toBe('mp3');
  });

  it('leaves the voice as it came with no codec here', async () => {
    const processor = pipeline(memory().storage);
    const out = await paceVoice(processor, {
      ...input,
      timing: 'voice',
    });
    expect(out.durationMs).toBe(7000);
  });
});

describe('a made lesson scene paced again', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const scene = {
    version: 4,
    generator: 'x',
    title: 't',
    durationMs: 7000,
    timing: 'voice',
    voicePace: 1,
    beats: [sentence(8, 0, 3000), sentence(8, 3400, 6400)],
    things: [],
    steps: [{ atMs: 3300, layout: 'one', show: [], arrows: [], enter: {} }],
    effects: [],
    stagings: {
      box: { w: 1, h: 1, places: [] },
      wide: { w: 1, h: 1, places: [] },
    },
  } as unknown as SceneDto;
  const pcm = {
    samples: voiced(
      [
        [0, 3000],
        [3400, 6400],
      ],
      7000,
    ),
    sampleRate: RATE,
  };

  it('plays its voice quicker, its pauses kept, and stores it beside the scene it was', async () => {
    const { kept, storage } = memory();
    const processor = pipeline(storage, codecOf(pcm));
    const done = await processor.repace({
      scene,
      audio: Buffer.from('mp3'),
      tempo: 1.06,
      base: 'studio/s/e/r-paced',
      who: 'test',
    });
    expect(done).not.toBeNull();
    expect(done!.scene.voicePace).toBe(1.06);
    expect(done!.scene.beats[0].endMs).toBe(Math.round(3000 / 1.06));
    // The silence between the sentences is as it was.
    expect(done!.scene.beats[1].startMs - done!.scene.beats[0].endMs).toBe(400);
    // The step in that silence moved with it.
    expect(done!.scene.steps[0].atMs).toBeGreaterThan(
      done!.scene.beats[0].endMs,
    );
    expect(done!.scene.steps[0].atMs).toBeLessThan(
      done!.scene.beats[1].startMs,
    );
    expect(done!.durationMs).toBeLessThan(7000);
    expect(kept.has(done!.audioKey)).toBe(true);
    const stored = JSON.parse(kept.get(done!.sceneKey)!.toString()) as {
      voicePace: number;
    };
    expect(stored.voicePace).toBe(1.06);
  });

  it('is not done to a story’s scene, nor with no codec', async () => {
    const { storage } = memory();
    expect(
      await pipeline(storage, codecOf(pcm)).repace({
        scene: { ...scene, acting: {} },
        audio: Buffer.from('mp3'),
        tempo: 1.06,
        base: 'b',
        who: 'test',
      }),
    ).toBeNull();
    expect(
      await pipeline(storage).repace({
        scene,
        audio: Buffer.from('mp3'),
        tempo: 1.06,
        base: 'b',
        who: 'test',
      }),
    ).toBeNull();
  });
});
