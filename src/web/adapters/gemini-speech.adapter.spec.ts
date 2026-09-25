import type { ConfigService } from '@nestjs/config';
import { writeWav } from '../../business/domain/wav';
import {
  GeminiSpeechAdapter,
  audioIn,
  geminiItems,
  voiceRuns,
  generateRequest,
  interactionRequest,
  rateOf,
  usageIn,
} from './gemini-speech.adapter';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const wav = (seconds: number) =>
  writeWav({
    sampleRate: 24000,
    samples: new Int16Array(Math.round(seconds * 24000)).fill(1000),
  });

const answer = (audio: Buffer, extra: Record<string, unknown> = {}) => ({
  id: 'x',
  status: 'completed',
  steps: [
    {
      type: 'model_output',
      content: [
        {
          type: 'audio',
          mime_type: 'audio/wav',
          data: audio.toString('base64'),
        },
      ],
    },
  ],
  ...extra,
});

const reply = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  });

describe('the Gemini voice', () => {
  it('sends only the words, never a mark it could read aloud', () => {
    const items = geminiItems([
      { text: 'Why do we breathe?', pauseAfter: 0.75, style: 'asking' },
      { text: '  ', pauseAfter: 0.5 },
      { text: 'To burn our food.', pauseAfter: 0.9 },
    ]);
    expect(items).toEqual([
      { text: 'Why do we breathe?', style: 'asking' },
      { text: 'To burn our food.', style: null },
    ]);
    expect(JSON.stringify(items)).not.toMatch(/pause/iu);
  });

  it('parts the page where a long silence falls, so the silence is made, not read', () => {
    const piece = (text: string, pauseAfter: number, voice?: string) => ({
      text,
      pauseAfter,
      ...(voice ? { voice } : {}),
    });
    const runs = voiceRuns([
      piece('One.', 0.3),
      piece('Two.', 0.8),
      piece('Three.', 0.4),
      piece('Four.', 1.2, 'Puck'),
      piece('Five.', 0.3, 'Puck'),
    ]);
    // After each long silence ("Two.", "Four.") and where the voice changes.
    expect(runs.map((r) => r.pieces.map((p) => p.text).join(' '))).toEqual([
      'One. Two.',
      'Three.',
      'Four.',
      'Five.',
    ]);
    // Past the most requests, only the longest silences part it.
    const many = Array.from({ length: 12 }, (_, i) =>
      piece(`S${i}.`, 0.6 + i / 100),
    );
    const few = voiceRuns(many, 4);
    expect(few).toHaveLength(4);
    expect(few.map((r) => r.pieces[r.pieces.length - 1].text)).toEqual([
      'S8.',
      'S9.',
      'S10.',
      'S11.',
    ]);
  });

  it('asks each route the way it documents, and keeps nothing on Google', () => {
    const items = [{ text: 'Hello there.', style: 'warm' }];
    const one = interactionRequest('gemini-3.8-flash-tts', 'Sulafat', items);
    expect(one.url).toMatch(/\/v1beta\/interactions$/);
    expect(one.body).toMatchObject({
      model: 'gemini-3.8-flash-tts',
      store: false,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Sulafat' }] },
    });
    expect(JSON.stringify(one.body)).toContain('"speech_metadata"');
    const two = generateRequest('gemini-3.8-flash-tts', 'Sulafat', items);
    expect(two.url).toMatch(/models\/gemini-3\.8-flash-tts:generateContent$/);
    expect(JSON.stringify(two.body)).toContain('"voiceName":"Sulafat"');
  });

  it('finds the audio and the tokens wherever either route puts them', () => {
    expect(audioIn(answer(Buffer.from('x')))?.mimeType).toBe('audio/wav');
    const legacy = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAA' },
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 250 },
    };
    expect(audioIn(legacy)).toEqual({
      data: 'AAAA',
      mimeType: 'audio/L16;rate=24000',
    });
    expect(usageIn(legacy)).toEqual({ tokensIn: 40, tokensOut: 250 });
    expect(usageIn({ usage: { input_tokens: 12, output_tokens: 99 } })).toEqual(
      {
        tokensIn: 12,
        tokensOut: 99,
      },
    );
    expect(usageIn({})).toBeNull();
    expect(audioIn({ steps: [] })).toBeNull();
    expect(rateOf('audio/L16;codec=pcm;rate=16000')).toBe(16000);
  });

  it('speaks a page: the WAV becomes an mp3 of the same length, named by its model', async () => {
    const sent: RequestInit[] = [];
    const adapter = new GeminiSpeechAdapter(
      config({ GEMINI_API_KEY: 'k' }),
      (samples, rate) => {
        expect(rate).toBe(24000);
        return Promise.resolve(Buffer.from(`mp3:${samples.length}`));
      },
      (_url, init) => {
        sent.push(init);
        return Promise.resolve(reply(200, answer(wav(2.5))));
      },
    );
    const said = await adapter.synthesize({
      text: 'Hi.',
      pieces: [{ text: 'Hi.', speed: 1, pauseAfter: 0.3, style: 'warm' }],
    });
    expect(said.audio.toString()).toBe('mp3:60000');
    expect(said.durationMs).toBe(2500);
    expect(said.model).toBe('gemini:gemini-3.8-flash-tts');
    expect(said.mimeType).toBe('audio/mpeg');
    expect((sent[0].headers as Record<string, string>)['x-goog-api-key']).toBe(
      'k',
    );
  });

  it('speaks each run of one voice as its own request, joined by its silence, after the lead', async () => {
    const bodies: { voice: unknown; texts: string[] }[] = [];
    const adapter = new GeminiSpeechAdapter(
      config({ GEMINI_API_KEY: 'k' }),
      (samples) => Promise.resolve(Buffer.from(`mp3:${samples.length}`)),
      (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as {
          generation_config: { speech_config: { voice: string }[] };
          input: { content: { text: string }[] }[];
        };
        bodies.push({
          voice: body.generation_config.speech_config[0].voice,
          texts: body.input[0].content.map((c) => c.text),
        });
        return Promise.resolve(reply(200, answer(wav(1))));
      },
    );
    const said = await adapter.synthesize({
      text: 'x',
      lead: 2,
      pieces: [
        { text: 'A fox steps out.', speed: 1, pauseAfter: 0.4 },
        {
          text: '"You are late,"',
          speed: 1,
          pauseAfter: 0.12,
          voice: 'Fenrir',
        },
        { text: 'says the fox.', speed: 1, pauseAfter: 0.5 },
      ],
    });
    expect(bodies).toEqual([
      { voice: 'Sulafat', texts: ['A fox steps out.'] },
      { voice: 'Fenrir', texts: ['"You are late,"'] },
      { voice: 'Sulafat', texts: ['says the fox.'] },
    ]);
    // Two seconds of quiet, three seconds said, and the two silences between runs.
    expect(said.durationMs).toBe(2000 + 3000 + 400 + 120);
  });

  it('waits out a rate limit, and gives up at once on a refusal', async () => {
    let calls = 0;
    const limited = new GeminiSpeechAdapter(
      config({ GEMINI_API_KEY: 'k' }),
      () => Promise.resolve(Buffer.from('mp3')),
      () => {
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? reply(
                429,
                { error: { message: 'slow down' } },
                { 'retry-after': '0.01' },
              )
            : reply(200, answer(wav(0.5))),
        );
      },
    );
    await expect(limited.synthesize({ text: 'Hello.' })).resolves.toMatchObject(
      {
        durationMs: 500,
      },
    );
    expect(calls).toBe(2);

    calls = 0;
    const refusing = new GeminiSpeechAdapter(
      config({ GEMINI_API_KEY: 'k' }),
      () => Promise.resolve(Buffer.from('mp3')),
      () => {
        calls += 1;
        return Promise.resolve(
          reply(400, { error: { message: 'no such voice' } }),
        );
      },
    );
    const refusal = await refusing
      .synthesize({ text: 'Hello.' })
      .catch((error: Error & { status?: number }) => error);
    expect(refusal).toMatchObject({ status: 400 });
    expect((refusal as Error).message).toContain('no such voice');
    expect(calls).toBe(1);
  });

  it('refuses plainly when no key is set', async () => {
    const adapter = new GeminiSpeechAdapter(config({}));
    await expect(adapter.synthesize({ text: 'Hello.' })).rejects.toMatchObject({
      status: 401,
    });
  });
});
