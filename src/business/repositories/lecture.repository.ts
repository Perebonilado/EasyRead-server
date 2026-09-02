import type {
  LecturePosition,
  LectureSegmentStatus,
  LectureStyle,
} from '../../contracts';

export interface LecturePlanRecord {
  topicId: string;
  status: LectureSegmentStatus;
  plan: unknown;
}

export interface LectureSegmentRecord {
  topicId: string | null;
  pageNumber: number;
  seq: number;
  style: LectureStyle;
  status: LectureSegmentStatus;
  scriptText: string | null;
  audioKey: string | null;
  durationMs: number | null;
  bridge: boolean;
  attempts: number;
  /** Where each move of the page begins in the script; null until written. */
  moveOffsets: number[] | null;
}

export interface LectureSegmentSeed {
  topicId: string;
  pageNumber: number;
  seq: number;
  bridge: boolean;
  style: LectureStyle;
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
    style: LectureStyle,
  ): Promise<LectureSegmentRecord | null>;
  /** Every row of the version, or one style's, in play order. */
  listSegments(
    documentId: string,
    contentVersion: number,
    style?: LectureStyle,
  ): Promise<LectureSegmentRecord[]>;
  markSegmentWriting(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
    style: LectureStyle,
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
    style: LectureStyle;
    scriptText: string;
    moveOffsets: number[];
    durationMs: number | null;
  }): Promise<void>;
  /** The audio exists: the page is playable. */
  markSegmentDone(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    style: LectureStyle;
    audioKey: string;
    durationMs: number | null;
  }): Promise<void>;
  markSegmentFailed(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    style: LectureStyle;
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
    style: LectureStyle,
  ): Promise<void>;
  /**
   * Wipes a document's lecture so it can be written again: one style's
   * pages, or, with no style, every page and every plan.
   */
  clear(documentId: string, style?: LectureStyle): Promise<void>;

  // ── position ─────────────────────────────────────────────────────────────
  savePosition(input: {
    userId: string;
    documentId: string;
    pageNumber: number;
    offsetMs: number;
    style: LectureStyle;
  }): Promise<void>;
  findPosition(
    userId: string,
    documentId: string,
  ): Promise<LecturePosition | null>;
}
