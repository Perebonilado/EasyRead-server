import { Logger } from '@nestjs/common';
import type { SceneDto } from '../../contracts';
import type { AudioCodecPort } from '../../business/ports/audio-codec.port';
import type { StoragePort } from '../../business/ports/storage.port';
import type { Pcm } from '../../business/domain/wav';
import { explainerSheetOf } from '../../business/domain/studio/studio';
import {
  BEATS,
  DURATION_MS,
  LINES,
  PALETTE,
  PLAN,
  REGISTRY,
} from '../../business/domain/shots/__fixtures__/regional-turn';
import {
  shotsScriptOf,
  type ShotsInput,
} from '../../business/domain/shots/shot-compose';
import { soundsOf } from '../../business/domain/shots/shot-sound';
import { partsKeyOf } from '../../business/handlers/studio/studio-twins';
import type { SceneParts } from '../../business/domain/scene-film-parts';
import { SceneProcessor } from './scene.processor';

/**
 * A scene of shots through the stage a Studio scene is made on: made on a
 * voice (stubbed here; nothing is drawn), its twin in the other shape, its
 * pace changed, and built again on its voice. Each stays a scene of shots.
 */

const BASE = {
  kind: 'map',
  region: 'Nigeria',
  year: 1960,
  bordersDiffer: true,
  groups: [
    {
      name: 'North Region',
      colour: 'chart0',
      members: [
        'Kano',
        'Kaduna',
        'Sokoto',
        'Borno',
        'Niger',
        'Kwara',
        'Benue',
        'Plateau',
        'Bauchi',
        'Adamawa',
      ],
    },
    {
      name: 'West Region',
      colour: 'chart1',
      members: [
        'Lagos',
        'Ogun',
        'Oyo',
        'Osun',
        'Ondo',
        'Ekiti',
        'Edo',
        'Delta',
      ],
    },
    {
      name: 'East Region',
      colour: 'chart2',
      members: ['Enugu', 'Anambra', 'Imo', 'Abia', 'Rivers', 'Cross River'],
    },
  ],
  seams: [
    {
      between: ['North Region', 'East Region'],
      name: 'federal balance',
      style: 'glow',
    },
  ],
};

const sheet = explainerSheetOf({
  kind: 'explainer',
  title: 'Pressure Turns Regional',
  transition: 'cut',
  draft: {
    fit: 'good',
    fitReason: null,
    title: 'Pressure Turns Regional',
    mood: 'serious',
    pace: 'infographic',
    beats: LINES.map((say) => ({
      say,
      pause: 'short',
      delivery: 'explain',
      speaker: null,
      music: null,
      energy: null,
    })),
    cast: [],
    steps: [],
  },
  engine: 'shots',
  shots: PLAN,
  registry: REGISTRY,
});
const script = shotsScriptOf(sheet, { stage: 'higher', maths: false });
const shots: ShotsInput = {
  plan: PLAN,
  registry: REGISTRY,
  rowClaims: [],
  world: { palette: PALETTE, held: 'chart5', base: BASE },
  first: true,
  seed: 'row-1',
};
const profile = {
  kind: 'textbook' as const,
  tone: 'serious' as const,
  story: false,
  stage: 'higher' as const,
  film: true as const,
  subject: 'history',
  formats: ['explainer' as const],
};

