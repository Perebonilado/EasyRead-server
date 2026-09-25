import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { SummaryRepository } from '../../business/repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import { checkNote, settleNote } from '../../business/domain/maths-work';
import { PipelineOrchestrator } from '../orchestrator.service';
import { LectureFollowService } from './lecture-follow.service';
import type { SimplifyJobData } from '../queues';
import type { JobContext } from './base.processor';
import { Logger } from '@nestjs/common';

/**
 * One page, one job (§4.5).
 *
 * The unit of work is deliberately a single page: a page that fails leaves the
 * other 299 intact and costs one retry to fix, and the reader can start on
 * page 1 while page 40 is still being written. This is the throughput knob for
 * the whole product.
 */
@Injectable()
export class SimplifyPageProcessor {
  private readonly logger = new Logger(SimplifyPageProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly pipeline: PipelineOrchestrator,
    private readonly follows: LectureFollowService,
  ) {}

  async process(job: SimplifyJobData, context: JobContext): Promise<void> {
    // A job queued before the easiest note was removed (migration 0046)
    // has nothing to write; this guard goes after the next release.
    if ((job as { level?: string }).level === 'easiest') return;
    const { documentId, pageNumber } = job;

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== job.contentVersion) return;

    // Per-page idempotency: a page already written is never rewritten, which
    // is what makes the whole fan-out safe to replay.
    const existing = await this.simplified.find(documentId, pageNumber);
    if (existing?.status === 'done') return;

    await this.simplified.markProcessing(documentId, pageNumber);

    try {
      const page = await this.pages.findOne(documentId, pageNumber);

      // A figure-only page has nothing to rewrite. It's recorded as done with
      // no blocks so the reader shows the original image side by side rather
      // than an endless skeleton (§4.3).
      if (!page || page.isEmpty) {
        await this.simplified.markDone({
          documentId,
          pageNumber,
          blocks: [],
          model: null,
          tokensIn: null,
          tokensOut: null,
        });
        await this.announce(documentId, pageNumber);
        return;
      }

      const summary = await this.summaries.find(documentId);
      const maths = page.hasMaths;
      const task = maths ? 'simplify_maths' : 'simplify_standard';
      const ask = { pageText: page.text, summary, pageNumber, maths };
      let result = await this.llm.simplifyPage(ask);
      await this.record(documentId, task, result.usage);
      let blocks = result.value;

      // A maths page's working is checked by code: a wrong line, a lost
      // number, goes back once; what is still wrong after that is cut at
      // its last true line, so no wrong line reaches the reader.
      if (maths) {
        const problems = checkNote(blocks, page.text);
        if (problems.length) {
          this.logger.warn(
            `${documentId} p${pageNumber}: the maths goes back: ${problems.slice(0, 3).join(' ')}`,
          );
          const second = await this.llm.simplifyPage({
            ...ask,
            previous: blocks,
            problems,
          });
          await this.record(documentId, task, second.usage);
          if (checkNote(second.value, page.text).length <= problems.length) {
            blocks = second.value;
            result = second;
          }
        }
        blocks = settleNote(blocks, page.text);
      }

      await this.simplified.markDone({
        documentId,
        pageNumber,
        blocks,
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
      });

      await this.announce(documentId, pageNumber);
    } catch (error) {
      const message = (error as Error).message;

      if (!context.isFinalAttempt) {
        this.logger.warn(
          `${documentId} p${pageNumber} failed, retrying — ${message}`,
        );
        throw error;
      }

      // Out of retries: record the failure on the page and let the rest of the
      // document finish. The reader offers a per-page retry (FR-1.5).
      const attempts = await this.simplified.markFailed(
        documentId,
        pageNumber,
        message,
      );
      await this.calls.record({
        documentId,
        task: 'simplify_standard',
        model: 'unknown',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        outcome: 'failed',
      });
      await this.events.publish(documentId, {
        type: 'page.simplify_failed',
        pageNumber,
        attempts,
      });
      await this.pipeline.afterSimplifyPage(documentId);
    }
  }

  private async record(
    documentId: string,
    task: 'simplify_standard' | 'simplify_maths',
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    },
  ) {
    await this.calls.record({
      documentId,
      task,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }

  private async announce(documentId: string, pageNumber: number) {
    await this.events.publish(documentId, {
      type: 'page.simplified',
      pageNumber,
    });
    await this.pipeline.afterSimplifyPage(documentId);
    // A lecture already written for this page followed the old note; its
    // tracks are matched again on the new one. Never on the page's path.
    const doc = await this.documents.findById(documentId);
    if (doc) {
      await this.follows
        .retrackPage(documentId, doc.contentVersion, pageNumber)
        .catch((error: Error) =>
          this.logger.warn(
            `${documentId} p${pageNumber}: tracks not rebuilt after the note: ${error.message}`,
          ),
        );
    }
  }
}
