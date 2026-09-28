import type { ConfigService } from '@nestjs/config';
import {
  ElevenLabsSceneSpeechAdapter,
  audioTags,
  dialogueRequests,
  elevenLabsGate,
  seedOf,
  withSilences,
  type DialogueAnswer,
} from './elevenlabs-scene-speech.adapter';
import {
  ELEVENLABS_NARRATOR,
  ELEVENLABS_PREMADE,
} from '../../business/domain/scene-voice';

const RATE = 24000;

const config = (values: Record<string, string> = {}) =>
  ({
    get: (key: string) => ({ ELEVENLABS_API_KEY: 'test-key', ...values })[key],
  }) as unknown as ConfigService;

/**
 * ElevenLabs' answer to a dialogue request, made up: each line's tags
 * silent for 0.2 s, each character after them 50 ms of sound, then 0.1 s
 * of quiet, with the times and segments `with-timestamps` gives.
 */
function dialogue(
  inputs: { text: string; voice_id: string }[],
): DialogueAnswer {
  let t = 0;
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const segments: NonNullable<DialogueAnswer['voice_segments']> = [];
  const sound: number[] = [];
  const add = (seconds: number, loud: boolean) => {
    const from = Math.round(t * RATE);
    t += seconds;
    for (let i = from; i < Math.round(t * RATE); i += 1)
      sound.push(loud ? 3000 : 0);
  };
  inputs.forEach(({ text }, i) => {
    const begin = t;
    const first = characters.length;
    const tags = /^(?:\[[^\]]*\]\s*)*/.exec(text)![0].length;
    [...text].forEach((char, k) => {
      starts.push(t);
      add(k < tags ? 0.2 / tags : 0.05, k >= tags);
      ends.push(t);
      characters.push(char);
    });
    add(0.1, false);
    segments.push({
      start_time_seconds: begin,
      end_time_seconds: t,
      character_start_index: first,
      character_end_index: characters.length,
      dialogue_input_index: i,
    });
  });
  const pcm = Buffer.alloc(sound.length * 2);
  sound.forEach((sample, i) => pcm.writeInt16LE(sample, i * 2));
  return {
    audio_base64: pcm.toString('base64'),
    alignment: {
      characters,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    },
    voice_segments: segments,
  };
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

/** A fetch that answers every dialogue request as ElevenLabs would, and keeps what it was asked. */
function elevenLabs(
  before: (call: number) => Response | null = () => null,
  headers: Record<string, string> = {},
) {
  const asked: {
    url: string;
    init: RequestInit;
    body: Record<string, unknown>;
  }[] = [];
  const send = jest.fn((url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as {
      inputs: { text: string; voice_id: string }[];
    };
    asked.push({ url, init, body });
    const early = before(asked.length);
    if (early) return Promise.resolve(early);
    return Promise.resolve(
      reply(200, dialogue(body.inputs), {
        'character-cost': String(
          body.inputs.reduce((n, input) => n + input.text.length, 0),
        ),
        'maximum-concurrent-requests': '3',
        ...headers,
      }),
    );
  });
  return { send, asked };
}

/** Samples as they are: the mp3 encoder is not what is tested here. */
const raw = (samples: Int16Array) =>
  Promise.resolve(Buffer.from(samples.buffer));
const noWait = () => Promise.resolve();

beforeEach(() => elevenLabsGate.reset());

