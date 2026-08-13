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
import { PipelineOrchestrator } from '../orchestrator.service';
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
  ) {}

  async process(job: SimplifyJobData, context: JobContext): Promise<void> {
    const { documentId, level, pageNumber } = job;

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== job.contentVersion) return;

    // Per-page idempotency: a page already written is never rewritten, which
    // is what makes the whole fan-out safe to replay.
    const existing = await this.simplified.find(documentId, level, pageNumber);
    if (existing?.status === 'done') return;

    await this.simplified.markProcessing(documentId, level, pageNumber);

    try {
      const page = await this.pages.findOne(documentId, pageNumber);

      // A figure-only page has nothing to rewrite. It's recorded as done with
      // no blocks so the reader shows the original image side by side rather
      // than an endless skeleton (§4.3).
      if (!page || page.isEmpty) {
        await this.simplified.markDone({
          documentId,
          level,
          pageNumber,
          blocks: [],
          model: null,
          tokensIn: null,
          tokensOut: null,
        });
        await this.announce(documentId, pageNumber, level);
        return;
      }

      const summary = await this.summaries.find(documentId);
      const result = await this.llm.simplifyPage({
        task: level === 'easiest' ? 'simplify_easiest' : 'simplify_standard',
        pageText: page.text,
        summary,
        pageNumber,
      });

      await this.simplified.markDone({
        documentId,
        level,
        pageNumber,
        blocks: result.value,
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
      });

      await this.calls.record({
        documentId,
        task: `simplify_${level}`,
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });

      await this.announce(documentId, pageNumber, level);
    } catch (error) {
      const message = (error as Error).message;

      if (!context.isFinalAttempt) {
        this.logger.warn(
          `${documentId} p${pageNumber} (${level}) failed, retrying — ${message}`,
        );
        throw error;
      }

      // Out of retries: record the failure on the page and let the rest of the
      // document finish. The reader offers a per-page retry (FR-1.5).
      const attempts = await this.simplified.markFailed(
        documentId,
        level,
        pageNumber,
        message,
      );
      await this.calls.record({
        documentId,
        task: `simplify_${level}`,
        model: 'unknown',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        outcome: 'failed',
      });
      await this.events.publish(documentId, {
        type: 'page.simplify_failed',
        pageNumber,
        level,
        attempts,
      });
      await this.pipeline.afterSimplifyPage(documentId, level);
    }
  }

  private async announce(
    documentId: string,
    pageNumber: number,
    level: SimplifyJobData['level'],
  ) {
    await this.events.publish(documentId, {
      type: 'page.simplified',
      pageNumber,
      level,
    });
    await this.pipeline.afterSimplifyPage(documentId, level);
  }
}
