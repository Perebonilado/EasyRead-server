import { Inject, Injectable } from '@nestjs/common';
import {
  DocumentNotReadyError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors/errors';
import {
  isBroken,
  itemStats,
  siftItems,
  type DraftItem,
  type ItemKind,
} from '../../domain/items';
import {
  NEW_MEMORY,
  daysBetween,
  ratingFor,
  schedule,
  type Memory,
} from '../../domain/scheduling';
import { blocksToProse } from '../documents/voice.handlers';
import { CLOCK, LLM_GATEWAY } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { GeneratedItem, LlmGatewayPort } from '../../ports/llm.port';
import {
  ASSESSMENT_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  ITEM_REPOSITORY,
  ITEM_REVIEW_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type {
  DueItem,
  ItemRepository,
  ItemReviewRepository,
} from '../../repositories/item.repository';
import type { AssessmentRepository } from '../../repositories/learning.repository';
import type {
  SummaryRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';

import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from '../documents/document-access.service';

/** Stamped on every item, so a bad batch can be found and retired later. */
export const GENERATOR_VERSION = 'v1';

/** A chapter, not the whole book, at roughly 12 pages a topic. */
const MAX_SOURCE_CHARS = 24_000;
/** Existing questions shown to the writer so it does not repeat itself. */
const AVOID_STEMS = 40;
/**
 * Asked for more than banked, because verification always discards some.
 *
 * Sized from observed discard rates (roughly a quarter to a third), with a
 * single top-up round behind it. A reader who asks for ten questions should
 * get ten, not "eight, and no explanation of where the other two went".
 */
const OVERSHOOT = 1.7;
/** One extra round only: a test is not worth a minute of waiting. */
const TOP_UP_ROUNDS = 1;
/**
 * Questions asked of the model in a single call.
 *
 * Small on purpose. Quality falls off as a batch grows — a model asked for
 * twenty questions at once repeats itself and pads — so a larger test is
 * several small calls in parallel rather than one big one. Latency stays
 * flat because they run together.
 */
const BATCH_SIZE = 6;

/** What the writer can produce. `short` is graded free text, not batched. */
export type GeneratableKind = Exclude<ItemKind, 'short'> | 'mixed';

export interface GenerateItemsRequest {
  userId: string;
  documentId: string;
  /** One chapter. Omitted when `page` or `topicIds` says which. */
  topicId?: string;
  /** Several chapters: the count is shared out across them. */
  topicIds?: string[];
  /** Resolves to whichever chapter contains it — a highlight knows its page. */
  page?: number;
  kind: GeneratableKind;
  count: number;
  focus?: string[];
  /** A highlighted sentence the item must be built from. */
  fromQuote?: string;
}

export interface GenerateItemsResult {
  created: number;
  /** Written but discarded by verification or the quality gates. */
  discarded: number;
  /**
   * The questions themselves, ready to be taken straight away.
   *
   * A generated test is a bounded thing a reader means to sit down and do
   * — not an anonymous deposit into a queue. Returning the items means
   * "start now" plays exactly these, in the chapters they picked, rather
   * than whatever else happens to be due.
   */
  items: QueuedItem[];
}

/**
 * Writes items, then refuses to bank the ones it cannot prove.
 *
 * Two passes, and the second is the reason this can be trusted. The writer
 * produces candidates; the verifier answers each one from the source alone,
 * never told which answer was intended, and must quote the sentence that
 * settles it. Only where the two agree — and the mechanical gates in
 * `siftItems` also pass — does an item reach a student.
 *
 * Discarding is normal, not exceptional. Asking for more than requested is
 * what keeps a verified batch near the count the reader asked for.
 */
@Injectable()
export class GenerateItemsHandler extends AbstractRequestHandlerTemplate<
  GenerateItemsRequest,
  GenerateItemsResult
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly documentPages: DocumentPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: GenerateItemsRequest,
  ): Promise<CommandResponse<GenerateItemsResult>> {
    const document = await this.access.require(cmd.documentId, cmd.userId);

    const topics = await this.topics.listWithReadState(
      cmd.documentId,
      cmd.userId,
    );

    // Three ways to say which chapters: an explicit list, one id, or the
    // page a highlight came from. A test spanning a document is the first;
    // the other two are the single-chapter paths.
    const wanted = cmd.topicIds?.length
      ? topics.filter((t) => cmd.topicIds!.includes(t.id))
      : cmd.topicId
        ? topics.filter((t) => t.id === cmd.topicId)
        : topics.filter(
            (t) =>
              cmd.page !== undefined &&
              t.startPage <= cmd.page &&
              t.endPage >= cmd.page,
          );
    if (!wanted.length) throw new NotFoundError('Topic');

    const [summary, avoidStems] = await Promise.all([
      this.summaries.find(cmd.documentId),
      this.items.existingStems(cmd.documentId, AVOID_STEMS),
    ]);

    // Chapters are written in parallel, and one failing must not sink the
    // rest: a test over six chapters where one chokes is better delivered
    // short than refused. The errors are kept, not swallowed — if nothing
    // at all was produced, the reader gets the REAL reason, never a guess.
    const failures: Error[] = [];
    const batches = await Promise.all(
      shareOut(cmd.count, wanted.length).map((share, index) =>
        this.writeForTopic({
          cmd,
          topic: wanted[index],
          count: share,
          summary,
          avoidStems,
          documentTitle: document.props.title,
        }).catch((error: Error) => {
          this.logger.warn(
            `items: skipped "${wanted[index].title}" — ${error.message}`,
          );
          failures.push(error);
          return { created: 0, discarded: 0, items: [] };
        }),
      ),
    );

    const created = batches.reduce((sum, b) => sum + b.created, 0);
    const discarded = batches.reduce((sum, b) => sum + b.discarded, 0);
    const items = batches.flatMap((b) => b.items);

    if (created === 0 && discarded === 0) {
      // Every chapter came back empty. Say what actually happened: the
      // first real failure if there was one — a lie here ("not simplified"
      // against a fully simplified book) burns trust and sends the reader
      // chasing a problem that does not exist.
      if (failures.length) throw failures[0];
      throw new ValidationError(
        'The question writer came back empty-handed. Nothing is wrong with the document — try again in a moment',
      );
    }

    return CommandResponse.of({ created, discarded, items });
  }

  /** One chapter's worth: read its text, write, sift, verify, bank. */
  private async writeForTopic(input: {
    cmd: GenerateItemsRequest;
    topic: { id: string; title: string; startPage: number; endPage: number };
    count: number;
    summary: string | null;
    avoidStems: string[];
    documentTitle: string;
  }): Promise<GenerateItemsResult> {
    const { cmd, topic } = input;

    const usable = await this.chapterSource(cmd.documentId, topic);
    const pagesText = usable
      .map((page) => page.prose)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS);
    if (!pagesText) {
      throw new DocumentNotReadyError(
        `"${topic.title}" is still importing. Try again in a few minutes`,
      );
    }

    // No ceiling here: a reader who asks for 25 gets 25 attempted. The cap
    // that used to live here silently turned 25 into 12.
    const target = Math.max(1, input.count);
    const banked: { item: DraftItem; quote: string | null }[] = [];
    let batchFailures = 0;
    // Stems to avoid grow as we go, so a top-up round cannot simply rewrite
    // what the first round already produced.
    const avoid = [...input.avoidStems];
    let writtenCount = 0;

    for (let round = 0; round <= TOP_UP_ROUNDS; round += 1) {
      const missing = target - banked.length;
      if (missing <= 0) break;

      // Several small calls rather than one large one, each over its own
      // slice of the chapter so they do not all mine the same paragraphs.
      const sizes = shareOut(missing, Math.ceil(missing / BATCH_SIZE));
      const slices = sliceText(usable, sizes.length);

      const rounds = await Promise.all(
        sizes.map((size, index) =>
          this.llm
            .generateItems({
              topicTitle: topic.title,
              pagesText: slices[index],
              summary: input.summary,
              kind: cmd.kind,
              count: Math.ceil(size * OVERSHOOT),
              // A copy: this list is appended to after the call, and handing
              // over the live array would change what the round was asked
              // for after the fact.
              avoidStems: [...avoid],
              focus: cmd.focus?.slice(0, 5),
              fromQuote: cmd.fromQuote,
            })
            .catch((error: Error) => {
              // One batch failing costs its share, not the whole test —
              // but it is counted, so every batch failing can be told
              // apart from the model genuinely writing nothing.
              this.logger.warn(`items: a batch failed — ${error.message}`);
              batchFailures += 1;
              return { value: [] as GeneratedItem[] };
            }),
        ),
      );
      const drafted = rounds.flatMap((result) => result.value);
      writtenCount += drafted.length;

      // Mechanical gates first: they cost nothing, and there is no sense
      // paying a model to verify an item that leaks its answer by length.
      // Sifting the batches together also removes what they duplicated of
      // each other, which parallel calls cannot see.
      const { kept } = siftItems(drafted.map(toDraft));
      const fresh = kept.filter(
        (item) => !banked.some((entry) => entry.item.stem === item.stem),
      );

      const verified = await Promise.all(
        fresh.slice(0, missing).map((item) => this.verify(item, pagesText)),
      );
      for (const entry of verified) {
        if (entry && banked.length < target) banked.push(entry);
      }
      avoid.push(...fresh.map((item) => item.stem));
    }

    // Nothing written AND every call failed: the provider is having a bad
    // moment. Saying so beats both the silent empty test and any guess.
    if (banked.length === 0 && writtenCount === 0 && batchFailures > 0) {
      throw new ValidationError(
        'The question writer is having trouble right now. Nothing is wrong with the document — try again in a moment',
      );
    }

    const created = await this.items.createMany(
      banked.map(({ item, quote }) => ({
        documentId: cmd.documentId,
        topicId: topic.id,
        kind: item.kind,
        stem: item.stem,
        options: item.options,
        correctIndex: item.correctIndex,
        explanation: item.explanation,
        hint: item.hint,
        groundingQuote: quote,
        // The page the quote actually sits on, not the chapter's first.
        // "Page 110" against a fact from page 115 sends a reader looking in
        // the wrong place, which costs exactly the trust the quote buys.
        sourcePage: pageOfQuote(quote, usable) ?? topic.startPage,
        generatorVersion: GENERATOR_VERSION,
      })),
    );

    this.logger.log(
      `items: banked ${created.length} of ${writtenCount} written for "${topic.title}" (asked ${target})`,
    );

    return {
      created: created.length,
      discarded: writtenCount - created.length,
      items: created.map((item) => ({
        id: item.id,
        documentId: item.documentId,
        documentTitle: input.documentTitle,
        topicId: item.topicId,
        kind: item.kind,
        stem: item.stem,
        options: item.options,
        hint: item.hint,
        isNew: true,
      })),
    };
  }

  /**
   * The text a chapter's questions are written from.
   *
   * Simplified pages where they exist, the original page text where they
   * do not — the same never-refuse-when-source-exists posture as AI
   * Examiner's retrieval fallback. A chapter mid-simplification gets a
   * usable mix rather than a refusal, and "not simplified yet" stops
   * being an error a reader can ever see on a readable book.
   */
  private async chapterSource(
    documentId: string,
    topic: { startPage: number; endPage: number },
  ): Promise<{ pageNumber: number; prose: string }[]> {
    const simplified = await this.simplified.findRange(
      documentId,
      'standard',
      topic.startPage,
      topic.endPage,
    );
    const done = new Map(
      simplified
        .filter((page) => page.status === 'done' && page.blocks?.length)
        .map((page) => [page.pageNumber, blocksToProse(page.blocks ?? [])]),
    );

    const missing = done.size < topic.endPage - topic.startPage + 1;
    const originals = missing
      ? await this.documentPages.findRange(
          documentId,
          topic.startPage,
          topic.endPage,
        )
      : [];
    const originalText = new Map(
      originals
        .filter((page) => !page.isEmpty && page.text.trim())
        .map((page) => [page.pageNumber, page.text]),
    );

    const source: { pageNumber: number; prose: string }[] = [];
    for (let page = topic.startPage; page <= topic.endPage; page += 1) {
      const prose = done.get(page) ?? originalText.get(page);
      if (prose) source.push({ pageNumber: page, prose });
    }
    return source;
  }

  /**
   * One blind check. Returns the item plus its supporting quote, or null.
   *
   * A verifier failure is a discard, never an exception: losing one item is
   * always better than failing the whole batch, and the overshoot above is
   * sized for exactly this.
   */
  private async verify(
    item: DraftItem,
    pagesText: string,
  ): Promise<{ item: DraftItem; quote: string | null } | null> {
    try {
      const { value: verdict } = await this.llm.verifyItem({
        stem: item.stem,
        options: item.options,
        pagesText,
      });

      if (!verdict.supported) return null;
      // A flashcard has one option, so agreeing on an index proves nothing;
      // the quote is the whole check there.
      if (item.kind === 'flashcard' || item.kind === 'short') {
        return verdict.quote ? { item, quote: verdict.quote } : null;
      }
      if (verdict.answerIndex !== item.correctIndex) return null;
      return { item, quote: verdict.quote };
    } catch {
      return null;
    }
  }
}

