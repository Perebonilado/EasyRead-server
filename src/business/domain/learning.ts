import type { AssessmentEventRecord } from '../repositories/learning.repository';
import type { LearnerProfileRecord } from '../repositories/learning.repository';

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
 * The automatic half of the adaptive loop: pattern-adjust the profile from
 * the last few results, so adaptation doesn't depend on the model remembering
 * to call its tool. Returns the patch to apply, or null for "no change".
 */
export function autoAdjustProfile(
  recent: AssessmentEventRecord[],
  profile: LearnerProfileRecord,
): Partial<LearnerProfileRecord> | null {
  const window = recent.slice(0, 5);
  if (window.length < 4) return null;

  const struggling = window.filter((event) => event.score < 0.5).length >= 3;
  const cruising = window.every((event) => event.score >= 0.85);

  if (struggling && (profile.pace !== 'slower' || profile.depth !== 'deeper')) {
    return { pace: 'slower', depth: 'deeper' };
  }
  if (cruising && profile.pace === 'slower') {
    // Recovered: release the training wheels one notch, keep the depth.
    return { pace: 'steady' };
  }
  return null;
}
