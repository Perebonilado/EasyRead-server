/**
 * How fast a lesson is said, and how long it waits between sentences:
 * a target in words a minute for each sentence, and each silence shaped
 * from its reasons, within a budget for the whole scene
 * (studio-explainer-plan, Ask 1).
 *
 * "Too slow" had several causes that stacked up: a voice that reads
 * "calm and unhurried" slowly, and pauses that were added together
 * (a sentence's own, an idea changing, a key point coming, a term landing),
 * each multiplied again for a child. Here every sentence has one target
 * rate, from whom it is for and what it says; every pause is the largest
 * of its reasons, not their sum; and all the silence together stays
 * within a share of the scene. After voicing, the rate each sentence was
 * really said at is measured and put right by a small time-stretch
 * (scene-pace-audio), so the voice never has to be asked again.
 *
 * Pure: the numbers are here, where they can be tuned and tested.
 */
import type { LearningStage } from './scene-stage';
import type { SceneDelivery } from './scene-script';

// ── Who it is for ───────────────────────────────────────────────────────

/**
 * Whom a lesson is for, finer than a learning stage: the audience
 * profile's band (studio-explainer-plan, Ask 8). Shared with the audience
 * work, which sets it from the maker's words; until then it is read from
 * the stage or the Studio's four audiences.
 */
export const AUDIENCE_BANDS = [
  'early-years',
  'primary-lower',
  'primary-upper',
  'secondary-lower',
  'secondary-upper',
  'university',
  'professional',
  'general-adult',
] as const;
export type AudienceBand = (typeof AUDIENCE_BANDS)[number];

export const isAudienceBand = (value: unknown): value is AudienceBand =>
  AUDIENCE_BANDS.includes(value as AudienceBand);

/** What the viewer already knows of it. */
export type PriorKnowledge = 'new' | 'some' | 'revising';
/** The maker's own pace for the voice: the brief's Pace chips. */
export type MakerPace = 'relaxed' | 'natural' | 'brisk';

/** Everything the voice's pace follows from. */
export interface PaceBrief {
  band: AudienceBand;
  /**
   * The audience's own narration rate, what the viewer knows and their
   * English already in it (the audience profile's recipe); in place of
   * BASE_WPM, `prior` and `language` when given.
   */
  baseWpm?: number;
  prior?: PriorKnowledge;
  maker?: MakerPace;
  /** A viewer learning the film's language is spoken to more slowly. */
  language?: 'fluent' | 'learning';
  /** The maker's "a bit faster" / "a bit slower" in the chat, as a multiplier. */
  nudge?: number;
}

/**
 * Narration words a minute by band: about 100–125 is best for reading
 * aloud to young children, 110–130 for beginners, 130–160 for adults'
 * educational narration (studio-explainer-plan, research digest).
 */
export const BASE_WPM: Record<AudienceBand, number> = {
  'early-years': 110,
  'primary-lower': 120,
  'primary-upper': 132,
  'secondary-lower': 142,
  'secondary-upper': 150,
  university: 155,
  professional: 160,
  'general-adult': 155,
};

export const PRIOR_RATE: Record<PriorKnowledge, number> = {
  new: 0.95,
  some: 1,
  revising: 1.08,
};

export const MAKER_RATE: Record<MakerPace, number> = {
  relaxed: 0.93,
  natural: 1,
  brisk: 1.08,
};

/** A viewer learning the language: a tenth slower. */
export const LEARNING_RATE = 0.9;

/**
 * How each sentence goes against the scene's rate: a little quicker into
 * a hook, an aside or a recap of what is known; slower on the key point.
 */
export const DELIVERY_RATE: Record<SceneDelivery, number> = {
  hook: 1.04,
  explain: 1,
  key: 0.94,
  aside: 1.08,
  question: 1,
  recap: 1.07,
};

/** The most a nudge from the chat may move the voice, either way. */
export const NUDGE_RANGE = [0.88, 1.14] as const;

/** The most words a sentence has for its band before it counts as long. */
export const SENTENCE_CAP: Record<AudienceBand, number> = {
  'early-years': 10,
  'primary-lower': 12,
  'primary-upper': 13,
  'secondary-lower': 16,
  'secondary-upper': 18,
  university: 20,
  professional: 20,
  'general-adult': 20,
};

