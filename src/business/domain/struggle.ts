/**
 * The struggle-signal vocabulary and its interpretation.
 *
 * Signals are recorded by many producers (quizzes, chat, prerequisites,
 * dwell) and read in one place. The interpretation is deliberately
 * conservative — see `assessStruggle` — because misreading engagement as
 * confusion patronises exactly the readers who are doing well.
 */

export type StruggleKind =
  | 'quiz_wrong'
  | 'quiz_right'
  | 'chat_question'
  | 'highlight_explain'
  | 'prereq_requested'
  | 'reread'
  | 'long_dwell'
  | 'still_not_clear';

/**
 * How strongly each signal suggests comprehension effort.
 *
 * Explicit admissions rank highest; probabilistic behaviours in the middle;
 * things that might just be curiosity at the bottom. `quiz_right` is
 * negative on purpose — the stream must see recovery, or one bad afternoon
 * would haunt a reader forever.
 */
export const SIGNAL_WEIGHT: Record<StruggleKind, number> = {
  still_not_clear: 1.0,
  prereq_requested: 0.9,
  quiz_wrong: 0.8,
  long_dwell: 0.5,
  reread: 0.5,
  highlight_explain: 0.4,
  chat_question: 0.3,
  quiz_right: -0.6,
};

export interface StruggleSignalRecord {
  kind: StruggleKind;
  weight: number;
  topicId: string | null;
  pageNumber: number | null;
  createdAt: Date;
}

export interface StruggleAssessment {
  /** Weighted sum over the window, floored at zero. */
  score: number;
  /** Distinct positive-weight kinds that contributed. */
  positiveKinds: StruggleKind[];
  struggling: boolean;
  cruising: boolean;
}

/** Weighted evidence required before "struggling" — roughly three strong
 * signals, or five weak ones. */
export const STRUGGLE_THRESHOLD = 2.4;

/**
 * Reads a window of signals into a judgement.
 *
 * The corroboration rule is the heart of it: `struggling` requires at least
 * TWO DISTINCT positive-weight kinds. One noisy channel — however loud —
 * cannot move the dials alone, because a reader who asks a lot of questions
 * may simply be engaged, and a reader who lingers on pages may simply be
 * thorough. Only agreement between different kinds of evidence reads as
 * confusion.
 *
 * `cruising` is the mirror: recent correct answers and no positive signal at
 * all in the window.
 */
export function assessStruggle(
  signals: StruggleSignalRecord[],
): StruggleAssessment {
  let score = 0;
  const positive = new Set<StruggleKind>();
  let sawRight = false;

  for (const signal of signals) {
    score += signal.weight;
    if (signal.weight > 0) positive.add(signal.kind);
    if (signal.kind === 'quiz_right') sawRight = true;
  }

  score = Math.max(0, score);
  const positiveKinds = [...positive];

  return {
    score,
    positiveKinds,
    struggling: score >= STRUGGLE_THRESHOLD && positiveKinds.length >= 2,
    cruising: sawRight && positiveKinds.length === 0,
  };
}
