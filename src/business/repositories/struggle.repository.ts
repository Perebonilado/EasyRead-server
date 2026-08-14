import type { StruggleKind, StruggleSignalRecord } from '../domain/struggle';

export interface RecordSignalInput {
  userId: string;
  documentId: string;
  kind: StruggleKind;
  topicId?: string | null;
  pageNumber?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface StruggleSignalRepository {
  /** The weight is derived from the kind at write time, in one place. */
  record(input: RecordSignalInput): Promise<void>;

  /**
   * The window the adaptive loop reads: this document's signals, newest
   * first, since `since`.
   */
  window(
    userId: string,
    documentId: string,
    since: Date,
    limit: number,
  ): Promise<StruggleSignalRecord[]>;
}