describe('the ElevenLabs voice’s directions', () => {
  it('carries a direction as one of v3’s audio tags, never its words', () => {
    expect(audioTags('calm and unhurried; clear, unhurried')).toEqual(['calm']);
    expect(audioTags('bright and upbeat; inviting')).toEqual(['happy']);
    expect(audioTags('curious, with a sense of wonder; asking')).toEqual([
      'curious',
    ]);
    expect(
      audioTags('as Goliath, a man, boastful, angry, saying their own line'),
    ).toEqual(['angry']);
    expect(
      audioTags('as David, a boy, brave, saying their own line', 'shout'),
    ).toEqual(['shouting']);
    expect(
      audioTags(
        'as Ada, a girl, saying their own line, thinking it quietly to themselves, not aloud',
      ),
    ).toEqual(['whispers']);
    // A name or a stressed term is not a feeling.
    expect(audioTags('as Joy, a girl, saying their own line')).toEqual([]);
    expect(audioTags('clear, not rushed; stressing "sadness"')).toEqual([]);
    expect(audioTags(undefined, 'whisper')).toEqual(['whispers']);
    expect(audioTags('whispering', 'whisper')).toEqual(['whispers']);
  });

  it('sends each piece as a line in its speaker’s voice, its tags before its words and a bracket as a round one', () => {
    const [lines] = dialogueRequests(
      [
        {
          text: 'The giant stepped out.',
          pauseAfter: 0.5,
          style: 'gentle and sober',
        },
        {
          text: 'Who comes to fight me? [1]',
          pauseAfter: 0.3,
          style: 'as Goliath, a man, angry, saying their own line',
          voice: ELEVENLABS_PREMADE.Harry,
          tone: 'shout',
        },
        { text: '   ', pauseAfter: 0.3 },
      ],
      ELEVENLABS_NARRATOR,
    );
    expect(
      lines.map(({ text, voice_id, tagged }) => [text, voice_id, tagged]),
    ).toEqual([
      ['[serious] The giant stepped out.', ELEVENLABS_NARRATOR, 10],
      [
        '[shouting] [angry] Who comes to fight me? (1)',
        ELEVENLABS_PREMADE.Harry,
        19,
      ],
    ]);
  });

  it('parts a long page into requests ElevenLabs takes, and seeds the same lines alike', () => {
    const sentence = `${'word '.repeat(80).trim()}.`;
    const requests = dialogueRequests(
      Array.from({ length: 10 }, () => ({ text: sentence, pauseAfter: 0.4 })),
      ELEVENLABS_NARRATOR,
    );
    expect(requests.length).toBeGreaterThan(1);
    for (const lines of requests)
      expect(lines.reduce((n, l) => n + l.text.length, 0)).toBeLessThanOrEqual(
        1800,
      );
    expect(seedOf(requests[0])).toBe(seedOf(requests[0]));
    expect(seedOf(requests[0])).not.toBe(
      seedOf([{ text: 'Other.', voice_id: ELEVENLABS_NARRATOR }]),
    );
  });

  it('lets a silence in at the quiet between two lines, never cutting the quiet there', () => {
    const samples = new Int16Array(RATE).fill(1000);
    samples.fill(0, 10_000, 12_400); // 0.1 s of quiet
    const {
      samples: out,
      quiet,
      moved,
    } = withSilences(
      samples,
      RATE,
      [
        { start: 0, end: 10_000 },
        { start: 12_400, end: RATE },
      ],
      [0.5, 0],
    );
    expect(out.length).toBe(RATE + 12_000 - 2_400);
    expect(quiet[0]).toEqual([10_000, 22_000]);
    expect(moved).toEqual([0, 9_600]);
  });
  it('shortens a longer silence the voice left to the pause asked, from its middle, never into sound', () => {
    const samples = new Int16Array(2 * RATE).fill(1000);
    samples.fill(0, RATE - 12_000, RATE + 12_000); // a second of silence
    // A breath in it, near its start, is kept.
    samples.fill(500, RATE - 11_000, RATE - 10_000);
    const {
      samples: out,
      quiet,
      moved,
    } = withSilences(
      samples,
      RATE,
      [
        { start: 0, end: RATE - 12_000 },
        { start: RATE + 12_000, end: 2 * RATE },
      ],
      [0.3, 0],
    );
    // The longest silence is from after the breath: 22,000 samples, less
    // 40 ms either side, is as much as may go; the pause asks less gone.
    const gone = 24_000 - Math.round(0.3 * RATE);
    expect(out.length).toBe(2 * RATE - gone);
    expect(moved).toEqual([0, -gone]);
    expect(quiet[0]).toEqual([RATE - 12_000, RATE + 12_000 - gone]);
    // The breath is where it was.
    expect(out[RATE - 10_500]).toBe(500);
    // A pause asked longer than the voice's own is never shortened.
    expect(
      withSilences(
        samples,
        RATE,
        [
          { start: 0, end: RATE - 12_000 },
          { start: RATE + 12_000, end: 2 * RATE },
        ],
        [1.2, 0],
      ).samples.length,
    ).toBe(2 * RATE + Math.round(0.2 * RATE));
  });
});

