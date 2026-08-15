import { Inject, Injectable } from '@nestjs/common';
import type { RecapDto } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { effectiveProfile } from '../../domain/learning';
import { profileInstructions } from '../../domain/values/learner-profile';
import { LLM_GATEWAY } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import {
  ASSESSMENT_REPOSITORY,
  CHAT_REPOSITORY,
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  RECAP_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { ChatRepository } from '../../repositories/chat.repository';
import type {
  AssessmentRepository,
  DocumentLearningStateRepository,
  LearnerProfileRepository,
} from '../../repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../repositories/learning.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import type { RecapRecord, RecapRepository } from '../../repositories/recap.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

/**
 * How much of the session's text goes into the prompt.
 *
 * A long sitting can cover fifty pages; sending all of them would cost more
 * than the recap is worth and bury the through-line. The window is trimmed
 * from the *start* — the end of a session is what a reader is least sure of,
 * and what they are about to carry into the next one.
 */
const MAX_RECAP_PAGES = 16;
const MAX_PAGE_CHARS = 1400;
const MAX_QUESTIONS = 12;
const HISTORY_LOOKBACK = 40;
const MAX_RECAPS = 20;

const toDto = (recap: RecapRecord): RecapDto => ({
  id: recap.id,
  fromPage: recap.fromPage,
  toPage: recap.toPage,
  body: recap.body,
  createdAt: recap.createdAt.toISOString(),
});

export interface CreateRecapRequest {
  userId: string;
  documentId: string;
  fromPage: number;
  toPage: number;
  /** Start of the sitting, as the client saw it. */
  since?: string;
}

/**
 * "Wrap up" — what this sitting actually covered.
 *
 * The recap is written from evidence, not from the document: the pages read,
 * the questions asked, how the checks went, what the reader admitted to not
 * knowing. That is the difference between a recap and a summary, and it is
 * why `shaky` can only ever name things that actually went wrong.
 *
 * One model call, stored. Re-opening a recap costs nothing, and a recap of a
 * session that happened is never silently rewritten later.
 */
@Injectable()
export class CreateRecapHandler extends AbstractRequestHandlerTemplate<
  CreateRecapRequest,
  RecapDto
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(RECAP_REPOSITORY) private readonly recaps: RecapRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly pages: SimplifiedPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: CreateRecapRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const pageCount = doc.props.pageCount ?? 0;
    const from = Math.max(1, Math.min(cmd.fromPage, cmd.toPage));
    const to = Math.max(cmd.fromPage, cmd.toPage);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new ValidationError('A recap needs a page range');
    }
    if (pageCount && from > pageCount) {
      throw new ValidationError('That page range is not in this document');
    }

    const since = cmd.since ? new Date(cmd.since) : null;
    if (since && Number.isNaN(since.getTime())) {
      throw new ValidationError('That is not a valid session start');
    }

    // A recap is a model call, so it is metered like the other ones.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    // The tail of the window: the last pages are what the reader is carrying
    // into the next session.
    const windowFrom = Math.max(from, to - MAX_RECAP_PAGES + 1);

    const [pages, topics, history, checks, profile, docState] =
      await Promise.all([
        this.pages.findRange(cmd.documentId, 'standard', windowFrom, to),
        this.topics.listWithReadState(cmd.documentId, cmd.userId),
        this.chat.recent(cmd.documentId, cmd.userId, HISTORY_LOOKBACK),
        this.assessments.recent(cmd.userId, cmd.documentId, 20),
        this.profiles.find(cmd.userId).catch(() => null),
        this.docStates.find(cmd.userId, cmd.documentId).catch(() => null),
      ]);

    const inSession = <T extends { createdAt: Date }>(row: T) =>
      !since || row.createdAt >= since;

    const asked = history.filter((message) => message.role === 'user');
    const questions = asked
      .filter(inSession)
      .slice(-MAX_QUESTIONS)
      .map((message) =>
        message.highlightAction
          ? `[${message.highlightAction}] ${message.quotedText ?? message.text}`
          : message.text,
      );

    const prerequisitesAsked = asked
      .filter(inSession)
      .filter((message) => message.highlightAction === 'prerequisite')
      .map((message) => message.quotedText ?? message.text);

    const recap = await this.llm.writeRecap({
      documentTitle: doc.props.title,
      fromPage: windowFrom,
      toPage: to,
      pages: pages
        .filter((page) => page.blocks?.length)
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((page) => ({
          pageNumber: page.pageNumber,
          text: (page.blocks ?? [])
            .map((block) => block.text.replace(/\*\*/g, ''))
            .join(' ')
            .slice(0, MAX_PAGE_CHARS),
        })),
      topics: topics
        .filter((topic) => topic.endPage >= windowFrom && topic.startPage <= to)
        .map((topic) => ({
          title: topic.title,
          startPage: topic.startPage,
          endPage: topic.endPage,
        })),
      questions,
      checks: checks
        .filter(inSession)
        .map((event) => ({ kind: event.kind, score: event.score })),
      prerequisitesAsked,
      profile: profileInstructions(
        effectiveProfile(profile ?? DEFAULT_LEARNER_PROFILE, docState),
        'written',
      ),
    });

    const saved = await this.recaps.create({
      documentId: cmd.documentId,
      userId: cmd.userId,
      fromPage: windowFrom,
      toPage: to,
      since,
      body: recap.value,
    });

    return CommandResponse.of(toDto(saved));
  }
}

export interface ListRecapsRequest {
  userId: string;
  documentId: string;
  limit?: number;
}

@Injectable()
export class ListRecapsHandler extends AbstractRequestHandlerTemplate<
  ListRecapsRequest,
  RecapDto[]
> {
  constructor(
    @Inject(RECAP_REPOSITORY) private readonly recaps: RecapRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListRecapsRequest) {
    await this.access.require(cmd.documentId, cmd.userId);
    const limit = Math.min(Math.max(cmd.limit ?? 5, 1), MAX_RECAPS);
    const recaps = await this.recaps.list(cmd.documentId, cmd.userId, limit);
    return CommandResponse.of(recaps.map(toDto));
  }
}
