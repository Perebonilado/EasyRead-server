import { Inject, Injectable } from '@nestjs/common';
import type { Block, PipelineStep } from '../../contracts';
import { EMPTY_PAGE_CHAR_THRESHOLD } from '../../business/domain/values';
import {
  LLM_GATEWAY,
  OCR_ENGINE,
  PDF_TOOLKIT,
  STORAGE,
} from '../../business/ports/tokens';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type { OcrEnginePort } from '../../business/ports/ocr.port';
import type { PdfToolkitPort } from '../../business/ports/pdf-toolkit.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { PipelineRunRepository } from '../../business/repositories/misc.repository';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { BaseJobData } from '../queues';
import { BasePipelineProcessor, type JobContext } from './base.processor';

/** Vision calls in flight at once for one document. */
const PAGE_CONCURRENCY = 3;

/**
 * Reads scanned pages (§4.3's "no OCR in v1", retired).
 *
 * Two engines, tried in order:
 *
 * 1. Mistral's hosted OCR — the whole document leaves once and every wanted
 *    page comes back as markdown. One network call instead of one vision
 *    request per page, which is the difference between seconds and minutes
 *    on a lecture-sized scan.
 * 2. Per-page vision fallback when no MISTRAL_API_KEY is configured: the
 *    page's image XObject is lifted straight out of the PDF (no canvas) and
 *    transcribed by the vision model. Slower, but the feature never
 *    disappears because a key is missing.
 *
 * Either way the text lands in the page row every later step already reads;
 * downstream, an OCR'd document is just a document. The step degrades, never
 * blocks: a page that can't be read stays empty, and if OCR as a whole keeps
 * failing the document continues as a plain scan — exactly what it would
 * have been without this step.
 */
@Injectable()
export class OcrProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'ocr';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(PDF_TOOLKIT) private readonly pdf: PdfToolkitPort,
    @Inject(OCR_ENGINE) private readonly engine: OcrEnginePort,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  async process(job: BaseJobData, context: JobContext): Promise<void> {
    const run = await this.begin(job);
    if (!run) return;
    const { doc } = run;
    if (run.alreadyDone) {
      await this.pipeline.afterOcr(doc.id, doc.contentVersion);
      return;
    }

    try {
      const ref = doc.props.canonicalPdfRef;
      if (!ref) throw new Error('No canonical PDF to OCR');

      const pageCount = doc.props.pageCount ?? 0;
      const all = await this.pages.findRange(doc.id, 1, pageCount);
      const targets = all.filter((page) => page.isEmpty);

      const bytes = await this.storage.get(ref);
      const pageNumbers = targets.map((page) => page.pageNumber);

      const read = this.engine.isConfigured()
        ? await this.readWithEngine(doc.id, bytes, pageNumbers)
        : await this.readWithVision(doc.id, bytes, pageNumbers);

      const stillEmpty = await this.pages.countEmpty(doc.id);
      doc.refreshAfterOcr(stillEmpty, pageCount);
      await this.documents.save(doc);

      this.logger.log(
        `${doc.id}: OCR read ${read}/${targets.length} pages` +
          (doc.props.simplificationUnavailable
            ? ' — still mostly unreadable, staying viewer-only'
            : ''),
      );

      await this.succeed(job);
      await this.pipeline.afterOcr(doc.id, doc.contentVersion);
    } catch (error) {
      // OCR is an enhancement. Out of retries, the document proceeds as the
      // plain scan it would have been without this step, not as a failure.
      if (context.isFinalAttempt) {
        this.logger.warn(
          `${doc.id}: OCR abandoned — ${(error as Error).message}`,
        );
        await this.runs.skip(doc.id, this.step);
        await this.pipeline.afterOcr(doc.id, doc.contentVersion);
        return;
      }
      throw error;
    }
  }

  /**
   * The fast path: the whole document in one Mistral call. A single failure
   * here fails the attempt (and BullMQ retries the step), because there is
   * nothing per-page to salvage from a dead batch call.
   */
  private async readWithEngine(
    documentId: string,
    bytes: Buffer,
    pageNumbers: number[],
  ): Promise<number> {
    const started = Date.now();
    const results = await this.engine.readPages(bytes, pageNumbers);

    await this.calls.record({
      documentId,
      task: 'ocr_document',
      model: 'mistral:ocr',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - started,
      outcome: 'ok',
    });

    let read = 0;
    for (const page of results) {
      const charCount = page.markdown.replace(/\s/g, '').length;
      if (charCount === 0) continue;
      await this.pages.writeOcrText(
        documentId,
        page.pageNumber,
        page.markdown,
        charCount,
        charCount < EMPTY_PAGE_CHAR_THRESHOLD,
      );
      read += 1;
    }
    return read;
  }

  /** The fallback: one vision call per page, a few in flight at once. */
  private async readWithVision(
    documentId: string,
    bytes: Buffer,
    pageNumbers: number[],
  ): Promise<number> {
    this.logger.warn(
      `${documentId}: MISTRAL_API_KEY not set — OCR falling back to per-page vision, which is much slower`,
    );

    const images = await this.pdf.pageImages(bytes, pageNumbers);
    let read = 0;
    const queue = [...images];
    const workers = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, queue.length) },
      async () => {
        for (;;) {
          const image = queue.shift();
          if (!image) return;
          if (await this.readPage(documentId, image)) read += 1;
        }
      },
    );
    await Promise.all(workers);
    return read;
  }

  /** One page. Failure costs that page, nothing else. */
  private async readPage(
    documentId: string,
    image: { pageNumber: number; png: Buffer },
  ): Promise<{ handwritten: boolean } | null> {
    try {
      const result = await this.llm.ocrPage({
        png: image.png,
        pageNumber: image.pageNumber,
      });

      await this.calls.record({
        documentId,
        task: 'ocr_page',
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });

      const text = serialize(result.value.blocks);
      const charCount = text.replace(/\s/g, '').length;
      if (charCount === 0) return null;

      await this.pages.writeOcrText(
        documentId,
        image.pageNumber,
        text,
        charCount,
        charCount < EMPTY_PAGE_CHAR_THRESHOLD,
      );
      return { handwritten: result.value.handwritten };
    } catch (error) {
      this.logger.warn(
        `${documentId} p${image.pageNumber}: OCR failed — ${(error as Error).message}`,
      );
      return null;
    }
  }
}

/**
 * Blocks → the plain text the rest of the pipeline reads. Structure survives
 * as convention: bullets keep their dash, tables keep their pipes — the same
 * signals the simplify model already reconstructs from.
 */
function serialize(blocks: Block[]): string {
  return blocks
    .map((block) =>
      block.type === 'bullet'
        ? // The model sometimes keeps the page's own dash in the text; one
          // marker is structure, two is stutter.
          `- ${block.text.replace(/^[-•*]\s+/, '')}`
        : block.text,
    )
    .join('\n')
    .trim();
}