describe('the ElevenLabs voice', () => {
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
      style: 'as Goliath, a man, angry, saying their own line',
      voice: ELEVENLABS_PREMADE.Harry,
      tone: 'shout' as const,
    },
    {
      text: 'I do.',
      speed: 1,
      pauseAfter: 0.8,
      style: 'as David, a boy, brave, saying their own line',
      voice: ELEVENLABS_PREMADE.Liam,
    },
  ];

  it('voices a page in one dialogue request on Eleven v3, with its own word times and the silences the page asked for', async () => {
    const { send, asked } = elevenLabs();
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const said = await voice.synthesize({
      text: exchange.map((p) => p.text).join(' '),
      voice: ELEVENLABS_NARRATOR,
      pieces: exchange,
      lead: 0.5,
      timestamps: true,
    });
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe(
      'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=pcm_24000',
    );
    expect(
      (asked[0].init.headers as Record<string, string>)['xi-api-key'],
    ).toBe('test-key');
    expect(asked[0].body).toMatchObject({
      model_id: 'eleven_v3',
      settings: { stability: 0.5 },
      inputs: [
        {
          text: '[serious] The giant stepped out.',
          voice_id: ELEVENLABS_NARRATOR,
        },
        {
          text: '[shouting] [angry] Who comes to fight me?',
          voice_id: ELEVENLABS_PREMADE.Harry,
        },
        { text: 'I do.', voice_id: ELEVENLABS_PREMADE.Liam },
      ],
    });
    expect(typeof asked[0].body.seed).toBe('number');
    // Nothing of the direction's own words is sent.
    expect(JSON.stringify(asked[0].body)).not.toMatch(/Goliath|saying|sober/);
    expect(said.model).toBe('elevenlabs:eleven_v3');
    expect(said.mimeType).toBe('audio/mpeg');
    expect(said.characters).toBe(32 + 41 + 5);
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
    // The first word after the lead and the tag's quiet.
    expect(words[0].startMs).toBe(700);
    // A second of quiet after the narrator's line, as the page asked.
    expect(words[4].startMs - words[3].endMs).toBeGreaterThanOrEqual(995);
    expect(words[4].startMs - words[3].endMs).toBeLessThanOrEqual(1005);
    // Goliath to David: the voice left 0.15 s, made up to the 0.3 s asked.
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

  it('says no words’ times when not asked, and none when ElevenLabs timed other characters than it was sent', async () => {
    const { send } = elevenLabs();
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const plain = await voice.synthesize({ text: '', pieces: exchange });
    expect(plain.words).toBeUndefined();
    expect(plain.pieceStartsMs).toHaveLength(3);

    const changed = jest.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        inputs: { text: string; voice_id: string }[];
      };
      const answer = dialogue(
        body.inputs.map((input) => ({
          ...input,
          text: input.text.replace('giant', 'GIANT'),
        })),
      );
      return Promise.resolve(reply(200, answer));
    });
    const other = new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      changed,
      noWait,
    );
    const said = await other.synthesize({
      text: '',
      pieces: exchange,
      timestamps: true,
    });
    // The aligner times it instead.
    expect(said.words).toBeUndefined();
    expect(said.pieceStartsMs).toBeUndefined();
    expect(said.characters).toBe(32 + 41 + 5);
  });

  it('waits and asks again while the account is busy, as long as ElevenLabs says', async () => {
    const waits: number[] = [];
    const { send, asked } = elevenLabs((call) =>
      call === 1
        ? reply(
            429,
            {
              detail: {
                status: 'concurrent_limit_exceeded',
                message: 'Too many concurrent requests',
              },
            },
            { 'retry-after': '3' },
          )
        : call === 2
          ? reply(503, { detail: { status: 'system_busy', message: 'busy' } })
          : null,
    );
    const voice = new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      send,
      (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    );
    const said = await voice.synthesize({ text: '', pieces: exchange });
    expect(asked).toHaveLength(3);
    expect(waits[0]).toBeGreaterThanOrEqual(3000);
    expect(waits[1]).toBeGreaterThanOrEqual(2000);
    expect(said.durationMs).toBeGreaterThan(0);
    expect(elevenLabsGate.running()).toBe(0);
  });

  it('gives up at once on a refusal, with its status, and says so plainly', async () => {
    const { send, asked } = elevenLabs(() =>
      reply(402, {
        detail: {
          status: 'insufficient_credits',
          message: 'Not enough credits',
        },
      }),
    );
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    await expect(
      voice.synthesize({ text: '', pieces: exchange }),
    ).rejects.toThrow('insufficient_credits');
    await expect(
      voice.synthesize({ text: '', pieces: exchange }),
    ).rejects.toMatchObject({ status: 402 });
    expect(asked).toHaveLength(2);
    await expect(
      new ElevenLabsSceneSpeechAdapter(
        config({ ELEVENLABS_API_KEY: '' }),
        raw,
        send,
        noWait,
      ).synthesize({ text: 'Hello.' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('keeps to the account’s requests at once, shared by every scene made side by side', async () => {
    let inFlight = 0;
    let most = 0;
    const send = jest.fn(async (_url: string, init: RequestInit) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const body = JSON.parse(init.body as string) as {
        inputs: { text: string; voice_id: string }[];
      };
      return reply(200, dialogue(body.inputs), {
        'maximum-concurrent-requests': '2',
      });
    });
    const one = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const two = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    await Promise.all([
      ...[1, 2, 3].map(() => one.synthesize({ text: 'One.' })),
      ...[1, 2, 3].map(() => two.synthesize({ text: 'Two.' })),
    ]);
    expect(send).toHaveBeenCalledTimes(6);
    expect(most).toBe(2);

    elevenLabsGate.reset();
    most = 0;
    const single = new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_CONCURRENCY: '1' }),
      raw,
      send,
      noWait,
    );
    await Promise.all([1, 2, 3].map(() => single.synthesize({ text: 'A.' })));
    expect(most).toBe(1);
  });

  it('names the narrator’s voice and the model, and lists the account’s voices for the admin', async () => {
    expect(new ElevenLabsSceneSpeechAdapter(config()).label()).toEqual({
      model: 'eleven_v3',
      voice: ELEVENLABS_NARRATOR,
    });
    expect(
      new ElevenLabsSceneSpeechAdapter(
        config({ ELEVENLABS_NARRATOR_VOICE: ELEVENLABS_PREMADE.Alice }),
      ).label().voice,
    ).toBe(ELEVENLABS_PREMADE.Alice);
    const send = jest.fn((url: string) =>
      Promise.resolve(
        reply(200, {
          voices: [
            {
              voice_id: ELEVENLABS_PREMADE.George,
              name: 'George - Warm, Captivating Storyteller',
              preview_url: 'https://example.test/george.mp3',
              labels: { gender: 'male', age: 'middle_aged', accent: 'british' },
            },
            { voice_id: ELEVENLABS_PREMADE.Bill, name: 'Bill', labels: {} },
          ],
          has_more: url.includes('next_page_token') ? false : true,
          next_page_token: 'p2',
        }),
      ),
    );
    const voices = await new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      send,
      noWait,
    ).catalogue();
    expect(send).toHaveBeenCalledTimes(2);
    expect(voices[0]).toEqual({
      id: ELEVENLABS_PREMADE.Bill,
      name: 'Bill',
      description: '',
      previewUrl: null,
    });
    expect(voices[2]).toEqual({
      id: ELEVENLABS_PREMADE.George,
      name: 'George',
      description: 'Warm, Captivating Storyteller, male, middle aged, british',
      previewUrl: 'https://example.test/george.mp3',
    });
  });
});
