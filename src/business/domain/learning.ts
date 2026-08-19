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

// ── Passes: rereading, as its own chapter of the evidence ────────────────────

/**
 * How the understanding report reads a topic's history.
 *
 * A reread is not more of the same evidence — it is a second attempt, and
 * blending it with the first tells a lie in both directions: a chapter
 * bombed cold and nailed after rereading averages to "mediocre", and the
 * improvement the reread bought is invisible. So events are grouped into
 * passes, the newest pass carries the score, and the earlier ones become
 * the trend behind it.
 *
 * Passes are reconstructed from time gaps rather than recorded: no
 * migration, no new writes, and it works retroactively over every event
 * already in the table. The known cost is that a same-day reread merges
 * into the current pass; that is the honest trade for zero bookkeeping.
 */

/** Same 12 hours the return-recall offer uses — one gap rule in the product. */
export const PASS_GAP_MS = 12 * 60 * 60 * 1000;

/** No evidence for this long and a topic is stale: labeled, never re-scored. */
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export interface Pass {
  /** Oldest first within the pass. */
  events: AssessmentEventRecord[];
  startedAt: Date;
  endedAt: Date;
  /** 0–100 for this pass alone; null when it holds too little evidence. */
  score: number | null;
}

/**
 * Splits one topic's events into passes on gaps longer than `gapMs`.
 * Input may be in any order; output is oldest pass first.
 */
export function splitIntoPasses(
  events: AssessmentEventRecord[],
  gapMs: number = PASS_GAP_MS,
): Pass[] {
  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  if (!sorted.length) return [];

  const groups: AssessmentEventRecord[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1].createdAt.getTime();
    const current = sorted[i].createdAt.getTime();
    if (current - previous > gapMs) groups.push([sorted[i]]);
    else groups[groups.length - 1].push(sorted[i]);
  }

  return groups.map((group) => ({
    events: group,
    startedAt: group[0].createdAt,
    endedAt: group[group.length - 1].createdAt,
    score: passScore(group),
  }));
}

/**
 * One pass's score, 0–100. Same weighting spirit as `computeMastery` —
 * quality-weighted, recency-decayed — but scoped to the pass, so the number
 * answers "how did this attempt go", not "how are things overall".
 */
export function passScore(events: AssessmentEventRecord[]): number | null {
  if (events.length < MIN_EVENTS) return null;

  // Newest first within the pass, so decay favours how it ended.
  const sorted = [...events].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  let weighted = 0;
  let total = 0;
  sorted.forEach((event, index) => {
    const weight = KIND_WEIGHT[event.kind] * DECAY ** index;
    weighted += event.score * weight;
    total += weight;
  });
  return Math.round((weighted / total) * 100);
}

export interface TopicReport {
  topicId: string;
  /** The latest pass that carries a score; null when none does. */
  score: number | null;
  /** Every scored pass, oldest first — the trend behind the score. */
  passScores: number[];
  /** Latest scored pass minus the one before it, when both exist. */
  delta: number | null;
  passes: number;
  events: number;
  lastEvidenceAt: Date | null;
  /** Evidence exists but is older than STALE_AFTER_MS. Label only. */
  stale: boolean;
  /** The newest scored pass is weak. Earlier weakness never keeps this true. */
  needsRevisit: boolean;
}

/**
 * A topic's standing, read from its passes.
 *
 * Two rules worth stating: the newest scored pass wins outright (so a good
 * reread clears `needsRevisit` no matter how bad the first attempt was), and
 * time alone never moves a score — a long-untouched topic is `stale`, which
 * is a different thing from weak and must render differently.
 */
export function topicReport(
  topicId: string,
  events: AssessmentEventRecord[],
  now: Date,
): TopicReport {
  const passes = splitIntoPasses(events);
  const scored = passes.filter((pass) => pass.score !== null);
  const passScores = scored.map((pass) => pass.score as number);
  const score = passScores.length ? passScores[passScores.length - 1] : null;
  const delta =
    passScores.length >= 2
      ? passScores[passScores.length - 1] - passScores[passScores.length - 2]
      : null;

  const lastEvidenceAt = passes.length
    ? passes[passes.length - 1].endedAt
    : null;

  return {
    topicId,
    score,
    passScores,
    delta,
    passes: passes.length,
    events: events.length,
    lastEvidenceAt,
    stale: lastEvidenceAt
      ? now.getTime() - lastEvidenceAt.getTime() > STALE_AFTER_MS
      : false,
    needsRevisit: score !== null && score < WEAK_THRESHOLD,
  };
}

// ── Missed ideas: what never came back, and whether it since did ─────────────

export interface MissedIdea {
  text: string;
  firstMissedAt: Date;
  timesMissed: number;
  resolvedAt: Date | null;
}

/**
 * The ideas a topic's recalls kept failing to produce, folded across passes.
 *
 * Written by the recall grader into `payload.missed`; closed by a later
 * grade listing them in `payload.resolved`. Resolution is judged by the
 * grader at grade time rather than matched here, because "the wage-price
 * spiral" and "wages pushing prices up" are the same idea and no string
 * comparison in application code will ever agree.
 *
 * Matching against `resolved` is exact-text by necessity — the grader is
 * handed the very strings it must echo back, so this stays a lookup rather
 * than a guess.
 */
export function openMissedIdeas(events: AssessmentEventRecord[]): MissedIdea[] {
  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const ideas = new Map<string, MissedIdea>();
  for (const event of sorted) {
    const missed = event.payload?.missed;
    if (Array.isArray(missed)) {
      for (const raw of missed) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const text = raw.trim();
        const existing = ideas.get(text);
        if (existing) {
          existing.timesMissed += 1;
          // Missed again after being resolved: it is open once more.
          existing.resolvedAt = null;
        } else {
          ideas.set(text, {
            text,
            firstMissedAt: event.createdAt,
            timesMissed: 1,
            resolvedAt: null,
          });
        }
      }
    }

    const resolved = event.payload?.resolved;
    if (Array.isArray(resolved)) {
      for (const raw of resolved) {
        if (typeof raw !== 'string') continue;
        const idea = ideas.get(raw.trim());
        if (idea) idea.resolvedAt = event.createdAt;
      }
    }
  }

  // Most-missed first, then oldest — what to reread, in order.
  return [...ideas.values()].sort(
    (a, b) =>
      b.timesMissed - a.timesMissed ||
      a.firstMissedAt.getTime() - b.firstMissedAt.getTime(),
  );
}
