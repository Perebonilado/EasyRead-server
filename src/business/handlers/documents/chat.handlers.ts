import { Inject, Injectable } from '@nestjs/common';
import type { ChatHistoryResponse, ChatOrigin } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { expandHighlight } from '../../domain/values/chat';
import { LLM_GATEWAY, VECTOR_STORE } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { VectorStorePort } from '../../ports/vector-store.port';
import {
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  CHAT_REPOSITORY,
  CONCEPT_REPOSITORY,
  SUMMARY_REPOSITORY,
} from '../../repositories/tokens';
import type {
  ChatMessageRecord,
  ChatRepository,
} from '../../repositories/chat.repository';
import type { SummaryRepository } from '../../repositories/misc.repository';
import type { ConceptKnowledgeRepository } from '../../repositories/concept.repository';
import {
  DEFAULT_LEARNER_PROFILE,
  type LearnerProfileRepository,
} from '../../repositories/learning.repository';
import { profileInstructions } from '../../domain/values/learner-profile';
import { effectiveProfile } from '../../domain/learning';
import type { DocumentLearningStateRepository } from '../../repositories/learning.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';
import { StruggleRecorder } from './struggle-recorder.service';

const MIN_TEXT = 2;
const MAX_TEXT = 2000;
const TOP_K = 6;
/** Turns replayed into the next prompt — the thread's working memory. */
const HISTORY_TURNS = 20;
const MAX_PAGE_SIZE = 50;

export interface SendChatMessageRequest {
  userId: string;
  documentId: string;
  /** What the reader typed, or the passage they highlighted. */
  text: string;
  /** Set when this message came from the highlight popover or a
   * prerequisite chip. */
  highlightAction?: Exclude<ChatOrigin, null>;
  pageNumber?: number | null;
  /** Streams the reply to the client as it is generated. */
  onToken?: (chunk: string) => void;
}

export interface SendChatMessageResult {
  userMessage: ChatMessageRecord;
  reply: ChatMessageRecord;
}

/**
 * One turn of the document chat (§8).
 *
 * A highlight and a typed question take the same path on purpose: pressing
 * "Explain" is just a question the reader did not have to phrase, so it lands
 * in the same thread and can be followed up in the same way. The difference
 * is kept as data — the action, the quoted passage, the page — rather than
 * being flattened into the message text, so the panel can quote the passage
 * and link back to where it came from.
 *
 * Both rows are written before the handler returns, and the reader's row is
 * written *before* the model is called: a failed generation leaves a question
 * in the thread to retry, never a silent gap.
 */
@Injectable()
export class SendChatMessageHandler extends AbstractRequestHandlerTemplate<
  SendChatMessageRequest,
  SendChatMessageResult
