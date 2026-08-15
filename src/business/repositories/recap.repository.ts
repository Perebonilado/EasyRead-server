import type { RecapBody } from '../../contracts';

export interface RecapRecord {
  id: string;
  fromPage: number;
  toPage: number;
  since: Date | null;
  body: RecapBody;
  createdAt: Date;
}

/**
 * Recaps of past sittings with one document.
 *
 * Append-only: a recap describes a session that happened, so it is never
 * edited — a new sitting writes a new row.
 */
export interface RecapRepository {
  create(input: {
    documentId: string;
    userId: string;
    fromPage: number;
    toPage: number;
    since: Date | null;
    body: RecapBody;
  }): Promise<RecapRecord>;

  /** Newest first. */
  list(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<RecapRecord[]>;

  /** The most recent recap, which is where the next session's window starts. */
  latest(documentId: string, userId: string): Promise<RecapRecord | null>;
}