/** Shorter than this, a fragment is not distinctive enough to locate. */
const MIN_QUOTE_MATCH = 12;

/**
 * Which page a verbatim quote came from.
 *
 * The verifier copies the sentence out, so an exact match usually lands.
 * Falls back to a distinctive opening fragment for the cases where it
 * normalised whitespace, and to null when nothing matches — better an
 * honest chapter-level page than a confidently wrong one.
 */
export function pageOfQuote(
  quote: string | null,
  pages: { pageNumber: number; prose: string }[],
): number | null {
  const needle = quote?.trim();
  // Guards the exact match too, not just the fallback: a short fragment
  // matches half a book, and it matching exactly makes it no more
  // trustworthy.
  if (!needle || needle.length < MIN_QUOTE_MATCH) return null;

  const exact = pages.find((page) => page.prose.includes(needle));
  if (exact) return exact.pageNumber;

  const head = needle.slice(0, 40).trim();
  if (head.length < MIN_QUOTE_MATCH) return null;
  const loose = pages.find((page) => page.prose.includes(head));
  return loose ? loose.pageNumber : null;
}

/**
 * Cuts a chapter's pages into one slice per batch.
 *
 * Parallel calls cannot see each other, so pointing them all at the same
 * paragraphs guarantees overlap. Giving each its own stretch spreads the
 * questions across the chapter instead. When there are fewer pages than
 * batches the slices repeat, and deduplication downstream sorts it out.
 */