function memory() {
  const kept = new Map<string, Buffer>();
  const storage = {
    put: ({ key, body }: { key: string; body: Buffer }) => {
      kept.set(key, body);
      return Promise.resolve({ key });
    },
    get: (key: string) => Promise.resolve(kept.get(key) ?? Buffer.alloc(0)),
    delete: (key: string) => Promise.resolve(void kept.delete(key)),
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

/** The processor's voice, stubbed: the fixture's lines as said, nothing synthesised. */
function voiced(processor: SceneProcessor) {
  const voice = jest.fn(() =>
    Promise.resolve({
      beats: BEATS,
      durationMs: DURATION_MS,
      audioKey: 'studio/s/e/r-voice.mp3',
      timing: 'voice' as const,
      voicePace: 1,
    }),
  );
  (processor as unknown as { voice: typeof voice }).voice = voice;
  return voice;
}

const stored = (kept: Map<string, Buffer>, key: string) =>
  JSON.parse(kept.get(key)!.toString('utf8')) as SceneDto;

describe('a scene of shots on the stage a Studio scene is made on', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('is made on its voice with nothing drawn, stored as a scene of shots beside its parts, its still and its twin', async () => {
    const { kept, storage } = memory();
    const processor = pipeline(storage);
    voiced(processor);
    const drawAll = jest.spyOn(
      processor as unknown as { drawAll: () => Promise<Map<string, null>> },
      'drawAll',
    );
    const made = await processor.make({
      documentId: 'episode-1',
      documentTitle: 'The Regional Turn',
      topic: {
        id: 'episode-1',
        title: 'The Regional Turn',
        shortDescription: null,
        startPage: 1,
        endPage: 6,
        orderIndex: 1,
      },
      material: '',
      context: '',
      profile,
      script,
      kept: new Map(),
      base: 'studio/s/e/r-abc',
      who: 'test',
      keepAs: 'studio-r',
      parts: true,
      theme: 'paper',
      twin: { shape: 'tall', base: 'studio/s/t/r-abc' },
      finish: (scene) => ({ ...scene, ideas: [{ beat: 0, label: 'Regions' }] }),
      shots,
    });
    expect(drawAll).not.toHaveBeenCalled();
    expect(made.fit).toBe('good');
    if (made.fit !== 'good') return;
    const scene = stored(kept, made.sceneKey);
    expect(scene.engine).toBe('shots');
    expect(scene.things).toEqual([]);
    expect(scene.steps).toEqual([]);
    expect(scene.voicePace).toBe(1);
    expect(scene.ideas).toEqual([{ beat: 0, label: 'Regions' }]);
    expect(scene.shots!.assets.map).toBeDefined();
    expect(scene.shots!.assets.map.kind).toBe('svg');
    expect(scene.shots!.shots[0].set.kind).toBe('map');
    // The regions the plan fills are the drawn map's own parts.
    const fill = scene.shots!.shots[0].info.find((i) => i.recipe === 'fill');
    expect(fill?.target).toEqual({
      kind: 'asset',
      asset: 'map',
      part: 'group-north-region',
    });
    // Its card's still was made, and its parts kept for a twin made later.
    expect(kept.get(made.thumbKey)?.subarray(1, 4).toString()).toBe('PNG');
    const parts = JSON.parse(
      kept.get(partsKeyOf(made.sceneKey))!.toString(),
    ) as SceneParts;
    expect(parts.script.beats.map((b) => b.say)).toEqual(LINES);
    expect(parts.drawings).toEqual([]);
    // Its twin: the same voice, its map drawn again for the tall frame.
    const twin = stored(kept, made.twin!.sceneKey);
    expect(twin.engine).toBe('shots');
    expect(twin.shape).toBe('tall');
    expect(twin.stagings.wide).toEqual({ w: 900, h: 1600, places: [] });
    expect(
      twin.shots!.assets.map.kind === 'svg' && twin.shots!.assets.map.svg,
    ).not.toBe(
      scene.shots!.assets.map.kind === 'svg' && scene.shots!.assets.map.svg,
    );
    expect(twin.beats).toEqual(scene.beats);
  }, 60_000);

  it('makes its twin later from its parts, built for the other frame', async () => {
    const { kept, storage } = memory();
    const processor = pipeline(storage);
    const parts: SceneParts = {
      version: 1,
      script,
      drawings: [],
      beats: BEATS,
      durationMs: DURATION_MS,
      timing: 'voice',
      voicePace: 1.1,
    };
    const made = await processor.reshape({
      parts,
      profile,
      story: null,
      shape: 'tall',
      base: 'studio/s/t/r-later',
      who: 'test',
      theme: 'paper',
      shots,
    });
    const twin = stored(kept, made.sceneKey);
    expect(twin.engine).toBe('shots');
    expect(twin.shape).toBe('tall');
    expect(twin.voicePace).toBe(1.1);
  }, 60_000);

  it('is built again on the voice it was made with, from its plan as it is now', async () => {
    const { kept, storage } = memory();
    const processor = pipeline(storage);
    const again = await processor.recompose({
      script,
      kept: new Map(),
      beats: BEATS,
      durationMs: DURATION_MS,
      timing: 'voice',
      profile,
      story: null,
      base: 'studio/s/e/r-again',
      who: 'test',
      shots: { ...shots, plan: { shots: PLAN.shots.slice(0, 2) } },
      theme: 'paper',
      voicePace: 1,
    });
    const scene = stored(kept, again.sceneKey);
    expect(scene.engine).toBe('shots');
    expect(scene.shots!.shots).toHaveLength(2);
    expect(scene.voicePace).toBe(1);
    await expect(
      processor.recompose({
        script,
        kept: new Map(),
        beats: BEATS,
        durationMs: DURATION_MS,
        timing: 'voice',
        profile,
        story: null,
        base: 'b',
        who: 'test',
      }),
    ).rejects.toThrow();
  }, 60_000);

  it('is paced again with its voice: still a scene of shots, its shots and sounds moved with the words', async () => {
    const { kept, storage } = memory();
    const first = pipeline(storage);
    const again = await first.recompose({
      script,
      kept: new Map(),
      beats: BEATS,
      durationMs: DURATION_MS,
      timing: 'voice',
      profile,
      story: null,
      base: 'studio/s/e/r-made',
      who: 'test',
      shots,
      voicePace: 1,
    });
    const scene = stored(kept, again.sceneKey);
    const RATE = 24_000;
    const samples = new Int16Array(Math.round((DURATION_MS * RATE) / 1000));
    for (const beat of BEATS)
      for (
        let i = Math.round((beat.startMs * RATE) / 1000);
        i < Math.round((beat.endMs * RATE) / 1000);
        i += 1
      )
        samples[i] = Math.round(
          9000 * Math.sin((2 * Math.PI * 150 * i) / RATE),
        );
    const pcm: Pcm = { samples, sampleRate: RATE };
    const codec: AudioCodecPort = {
      decode: () => Promise.resolve(pcm),
      encode: (edited) =>
        Promise.resolve(Buffer.from(`mp3:${edited.samples.length}`)),
    };
    const done = await pipeline(storage, codec).repace({
      scene,
      audio: Buffer.from('mp3'),
      tempo: 1.1,
      base: 'studio/s/e/r-paced',
      who: 'test',
    });
    expect(done).not.toBeNull();
    const paced = stored(kept, done!.sceneKey);
    expect(paced.engine).toBe('shots');
    expect(paced.durationMs).toBeLessThan(scene.durationMs);
    const before = scene.shots!.shots;
    const after = paced.shots!.shots;
    expect(after).toHaveLength(before.length);
    expect(after[after.length - 1].endMs).toBe(paced.durationMs);
    expect(after[1].startMs).toBeLessThan(before[1].startMs);
    // Each change keeps its length and lands no later than it did.
    expect(after[0].info[0].durMs).toBe(before[0].info[0].durMs);
    expect(after[0].info[0].atMs).toBeLessThanOrEqual(before[0].info[0].atMs);
    expect(paced.shots!.sounds).toHaveLength(scene.shots!.sounds.length);
    // Its sounds are made again from its moved shots: each still on its motion.
    expect(paced.shots!.sounds).toEqual(soundsOf(paced.shots!.shots));
  }, 60_000);
});
