import type { PixelBox } from '../domain/pictures/types';

/**
 * A row of the picture desk's cache (migration 0066): a file it judged
 * (cleared, with our copy; or refused, with why), or a question it
 * answered ('lookup': which picture it picked for a person or a place).
 */
export interface PictureCacheRow {
  id: string;
  qid: string | null;
  source: string;
  sourceId: string;
  kind: string | null;
  subject: string | null;
  url: string | null;
  sourceUrl: string | null;
  licence: string | null;
  credit: string | null;
  chip: string | null;
  width: number | null;
  height: number | null;
  focal: PixelBox | null;
  sha1: string | null;
  mime: string | null;
  storageKey: string | null;
  depthKey: string | null;
  meta: Record<string, unknown> | null;
  checkedAt: Date;
  refusedReason: string | null;
}

export type PictureCacheInput = Omit<PictureCacheRow, 'id'> & { id?: string };

export interface PictureCacheRepository {
  find(id: string): Promise<PictureCacheRow | null>;
  bySource(source: string, sourceId: string): Promise<PictureCacheRow | null>;
  /** A row that holds our copy of these bytes, when one does. */
  bySha1(sha1: string): Promise<PictureCacheRow | null>;
  /** Writes the row for its source and name: a new one, or the one there, changed. */
  save(row: PictureCacheInput): Promise<PictureCacheRow>;
}
