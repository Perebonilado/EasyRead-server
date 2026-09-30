import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import {
  AIM_TAG,
  DELIVERY_TAG,
  ElevenLabsSceneSpeechAdapter,
  FACE_SOUND,
  FACE_TAG,
  V4_TAGS,
  audioTags,
  continuityOf,
  dialogueRequests,
  elevenLabsGate,
  plainRefusal,
  seedOf,
  spokenLines,
  v4Tags,
  withSilences,
  type DialogueAnswer,
  type DialogueLine,
} from './elevenlabs-scene-speech.adapter';
import {
  ELEVENLABS_LIBRARY,
  ELEVENLABS_NARRATOR,
  ELEVENLABS_PREMADE,
} from '../../business/domain/scene-voice';
import { RECIPE_NAMES } from '../../business/domain/scene-face-rig';
import { LINE_AIMS } from '../../business/domain/scene-performance';
import {
  followWork,
  type RetryNotice,
} from '../../business/domain/work-progress';

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
    const voice = new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_SCENE_MODEL: 'eleven_v3' }),
      raw,
      send,
      noWait,
    );
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
      model: 'eleven_v4',
      voice: ELEVENLABS_NARRATOR,
    });
    // The admin's model over the deployment's: its label names it.
    expect(
      new ElevenLabsSceneSpeechAdapter(
        config({ ELEVENLABS_SCENE_MODEL: 'eleven_v4' }),
      )
        .withModel('eleven_v3')
        .label().model,
    ).toBe('eleven_v3');
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

describe('Eleven v4’s tags', () => {
  it('says each face a line is said with, what it does, and a lesson sentence’s delivery as one of v4’s feelings', () => {
    expect(v4Tags({ direction: { said: 'terror' } })).toEqual(['terrified']);
    expect(v4Tags({ direction: { said: 'furious' } })).toEqual(['furious']);
    expect(v4Tags({ direction: { said: 'Shy' } })).toEqual(['hesitant']);
    // The face said first; the aim when there is none.
    expect(v4Tags({ direction: { said: 'joy', aim: 'accuses' } })).toEqual([
      'happy',
    ]);
    expect(v4Tags({ direction: { aim: 'comforts' } })).toEqual(['softly']);
    expect(v4Tags({ direction: { delivery: 'question' } })).toEqual([
      'curious',
    ]);
    // A face or aim with none falls to the direction's words, as v3's did.
    expect(
      v4Tags({
        style: 'as Ada, a girl, nervous, saying their own line',
        direction: { said: 'neutral' },
      }),
    ).toEqual(['nervous']);
    expect(v4Tags({ style: 'calm and warm; clear; natural pace' })).toEqual([
      'calm',
    ]);
  });

  it('stacks up to three: how loud, the feeling, slowly past the stretch, a sound the face makes, the feeling beneath', () => {
    expect(
      v4Tags({ tone: 'whisper', direction: { said: 'relieved' } }),
    ).toEqual(['whispers', 'calm', 'sighs']);
    expect(v4Tags({ direction: { said: 'joy', felt: 'worried' } })).toEqual([
      'happy',
      'nervous',
    ]);
    expect(v4Tags({ direction: { aim: 'jokes' } })).toEqual([
      'mischievously',
      'laughs',
    ]);
    // A child's lesson asks slower than the stretch reaches: v4 is told.
    expect(
      v4Tags({ speed: 0.7, style: 'calm and warm; clear; unhurried pace' }),
    ).toEqual(['calm', 'slowly']);
    expect(v4Tags({ speed: 0.9, style: 'calm and warm' })).toEqual(['calm']);
    const most = v4Tags({
      tone: 'shout',
      speed: 0.6,
      direction: { said: 'shock', felt: 'terror' },
    });
    expect(most).toEqual(['shouting', 'surprised', 'slowly']);
    // A name or a stressed term is still not a feeling.
    expect(v4Tags({ style: 'as Joy, a girl, saying their own line' })).toEqual(
      [],
    );
  });

  it('sends only tags from its list, never a sound effect, for every face and aim there is', () => {
    const allowed = new Set<string>(V4_TAGS);
    for (const tag of [
      ...Object.values(FACE_TAG),
      ...Object.values(FACE_SOUND),
      ...Object.values(AIM_TAG),
      ...Object.values(DELIVERY_TAG),
    ])
      if (tag) expect(allowed.has(tag)).toBe(true);
    // Every face the rig draws and every aim is known.
    for (const face of RECIPE_NAMES) expect(face in FACE_TAG).toBe(true);
    for (const face of RECIPE_NAMES)
      for (const aim of LINE_AIMS)
        for (const tone of [undefined, 'whisper', 'shout'] as const) {
          const tags = v4Tags({
            tone,
            speed: 0.7,
            direction: { said: face, felt: 'terror', aim },
          });
          expect(tags.length).toBeLessThanOrEqual(3);
          for (const tag of tags) expect(allowed.has(tag)).toBe(true);
        }
    for (const tag of V4_TAGS)
      expect(tag).not.toMatch(
        /door|creak|applause|footstep|thunder|music|explosion|gunshot|clap|bell|wind|rain/,
      );
  });

  it('puts v4’s tags before each line’s words, and keeps v3’s two on v3', () => {
    const pieces = [
      {
        text: 'Run!',
        pauseAfter: 0.3,
        voice: ELEVENLABS_PREMADE.Liam,
        tone: 'shout' as const,
        direction: { said: 'terror', felt: 'determined' },
      },
    ];
    expect(
      dialogueRequests(pieces, ELEVENLABS_NARRATOR, 'eleven_v4')[0][0].text,
    ).toBe('[shouting] [terrified] [serious] Run!');
    expect(
      dialogueRequests(pieces, ELEVENLABS_NARRATOR, 'eleven_v3')[0][0].text,
    ).toBe('[shouting] Run!');
  });
});

