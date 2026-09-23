/**
 * What a model call costs, and what preparing a document will cost before
 * the button is pressed. List prices, in US dollars, kept in one place so the
 * ledger and the estimate cannot disagree.
 */
import type { LectureStyle } from '../../contracts';

/**
 * Dollars per million tokens, in and out, by model id as the registry
 * names it; `cached` is the price of an input token served from the
 * provider's cache, where it charges less for one.
 */
const PER_MILLION: Record<
  string,
  { in: number; out: number; cached?: number }
> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-5-mini': { in: 0.25, out: 2 },
  'gpt-5': { in: 1.25, out: 10 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  'text-embedding-3-large': { in: 0.13, out: 0 },
  'deepseek-chat': { in: 0.27, out: 1.1 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  // V4.1 Flash, from September 2026, and V4 Pro, at the peak rate; the
  // off-peak rate is half. The cache price is what makes the artist's long
  // fixed prompt nearly free after the first drawing.
  'deepseek-flash': { in: 0.3, out: 1.2, cached: 0.006 },
  'deepseek-v4-pro': { in: 1.32, out: 3.96, cached: 0.044 },
};

/**
 * Speech is logged by characters spoken, not tokens. At the rate the voices
 * speak, about fifteen characters a second, the list price of a minute of
 * audio comes to this per character.
 */
const SPEECH_PER_CHAR = 0.015 / (15 * 60);

/**
 * A lecture is voiced on a rented GPU that bills by the second it runs,
 * not by the text. The engine does not say how many seconds a page took,
 * so a page is priced by the audio it made at a rate measured by the
 * bench on the card in use (MODAL_USD_PER_AUDIO_HOUR). An average, not a
 * metered figure; it is set again whenever the card or model changes.
 */
export function catalogueSpeechCost(
  audioMs: number,
  usdPerAudioHour: number,
): number {
  if (!(audioMs > 0) || !(usdPerAudioHour >= 0)) return 0;
  return Math.round((audioMs / 3_600_000) * usdPerAudioHour * 1e6) / 1e6;
}

/**
 * Gemini's voices, by the token: text in, audio out, per million, from
 * Google's price list of September 2026. Audio is 25 tokens a second, so
 * 3.8 Flash comes to $0.0135 a minute. Google has said 3.8's prices
 * double on 1 January 2027; `from` is when a rate starts.
 */
const GEMINI_TTS: Record<string, { in: number; out: number; from?: string }[]> =
  {
    'gemini-3.8-flash-tts': [
      { in: 0.5, out: 9 },
      { in: 1, out: 18, from: '2027-01-01' },
    ],
    'gemini-3.8-flash-lite-tts': [
      { in: 0.5, out: 6 },
      { in: 1, out: 12, from: '2027-01-01' },
    ],
    'gemini-3.1-flash-tts-preview': [{ in: 1, out: 20 }],
    'gemini-2.5-flash-preview-tts': [{ in: 0.5, out: 10 }],
    'gemini-2.5-pro-preview-tts': [{ in: 1, out: 20 }],
  };

/** Audio tokens a second of Gemini speech. */
export const GEMINI_AUDIO_TOKENS_PER_SECOND = 25;

/**
 * A page voiced by Gemini, priced by its tokens when Google reported them,
 * else by the audio's length and the text's (about four characters a
 * token). Null for a model the list does not know.
 */
export function geminiSpeechCost(input: {
  model: string;
  audioMs: number;
  textChars: number;
  tokensIn?: number;
  tokensOut?: number;
  at?: Date;
}): number | null {
  const id = input.model.replace(/^gemini:/, '');
  const rates = GEMINI_TTS[id];
  if (!rates) return null;
  const day = (input.at ?? new Date()).toISOString().slice(0, 10);
  const rate = [...rates].reverse().find((r) => !r.from || r.from <= day)!;
  const tokensIn = input.tokensIn ?? Math.ceil(input.textChars / 4);
  const tokensOut =
    input.tokensOut ??
    Math.ceil((input.audioMs / 1000) * GEMINI_AUDIO_TOKENS_PER_SECOND);
  return (
    Math.round(((tokensIn * rate.in + tokensOut * rate.out) / 1e6) * 1e6) / 1e6
  );
}

/**
 * The cost of one logged call, or null when the log does not carry what is
 * needed to price it (a realtime session, a page-priced OCR call, a page of
 * lecture audio, whose price the voice job records itself).
 */
export function costOf(input: {
  task: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Of `tokensIn`, those served from the provider's cache. */
  tokensCached?: number | null;
}): number | null {
  const id = input.model.includes(':')
    ? input.model.slice(input.model.indexOf(':') + 1)
    : input.model;
  if (id.endsWith('-tts')) {
    return input.tokensIn === null
      ? null
      : round(input.tokensIn * SPEECH_PER_CHAR);
  }
  const price = PER_MILLION[id];
  if (!price) return null;
  const tokensIn = input.tokensIn ?? 0;
  const tokensOut = input.tokensOut ?? 0;
  if (!tokensIn && !tokensOut) return null;
  const cached =
    price.cached === undefined
      ? 0
      : Math.min(tokensIn, Math.max(0, input.tokensCached ?? 0));
  return round(
    ((tokensIn - cached) * price.in +
      cached * (price.cached ?? price.in) +
      tokensOut * price.out) /
      1_000_000,
  );
}

/**
 * What one page costs at each text step, from a week of the log: cents.
 * Audio is priced apart, by the minutes a page speaks.
 */
export const PER_PAGE = {
  ocr: 0.001,
  summaryTopicsEmbed: 0.0005,
  simplify: 0.0005,
  /** Plans, scripts and their check, per style. */
  lectureText: 0.003,
} as const;

/**
 * How long a page's narration runs, per style, on average: a book page's
 * worth of lecture. Priced at the rented voice's hourly rate, measured by
 * the bench in modal/kokoro_service.py (MODAL_USD_PER_AUDIO_HOUR).
 */
export const AUDIO_MINUTES_PER_PAGE = 1.33;

export interface PrepareEstimate {
  documents: number;
  pages: number;
  textUsd: number;
  audioUsd: number;
  totalUsd: number;
}

/**
 * The estimate for preparing documents: the text steps still to run, and
 * audio for the styles asked for. A school's scripts are written at
 * upload, so a style whose words are already there is priced for its
 * audio alone.
 */
export function estimatePrepare(input: {
  documents: {
    pages: number;
    needsPipeline: boolean;
    /** Styles voiced in full: nothing left to charge. */
    styles: LectureStyle[];
    /** Styles whose words are all written: audio only. Omitted means none. */
    scripted?: LectureStyle[];
  }[];
  styles: LectureStyle[];
  /** What an hour of the rented voice's audio costs; zero when unmeasured. */
  usdPerAudioHour: number;
}): PrepareEstimate {
  let pages = 0;
  let text = 0;
  let audioPages = 0;
  for (const doc of input.documents) {
    pages += doc.pages;
    if (doc.needsPipeline) {
      text +=
        doc.pages *
        (PER_PAGE.ocr + PER_PAGE.summaryTopicsEmbed + PER_PAGE.simplify);
    }
    for (const style of input.styles) {
      if (doc.styles.includes(style)) continue;
      if (!(doc.scripted ?? []).includes(style)) {
        text += doc.pages * PER_PAGE.lectureText;
      }
      audioPages += doc.pages;
    }
  }
  const textUsd = round(text);
  const audioUsd = round(
    (audioPages * AUDIO_MINUTES_PER_PAGE * Math.max(0, input.usdPerAudioHour)) /
      60,
  );
  return {
    documents: input.documents.length,
    pages,
    textUsd,
    audioUsd,
    totalUsd: round(textUsd + audioUsd),
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** What a minute of live conversation costs on each line, in dollars. */
export interface TalkRates {
  livekit: number;
  openai: number;
  elevenlabs: number;
}

/**
 * The cost of a live voice session, from the seconds the browser reports
 * at hang-up and the line it ran on: our own line at the bench's rate, a
 * provider's at its per-minute rate. Null when the line is unknown.
 */
export function voiceSessionCost(
  provider: string,
  seconds: number,
  rates: TalkRates,
): number | null {
  const rate =
    provider === 'livekit'
      ? rates.livekit
      : provider === 'openai'
        ? rates.openai
        : provider === 'elevenlabs'
          ? rates.elevenlabs
          : undefined;
  if (rate === undefined || !(seconds > 0)) return null;
  return Math.round((seconds / 60) * rate * 1e6) / 1e6;
}
