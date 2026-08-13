import type { Readable } from 'stream';

export interface StoredFile {
  /** Opaque reference; a path locally, a Drive fileId in production. */
  ref: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * File storage. The local adapter writes to disk; the Drive adapter uses a
 * service account. Range support is required either way — pdf.js issues range
 * requests and the reader's time-to-first-page depends on them (§3.2).
 */
export interface StoragePort {
  put(input: {
    key: string;
    body: Buffer | Readable;
    mimeType: string;
  }): Promise<StoredFile>;

  get(ref: string): Promise<Buffer>;

  /** Streams a byte range; `range` omitted means the whole object. */
  stream(
    ref: string,
    range?: ByteRange,
  ): Promise<{ stream: Readable; size: number }>;

  size(ref: string): Promise<number>;

  delete(ref: string): Promise<void>;

  /**
   * Where the browser should send bytes. Locally this is our own proxy
   * endpoint; with Drive it's a resumable-upload session URL.
   */
  createUploadTarget(input: {
    documentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ uploadUrl: string; uploadMode: 'direct' | 'proxy' }>;
}