describe('Eleven v4’s continuity', () => {
  const lines = (texts: string[]) =>
    texts.map((text) => ({
      text: `[calm] ${text}`,
      voice_id: ELEVENLABS_NARRATOR,
      tagged: 7,
      piece: { text, pauseAfter: 0 },
    })) as DialogueLine[];

  it('gives a request the ones before it by id, and the words either side, a hundred characters at most, cut at a word, with no tags', () => {
    const long = `${'water runs downhill '.repeat(10).trim()}.`;
    const requests = [
      lines(['One.', long]),
      lines(['Two.']),
      lines([long, 'Three.']),
    ];
    expect(continuityOf([requests[0]], 0, [])).toEqual({});
    expect(continuityOf(requests, 0, [])).toEqual({
      future_text: 'Two.',
    });
    const middle = continuityOf(requests, 1, ['r1']);
    expect(middle.previous_request_ids).toEqual(['r1']);
    const before = middle.previous_text as string;
    expect(before.length).toBeLessThanOrEqual(100);
    // The end of the words before, from a word's start, and no tags.
    expect(long.endsWith(before)).toBe(true);
    expect(long[long.length - before.length - 1]).toBe(' ');
    expect(before).not.toContain('[');
    const after = middle.future_text as string;
    expect(after.length).toBeLessThanOrEqual(100);
    expect(after.startsWith('water runs')).toBe(true);
    expect(
      continuityOf(requests, 2, ['a', 'b', 'c', 'd']).previous_request_ids,
    ).toEqual(['b', 'c', 'd']);
  });

  it('asks a long page’s requests one after another on v4, each carrying on from the last, all under ElevenLabs’ size', async () => {
    const order: string[] = [];
    let n = 0;
    const { send, asked } = elevenLabs(() => null);
    const sending = jest.fn((url: string, init: RequestInit) => {
      order.push('asked');
      return send(url, init).then((response) => {
        n += 1;
        const headers = new Headers(response.headers);
        headers.set('request-id', `req-${n}`);
        return new Response(response.body, { status: 200, headers });
      });
    });
    const sentence = `${'word '.repeat(80).trim()}.`;
    const voice = new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      sending,
      noWait,
    );
    await voice.synthesize({
      text: '',
      pieces: Array.from({ length: 10 }, () => ({
        text: sentence,
        pauseAfter: 0.4,
      })),
    });
    expect(asked.length).toBeGreaterThan(1);
    for (const { body } of asked) {
      const inputs = body.inputs as { text: string }[];
      expect(inputs.reduce((c, i) => c + i.text.length, 0)).toBeLessThan(2000);
      expect(body.model_id).toBe('eleven_v4');
    }
    expect(asked[0].body.previous_request_ids).toBeUndefined();
    expect(asked[0].body.future_text).toMatch(/^word word/);
    expect(asked[1].body.previous_request_ids).toEqual(['req-1']);
    expect((asked[1].body.previous_text as string).length).toBeLessThanOrEqual(
      100,
    );
    // v3 takes none of it.
    elevenLabsGate.reset();
    const v3 = elevenLabs();
    await new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_SCENE_MODEL: 'eleven_v3' }),
      raw,
      v3.send,
      noWait,
    ).synthesize({
      text: '',
      pieces: Array.from({ length: 10 }, () => ({
        text: sentence,
        pauseAfter: 0.4,
      })),
    });
    for (const { body } of v3.asked) {
      expect(body.previous_request_ids).toBeUndefined();
      expect(body.previous_text).toBeUndefined();
    }
  });

  it('leaves the continuity off, for good, when ElevenLabs will not take it', async () => {
    const sentence = `${'word '.repeat(80).trim()}.`;
    const { send, asked } = elevenLabs((call) =>
      call === 1
        ? reply(422, {
            detail: [
              {
                loc: ['body', 'future_text'],
                msg: 'extra fields not permitted',
              },
            ],
          })
        : null,
    );
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const said = await voice.synthesize({
      text: '',
      pieces: Array.from({ length: 10 }, () => ({
        text: sentence,
        pauseAfter: 0.4,
      })),
    });
    expect(said.durationMs).toBeGreaterThan(0);
    expect(asked[0].body.future_text).toBeDefined();
    for (const { body } of asked.slice(1)) {
      expect(body.future_text).toBeUndefined();
      expect(body.previous_text).toBeUndefined();
      expect(body.previous_request_ids).toBeUndefined();
    }
  });
});

