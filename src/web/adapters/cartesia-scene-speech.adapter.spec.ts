import type { ConfigService } from '@nestjs/config';
import {
  CartesiaSceneSpeechAdapter,
  cartesiaGate,
  direction,
  levelled,
  sonicRequests,
  SPEECH_LEVEL,
  sseEvents,
  timedPieces,
} from './cartesia-scene-speech.adapter';
import {
  CARTESIA_LIBRARY,
  CARTESIA_NARRATOR,
} from '../../business/domain/scene-voice';

const RATE = 24000;

const config = (values: Record<string, string> = {}) =>
  ({
    get: (key: string) => ({ CARTESIA_API_KEY: 'test-key', ...values })[key],
  }) as unknown as ConfigService;

/**
 * Sonic's answer to a request, made up, as server-sent events: 0.1 s of
 * quiet, each word 50 ms of sound a character with 0.1 s of quiet after
 * it, and each word's time. A tag is silent and never a word.
 */
function sonic(transcript: string, alter = (word: string) => word): string {
  let t = 0.1;
  const sound: number[] = new Array<number>(Math.round(t * RATE)).fill(0);
  const add = (seconds: number, loud: boolean) => {
    const from = Math.round(t * RATE);
    t += seconds;
    for (let i = from; i < Math.round(t * RATE); i += 1)
      sound.push(loud ? 3000 : 0);
  };
  const events: string[] = [];
  for (const word of transcript.replace(/<[^>]*>/g, ' ').split(/\s+/)) {
    if (!word) continue;
    const start = t;
    add(0.05 * word.length, true);
    events.push(
      JSON.stringify({
        type: 'timestamps',
        status_code: 206,
        done: false,
        word_timestamps: { words: [alter(word)], start: [start], end: [t] },
      }),
    );
    add(0.1, false);
  }
  add(0.1, false);
  const pcm = Buffer.alloc(sound.length * 2);
  sound.forEach((sample, i) => pcm.writeInt16LE(sample, i * 2));
  // The audio in two chunks, as it streams.
  const half = Math.floor(pcm.length / 4) * 2;
  const chunks = [pcm.subarray(0, half), pcm.subarray(half)].map((part) =>
    JSON.stringify({
      type: 'chunk',
      status_code: 206,
      done: false,
      data: part.toString('base64'),
    }),
  );
  return [
    ...chunks.slice(0, 1),
    ...events,
    ...chunks.slice(1),
    JSON.stringify({ type: 'done', status_code: 200, done: true }),
  ]
    .map((data) => `event: message\ndata: ${data}\n\n`)
    .join('');
}

const reply = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  });

type Asked = {
  url: string;
  init: RequestInit;
  body: {
    model_id: string;
    transcript: string;
    voice: string;
    generation_config: { speed: number; volume: number; emotion?: string };
    [key: string]: unknown;
  };
};

/** A fetch that answers every request as Sonic would, and keeps what it was asked. */
function cartesia(
  before: (call: number, asked: Asked) => Response | null = () => null,
) {
  const asked: Asked[] = [];
  const send = jest.fn((url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Asked['body'];
    asked.push({ url, init, body });
    const early = before(asked.length, asked[asked.length - 1]);
    if (early) return Promise.resolve(early);
    return Promise.resolve(
      reply(200, sonic(body.transcript), {
        'content-type': 'text/event-stream',
      }),
    );
  });
  return { send, asked };
}

/** Samples as they are: the mp3 encoder is not what is tested here. */
const raw = (samples: Int16Array) =>
  Promise.resolve(Buffer.from(samples.buffer));
const noWait = () => Promise.resolve();

beforeEach(() => cartesiaGate.reset());

