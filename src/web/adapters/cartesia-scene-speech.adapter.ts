import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort, VoiceOption } from '../../business/ports/voice.port';
import { pcmMs, readPcm16 } from '../../business/domain/wav';
import { CARTESIA_NARRATOR } from '../../business/domain/scene-voice';
import { encodeMp3 } from './audio/mp3';
import {
  withSilences,
  type SpokenLine,
} from './elevenlabs-scene-speech.adapter';
import { pausedRun } from './gemini-speech.adapter';

const API = 'https://api.cartesia.ai';
/** The API version asked for: the one Cartesia's reference names (September 2026). */
export const CARTESIA_VERSION = '2026-08-14';
/**
 * Sonic 3.6: Cartesia's newest (general availability, August 2026), which
 * takes an emotion, a speed and a volume a request and a speed mid-way
 * (`<speed ratio="0.9"/>`), and says when it spoke each word.
 */
export const CARTESIA_SCENE_MODEL = 'sonic-3.6';
/** The audio asked for: raw 16-bit samples, so the silences are made here. */
const RATE = 24000;
/** A request's words kept well under what one generation holds. */
const REQUEST_CHARS = 1500;
/** A busy account or a 5xx is worth trying again; a refusal is not. */
const ATTEMPTS = 6;
/** A request is seconds of work for the voice. */
const REQUEST_MS = 3 * 60_000;
/** How long the account's list of voices is trusted, for the admin page. */
const CATALOGUE_MS = 10 * 60_000;
/**
 * Requests in flight when CARTESIA_CONCURRENCY is not set: Cartesia's
 * free plan allows two at once (Pro three, Startup five, Scale fifteen),
 * so two is right on every plan.
 */
export const CARTESIA_CONCURRENCY_DEFAULT = 2;
/** Sonic's speed and volume, as far as they go. */
const SPEED_RANGE = [0.6, 1.5] as const;
/** How loud a whisper and a shout are asked for, against 1. */
export const TONE_VOLUME = { whisper: 0.6, shout: 1.6 } as const;

/**
 * Cartesia limits requests in flight, by plan. Every adapter in the
 * process shares one gate, so scenes made side by side wait their turn
 * rather than being turned away.
 */
const gate = { running: 0, waiting: [] as (() => void)[] };

async function enter(limit: number): Promise<void> {
  while (gate.running >= Math.max(1, limit))
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  gate.running += 1;
}

function leave(): void {
  gate.running = Math.max(0, gate.running - 1);
  gate.waiting.shift()?.();
}

/** For tests: the gate as it is, and back to empty. */
export const cartesiaGate = {
  running: () => gate.running,
  reset: () => {
    gate.running = 0;
    gate.waiting.splice(0).forEach((resolve) => resolve());
  },
};

/**
 * The feelings Sonic knows, in the order they are looked for in a
 * direction: the first that fits wins. The primary ones (calm, angry,
 * sad, scared, content) are what Cartesia says it does best; plain
 * narration with nothing named goes unmarked, neutral.
 */
const EMOTIONS: [RegExp, string][] = [
  [/\b(?:angry|anger|furious|cross|enraged|rage|fierce|boast)/, 'angry'],
  [/\b(?:terrif|afraid|scared|frighten|fear|panic)/, 'scared'],
  [/\b(?:nervous|timid|shy|worried|anxious|uneasy)/, 'anxious'],
  [/\b(?:sad|grie|sorrow|mourn|tearful|lonely|heartbroken)/, 'sad'],
  [/\b(?:surpris|astonish|amaz|shock)/, 'surprised'],
  [/\b(?:sarcas|mock|scorn|sneer)/, 'sarcastic'],
  [/\b(?:proud|brave|bold|confident)/, 'confident'],
  [/\b(?:determin|resolute|stern)/, 'determined'],
  [/\b(?:mischiev|cheeky|sly|trick|mysterious)/, 'mysterious'],
  [/\b(?:excit|eager|energetic|enthusias|thrill)/, 'excited'],
  [/\b(?:cheerful|bright|upbeat|playful|happy|joy|smil|jolly|glad)/, 'happy'],
  [/\b(?:curious|wonder|inquisitive)/, 'curious'],
  [/\b(?:thought|think|wise|far away|dream|remember)/, 'contemplative'],
  [/\b(?:tired|weary|sleepy|exhausted)/, 'tired'],
  [/\b(?:warm|kind|tender|loving|grateful)/, 'content'],
  [
    /\b(?:calm|unhurried|gentle|patient|steady|deep|sober|serious|solemn|grave)/,
    'calm',
  ],
];
const WHISPER = /\b(?:whisper|hushed|quietly|not aloud)/;
const SHOUT = /\b(?:shout|yell|roar|bellow|scream)/;