describe('Eleven v4’s timings', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(__dirname, '__fixtures__', 'eleven-v4-dialogue.json'),
      'utf8',
    ),
  ) as DialogueAnswer & { inputs: { text: string; voice_id: string }[] };

  it('reads a real v4 answer: each line’s span and each word’s times, its stacked tags among the characters and never timed as words', () => {
    const lines = fixture.inputs.map((input) => {
      const tagged = /^(?:\[[^\]]*\]\s*)*/.exec(input.text)![0].length;
      return {
        ...input,
        tagged,
        piece: { text: input.text.slice(tagged), pauseAfter: 0 },
      };
    }) as DialogueLine[];
    const spans = spokenLines(fixture, lines, 1000)!;
    expect(spans).toHaveLength(2);
    expect(spans[0].words).toHaveLength(27);
    expect(spans[0].words[0].text).toBe('A');
    expect(spans[1].words.map((w) => w.text).join(' ')).toBe(
      'Is that why the town grew up by the river?',
    );
    // The second speaker after the first, and each word in order.
    expect(spans[1].start).toBeGreaterThan(spans[0].end);
    for (const span of spans)
      for (let i = 1; i < span.words.length; i += 1)
        expect(span.words[i].start).toBeGreaterThanOrEqual(
          span.words[i - 1].start,
        );
  });

  it('asks again without timestamps when ElevenLabs will not time the model, and leaves the page to the aligner', async () => {
    const urls: string[] = [];
    const send = jest.fn((url: string, init: RequestInit) => {
      urls.push(url);
      if (url.includes('with-timestamps'))
        return Promise.resolve(
          reply(400, {
            detail: {
              status: 'invalid_request',
              message:
                'Model eleven_v4 is not supported for dialogue with timestamps',
            },
          }),
        );
      const body = JSON.parse(init.body as string) as {
        inputs: { text: string; voice_id: string }[];
      };
      const answer = dialogue(body.inputs);
      return Promise.resolve(
        new Response(Buffer.from(answer.audio_base64!, 'base64'), {
          status: 200,
        }),
      );
    });
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const said = await voice.synthesize({
      text: '',
      pieces: [
        { text: 'The giant stepped out.', pauseAfter: 0.5 },
        { text: 'I do.', pauseAfter: 0.5, voice: ELEVENLABS_PREMADE.Liam },
      ],
      timestamps: true,
    });
    expect(urls[0]).toContain('/v1/text-to-dialogue/with-timestamps');
    expect(urls[1]).toBe(
      'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=pcm_24000',
    );
    expect(said.durationMs).toBeGreaterThan(0);
    expect(said.words).toBeUndefined();
    expect(said.pieceStartsMs).toBeUndefined();
    // The next page goes straight to the plain request.
    await voice.synthesize({ text: 'Again.' });
    expect(urls[2]).not.toContain('with-timestamps');
  });
});

