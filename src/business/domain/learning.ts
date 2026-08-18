import type { AssessmentEventRecord } from '../repositories/learning.repository';
import type {
  DocumentLearningStateRecord,
  LearnerProfileRecord,
} from '../repositories/learning.repository';

/**
 * Mastery: how well the student currently understands each topic, 0–100.
 *
 * Computed from raw events at read time — never stored — so the formula can
 * change without a backfill. Three deliberate properties:
 *
 *  - **Recency beats history.** Events decay geometrically (newest first), so
 *    last week's confusion stops haunting a topic the student has since
 *    nailed, and vice versa.
 *  - **Evidence quality is weighted.** A tapped MCQ answer outweighs a
 *    self-graded flashcard, which outweighs the tutor's own impression.
 *  - **Silence is not knowledge.** Fewer than two events means "not enough
 *    evidence" (null), not a score — an untested topic must never look
 *    mastered or failed.
 */

const KIND_WEIGHT: Record<AssessmentEventRecord['kind'], number> = {
  mcq: 1.0,
  flashcard: 0.7,
  verbal: 0.5,
};

/** Per-step geometric decay walking backwards through a topic's events. */
const DECAY = 0.85;

/** Below this a topic is flagged for another pass. */
export const WEAK_THRESHOLD = 60;

const MIN_EVENTS = 2;

export interface TopicMastery {
  topicId: string;
  /** 0–100, or null when there isn't enough evidence to say. */
  score: number | null;
  events: number;
  needsRevisit: boolean;
}

/**
 * Calibration: does this student's confidence track their competence?
 *
 * From events carrying a confidence rating (0..1 in `payload.confidence`,
 * captured before the outcome is revealed): `bias` = mean confidence − mean
 * score. Positive = overconfident, negative = underconfident, ~0 = well
 * calibrated. `n` rides along so consumers can ignore thin evidence — the
 * tutor acts on nothing under MIN_CALIBRATION_EVENTS.
 */
export const MIN_CALIBRATION_EVENTS = 5;

export interface Calibration {
  /** mean(confidence) − mean(score) over rated events; null when none. */
  bias: number | null;
  n: number;
}

export function computeCalibration(
  events: AssessmentEventRecord[],
): Calibration {
  const rated = events.filter(
    (event) =>
      typeof event.payload?.confidence === 'number' &&
      event.payload.confidence >= 0 &&
      event.payload.confidence <= 1,
  );
  if (!rated.length) return { bias: null, n: 0 };

  const meanConfidence =
    rated.reduce((sum, e) => sum + (e.payload!.confidence as number), 0) /
    rated.length;
  const meanScore = rated.reduce((sum, e) => sum + e.score, 0) / rated.length;
  return { bias: meanConfidence - meanScore, n: rated.length };
}

export function computeMastery(
  events: AssessmentEventRecord[],
  topicIds: string[],
): TopicMastery[] {
  // Newest first, whatever order storage returned.
  const sorted = [...events].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return topicIds.map((topicId) => {
    const own = sorted.filter((event) => event.topicId === topicId);
    if (own.length < MIN_EVENTS) {
      return { topicId, score: null, events: own.length, needsRevisit: false };
    }

    let weighted = 0;
    let total = 0;
    own.forEach((event, index) => {
      const weight = KIND_WEIGHT[event.kind] * DECAY ** index;
      weighted += event.score * weight;
      total += weight;
    });

    const score = Math.round((weighted / total) * 100);
    return {
      topicId,
      score,
      events: own.length,
      needsRevisit: score < WEAK_THRESHOLD,
    };
  });
}

/**
 * Which tutor to suggest for a revisit.
 *
 * Deliberately a rule table rather than a model call: a recommendation the
 * team can read and predict beats a clever one nobody can explain. Never
 * recommends the tutor the student already has.
 */
export function recommendTutor(
  profile: LearnerProfileRecord,
  weakTopics: number,
  currentTutorId: string,
): string | null {
  if (weakTopics === 0) return null;

  const pick = (() => {
    // Struggling and needing things broken down → the step-by-step tutor.
    if (profile.pace === 'slower' || profile.depth === 'deeper') return 'sam';
    // Engaged learners who drift → the Socratic quizmaster.
    if (profile.interactivity === 'more') return 'kai';
    // Notes that mention examples or stories working → the storyteller.
    if (/example|analog|story|anecdote/i.test(profile.styleNotes ?? '')) {
      return 'ade';
    }
    return 'sam';
  })();

  return pick === currentTutorId ? null : pick;
}