describe('the Cartesia voice’s directions', () => {
  it('carries a direction as one of Sonic’s emotions and a volume, never its words', () => {
    expect(direction('calm and unhurried; clear, unhurried')).toEqual({
      emotion: 'calm',
      volume: 1,
    });
    expect(direction('bright and upbeat; inviting').emotion).toBe('happy');
    expect(direction('curious, with a sense of wonder; warm, steady')).toEqual({
      emotion: 'curious',
      volume: 1,
    });
    expect(direction('gentle and sober; clear, unhurried').emotion).toBe(
      'calm',
    );
    expect(
      direction(
        'as Goliath, a man, boastful, fierce, saying their own line',
        'shout',
      ),
    ).toEqual({ emotion: 'angry', volume: 1.6 });
    expect(direction('as David, a boy, brave, saying their own line')).toEqual({
      emotion: 'confident',
      volume: 1,
    });
    expect(
      direction(
        'as Ada, a girl, saying their own line, thinking it quietly to themselves, not aloud',
      ),
    ).toEqual({ emotion: 'contemplative', volume: 0.6 });
    // A name or a stressed term is not a feeling; nothing named is neutral.
    expect(direction('as Joy, a girl, saying their own line').emotion).toBe(
      null,
    );
    expect(
      direction('speaking slowly, landing it; stressing "sad"').emotion,
    ).toBe(null);
    expect(direction(undefined, 'whisper')).toEqual({
      emotion: null,
      volume: 0.6,
    });
  });

  it('sends a run of one voice said one way as one request, each piece’s pace a speed tag where it changes, an angle bracket as a round one', () => {
    const requests = sonicRequests(
      [
        {
          text: 'The giant came.',
          speed: 0.95,
          pauseAfter: 0.5,
          style: 'calm',
        },
        { text: 'He was tall.', speed: 0.95, pauseAfter: 0.5, style: 'calm' },
        { text: 'Very <tall>.', speed: 1.05, pauseAfter: 0.5, style: 'calm' },
        {
          text: 'Who comes?',
          speed: 1,
          pauseAfter: 0.3,
          style: 'as Goliath, a man, angry, saying their own line',
          voice: CARTESIA_LIBRARY.Clint,
          tone: 'shout',
        },
        { text: 'Then silence.', speed: 0.95, pauseAfter: 1, style: 'sad' },
        { text: '  ', speed: 1, pauseAfter: 0 },
      ],
      CARTESIA_NARRATOR,
    );
    expect(
      requests.map(({ voice, emotion, volume, speed, transcript }) => ({
        voice,
        emotion,
        volume,
        speed,
        transcript,
      })),
    ).toEqual([
      {
        voice: CARTESIA_NARRATOR,
        emotion: 'calm',
        volume: 1,
        speed: 0.95,
        transcript:
          'The giant came. He was tall. <speed ratio="1.05"/> Very (tall).',
      },
      {
        voice: CARTESIA_LIBRARY.Clint,
        emotion: 'angry',
        volume: 1.6,
        speed: 1,
        transcript: 'Who comes?',
      },
      // Another feeling, another request: Cartesia says a feeling changed
      // mid-way is unreliable.
      {
        voice: CARTESIA_NARRATOR,
        emotion: 'sad',
        volume: 1,
        speed: 0.95,
        transcript: 'Then silence.',
      },
    ]);
    expect(requests[0].pieces).toHaveLength(3);
  });

  it('times each piece by Sonic’s words, matched by their letters, and says none when they differ', () => {
    const pieces = [
      { text: 'It was 3 o’clock.', pauseAfter: 0.5 },
      { text: 'Well — go!', pauseAfter: 0.5 },
    ];
    const stamps = {
      words: ['It', 'was', '3', "o'clock.", 'Well', 'go!'],
      start: [0.1, 0.3, 0.5, 0.7, 1.5, 1.9],
      end: [0.2, 0.4, 0.6, 1.1, 1.8, 2.1],
    };
    const timed = timedPieces(pieces, stamps, 1000)!;
    expect(timed.map(({ start, end }) => [start, end])).toEqual([
      [100, 1100],
      [1500, 2100],
    ]);
    // A mark with no letters is no word.
    expect(timed[1].words.map((w) => w.text)).toEqual(['Well', 'go!']);
    expect(
      timedPieces(
        pieces,
        { ...stamps, words: ['It', 'was', 'three', "o'clock.", 'Well', 'go!'] },
        1000,
      ),
    ).toBeNull();
    // A word more than was sent (a direction read aloud) is no match.
    expect(
      timedPieces(
        pieces,
        {
          words: [...stamps.words, 'angrily'],
          start: [...stamps.start, 2.2],
          end: [...stamps.end, 2.5],
        },
        1000,
      ),
    ).toBeNull();
  });

  it('brings every voice to one level of speech, a shout above it and a whisper under, never past clipping', () => {
    const rms = (samples: Int16Array) => {
      let sum = 0;
      let n = 0;
      for (const sample of samples)
        if (sample) {
          sum += sample * sample;
          n += 1;
        }
      return Math.sqrt(sum / n);
    };
    // A quiet voice with long pauses: the pauses do not count.
    const quiet = new Int16Array(RATE);
    for (let i = 0; i < RATE / 4; i += 1) quiet[i] = i % 2 ? 1500 : -1500;
    expect(rms(levelled(quiet, RATE))).toBeCloseTo(SPEECH_LEVEL, -2);
    expect(rms(levelled(quiet, RATE, 0.6))).toBeCloseTo(SPEECH_LEVEL * 0.6, -2);
    // A shout as loud as it may be without clipping.
    const loud = new Int16Array(RATE / 2).map((_, i) =>
      i % 2 ? 12000 : -12000,
    );
    const shout = levelled(loud, RATE, 1.6);
    expect(Math.max(...shout.map(Math.abs))).toBeLessThanOrEqual(31000);
    // Silence stays silence.
    expect(levelled(new Int16Array(100), RATE)).toEqual(new Int16Array(100));
  });

  it('reads server-sent events, passing over what is not JSON', () => {
    expect(
      sseEvents(
        'event: chunk\ndata: {"type":"chunk","data":"AA=="}\n\n: keep-alive\n\ndata: {"type":"done"}\r\n\r\n',
      ),
    ).toEqual([{ type: 'chunk', data: 'AA==' }, { type: 'done' }]);
  });
});