/** Bands spoken to as children: longer questions, a bigger silence budget. */
const CHILD_BANDS: ReadonlySet<AudienceBand> = new Set([
  'early-years',
  'primary-lower',
  'primary-upper',
]);

const TEEN_BANDS: ReadonlySet<AudienceBand> = new Set([
  'secondary-lower',
  'secondary-upper',
]);

/** A book's learning stage as a band, until the audience profile says. */
export function bandOfStage(stage: LearningStage | null): AudienceBand {
  switch (stage) {
    case 'early':
      return 'primary-upper';
    case 'middle':
      return 'secondary-lower';
    case 'higher':
      return 'university';
    case 'professional':
      return 'professional';
    default:
      return 'general-adult';
  }
}

const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n));

const words = (text: string) => text.split(/\s+/).filter(Boolean);

// ── The target rate ─────────────────────────────────────────────────────

/** Density never slows a sentence below this share of its rate. */
export const DENSITY_FLOOR = 0.85;

/** A number with its unit, a percentage, a fraction or a formula: said slower. */
const NUMBER_OR_FORMULA =
  /\d[\d.,]*\s*(?:%|°|(?:percent|degrees?|[kcmµn]?m|[km]?g|mg|[m]?s|seconds?|minutes?|hours?|h|min|[mk]?l|litres?|liters?|metres?|meters?|kilo\w+|[km]?w|watts?|v|volts?|hz|n|newtons?|j|joules?|pa|mol|moles?|k|kelvin|mph|kph)\b)|\d\s*\/\s*\d|[=×÷^≈≤≥]|\b\d[\d.,]*\s+(?:per|over|times|squared|cubed)\b/iu;

/**
 * How much slower a sentence goes for what it holds: 6 % for each new
 * term it says first, 5 % for a number with a unit or a formula, 4 % for a
 * sentence longer than its band's cap; never below DENSITY_FLOOR.
 */
export function densityOf(
  sentence: string,
  input: { terms?: readonly string[]; band: AudienceBand },
): number {
  let rate = 1 - 0.06 * (input.terms?.length ?? 0);
  if (NUMBER_OR_FORMULA.test(sentence)) rate -= 0.05;
  if (words(sentence).length > SENTENCE_CAP[input.band]) rate -= 0.04;
  return Math.max(DENSITY_FLOOR, rate);
}

/**
 * Whom it is for, in words a minute: the audience recipe's rate where
 * there is one, else the band's, slower for a viewer new to it or
 * learning the language, quicker when revising.
 */
export function audienceWpm(brief: PaceBrief): number {
  if (brief.baseWpm && brief.baseWpm > 0) return brief.baseWpm;
  return (
    BASE_WPM[brief.band] *
    PRIOR_RATE[brief.prior ?? 'some'] *
    (brief.language === 'learning' ? LEARNING_RATE : 1)
  );
}

/**
 * The maker's own share of the pace (their Pace chip and any nudge from
 * the chat): what a made scene's voice was paced at, kept on the scene so
 * a later change is a stretch of the difference, never a voice again.
 */
export function makerRate(brief: Pick<PaceBrief, 'maker' | 'nudge'>): number {
  return (
    Math.round(
      MAKER_RATE[brief.maker ?? 'natural'] *
        clamp(brief.nudge ?? 1, NUDGE_RANGE[0], NUDGE_RANGE[1]) *
        1000,
    ) / 1000
  );
}

/**
 * A sentence's target in words a minute: its band's rate, what the viewer
 * knows, what it holds, how it is said and the maker's pace.
 */
export function targetWpm(
  sentence: { say: string; delivery: SceneDelivery },
  brief: PaceBrief,
  /** The new terms this sentence says first. */
  terms: readonly string[] = [],
): number {
  return Math.round(
    audienceWpm(brief) *
      makerRate(brief) *
      densityOf(sentence.say, { terms, band: brief.band }) *
      (DELIVERY_RATE[sentence.delivery] ?? 1),
  );
}

/**
 * How fast the picture moves for whom it is for (studio-explainer-plan,
 * Ask 3): a young child's camera and entrances at three quarters of an
 * adult's, and the maker's pace leaning it a little. 1 is an adult's.
 */
