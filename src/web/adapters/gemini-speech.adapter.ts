import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort } from '../../business/ports/voice.port';
import { pcmMs, readPcm16, readWav } from '../../business/domain/wav';
import { encodeMp3 } from './audio/mp3';

/** The Gemini API's home. */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Google's pick for quality and long narration, GA on 2026-09-22. */
export const GEMINI_TTS_DEFAULT_MODEL = 'gemini-3.8-flash-tts';
/** "Warm", of the thirty; the line-up (scripts/scene-voices.ts) is for choosing another. */
export const GEMINI_TTS_DEFAULT_VOICE = 'Sulafat';

/** A sentence as the port hands it over; Gemini is directed by `style` and ignores `speed`. */
type Piece = {
  text: string;
  pauseAfter: number;
  speed?: number;
  style?: string;
};

/** One sentence as the voice is sent it: its words, a pause after it, and how it goes. */
export interface GeminiItem {
  text: string;
  style: string | null;
}

/**
 * The silence after a sentence, as the voice's own inline mark. It reads
 * the text word for word and cannot be held to a length, so only the
 * silences that matter are marked; the aligner measures what was said.
 */
export function pauseTag(seconds: number): string {
  if (seconds >= 0.6) return ' <long pause>';
  if (seconds >= 0.4) return ' <short pause>';
  return '';
}

/** The page as the voice's text items: a sentence each, with its direction. */
export function geminiItems(pieces: Piece[]): GeminiItem[] {
  return pieces
    .filter((piece) => piece.text.trim())
    .map((piece, i, all) => ({
      // Nothing after the last sentence: the page simply ends.
      text: `${piece.text.trim()}${i < all.length - 1 ? pauseTag(piece.pauseAfter) : ''}`,
      style: piece.style?.trim() || null,
    }));
}

