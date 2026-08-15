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
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  PipelineRunRepository,
  PrerequisiteDraft,
  SummaryRepository,
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
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
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
      await this.pipeline.markReadyIfComplete(doc.id);
      return;
    }

    const pageCount = doc.props.pageCount ?? 0;

    try {
      // An imported document arrives knowing its own structure: the docs
      // site's nav, recorded as chapter page ranges at typesetting time.
      // Ground truth beats inference, so the outline call is skipped and only
      // prerequisites still go to the model — against the real chapter list.
      const seeded = this.seededTopics(doc, pageCount);
      if (seeded) {
        const prerequisites = await this.prerequisitesFor(doc.id, seeded);
        await this.topics.replaceAll(
          doc.id,
          seeded.map((topic, index) => ({
            ...topic,
            orderIndex: index,
            prerequisites: prerequisites[index],
          })),
          'outline_pass',
        );
        await this.succeed(job);
        await this.events.publish(doc.id, {
          type: 'document.topics_ready',
          topicCount: seeded.length,
        });
        await this.pipeline.markReadyIfComplete(doc.id);
        return;
      }

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

      const prerequisites = await this.prerequisitesFor(doc.id, topics);

      await this.topics.replaceAll(
        doc.id,
        topics.map((topic, index) => ({
          ...topic,
          orderIndex: index,
          prerequisites: prerequisites[index],
        })),
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
   * What each chapter assumes the reader knows, aligned to the topics array.
   *
   * A second, separate model call rather than part of the outline call: the
   * outline's job is segmentation and mixing concerns degrades both. Any
   * failure here returns empty lists — prerequisites are an aid, and losing
   * them must never cost the document its topics.
   */
  private async prerequisitesFor(
    documentId: string,
    topics: { title: string; shortDescription: string | null }[],
  ): Promise<PrerequisiteDraft[][]> {
    const empty = topics.map(() => [] as PrerequisiteDraft[]);
    // One chapter assumes nothing before it worth a model call.
    if (topics.length < 2) return empty;

    try {
      const summary = await this.summaries.find(documentId);
      const result = await this.llm.outlinePrerequisites({
        summary,
        chapters: topics.map((topic) => ({
          title: topic.title,
          description: topic.shortDescription,
        })),
      });

      await this.calls.record({
        documentId,
        task: 'topics_prereqs',
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });

      const drafts = empty.map(() => [] as PrerequisiteDraft[]);
      for (const row of result.value) {
        const index = row.chapter - 1;
        if (index < 0 || index >= topics.length) continue;
        if (drafts[index].length >= 3) continue;

        // "Covered by" must point strictly earlier; anything else the model
        // claims — itself, a later chapter, out of range — is really an
        // external assumption wearing the wrong label.
        const coveredIndex = row.coveredByChapter - 1;
        const internal = coveredIndex >= 0 && coveredIndex < index;

        // The one instruction models keep ignoring: a chapter's own subject
        // is not its prerequisite. Enforced lexically — when most of the
        // concept's words are the chapter title, it is the chapter.
        if (isOwnSubject(row.concept, topics[index].title)) continue;

        drafts[index].push({
          concept: row.concept.trim().slice(0, 300),
          why: row.why.trim().slice(0, 600),
          kind: internal ? 'internal' : 'external',
          coveredByIndex: internal ? coveredIndex : null,
        });
      }
      return drafts;
    } catch (error) {
      this.logger.warn(
        `${documentId}: prerequisites unavailable — ${(error as Error).message}`,
      );
      return empty;
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
  /**
   * The chapter ranges an import recorded while typesetting, as topics —
   * clamped to the converted page count, since the two were measured by
   * different tools and pdf.js's answer is the one the reader lives in.
   */
  private seededTopics(
    doc: {
      props: {
        source: string;
        importManifest: {
          chapters:
            { title: string; startPage: number; endPage: number }[] | null;
        } | null;
      };
    },
    pageCount: number,
  ) {
    if (doc.props.source !== 'imported') return null;
    const chapters = doc.props.importManifest?.chapters;
    if (!chapters?.length || pageCount === 0) return null;

    return chapters.map((chapter) => ({
      title: chapter.title.slice(0, 500),
      shortDescription: null,
      startPage: Math.min(Math.max(1, chapter.startPage), pageCount),
      endPage: Math.min(
        Math.max(1, chapter.startPage, chapter.endPage),
        pageCount,
      ),
    }));
  }

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

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'and',
  'or',
  'for',
  'how',
  'what',
  'why',
  'with',
  'its',
  'their',
  'basic',
  'basics',
  'role',
  'concept',
  'understanding',
  'introduction',
  'process',
]);

const contentWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

/**
 * True when a claimed prerequisite is really the chapter's own subject —
 * "thyroid hormone synthesis" offered as a prerequisite for "Thyroid Hormone
 * Biosynthesis". Word overlap with loose stemming (one word containing the
 * other covers synthesis/biosynthesis, hormone/hormones).
 */
export function isOwnSubject(concept: string, chapterTitle: string): boolean {
  const conceptWords = contentWords(concept);
  const titleWords = contentWords(chapterTitle);
  if (!conceptWords.length || !titleWords.length) return false;

  const matches = conceptWords.filter((word) =>
    titleWords.some(
      (title) =>
        title === word ||
        (word.length > 3 && title.includes(word)) ||
        (title.length > 3 && word.includes(title)),
    ),
  ).length;

  return matches / conceptWords.length >= 0.5;
}