> {
  constructor(
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    @Inject(CONCEPT_REPOSITORY)
    private readonly concepts: ConceptKnowledgeRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly struggles: StruggleRecorder,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: SendChatMessageRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const text = cmd.text.trim();
    if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
      throw new ValidationError(
        `Write between ${MIN_TEXT} and ${MAX_TEXT} characters`,
      );
    }

    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    // The thread as it stood before this question — the current turn is sent
    // separately, with its own freshly retrieved passages.
    const history = await this.chat.recent(
      cmd.documentId,
      cmd.userId,
      HISTORY_TURNS,
    );

    const userMessage = await this.chat.append({
      documentId: cmd.documentId,
      userId: cmd.userId,
      role: 'user',
      text,
      highlightAction: cmd.highlightAction ?? null,
      quotedText: cmd.highlightAction ? text : null,
      pageNumber: cmd.pageNumber ?? null,
    });

    // Every turn is comprehension evidence of some strength: a typed
    // question, an Explain/Simplify press, or a prerequisite the reader
    // admitted to not knowing. Define is excluded — looking up a term is
    // normal reading, not effort.
    const signalKind =
      cmd.highlightAction === 'prerequisite'
        ? ('prereq_requested' as const)
        : cmd.highlightAction === 'explain' ||
            cmd.highlightAction === 'simplify'
          ? ('highlight_explain' as const)
          : cmd.highlightAction
            ? null
            : ('chat_question' as const);
    if (signalKind) {
      void this.struggles.record({
        userId: cmd.userId,
        documentId: cmd.documentId,
        kind: signalKind,
        pageNumber: cmd.pageNumber ?? null,
      });
    }

    const question = expandHighlight(cmd.highlightAction, text);

    // The profile rides in the same parallel block as summary and embedding,
    // so personalising the answer costs no extra latency. Best-effort: an
    // unreadable profile must never cost the reader their answer.
    const [summary, embedding, profile, docState] = await Promise.all([
      this.summaries.find(cmd.documentId),
      this.llm.embed({ texts: [question] }).then((r) => r.value[0]),
      this.profiles.find(cmd.userId).catch(() => null),
      this.docStates.find(cmd.userId, cmd.documentId).catch(() => null),
    ]);

    const chunks = await this.vectors.query({
      documentId: cmd.documentId,
      embedding,
      topK: TOP_K,
    });
    const sources = chunks.map((chunk) => ({
      pageNumber: chunk.pageNumber,
      text: chunk.text,
    }));
    const context = sources
      .map((source) => `[p.${source.pageNumber}] ${source.text}`)
      .join('\n\n');

    const result = await this.llm.chatWithDocument({
      history: toTurns(history),
      question,
      context,
      summary,
      // Composed, not raw: how this reader learns, adjusted for how this
      // particular document is going for them.
      profile: profileInstructions(
        effectiveProfile(profile ?? DEFAULT_LEARNER_PROFILE, docState),
        'written',
      ),
      onToken: cmd.onToken,
    });

    const reply = await this.chat.append({
      documentId: cmd.documentId,
      userId: cmd.userId,
      role: 'assistant',
      text: result.value,
      sources,
    });

    // The ledger's whole write path for the chat: asking about a
    // prerequisite flags it, and the reply that just landed above resolves
    // it. Both after the fact, so a failed generation leaves the concept
    // unclear rather than falsely taught.
    if (cmd.highlightAction === 'prerequisite') {
      await this.concepts.markUnclear(cmd.userId, text).catch(() => undefined);
      await this.concepts
        .markTaught(cmd.userId, text, cmd.documentId)
        .catch(() => undefined);
    }

    return CommandResponse.of({ userMessage, reply });
  }
}

/**
 * The thread as model turns.
 *
 * The most recent answer carries the passages it was built on, so a follow-up
 * ("why?", "what about the second one?") resolves against the same evidence
 * instead of whatever this turn's retrieval happened to surface. Older
 * answers travel as text alone — replaying every turn's passages would grow
 * the prompt without bound.
 */
function toTurns(
  history: ChatMessageRecord[],
): { role: 'user' | 'assistant'; content: string }[] {
  const lastWithSources = [...history]
    .reverse()
    .find((message) => message.role === 'assistant' && message.sources?.length);

  return history.map((message) => {
    if (message === lastWithSources && message.sources?.length) {
      const passages = message.sources
        .map((source) => `[p.${source.pageNumber}] ${source.text}`)
        .join('\n\n');
      return {
        role: 'assistant' as const,
        content: `${message.text}\n\nPassages used for that answer:\n${passages}`,
      };
    }
    return {
      role:
        message.role === 'assistant'
          ? ('assistant' as const)
          : ('user' as const),
      content: message.text,
    };
  });
}

export interface ListChatMessagesRequest {
  userId: string;
  documentId: string;
  limit?: number;
  /** Keyset cursor: the timestamp of the oldest message already on screen. */
  before?: string;
}

@Injectable()
export class ListChatMessagesHandler extends AbstractRequestHandlerTemplate<
  ListChatMessagesRequest,
  ChatHistoryResponse
> {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListChatMessagesRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const limit = Math.min(Math.max(cmd.limit ?? 20, 1), MAX_PAGE_SIZE);
    const before = cmd.before ? new Date(cmd.before) : undefined;
    if (before && Number.isNaN(before.getTime())) {
      throw new ValidationError('That cursor is not a valid timestamp');
    }

    const { messages, hasMore } = await this.chat.page(
      cmd.documentId,
      cmd.userId,
      limit,
      before,
    );

    return CommandResponse.of({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        highlightAction: message.highlightAction,
        quotedText: message.quotedText,
        pageNumber: message.pageNumber,
        sources: message.sources,
        createdAt: message.createdAt.toISOString(),
      })),
      hasMore,
    });
  }
}