export function sliceText(
  pages: { prose: string }[],
  batches: number,
): string[] {
  if (!pages.length) return Array.from({ length: batches }, () => '');
  if (batches <= 1) {
    return [
      pages
        .map((page) => page.prose)
        .join('\n\n')
        .slice(0, MAX_SOURCE_CHARS),
    ];
  }

  const per = Math.max(1, Math.floor(pages.length / batches));
  return Array.from({ length: batches }, (_, index) => {
    const start = (index * per) % pages.length;
    const window = pages
      .slice(start, start + per)
      .concat(
        start + per > pages.length
          ? pages.slice(0, start + per - pages.length)
          : [],
      );
    return (window.length ? window : pages)
      .map((page) => page.prose)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS);
  });
}

/**
 * Spreads a question count across chapters as evenly as it divides, giving
 * the remainder to the earliest ones. Every chapter gets at least one, so a
 * chapter a reader deliberately picked is never silently skipped.
 */
export function shareOut(total: number, buckets: number): number[] {
  const each = Math.floor(total / buckets);
  const spare = total % buckets;
  return Array.from({ length: buckets }, (_, i) =>
    Math.max(1, each + (i < spare ? 1 : 0)),
  );
}

const toDraft = (item: GeneratedItem): DraftItem => ({
  kind: item.kind,
  stem: item.stem,
  options: item.options,
  correctIndex: item.correctIndex,
  explanation: item.explanation,
  hint: item.hint,
  topicTitle: item.topicTitle,
});

