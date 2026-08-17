import { Inject, Injectable } from '@nestjs/common';
import type { ChatHistoryResponse, ChatOrigin } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { expandHighlight, isFollowUp } from '../../domain/values/chat';
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
/** Passages carried over from the previous answer when a turn is a follow-up. */
const CARRIED_SOURCES = 4;
/** Ceiling on a follow-up's combined evidence, so the prompt stays bounded. */
const MAX_SOURCES = 8;
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

    // "yes", "why?", "go on" — a turn that means nothing without the one
    // before it. Searching the document for those words returns arbitrary
    // pages, and an answer built on arbitrary pages is why the easiest turn
    // in a conversation used to be the one that failed. A highlight press is
    // never a follow-up: it carries its own passage.
    const followUp = !cmd.highlightAction && isFollowUp(text);
    const previousQuestion =
      [...history].reverse().find((message) => message.role === 'user')?.text ??
      null;
    const previousAnswer =
      [...history].reverse().find((message) => message.role === 'assistant')
        ?.text ?? null;
    const previousSources =
      [...history]
        .reverse()
        .find(
          (message) => message.role === 'assistant' && message.sources?.length,
        )?.sources ?? [];

    /**
     * The turn as the model receives it.
     *
     * A follow-up needs its referent spelled out, not merely present earlier
     * in the thread. Sent as `Question: yes` the model reads a question that
     * isn't one and asks what is meant — even with the whole conversation
     * above it. Naming what the reply answers is what turns "yes" back into
     * the request the reader believes they just made.
     */
    const question =
      followUp && previousAnswer
        ? [
            `The reader replied: "${text}"`,
            `Your previous answer ended: "${previousAnswer.slice(-400)}"`,
            'This is a reply to that, not a new question. Work out what it' +
              ' refers to and answer it directly. If it accepts something you' +
              ' offered, do that thing now, in full, without asking them to' +
              ' restate it.',
          ].join('\n\n')
        : expandHighlight(cmd.highlightAction, text);

    // Searched for as the question it continues, not as the word it is.
    const searchText =
      followUp && previousQuestion ? `${previousQuestion}\n${text}` : question;

    // The profile rides in the same parallel block as summary and embedding,
    // so personalising the answer costs no extra latency. Best-effort: an
    // unreadable profile must never cost the reader their answer.
    const [summary, embedding, profile, docState] = await Promise.all([
      this.summaries.find(cmd.documentId),
      this.llm.embed({ texts: [searchText] }).then((r) => r.value[0]),
      this.profiles.find(cmd.userId).catch(() => null),
      this.docStates.find(cmd.userId, cmd.documentId).catch(() => null),
    ]);

    const chunks = await this.vectors.query({
      documentId: cmd.documentId,
      embedding,
      topK: TOP_K,
    });
    const retrieved = chunks.map((chunk) => ({
      pageNumber: chunk.pageNumber,
      text: chunk.text,
    }));

    // On a follow-up the evidence the reader is actually following up on is
    // the evidence behind the last answer, so it leads — with fresh results
    // behind it in case the follow-up does open a new direction.
    const sources = followUp
      ? mergeSources(previousSources.slice(0, CARRIED_SOURCES), retrieved)
      : retrieved;
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

export interface ClarifyChatMessageRequest {
  userId: string;
  documentId: string;
  /** The assistant message that failed to land. */
  messageId: string;
  onToken?: (chunk: string) => void;
}

/** What the reader's press says, in the thread, in their voice. */
const STILL_NOT_CLEAR_TEXT =
  "I still don't understand — explain it differently.";

/**
 * "Still not clear" — the explanation ladder (adaptive-learning §3, the
 * `still_not_clear` signal held at weight 1.0).
 *
 * Every other struggle signal is inferred: a question might be curiosity, a
 * re-read might be interest. This one is the reader saying outright that an
 * explanation failed, which is why it is the heaviest signal in the stream
 * and why it does something immediately rather than only feeding adaptation.
 *
 * The re-answer deliberately reuses the passages the first answer was built
 * on. The evidence was never the problem — the explanation was — and
 * retrieving afresh would risk answering a different question than the one
 * that failed.
 */
@Injectable()
export class ClarifyChatMessageHandler extends AbstractRequestHandlerTemplate<
  ClarifyChatMessageRequest,
  SendChatMessageResult
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly struggles: StruggleRecorder,
  ) {
    super();
  }

  protected async handleRequest(cmd: ClarifyChatMessageRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const found = await this.chat.findWithQuestion(
      cmd.documentId,
      cmd.userId,
      cmd.messageId,
    );
    if (!found || found.answer.role !== 'assistant') {
      throw new ValidationError('That answer is no longer here');
    }

    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    // Recorded before the model call, not after: the reader's admission is
    // the valuable part, and it must survive a generation that fails.
    void this.struggles.record({
      userId: cmd.userId,
      documentId: cmd.documentId,
      kind: 'still_not_clear',
      pageNumber: found.question?.pageNumber ?? null,
      meta: { messageId: cmd.messageId },
    });

    const userMessage = await this.chat.append({
      documentId: cmd.documentId,
      userId: cmd.userId,
      role: 'user',
      text: STILL_NOT_CLEAR_TEXT,
      pageNumber: found.question?.pageNumber ?? null,
    });

    const [summary, profile, docState] = await Promise.all([
      this.summaries.find(cmd.documentId),
      this.profiles.find(cmd.userId).catch(() => null),
      this.docStates.find(cmd.userId, cmd.documentId).catch(() => null),
    ]);

    // The same evidence as last time. An answer with no recorded passages
    // (an older row) simply re-explains from the thread and the summary.
    const sources = found.answer.sources ?? [];
    const context = sources
      .map((source) => `[p.${source.pageNumber}] ${source.text}`)
      .join('\n\n');

    const question = [
      found.question
        ? `The reader originally asked:\n${found.question.text}`
        : null,
      `Your previous answer, which did not land:\n${found.answer.text}`,
      'Explain the same thing again, a different way, simpler.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.llm.chatWithDocument({
      // Deliberately no history. Replaying the thread and then asking for a
      // different explanation works against itself: the model has twenty
      // turns of its own phrasing in front of it and paraphrases them. The
      // question and the answer that failed are supplied below instead, as
      // the two things this turn is actually about.
      history: [],
      question,
      context,
      summary,
      profile: profileInstructions(
        effectiveProfile(profile ?? DEFAULT_LEARNER_PROFILE, docState),
        'written',
      ),
      simpler: true,
      onToken: cmd.onToken,
    });

    const reply = await this.chat.append({
      documentId: cmd.documentId,
      userId: cmd.userId,
      role: 'assistant',
      text: result.value,
      // Carried forward so pressing the button twice still has its evidence.
      sources: sources.length ? sources : null,
    });

    return CommandResponse.of({ userMessage, reply });
  }
}

/**
 * Previous evidence first, fresh evidence behind it, nothing twice.
 *
 * Deduped on page and opening words rather than the whole passage: the same
 * chunk retrieved twice is identical, and two genuinely different chunks
 * from one page never share an opening.
 */
function mergeSources(
  carried: { pageNumber: number; text: string }[],
  fresh: { pageNumber: number; text: string }[],
): { pageNumber: number; text: string }[] {
  const seen = new Set<string>();
  const out: { pageNumber: number; text: string }[] = [];
  for (const source of [...carried, ...fresh]) {
    const key = `${source.pageNumber}:${source.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length >= MAX_SOURCES) break;
  }
  return out;
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
