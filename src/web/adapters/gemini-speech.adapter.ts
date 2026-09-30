import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechPort } from '../../business/ports/voice.port';
import { pcmMs, readPcm16, readWav } from '../../business/domain/wav';
import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';
import { encodeMp3 } from './audio/mp3';
import {
  noticeRecovered,
  noticeRetry,
} from '../../business/domain/work-progress';

/** The Gemini API's home. */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Google's pick for quality and long narration, GA on 2026-09-22. */
export const GEMINI_TTS_DEFAULT_MODEL = 'gemini-3.8-flash-tts';
/** "Warm", of the thirty; the line-up (scripts/scene-voices.ts) is for choosing another. */
export const GEMINI_TTS_DEFAULT_VOICE = 'Sulafat';

/**
 * The same Gemini voices sold through Cloud Text-to-Speech: no daily cap
 * (the Gemini API allows a hundred lines a day, even paid), billed to the
 * project's Cloud billing. Used when the Gemini API's day is spent, and
 * only with GOOGLE_CLOUD_TTS_API_KEY set.
 */
const CLOUD_TTS = 'https://texttospeech.googleapis.com/v1/text:synthesize';
/** Cloud's newest Gemini voice model. */
export const CLOUD_TTS_DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview';
/** Cloud takes at most 4,000 bytes of words a request: kept well under. */
const CLOUD_TEXT_BYTES = 3_500;
/** How long the Gemini API is left alone once its day is spent. */
const CAPPED_MS = 60 * 60_000;

/**
 * The Gemini API's voice allows ten requests a minute on Tier 1: every
 * adapter in the process shares one count, so scenes made side by side
 * wait their turn rather than being turned away.
 */
const sentAt: number[] = [];
async function paced(perMinute: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] >= 60_000) sentAt.shift();
    if (sentAt.length < perMinute) {
      sentAt.push(now);
      return;
    }
    const wait = 60_000 - (now - sentAt[0]) + 250;
    // Waiting its turn is said, so a scene held here is not taken for stuck.
    noticeRetry({ service: 'voice', status: 429, waiting: true, waitMs: wait });
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** How long Google says to wait ("Please retry in 29s"), in ms, when it says. */
export function retryAfterMs(reason: string): number | null {
  const match = /retry in (\d+(?:\.\d+)?)\s*s/i.exec(reason);
  return match ? Math.round(Number(match[1]) * 1000) + 500 : null;
}

/** Whether Cloud turned words away as against its usage guidelines. */
export function guidelineRefusal(message: string): boolean {
  return /usage guidelines|violates/i.test(message);
}

/** Whether Google's words say the day's quota is spent, not just a burst. */
export function dailyCap(reason: string): boolean {
  return /per day|requests per day|\bRPD\b|daily/i.test(reason);
}

/**
 * A run as Cloud Text-to-Speech is asked for it: Cloud takes one
 * direction a request, so each stretch of sentences directed alike is a
 * request of its own, split again where its words would pass Cloud's size.
 */
export function cloudRequests(
  model: string,
  voice: string,
  items: GeminiItem[],
): Record<string, unknown>[] {
  const groups: { style: string | null; texts: string[]; bytes: number }[] = [];
  for (const item of items) {
    const bytes = Buffer.byteLength(item.text) + 1;
    const last = groups[groups.length - 1];
    if (
      last &&
      last.style === item.style &&
      last.bytes + bytes <= CLOUD_TEXT_BYTES
    ) {
      last.texts.push(item.text);
      last.bytes += bytes;
    } else groups.push({ style: item.style, texts: [item.text], bytes });
  }
  return groups.map((group) => ({
    input: {
      text: group.texts.join(' '),
      ...(group.style ? { prompt: group.style } : {}),
    },
    voice: { languageCode: 'en-us', name: voice, model_name: model },
    audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
  }));
}

/** A sentence as the port hands it over; Gemini is directed by `style` and ignores `speed`. */
type Piece = {
  text: string;
  pauseAfter: number;
  speed?: number;
  style?: string;
  /** Another of its voices for this piece: a story's character. */
  voice?: string;
};

/** Runs of one voice asked for at once. */
const AT_ONCE = 3;

/**
 * The pieces in runs, each one request: a new run only where the voice
 * changes (a story's character). A page in one voice is one request; the
 * daily quota counts requests, and a page parted at every long silence
 * spent eight of them.
 */
