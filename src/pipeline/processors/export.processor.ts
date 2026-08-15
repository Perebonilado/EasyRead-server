import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVENT_BUS,
  EXPORT_RENDERER,
  STORAGE,
} from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type {
  ExportRendererPort,
  ExportSection,
} from '../../business/ports/export-renderer.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  DOCUMENT_REPOSITORY,
  EXPORT_REPOSITORY,
  NOTE_REPOSITORY,
  PAGE_ASSET_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { PageAssetRepository } from '../../business/repositories/page-asset.repository';
import type {
  NoteRecord,
  NoteRepository,
} from '../../business/repositories/note.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  ExportRepository,
  TopicRepository,
} from '../../business/repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import type { ExportJobData } from '../queues';
import type { JobContext } from './base.processor';

/**
 * Typesets the simplified text as a PDF (§4.8).
 *
 * Pages that failed simplification are omitted rather than exported blank —
 * a gap in the page numbering is honest; a blank page reads like the content
 * was lost.
 */
@Injectable()
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(EXPORT_REPOSITORY) private readonly exports: ExportRepository,
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Inject(PAGE_ASSET_REPOSITORY)
    private readonly assets: PageAssetRepository,
    @Inject(EXPORT_RENDERER) private readonly renderer: ExportRendererPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async process(job: ExportJobData, context: JobContext): Promise<void> {
    const record = await this.exports.findById(job.exportId);
    if (!record || record.status === 'done') return;

    const doc = await this.documents.findById(job.documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== job.contentVersion) {
      await this.exports.markFailed(
        job.exportId,
        'The document changed while exporting',
      );
      return;
    }

    try {
      const pages = await this.simplified.findAllDone(
        job.documentId,
        job.level,
      );
      if (!pages.length)
        throw new Error('There is nothing simplified to export yet');

      const topics = await this.topics.listWithReadState(
        job.documentId,
        doc.userId,
      );

      // Best-effort: an export is still worth having without the appendix,
      // and a reader waiting on a PDF should not be told it failed because
      // their notes could not be read.
      const notes: NoteRecord[] = await this.notes
        .all(job.documentId, doc.userId)
        .catch(() => []);

      // Figures per page, bytes in hand. Best-effort throughout.
      const figuresByPage = new Map<
        number,
        { bytes: Buffer; caption: string | null }[]
      >();
      try {
        const assets = await this.assets.list(
          job.documentId,
          doc.contentVersion,
        );
        for (const asset of assets) {
          const bytes = await this.storage.get(asset.fileRef).catch(() => null);
          if (!bytes) continue;
          const list = figuresByPage.get(asset.pageNumber) ?? [];
          list.push({ bytes, caption: asset.caption });
          figuresByPage.set(asset.pageNumber, list);
        }
      } catch {
        // The export stands without its pictures.
      }

      const sections: ExportSection[] = pages
        .filter((page) => page.blocks?.length)
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((page) => ({
          pageNumber: page.pageNumber,
          blocks: page.blocks ?? [],
          topicTitle: topics.find(
            (topic) =>
              page.pageNumber >= topic.startPage &&
              page.pageNumber <= topic.endPage,
          )?.title,
          figures: figuresByPage.get(page.pageNumber),
        }));

      const pdf = await this.renderer.render({
        title: doc.props.title,
        sections,
        watermark: record.watermarked,
        notes: notes.map((note) => ({
          body: note.body,
          pageNumber: note.pageNumber,
          quotedText: note.quotedText,
          source: note.source,
        })),
      });

      const stored = await this.storage.put({
        key: `documents/${doc.id}/exports/${job.exportId}.pdf`,
        body: pdf,
        mimeType: 'application/pdf',
      });

      await this.exports.markDone(job.exportId, stored.ref);
      await this.events.publish(doc.id, {
        type: 'export.ready',
        exportId: job.exportId,
        level: job.level,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (context.isFinalAttempt) {
        this.logger.warn(`Export ${job.exportId} failed — ${message}`);
        await this.exports.markFailed(job.exportId, message);
        return;
      }
      throw error;
    }
  }
}
