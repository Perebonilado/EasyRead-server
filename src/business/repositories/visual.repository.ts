import type { SceneTiming, VisualSceneStatus } from '../../contracts';

/** One page's video as stored: its state, and once done, where its scene, audio and still are. */
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
  /** The scene the player plays, as JSON in the bucket. */
  sceneKey: string | null;
  audioKey: string | null;
  /** One still of the page for its card. */
  thumbKey: string | null;
  /** How the words were timed. */
  timing: SceneTiming | null;
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

export interface VisualSceneRepository {
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
  /**
   * Pages of a generator still waiting or being made that have not
   * changed since `before`, the longest waiting first: what the watchdog
   * checks still has a job carrying it.
   */
  listUnfinished(input: {
    generatorVersion: string;
    before: Date;
    limit: number;
  }): Promise<VisualSceneRecord[]>;
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
        | 'sceneKey'
        | 'audioKey'
        | 'thumbKey'
        | 'timing'
        | 'durationMs'
      >
    >,
  ): Promise<void>;
  /** Every file any of the document's pages made, in every version, for the purge. */
  filesOf(documentId: string): Promise<string[]>;
  /** The document's pages and positions, gone: the tables have no keys to cascade on. */
  purgeDocument(documentId: string): Promise<void>;
}
