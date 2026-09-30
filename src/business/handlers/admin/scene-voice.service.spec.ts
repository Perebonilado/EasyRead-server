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
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import {
  SceneVoiceService,
  capOf,
  type SceneVoices,
} from './scene-voice.service';

const speech = (model: string, voice: string) =>
  ({ label: () => ({ model, voice }) }) as unknown as SpeechPort;

/** ElevenLabs on a model, its list of voices saying which model listed them. */
const eleven = (model: string): SpeechPort =>
  Object.assign(speech(model, ELEVENLABS_NARRATOR), {
    withModel: (other: string) => eleven(other),
    catalogue: () =>
      Promise.resolve([
        {
          id: 'Voice0000000Bella',
          name: 'Bella',
          description: model,
          previewUrl: null,
        },
      ]),
  });

const voices = (kokoro = true): SceneVoices => ({
  gemini: speech('gemini-3.8-flash-tts', 'Sulafat'),
  kokoro: kokoro ? speech('kokoro-82m', 'am_puck') : null,
  openai: speech('gpt-4o-mini-tts', 'alloy'),
  elevenlabs: eleven('eleven_v4'),
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
      const { voiceModels, ...rest } = patch;
      const models = { ...record.voiceModels };
      if (voiceModels && 'elevenlabs' in voiceModels) {
        if (voiceModels.elevenlabs) models.elevenlabs = voiceModels.elevenlabs;
        else delete models.elevenlabs;
      }
      record = {
        ...record,
        ...rest,
        voiceCast: { ...record.voiceCast, ...patch.voiceCast },
        voiceModels: models,
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

  it('speaks ElevenLabs on the admin’s model, v4 by default or v3, and names it so the two never share audio', async () => {
    const service = new SceneVoiceService(
      voices(),
      store(),
      clock({ ms: 0 }),
      config({ ...keys, ELEVENLABS_API_KEY: 'e' }),
    );
    let status = await service.choose('elevenlabs', 'admin-1');
    expect(status.models).toMatchObject({
      engine: 'elevenlabs',
      chosen: null,
      current: 'eleven_v4',
      options: [
        { value: 'eleven_v4', label: 'Eleven v4' },
        { value: 'eleven_v3', label: 'Eleven v3' },
      ],
    });
    expect((await service.current()).speech.label().model).toBe('eleven_v4');
    status = await service.chooseModel('eleven_v3', 'admin-1');
    expect(status.models).toMatchObject({
      chosen: 'eleven_v3',
      current: 'eleven_v3',
    });
    expect((await service.current()).speech.label().model).toBe('eleven_v3');
    // The admin page's voices as v3 lists them.
    expect((await service.voiceOptions())[0].description).toBe('eleven_v3');
    status = await service.chooseModel(null, 'admin-1');
    expect(status.models?.current).toBe('eleven_v4');
    await expect(
      service.chooseModel('eleven_v9' as never, 'admin-1'),
    ).rejects.toBeInstanceOf(ValidationError);
    // A library voice the account may lack is named, with its stand-in.
    const girl = status.cast?.roles.find((r) => r.value === 'girl');
    expect(girl).toMatchObject({
      default: CHARACTER_VOICES.elevenlabs.girl[0],
      defaultName: 'Emmaline',
      standIn: ELEVENLABS_PREMADE.Jessica,
    });
    // No ElevenLabs, no model to choose.
    expect(
      (
        await new SceneVoiceService(
          voices(),
          store(),
          clock({ ms: 0 }),
          config(keys),
        ).status()
      ).models,
    ).toBeNull();
  });

  describe('ElevenLabs’ spending caps', () => {
    /** A ledger that says what the film and the day have spent. */
    const ledger = (film: number, day: number) => {
      const asked: Parameters<
        NonNullable<AiCallLogRepository['spentUsd']>
      >[0][] = [];
      const repository: AiCallLogRepository = {
        record: () => Promise.resolve(),
        spentUsd: (filter) => {
          asked.push(filter);
          return Promise.resolve(filter.documentId ? film : day);
        },
      };
      return { repository, asked };
    };
    const make = (
      spent: ReturnType<typeof ledger>,
      settings: Record<string, string> = {},
      at = Date.UTC(2026, 9, 20, 15),
    ) =>
      new SceneVoiceService(
        voices(),
        store(),
        clock({ ms: at }),
        config({ ...keys, ELEVENLABS_API_KEY: 'e', ...settings }),
        spent.repository,
      );

    it('voices a page on ElevenLabs within a film’s cap and the day’s', async () => {
      const spent = ledger(0.5, 2);
      const service = make(spent);
      await service.choose('elevenlabs', 'a');
      // The admin page's status asks the day's spend; the page, its own.
      spent.asked.length = 0;
      const now = await service.current({
        documentId: 'doc-1',
        characters: 1000,
      });
      expect(now.engine).toBe('elevenlabs');
      expect(spent.asked).toEqual([
        { task: 'tts_visual', modelPrefix: 'elevenlabs:', documentId: 'doc-1' },
        {
          task: 'tts_visual',
          modelPrefix: 'elevenlabs:',
          since: new Date(Date.UTC(2026, 9, 20)),
        },
      ]);
    });

    it('hands the page to Gemini once the film would pass its cap, or the day its own', async () => {
      // $0.97 spent of $1, and 1,000 characters at $0.08 a thousand.
      const film = make(ledger(0.97, 0));
      await film.choose('elevenlabs', 'a');
      const past = await film.current({
        documentId: 'doc-1',
        characters: 1000,
      });
      expect([past.engine, past.voice, past.cast]).toEqual([
        'gemini',
        'Kore',
        {},
      ]);
      const day = make(ledger(0, 4.99));
      await day.choose('elevenlabs', 'a');
      expect(
        (await day.current({ documentId: 'doc-1', characters: 1000 })).engine,
      ).toBe('gemini');
      // At v4's launch price the same page fits: $0.022 a thousand.
      const launch = make(ledger(0.97, 0), {}, Date.UTC(2026, 9, 1, 12));
      await launch.choose('elevenlabs', 'a');
      expect(
        (await launch.current({ documentId: 'doc-1', characters: 1000 }))
          .engine,
      ).toBe('elevenlabs');
    });

    it('takes its caps from the settings, none when off, and looks at none without a page or a ledger', async () => {
      expect(capOf(undefined, 1)).toBe(1);
      expect(capOf('2.5', 1)).toBe(2.5);
      expect(capOf('0', 1)).toBeNull();
      expect(capOf('off', 1)).toBeNull();
      const uncapped = make(ledger(50, 500), {
        ELEVENLABS_MAX_USD_PER_FILM: 'off',
        ELEVENLABS_MAX_USD_PER_DAY: '0',
      });
      await uncapped.choose('elevenlabs', 'a');
      expect(
        (await uncapped.current({ documentId: 'd', characters: 5000 })).engine,
      ).toBe('elevenlabs');
      const spent = ledger(50, 500);
      const sample = make(spent);
      await sample.choose('elevenlabs', 'a');
      spent.asked.length = 0;
      expect((await sample.current()).engine).toBe('elevenlabs');
      expect(spent.asked).toEqual([]);
      const status = await sample.status();
      expect(status.models?.caps).toEqual({
        filmUsd: 1,
        dayUsd: 5,
        todayUsd: 500,
      });
    });

    it('stops with plain words when nothing else can take the page', async () => {
      const lone: SceneVoices = {
        gemini: null,
        kokoro: null,
        openai: null,
        elevenlabs: speech('eleven_v4', ELEVENLABS_NARRATOR),
        cartesia: null,
      };
      const service = new SceneVoiceService(
        lone,
        store(),
        clock({ ms: 0 }),
        config({ ELEVENLABS_API_KEY: 'e', SCENE_VOICE_ENGINE: 'elevenlabs' }),
        ledger(5, 0).repository,
      );
      await expect(
        service.current({ documentId: 'd', characters: 100 }),
      ).rejects.toThrow(/spending cap for a film is reached.*no other voice/);
    });
  });
});
