import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { EVENT_BUS, PDF_TOOLKIT, STORAGE } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { PdfToolkitPort } from '../../business/ports/pdf-toolkit.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
} from '../../business/repositories/tokens';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { PipelineRunRepository } from '../../business/repositories/misc.repository';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { BaseJobData } from '../queues';
import { BasePipelineProcessor, type JobContext } from './base.processor';

/**
 * Pulls per-page text out of the canonical PDF (§4.3).
 *
 * This is also where a scan is detected: if most pages have almost no text
 * there is nothing to simplify, and the document is flagged so the reader opens
 * as a plain viewer with an explanation rather than failing outright.
 */
@Injectable()
export class ExtractProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'extract';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
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
      const ref = doc.props.canonicalPdfRef;
      if (!ref) throw new Error('No canonical PDF to extract from');

      const extracted = await this.pdf.extractPages(
        await this.storage.get(ref),
      );
      await this.pages.replaceAll(doc.id, extracted);

      const empty = extracted.filter((page) => page.isEmpty).length;
      doc.markExtracted(empty, extracted.length);
      await this.documents.save(doc);

      if (doc.props.simplificationUnavailable) {
        this.logger.log(
          `${doc.id}: ${empty}/${extracted.length} pages have no text — treating as a scan`,
        );
      }

      await this.succeed(job);
      await this.events.publish(doc.id, {
        type: 'document.extracted',
        pageCount: extracted.length,
      });
      await this.pipeline.afterExtract(doc.id, doc.contentVersion);
    } catch (error) {
      if (context.isFinalAttempt) {
        await this.pipeline.fail(doc.id, this.step, (error as Error).message);
      }
      throw error;
    }
  }
}
