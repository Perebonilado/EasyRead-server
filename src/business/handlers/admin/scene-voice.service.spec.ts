import type { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../domain/errors/errors';
import {
  CARTESIA_LIBRARY,
  CARTESIA_NARRATOR,
  CHARACTER_VOICES,
  ELEVENLABS_NARRATOR,
  ELEVENLABS_PREMADE,
  deploymentEngine,
  sceneEngine,
} from '../../domain/scene-voice';
import type { SpeechPort } from '../../ports/voice.port';
import type {
  AppSettingsRecord,
  AppSettingsRepository,
} from '../../repositories/settings.repository';
import { SceneVoiceService, type SceneVoices } from './scene-voice.service';

const speech = (model: string, voice: string) =>
  ({ label: () => ({ model, voice }) }) as unknown as SpeechPort;

const voices = (kokoro = true): SceneVoices => ({
  gemini: speech('gemini-3.8-flash-tts', 'Sulafat'),
  kokoro: kokoro ? speech('kokoro-82m', 'am_puck') : null,
  openai: speech('gpt-4o-mini-tts', 'alloy'),
  elevenlabs: Object.assign(speech('eleven_v3', ELEVENLABS_NARRATOR), {
    catalogue: () =>
      Promise.resolve([
        {
          id: 'Voice0000000Bella',
          name: 'Bella',
          description: '',
          previewUrl: null,
        },
      ]),
  }),
  cartesia: Object.assign(speech('sonic-3.6', CARTESIA_NARRATOR), {
    catalogue: () =>
      Promise.resolve([
        {
          id: CARTESIA_LIBRARY.Lauren,
          name: 'Lauren',
          description: 'feminine',
          previewUrl: 'https://api.cartesia.ai/voices/katie/preview',
        },
      ]),
    preview: (id: string) =>
      Promise.resolve({ audio: Buffer.from(id), mimeType: 'audio/wav' }),
  }),
});

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/** The one row, in memory. */
function store(): AppSettingsRepository & { reads: number } {
  let record: AppSettingsRecord = {
    sceneVoice: null,
    voiceCast: {},
    worker: null,
    changedBy: null,
    changedAt: null,
  };
  const repository: AppSettingsRepository & { reads: number } = {
    reads: 0,
    get() {
      repository.reads += 1;
      return Promise.resolve(record);
    },
    set(patch, changedBy, now) {
      // Each engine's voices kept apart, as the table keeps them.
      record = {
        ...record,
        ...patch,
        voiceCast: { ...record.voiceCast, ...patch.voiceCast },
        changedBy,
        changedAt: now,
      };
      return Promise.resolve(record);
    },
    announce(worker) {
      record = { ...record, worker };
      return Promise.resolve();
    },
  };
  return repository;
}

const clock = (at: { ms: number }) => ({ now: () => new Date(at.ms) });

describe('which engine voices Visualize', () => {
  const all = {
    gemini: true,
    kokoro: true,
    openai: true,
    elevenlabs: true,
    cartesia: true,
  };

  it('takes the deployment’s own when nothing is chosen: its named engine when ready, else our server, else OpenAI', () => {
    expect(deploymentEngine('gemini', all)).toBe('gemini');
    expect(deploymentEngine(' Gemini ', all)).toBe('gemini');
    expect(deploymentEngine('gemini', { ...all, gemini: false })).toBe(
      'kokoro',
    );
    expect(deploymentEngine(undefined, all)).toBe('kokoro');
    expect(deploymentEngine('kokoro', { ...all, kokoro: false })).toBe(
      'openai',
    );
  });

  it('takes the admin’s choice while it is ready', () => {
    expect(sceneEngine('openai', 'gemini', all)).toBe('openai');
    expect(sceneEngine('gemini', 'kokoro', { ...all, gemini: false })).toBe(
      'kokoro',
    );
    expect(sceneEngine(null, 'gemini', all)).toBe('gemini');
  });
});

describe('the admin’s voice setting', () => {
  const keys = {
    GEMINI_API_KEY: 'g',
    OPENAI_API_KEY: 'o',
    SCENE_VOICE_ENGINE: 'gemini',
    SCENE_VOICE: 'Kore',
  };

  it('speaks in the deployment’s engine and voice until the admin picks another, then in that one’s own voice', async () => {
    const at = { ms: 0 };
    const settings = store();
    const service = new SceneVoiceService(
      voices(),
      settings,
      clock(at),
      config(keys),
    );
    let now = await service.current();
    expect([now.engine, now.voice]).toEqual(['gemini', 'Kore']);
    const status = await service.choose('kokoro', 'admin-1');
    expect(status.chosen).toBe('kokoro');
    expect(status.current).toBe('kokoro');
    expect(status.deployment).toBe('gemini');
    expect(status.options.map((o) => [o.value, o.ready])).toEqual([
      ['gemini', true],
      ['kokoro', true],
      ['openai', true],
      ['elevenlabs', false],
      ['cartesia', false],
    ]);
    now = await service.current();
    // SCENE_VOICE names a Gemini voice: our server speaks in its own.
    expect([now.engine, now.voice]).toEqual(['kokoro', 'am_puck']);
    await service.choose(null, 'admin-1');
    expect((await service.current()).engine).toBe('gemini');
  });

  it('will not pick an engine not set up here', async () => {
    const service = new SceneVoiceService(
      voices(false),
      store(),
      clock({ ms: 0 }),
      config({ OPENAI_API_KEY: 'o' }),
    );
    await expect(service.choose('kokoro', 'a')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.choose('gemini', 'a')).rejects.toThrow(
      'Gemini (Google) is not set up',
    );
    expect((await service.current()).engine).toBe('openai');
  });

  it('offers what the worker can speak with, though the API serving the page has less', async () => {
    const settings = store();
    const worker = new SceneVoiceService(
      voices(true),
      settings,
      clock({ ms: 0 }),
      config({ OPENAI_API_KEY: 'o' }),
    );
    const api = new SceneVoiceService(
      voices(false),
      settings,
      clock({ ms: 0 }),
      config({ OPENAI_API_KEY: 'o' }),
    );
    // Before the worker has said, the API goes by its own.
    expect((await api.status()).deployment).toBe('openai');
    await worker.announce();
    api['cached'] = null;
    const status = await api.status();
    expect(status.deployment).toBe('kokoro');
    expect(status.options.find((o) => o.value === 'kokoro')).toMatchObject({
      ready: true,
      model: 'kokoro-82m',
      voice: 'am_puck',
    });
    expect((await api.choose('kokoro', 'admin-1')).current).toBe('kokoro');
    await expect(api.choose('gemini', 'admin-1')).rejects.toThrow('not set up');
  });

  it('reads the row at most once in ten seconds', async () => {
    const at = { ms: 0 };
    const settings = store();
    const service = new SceneVoiceService(
      voices(),
      settings,
      clock(at),
      config(keys),
    );
    await service.current();
    at.ms = 9_000;
    await service.current();
    expect(settings.reads).toBe(1);
    at.ms = 10_500;
    await service.current();
    expect(settings.reads).toBe(2);
  });

  it('offers ElevenLabs once its key is set, and speaks in the narrator and the voices the admin chose for it', async () => {
    const service = new SceneVoiceService(
      voices(),
      store(),
      clock({ ms: 0 }),
      config({ ...keys, ELEVENLABS_API_KEY: 'e' }),
    );
    let status = await service.choose('elevenlabs', 'admin-1');
    expect(status.current).toBe('elevenlabs');
    expect(status.cast?.roles.map((r) => r.value)).toEqual([
      'narrator',
      'girl',
      'boy',
      'woman',
      'man',
      'old woman',
      'old man',
      'creature',
      'divine',
      'crowd',
    ]);
    expect(status.cast?.roles[0]).toMatchObject({
      chosen: null,
      default: ELEVENLABS_NARRATOR,
    });
    // SCENE_VOICE names a Gemini voice: ElevenLabs speaks in its own.
    let now = await service.current();
    expect([now.engine, now.voice, now.cast]).toEqual([
      'elevenlabs',
      ELEVENLABS_NARRATOR,
      {},
    ]);
    status = await service.chooseCast(
      'narrator',
      ELEVENLABS_PREMADE.Daniel,
      'a',
    );
    status = await service.chooseCast('man', ELEVENLABS_PREMADE.Harry, 'a');
    expect(status.cast?.roles.find((r) => r.value === 'man')).toMatchObject({
      chosen: ELEVENLABS_PREMADE.Harry,
    });
    expect(status.cast?.roles.find((r) => r.value === 'woman')?.default).toBe(
      CHARACTER_VOICES.elevenlabs.woman[0],
    );
    now = await service.current();
    expect(now.voice).toBe(ELEVENLABS_PREMADE.Daniel);
    expect(now.cast).toEqual({
      narrator: ELEVENLABS_PREMADE.Daniel,
      man: ELEVENLABS_PREMADE.Harry,
    });
    // Back to the default.
    status = await service.chooseCast('man', null, 'a');
    expect((await service.current()).cast).toEqual({
      narrator: ELEVENLABS_PREMADE.Daniel,
    });
    await expect(
      service.chooseCast('girl', 'not a voice!', 'a'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await service.voiceOptions()).map((v) => v.name)).toEqual([
      'Bella',
    ]);
  });

  it('keeps the admin’s voices to ElevenLabs: another engine speaks in its own', async () => {
    const settings = store();
    const service = new SceneVoiceService(
      voices(),
      settings,
      clock({ ms: 0 }),
      config({ ...keys, ELEVENLABS_API_KEY: 'e' }),
    );
    await service.chooseCast('narrator', ELEVENLABS_PREMADE.Daniel, 'a');
    const now = await service.current();
    expect([now.engine, now.voice, now.cast]).toEqual(['gemini', 'Kore', {}]);
  });

  it('offers Cartesia once its key is set, keeps its voices apart from ElevenLabs’, and fetches its samples', async () => {
    const service = new SceneVoiceService(
      voices(),
      store(),
      clock({ ms: 0 }),
      config({ ...keys, ELEVENLABS_API_KEY: 'e', CARTESIA_API_KEY: 'c' }),
    );
    await service.chooseCast('narrator', ELEVENLABS_PREMADE.Daniel, 'a');
    let status = await service.choose('cartesia', 'admin-1');
    expect(status.current).toBe('cartesia');
    expect(status.options.find((o) => o.value === 'cartesia')).toMatchObject({
      label: 'Cartesia',
      ready: true,
      model: 'sonic-3.6',
    });
    // The voices of the engine speaking.
    expect(status.cast?.engine).toBe('cartesia');
    expect(status.cast?.roles[0]).toMatchObject({
      chosen: null,
      default: CARTESIA_NARRATOR,
    });
    expect(status.cast?.roles.find((r) => r.value === 'girl')?.default).toBe(
      CHARACTER_VOICES.cartesia.girl[0],
    );
    let now = await service.current();
    expect([now.engine, now.voice, now.cast]).toEqual([
      'cartesia',
      CARTESIA_NARRATOR,
      {},
    ]);
    // An ElevenLabs id is no Cartesia voice.
    await expect(
      service.chooseCast('man', ELEVENLABS_PREMADE.Harry, 'a', 'cartesia'),
    ).rejects.toThrow('not a Cartesia voice');
    status = await service.chooseCast(
      'narrator',
      CARTESIA_LIBRARY.Lauren,
      'a',
      'cartesia',
    );
    status = await service.chooseCast(
      'old man',
      CARTESIA_LIBRARY.Griffin,
      'a',
      'cartesia',
    );
    now = await service.current();
    expect(now.voice).toBe(CARTESIA_LIBRARY.Lauren);
    expect(now.cast).toEqual({
      narrator: CARTESIA_LIBRARY.Lauren,
      'old man': CARTESIA_LIBRARY.Griffin,
    });
    // ElevenLabs' choices are still there, its own.
    await service.choose('elevenlabs', 'admin-1');
    now = await service.current();
    expect([now.engine, now.voice, now.cast]).toEqual([
      'elevenlabs',
      ELEVENLABS_PREMADE.Daniel,
      { narrator: ELEVENLABS_PREMADE.Daniel },
    ]);
    status = await service.status();
    expect(status.cast?.engine).toBe('elevenlabs');
    expect((await service.voiceOptions('cartesia')).map((v) => v.name)).toEqual(
      ['Lauren'],
    );
    const sample = await service.voicePreview(
      'cartesia',
      CARTESIA_LIBRARY.Lauren,
    );
    expect(sample.mimeType).toBe('audio/wav');
    await expect(
      service.voicePreview('cartesia', '../../etc'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('will not list or pick Cartesia without its key', async () => {
    const service = new SceneVoiceService(
      voices(),
      store(),
      clock({ ms: 0 }),
      config(keys),
    );
    await expect(service.choose('cartesia', 'a')).rejects.toThrow(
      'Cartesia is not set up',
    );
    await expect(service.voiceOptions('cartesia')).rejects.toThrow(
      'CARTESIA_API_KEY',
    );
  });

  it('will not list or pick ElevenLabs without its key', async () => {
    const service = new SceneVoiceService(
      voices(),
      store(),
      clock({ ms: 0 }),
      config(keys),
    );
    await expect(service.choose('elevenlabs', 'a')).rejects.toThrow(
      'ElevenLabs is not set up',
    );
    await expect(service.voiceOptions()).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await service.status()).cast).toBeNull();
  });
});
