import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { EVENT_BUS, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { LlmGatewayPort, TopicDraft } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  PipelineRunRepository,
  TopicRepository,
} from '../../business/repositories/misc.repository';
import { PipelineOrchestrator } from '../orchestrator.service';
import type { BaseJobData } from '../queues';
import { BasePipelineProcessor, type JobContext } from './base.processor';
import { buildDigest } from './digest';

const MAX_PAGES = 5_000;

/**
 * Splits the document into readable topics (PRD FR-3).
 *
 * Topics are advisory navigation, not structure the reader depends on, so a
 * failure here is skipped rather than failing the document — losing the topic
 * list is far better than losing the document.
 */
@Injectable()
export class TopicsProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'topics';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  async process(job: BaseJobData, context: JobContext): Promise<void> {
    const doc = await this.begin(job);
    if (!doc) return;

    const pageCount = doc.props.pageCount ?? 0;

    try {
      const digest = buildDigest(
        await this.pages.findRange(doc.id, 1, MAX_PAGES),
      );
      if (!digest || pageCount === 0) {
        await this.runs.skip(doc.id, this.step);
        return;
      }

      const result = await this.llm.outlineTopics({ digest, pageCount });
      const topics = this.clamp(result.value, pageCount);

      await this.calls.record({
        documentId: doc.id,
        task: 'topics_outline',
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });

      if (!topics.length) {
        await this.runs.skip(doc.id, this.step);
        return;
      }

      await this.topics.replaceAll(
        doc.id,
        topics.map((topic, index) => ({ ...topic, orderIndex: index })),
        'outline_pass',
      );

      await this.succeed(job);
      await this.events.publish(doc.id, {
        type: 'document.topics_ready',
        topicCount: topics.length,
      });
      await this.pipeline.markReadyIfComplete(doc.id);
    } catch (error) {
      if (context.isFinalAttempt) {
        this.logger.warn(
          `${doc.id}: topics unavailable — ${(error as Error).message}`,
        );
        await this.runs.skip(doc.id, this.step);
        return;
      }
      throw error;
    }
  }

  /**
   * Makes the model's ranges usable as navigation.
   *
   * Three things go wrong in practice and none can be fixed by asking the
   * prompt more firmly: ranges past the end of the document, ranges out of
   * order, and — the one that actually hurts — gaps. The prompt asks for
   * contiguous coverage and the model still leaves pages belonging to no
   * topic, which means a reader navigating by topic simply cannot reach them.
   *
   * So coverage is enforced here: each topic runs up to the page before the
   * next one starts, the first starts at page 1, and the last runs to the end.
   * Overlaps resolve the same way, in favour of the later topic's start.
   */
  private clamp(drafts: TopicDraft[], pageCount: number) {
    const topics = drafts
      .map((draft) => {
        const start = Math.min(
          Math.max(1, Math.floor(draft.startPage)),
          pageCount,
        );
        const end = Math.min(
          Math.max(start, Math.floor(draft.endPage)),
          pageCount,
        );
        return {
          title: draft.title.slice(0, 500),
          shortDescription: draft.shortDescription?.slice(0, 500) ?? null,
          startPage: start,
          endPage: end,
        };
      })
      .filter((topic) => topic.title.trim().length > 0)
      .sort((a, b) => a.startPage - b.startPage);

    // Two topics claiming the same start page can't both be navigated to, and
    // would overlap whatever we did with the ends. Keep the first.
    const distinct = topics.filter(
      (topic, index) =>
        index === 0 || topic.startPage > topics[index - 1].startPage,
    );
    if (!distinct.length) return distinct;

    distinct[0].startPage = 1;
    for (let index = 0; index < distinct.length; index++) {
      const next = distinct[index + 1];
      distinct[index].endPage = next ? next.startPage - 1 : pageCount;
    }

    return distinct;
  }
}
