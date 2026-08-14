import type { Block, Level, PageStatus } from '../../contracts';

export interface SimplifiedPageRecord {
  pageNumber: number;
  level: Level;
  status: PageStatus;
  blocks: Block[] | null;
  attempts: number;
}

export interface LevelProgress {
  done: number;
  failed: number;
  total: number;
}

export interface SimplifiedPageRepository {
  /** Pre-creates one pending row per page — the fan-out step. */
  seed(documentId: string, level: Level, pageCount: number): Promise<void>;
  /**
   * Drops every simplified page for a document. `seed` ignores duplicates, so
   * a rewritten document would otherwise keep the old text against the new
   * pages and never be simplified again.
   */
  clear(documentId: string): Promise<void>;
  find(
    documentId: string,
    level: Level,
    pageNumber: number,
  ): Promise<SimplifiedPageRecord | null>;
  findRange(
    documentId: string,
    level: Level,
    from: number,
    to: number,
  ): Promise<SimplifiedPageRecord[]>;
  findAllDone(
    documentId: string,
    level: Level,
  ): Promise<SimplifiedPageRecord[]>;
  markProcessing(
    documentId: string,
    level: Level,
    pageNumber: number,
  ): Promise<void>;
  markDone(input: {
    documentId: string;
    level: Level;
    pageNumber: number;
    blocks: Block[];
    model: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<void>;
  markFailed(
    documentId: string,
    level: Level,
    pageNumber: number,
    error: string,
  ): Promise<number>;
  progress(documentId: string, level: Level): Promise<LevelProgress>;
  reset(documentId: string, level: Level, pageNumber: number): Promise<void>;
}
