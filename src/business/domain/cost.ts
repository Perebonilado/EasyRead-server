/**
 * What a model call costs, and what preparing a document will cost before
 * the button is pressed. List prices, in US dollars, kept in one place so the
 * ledger and the estimate cannot disagree.
 */
import type {
  LectureStyle,
  Level,
  ProcessingChannel,
  ProcessingChannels,
} from '../../contracts';

/** Dollars per million tokens, in and out, by model id as the registry names it. */
const PER_MILLION: Record<string, { in: number; out: number }> = {
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
};

/**
 * Speech is logged by characters spoken, not tokens. At the rate the voices
 * speak, about fifteen characters a second, the list price of a minute of
 * audio comes to this per character.
 */
const SPEECH_PER_CHAR = 0.015 / (15 * 60);

/**
 * A school's document is voiced on a rented GPU that bills by the second
 * it runs, not by the text. The engine does not say how many seconds a
 * page took, so a page is priced by the audio it made at a rate measured
 * by the bench on the card in use (MODAL_USD_PER_AUDIO_HOUR). An average,
 * not a metered figure; it is set again whenever the card or model changes.
 */
export function catalogueSpeechCost(
  audioMs: number,
  usdPerAudioHour: number,
): number {
  if (!(audioMs > 0) || !(usdPerAudioHour >= 0)) return 0;
  return Math.round((audioMs / 3_600_000) * usdPerAudioHour * 1e6) / 1e6;
}

/**
 * The cost of one logged call, or null when the log does not carry what is
 * needed to price it (a realtime session, a page-priced OCR call).
 */
export function costOf(
  input: {
    task: string;
    model: string;
    tokensIn: number | null;
    tokensOut: number | null;
  },
  rates: { modalUsdPerMillionTokens?: number } = {},
): number | null {
  const id = input.model.includes(':')
    ? input.model.slice(input.model.indexOf(':') + 1)
    : input.model;
  if (id.endsWith('-tts')) {
    return input.tokensIn === null
      ? null
      : round(input.tokensIn * SPEECH_PER_CHAR);
  }
  // Our own model on the rented card is priced by the bench's measured
  // average per million tokens, in and out alike; unmeasured is unknown.
  if (input.model.startsWith('modal:')) {
    const rate = rates.modalUsdPerMillionTokens ?? 0;
    const tokens = (input.tokensIn ?? 0) + (input.tokensOut ?? 0);
    if (!(rate > 0) || !tokens) return null;
    return round((tokens * rate) / 1_000_000);
  }
  const price = PER_MILLION[id];
  if (!price) return null;
  const tokensIn = input.tokensIn ?? 0;
  const tokensOut = input.tokensOut ?? 0;
  if (!tokensIn && !tokensOut) return null;
  return round((tokensIn * price.in + tokensOut * price.out) / 1_000_000);
}

/**
 * What one page costs at each step, from a week of the log: text steps are
 * cents, audio is the bill. Audio per page per style is a book page's
 * worth of narration; a slide gets less once the slide budget is in.
 */
export const PER_PAGE = {
  ocr: 0.001,
  summaryTopicsEmbed: 0.0005,
  simplifyStandard: 0.0005,
  simplifyEasiest: 0.0007,
  /** Plans, scripts and their check, per style. */
  lectureText: 0.003,
  /** Narration, per style. */
  audio: 0.02,
} as const;

export interface PrepareEstimate {
  documents: number;
  pages: number;
  textUsd: number;
  audioUsd: number;
  totalUsd: number;
  channels: ProcessingChannels;
  byChannel: {
    text: Record<ProcessingChannel, number>;
    audio: Record<ProcessingChannel, number>;
  };
}

/** What the rented cards cost, as the benches measured them; zero when unmeasured. */
export interface ChannelRates {
  modalUsdPerMillionTokens: number;
  modalUsdPerAudioHour: number;
}