export const MOTION_BASE: Record<AudienceBand, number> = {
  'early-years': 0.75,
  'primary-lower': 0.78,
  'primary-upper': 0.8,
  'secondary-lower': 0.9,
  'secondary-upper': 0.95,
  university: 1,
  professional: 1,
  'general-adult': 1,
};

export function motionFactor(
  band: AudienceBand,
  maker: MakerPace = 'natural',
): number {
  return (
    Math.round(clamp(MOTION_BASE[band] * MAKER_RATE[maker], 0.7, 1.1) * 100) /
    100
  );
}

// ── Pauses ──────────────────────────────────────────────────────────────

/**
 * Why there is a silence after a sentence: its own end, the idea
 * changing, a key point just said or coming next, a new term landing, a
 * question to think about, or something happening without words.
 */
export type PauseReason =
  'end' | 'idea' | 'key' | 'before-key' | 'term' | 'question' | 'hold';

export interface PauseProposal {
  reason: PauseReason;
  seconds: number;
}

/** Pauses a little longer for the young, before the limits hold them. */
export const BAND_PAUSE: Record<AudienceBand, number> = {
  'early-years': 1.35,
  'primary-lower': 1.3,
  'primary-upper': 1.2,
  'secondary-lower': 1.1,
  'secondary-upper': 1.05,
  university: 1,
  professional: 1,
  'general-adult': 1,
};

/** The least and most each reason's pause may be, by band. */
export function pauseLimits(
  band: AudienceBand,
): Record<Exclude<PauseReason, 'hold'>, [number, number]> {
  return {
    end: [0.25, 0.45],
    idea: [0.5, 0.9],
    key: [0.5, 0.9],
    'before-key': [0.45, 0.8],
    term: [0.5, 0.9],
    question: CHILD_BANDS.has(band)
      ? [1.2, 2.5]
      : TEEN_BANDS.has(band)
        ? [1, 1.8]
        : [0.8, 1.2],
  };
}

/** Added when two or more reasons for a pause agree. */
export const AGREE_S = 0.15;

/**
 * The share of a scene that may be silence, holds for action left out:
 * 22 % for adults, up to 30 % for young children.
 */
export const SILENCE_BUDGET: Record<AudienceBand, number> = {
  'early-years': 0.3,
  'primary-lower': 0.3,
  'primary-upper': 0.27,
  'secondary-lower': 0.25,
  'secondary-upper': 0.23,
  university: 0.22,
  professional: 0.22,
  'general-adult': 0.22,
};

/** One sentence's silence after it, and how far it may give way to the budget. */
export interface ShapedPause {
  seconds: number;
  /** The least it may be shaved to. */
  floor: number;
  /** A plain sentence end: shaved first. */
  ordinary: boolean;
  /** Something happens in it without words: never shaved, never counted. */
  held: boolean;
}

/**
 * One pause from its reasons: each held to its band's limits, the largest
 * taken (never the sum), a little more where two or more reasons agree.
 * A hold is what it is.
 */
export function shapePause(
  proposals: readonly PauseProposal[],
  band: AudienceBand,
): ShapedPause {
  const limits = pauseLimits(band);
  let seconds = 0;
  let floor = 0;
  let hold = 0;
  const reasons = new Set<PauseReason>();
  for (const { reason, seconds: asked } of proposals) {
    if (reason === 'hold') {
      hold = Math.max(hold, asked);
      continue;
    }
    reasons.add(reason);
    const [low, high] = limits[reason];
    const one = clamp(asked * BAND_PAUSE[band], low, high);
    if (one > seconds) {
      seconds = one;
      floor = low;
    }
  }
  const beyondEnd = [...reasons].filter((r) => r !== 'end').length;
  if (beyondEnd >= 2) seconds += AGREE_S;
  const round = (n: number) => Math.round(n * 100) / 100;
  if (hold > seconds)
    return {
      seconds: round(hold),
      floor: round(hold),
      ordinary: false,
      held: true,
    };
  return {
    seconds: round(seconds),
    floor: round(Math.min(floor, seconds)),
    ordinary: beyondEnd === 0,
    held: false,
  };
}

/**
 * The pauses kept within the band's silence budget against the time the
 * scene spends speaking: what is over is shaved in proportion, from plain
 * sentence ends first, then from the rest, never below each one's floor.
 * The last pause (where the scene's last moments play) and holds are left
 * as they are and not counted.
 */