/**
 * A piece's direction as Sonic takes it: an emotion and a volume, sent as
 * the request's settings, never as words. The direction's own words are
 * never sent: not the character's name ("as Joy, …" is not a feeling),
 * not a term it stresses, only one of Sonic's emotions and a number.
 */
export function direction(
  style?: string,
  tone?: 'whisper' | 'shout',
): { emotion: string | null; volume: number } {
  const said = (style ?? '')
    .toLowerCase()
    .replace(/^as [^,]*,/, '')
    .replace(/"[^"]*"|“[^”]*”/g, '');
  const loud =
    tone ??
    (WHISPER.test(said) ? 'whisper' : SHOUT.test(said) ? 'shout' : null);
  return {
    emotion: EMOTIONS.find(([words]) => words.test(said))?.[1] ?? null,
    volume: loud ? TONE_VOLUME[loud] : 1,
  };
}

/** A sentence as the port hands it over. */
type Piece = {
  text: string;
  pauseAfter: number;
  speed?: number;
  style?: string;
  voice?: string;
  tone?: 'whisper' | 'shout';
};

/** One request to Sonic: a run of one voice said one way, and its words. */
export interface SonicRequest {
  voice: string;
  emotion: string | null;
  volume: number;
  /** The first piece's speed; a later piece's is a `<speed>` tag before it. */
  speed: number;
  transcript: string;
  pieces: Piece[];
}

const speedOf = (piece: Piece) =>
  Math.round(
    Math.min(SPEED_RANGE[1], Math.max(SPEED_RANGE[0], piece.speed ?? 1)) * 100,
  ) / 100;

/**
 * The pieces as Sonic requests: a run of one speaker said with one
 * feeling and at one loudness is one request, so the voice keeps its
 * flow; a new speaker, feeling or loudness is a new request (Cartesia
 * says a feeling changed mid-way is unreliable). Each piece's pace is its
 * own, a speed tag where it changes. An angle bracket in the words would
 * be taken for a tag and not said: it is sent as a round one.
 */
export function sonicRequests(
  pieces: Piece[],
  narrator: string,
): SonicRequest[] {
  const requests: SonicRequest[] = [];
  for (const piece of pieces) {
    const words = piece.text.trim().replace(/</g, '(').replace(/>/g, ')');
    if (!words) continue;
    const voice = piece.voice?.trim() || narrator;
    const { emotion, volume } = direction(piece.style, piece.tone);
    const speed = speedOf(piece);
    const last = requests[requests.length - 1];
    const before = last ? speedOf(last.pieces[last.pieces.length - 1]) : speed;
    const tag = speed !== before ? `<speed ratio="${speed}"/> ` : '';
    if (
      last &&
      last.voice === voice &&
      last.emotion === emotion &&
      last.volume === volume &&
      last.transcript.length + tag.length + words.length + 1 <= REQUEST_CHARS
    ) {
      last.transcript = `${last.transcript} ${tag}${words}`;
      last.pieces.push(piece);
      continue;
    }
    requests.push({
      voice,
      emotion,
      volume,
      speed,
      transcript: words,
      pieces: [piece],
    });
  }
  return requests;
}

/** The words Sonic said and when, in seconds from the request's start. */
export interface WordStamps {
  words: string[];
  start: number[];
  end: number[];
}

const SAID = /[\p{L}\p{N}]/u;
const letters = (word: string) =>
  [...word.toLowerCase()].filter((char) => SAID.test(char));

/**
 * Where each piece of a request is said, from Sonic's own word times: its
 * first word to its last, and each word as the page wrote it. Sonic's
 * words are matched to the page's by their letters alone, so punctuation
 * and how it splits a word do not matter; a tag's pieces, were any
 * reported, are passed over. Null when the letters differ (a number said
 * as words): then the page is timed by the aligner.
 */
