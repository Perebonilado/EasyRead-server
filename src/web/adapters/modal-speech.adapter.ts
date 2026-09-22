import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort } from '../../business/ports/voice.port';

/** How long the health check waits for a container that may be waking. */
const HEALTH_WAIT_MS = 20_000;

/** Which voice runs behind the URL; each takes a different request. */
export type ModalEngine = 'qwen' | 'kokoro';

/**
 * Where a speech service lives: the env keys it is read from, what the
 * ledger calls it, and how many pages it is sent at once. The Modal home
 * scales out and takes as many as the queue sends; the Railway home is
 * one machine that renders pages one at a time, so it is handed two and
 * the rest wait here rather than inside it.
 */
export interface SpeechHome {
  /** Env keys are `${keys}_URL`, `_TOKEN`, `_VOICE`, `_MODEL`, and `_ENGINE` when the engine is not fixed. */
  keys: string;
  /** Fixed engine, or undefined to read it from `${keys}_ENGINE`. */
  engine?: ModalEngine;
  /** The ledger's prefix: `modal:kokoro-82m`, `kokoro:kokoro-82m`. */
  name: string;
  /** Pages in flight at once; undefined for no limit. */
  inFlight?: number;
  /** The voice when `${keys}_VOICE` is not set; by engine when undefined. */
  defaultVoice?: string;
}

/** Kokoro or Qwen on a Modal GPU: a school's catalogue. */
export const MODAL_HOME: SpeechHome = { keys: 'MODAL_TTS', name: 'modal' };

/** Kokoro on Railway's CPUs, always warm: a learner's own upload. */
export const KOKORO_HOME: SpeechHome = {
  keys: 'KOKORO_TTS',
  engine: 'kokoro',
  name: 'kokoro',
  inFlight: 2,
  defaultVoice: 'am_puck',
};

/**
 * A lecture voiced on a service of our own, through one request per page;
 * the mp3 comes back on the same connection. Two homes speak this request:
 * Modal (`modal/tts_service.py`, vLLM-Omni running Qwen3-TTS, or
 * `modal/kokoro_service.py`, Kokoro on a GPU, many pages at once, billed by
 * the second and asleep between runs) for a school's catalogue, and Railway
 * (`speech/kokoro/server.py`, the same Kokoro on CPU, always warm, one page
 * at a time) for a learner's own upload. MODAL_TTS_ENGINE names which
 * engine is behind the Modal URL: Qwen is handed the style's delivery
 * note, Kokoro its speed.
 *
 * This is never a fallback for anything and nothing falls back from it. A
 * page it cannot voice fails, with the reason on the row, and is tried
 * again by the queue. It must never cost OpenAI's price.
 */