export function voiceRuns<T extends { voice?: string }>(
  pieces: T[],
): { voice: string | undefined; pieces: T[] }[] {
  const runs: { voice: string | undefined; pieces: T[] }[] = [];
  for (const piece of pieces) {
    const last = runs[runs.length - 1];
    if (last && last.voice === piece.voice) last.pieces.push(piece);
    else runs.push({ voice: piece.voice, pieces: [piece] });
  }
  return runs;
}

/** Frames the loudness is measured over, in ms. */
const FRAME_MS = 10;
/** Quieter than this share of the loudest frame is quiet. */
const QUIET_SHARE = 0.04;
/** The shortest quiet taken for the gap after a sentence. */
const GAP_LEAST_MS = 80;
/** How far from where a sentence should end its gap may be. */
const GAP_REACH_MS = 1800;

/** A quiet the voice leaves inside a sentence longer than this is its own hesitation… */
export const INSIDE_GAP_MS = 600;
/** …and is trimmed to this (studio-explainer-plan, Ask 1: pause shaping). */
export const INSIDE_KEEP_MS = 250;

/** The quiet stretches inside a run's speech, in frames, and the frame's length. */
function quietFrames(
  samples: Int16Array,
  rate: number,
): {
  frame: number;
  first: number;
  last: number;
  gaps: [number, number][];
} | null {
  const frame = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
  const frames = Math.floor(samples.length / frame);
  const level: number[] = [];
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i += 1)
      sum += samples[i] * samples[i];
    level.push(Math.sqrt(sum / frame));
  }
  const loudest = Math.max(0, ...level);
  if (!loudest) return null;
  const quiet = level.map((one) => one < loudest * QUIET_SHARE);
  const first = quiet.indexOf(false);
  const last = quiet.lastIndexOf(false);
  const gaps: [number, number][] = [];
  for (let f = first; f <= last; f += 1) {
    if (!quiet[f]) continue;
    let to = f;
    while (to + 1 <= last && quiet[to + 1]) to += 1;
    if ((to - f + 1) * FRAME_MS >= GAP_LEAST_MS) gaps.push([f, to]);
    f = to;
  }
  return { frame, first, last, gaps };
}

/**
 * Where each sentence of a run ends: the quiet after it, as samples
 * [from, to], found near where the sentence's share of the words puts
 * its end, the longest quiet there winning. Null where there is none
 * near: that sentence keeps its own full stop.
 */
export function sentenceGaps(
  samples: Int16Array,
  rate: number,
  lengths: number[],
): ([number, number] | null)[] {
  const boundaries = lengths.length - 1;
  const heard = quietFrames(samples, rate);
  if (!heard || boundaries < 1)
    return new Array<null>(Math.max(0, boundaries)).fill(null);
  const { frame, first, last, gaps } = heard;
  const total = lengths.reduce((sum, one) => sum + one, 0) || 1;
  const reach = GAP_REACH_MS / FRAME_MS;
  const found: ([number, number] | null)[] = [];
  let said = 0;
  let after = first;
  for (let b = 0; b < boundaries; b += 1) {
    said += lengths[b];
    const expected = first + ((last - first) * said) / total;
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (const gap of gaps) {
      const middle = (gap[0] + gap[1]) / 2;
      if (gap[0] <= after || Math.abs(middle - expected) > reach) continue;
      // The longest quiet near where it should be; nearer breaks a tie.
      const score = gap[1] - gap[0] - Math.abs(middle - expected) / 8;
      if (score > bestScore) {
        best = gap;
        bestScore = score;
      }
    }
    if (best) after = best[1];
    found.push(best ? [best[0] * frame, (best[1] + 1) * frame] : null);
  }
  return found;
}

/**
 * The long quiets inside a run that are no sentence's end: the voice
 * hesitating mid-sentence, which Gemini does now and then for a second
 * or more. In samples.
 */
export function innerGaps(
  samples: Int16Array,
  rate: number,
  ends: readonly ([number, number] | null)[],
): [number, number][] {
  const heard = quietFrames(samples, rate);
  if (!heard) return [];
  const least = INSIDE_GAP_MS / FRAME_MS;
  return heard.gaps
    .map(([a, b]): [number, number] => [a * heard.frame, (b + 1) * heard.frame])
    .filter(
      ([a, b]) =>
        (b - a) / heard.frame >= least &&
        !ends.some((end) => end && end[0] < b && a < end[1]),
    );
}