export function timedPieces(
  pieces: Piece[],
  stamps: WordStamps,
  rate: number,
): SpokenLine[] | null {
  if (
    stamps.start.length !== stamps.words.length ||
    stamps.end.length !== stamps.words.length
  )
    return null;
  // Sonic's letters, each with the word it is in.
  const theirs: string[] = [];
  const owner: number[] = [];
  let inTag = false;
  stamps.words.forEach((word, i) => {
    if (inTag || word.startsWith('<')) {
      inTag = !word.includes('>');
      return;
    }
    for (const char of letters(word)) {
      theirs.push(char);
      owner.push(i);
    }
  });
  const at = (seconds: number) => Math.round(seconds * rate);
  const out: SpokenLine[] = [];
  let k = 0;
  for (const piece of pieces) {
    const words: SpokenLine['words'] = [];
    for (const [word] of piece.text.matchAll(/\S+/g)) {
      const own = letters(word);
      if (!own.length) continue;
      if (theirs.slice(k, k + own.length).join('') !== own.join(''))
        return null;
      words.push({
        text: word,
        start: at(stamps.start[owner[k]]),
        end: at(stamps.end[owner[k + own.length - 1]]),
      });
      k += own.length;
    }
    if (!words.length) return null;
    out.push({
      start: words[0].start,
      end: words[words.length - 1].end,
      words,
    });
  }
  return k === theirs.length ? out : null;
}

/** Server-sent events as Sonic sends them: each `data:` line's JSON. */
export function sseEvents(body: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      const event = JSON.parse(data) as unknown;
      if (event && typeof event === 'object')
        events.push(event as Record<string, unknown>);
    } catch {
      // A keep-alive or a comment: nothing said.
    }
  }
  return events;
}

/** Cartesia's own words for what was wrong. */
export function reasonIn(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const said = [
      parsed.error_code,
      parsed.message ?? parsed.error ?? parsed.title,
    ]
      .filter((part) => typeof part === 'string' && part)
      .join(': ');
    if (said) return said.slice(0, 240);
  } catch {
    // not JSON: the body is the reason
  }
  return body.slice(0, 240);
}

/** How loud speech is made, as the RMS of its spoken frames, at volume 1 (about -17 dBFS). */
export const SPEECH_LEVEL = 4500;
/** The loudest a sample is let be: a shout stops short of clipping. */
const PEAK = 31000;

/**
 * A request's audio at one level with the rest: Cartesia's voices speak
 * at their own loudness (a child's some ten decibels under a man's), so
 * each is brought to the same level of speech, a shout's and a whisper's
 * by their volume, never past clipping. Only the frames with speech in
 * them are measured, so a pause does not make a line louder.
 */
export function levelled(
  samples: Int16Array,
  rate: number,
  volume = 1,
): Int16Array {
  const frame = Math.max(1, Math.round(rate / 100));
  const levels: number[] = [];
  let peak = 0;
  for (let f = 0; f + frame <= samples.length; f += frame) {
    let sum = 0;
    for (let i = f; i < f + frame; i += 1) {
      sum += samples[i] * samples[i];
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    levels.push(sum / frame);
  }
  const loudest = Math.max(0, ...levels);
  const spoken = levels.filter((level) => level > loudest * 0.01);
  if (!peak || !spoken.length) return samples;
  const rms = Math.sqrt(spoken.reduce((n, l) => n + l, 0) / spoken.length);
  const gain = Math.min(
    4,
    Math.max(0.25, (SPEECH_LEVEL * volume) / rms),
    PEAK / peak,
  );
  if (Math.abs(gain - 1) < 0.05) return samples;
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1)
    out[i] = Math.round(samples[i] * gain);
  return out;
}

/** Where the voice is heard at all in a stretch of audio: its first and last loud sample. */
function heard(samples: Int16Array): { start: number; end: number } {
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
  const floor = loudest * 0.04;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) <= floor)
    start += 1;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]) <= floor) end -= 1;
  return { start, end };
}

/**
 * Visualize's voice on Cartesia: chosen on the admin page (or with
 * SCENE_VOICE_ENGINE=cartesia) once CARTESIA_API_KEY is set.
 *
 * A page is a request per run of one speaker said one way, on Sonic 3.6
 * over server-sent events: raw audio and each word's time. The direction
 * goes as the request's emotion and volume and each piece's pace as its
 * speed, never as words; each voice is brought to one level of speech,
 * a shout above it and a whisper under. Sonic's word times place every sentence and word
 * on the audio, so the page needs no aligner; the silences are made here,
 * at the quiet between two sentences, as the page asks. The answer is
 * encoded to mp3 here like Gemini's and ElevenLabs'.
 */