@Injectable()
export class ModalSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(ModalSpeechAdapter.name);
  /** A lecture page is well under it; anything longer is split first. */
  private static readonly INPUT_LIMIT = 5_000;
  /** One quick retry for a dropped connection; anything longer is the queue's job. */
  private static readonly ATTEMPTS = 2;
  /**
   * One request's ceiling, longer than a cold start: the first page of a
   * run may be waiting on a container that is still loading the engine,
   * and a page abandoned mid-start is rendered for nobody and sent again.
   * A page on a warm card is seconds. Modal answers a request past two and
   * a half minutes with a redirect that fetch follows, so a slow page is
   * not cut off.
   */
  private static readonly REQUEST_MS = 12 * 60_000;

  /** Free slots at this home, and the pages waiting for one. */
  private slots: number;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly home: SpeechHome = MODAL_HOME,
  ) {
    this.slots = home.inFlight ?? Number.POSITIVE_INFINITY;
  }

  engine(): ModalEngine {
    if (this.home.engine) return this.home.engine;
    return this.config.get<string>(`${this.home.keys}_ENGINE`, 'qwen') ===
      'kokoro'
      ? 'kokoro'
      : 'qwen';
  }

  label(): { model: string; voice: string } {
    const kokoro = this.engine() === 'kokoro';
    return {
      model: this.config.get<string>(
        `${this.home.keys}_MODEL`,
        kokoro ? 'kokoro-82m' : 'qwen3-tts-0.6b',
      ),
      voice: this.config.get<string>(
        `${this.home.keys}_VOICE`,
        this.home.defaultVoice ?? (kokoro ? 'am_michael' : 'ryan'),
      ),
    };
  }

  private base(): string {
    return this.config
      .getOrThrow<string>(`${this.home.keys}_URL`)
      .replace(/\/+$/, '');
  }

  /**
   * The service's health route, with a short wait. A container asleep
   * between runs answers slowly or not at all the first time and wakes
   * on being asked; a disabled workspace answers 404 every time.
   */
  async ready(): Promise<boolean> {
    const base = this.base();
    const token = this.config.get<string>(`${this.home.keys}_TOKEN`) ?? '';
    try {
      const response = await fetch(`${base}/health`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(HEALTH_WAIT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async synthesize({
    text,
    voice,
    instructions,
    speed,
    pieces,
    timestamps,
  }: {
    text: string;
    voice?: string;
    instructions?: string;
    speed?: number;
    pieces?: { text: string; speed: number; pauseAfter: number }[];
    timestamps?: boolean;
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs?: number;
    pieceStartsMs?: number[];
    words?: Voiced['words'];
  }> {
    const base = this.base();
    const token = this.config.getOrThrow<string>(`${this.home.keys}_TOKEN`);
    const speaker = (voice ?? this.label().voice).toLowerCase();
    const engine = this.engine();

    // Kokoro takes the page as pieces, each at its pace with its silence
    // after; one request, the service joins them.
    if (engine === 'kokoro' && pieces?.length) {
      const { audio, durationMs, pieceStartsMs, words } = await this.once(
        `${base}/v1/audio/speech`,
        token,
        {
          voice: speaker,
          pieces: pieces.map((piece) => ({
            text: piece.text,
            speed: piece.speed,
            pause_after: piece.pauseAfter,
          })),
          response_format: 'mp3',
          // An older service ignores this and answers with the mp3 alone.
          ...(timestamps ? { timestamps: true } : {}),
        },
      );
      return {
        audio,
        mimeType: 'audio/mpeg',
        model: `${this.home.name}:${this.label().model}`,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(pieceStartsMs?.length === pieces.length ? { pieceStartsMs } : {}),
        ...(words?.length ? { words } : {}),
      };
    }

    const buffers: Buffer[] = [];
    let total: number | undefined;
    for (const part of chunk(text, ModalSpeechAdapter.INPUT_LIMIT)) {
      const { audio, durationMs } = await this.once(
        `${base}/v1/audio/speech`,
        token,
        engine === 'kokoro'
          ? {
              input: part,
              voice: speaker,
              speed: speed ?? 1,
              response_format: 'mp3',
            }
          : {
              input: part,
              voice: speaker,
              instructions,
              language: 'English',
              response_format: 'mp3',
            },
      );
      buffers.push(audio);
      if (durationMs !== undefined) total = (total ?? 0) + durationMs;
    }
    return {
      audio: Buffer.concat(buffers),
      mimeType: 'audio/mpeg',
      model: `${this.home.name}:${this.label().model}`,
      ...(total !== undefined ? { durationMs: total } : {}),
    };
  }

  /**
   * One page, tried a few times: a container waking up can drop its first
   * request, and a 5xx is the engine's fault. A 4xx is the request's own
   * fault and is thrown at once with its status, which the worker reads as
   * permanent: the page fails once, with the engine's reason on the row.
   */
  private async once(
    url: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<Voiced> {
    await this.enter();
    try {
      return await this.attempts(url, token, body);
    } finally {
      this.leave();
    }
  }

  /** A slot at this home, waited for when every one is taken. */
  private enter(): Promise<void> {
    if (this.slots > 0) {
      this.slots -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private leave(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.slots += 1;
  }

  private async attempts(
    url: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<Voiced> {
    let lastError: Error | null = null;
    for (
      let attempt = 1;
      attempt <= ModalSpeechAdapter.ATTEMPTS;
      attempt += 1
    ) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        ModalSpeechAdapter.REQUEST_MS,
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          throw refused(response.status, 'The speech service refused our key');
        }
        if (response.status >= 400 && response.status < 500) {
          throw refused(
            response.status,
            `The speech service refused the page (${response.status}): ${reasonIn(await response.text())}`,
          );
        }
        if (!response.ok) {
          throw new Error(
            `The speech service answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
          );
        }
        // Asked for timestamps, a service that knows them answers in JSON.
        if (
          (response.headers.get('content-type') ?? '').includes(
            'application/json',
          )
        )
          return voicedFromJson(await response.json());
        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length) throw new Error('The speech service sent no audio');
        // The true length, when the service measured it (Kokoro does), and
        // where each piece starts, when it spoke pieces.
        const seconds = Number(response.headers.get('x-audio-seconds'));
        const starts = (response.headers.get('x-piece-starts') ?? '')
          .split(',')
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n));
        return {
          audio,
          ...(Number.isFinite(seconds) && seconds > 0
            ? { durationMs: Math.round(seconds * 1000) }
            : {}),
          ...(starts.length
            ? { pieceStartsMs: starts.map((s) => Math.round(s * 1000)) }
            : {}),
        };
      } catch (error) {
        lastError = named(error);
        if (isRefusal(lastError)) throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${ModalSpeechAdapter.ATTEMPTS} failed: ${lastError.message}`,
        );
        if (attempt < ModalSpeechAdapter.ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error('The speech service did not answer');
  }
}

/** What one request to the service brings back. */
export interface Voiced {
  audio: Buffer;
  durationMs?: number;
  pieceStartsMs?: number[];
  words?: { text: string; startMs: number; endMs: number }[];
}

/**
 * The JSON answer to a request with timestamps: the audio in base64, and
 * seconds turned to milliseconds. A word with no sensible time is left
 * out rather than guessed.
 */
export function voicedFromJson(body: unknown): Voiced {
  const answer = (body ?? {}) as {
    audio?: unknown;
    seconds?: unknown;
    piece_starts?: unknown;
    words?: unknown;
  };
  if (typeof answer.audio !== 'string' || !answer.audio)
    throw new Error('The speech service sent no audio');
  const audio = Buffer.from(answer.audio, 'base64');
  if (!audio.length) throw new Error('The speech service sent no audio');
  const seconds = Number(answer.seconds);
  const starts = Array.isArray(answer.piece_starts)
    ? answer.piece_starts.map(Number).filter((n) => Number.isFinite(n))
    : [];
  const words = Array.isArray(answer.words)
    ? answer.words
        .filter(
          (w): w is [string, number, number] =>
            Array.isArray(w) &&
            typeof w[0] === 'string' &&
            Number.isFinite(Number(w[1])) &&
            Number.isFinite(Number(w[2])),
        )
        .map(([text, start, end]) => ({
          text,
          startMs: Math.round(Number(start) * 1000),
          endMs: Math.round(Number(end) * 1000),
        }))
    : [];
  return {
    audio,
    ...(Number.isFinite(seconds) && seconds > 0
      ? { durationMs: Math.round(seconds * 1000) }
      : {}),
    ...(starts.length
      ? { pieceStartsMs: starts.map((s) => Math.round(s * 1000)) }
      : {}),
    ...(words.length ? { words } : {}),
  };
}

/**
 * Bound in place of the Modal adapter when no service URL is set: a
 * lecture then fails to voice, loudly, rather than being voiced at
 * OpenAI's price by accident. The chapter writer checks the URL first and
 * leaves a school's rows scripted, so this is reached only by a stale job.
 */
@Injectable()
export class NoLectureSpeech implements SpeechPort {
  label(): { model: string; voice: string } {
    return { model: 'none', voice: 'none' };
  }

  ready(): Promise<boolean> {
    return Promise.resolve(false);
  }

  synthesize(): Promise<never> {
    return Promise.reject(
      new Error(
        "No catalogue speech service is set (MODAL_TTS_URL); a school's document is not voiced without one",
      ),
    );
  }
}

/**
 * A connection failure with its cause spelled out. Node's fetch says only
 * "fetch failed" and keeps the reason underneath: a refused connection, a
 * reset, a name lookup, a timeout. The reason is what tells a dropped home
 * connection from a service that is down, so it goes in the message the
 * worker logs and the row keeps.
 */
function named(error: unknown): Error {
  const raised = error as Error & {
    cause?: { code?: string; message?: string };
  };
  if (raised?.name === 'AbortError') {
    return new Error(
      `The speech service did not answer within ${ModalSpeechAdapter['REQUEST_MS'] / 60_000} minutes`,
    );
  }
  const cause = raised?.cause;
  if (raised?.message === 'fetch failed' && cause) {
    return new Error(
      `Could not reach the speech service: ${cause.code ?? cause.message ?? 'unknown cause'}`,
    );
  }
  return raised instanceof Error ? raised : new Error(String(error));
}

/** An error the worker will not retry: it carries the 4xx status the engine answered with. */
function refused(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const isRefusal = (error: Error): boolean => {
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
};

/** The engine's own words for what was wrong, out of its JSON envelope when it sent one. */
function reasonIn(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message.slice(0, 200);
  } catch {
    // not JSON: the body is the reason
  }
  return body.slice(0, 200);
}

/** Splits at paragraph, then sentence, boundaries so no part crosses the limit. */
function chunk(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let current = '';
  for (const piece of text.split(/(?<=[.!?])\s+|\n\n+/)) {
    if (!piece.trim()) continue;
    if ((current + ' ' + piece).trim().length > limit && current) {
      out.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
