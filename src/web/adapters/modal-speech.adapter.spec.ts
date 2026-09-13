import { ConfigService } from '@nestjs/config';
import { ModalSpeechAdapter } from './modal-speech.adapter';

/** A config from a plain object, the way the adapter reads .env. */
function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`${key} is not set`);
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('ModalSpeechAdapter', () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = global.fetch;

  beforeEach(() => {
    calls.length = 0;
    global.fetch = (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      });
      return Promise.resolve(
        new Response(Buffer.from('mp3'), {
          status: 200,
          headers: { 'x-audio-seconds': '12.5' },
        }),
      );
    };
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  const base = { MODAL_TTS_URL: 'https://voice.test/', MODAL_TTS_TOKEN: 't' };

  it('hands Qwen the delivery note and the language, under its own labels', async () => {
    const adapter = new ModalSpeechAdapter(config(base));
    expect(adapter.label()).toEqual({ model: 'qwen3-tts-0.6b', voice: 'ryan' });
    const result = await adapter.synthesize({
      text: 'A page.',
      instructions: 'Slowly.',
      speed: 0.9,
    });
    expect(result.model).toBe('modal:qwen3-tts-0.6b');
    expect(calls[0].url).toBe('https://voice.test/v1/audio/speech');
    expect(calls[0].body).toEqual({
      input: 'A page.',
      voice: 'ryan',
      instructions: 'Slowly.',
      language: 'English',
      response_format: 'mp3',
    });
  });

  it('hands Kokoro the speed and no note, under its own labels', async () => {
    const adapter = new ModalSpeechAdapter(
      config({ ...base, MODAL_TTS_ENGINE: 'kokoro' }),
    );
    expect(adapter.label()).toEqual({
      model: 'kokoro-82m',
      voice: 'am_michael',
    });
    const result = await adapter.synthesize({
      text: 'A page.',
      instructions: 'Slowly.',
      speed: 0.9,
    });
    expect(result.model).toBe('modal:kokoro-82m');
    expect(result.durationMs).toBe(12500);
    expect(calls[0].body).toEqual({
      input: 'A page.',
      voice: 'am_michael',
      speed: 0.9,
      response_format: 'mp3',
    });
  });

  it('hands Kokoro the page as pieces when it has them, with the silence after each', async () => {
    const adapter = new ModalSpeechAdapter(
      config({ ...base, MODAL_TTS_ENGINE: 'kokoro' }),
    );
    await adapter.synthesize({
      text: 'A page. With a figure.',
      speed: 1,
      pieces: [
        { text: 'A page.', speed: 1, pauseAfter: 0.75 },
        { text: 'With a [figure](+1).', speed: 0.93, pauseAfter: 0 },
      ],
    });
    expect(calls[0].body).toEqual({
      voice: 'am_michael',
      pieces: [
        { text: 'A page.', speed: 1, pause_after: 0.75 },
        { text: 'With a [figure](+1).', speed: 0.93, pause_after: 0 },
      ],
      response_format: 'mp3',
    });
  });

  it('lets the settings name the voice and the model for either engine', () => {
    const adapter = new ModalSpeechAdapter(
      config({
        ...base,
        MODAL_TTS_ENGINE: 'kokoro',
        MODAL_TTS_VOICE: 'bm_george',
        MODAL_TTS_MODEL: 'kokoro-82m-uk',
      }),
    );
    expect(adapter.label()).toEqual({
      model: 'kokoro-82m-uk',
      voice: 'bm_george',
    });
  });

  it('fails once on a refusal, with the status on the error', async () => {
    global.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: 'no voice named x' }), {
          status: 400,
        }),
      );
    const adapter = new ModalSpeechAdapter(
      config({ ...base, MODAL_TTS_ENGINE: 'kokoro' }),
    );
    await expect(adapter.synthesize({ text: 'A page.' })).rejects.toMatchObject(
      { status: 400 },
    );
  });
});
