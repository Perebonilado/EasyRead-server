import type { VisualSceneStatus } from '../../contracts';
import type { VisualPlan, VisualTimeline } from '../domain/visual';

/** One page's scene as stored: its state, and once done, its timeline and audio. */
export interface VisualSceneRecord {
  id: string;
  documentId: string;
  /** The chapter the page is in. */
  topicId: string;
  pageNumber: number;
  contentVersion: number;
  generatorVersion: string;
  status: VisualSceneStatus;
  step: string | null;
  fit: string | null;
  fitReason: string | null;
  error: string | null;
  attempts: number;
  title: string | null;
  timeline: VisualTimeline | null;
  audioKey: string | null;
  durationMs: number | null;
  requestedBy: string | null;
  updatedAt: Date | null;
}

/** Where a learner stopped in a document's visuals. */
export interface VisualPositionRecord {
  documentId: string;
  userId: string;
  pageNumber: number;
  offsetMs: number;
  updatedAt: Date | null;
}

/** What a page asked to be drawn, and what was found for it. */
export interface VisualTermRecord {
  term: string;
  drawing: string | null;
  foundBy: 'spelling' | 'meaning' | 'hand';
  times: number;
}

export interface VisualSceneRepository {
  /**
   * What a page asked for, written down: the answer kept so the same
   * word looks the same everywhere, and the misses counted so the list
   * of what the library is short of is ranked by real demand. A term
   * someone has set by hand is never written over.
   */
  noteTerms(input: {
    documentId: string;
    pageNumber: number;
    terms: {
      term: string;
      drawing: string | null;
      foundBy: 'spelling' | 'meaning';
    }[];
  }): Promise<void>;
  /** The terms someone has set by hand, which win over anything the app finds. */
  handPicked(): Promise<Map<string, string>>;
  /** The things nothing draws, the most asked for first. */
  missingTerms(limit: number): Promise<VisualTermRecord[]>;
  /** The learner's last position in the document's visuals, if any. */
  findPosition(
    documentId: string,
    userId: string,
  ): Promise<VisualPositionRecord | null>;
  savePosition(input: {
    documentId: string;
    userId: string;
    pageNumber: number;
    offsetMs: number;
  }): Promise<void>;
  find(
    documentId: string,
    contentVersion: number,
    pageNumber: number,
    generatorVersion: string,
  ): Promise<VisualSceneRecord | null>;
  listByDocument(
    documentId: string,
    contentVersion: number,
    generatorVersion: string,
  ): Promise<VisualSceneRecord[]>;
  /** A pending row for the page, or the one already there. */
  ensure(input: {
    documentId: string;
    contentVersion: number;
    pageNumber: number;
    topicId: string;
    generatorVersion: string;
    requestedBy: string;
  }): Promise<{ record: VisualSceneRecord; created: boolean }>;
  /** A failed or unsuitable row back to pending, so it can be asked for again. */
  resetForRetry(id: string): Promise<void>;
  update(
    id: string,
    patch: Partial<
      Pick<
        VisualSceneRecord,
        | 'status'
        | 'step'
        | 'fit'
        | 'fitReason'
        | 'error'
        | 'attempts'
        | 'title'
        | 'timeline'
        | 'audioKey'
        | 'durationMs'
      >
    >,
  ): Promise<void>;
  /** The chapter's plan, made once for all its pages. */
  findPlan(
    documentId: string,
    contentVersion: number,
    topicId: string,
    generatorVersion: string,
  ): Promise<VisualPlan | null>;
  savePlan(input: {
    documentId: string;
    contentVersion: number;
    topicId: string;
    generatorVersion: string;
    plan: VisualPlan;
  }): Promise<void>;
}