describe('the Cartesia voice', () => {
  const exchange = [
    {
      text: 'The giant stepped out.',
      speed: 0.95,
      pauseAfter: 1,
      style: 'gentle and sober; clear, unhurried',
    },
    {
      text: 'Who comes to fight me?',
      speed: 1,
      pauseAfter: 0.3,
      style: 'as Goliath, a man, boastful, saying their own line',
      voice: CARTESIA_LIBRARY.Clint,
      tone: 'shout' as const,
    },
    {
      text: 'I do.',
      speed: 1.06,
      pauseAfter: 0.8,
      style: 'as David, a boy, brave, saying their own line',
      voice: CARTESIA_LIBRARY.Child,
    },
  ];

  it('voices a page on Sonic 3.6, a request a speaker, with its own word times and the silences the page asked for', async () => {
    const { send, asked } = cartesia();
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    const said = await voice.synthesize({
      text: exchange.map((p) => p.text).join(' '),
      voice: CARTESIA_NARRATOR,
      pieces: exchange,
      lead: 0.5,
      timestamps: true,
    });
    expect(asked).toHaveLength(3);
    expect(asked[0].url).toBe('https://api.cartesia.ai/tts/sse');
    const headers = asked[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Cartesia-Version']).toBe('2026-08-14');
    expect(asked[0].body).toMatchObject({
      model_id: 'sonic-3.6',
      transcript: 'The giant stepped out.',
      voice: CARTESIA_NARRATOR,
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: 24000,
      },
      language: 'en',
      add_timestamps: true,
      use_normalized_timestamps: false,
      generation_config: { speed: 0.95, volume: 1, emotion: 'calm' },
    });
    expect(asked[1].body).toMatchObject({
      transcript: 'Who comes to fight me?',
      voice: CARTESIA_LIBRARY.Clint,
      generation_config: { speed: 1, volume: 1.6, emotion: 'angry' },
    });
    expect(asked[2].body).toMatchObject({
      transcript: 'I do.',
      voice: CARTESIA_LIBRARY.Child,
      generation_config: { speed: 1.06, volume: 1, emotion: 'confident' },
    });
    // Nothing of the direction's own words is sent.
    expect(JSON.stringify(asked.map((a) => a.body))).not.toMatch(
      /Goliath|saying|sober|boastful/,
    );
    expect(said.model).toBe('cartesia:sonic-3.6');
    expect(said.mimeType).toBe('audio/mpeg');
    expect(said.characters).toBe(22 + 22 + 5);
    const words = said.words!;
    expect(words.map((w) => w.text)).toEqual([
      'The',
      'giant',
      'stepped',
      'out.',
      'Who',
      'comes',
      'to',
      'fight',
      'me?',
      'I',
      'do.',
    ]);
    // The first word after the lead and the voice's own breath.
    expect(words[0].startMs).toBe(600);
    // A second of quiet after the narrator's line, as the page asked.
    expect(words[4].startMs - words[3].endMs).toBeGreaterThanOrEqual(995);
    expect(words[4].startMs - words[3].endMs).toBeLessThanOrEqual(1005);
    // Goliath to David: the voice left 0.4 s across the two requests,
    // shortened to the 0.3 s asked.
    const gap = words[9].startMs - words[8].endMs;
    expect(gap).toBeGreaterThanOrEqual(295);
    expect(gap).toBeLessThanOrEqual(305);
    expect(said.pieceStartsMs).toEqual([
      words[0].startMs,
      words[4].startMs,
      words[9].startMs,
    ]);
    // The lead, the quiet after each line, and the hold after the last.
    expect(said.silencesMs[0]).toEqual([0, 500]);
    expect(said.silencesMs).toHaveLength(4);
    const [, end] = said.silencesMs[3];
    expect(end).toBe(said.durationMs);
    expect(end - words[10].endMs).toBeGreaterThanOrEqual(795);
  });

  it('says no words’ times when not asked, and when Sonic’s words are not the page’s makes the silences where it is quiet', async () => {
    const { send } = cartesia();
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    const plain = await voice.synthesize({ text: '', pieces: exchange });
    expect(plain.words).toBeUndefined();
    expect(plain.pieceStartsMs).toHaveLength(3);

    const changed = jest.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { transcript: string };
      return Promise.resolve(
        reply(
          200,
          sonic(body.transcript, (word) => word.replace('giant', 'GIANTS')),
        ),
      );
    });
    const other = new CartesiaSceneSpeechAdapter(
      config(),
      raw,
      changed,
      noWait,
    );
    const pieces = [
      {
        text: 'The giant stepped out. He was tall.',
        speed: 1,
        pauseAfter: 0.6,
        style: 'calm',
      },
      { text: 'Very tall.', speed: 1, pauseAfter: 0.5, style: 'calm' },
    ];
    const said = await other.synthesize({
      text: '',
      pieces,
      timestamps: true,
    });
    // The aligner times it instead; the silence between its sentences is
    // still made, where the voice was quiet.
    expect(said.words).toBeUndefined();
    expect(said.pieceStartsMs).toBeUndefined();
    expect(said.silencesMs.some(([a, b]) => b - a >= 590 && a > 0)).toBe(true);
    expect(said.silencesMs[said.silencesMs.length - 1][1]).toBe(
      said.durationMs,
    );
  });

  it('waits and asks again while the account is busy, as long as Cartesia says, and when the stream fails', async () => {
    const waits: number[] = [];
    const { send, asked } = cartesia((call) =>
      call === 1
        ? reply(
            429,
            { error: 'Too many concurrent requests' },
            { 'retry-after': '3' },
          )
        : call === 2
          ? reply(
              200,
              `data: ${JSON.stringify({ type: 'error', done: true, status_code: 500, message: 'overloaded' })}\n\n`,
            )
          : null,
    );
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });
    const said = await voice.synthesize({ text: 'Hello there.' });
    expect(asked).toHaveLength(3);
    expect(waits[0]).toBeGreaterThanOrEqual(3000);
    expect(waits[1]).toBeGreaterThanOrEqual(2000);
    expect(said.durationMs).toBeGreaterThan(0);
    expect(cartesiaGate.running()).toBe(0);
  });

  it('gives up at once on a refusal, with its status, and says so plainly', async () => {
    const { send, asked } = cartesia(() =>
      reply(402, {
        error_code: 'insufficient_credits',
        message: 'Not enough credits',
      }),
    );
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    await expect(voice.synthesize({ text: 'Hello.' })).rejects.toThrow(
      'insufficient_credits: Not enough credits',
    );
    await expect(voice.synthesize({ text: 'Hello.' })).rejects.toMatchObject({
      status: 402,
    });
    expect(asked).toHaveLength(2);
    await expect(
      new CartesiaSceneSpeechAdapter(
        config({ CARTESIA_API_KEY: '' }),
        raw,
        send,
        noWait,
      ).synthesize({ text: 'Hello.' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('has the narrator say a character’s line when Cartesia has no such voice', async () => {
    const { send, asked } = cartesia((_call, one) =>
      one.body.voice === CARTESIA_LIBRARY.Clint
        ? reply(404, { title: 'Voice not found', message: 'No such voice' })
        : null,
    );
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    const said = await voice.synthesize({
      text: '',
      voice: CARTESIA_NARRATOR,
      pieces: exchange,
      timestamps: true,
    });
    expect(asked.map((a) => a.body.voice)).toEqual(
      expect.arrayContaining([CARTESIA_LIBRARY.Clint, CARTESIA_NARRATOR]),
    );
    expect(
      asked.filter((a) => a.body.transcript === 'Who comes to fight me?'),
    ).toHaveLength(2);
    expect(said.words).toHaveLength(11);

    // A refusal for something else is thrown as it is.
    const other = cartesia((_call, one) =>
      one.body.voice === CARTESIA_LIBRARY.Clint
        ? reply(400, { message: 'Transcript too long' })
        : null,
    );
    await expect(
      new CartesiaSceneSpeechAdapter(
        config(),
        raw,
        other.send,
        noWait,
      ).synthesize({ text: '', voice: CARTESIA_NARRATOR, pieces: exchange }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps to the plan’s requests at once, shared by every scene made side by side', async () => {
    let inFlight = 0;
    let most = 0;
    const send = jest.fn(async (_url: string, init: RequestInit) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const body = JSON.parse(init.body as string) as { transcript: string };
      return reply(200, sonic(body.transcript));
    });
    const one = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    const two = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    await Promise.all([
      ...[1, 2, 3].map(() => one.synthesize({ text: 'One.' })),
      ...[1, 2, 3].map(() => two.synthesize({ text: 'Two.' })),
    ]);
    expect(send).toHaveBeenCalledTimes(6);
    // Two at once unless told otherwise: every plan allows that.
    expect(most).toBe(2);

    cartesiaGate.reset();
    most = 0;
    const single = new CartesiaSceneSpeechAdapter(
      config({ CARTESIA_CONCURRENCY: '1' }),
      raw,
      send,
      noWait,
    );
    await Promise.all([1, 2, 3].map(() => single.synthesize({ text: 'A.' })));
    expect(most).toBe(1);
  });

  it('names the narrator’s voice and the model, lists the account’s English voices, and fetches a sample with the key only from Cartesia', async () => {
    expect(new CartesiaSceneSpeechAdapter(config()).label()).toEqual({
      model: 'sonic-3.6',
      voice: CARTESIA_NARRATOR,
    });
    expect(
      new CartesiaSceneSpeechAdapter(
        config({ CARTESIA_NARRATOR_VOICE: CARTESIA_LIBRARY.Lauren }),
      ).label().voice,
    ).toBe(CARTESIA_LIBRARY.Lauren);
    const urls: string[] = [];
    const heads: (Record<string, string> | undefined)[] = [];
    const send = jest.fn((url: string, init?: RequestInit) => {
      urls.push(url);
      heads.push(init?.headers as Record<string, string> | undefined);
      if (url.includes('/voices?'))
        return Promise.resolve(
          reply(200, {
            data: url.includes('starting_after')
              ? [
                  {
                    id: CARTESIA_LIBRARY.Clyde,
                    name: 'Clyde',
                    description:
                      'Gentle, measured male voice with warmth and clarity for storytelling, informative reads and bedtime stories.',
                    gender: 'masculine',
                    preview_file_url: 'https://files.cartesia.ai/clyde.wav',
                  },
                ]
              : [
                  {
                    id: CARTESIA_LIBRARY.Daisy,
                    name: 'Daisy',
                    description: 'Very young female',
                    gender: 'feminine',
                    preview_file_url: null,
                  },
                ],
            has_more: !url.includes('starting_after'),
            next_page: CARTESIA_LIBRARY.Daisy,
          }),
        );
      if (url.includes('/voices/'))
        return Promise.resolve(
          reply(200, {
            id: CARTESIA_LIBRARY.Leo,
            preview_file_url: 'https://elsewhere.example/leo.wav',
          }),
        );
      return Promise.resolve(
        reply(200, 'RIFF', { 'content-type': 'audio/wav' }),
      );
    });
    const voice = new CartesiaSceneSpeechAdapter(config(), raw, send, noWait);
    const voices = await voice.catalogue();
    expect(urls[0]).toBe(
      'https://api.cartesia.ai/voices?limit=100&language=en&expand%5B%5D=preview_file_url',
    );
    expect(urls[1]).toContain(`starting_after=${CARTESIA_LIBRARY.Daisy}`);
    expect(voices).toEqual([
      {
        id: CARTESIA_LIBRARY.Clyde,
        name: 'Clyde',
        // A long description cut short, for the dropdown.
        description:
          'Gentle, measured male voice with warmth and clarity for storytelling, informative reads…, masculine',
        previewUrl: 'https://files.cartesia.ai/clyde.wav',
      },
      {
        id: CARTESIA_LIBRARY.Daisy,
        name: 'Daisy',
        description: 'Very young female, feminine',
        previewUrl: null,
      },
    ]);
    // A listed sample, from Cartesia's own host: with the key.
    const clyde = await voice.preview(CARTESIA_LIBRARY.Clyde);
    expect(clyde.mimeType).toBe('audio/wav');
    expect(urls[2]).toBe('https://files.cartesia.ai/clyde.wav');
    expect(heads[2]?.Authorization).toBe('Bearer test-key');
    // Not listed: asked for; kept elsewhere: fetched without the key.
    await voice.preview(CARTESIA_LIBRARY.Leo);
    expect(urls[4]).toBe('https://elsewhere.example/leo.wav');
    expect(heads[4]).toBeUndefined();
  });
});
