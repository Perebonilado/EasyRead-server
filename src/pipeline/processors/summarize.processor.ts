import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { LLM_GATEWAY } from '../../business/ports/tokens';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  SUMMARY_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  PipelineRunRepository,
  SummaryRepository,
} from '../../business/repositories/misc.repository';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { BaseJobData } from '../queues';
import { BasePipelineProcessor, type JobContext } from './base.processor';
import { buildDigest } from './digest';

const MAX_PAGES = 5_000;

/**
 * One document-level summary, used as context by every later model call (§4.4).
 *
 * It's what keeps per-page simplification coherent: without it, page 40 gets
 * rewritten with no idea that the document is a pharmacology lecture, and
 * technical terms get "simplified" into nonsense.
 */
@Injectable()
export class SummarizeProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'summarize';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
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
      await this.pipeline.afterSummarize(doc.id, doc.contentVersion);
      return;
    }

    try {
      const pages = await this.pages.findRange(doc.id, 1, MAX_PAGES);
      const digest = buildDigest(pages);

      // Nothing to read: a scan still needs the step closed so the pipeline
      // can move on rather than waiting for a summary that will never arrive.
      if (!digest) {
        await this.runs.skip(doc.id, this.step);
        await this.pipeline.afterSummarize(doc.id, doc.contentVersion);
        return;
      }

      const result = await this.llm.summarize({
        title: doc.props.title,
        text: digest,
      });
      await this.summaries.upsert(doc.id, result.value, result.usage.model);
      await this.log(doc.id, result.usage, 'ok');

      await this.succeed(job);
      await this.pipeline.afterSummarize(doc.id, doc.contentVersion);
    } catch (error) {
      if (context.isFinalAttempt) {
        await this.pipeline.fail(doc.id, this.step, (error as Error).message);
      }
      throw error;
    }
  }

  private async log(
    documentId: string,
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    },
    outcome: 'ok' | 'failed',
  ) {
    await this.calls.record({
      documentId,
      task: 'summarize',
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      outcome,
    });
  }
}
