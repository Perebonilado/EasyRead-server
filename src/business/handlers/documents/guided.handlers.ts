import { Inject, Injectable } from '@nestjs/common';
import type {
  QuestionCheckResponse,
  RecallGradeResponse,
  TopicPreviewResponse,
  TranscribeResponse,
} from '../../../contracts';
import {
  DocumentNotReadyError,
  NotFoundError,
} from '../../domain/errors/errors';
import { LLM_GATEWAY, TRANSCRIPTION, VECTOR_STORE } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { TranscriptionPort } from '../../ports/voice.port';
import type { VectorStorePort } from '../../ports/vector-store.port';
import {
  AI_CALL_LOG_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_PREVIEW_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type {
  SummaryRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { TopicPreviewRepository } from '../../repositories/preview.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { blocksToProse } from './voice.handlers';

/**
 * Guided reading's server surfaces (guided-reading plan, Phase 0).
 *
 * Four capabilities the solo flow leans on: the AI-written chapter preview
 * (cached — one call per chapter ever), the independent grade of a
 * book-closed recall, the verdict on a reader answering their own question,
 * and speech-to-text so any of those can be spoken instead of typed.
 */

/** Shared: a topic owned by this user, or NotFound. */
async function requireTopic(
  topics: TopicRepository,
  documentId: string,
  userId: string,
  topicId: string,
) {
  const all = await topics.listWithReadState(documentId, userId);
  const topic = all.find((t) => t.id === topicId);
  if (!topic) throw new NotFoundError('Topic');
  return topic;
}

/** Shared: the chapter's simplified text, capped the way the quiz caps it. */
async function chapterText(
  simplified: SimplifiedPageRepository,
  documentId: string,
  startPage: number,
  endPage: number,
): Promise<string> {
  const pages = await simplified.findRange(
    documentId,
    'standard',
    startPage,
    endPage,
  );
  const text = pages
    .filter((page) => page.status === 'done' && page.blocks?.length)
    .map((page) => blocksToProse(page.blocks ?? []))
    .join('\n\n')
    .slice(0, 24_000);
  if (!text) {
    throw new DocumentNotReadyError(
      "This chapter hasn't been simplified yet — try again once it has",
    );
  }
  return text;
}

export interface TopicPreviewRequest {
  userId: string;
  documentId: string;
  topicId: string;
}

/**
 * The skim ritual's material: a preview of one chapter, written for
 * comprehension. Generated on the first request and cached per topic — the
 * preview derives from the document alone, so every reader shares it.
 */
@Injectable()
export class GetTopicPreviewHandler extends AbstractRequestHandlerTemplate<
  TopicPreviewRequest,
  TopicPreviewResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(TOPIC_PREVIEW_REPOSITORY)
    private readonly previews: TopicPreviewRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: TopicPreviewRequest) {
    await this.access.require(cmd.documentId, cmd.userId);
    const topic = await requireTopic(
      this.topics,
      cmd.documentId,
      cmd.userId,
      cmd.topicId,
    );

    const cached = await this.previews.find(topic.id);
    if (cached) {
      return CommandResponse.of({
        topicId: topic.id,
        body: cached,
        cached: true,
      });
    }

    const pagesText = await chapterText(
      this.simplified,
      cmd.documentId,
      topic.startPage,
      topic.endPage,
    );
    const summary = await this.summaries.find(cmd.documentId);

    const result = await this.llm.generateTopicPreview({
      topicTitle: topic.title,
      pagesText,
      summary,
    });

    await this.previews.save({
      documentId: cmd.documentId,
      topicId: topic.id,
      body: result.value,
    });
    await this.calls.record({
      documentId: cmd.documentId,
      task: 'preview',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of({
      topicId: topic.id,
      body: result.value,
      cached: false,
    });
  }
}

export interface RecallGradeRequest {
  userId: string;
  documentId: string;
  topicId: string;
  recall: string;
}

/**
 * The independent measure behind predict-then-grade: the reader predicted
 * first (recorded client-side as confidence), and this grades the recall
 * against the chapter itself. The prediction is deliberately not an input —
 * an independent grade it could anchor on is not independent.
 */
@Injectable()
export class GradeRecallHandler extends AbstractRequestHandlerTemplate<
  RecallGradeRequest,
  RecallGradeResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RecallGradeRequest) {
    await this.access.require(cmd.documentId, cmd.userId);
    const topic = await requireTopic(
      this.topics,
      cmd.documentId,
      cmd.userId,
      cmd.topicId,
    );
    const pagesText = await chapterText(
      this.simplified,
      cmd.documentId,
      topic.startPage,
      topic.endPage,
    );

    const result = await this.llm.gradeRecall({
      topicTitle: topic.title,
      pagesText,
      recall: cmd.recall,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'recall_grade',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of(result.value);
  }
}

export interface QuestionCheckRequest {
  userId: string;
  documentId: string;
  question: string;
  answer: string;
}

/**
 * The verdict on a reader answering their own pre-reading question, grounded
 * in retrieved passages — the dedicated replacement for v1's chat-prefill
 * hop. The student answers first; the document judges second.
 */
@Injectable()
export class CheckQuestionAnswerHandler extends AbstractRequestHandlerTemplate<
  QuestionCheckRequest,
  QuestionCheckResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: QuestionCheckRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const summary = await this.summaries.find(cmd.documentId);
    // Retrieve on question + answer together: the question finds where the
    // document answers it, the answer catches passages about what the reader
    // actually said — both matter to the verdict.
    const [embedding] = (
      await this.llm.embed({ texts: [`${cmd.question}\n${cmd.answer}`] })
    ).value;
    const chunks = await this.vectors.query({
      documentId: cmd.documentId,
      embedding,
      topK: 6,
    });
    const context = chunks
      .map((chunk) => `[p.${chunk.pageNumber}] ${chunk.text}`)
      .join('\n\n');

    const result = await this.llm.checkQuestionAnswer({
      question: cmd.question,
      answer: cmd.answer,
      context,
      summary,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'question_check',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    // 0 is the schema's "can't place it"; the contract says null.
    const { page, ...rest } = result.value;
    return CommandResponse.of({ ...rest, page: page > 0 ? page : null });
  }
}

export interface TranscribeRequest {
  userId: string;
  documentId: string;
  audio: Buffer;
  mimeType: string;
}

/**
 * Speech-to-text for voice input. The transcript goes back to the reader for
 * review before anything grades it — this handler never grades, never
 * stores, and keeps no audio.
 */
@Injectable()
export class TranscribeAudioHandler extends AbstractRequestHandlerTemplate<
  TranscribeRequest,
  TranscribeResponse
> {
  constructor(
    @Inject(TRANSCRIPTION) private readonly stt: TranscriptionPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: TranscribeRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const started = Date.now();
    const result = await this.stt.transcribe({
      audio: cmd.audio,
      mimeType: cmd.mimeType,
    });

    // Tokens don't apply to STT; the ledger still gets the call.
    await this.calls.record({
      documentId: cmd.documentId,
      task: 'transcribe',
      model: result.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: Date.now() - started,
      outcome: 'ok',
    });

    return CommandResponse.of({ text: result.text });
  }
}