/** gpt-4o-mini, in and out averaged: what PER_PAGE's text prices were measured on. */
const OPENAI_TEXT_PER_MILLION =
  (PER_MILLION['gpt-4o-mini'].in + PER_MILLION['gpt-4o-mini'].out) / 2;
/** The list price of a minute of OpenAI speech, so a page's audio can be told in minutes. */
const OPENAI_USD_PER_AUDIO_MINUTE = 0.015;

/**
 * What one page's text and audio cost on each channel. OpenAI is the
 * measured PER_PAGE; Modal scales it by the bench's rate against OpenAI's,
 * and an unmeasured rate is priced as OpenAI's rather than as free.
 */
export function perPageByChannel(rates: ChannelRates): {
  text: Record<ProcessingChannel, number>;
  audio: Record<ProcessingChannel, number>;
} {
  const textFactor =
    rates.modalUsdPerMillionTokens > 0
      ? rates.modalUsdPerMillionTokens / OPENAI_TEXT_PER_MILLION
      : 1;
  const minutesPerPage = PER_PAGE.audio / OPENAI_USD_PER_AUDIO_MINUTE;
  const modalAudio =
    rates.modalUsdPerAudioHour > 0
      ? (minutesPerPage / 60) * rates.modalUsdPerAudioHour
      : PER_PAGE.audio;
  return {
    text: { openai: 1, modal: textFactor },
    audio: { openai: PER_PAGE.audio, modal: modalAudio },
  };
}

/**
 * The estimate for preparing documents: the text steps still to run, the
 * levels asked for, and audio for the styles asked for. A school's
 * scripts are written at upload, so a style whose words are already there
 * is priced for its audio alone.
 */
export function estimatePrepare(input: {
  documents: {
    pages: number;
    needsPipeline: boolean;
    hasEasiest: boolean;
    /** Styles voiced in full: nothing left to charge. */
    styles: LectureStyle[];
    /** Styles whose words are all written: audio only. Omitted means none. */
    scripted?: LectureStyle[];
  }[];
  easiest: boolean;
  styles: LectureStyle[];
  /** The channels to price on; OpenAI for both when not given. */
  channels?: ProcessingChannels;
  rates?: ChannelRates;
}): PrepareEstimate {
  const channels = input.channels ?? { text: 'openai', audio: 'openai' };
  const per = perPageByChannel(
    input.rates ?? { modalUsdPerMillionTokens: 0, modalUsdPerAudioHour: 0 },
  );
  let pages = 0;
  // Text in OpenAI dollars, scaled per channel at the end; audio in pages.
  let text = 0;
  let audioPages = 0;
  for (const doc of input.documents) {
    pages += doc.pages;
    if (doc.needsPipeline) {
      // Reading the page stays on Mistral whatever the channel; the rest
      // of the pipeline's text follows it.
      text +=
        doc.pages *
        (PER_PAGE.ocr +
          PER_PAGE.summaryTopicsEmbed +
          PER_PAGE.simplifyStandard);
    }
    if (input.easiest && !doc.hasEasiest) {
      text += doc.pages * PER_PAGE.simplifyEasiest;
    }
    for (const style of input.styles) {
      if (doc.styles.includes(style)) continue;
      if (!(doc.scripted ?? []).includes(style)) {
        text += doc.pages * PER_PAGE.lectureText;
      }
      audioPages += doc.pages;
    }
  }
  const byChannel = {
    text: {
      openai: round(text * per.text.openai),
      modal: round(text * per.text.modal),
    },
    audio: {
      openai: round(audioPages * per.audio.openai),
      modal: round(audioPages * per.audio.modal),
    },
  };
  const textUsd = byChannel.text[channels.text];
  const audioUsd = byChannel.audio[channels.audio];
  return {
    documents: input.documents.length,
    pages,
    textUsd,
    audioUsd,
    totalUsd: round(textUsd + audioUsd),
    channels,
    byChannel,
  };
}

export const LEVELS: Level[] = ['standard', 'easiest'];

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
