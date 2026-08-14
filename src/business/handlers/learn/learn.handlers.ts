import { Inject, Injectable } from '@nestjs/common';
import type {
  LearnDepth,
  LearnInterviewResponse,
  DocumentBrief,
} from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { JOB_QUEUE, LLM_GATEWAY } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import {
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { Document } from '../../domain/entities/document';
import type { PipelineRunRepository } from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import { NEXT_DEPTH } from '../../../pipeline/processors/learn.processor';
import { DocumentAccessService } from '../documents/document-access.service';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { EntitlementsService } from '../documents/entitlements.service';

const MIN_TOPIC = 2;
const MAX_TOPIC = 120;
const MAX_GOAL = 200;

export interface InterviewRequest {
  userId: string;
  topic: string;
}

/**
 * The questions worth asking before writing about this topic.
 *
 * Deliberately a model call rather than a fixed form: the one question that
 * changes how you write about organic chemistry is not the one that changes
 * how you write about the French Revolution, and we only get to ask three.
 */
@Injectable()
export class InterviewHandler extends AbstractRequestHandlerTemplate<
  InterviewRequest,
  LearnInterviewResponse
> {
  constructor(@Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort) {
    super();
  }

  protected async handleRequest(cmd: InterviewRequest) {
    const topic = cleanTopic(cmd.topic);
    const result = await this.llm.interviewForTopic({ topic });
    return CommandResponse.of({
      topic: result.value.topic || topic,
      questions: result.value.questions,
    });
  }
}

export interface GenerateRequest {
  userId: string;
  topic: string;
  depth: LearnDepth;
  answers?: Record<string, string>;
  goal?: string;
}

/**
 * Commissions a document and returns immediately.
 *
 * The document row exists from this moment, in `uploading`, so the client can
 * navigate straight to the reader and watch the same processing screen an
 * upload shows. The writing itself is minutes of model calls and belongs on a
 * queue, not on the end of an HTTP request.
 */
@Injectable()
export class GenerateDocumentHandler extends AbstractRequestHandlerTemplate<
  GenerateRequest,
  { documentId: string }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: GenerateRequest) {
    const topic = cleanTopic(cmd.topic);
    const goal = cmd.goal?.trim().slice(0, MAX_GOAL) || null;

    // A generated document is a document: it takes a monthly slot like any
    // other, booked before anything is created so the gate can refuse first.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.DOCUMENTS_UPLOADED,
      (e) => e.assertCanUpload(0),
    );

    const brief: DocumentBrief = {
      topic,
      depth: cmd.depth,
      answers: cmd.answers ?? {},
      goal,
    };

    let document: Document;
    try {
      document = await this.documents.create({
        userId: cmd.userId,
        title: topic,
        fileName: `${topic}.pdf`,
        sourceMimeType: 'application/pdf',
        sizeBytes: 0,
        source: 'generated',
        brief,
      });
    } catch (error) {
      await this.entitlements.release(
        cmd.userId,
        UsageMetric.DOCUMENTS_UPLOADED,
      );
      throw error;
    }

    await this.queue.enqueueLearn({
      documentId: document.id,
      contentVersion: document.contentVersion,
    });

    return CommandResponse.of({ documentId: document.id });
  }
}

function cleanTopic(raw: string): string {
  const topic = raw.trim().replace(/\s+/g, ' ');
  if (topic.length < MIN_TOPIC || topic.length > MAX_TOPIC) {
    throw new ValidationError(
      `Give a topic between ${MIN_TOPIC} and ${MAX_TOPIC} characters`,
    );
  }
  return topic;
}

export interface ExpandRequest {
  userId: string;
  documentId: string;
}

/**
 * Rewrites a generated document at greater length, covering what it said it
 * had no room for.
 *
 * The document is rewritten in place rather than a second one appearing
 * beside it: the reader asked for *this* document to go further, and a
 * library with "X" and "X (longer)" in it is a worse answer than one good
 * document. The rewrite reuses the ordinary pipeline — the only thing that
 * makes it possible is clearing the ledger, because a completed step is
 * deliberately never re-run.
 */
@Injectable()
export class ExpandDocumentHandler extends AbstractRequestHandlerTemplate<
  ExpandRequest,
  { documentId: string; depth: LearnDepth }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    private readonly runs: PipelineRunRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ExpandRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const brief = doc.props.brief;
    if (doc.props.source !== 'generated' || !brief) {
      throw new ValidationError('Only documents we wrote can be expanded');
    }

    const depth = NEXT_DEPTH[brief.depth];
    if (!depth) {
      throw new ValidationError(
        'This is already the longest version we write well',
      );
    }

    // Everything derived from the old text either overwrites cleanly on the
    // next run or is dropped here. The ledger has to go, or every step
    // refuses to run a second time.
    await Promise.all([this.runs.reset(doc.id), this.simplified.clear(doc.id)]);

    // Accumulated, and never cleared here. Clearing the list at request time
    // loses it if the rewrite doesn't happen, and the reader is then promised
    // topics that quietly vanish. The processor replaces `furtherTopics` when
    // a rewrite actually finishes and knows what it left out this time.
    const mustCover = [
      ...new Set([...(brief.mustCover ?? []), ...(brief.furtherTopics ?? [])]),
    ];

    doc.startRewrite({ ...brief, depth, mustCover });
    await this.documents.save(doc);

    await this.queue.enqueueLearn({
      documentId: doc.id,
      contentVersion: doc.contentVersion,
    });

    return CommandResponse.of({ documentId: doc.id, depth });
  }
}
