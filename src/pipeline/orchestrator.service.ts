import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Level, PipelineStep } from '../contracts';
import { EVENT_BUS, JOB_QUEUE } from '../business/ports/tokens';
import type { EventBusPort } from '../business/ports/event-bus.port';
import type { JobQueuePort } from '../business/ports/job-queue.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../business/repositories/tokens';
import type { DocumentPageRepository } from '../business/repositories/document-page.repository';
import type { DocumentRepository } from '../business/repositories/document.repository';
import type { PipelineRunRepository } from '../business/repositories/misc.repository';
import type { SimplifiedPageRepository } from '../business/repositories/simplified-page.repository';

/**
 * Explicit orchestration, not a workflow engine.
 *
 * Each job, on success, asks this service what to run next; it checks the
 * PipelineRun ledger for the dependencies and enqueues only what is now
 * unblocked. The graph is small enough that being able to read it in one place
 * beats the indirection of a generic engine (technical design §4.1):
 *
 *   uploaded ─► convert ─► extract ─┬─► summarize ─► simplify(standard, per page)
 *                                   ├─► topics   (also needs summarize)
 *                                   └─► embed
 */
@Injectable()
export class PipelineOrchestrator {
  private readonly logger = new Logger(PipelineOrchestrator.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    private readonly runs: PipelineRunRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  /** Entry point: called the moment the client confirms the bytes landed. */
  async start(documentId: string, contentVersion: number): Promise<void> {
    await this.queue.enqueueStep('convert', { documentId, contentVersion });
    await this.events.publish(documentId, {
      type: 'document.status',
      status: 'processing',
    });
  }

  async afterConvert(
    documentId: string,
    contentVersion: number,
  ): Promise<void> {
    await this.queue.enqueueStep('extract', { documentId, contentVersion });
  }

  /**
   * Extract unblocks the rest — unless some pages came back empty, in which
   * case OCR gets a chance to read them first. Only uploaded documents take
   * the detour: imports and written documents are born digital, so an empty
   * page there is genuinely empty.
   */
  async afterExtract(
    documentId: string,
    contentVersion: number,
  ): Promise<void> {
    const doc = await this.documents.findById(documentId);
    const empty = await this.pages.countEmpty(documentId);

    if (doc?.props.source === 'uploaded' && empty > 0) {
      this.logger.log(
        `${documentId}: ${empty} pages without text — routing through OCR`,
      );
      await this.queue.enqueueStep('ocr', { documentId, contentVersion });
      return;
    }

    await this.afterOcr(documentId, contentVersion);
  }

  /**
   * Summarize and embed can both start immediately; topics waits because it
   * wants the summary as context. Named after OCR because that's the step
   * whose completion (or absence) gates it.
   */
  async afterOcr(documentId: string, contentVersion: number): Promise<void> {
    await this.queue.enqueueStep('summarize', { documentId, contentVersion });
    await this.queue.enqueueStep('embed', { documentId, contentVersion });
  }

  async afterSummarize(
    documentId: string,
    contentVersion: number,
  ): Promise<void> {
    if (await this.runs.allDone(documentId, ['extract'])) {
      await this.queue.enqueueStep('topics', { documentId, contentVersion });
    }
    await this.fanOutSimplify(documentId, contentVersion, 'standard');
  }

  /**
   * Fan-out: one job per page, enqueued in page order. Rows are pre-created as
   * `pending` first so the reader can render skeletons for pages that haven't
   * been written yet, and so progress is queryable before any job runs.
   */
  async fanOutSimplify(
    documentId: string,
    contentVersion: number,
    level: Level,
  ): Promise<void> {
    const doc = await this.documents.findById(documentId);
    if (!doc?.props.pageCount) return;

    // A scan has no text to simplify; the reader still opens as a viewer.
    if (doc.props.simplificationUnavailable) {
      await this.runs.skip(documentId, this.stepFor(level));
      this.logger.log(
        `${documentId}: simplification unavailable, skipping ${level}`,
      );
      return;
    }

    const pageCount = doc.props.pageCount;
    await this.simplified.seed(documentId, level, pageCount);

    // Open the ledger row for the aggregate step. Unlike the single-job steps,
    // nothing else claims it — the work is spread across per-page jobs — so
    // without this there would be no row for `afterSimplifyPage` to complete.
    await this.runs.claim(documentId, this.stepFor(level));

    await this.queue.enqueueSimplifyPages(
      Array.from({ length: pageCount }, (_, index) => ({
        documentId,
        contentVersion,
        level,
        pageNumber: index + 1,
      })),
    );
  }

  /**
   * Called after every page job. When the level is fully accounted for, mark
   * the aggregate step done and announce it.
   */
  async afterSimplifyPage(documentId: string, level: Level): Promise<void> {
    const progress = await this.simplified.progress(documentId, level);
    if (
      progress.total === 0 ||
      progress.done + progress.failed < progress.total
    )
      return;

    const step = this.stepFor(level);
    if ((await this.runs.status(documentId, step)) === 'done') return;

    await this.runs.complete(documentId, step);
    await this.events.publish(documentId, {
      type: 'document.simplified',
      level,
    });

    if (level === 'standard') await this.markReadyIfComplete(documentId);
  }

  /**
   * `ready` means the document is fully processed. The reader does not wait for
   * it — it opens as soon as there's a canonical PDF — this is for the library
   * card's status chip.
   */
  async markReadyIfComplete(documentId: string): Promise<void> {
    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.status === 'ready') return;

    const required: PipelineStep[] = [
      'convert',
      'extract',
      'summarize',
      'simplify_standard',
    ];
    if (!(await this.runs.allDone(documentId, required))) return;

    doc.markReady();
    await this.documents.save(doc);
    await this.events.publish(documentId, {
      type: 'document.status',
      status: 'ready',
    });
  }

  /** A failed step fails the document, with the step named for the UI. */
  async fail(
    documentId: string,
    step: PipelineStep,
    reason: string,
  ): Promise<void> {
    await this.runs.fail(documentId, step, reason);
    const doc = await this.documents.findById(documentId);
    if (doc) {
      doc.markFailed(reason);
      await this.documents.save(doc);
    }
    await this.events.publish(documentId, {
      type: 'document.failed',
      step,
      reason,
    });
  }

  private stepFor(level: Level): PipelineStep {
    return level === 'easiest' ? 'simplify_easiest' : 'simplify_standard';
  }
}
