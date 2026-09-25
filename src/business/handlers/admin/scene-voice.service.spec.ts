import type { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../domain/errors/errors';
import { deploymentEngine, sceneEngine } from '../../domain/scene-voice';
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
});

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/** The one row, in memory. */
function store(): AppSettingsRepository & { reads: number } {
  let record: AppSettingsRecord = {
    sceneVoice: null,
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
      record = { ...record, ...patch, changedBy, changedAt: now };
      return Promise.resolve(record);
    },
  };
  return repository;
}

const clock = (at: { ms: number }) => ({ now: () => new Date(at.ms) });

describe('which engine voices Visualize', () => {
  const all = { gemini: true, kokoro: true, openai: true };

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
});