/** The request to the Interactions API, the route Google's speech guide documents. */
export function interactionRequest(
  model: string,
  voice: string,
  items: GeminiItem[],
): { url: string; body: Record<string, unknown> } {
  return {
    url: `${BASE}/interactions`,
    body: {
      model,
      // Nothing kept on Google's side: the page is spoken and forgotten.
      store: false,
      input: [
        {
          type: 'user_input',
          content: items.map((item) => ({
            type: 'text',
            text: item.text,
            ...(item.style
              ? {
                  annotations: [{ type: 'speech_metadata', style: item.style }],
                }
              : {}),
          })),
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    },
  };
}

/** The same through generateContent, which Google calls legacy and still serves. */
export function generateRequest(
  model: string,
  voice: string,
  items: GeminiItem[],
): { url: string; body: Record<string, unknown> } {
  return {
    url: `${BASE}/models/${encodeURIComponent(model)}:generateContent`,
    body: {
      contents: [
        {
          role: 'user',
          parts: items.map((item) => ({
            text: item.text,
            ...(item.style ? { speechMetadata: { style: item.style } } : {}),
          })),
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    },
  };
}

/**
 * The audio in an answer from either route: the first part that is audio,
 * wherever the route nests it (`steps[].content[]` on Interactions,
 * `candidates[].content.parts[].inlineData` on generateContent).
 */
export function audioIn(
  answer: unknown,
): { data: string; mimeType: string } | null {
  const seen = new Set<unknown>();
  const visit = (node: unknown): { data: string; mimeType: string } | null => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const one = node as Record<string, unknown>;
    const mime =
      (typeof one.mime_type === 'string' && one.mime_type) ||
      (typeof one.mimeType === 'string' && one.mimeType) ||
      '';
    if (
      typeof one.data === 'string' &&
      one.data &&
      (one.type === 'audio' || mime.startsWith('audio/'))
    )
      return { data: one.data, mimeType: mime || 'audio/wav' };
    for (const value of Array.isArray(node) ? node : Object.values(one)) {
      const found = visit(value);
      if (found) return found;
    }
    return null;
  };
  return visit(answer);
}

/** Tokens in and out, as either route reports them, when it does. */
export function usageIn(
  answer: unknown,
): { tokensIn: number; tokensOut: number } | null {
  const body = (answer ?? {}) as {
    usage?: { input_tokens?: number; output_tokens?: number };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const tokensIn =
    body.usage?.input_tokens ?? body.usageMetadata?.promptTokenCount;
  const tokensOut =
    body.usage?.output_tokens ?? body.usageMetadata?.candidatesTokenCount;
  return Number.isFinite(tokensIn) && Number.isFinite(tokensOut)
    ? { tokensIn: Number(tokensIn), tokensOut: Number(tokensOut) }
    : null;
}

/** The sample rate a raw audio type names ("audio/L16;rate=24000"), if it names one. */
export function rateOf(mimeType: string): number | null {
  const match = /rate=(\d+)/i.exec(mimeType);
  return match ? Number(match[1]) : null;
}

/**
 * Visualize's voice on Google's Gemini TTS: the paid pilot beside Kokoro,
 * chosen with SCENE_VOICE_ENGINE=gemini and a GEMINI_API_KEY.
 *
 * One request a page: each sentence a text item with a few words of
 * direction (who is speaking, the page's mood, how the sentence goes),
 * the long silences marked inline. The answer is WAV; it is encoded to
 * mp3 here so the page's audio is stored and played like every other.
 * Gemini says nothing of when it spoke each word, so the page is timed
 * by the aligner, as a voice without timestamps always has been.
 *
 * Lectures never come here. A page it cannot voice fails with Google's
 * reason on the row, and the queue asks again.
 */
@Injectable()
export class GeminiSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(GeminiSpeechAdapter.name);
  /** A rate limit or a 5xx is worth two more tries; a refusal is not. */
  private static readonly ATTEMPTS = 3;
  /** A page is well under a minute of work for the voice. */
  private static readonly REQUEST_MS = 3 * 60_000;

  constructor(
    private readonly config: ConfigService,
    private readonly encode: (
      samples: Int16Array,
      sampleRate: number,
    ) => Promise<Buffer> = encodeMp3,
    private readonly send: typeof fetch = (...args: Parameters<typeof fetch>) =>
      fetch(...args),
  ) {}

  label(): { model: string; voice: string } {
    return {
      model:
        this.config.get<string>('GEMINI_TTS_MODEL')?.trim() ||
        GEMINI_TTS_DEFAULT_MODEL,
      voice:
        this.config.get<string>('GEMINI_TTS_VOICE')?.trim() ||
        GEMINI_TTS_DEFAULT_VOICE,
    };
  }

  async synthesize({
    text,
    voice,
    pieces,
  }: {
    text: string;
    voice?: string;
    pieces?: Piece[];
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs: number;
    usage?: { tokensIn: number; tokensOut: number };
  }> {
    const key =
      this.config.get<string>('GEMINI_API_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_GENERATIVE_AI_API_KEY')?.trim();
    if (!key)
      throw refused(
        401,
        'No Gemini key is set (GEMINI_API_KEY): Visualize cannot use the Gemini voice',
      );
    const { model } = this.label();
    const speaker = voice?.trim() || this.label().voice;
    const items = geminiItems(
      pieces?.length ? pieces : [{ text, pauseAfter: 0 }],
    );
    if (!items.length) throw refused(400, 'There is nothing to say');
    const { url, body } =
      this.config.get<string>('GEMINI_TTS_API') === 'generate'
        ? generateRequest(model, speaker, items)
        : interactionRequest(model, speaker, items);

    const answer = await this.attempts(url, key, body);
    const found = audioIn(answer);
    if (!found) throw new Error('The Gemini voice sent no audio');
    const bytes = Buffer.from(found.data, 'base64');
    const wav = readWav(bytes);
    if (!wav && /wav/i.test(found.mimeType))
      throw new Error('The Gemini voice sent audio that is not 16-bit PCM');
    const pcm = wav ?? readPcm16(bytes, rateOf(found.mimeType) ?? 24000);
    if (!pcm.samples.length) throw new Error('The Gemini voice sent silence');
    const usage = usageIn(answer);
    return {
      audio: await this.encode(pcm.samples, pcm.sampleRate),
      mimeType: 'audio/mpeg',
      model: `gemini:${model}`,
      durationMs: pcmMs(pcm),
      ...(usage ? { usage } : {}),
    };
  }

  /**
   * The request, tried again on a rate limit, a 5xx or a dropped
   * connection. A refusal (any other 4xx) is thrown at once with its
   * status, which the worker reads as permanent.
   */
  private async attempts(
    url: string,
    key: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    let lastError: Error | null = null;
    for (
      let attempt = 1;
      attempt <= GeminiSpeechAdapter.ATTEMPTS;
      attempt += 1
    ) {
      let wait = 2_000 * attempt * attempt;
      try {
        const response = await this.send(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(GeminiSpeechAdapter.REQUEST_MS),
        });
        if (response.ok) return (await response.json()) as unknown;
        const reason = reasonIn(await response.text());
        if (response.status === 401 || response.status === 403)
          throw refused(
            response.status,
            `The Gemini voice refused our key: ${reason}`,
          );
        if (response.status === 429) {
          // Google says how long to wait, sometimes; never more than a minute.
          const after = Number(response.headers.get('retry-after'));
          if (Number.isFinite(after) && after > 0)
            wait = Math.min(60_000, after * 1000);
          throw new Error(`The Gemini voice is rate limited: ${reason}`);
        }
        if (response.status >= 400 && response.status < 500)
          throw refused(
            response.status,
            `The Gemini voice refused the page (${response.status}): ${reason}`,
          );
        throw new Error(
          `The Gemini voice answered ${response.status}: ${reason}`,
        );
      } catch (error) {
        lastError = named(error);
        if (isRefusal(lastError)) throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${GeminiSpeechAdapter.ATTEMPTS} failed: ${lastError.message}`,
        );
        if (attempt < GeminiSpeechAdapter.ATTEMPTS)
          await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    throw lastError ?? new Error('The Gemini voice did not answer');
  }
}

/** Google's own words for what was wrong, out of its JSON envelope when it sent one. */
function reasonIn(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message.slice(0, 240);
  } catch {
    // not JSON: the body is the reason
  }
  return body.slice(0, 240);
}

/** An error the worker will not retry: it carries the 4xx status Google answered with. */
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
    return new Error('The Gemini voice did not answer in time');
  if (raised?.message === 'fetch failed' && raised.cause)
    return new Error(
      `Could not reach the Gemini voice: ${raised.cause.code ?? 'unknown cause'}`,
    );
  return raised instanceof Error ? raised : new Error(String(error));
}
