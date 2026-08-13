import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { ACCEPTED_MIME_TYPES } from '../../business/domain/values';
import {
  CONVERTER,
  EVENT_BUS,
  PDF_TOOLKIT,
  STORAGE,
} from '../../business/ports/tokens';
import type { ConverterPort } from '../../business/ports/converter.port';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { PdfToolkitPort } from '../../business/ports/pdf-toolkit.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
} from '../../business/repositories/tokens';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { PipelineRunRepository } from '../../business/repositories/misc.repository';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { BaseJobData } from '../queues';
import {
  BasePipelineProcessor,
  isPermanentFailure,
  type JobContext,
} from './base.processor';

/**
 * Produces the canonical PDF (§4.2).
 *
 * PDFs skip conversion entirely and are simply adopted as canonical — that's
 * the majority path and the reason most uploads are readable within seconds.
 * Everything else goes through Drive's free import/export.
 */
@Injectable()
export class ConvertProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'convert';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CONVERTER) private readonly converter: ConverterPort,
    @Inject(PDF_TOOLKIT) private readonly pdf: PdfToolkitPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  async process(job: BaseJobData, context: JobContext): Promise<void> {
    const doc = await this.begin(job);
    if (!doc) return;

    try {
      const originalRef = doc.props.originalFileRef;
      if (!originalRef) throw new Error('No uploaded file to convert');

      let canonicalRef = originalRef;
      let pdf = await this.storage.get(originalRef);

      if (doc.needsConversion()) {
        if (!this.converter.supports(doc.props.sourceMimeType)) {
          // This reaches the reader, so it names the file the way the user
          // does. A raw mime type in the UI tells them nothing they can act on.
          const extension =
            ACCEPTED_MIME_TYPES[doc.props.sourceMimeType] ??
            doc.props.fileName.split('.').pop() ??
            'file';
          throw new Error(
            `.${extension} files need document conversion, which isn't switched on for this server`,
          );
        }
        pdf = await this.converter.toPdf({
          buffer: pdf,
          mimeType: doc.props.sourceMimeType,
          filename: doc.props.fileName,
        });
        const stored = await this.storage.put({
          key: `documents/${doc.id}/canonical.pdf`,
          body: pdf,
          mimeType: 'application/pdf',
        });
        canonicalRef = stored.ref;
      }

      const pageCount = await this.pdf.pageCount(pdf);
      if (pageCount < 1) throw new Error('That file has no readable pages');

      // A missing thumbnail is cosmetic; it must not fail the document.
      const thumbnailRef = await this.storeThumbnail(doc.id, pdf);

      doc.markConverted(canonicalRef, pageCount, thumbnailRef);
      await this.documents.save(doc);

      await this.succeed(job);
      await this.events.publish(doc.id, {
        type: 'document.converted',
        pageCount,
      });
      await this.pipeline.afterConvert(doc.id, doc.contentVersion);
    } catch (error) {
      // A transient Drive hiccup should not flash "failed" in the library and
      // then recover, so ordinary errors wait for the retries to be spent. A
      // damaged file is different: it will fail identically three times, and
      // making the user watch that costs them half a minute for nothing.
      if (context.isFinalAttempt || isPermanentFailure(error)) {
        await this.pipeline.fail(doc.id, this.step, (error as Error).message);
      }
      throw error;
    }
  }

  private async storeThumbnail(
    documentId: string,
    pdf: Buffer,
  ): Promise<string | null> {
    try {
      const image = await this.pdf.renderThumbnail(pdf);
      if (!image) return null;
      const stored = await this.storage.put({
        key: `documents/${documentId}/thumbnail.png`,
        body: image,
        mimeType: 'image/png',
      });
      return stored.ref;
    } catch (error) {
      this.logger.warn(
        `${documentId}: thumbnail failed — ${(error as Error).message}`,
      );
      return null;
    }
  }
}
