/** The learning loop's persistence: assessment events and learner profiles. */

export type AssessmentKind = 'mcq' | 'flashcard' | 'verbal';

export interface AssessmentEventRecord {
  topicId: string | null;
  kind: AssessmentKind;
  /** 0..1 — how well this moment went. */
  score: number;
  createdAt: Date;
}

export interface AssessmentRepository {
  record(input: {
    userId: string;
    documentId: string;
    topicId: string | null;
    kind: AssessmentKind;
    score: number;
    payload?: unknown;
  }): Promise<void>;

  /** Newest first, capped — mastery only ever reads the recent past. */
  recent(
    userId: string,
    documentId: string,
    limit: number,
  ): Promise<AssessmentEventRecord[]>;
}

/**
 * Who last set a dial. `manual` is a promise: the auto-adjust reflex is
 * forbidden from touching a manual dial until the reader releases it back to
 * `auto`.
 */
export type DialSource = 'default' | 'auto' | 'manual';

export interface LearnerProfileRecord {
  pace: 'slower' | 'steady' | 'faster';
  depth: 'lighter' | 'standard' | 'deeper';
  interactivity: 'less' | 'standard' | 'more';
  styleNotes: string | null;
  paceSource: DialSource;
  depthSource: DialSource;
  interactivitySource: DialSource;
}

export type PaceDelta = 'slower' | 'none' | 'faster';
export type DepthDelta = 'deeper' | 'none' | 'lighter';

/**
 * How this reader is doing in ONE document, relative to their usual self.
 * Deltas, never absolutes — see `effectiveProfile`.
 */
export interface DocumentLearningStateRecord {
  documentId: string;
  paceDelta: PaceDelta;
  depthDelta: DepthDelta;
  reason: string | null;
}

export interface DocumentLearningStateRepository {
  find(
    userId: string,
    documentId: string,
  ): Promise<DocumentLearningStateRecord | null>;
  /** Every document this reader currently holds a non-`none` delta in. */
  active(userId: string): Promise<DocumentLearningStateRecord[]>;
  upsert(
    userId: string,
    documentId: string,
    patch: Partial<Omit<DocumentLearningStateRecord, 'documentId'>>,
  ): Promise<void>;
  /** Used after promotion: the global profile now carries the pattern. */
  clearDelta(
    userId: string,
    documentIds: string[],
    field: 'pace' | 'depth',
  ): Promise<void>;
}

export const DEFAULT_LEARNER_PROFILE: LearnerProfileRecord = {
  pace: 'steady',
  depth: 'standard',
  interactivity: 'standard',
  styleNotes: null,
  paceSource: 'default',
  depthSource: 'default',
  interactivitySource: 'default',
};

export interface LearnerProfileRepository {
  find(userId: string): Promise<LearnerProfileRecord | null>;
  upsert(
    userId: string,
    patch: Partial<LearnerProfileRecord>,
  ): Promise<LearnerProfileRecord>;
}

// ── Change history ───────────────────────────────────────────────────────────

export type ProfileChangeField =
  'pace' | 'depth' | 'interactivity' | 'style_notes';
export type ProfileChangeSource = 'auto' | 'tutor' | 'manual';

export interface ProfileChangeRecord {
  id: string;
  field: ProfileChangeField;
  fromValue: string | null;
  toValue: string;
  source: ProfileChangeSource;
  reason: string | null;
  narratedAt: Date | null;
  createdAt: Date;
}

export interface ProfileChangeRepository {
  record(input: {
    userId: string;
    field: ProfileChangeField;
    fromValue: string | null;
    toValue: string;
    source: ProfileChangeSource;
    reason?: string | null;
  }): Promise<void>;
  /** Newest first. */
  list(userId: string, limit: number): Promise<ProfileChangeRecord[]>;
  /** Auto/tutor changes the reader has not yet been told about, oldest first. */
  unnarrated(userId: string, limit: number): Promise<ProfileChangeRecord[]>;
  markNarrated(ids: string[]): Promise<void>;
}