describe('the ElevenLabs voice’s troubles, said plainly', () => {
  const heard = () => {
    const notices: RetryNotice[] = [];
    return {
      notices,
      follower: {
        step: () => undefined,
        retry: (notice: RetryNotice) => notices.push(notice),
        recovered: () => undefined,
      },
    };
  };
  const exchange = [{ text: 'Hello there.', pauseAfter: 0.3 }];

  it('says out of credit, a voice missing, a model the plan cannot use', () => {
    expect(
      plainRefusal(
        401,
        'quota_exceeded',
        'You have 3 credits left',
        'eleven_v4',
      ).plain,
    ).toBe('ElevenLabs is out of credit');
    expect(
      plainRefusal(
        400,
        'voice_not_found',
        "A voice with ID 'nDJIICjR9zfJExIFeSCN' was not found.",
        'eleven_v4',
      ).plain,
    ).toBe(
      'A voice in the cast is not in the ElevenLabs account (nDJIICjR9zfJExIFeSCN)',
    );
    expect(
      plainRefusal(
        403,
        'model_access_denied',
        'Your plan does not allow access to this model',
        'eleven_v4',
      ).plain,
    ).toBe('This ElevenLabs account cannot use eleven_v4');
  });

  it('tells whoever follows the work, and fails with the plain words and the status', async () => {
    const { notices, follower } = heard();
    const { send } = elevenLabs(() =>
      reply(401, {
        detail: {
          type: 'unauthorized',
          code: 'quota_exceeded',
          message: 'This request exceeds your quota of 10000.',
          status: 'quota_exceeded',
        },
      }),
    );
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const failed = await followWork(follower, () =>
      voice.synthesize({ text: '', pieces: exchange }),
    ).then(
      () => null,
      (error: Error & { status?: number }) => error,
    );
    expect(failed?.status).toBe(401);
    expect(failed?.message).toMatch(/^ElevenLabs is out of credit: /);
    expect(notices).toEqual([
      expect.objectContaining({
        service: 'voice',
        final: true,
        reason: 'ElevenLabs is out of credit',
      }),
    ]);
  });

  it('says the limit it waits on, by the plan’s requests at once, before ElevenLabs has said its own', async () => {
    const { notices, follower } = heard();
    const { send } = elevenLabs((call) =>
      call === 1
        ? reply(
            429,
            {
              detail: {
                status: 'concurrent_limit_exceeded',
                message: 'Too many concurrent requests',
              },
            },
            { 'retry-after': '2' },
          )
        : null,
    );
    const voice = new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_PLAN: 'creator' }),
      raw,
      send,
      noWait,
    );
    await followWork(follower, () =>
      voice.synthesize({ text: '', pieces: exchange }),
    );
    expect(notices[0]).toMatchObject({
      reason: 'ElevenLabs is at its limit of 5 at once on the Creator plan',
      attempt: 2,
      waitMs: 2000,
    });
  });

  it('keeps to the plan’s requests at once until ElevenLabs says its own', async () => {
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
      return reply(200, dialogue(body.inputs));
    });
    const voice = new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_PLAN: 'Pro' }),
      raw,
      send,
      noWait,
    );
    await Promise.all(
      Array.from({ length: 14 }, () => voice.synthesize({ text: 'A.' })),
    );
    expect(most).toBe(10);
  });
});

