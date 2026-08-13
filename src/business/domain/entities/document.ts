import type { DocumentStatus } from '../../../contracts';
import { DocumentNotReadyError } from '../errors/errors';
import { SCANNED_EMPTY_PAGE_RATIO } from '../values';

export interface DocumentProps {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  status: DocumentStatus;
  pageCount: number | null;
  sourceMimeType: string;
  sizeBytes: number;
  originalFileRef: string | null;
  canonicalPdfRef: string | null;
  thumbnailRef: string | null;
  contentVersion: number;
  simplificationUnavailable: boolean;
  failureReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export class Document {
  constructor(readonly props: DocumentProps) {}

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get contentVersion() {
    return this.props.contentVersion;
  }

  isOwnedBy(userId: string): boolean {
    return this.props.userId === userId && this.props.deletedAt === null;
  }

  /** A PDF is already canonical, so it skips conversion entirely (§4.2). */
  needsConversion(): boolean {
    return this.props.sourceMimeType !== 'application/pdf';
  }

  /** The reader can open as soon as there are bytes to render. */
  isReadable(): boolean {
    return (
      this.props.canonicalPdfRef !== null && this.props.status !== 'failed'
    );
  }

  requireReadable(): void {
    if (!this.isReadable()) {
      throw new DocumentNotReadyError('This document is still being prepared');
    }
  }

  markUploaded(originalFileRef: string): void {
    this.props.originalFileRef = originalFileRef;
    this.props.status = 'processing';
  }

  /** Conversion output becomes the canonical PDF every later step reads. */
  markConverted(
    canonicalPdfRef: string,
    pageCount: number,
    thumbnailRef: string | null,
  ): void {
    this.props.canonicalPdfRef = canonicalPdfRef;
    this.props.pageCount = pageCount;
    if (thumbnailRef) this.props.thumbnailRef = thumbnailRef;
  }

  /**
   * A document whose pages are mostly empty is a scan. It still opens as a
   * plain viewer — it just can't be simplified, and the UI explains why
   * rather than failing (§4.3).
   */
  markExtracted(emptyPages: number, totalPages: number): void {
    if (totalPages > 0 && emptyPages / totalPages > SCANNED_EMPTY_PAGE_RATIO) {
      this.props.simplificationUnavailable = true;
    }
  }

  markReady(): void {
    this.props.status = 'ready';
    this.props.failureReason = null;
  }

  markFailed(reason: string): void {
    this.props.status = 'failed';
    this.props.failureReason = reason;
  }

  rename(title: string): void {
    this.props.title = title;
  }

  softDelete(now: Date): void {
    this.props.deletedAt = now;
  }
}
