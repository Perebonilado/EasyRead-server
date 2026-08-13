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

export interface LearnerProfileRecord {
  pace: 'slower' | 'steady' | 'faster';
  depth: 'lighter' | 'standard' | 'deeper';
  interactivity: 'less' | 'standard' | 'more';
  styleNotes: string | null;
}

export const DEFAULT_LEARNER_PROFILE: LearnerProfileRecord = {
  pace: 'steady',
  depth: 'standard',
  interactivity: 'standard',
  styleNotes: null,
};

export interface LearnerProfileRepository {
  find(userId: string): Promise<LearnerProfileRecord | null>;
  upsert(
    userId: string,
    patch: Partial<LearnerProfileRecord>,
  ): Promise<LearnerProfileRecord>;
}
