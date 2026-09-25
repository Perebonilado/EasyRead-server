import type { ConfigService } from '@nestjs/config';
import { writeWav } from '../../business/domain/wav';
import {
  GeminiSpeechAdapter,
  audioIn,
  geminiItems,
  voiceRuns,
  sentenceGaps,
  withPauses,
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

  it('asks once a voice: a page in one voice is one request, a story’s character its own', () => {
    const piece = (text: string, voice?: string) => ({
      text,
      pauseAfter: 0.8,
      ...(voice ? { voice } : {}),
    });
    const runs = voiceRuns([
      piece('One.'),
      piece('Two.'),
      piece('Three.', 'Puck'),
      piece('Four.', 'Puck'),
      piece('Five.'),
    ]);
    expect(runs.map((r) => r.pieces.map((p) => p.text).join(' '))).toEqual([
      'One. Two.',
      'Three. Four.',
      'Five.',
    ]);
  });

  it('finds the quiet after each sentence, and makes it as long as the page asked', () => {
    const rate = 1000;
    // Said, quiet, said, quiet, said: 1 s, 0.2 s, 2 s, 0.15 s, 1 s.
    const spans: [number, boolean][] = [
      [1000, true],
      [200, false],
      [2000, true],
      [150, false],
      [1000, true],
    ];
    const samples = new Int16Array(4350);
    let at = 0;
    for (const [length, loud] of spans) {
      if (loud)
        for (let i = 0; i < length; i += 1)
          samples[at + i] = i % 2 ? 4000 : -4000;
      at += length;
    }
    // A short quiet inside the long sentence is not its end.
    samples.fill(0, 1800, 1890);
    const lengths = [10, 20, 10];
    expect(sentenceGaps(samples, rate, lengths)).toEqual([
      [1000, 1200],
      [3200, 3350],
    ]);
    const paused = withPauses(samples, rate, [
      { text: 'a'.repeat(10), pauseAfter: 0.7 },
      { text: 'b'.repeat(20), pauseAfter: 0.1 },
      { text: 'c'.repeat(10), pauseAfter: 0 },
    ]);
    // The first quiet made up to 0.7 s; the second already long enough.
    expect(paused.length).toBe(4350 + 500);
    expect(withPauses(samples, rate, [{ text: 'x', pauseAfter: 1 }])).toBe(
      samples,
    );
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
    // Each run a steady tone: no quiet inside it to lengthen.
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
