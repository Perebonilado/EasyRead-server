import type { NoteSource } from '../../contracts';

export interface NoteRecord {
  id: string;
  body: string;
  pageNumber: number | null;
  topicId: string | null;
  quotedText: string | null;
  source: NoteSource;
  createdAt: Date;
  updatedAt: Date;
}

/** A note read outside its document carries the document with it. */
export interface NoteWithDocument extends NoteRecord {
  documentId: string;
  documentTitle: string;
}

export interface CreateNoteInput {
  documentId: string;
  userId: string;
  body: string;
  pageNumber?: number | null;
  topicId?: string | null;
  quotedText?: string | null;
  source?: NoteSource;
}

/**
 * A reader's notes on one document.
 *
 * Scoped by (document, user) like the chat thread: there is no notebook row,
 * a notebook *is* every note sharing that pair. Every method takes the user
 * id even when the note id alone would find the row — a note is private, and
 * an ownership check that lives in the query can't be forgotten by a caller.
 */
export interface NoteRepository {
  create(input: CreateNoteInput): Promise<NoteRecord>;

  /**
   * A page of the notebook, newest first. `before` is a keyset cursor — the
   * createdAt of the oldest note already on screen.
   */
  page(
    documentId: string,
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ notes: NoteRecord[]; hasMore: boolean }>;

  /** Edits the body of one note. Returns null when it isn't the user's. */
  updateBody(
    noteId: string,
    userId: string,
    body: string,
  ): Promise<NoteRecord | null>;

  /** True when a row was removed; false when there was nothing to remove. */
  remove(noteId: string, userId: string): Promise<boolean>;

  /** Every note on a document, oldest first — the export's appendix. */
  all(documentId: string, userId: string): Promise<NoteRecord[]>;

  /**
   * When the notebook last changed, or null when it is empty. Used to tell a
   * cached export that its appendix is out of date.
   */
  lastChangedAt(documentId: string, userId: string): Promise<Date | null>;

  /**
   * Every note this reader has written, across all their documents, newest
   * first — the notes screen. Notes on a deleted document are left out; the
   * rows are gone anyway once the delete cascades.
   */
  pageForUser(
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ notes: NoteWithDocument[]; hasMore: boolean }>;
}