@Injectable()
export class CartesiaSceneSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(CartesiaSceneSpeechAdapter.name);
  private listed: { at: number; voices: VoiceOption[] } | null = null;
  /** Each listed voice's sample, where Cartesia keeps it. */
  private readonly samples = new Map<string, string>();

  constructor(
    private readonly config: ConfigService,
    private readonly encode: (
      samples: Int16Array,
      sampleRate: number,
    ) => Promise<Buffer> = encodeMp3,
    private readonly send: typeof fetch = (...args: Parameters<typeof fetch>) =>
      fetch(...args),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  label(): { model: string; voice: string } {
    return {
      model:
        this.config.get<string>('CARTESIA_SCENE_MODEL')?.trim() ||
        CARTESIA_SCENE_MODEL,
      voice:
        this.config.get<string>('CARTESIA_NARRATOR_VOICE')?.trim() ||
        CARTESIA_NARRATOR,
    };
  }

  private key(): string {
    const key = this.config.get<string>('CARTESIA_API_KEY')?.trim();
    if (!key)
      throw refused(
        401,
        'No Cartesia key is set (CARTESIA_API_KEY): Visualize cannot use the Cartesia voice',
      );
    return key;
  }

  private headers(key: string): Record<string, string> {
    return {
      Authorization: `Bearer ${key}`,
      'Cartesia-Version':
        this.config.get<string>('CARTESIA_VERSION')?.trim() || CARTESIA_VERSION,
    };
  }

  /** How many requests at once: the setting, else two. */
  private limit(): number {
    const set = Number(this.config.get<string>('CARTESIA_CONCURRENCY'));
    return Number.isFinite(set) && set > 0
      ? Math.floor(set)
      : CARTESIA_CONCURRENCY_DEFAULT;
  }

  async synthesize({
    text,
    voice,
    pieces,
    lead,
    timestamps,
  }: {
    text: string;
    voice?: string;
    pieces?: Piece[];
    lead?: number;
    timestamps?: boolean;
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs: number;
    silencesMs: [number, number][];
    pieceStartsMs?: number[];
    words?: { text: string; startMs: number; endMs: number }[];
    characters: number;
  }> {
    const key = this.key();
    const { model } = this.label();
    const narrator = voice?.trim() || this.label().voice;
    const given: Piece[] = pieces?.length ? pieces : [{ text, pauseAfter: 0 }];
    const requests = sonicRequests(given, narrator);
    if (!requests.length) throw refused(400, 'There is nothing to say');
    const answers = await Promise.all(
      requests.map((request) => this.speak(key, model, request, narrator)),
    );
    // The requests' audio end to end, and where each piece is said in it.
    const raws: Int16Array[] = [];
    const spans: SpokenLine[] = [];
    const lines: Piece[] = [];
    /** Quiet made inside a request timed by its loudness, and the line it is in. */
    const inner: { line: number; quiet: [number, number] }[] = [];
    let offset = 0;
    let exact = true;
    for (const [k, answer] of answers.entries()) {
      const request = requests[k];
      let samples = levelled(answer.samples, RATE, request.volume);
      const found = timedPieces(request.pieces, answer.stamps, RATE);
      if (found)
        found.forEach((one, i) => {
          spans.push({
            start: one.start + offset,
            end: one.end + offset,
            words: one.words.map((word) => ({
              ...word,
              start: word.start + offset,
              end: word.end + offset,
            })),
          });
          lines.push(request.pieces[i]);
        });
      else {
        // No times for its words: its sentences parted where it is quiet,
        // the request one line, its last pause after it.
        exact = false;
        this.logger.warn(
          'Cartesia’s word times did not fit its words: the page is timed by the aligner',
        );
        const paused = pausedRun(samples, RATE, request.pieces);
        samples = paused.samples;
        for (const [a, b] of paused.quiet)
          inner.push({ line: spans.length, quiet: [a + offset, b + offset] });
        const whole = heard(samples);
        spans.push({
          start: whole.start + offset,
          end: whole.end + offset,
          words: [],
        });
        lines.push(request.pieces[request.pieces.length - 1]);
      }
      raws.push(samples);
      offset += samples.length;
    }
    const raw = new Int16Array(offset);
    let at = 0;
    for (const part of raws) {
      raw.set(part, at);
      at += part.length;
    }
    const paused = withSilences(
      raw,
      RATE,
      spans,
      lines.map((line) => line.pauseAfter),
    );
    // Quiet before the first word, when the page opens on the stage alone.
    const before = lead && lead > 0 ? Math.round(lead * RATE) : 0;
    const samples = new Int16Array(before + paused.samples.length);
    samples.set(paused.samples, before);
    const ms = (sample: number) => Math.round((sample / RATE) * 1000);
    const silencesMs = [
      ...(before ? [[0, before] as [number, number]] : []),
      ...[
        ...paused.quiet,
        ...inner.map(({ line, quiet: [a, b] }): [number, number] => [
          a + paused.moved[line],
          b + paused.moved[line],
        ]),
      ].map(([a, b]): [number, number] => [a + before, b + before]),
    ]
      .sort((x, y) => x[0] - y[0])
      .map(([a, b]): [number, number] => [ms(a), ms(b)]);
    const moved = (i: number, sample: number) =>
      ms(sample + paused.moved[i] + before);
    return {
      audio: await this.encode(samples, RATE),
      mimeType: 'audio/mpeg',
      model: `cartesia:${model}`,
      durationMs: pcmMs({ samples, sampleRate: RATE }),
      silencesMs,
      ...(exact
        ? {
            pieceStartsMs: spans.map((span, i) => moved(i, span.start)),
            ...(timestamps
              ? {
                  words: spans.flatMap((span, i) =>
                    span.words.map((word) => ({
                      text: word.text,
                      startMs: moved(i, word.start),
                      endMs: moved(i, word.end),
                    })),
                  ),
                }
              : {}),
          }
        : {}),
      // Cartesia bills a credit a character of the transcript.
      characters: requests.reduce((n, r) => n + r.transcript.length, 0),
    };
  }

  /**
   * One request in its speaker's voice; a character's voice Cartesia does
   * not know (gone from its library, or not the account's) is said in the
   * narrator's instead, so a film is not stopped by one voice.
   */
  private async speak(
    key: string,
    model: string,
    request: SonicRequest,
    narrator: string,
  ): Promise<{ samples: Int16Array; stamps: WordStamps }> {
    const body = (voice: string) => ({
      model_id: model,
      transcript: request.transcript,
      voice,
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: RATE,
      },
      language: 'en',
      add_timestamps: true,
      use_normalized_timestamps: false,
      generation_config: {
        speed: request.speed,
        volume: request.volume,
        ...(request.emotion ? { emotion: request.emotion } : {}),
      },
    });
    try {
      return await this.ask(key, body(request.voice));
    } catch (error) {
      const { status, reason } = error as {
        status?: unknown;
        reason?: unknown;
      };
      if (
        request.voice === narrator ||
        (status !== 400 && status !== 404) ||
        !/voice/i.test(typeof reason === 'string' ? reason : '')
      )
        throw error;
      this.logger.warn(
        `Cartesia has no voice ${request.voice}: the narrator says that line (${(error as Error).message})`,
      );
      return this.ask(key, body(narrator));
    }
  }

  /**
   * One request, tried again while the account is busy (a 429: too many
   * at once), on a 5xx or a dropped connection, waiting longer each time,
   * or as long as Cartesia says. A refusal (any other 4xx: no credit, a
   * voice not found) is thrown at once with its status, which the worker
   * reads as permanent.
   */
  private async ask(
    key: string,
    body: Record<string, unknown>,
  ): Promise<{ samples: Int16Array; stamps: WordStamps }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let wait = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      await enter(this.limit());
      try {
        const response = await this.send(`${API}/tts/sse`, {
          method: 'POST',
          headers: {
            ...this.headers(key),
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_MS),
        });
        const said = await response.text();
        const failed = response.ok
          ? sseEvents(said).find((event) => event.type === 'error')
          : null;
        const status = response.ok
          ? failed
            ? Number(failed.status_code) || 500
            : 200
          : response.status;
        if (status === 200) {
          const events = sseEvents(said);
          const audio = Buffer.concat(
            events
              .filter((e) => e.type === 'chunk' && typeof e.data === 'string')
              .map((e) => Buffer.from(e.data as string, 'base64')),
          );
          const stamps: WordStamps = { words: [], start: [], end: [] };
          for (const event of events) {
            const got = event.word_timestamps as
              Partial<WordStamps> | undefined;
            if (event.type !== 'timestamps' || !got) continue;
            stamps.words.push(...(got.words ?? []));
            stamps.start.push(...(got.start ?? []));
            stamps.end.push(...(got.end ?? []));
          }
          const { samples } = readPcm16(audio, RATE);
          if (!samples.length)
            throw new Error('The Cartesia voice sent silence');
          return { samples, stamps };
        }
        const reason = failed
          ? reasonIn(JSON.stringify(failed))
          : reasonIn(said);
        if (status === 429) {
          const after = Number(response.headers.get('retry-after'));
          if (Number.isFinite(after) && after > 0)
            wait = Math.min(60_000, after * 1000);
          throw new Error(`The Cartesia voice is busy: ${reason}`);
        }
        if (status >= 400 && status < 500)
          throw Object.assign(
            refused(
              status,
              status === 401 || status === 403
                ? `The Cartesia voice refused our key: ${reason}`
                : `The Cartesia voice refused the page (${status}): ${reason}`,
            ),
            { reason },
          );
        throw new Error(`The Cartesia voice answered ${status}: ${reason}`);
      } catch (error) {
        lastError = named(error);
        if (isRefusal(lastError)) throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${ATTEMPTS} failed: ${lastError.message}`,
        );
      } finally {
        leave();
      }
      if (attempt < ATTEMPTS)
        await this.sleep(wait + Math.round(Math.random() * 250));
    }
    throw lastError ?? new Error('The Cartesia voice did not answer');
  }

  /**
   * The English voices the account can speak in, Cartesia's library and
   * its own: for the admin page to choose from.
   */
  async catalogue(): Promise<VoiceOption[]> {
    if (this.listed && Date.now() - this.listed.at < CATALOGUE_MS)
      return this.listed.voices;
    const key = this.key();
    const voices: VoiceOption[] = [];
    let after: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const response = await this.send(
        `${API}/voices?limit=100&language=en&expand%5B%5D=preview_file_url${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`,
        { headers: this.headers(key), signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw new Error(
          `Cartesia would not list its voices (${response.status}): ${reasonIn(await response.text())}`,
        );
      const body = (await response.json()) as {
        data?: {
          id: string;
          name?: string;
          description?: string | null;
          gender?: string | null;
          preview_file_url?: string | null;
        }[];
        has_more?: boolean;
        next_page?: string | null;
      };
      const data = body.data ?? [];
      for (const one of data) {
        const about = (one.description ?? '').trim().replace(/\.$/, '');
        const gender = (one.gender ?? '').replace(/_/g, ' ').trim();
        voices.push({
          id: one.id,
          name: (one.name ?? one.id).trim(),
          description: [
            about.length > 90
              ? `${about.slice(0, 90).replace(/[\s,;]+\S*$/, '')}…`
              : about,
            gender,
          ]
            .filter(Boolean)
            .join(', '),
          previewUrl: one.preview_file_url ?? null,
        });
        if (one.preview_file_url)
          this.samples.set(one.id, one.preview_file_url);
      }
      after = body.has_more
        ? (body.next_page ?? data[data.length - 1]?.id ?? null)
        : null;
      if (!after) break;
    }
    voices.sort((a, b) => a.name.localeCompare(b.name));
    this.listed = { at: Date.now(), voices };
    return voices;
  }

  /**
   * A voice's sample, fetched here: Cartesia's sample asks for the key,
   * which never leaves the server. The key goes only to Cartesia's own
   * hosts; a sample kept elsewhere is fetched without it.
   */
  async preview(voiceId: string): Promise<{ audio: Buffer; mimeType: string }> {
    const key = this.key();
    let url = this.samples.get(voiceId) ?? null;
    if (!url) {
      const response = await this.send(
        `${API}/voices/${encodeURIComponent(voiceId)}?expand%5B%5D=preview_file_url`,
        { headers: this.headers(key), signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw refused(
          404,
          `Cartesia has no voice ${voiceId}: ${reasonIn(await response.text())}`,
        );
      url =
        ((await response.json()) as { preview_file_url?: string | null })
          .preview_file_url ?? null;
    }
    if (!url) throw refused(404, 'Cartesia has no sample of that voice');
    const host = new URL(url).hostname;
    const own = host === 'cartesia.ai' || host.endsWith('.cartesia.ai');
    const response = await this.send(url, {
      ...(own ? { headers: this.headers(key) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(
        `Cartesia would not send the sample (${response.status})`,
      );
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || 'audio/wav',
    };
  }
}

/** An error the worker will not retry: it carries the 4xx status Cartesia answered with. */
function refused(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const isRefusal = (error: Error): boolean => {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
};

/** A timeout or a dropped connection, said plainly. */
function named(error: unknown): Error {
  const raised = error as Error & { cause?: { code?: string } };
  if (raised?.name === 'TimeoutError' || raised?.name === 'AbortError')
    return new Error('The Cartesia voice did not answer in time');
  if (raised?.message === 'fetch failed' && raised.cause)
    return new Error(
      `Could not reach the Cartesia voice: ${raised.cause.code ?? 'unknown cause'}`,
    );
  return raised instanceof Error ? raised : new Error(String(error));
}
