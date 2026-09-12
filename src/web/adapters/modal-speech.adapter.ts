import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort } from '../../business/ports/voice.port';

/**
 * A school's catalogue voiced on our own rented GPU, through the Modal
 * service in `modal/tts_service.py`: one container running vLLM-Omni's
 * speech server, many pages at once, billed by the second and asleep
 * between runs. One request per page; the mp3 comes back on the same
 * connection.
 *
 * This is never a fallback for anything and nothing falls back from it. A
 * page it cannot voice fails, with the reason on the row, and is tried
 * again when the admin presses Prepare. It must never cost OpenAI's price.
 */
@Injectable()
export class ModalSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(ModalSpeechAdapter.name);
  /** A lecture page is well under it; anything longer is split first. */
  private static readonly INPUT_LIMIT = 5_000;
  private static readonly ATTEMPTS = 3;
  /**
   * One request's ceiling. The first page of a run may be waiting on a
   * container that is still loading the engine; a page on a warm card is
   * seconds. Modal answers a request past two and a half minutes with a
   * redirect that fetch follows, so a slow page is not cut off.
   */
  private static readonly REQUEST_MS = 3 * 60_000;

  constructor(private readonly config: ConfigService) {}

  label(): { model: string; voice: string } {
    return {
      model: this.config.get<string>('MODAL_TTS_MODEL', 'qwen3-tts-0.6b'),
      voice: this.config.get<string>('MODAL_TTS_VOICE', 'ryan'),
    };
  }

  async synthesize({
    text,
    voice,
    instructions,
  }: {
    text: string;
    voice?: string;
    instructions?: string;
    speed?: number;
  }): Promise<{ audio: Buffer; mimeType: string; model: string }> {
    const base = this.config
      .getOrThrow<string>('MODAL_TTS_URL')
      .replace(/\/+$/, '');
    const token = this.config.getOrThrow<string>('MODAL_TTS_TOKEN');
    const speaker = (voice ?? this.label().voice).toLowerCase();

    const buffers: Buffer[] = [];
    for (const part of chunk(text, ModalSpeechAdapter.INPUT_LIMIT)) {
      buffers.push(
        await this.once(`${base}/v1/audio/speech`, token, {
          input: part,
          voice: speaker,
          instructions,
          language: 'English',
          response_format: 'mp3',
        }),
      );
    }
    return {
      audio: Buffer.concat(buffers),
      mimeType: 'audio/mpeg',
      model: `modal:${this.label().model}`,
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
  ): Promise<Buffer> {
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
        return audio;
      } catch (error) {
        lastError = error as Error;
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
 * school's document then fails to voice, loudly, rather than being voiced
 * at OpenAI's price by accident.
 */
@Injectable()
export class NoCatalogueSpeech implements SpeechPort {
  label(): { model: string; voice: string } {
    return { model: 'none', voice: 'none' };
  }

  synthesize(): Promise<never> {
    return Promise.reject(
      new Error(
        'No catalogue speech service is set (MODAL_TTS_URL); a school document is not voiced without one',
      ),
    );
  }
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