/**
 * A run's audio with each sentence's silence as the page asked for it:
 * the quiet the voice left after a sentence made up to its pause, never
 * cut shorter. The voice is never asked for a pause in words, which it
 * sometimes read aloud.
 */
export function withPauses(
  samples: Int16Array,
  rate: number,
  pieces: { text: string; pauseAfter: number }[],
): Int16Array {
  return pausedRun(samples, rate, pieces).samples;
}

/**
 * A run's audio with each sentence's silence as the page asked for it, a
 * long hesitation inside a sentence cut to a breath (INSIDE_KEEP_MS), and
 * where each quiet between its sentences now lies, in samples: the times
 * no word can start in.
 */
export function pausedRun(
  samples: Int16Array,
  rate: number,
  pieces: { text: string; pauseAfter: number }[],
): { samples: Int16Array; quiet: [number, number][] } {
  const gaps = sentenceGaps(
    samples,
    rate,
    pieces.map((piece) => piece.text.length),
  );
  // Each change, in order: a sentence's quiet made up to its pause (more
  // silence at its middle), or a hesitation shortened from its middle.
  const keep = Math.round((INSIDE_KEEP_MS * rate) / 1000);
  const changes: { from: number; to: number; add: number; end: boolean }[] = [];
  gaps.forEach((gap, b) => {
    if (!gap) return;
    const wanted = Math.round(pieces[b].pauseAfter * rate);
    changes.push({
      from: gap[0],
      to: gap[1],
      add: Math.max(0, wanted - (gap[1] - gap[0])),
      end: true,
    });
  });
  for (const [a, b] of innerGaps(samples, rate, gaps))
    changes.push({ from: a, to: b, add: -(b - a - keep), end: false });
  changes.sort((x, y) => x.from - y.from);
  const parts: Int16Array[] = [];
  const quiet: [number, number][] = [];
  let from = 0;
  let added = 0;
  for (const change of changes) {
    const middle = Math.round((change.from + change.to) / 2);
    if (change.end)
      quiet.push([change.from + added, change.to + added + change.add]);
    if (change.add > 0) {
      parts.push(samples.subarray(from, middle), new Int16Array(change.add));
      from = middle;
    } else if (change.add < 0) {
      const cut = -change.add;
      const cutFrom = middle - Math.floor(cut / 2);
      parts.push(samples.subarray(from, cutFrom));
      from = cutFrom + cut;
    }
    added += change.add;
  }
  if (!parts.length) return { samples, quiet };
  parts.push(samples.subarray(from));
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { samples: out, quiet };
}

/** One sentence as the voice is sent it: its words, a pause after it, and how it goes. */
export interface GeminiItem {
  text: string;
  style: string | null;
}

/**
 * The page as the voice's text items: a sentence each, with its direction,
 * and nothing it could read aloud but the words. A short silence is the
 * sentence's own full stop; a long one is put in by the page (voiceRuns).
 */