export interface ReviewQueueRequest {
  userId: string;
  limit?: number;
  documentId?: string;
}

export interface QueuedItem {
  id: string;
  documentId: string;
  documentTitle: string;
  topicId: string | null;
  kind: ItemKind;
  stem: string;
  options: string[];
  hint: string | null;
  /** True the first time this reader meets the item. */
  isNew: boolean;
}

export interface ReviewQueueResult {
  items: QueuedItem[];
  due: number;
  documents: number;
  /** Across the whole due set, not just the page of items returned. */
  newCount: number;
  byDocument: { title: string; count: number }[];
  nextDueAt: string | null;
  /** Rough minutes, from a median answer taking about twenty seconds. */
  estimatedMinutes: number;
}

/** Seconds a card takes, near enough for an estimate a tired reader trusts. */
const SECONDS_PER_ITEM = 20;
const DEFAULT_QUEUE = 20;

/**
 * What this reader owes today.
 *
 * The answer key never leaves the server: the queue carries stems and
 * options only, so the page cannot be read to find the answers.
 */
@Injectable()
export class ReviewQueueHandler extends AbstractRequestHandlerTemplate<
  ReviewQueueRequest,
  ReviewQueueResult
> {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: ReviewQueueRequest,
  ): Promise<CommandResponse<ReviewQueueResult>> {
    const now = this.clock.now();
    const limit = Math.min(50, Math.max(1, cmd.limit ?? DEFAULT_QUEUE));

    const [queue, summary] = await Promise.all([
      this.items.due(cmd.userId, now, limit, { documentId: cmd.documentId }),
      this.items.dueSummary(cmd.userId, now),
    ]);

    return CommandResponse.of({
      items: queue.map(toQueued),
      due: summary.due,
      documents: summary.documents,
      newCount: summary.newCount,
      byDocument: summary.byDocument.slice(0, 4),
      nextDueAt: summary.nextDueAt ? summary.nextDueAt.toISOString() : null,
      estimatedMinutes: Math.max(
        1,
        Math.round((summary.due * SECONDS_PER_ITEM) / 60),
      ),
    });
  }
}

