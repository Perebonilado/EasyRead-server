import type {
  BoardStatus,
  FollowStatus,
  LecturePosition,
  LectureSegmentStatus,
  LectureStyle,
  SegmentKind,
} from '../../contracts';

export interface LecturePlanRecord {
  topicId: string;
  status: LectureSegmentStatus;
  plan: unknown;
  /** The generator that wrote the plan; absent from stores that do not keep it. */
  generatorVersion?: string;
}

export interface LectureSegmentRecord {
  topicId: string | null;
  pageNumber: number;
  seq: number;
  style: LectureStyle;
  /** A page, or one of the short segments around a chapter. */
  kind: SegmentKind;
  status: LectureSegmentStatus;
  /** When the row last changed; how long it has sat in flight. */
  updatedAt?: Date | null;
  scriptText: string | null;
  audioKey: string | null;
  durationMs: number | null;
  bridge: boolean;
  attempts: number;
  /** Where each move of the page begins in the script; null until written. */
  moveOffsets: number[] | null;
  /** The note sentences the writer said each section teaches; null for rows written before it was asked. */
  sectionTags?: unknown;
  /** The board timeline, as stored; null until the board writer ran. */
  board: unknown;
  /** Word times measured on the audio; null until aligned. */
  wordTimes: unknown;
  boardStatus: BoardStatus;
  /** The follow-along track, as stored; null until the row is voiced. */
  follow?: unknown;
  followStatus?: FollowStatus;
}

export interface LectureSegmentSeed {
  topicId: string;
  pageNumber: number;
  seq: number;
  bridge: boolean;
  style: LectureStyle;
  /** Omitted means a page. */
  kind?: SegmentKind;
}

/** The row a page-and-style-and-kind names; kind omitted means the page. */
export interface SegmentKey {
  documentId: string;
  pageNumber: number;
  contentVersion: number;
  style: LectureStyle;
  kind?: SegmentKind;
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
    kind?: SegmentKind,
  ): Promise<LectureSegmentRecord | null>;
  /** Every row of the version, or one style's, in play order. */
  listSegments(
    documentId: string,
    contentVersion: number,
    style?: LectureStyle,
  ): Promise<LectureSegmentRecord[]>;
  /** Drops one kind of extra for a style, or for one chapter of it, so it can be written afresh. */
  removeSegments(
    documentId: string,
    contentVersion: number,
    style: LectureStyle,
    kind: SegmentKind,
    topicId?: string,
  ): Promise<void>;
  markSegmentWriting(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
    style: LectureStyle,
    kind?: SegmentKind,
  ): Promise<void>;
  /**
   * The script is written but not yet voiced.
   *
   * Split from `markSegmentDone` so synthesis can run off the writing
   * critical path: a voice retry then cannot clobber the script, because
   * only this call ever writes it.
   */
  markSegmentWritten(
    input: SegmentKey & {
      scriptText: string;
      moveOffsets: number[];
      durationMs: number | null;
      /** The writer's tags for the follow-along matcher; left as it is when omitted. */
      sectionTags?: unknown;
    },
  ): Promise<void>;
  /** The audio exists: the page is playable. */
  markSegmentDone(
    input: SegmentKey & { audioKey: string; durationMs: number | null },
  ): Promise<void>;
  markSegmentFailed(input: SegmentKey & { error: string }): Promise<void>;
  /** The row's board and its status; the timeline may be null for failed or skipped. */
  saveBoard(
    input: SegmentKey & { board: unknown; boardStatus: BoardStatus },
  ): Promise<void>;
  /** The row's word timings and, when they were measured on the audio, the audio's true length. */
  saveWordTimes(
    input: SegmentKey & { wordTimes: unknown; durationMs?: number },
  ): Promise<void>;
  /** The row's follow-along track and its status. */
  saveFollow(
    input: SegmentKey & { follow: unknown; followStatus: FollowStatus },
  ): Promise<void>;
  /** Rows with words but no current board: what a backfill writes. */
  listForBoardBackfill(
    documentId: string,
    contentVersion: number,
    topicIds: string[] | null,
  ): Promise<LectureSegmentRecord[]>;
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