describe('the ElevenLabs cast', () => {
  const account = (ids: string[], categories: Record<string, string> = {}) =>
    reply(200, {
      voices: ids.map((id) => ({
        voice_id: id,
        name: id,
        category: categories[id] ?? 'premade',
      })),
      has_more: false,
    });

  it('stands a premade voice in for a library voice the account has not added, and speaks in it once added', async () => {
    const { Emmaline, Toby } = ELEVENLABS_LIBRARY;
    const asked: { url: string; body?: { inputs: { voice_id: string }[] } }[] =
      [];
    let added: string[] = [];
    const send = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/v2/voices')) {
        asked.push({ url });
        return Promise.resolve(account(added));
      }
      const body = JSON.parse(init!.body as string) as {
        inputs: { text: string; voice_id: string }[];
      };
      asked.push({ url, body });
      return Promise.resolve(reply(200, dialogue(body.inputs)));
    });
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const page = {
      text: '',
      pieces: [
        { text: 'Look!', pauseAfter: 0.3, voice: Emmaline.id },
        { text: 'Mine!', pauseAfter: 0.3, voice: Toby.id },
        { text: 'They ran.', pauseAfter: 0.3 },
      ],
    };
    await voice.synthesize(page);
    const first = asked.find((a) => a.body)!.body!.inputs;
    expect(first.map((i) => i.voice_id)).toEqual([
      ELEVENLABS_PREMADE.Jessica,
      ELEVENLABS_PREMADE.Callum,
      ELEVENLABS_NARRATOR,
    ]);
    // Added to the account: once the list is read again, its own voice.
    elevenLabsGate.reset();
    asked.length = 0;
    added = [Emmaline.id, Toby.id];
    await voice.synthesize(page);
    expect(
      asked.find((a) => a.body)!.body!.inputs.map((i) => i.voice_id),
    ).toEqual([Emmaline.id, Toby.id, ELEVENLABS_NARRATOR]);
  });

  it('never asks for the list for premade voices, and refuses plainly a chosen voice the account does not have', async () => {
    const { send, asked } = elevenLabs();
    await new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      send,
      noWait,
    ).synthesize({
      text: '',
      pieces: [
        { text: 'Hi.', pauseAfter: 0.3, voice: ELEVENLABS_PREMADE.Harry },
      ],
    });
    expect(asked).toHaveLength(1);

    const lists = jest.fn(() => Promise.resolve(account([])));
    const voice = new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      lists,
      noWait,
    );
    const failed = await voice
      .synthesize({
        text: '',
        pieces: [
          { text: 'Hi.', pauseAfter: 0.3, voice: 'Chosen00Voice00Gone' },
        ],
      })
      .then(
        () => null,
        (error: Error & { status?: number }) => error,
      );
    expect(failed?.status).toBe(400);
    expect(failed?.message).toContain(
      'A voice in the cast is not in the ElevenLabs account (Chosen00Voice00Gone)',
    );
    // Only the list was asked for: no character was paid for.
    expect(lists).toHaveBeenCalledTimes(1);
  });

  it('flags a cloned or designed voice on v4 for the admin to hear again, and none on v3', async () => {
    const send = jest.fn(() =>
      Promise.resolve(
        account(['Cloned000Voice', 'Designed00Voice', ELEVENLABS_NARRATOR], {
          Cloned000Voice: 'cloned',
          Designed00Voice: 'generated',
        }),
      ),
    );
    const v4 = await new ElevenLabsSceneSpeechAdapter(
      config(),
      raw,
      send,
      noWait,
    ).catalogue();
    const note = (id: string) => v4.find((voice) => voice.id === id)?.note;
    expect(note('Cloned000Voice')).toMatch(/may sound different on v4/);
    expect(note('Designed00Voice')).toMatch(/designed voice.*act less/);
    expect(note(ELEVENLABS_NARRATOR)).toBeUndefined();
    const v3 = await new ElevenLabsSceneSpeechAdapter(
      config({ ELEVENLABS_SCENE_MODEL: 'eleven_v3' }),
      raw,
      send,
      noWait,
    ).catalogue();
    expect(v3.every((voice) => !voice.note)).toBe(true);
  });

  it('searches the Voice Library, marking what the account has, and adds a voice as the admin asks', async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const send = jest.fn((url: string, init?: RequestInit) => {
      urls.push(url);
      if (init?.body) bodies.push(JSON.parse(init.body as string));
      if (url.includes('/v1/shared-voices'))
        return Promise.resolve(
          reply(200, {
            voices: [
              {
                voice_id: ELEVENLABS_LIBRARY.Emmaline.id,
                public_owner_id: 'owner1',
                name: 'Emmaline - young British girl',
                gender: 'female',
                age: 'young',
                accent: 'british',
                preview_url: 'https://example.test/e.mp3',
                free_users_allowed: true,
              },
              {
                voice_id: 'Paid0000Only00Voice',
                public_owner_id: 'owner2',
                name: 'Paid',
                free_users_allowed: false,
              },
            ],
          }),
        );
      if (url.includes('/v1/voices/add/'))
        return Promise.resolve(reply(200, { voice_id: 'x' }));
      return Promise.resolve(account([ELEVENLABS_LIBRARY.Emmaline.id]));
    });
    const voice = new ElevenLabsSceneSpeechAdapter(config(), raw, send, noWait);
    const found = await voice.library('little girl');
    expect(urls[0]).toContain('search=little%20girl');
    expect(found).toEqual([
      {
        id: ELEVENLABS_LIBRARY.Emmaline.id,
        ownerId: 'owner1',
        name: 'Emmaline',
        description: 'young British girl, female, young, british',
        previewUrl: 'https://example.test/e.mp3',
        added: true,
      },
    ]);
    await voice.addVoice('owner1', 'Newvoice0000000', 'Grandma Oxley');
    expect(urls[urls.length - 1]).toBe(
      'https://api.elevenlabs.io/v1/voices/add/owner1/Newvoice0000000',
    );
    expect(bodies[bodies.length - 1]).toEqual({ new_name: 'Grandma Oxley' });
  });
});