const toQueued = (entry: DueItem): QueuedItem => ({
  id: entry.item.id,
  documentId: entry.item.documentId,
  documentTitle: entry.documentTitle,
  topicId: entry.item.topicId,
  kind: entry.item.kind,
  stem: entry.item.stem,
  options: entry.item.options,
  hint: entry.item.hint,
  isNew: entry.review === null,
});

export interface AnswerItemRequest {
  userId: string;
  itemId: string;
  /** Index chosen; -1 when the reader gave up rather than guessed. */
  choiceIndex: number;
  /** 0..1, captured BEFORE the answer was revealed. Feeds calibration. */
  confidence?: number;
}

export interface AnswerItemResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  groundingQuote: string | null;
  sourcePage: number | null;
  /** When this item comes back. */
  dueAt: string;
  intervalDays: number;
}

/**
 * One answer: graded, scheduled, and recorded to the mastery ledger.
 *
 * Three writes, deliberately in this order. The schedule is what brings the
 * item back; the assessment event is what feeds the existing mastery and
 * calibration models, so items strengthen the understanding report rather
 * than living beside it; the statistics are what eventually retire an item
 * that misleads.
 */
@Injectable()
export class AnswerItemHandler extends AbstractRequestHandlerTemplate<
  AnswerItemRequest,
  AnswerItemResult
> {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(ITEM_REVIEW_REPOSITORY)
    private readonly reviews: ItemReviewRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: AnswerItemRequest,
  ): Promise<CommandResponse<AnswerItemResult>> {
    const item = await this.items.findById(cmd.itemId);
    if (!item) throw new NotFoundError('Question');
    await this.access.require(item.documentId, cmd.userId);

    if (
      cmd.confidence !== undefined &&
      (cmd.confidence < 0 || cmd.confidence > 1)
    ) {
      throw new ValidationError('Confidence must be between 0 and 1');
    }

    const now = this.clock.now();
    const correct = cmd.choiceIndex === item.correctIndex;

    const existing = await this.reviews.find(cmd.userId, cmd.itemId);
    const memory: Memory = existing
      ? {
          stability: existing.stability,
          difficulty: existing.difficulty,
          state: existing.state,
          reps: existing.reps,
          lapses: existing.lapses,
          elapsedDays: existing.lastReviewedAt
            ? daysBetween(existing.lastReviewedAt, now)
            : 0,
        }
      : NEW_MEMORY;

    const next = schedule(memory, ratingFor(correct, cmd.confidence), now);

    await this.reviews.upsert(cmd.userId, cmd.itemId, {
      stability: next.stability,
      difficulty: next.difficulty,
      state: next.state,
      reps: next.reps,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: now,
      lastCorrect: correct,
    });

    // The same ledger the tutor and guided checks write to, so an item
    // answered in review moves the understanding report too.
    await this.assessments.record({
      userId: cmd.userId,
      documentId: item.documentId,
      topicId: item.topicId,
      kind: item.kind === 'flashcard' ? 'flashcard' : 'mcq',
      score: correct ? 1 : 0,
      payload: {
        itemId: item.id,
        ...(cmd.confidence !== undefined ? { confidence: cmd.confidence } : {}),
        source: 'review',
      },
    });

    await this.refreshStats(item.id);

    return CommandResponse.of({
      correct,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      groundingQuote: item.groundingQuote,
      sourcePage: item.sourcePage,
      dueAt: next.dueAt.toISOString(),
      intervalDays: next.intervalDays,
    });
  }

  /**
   * Recomputes an item's statistics and retires it if it is misleading.
   *
   * Deliberately best-effort: a student's answer must never fail because a
   * statistics query did.
   */
  private async refreshStats(itemId: string): Promise<void> {
    try {
      const responses = await this.items.responsesFor(itemId);
      const stats = itemStats(responses);
      await this.items.recordStats(itemId, stats);
      if (isBroken(stats)) {
        await this.items.retire(itemId, this.clock.now());
        this.logger.warn(
          `Retired item ${itemId}: discrimination ${stats.discrimination?.toFixed(2)} over ${stats.n} responses — the readers who know the material are failing it`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not refresh stats for item ${itemId}: ${(error as Error).message}`,
      );
    }
  }
}