/**
 * A dial the reader set by hand is theirs. Automatic adaptation may not
 * touch it — an app that keeps overriding what you explicitly told it is
 * worse than one that never adapted.
 */
export function respectPins(
  patch: Partial<LearnerProfileRecord>,
  profile: LearnerProfileRecord,
): Partial<LearnerProfileRecord> | null {
  const out: Partial<LearnerProfileRecord> = { ...patch };
  if (profile.paceSource === 'manual') {
    delete out.pace;
    delete out.paceSource;
  }
  if (profile.depthSource === 'manual') {
    delete out.depth;
    delete out.depthSource;
  }
  if (profile.interactivitySource === 'manual') {
    delete out.interactivity;
    delete out.interactivitySource;
  }
  const changesDial = out.pace || out.depth || out.interactivity;
  return changesDial ? out : null;
}

/**
 * Two-speed adaptation: the global profile, adjusted for the document in hand.
 *
 * A reader who is slow in organic chemistry and quick in history is not two
 * readers. Rather than a second profile system, one document carries a
 * *delta* — "one notch slower than usual, here" — which this function
 * composes onto the global profile at every prompt site.
 *
 * A manual pin says "my general pace is X", not "never adapt anywhere", so
 * the delta still applies to pinned dials. What a pin protects is the stored
 * profile itself, which nothing here writes.
 */

const PACE_LADDER = ['slower', 'steady', 'faster'] as const;
const DEPTH_LADDER = ['deeper', 'standard', 'lighter'] as const;

/** One notch along a ladder, clamped at both ends. */
function shift<T extends readonly string[]>(
  ladder: T,
  current: T[number],
  direction: -1 | 0 | 1,
): T[number] {
  const index = ladder.indexOf(current);
  if (index < 0 || direction === 0) return current;
  const next = Math.min(ladder.length - 1, Math.max(0, index + direction));
  return ladder[next];
}

export function effectiveProfile(
  profile: LearnerProfileRecord,
  state: DocumentLearningStateRecord | null,
): LearnerProfileRecord {
  if (!state || (state.paceDelta === 'none' && state.depthDelta === 'none')) {
    return profile;
  }
  const paceDirection: -1 | 0 | 1 =
    state.paceDelta === 'slower' ? -1 : state.paceDelta === 'faster' ? 1 : 0;
  const depthDirection: -1 | 0 | 1 =
    state.depthDelta === 'deeper' ? -1 : state.depthDelta === 'lighter' ? 1 : 0;

  return {
    ...profile,
    pace: shift(PACE_LADDER, profile.pace, paceDirection),
    depth: shift(DEPTH_LADDER, profile.depth, depthDirection),
  };
}

/** How many documents must agree before a local pattern becomes global. */
export const PROMOTION_QUORUM = 2;

export interface Promotion {
  field: 'pace' | 'depth';
  value: string;
  /** The documents whose deltas should be cleared once promoted. */
  documentIds: string[];
  reason: string;
  /**
   * The global profile is already here — the deltas are redundant and should
   * be cleared, but nothing changed, so nothing is written or narrated.
   */
  alreadyGlobal: boolean;
}

/**
 * The slow loop: when the same delta holds in enough documents at once, it
 * stopped being about the subject and started being about the reader.
 *
 * Deliberately not a running tally — it reads the *current* deltas, so a
 * pattern the reader has since grown out of promotes nothing.
 */
export function findPromotions(
  profile: LearnerProfileRecord,
  states: DocumentLearningStateRecord[],
): Promotion[] {
  const promotions: Promotion[] = [];

  const consider = (field: 'pace' | 'depth') => {
    const groups = new Map<string, string[]>();
    for (const state of states) {
      const delta = field === 'pace' ? state.paceDelta : state.depthDelta;
      if (delta === 'none') continue;
      groups.set(delta, [...(groups.get(delta) ?? []), state.documentId]);
    }
    for (const [delta, documentIds] of groups) {
      if (documentIds.length < PROMOTION_QUORUM) continue;
      const ladder = field === 'pace' ? PACE_LADDER : DEPTH_LADDER;
      const direction: -1 | 0 | 1 =
        delta === 'slower' || delta === 'deeper' ? -1 : 1;
      const value = shift(ladder, profile[field], direction);
      promotions.push({
        field,
        value,
        documentIds,
        reason: `the same pattern showed up in ${documentIds.length} documents`,
        // Clamped at the end of the ladder, or already there: the local
        // deltas have nowhere left to go, so they are just noise now.
        alreadyGlobal: value === profile[field],
      });
    }
  };

  consider('pace');
  consider('depth');
  return promotions;
}