export function geminiItems(pieces: Piece[]): GeminiItem[] {
  return pieces
    .filter((piece) => piece.text.trim())
    .map((piece) => ({
      text: piece.text.trim(),
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
 * direction (who is speaking, the page's mood, how the sentence goes).
 * The silences are not asked for (the voice read "long pause" aloud):
 * each is made here, in the quiet it left after the sentence. The answer is WAV; it is encoded to
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
  private static readonly ATTEMPTS = 5;
  /** A page is well under a minute of work for the voice. */
  private static readonly REQUEST_MS = 3 * 60_000;
  /** Until when the Gemini API's day is spent, so Cloud speaks at once. */
  private cappedUntil = 0;
  /** Cloud's service account, signed in once. */
  private signer: { jwt: JWT; project: string } | null = null;

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
    lead,
  }: {
    text: string;
    voice?: string;
    pieces?: Piece[];
    lead?: number;
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    model: string;
    durationMs: number;
    silencesMs: [number, number][];
    pcm: { samples: Int16Array; sampleRate: number };
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
    const given: Piece[] = pieces?.length ? pieces : [{ text, pauseAfter: 0 }];
    if (!geminiItems(given).length)
      throw refused(400, 'There is nothing to say');
    // A story's characters speak in voices of their own: each run of one
    // voice is its own request, and the runs are joined with the silence
    // the last piece of each asked for.
    const runs = voiceRuns(given);
    const parts: Int16Array[] = [];
    let rate = 24000;
    let tokensIn = 0;
    let tokensOut = 0;
    let counted = false;
    let byCloud = false;
    // A few runs at once, joined in order with the silence each asked for.
    const spoken: ({
      samples: Int16Array;
      rate: number;
      quiet: [number, number][];
      usage: { tokensIn: number; tokensOut: number } | null;
    } | null)[] = runs.map(() => null);
    for (let from = 0; from < runs.length; from += AT_ONCE)
      await Promise.all(
        runs.slice(from, from + AT_ONCE).map(async (run, j) => {
          const items = geminiItems(run.pieces);
          if (!items.length) return;
          const who = run.voice?.trim() || speaker;
          const { pcm, usage, cloud } = await this.voiceRun(
            model,
            who,
            items,
            key,
          );
          if (cloud) byCloud = true;
          if (!pcm.samples.length)
            throw new Error('The Gemini voice sent silence');
          // Each sentence's silence, made here: never asked for in words.
          const paused = pausedRun(
            pcm.samples,
            pcm.sampleRate,
            run.pieces.filter((piece) => piece.text.trim()),
          );
          spoken[from + j] = {
            samples: paused.samples,
            rate: pcm.sampleRate,
            quiet: paused.quiet,
            usage,
          };
        }),
      );
    /** Where the voice is silent, in samples from the start: no word starts in it. */
    const quiet: [number, number][] = [];
    let length = 0;
    for (const [k, run] of runs.entries()) {
      const one = spoken[k];
      if (!one) continue;
      rate = one.rate;
      parts.push(one.samples);
      for (const [a, b] of one.quiet) quiet.push([length + a, length + b]);
      length += one.samples.length;
      // The last run's too: the quiet planned after the last line is where
      // the scene's last moments play, and the film holds on them.
      const pause = run.pieces[run.pieces.length - 1].pauseAfter;
      if (pause > 0) {
        const silence = Math.round(pause * rate);
        parts.push(new Int16Array(silence));
        quiet.push([length, length + silence]);
        length += silence;
      }
      if (one.usage) {
        tokensIn += one.usage.tokensIn;
        tokensOut += one.usage.tokensOut;
        counted = true;
      }
    }
    // Quiet before the first word, when the page opens on the stage alone.
    const before = lead && lead > 0 ? Math.round(lead * rate) : 0;
    if (before) parts.unshift(new Int16Array(before));
    const silencesMs = [
      ...(before ? [[0, before] as [number, number]] : []),
      ...quiet.map(([a, b]): [number, number] => [a + before, b + before]),
    ].map(([a, b]): [number, number] => [
      Math.round((a / rate) * 1000),
      Math.round((b / rate) * 1000),
    ]);
    const samples = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      samples.set(part, at);
      at += part.length;
    }
    return {
      audio: await this.encode(samples, rate),
      // The samples too: the pace step puts them right without decoding.
      pcm: { samples, sampleRate: rate },
      mimeType: 'audio/mpeg',
      model: byCloud ? `gemini:${this.cloudModel()}` : `gemini:${model}`,
      durationMs: pcmMs({ samples, sampleRate: rate }),
      silencesMs,
      ...(counted ? { usage: { tokensIn, tokensOut } } : {}),
    };
  }

  private cloudModel(): string {
    return (
      this.config.get<string>('GOOGLE_CLOUD_TTS_MODEL')?.trim() ||
      CLOUD_TTS_DEFAULT_MODEL
    );
  }

  /**
   * One run of one voice, as 16-bit samples: from the Gemini API, or from
   * Cloud Text-to-Speech in the same voice once the Gemini API's day is
   * spent and Cloud is set up. A film is never stopped by the cap.
   */
  private async voiceRun(
    model: string,
    voice: string,
    items: GeminiItem[],
    key: string,
  ): Promise<{
    pcm: { samples: Int16Array; sampleRate: number };
    usage: { tokensIn: number; tokensOut: number } | null;
    cloud: boolean;
  }> {
    const cloudReady = this.cloudReady();
    if (cloudReady && Date.now() < this.cappedUntil)
      return {
        pcm: await this.cloud(voice, items),
        usage: null,
        cloud: true,
      };
    const { url, body } =
      this.config.get<string>('GEMINI_TTS_API') === 'generate'
        ? generateRequest(model, voice, items)
        : interactionRequest(model, voice, items);
    let answer: unknown;
    try {
      answer = await this.attempts(url, { 'x-goog-api-key': key }, body, true);
    } catch (error) {
      const spent = (error as { daily?: boolean }).daily === true;
      const busy = (error as { busy?: boolean }).busy === true;
      if ((!spent && !busy) || !cloudReady) throw error;
      this.cappedUntil = Date.now() + (spent ? CAPPED_MS : 2 * 60_000);
      this.logger.warn(
        spent
          ? "The Gemini voice's day is spent: Cloud Text-to-Speech speaks in the same voices for the next hour"
          : 'The Gemini voice is still busy after waiting: Cloud Text-to-Speech speaks in the same voices for two minutes',
      );
      return {
        pcm: await this.cloud(voice, items),
        usage: null,
        cloud: true,
      };
    }
    const found = audioIn(answer);
    if (!found) throw new Error('The Gemini voice sent no audio');
    const bytes = Buffer.from(found.data, 'base64');
    const wav = readWav(bytes);
    if (!wav && /wav/i.test(found.mimeType))
      throw new Error('The Gemini voice sent audio that is not 16-bit PCM');
    return {
      pcm: wav ?? readPcm16(bytes, rateOf(found.mimeType) ?? 24000),
      usage: usageIn(answer),
      cloud: false,
    };
  }

  /** Whether Cloud Text-to-Speech can be asked: a service account, or a key. */
  private cloudReady(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLOUD_TTS_CREDENTIALS')?.trim() ||
      this.config.get<string>('GOOGLE_CLOUD_TTS_API_KEY')?.trim(),
    );
  }

  /**
   * How Cloud Text-to-Speech is signed in to. Its Gemini voices take no
   * API key (it answers "API keys are not supported"): a service account
   * of the project (GOOGLE_CLOUD_TTS_CREDENTIALS: its JSON key in base64,
   * the JSON itself, or its file's path), its token kept until it runs out, billed to its
   * own project. A key is used only where Cloud still takes one.
   */
  private async cloudHeaders(): Promise<Record<string, string>> {
    const given = this.config
      .get<string>('GOOGLE_CLOUD_TTS_CREDENTIALS')
      ?.trim();
    if (!given) {
      const key = this.config.get<string>('GOOGLE_CLOUD_TTS_API_KEY')?.trim();
      return key ? { 'x-goog-api-key': key } : {};
    }
    if (!this.signer) {
      const account = JSON.parse(serviceAccountJson(given)) as {
        client_email: string;
        private_key: string;
        project_id: string;
      };
      this.signer = {
        project: account.project_id,
        jwt: new JWT({
          email: account.client_email,
          key: account.private_key,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        }),
      };
    }
    const { token } = await this.signer.jwt.getAccessToken();
    if (!token)
      throw refused(
        401,
        'Cloud Text-to-Speech gave the service account no token',
      );
    return {
      authorization: `Bearer ${token}`,
      'x-goog-user-project': this.signer.project,
    };
  }

  /**
   * One Cloud request's audio. Cloud's filter turns away harmless words
   * now and then (a children's counting story): then it is asked again
   * without the direction, then a sentence at a time without it, so only
   * a sentence it still refuses fails the scene.
   */
  private async cloudSay(
    body: Record<string, unknown>,
  ): Promise<{ samples: Int16Array; sampleRate: number }[]> {
    const say = async (one: Record<string, unknown>) => {
      const answer = (await this.attempts(
        CLOUD_TTS,
        await this.cloudHeaders(),
        one,
      )) as { audioContent?: string };
      if (!answer?.audioContent)
        throw new Error('Cloud Text-to-Speech sent no audio');
      const bytes = Buffer.from(answer.audioContent, 'base64');
      return readWav(bytes) ?? readPcm16(bytes, 24000);
    };
    const input = body.input as { text: string; prompt?: string };
    try {
      return [await say(body)];
    } catch (error) {
      if (!guidelineRefusal((error as Error).message)) throw error;
    }
    this.logger.warn(
      `Cloud Text-to-Speech turned away "${input.text.slice(0, 120)}" (${input.prompt ?? 'no direction'}): asked again plainly`,
    );
    const plain = { ...body, input: { text: input.text } };
    try {
      return [await say(plain)];
    } catch (error) {
      if (!guidelineRefusal((error as Error).message)) throw error;
    }
    const sentences = input.text.match(/[^.!?]+[.!?]*["'”’)]*\s*/g) ?? [
      input.text,
    ];
    const out: { samples: Int16Array; sampleRate: number }[] = [];
    for (const sentence of sentences.map((one) => one.trim()).filter(Boolean))
      out.push(await say({ ...body, input: { text: sentence } }));
    return out;
  }

  /** A run spoken by Cloud Text-to-Speech, its requests joined in order. */
  private async cloud(
    voice: string,
    items: GeminiItem[],
  ): Promise<{ samples: Int16Array; sampleRate: number }> {
    const parts: Int16Array[] = [];
    let sampleRate = 24000;
    for (const body of cloudRequests(this.cloudModel(), voice, items)) {
      for (const pcm of await this.cloudSay(body)) {
        sampleRate = pcm.sampleRate;
        parts.push(pcm.samples);
      }
    }
    const samples = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      samples.set(part, at);
      at += part.length;
    }
    return { samples, sampleRate };
  }

  /**
   * The request, tried again on a rate limit, a 5xx or a dropped
   * connection. A refusal (any other 4xx) is thrown at once with its
   * status, which the worker reads as permanent.
   */
  private async attempts(
    url: string,
    auth: Record<string, string>,
    body: Record<string, unknown>,
    gemini = false,
  ): Promise<unknown> {
    let lastError: Error | null = null;
    for (
      let attempt = 1;
      attempt <= GeminiSpeechAdapter.ATTEMPTS;
      attempt += 1
    ) {
      let wait = 2_000 * attempt * attempt;
      try {
        if (gemini)
          await paced(
            Number(this.config.get<string>('GEMINI_TTS_PER_MINUTE')) || 9,
          );
        const response = await this.send(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...auth,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(GeminiSpeechAdapter.REQUEST_MS),
        });
        if (response.ok) {
          noticeRecovered('voice');
          return (await response.json()) as unknown;
        }
        const reason = reasonIn(await response.text());
        if (response.status === 401 || response.status === 403)
          throw refused(
            response.status,
            `The Gemini voice refused our key: ${reason}`,
          );
        if (response.status === 429 && dailyCap(reason))
          // The day's quota: waiting a minute will not bring it back.
          throw Object.assign(
            new Error(`The Gemini voice is rate limited: ${reason}`),
            { daily: true },
          );
        if (response.status === 429) {
          // Google says how long to wait, sometimes; never more than a minute.
          const after = Number(response.headers.get('retry-after'));
          if (Number.isFinite(after) && after > 0)
            wait = Math.min(60_000, after * 1000);
          wait = Math.min(65_000, retryAfterMs(reason) ?? wait);
          throw Object.assign(
            new Error(`The Gemini voice is rate limited: ${reason}`),
            { busy: true },
          );
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
        if (isRefusal(lastError) || (lastError as { daily?: boolean }).daily)
          throw lastError;
        this.logger.warn(
          `attempt ${attempt} of ${GeminiSpeechAdapter.ATTEMPTS} failed: ${lastError.message}`,
        );
        if (attempt < GeminiSpeechAdapter.ATTEMPTS) {
          noticeRetry({
            service: 'voice',
            attempt: attempt + 1,
            of: GeminiSpeechAdapter.ATTEMPTS,
            waitMs: wait,
            error: lastError,
          });
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
    }
    throw lastError ?? new Error('The Gemini voice did not answer');
  }
}

/**
 * A service account's JSON key as the setting gives it: the JSON itself,
 * the JSON in base64 (one line, kept in the env like any secret), or the
 * path of its file.
 */
export function serviceAccountJson(given: string): string {
  if (given.startsWith('{')) return given;
  if (/^[A-Za-z0-9+/=_-]+$/.test(given) && !given.endsWith('.json')) {
    const decoded = Buffer.from(given, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) return decoded;
  }
  return readFileSync(given, 'utf8');
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