export function withinBudget(
  pauses: readonly ShapedPause[],
  speechS: number,
  band: AudienceBand,
): number[] {
  const out = pauses.map((p) => p.seconds);
  const counted = pauses
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => !p.held && i < pauses.length - 1);
  const share = SILENCE_BUDGET[band];
  const allowed = (share / (1 - share)) * Math.max(0, speechS);
  let over = counted.reduce((n, { i }) => n + out[i], 0) - allowed;
  for (const pass of [true, false]) {
    if (over <= 0.001) break;
    const group = counted.filter(({ p }) => p.ordinary === pass);
    const room = group.reduce((n, { p, i }) => n + (out[i] - p.floor), 0);
    if (room <= 0) continue;
    const take = Math.min(1, over / room);
    for (const { p, i } of group) {
      const cut = (out[i] - p.floor) * take;
      out[i] -= cut;
      over -= cut;
    }
  }
  return out.map((s) => Math.round(s * 100) / 100);
}

/** Seconds a sentence takes at its rate. */
export const speechSeconds = (say: string, wpm: number) =>
  (words(say).length / Math.max(1, wpm)) * 60;

// ── A lesson's sentences as the voice is sent them ──────────────────────

/** Where the idea changes, this much more than a sentence's own silence. */
export const IDEA_CHANGE_S = 0.4;
/** A beat before a key point: the least silence before it. */
export const BEFORE_KEY_S = 0.55;
/** A new term said for the first time: a moment after it to sink in. */
export const TERM_LANDS_S = 0.7;

/** Each delivery's own silence after it, and the reason it is. */
const DELIVERY_PAUSE: Record<
  SceneDelivery,
  { reason: PauseReason; seconds: number }
> = {
  hook: { reason: 'end', seconds: 0.45 },
  explain: { reason: 'end', seconds: 0.35 },
  key: { reason: 'key', seconds: 0.7 },
  aside: { reason: 'end', seconds: 0.3 },
  question: { reason: 'question', seconds: 0.75 },
  recap: { reason: 'end', seconds: 0.5 },
};

/** Each lesson sentence's reasons for the silence after it. */
export function pauseProposals(
  beats: readonly {
    delivery: SceneDelivery;
    pause: 'short' | 'long';
    holdS?: number | null;
  }[],
  /** The sentences that say a new term first. */
  landing: ReadonlySet<number> = new Set(),
): PauseProposal[][] {
  return beats.map((beat, i) => {
    const own = DELIVERY_PAUSE[beat.delivery] ?? DELIVERY_PAUSE.explain;
    const out: PauseProposal[] = [own];
    if (beat.pause === 'long')
      out.push({ reason: 'idea', seconds: own.seconds + IDEA_CHANGE_S });
    if (beats[i + 1]?.delivery === 'key')
      out.push({ reason: 'before-key', seconds: BEFORE_KEY_S });
    if (landing.has(i)) out.push({ reason: 'term', seconds: TERM_LANDS_S });
    if (beat.holdS) out.push({ reason: 'hold', seconds: beat.holdS });
    return out;
  });
}

/**
 * Kokoro and Cartesia take a speed: none sent outside this. Kokoro's
 * voices speak at 190–225 words a minute at speed 1 (voice:calibrate,
 * 2026-09-30), so a child's 110 asks for about 0.55; below 0.6 its voice
 * drawls, and the stretch takes the rest.
 */
export const SPEED_LIMITS = [0.6, 1.4] as const;

/** One lesson sentence as the voice is sent it. */
export interface PacedPiece {
  speed: number;
  pauseAfter: number;
  targetWpm: number;
}

/**
 * A lesson's sentences with their target rates, the speed that asks a
 * voice for it (the target over the voice's own measured rate), and each
 * silence shaped and within budget.
 */
