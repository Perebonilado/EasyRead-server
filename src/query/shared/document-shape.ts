import type { DocumentListItem } from '../../contracts';
import { ACCEPTED_MIME_TYPES } from '../../business/domain/values';
import type { DocumentModel } from '../../web/database/models';

/**
 * The library card's shape, shared by the list and the detail query so the two
 * can't drift apart.
 *
 * `progress` is the number the UI animates: how many pages of the
 * simplified note are written.
 */
export function toListItem(
  doc: DocumentModel,
  simplifiedCount: number,
): DocumentListItem {
  const pageCount = doc.pageCount ?? null;
  const progress =
    doc.status === 'ready'
      ? 1
      : pageCount && pageCount > 0
        ? Math.min(1, simplifiedCount / pageCount)
        : 0;

  return {
    id: doc.id,
    title: doc.title,
    source: doc.source ?? 'uploaded',
    fileName: doc.fileName,
    format: ACCEPTED_MIME_TYPES[doc.sourceMimeType] ?? 'file',
    status: doc.status,
    pageCount,
    simplifiedCount,
    progress,
    failureReason: doc.failureReason,
    simplificationUnavailable: doc.simplificationUnavailable,
    createdAt: doc.createdAt.toISOString(),
  };
}
