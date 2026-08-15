import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { EVENT_BUS, PDF_TOOLKIT, STORAGE } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { PdfToolkitPort } from '../../business/ports/pdf-toolkit.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PAGE_ASSET_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
} from '../../business/repositories/tokens';
import type { PageAssetRepository } from '../../business/repositories/page-asset.repository';
import { newId } from '../../web/database/uuid';
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
    @Inject(PAGE_ASSET_REPOSITORY)
    private readonly assets: PageAssetRepository,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  async process(job: BaseJobData, context: JobContext): Promise<void> {
    const run = await this.begin(job);
    if (!run) return;
    const { doc } = run;
    if (run.alreadyDone) {
      await this.pipeline.afterExtract(doc.id, doc.contentVersion);
      return;
    }

    try {
      const ref = doc.props.canonicalPdfRef;
      if (!ref) throw new Error('No canonical PDF to extract from');

      const bytes = await this.storage.get(ref);
      const extracted = await this.pdf.extractPages(bytes);
      await this.pages.replaceAll(doc.id, extracted);

      // Figures ride beside the text. Uploaded documents only: imports
      // recorded theirs while typesetting, and re-extracting the embedded
      // copies here would double every one of them. Scanned pages are
      // excluded — their one big image IS the page, and showing it as a
      // "figure" just repeats the original beside the simplified text.
      if (doc.props.source === 'uploaded') {
        const scannedPages = new Set(
          extracted
            .filter((page) => page.isEmpty)
            .map((page) => page.pageNumber),
        );
        await this.extractFigures(
          doc.id,
          doc.contentVersion,
          bytes,
          scannedPages,
        );
      }

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

  /**
   * Best-effort, never fatal: a figure pipeline failure costs the pictures,
   * not the document.
   */
  private async extractFigures(
    documentId: string,
    contentVersion: number,
    pdf: Buffer,
    scannedPages: Set<number>,
  ): Promise<void> {
    try {
      // A rewrite's figures replace the old version's entirely.
      await this.assets.clear(documentId);
      const figures = (await this.pdf.extractFigures(pdf)).filter(
        (figure) => !scannedPages.has(figure.pageNumber),
      );
      const perPageIndex = new Map<number, number>();

      for (const figure of figures) {
        const orderIndex = perPageIndex.get(figure.pageNumber) ?? 0;
        perPageIndex.set(figure.pageNumber, orderIndex + 1);

        const ref = `documents/${documentId}/assets/${newId()}`;
        await this.storage.put({
          key: ref,
          body: figure.png,
          mimeType: 'image/png',
        });
        await this.assets.create({
          documentId,
          contentVersion,
          pageNumber: figure.pageNumber,
          fileRef: ref,
          mimeType: 'image/png',
          width: figure.width,
          height: figure.height,
          caption: null,
          orderIndex,
        });
      }

      if (figures.length) {
        this.logger.log(`${documentId}: kept ${figures.length} figures`);
      }
    } catch (error) {
      this.logger.warn(
        `${documentId}: figure extraction skipped — ${(error as Error).message}`,
      );
    }
  }
}