export function lessonPace(
  beats: readonly {
    say: string;
    delivery: SceneDelivery;
    pause: 'short' | 'long';
    holdS?: number | null;
  }[],
  brief: PaceBrief,
  input: {
    /** The terms each sentence says first. */
    terms?: ReadonlyMap<number, readonly string[]>;
    /** The voice's own words a minute at speed 1 (voice:calibrate). */
    naturalWpm: number;
    /** The longest a silence may be: a hold's limit. */
    holdLimitS?: number;
  },
): PacedPiece[] {
  const terms = input.terms ?? new Map<number, readonly string[]>();
  const targets = beats.map((beat, i) =>
    targetWpm(beat, brief, terms.get(i) ?? []),
  );
  const shaped = pauseProposals(beats, new Set(terms.keys())).map((p) =>
    shapePause(p, brief.band),
  );
  const speech = beats.reduce(
    (n, beat, i) => n + speechSeconds(beat.say, targets[i]),
    0,
  );
  const pauses = withinBudget(shaped, speech, brief.band);
  return beats.map((_, i) => ({
    targetWpm: targets[i],
    speed:
      Math.round(
        clamp(
          targets[i] / Math.max(60, input.naturalWpm),
          SPEED_LIMITS[0],
          SPEED_LIMITS[1],
        ) * 100,
      ) / 100,
    pauseAfter: Math.min(input.holdLimitS ?? 20, pauses[i]),
  }));
}

// ── Measured, and put right ─────────────────────────────────────────────

/** Within this of its target, a sentence is left as it was said. */
export const LEAVE_WITHIN = 0.06;
/** The most a sentence is slowed or quickened by the stretch: formants hold up to here. */
export const TEMPO_RANGE = [0.88, 1.14] as const;

/** A sentence's measured rate: its words over the time from its first word to its last. Null when too short to tell. */
export function sentenceWpm(
  beat: { text: string; startMs: number; endMs: number },
  /** Silence taken out of it, in ms. */
  lessMs = 0,
): number | null {
  const count = words(beat.text).length;
  const ms = beat.endMs - beat.startMs - lessMs;
  if (count < 3 || ms < 500) return null;
  return Math.round(count / (ms / 60_000));
}

/**
 * How much faster (above 1) or slower a sentence is played to meet its
 * target: 1 within LEAVE_WITHIN of it; else the ratio, held to TEMPO_RANGE,
 * and `beyond` when the ratio was further than the range goes.
 */
export function tempoFor(
  measuredWpm: number | null,
  target: number,
): { tempo: number; beyond: boolean } {
  if (!measuredWpm || !target) return { tempo: 1, beyond: false };
  const ratio = target / measuredWpm;
  if (Math.abs(ratio - 1) <= LEAVE_WITHIN) return { tempo: 1, beyond: false };
  const tempo = clamp(ratio, TEMPO_RANGE[0], TEMPO_RANGE[1]);
  return {
    tempo: Math.round(tempo * 1000) / 1000,
    beyond: ratio < TEMPO_RANGE[0] || ratio > TEMPO_RANGE[1],
  };
}

/** How a scene's voice came out: for the log, the bench, and a maker's ask. */
export interface PaceReport {
  /** Words over the time spent saying them, pauses left out. */
  wpm: number;
  /** Each sentence's words a minute; null where too short to tell. */
  sentences: (number | null)[];
  /** The share of the spoken stretch (first word to last) that is silence. */
  silenceShare: number;
  /** The longest silence inside the spoken stretch, in ms. */
  longestPauseMs: number;
}

/** A silence inside a sentence at least this long counts as silence. */
const COUNTED_GAP_MS = 250;

/** How a timed scene's voice came out. */
export function paceReport(
  beats: readonly {
    text: string;
    startMs: number;
    endMs: number;
    words: number[][];
  }[],
): PaceReport {
  const spoken = beats.filter((b) => b.endMs > b.startMs);
  if (!spoken.length)
    return { wpm: 0, sentences: [], silenceShare: 0, longestPauseMs: 0 };
  const first = spoken[0].startMs;
  const last = spoken[spoken.length - 1].endMs;
  let silent = 0;
  let longest = 0;
  const gap = (ms: number) => {
    if (ms < COUNTED_GAP_MS) return;
    silent += ms;
    longest = Math.max(longest, ms);
  };
  spoken.forEach((beat, i) => {
    for (let w = 1; w < beat.words.length; w += 1)
      gap(beat.words[w][2] - beat.words[w - 1][3]);
    if (i > 0) gap(beat.startMs - spoken[i - 1].endMs);
  });
  const talk = spoken.reduce((n, b) => n + (b.endMs - b.startMs), 0);
  const count = spoken.reduce((n, b) => n + words(b.text).length, 0);
  return {
    wpm: talk > 0 ? Math.round(count / (talk / 60_000)) : 0,
    sentences: beats.map((b) => sentenceWpm(b)),
    silenceShare:
      last > first ? Math.round((silent / (last - first)) * 1000) / 1000 : 0,
    longestPauseMs: Math.round(longest),
  };
}

