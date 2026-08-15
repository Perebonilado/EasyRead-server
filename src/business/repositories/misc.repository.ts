import type {
  HighlightAction,
  Level,
  PipelineStatus,
  PipelineStep,
} from '../../contracts';

// ── Summary ──────────────────────────────────────────────────────────────────
export interface SummaryRepository {
  upsert(documentId: string, summary: string, model: string): Promise<void>;
  find(documentId: string): Promise<string | null>;
}

// ── Topics ───────────────────────────────────────────────────────────────────
export interface TopicRecord {
  id: string;
  title: string;
  shortDescription: string | null;
  startPage: number;
  endPage: number;
  orderIndex: number;
}

/** A prerequisite as the pipeline drafts it, before topic ids exist. */
export interface PrerequisiteDraft {
  concept: string;
  why: string;
  kind: 'internal' | 'external';
  /** Index into the same topics array of the chapter that covers it. */
  coveredByIndex: number | null;
}

export interface TopicRepository {
  replaceAll(
    documentId: string,
    topics: (Omit<TopicRecord, 'id'> & {
      prerequisites?: PrerequisiteDraft[];
    })[],
    source: 'outline_pass' | 'page_tagging',
  ): Promise<void>;
  listWithReadState(
    documentId: string,
    userId: string,
  ): Promise<(TopicRecord & { isRead: boolean })[]>;
  count(documentId: string): Promise<number>;
  markRead(topicIds: string[], userId: string, now: Date): Promise<void>;
  markUnread(topicIds: string[], userId: string): Promise<void>;
  /** Guards against marking topics on someone else's document. */
  belongToUser(topicIds: string[], userId: string): Promise<boolean>;
}

// ── Reading position ─────────────────────────────────────────────────────────
export interface PositionRecord {
  lastPage: number;
  furthestPage: number;
  level: 'original' | 'standard' | 'easiest';
}

export interface ReadingPositionRepository {
  find(documentId: string, userId: string): Promise<PositionRecord | null>;
  upsert(
    documentId: string,
    userId: string,
    input: { lastPage: number; level: PositionRecord['level'] },
  ): Promise<void>;
}

// ── Exports ──────────────────────────────────────────────────────────────────
export interface ExportRecord {
  id: string;
  documentId: string;
  level: Level;
  contentVersion: number;
  status: 'processing' | 'done' | 'failed';
  fileRef: string | null;
  watermarked: boolean;
  /**
   * When the row last changed — which, for a finished export, is when the
   * file was written. Used to spot an appendix that has fallen behind the
   * reader's notes.
   */
  renderedAt: Date;
}

export interface ExportRepository {
  findCached(
    documentId: string,
    level: Level,
    contentVersion: number,
  ): Promise<ExportRecord | null>;
  findById(id: string): Promise<ExportRecord | null>;
  create(input: {
    documentId: string;
    level: Level;
    contentVersion: number;
    watermarked: boolean;
  }): Promise<ExportRecord>;
  markDone(id: string, fileRef: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /**
   * Sends a finished export back to the queue — the document is unchanged,
   * but something printed alongside it (the reader's notes) is not.
   */
  markProcessing(id: string): Promise<void>;
}

// ── Highlight history ────────────────────────────────────────────────────────
export interface LookupRecord {
  id: string;
  action: HighlightAction;
  selection: string;
  pageNumber: number | null;
  answer: unknown;
  createdAt: Date;
}

export interface LookupRepository {
  record(input: {
    documentId: string;
    userId: string;
    action: HighlightAction;
    selection: string;
    pageNumber: number | null;
    answer: unknown;
  }): Promise<void>;
  list(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<LookupRecord[]>;
}

// ── Pipeline ledger ──────────────────────────────────────────────────────────
export interface PipelineRunRecord {
  step: PipelineStep;
  status: PipelineStatus;
  attempts: number;
  error: string | null;
}

export interface PipelineRunRepository {
  /**
   * Claims a step for execution. Returns false when it's already `done`, which
   * is what makes re-running the pipeline safe (§2.3).
   */
  claim(documentId: string, step: PipelineStep): Promise<boolean>;
  complete(documentId: string, step: PipelineStep): Promise<void>;
  fail(documentId: string, step: PipelineStep, error: string): Promise<void>;
  skip(documentId: string, step: PipelineStep): Promise<void>;
  status(
    documentId: string,
    step: PipelineStep,
  ): Promise<PipelineStatus | null>;
  list(documentId: string): Promise<PipelineRunRecord[]>;
  allDone(documentId: string, steps: PipelineStep[]): Promise<boolean>;
  /**
   * Forgets every step for a document so the pipeline can run again.
   * Without this a re-run is silently skipped: `claim` refuses a step that
   * already completed, which is exactly what makes re-running safe normally.
   */
  reset(documentId: string): Promise<void>;
}
