import type { LecturePosition, LectureSegmentStatus } from '../../contracts';

export interface LecturePlanRecord {
  topicId: string;
  status: LectureSegmentStatus;
  plan: unknown;
}

export interface LectureSegmentRecord {
  topicId: string | null;
  pageNumber: number;
  seq: number;
  status: LectureSegmentStatus;
  scriptText: string | null;
  audioKey: string | null;
  durationMs: number | null;
  bridge: boolean;
  attempts: number;
}

export interface LectureSegmentSeed {
  topicId: string;
  pageNumber: number;
  seq: number;
  bridge: boolean;
}

/**
 * Lecture storage. Everything is scoped by content version: a rewritten
 * document does not inherit the lecture written for its previous text.
 */
export interface LectureRepository {
  // ── plans ────────────────────────────────────────────────────────────────
  savePlan(input: {
    documentId: string;
    topicId: string;
    contentVersion: number;
    status: LectureSegmentStatus;
    plan: unknown;
    generatorVersion: string;
    error?: string | null;
  }): Promise<void>;
  findPlan(
    documentId: string,
    topicId: string,
    contentVersion: number,
  ): Promise<LecturePlanRecord | null>;
  /** Every chapter plan of the document at this version, in no order. */
  listPlans(
    documentId: string,
    contentVersion: number,
  ): Promise<LecturePlanRecord[]>;

  // ── segments ─────────────────────────────────────────────────────────────
  /** Pre-creates one pending row per page. Re-running is harmless. */
  seedSegments(input: {
    documentId: string;
    contentVersion: number;
    generatorVersion: string;
    segments: LectureSegmentSeed[];
  }): Promise<void>;
  findSegment(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
  ): Promise<LectureSegmentRecord | null>;
  listSegments(
    documentId: string,
    contentVersion: number,
  ): Promise<LectureSegmentRecord[]>;
  markSegmentWriting(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
  ): Promise<void>;
  /**
   * The script is written but not yet voiced.
   *
   * Split from `markSegmentDone` so synthesis can run off the writing
   * critical path: a voice retry then cannot clobber the script, because
   * only this call ever writes it.
   */
  markSegmentWritten(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    scriptText: string;
    durationMs: number | null;
  }): Promise<void>;
  /** The audio exists: the page is playable. */
  markSegmentDone(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    audioKey: string;
    durationMs: number | null;
  }): Promise<void>;
  markSegmentFailed(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    error: string;
  }): Promise<void>;
  /**
   * Puts a chapter's failed pages back to pending so they can be written
   * again. Pages that were written are left exactly as they are.
   */
  resetFailedSegments(
    documentId: string,
    contentVersion: number,
    topicIds: string[],
  ): Promise<void>;
  /** Wipes a document's lecture so it can be written again. */
  clear(documentId: string): Promise<void>;

  // ── position ─────────────────────────────────────────────────────────────
  savePosition(input: {
    userId: string;
    documentId: string;
    pageNumber: number;
    offsetMs: number;
  }): Promise<void>;
  findPosition(
    userId: string,
    documentId: string,
  ): Promise<LecturePosition | null>;
}