// ── A voice's own rate ──────────────────────────────────────────────────

/**
 * Gemini takes no number for its pace, only words: three it is asked in,
 * each measured once per voice (voice:calibrate), so the one nearest a
 * scene's target is chosen by its rate, not by feel.
 */
export const PACE_WORDS = ['brisk and clear', 'natural', 'unhurried'] as const;
export type PaceWord = (typeof PACE_WORDS)[number];

/** One voice's measured rates: at speed 1, and in each pace word. */
export interface VoiceRate {
  wpm: number;
  words?: Partial<Record<PaceWord, number>>;
  /** When it was measured, ISO. */
  at?: string;
}

/** Each engine's voices' measured rates, by voice name: `app_settings.voice_rates`. */
export type VoiceRates = Partial<Record<string, Record<string, VoiceRate>>>;

/**
 * What a voice is taken to say at speed 1 before it is measured, by
 * engine, in words a minute of speech (pauses left out, as paceReport
 * measures). Kokoro measured with the calibration passage on 2026-09-30:
 * am_puck 226, af_heart 206, am_michael 189; the rest from the logs of
 * past pages until measured.
 */
export const DEFAULT_RATES: Record<string, VoiceRate> = {
  kokoro: { wpm: 210 },
  gemini: {
    wpm: 150,
    words: { 'brisk and clear': 166, natural: 152, unhurried: 134 },
  },
  openai: { wpm: 160 },
  elevenlabs: { wpm: 158 },
  cartesia: { wpm: 165 },
};

/** A voice's rate: as measured for it, else its engine's own guess. */
export function voiceRate(
  rates: VoiceRates | null | undefined,
  engine: string,
  voice: string,
): VoiceRate {
  const measured =
    rates?.[engine]?.[voice.toLowerCase()] ?? rates?.[engine]?.[voice];
  const base = DEFAULT_RATES[engine] ?? { wpm: 155 };
  return measured?.wpm
    ? { ...base, ...measured, words: { ...base.words, ...measured.words } }
    : base;
}

/** What each pace word is taken to do to a voice not measured in words: about a tenth either way. */
const WORD_SHARE: Record<PaceWord, number> = {
  'brisk and clear': 1.08,
  natural: 1,
  unhurried: 0.9,
};

/** The pace word whose measured rate is nearest the target: Gemini's only pace control. */
export function paceWordFor(rate: VoiceRate, target: number): PaceWord {
  let best: PaceWord = 'natural';
  let nearest = Infinity;
  for (const word of PACE_WORDS) {
    const wpm = rate.words?.[word] ?? rate.wpm * WORD_SHARE[word];
    if (!wpm) continue;
    const off = Math.abs(Math.log(wpm / target));
    if (off < nearest) {
      nearest = off;
      best = word;
    }
  }
  return best;
}

/** Rates as kept, made sound: only positive numbers are read back. */
export function voiceRatesOf(raw: unknown): VoiceRates {
  if (!raw || typeof raw !== 'object') return {};
  const out: VoiceRates = {};
  for (const [engine, voices] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!voices || typeof voices !== 'object') continue;
    const kept: Record<string, VoiceRate> = {};
    for (const [voice, rate] of Object.entries(
      voices as Record<string, unknown>,
    )) {
      const one = rate as { wpm?: unknown; words?: unknown; at?: unknown };
      const wpm = Number(one?.wpm);
      if (!Number.isFinite(wpm) || wpm < 60 || wpm > 400) continue;
      const wordsKept: Partial<Record<PaceWord, number>> = {};
      for (const word of PACE_WORDS) {
        const n = Number(
          (one.words as Record<string, unknown> | undefined)?.[word],
        );
        if (Number.isFinite(n) && n >= 60 && n <= 400)
          wordsKept[word] = Math.round(n);
      }
      kept[voice] = {
        wpm: Math.round(wpm),
        ...(Object.keys(wordsKept).length ? { words: wordsKept } : {}),
        ...(typeof one.at === 'string' ? { at: one.at } : {}),
      };
    }
    if (Object.keys(kept).length) out[engine] = kept;
  }
  return out;
}
