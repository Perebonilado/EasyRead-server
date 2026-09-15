import type { Block, PageStatus } from '../../contracts';

export interface SimplifiedPageRecord {
  pageNumber: number;
  status: PageStatus;
  blocks: Block[] | null;
  attempts: number;
}

export interface LevelProgress {
  done: number;
  failed: number;
  total: number;
}

/** The simplified note, one row per page of the document. */
export interface SimplifiedPageRepository {
  /** Pre-creates one pending row per page — the fan-out step. */
  seed(documentId: string, pageCount: number): Promise<void>;
  /**
   * Drops every simplified page for a document. `seed` ignores duplicates, so
   * a rewritten document would otherwise keep the old text against the new
   * pages and never be simplified again.
   */
  clear(documentId: string): Promise<void>;
  find(
    documentId: string,
    pageNumber: number,
  ): Promise<SimplifiedPageRecord | null>;
  findRange(
    documentId: string,
    from: number,
    to: number,
  ): Promise<SimplifiedPageRecord[]>;
  findAllDone(documentId: string): Promise<SimplifiedPageRecord[]>;
  markProcessing(documentId: string, pageNumber: number): Promise<void>;
  markDone(input: {
    documentId: string;
    pageNumber: number;
    blocks: Block[];
    model: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<void>;
  markFailed(
    documentId: string,
    pageNumber: number,
    error: string,
  ): Promise<number>;
  progress(documentId: string): Promise<LevelProgress>;
  reset(documentId: string, pageNumber: number): Promise<void>;
}
