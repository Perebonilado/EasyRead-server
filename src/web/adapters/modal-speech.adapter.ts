import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort } from '../../business/ports/voice.port';

/** Which voice runs behind the URL; each takes a different request. */
export type ModalEngine = 'qwen' | 'kokoro';

/**
 * Every lecture voiced on our own rented GPU, a learner's own upload and a
 * school's catalogue alike, through one of two Modal services:
 * `modal/tts_service.py`, vLLM-Omni's speech server running Qwen3-TTS, or
 * `modal/kokoro_service.py`, Kokoro behind the same request shape. Many
 * pages at once, billed by the second and asleep between runs. One request
 * per page; the mp3 comes back on the same connection. MODAL_TTS_ENGINE
 * names which one is behind MODAL_TTS_URL: Qwen is handed the style's
 * delivery note, Kokoro its speed.
 *
 * This is never a fallback for anything and nothing falls back from it. A
 * page it cannot voice fails, with the reason on the row, and is tried
 * again by the queue or on the next Prepare. It must never cost OpenAI's price.
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

  constructor(private readonly config: ConfigService) {}

  engine(): ModalEngine {
    return this.config.get<string>('MODAL_TTS_ENGINE', 'qwen') === 'kokoro'
      ? 'kokoro'
      : 'qwen';
  }

  label(): { model: string; voice: string } {
    const kokoro = this.engine() === 'kokoro';
    return {
      model: this.config.get<string>(
        'MODAL_TTS_MODEL',
        kokoro ? 'kokoro-82m' : 'qwen3-tts-0.6b',
      ),
      voice: this.config.get<string>(
        'MODAL_TTS_VOICE',
        kokoro ? 'am_michael' : 'ryan',
      ),
    };
  }

  async synthesize({
    text,
    voice,
    instructions,
    speed,
    pieces,
  }: {
    text: string;
    voice?: string;
    instructions?: string;
    speed?: number;
    pieces?: { text: string; speed: number; pauseAfter: number }[];
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs?: number;
  }> {
    const base = this.config
      .getOrThrow<string>('MODAL_TTS_URL')
      .replace(/\/+$/, '');
    const token = this.config.getOrThrow<string>('MODAL_TTS_TOKEN');
    const speaker = (voice ?? this.label().voice).toLowerCase();
    const engine = this.engine();

    // Kokoro takes the page as pieces, each at its pace with its silence
    // after; one request, the service joins them.
    if (engine === 'kokoro' && pieces?.length) {
      const { audio, durationMs } = await this.once(
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
        },
      );
      return {
        audio,
        mimeType: 'audio/mpeg',
        model: `modal:${this.label().model}`,
        ...(durationMs !== undefined ? { durationMs } : {}),
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
      model: `modal:${this.label().model}`,
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
  ): Promise<{ audio: Buffer; durationMs?: number }> {
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
        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length) throw new Error('The speech service sent no audio');
        // The true length, when the service measured it (Kokoro does).
        const seconds = Number(response.headers.get('x-audio-seconds'));
        return Number.isFinite(seconds) && seconds > 0
          ? { audio, durationMs: Math.round(seconds * 1000) }
          : { audio };
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

/**
 * Bound in place of the Modal adapter when no service URL is set: a
 * lecture then fails to voice, loudly, rather than being voiced at
 * OpenAI's price by accident. The chapter writer checks the URL first and
 * leaves rows scripted, so this is reached only by a stale job.
 */
@Injectable()
export class NoLectureSpeech implements SpeechPort {
  label(): { model: string; voice: string } {
    return { model: 'none', voice: 'none' };
  }

  synthesize(): Promise<never> {
    return Promise.reject(
      new Error(
        'No lecture speech service is set (MODAL_TTS_URL); no lecture is voiced without one',
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
