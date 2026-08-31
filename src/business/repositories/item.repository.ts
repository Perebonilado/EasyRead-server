import type { CardState } from '../domain/scheduling';
import type { ItemKind } from '../domain/items';

export interface ItemRecord {
  id: string;
  documentId: string;
  topicId: string | null;
  kind: ItemKind;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint: string | null;
  groundingQuote: string | null;
  sourcePage: number | null;
  timesAnswered: number;
  pValue: number | null;
  discrimination: number | null;
}

export interface ItemReviewRecord {
  itemId: string;
  stability: number;
  difficulty: number;
  state: CardState;
  reps: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  lastCorrect: boolean | null;
}

/** An item together with this reader's schedule for it, if any. */
export interface DueItem {
  item: ItemRecord;
  review: ItemReviewRecord | null;
  documentTitle: string;
}

export interface ItemRepository {
  createMany(
    items: (Omit<
      ItemRecord,
      'id' | 'timesAnswered' | 'pValue' | 'discrimination'
    > & { generatorVersion: string })[],
  ): Promise<ItemRecord[]>;

  findById(id: string): Promise<ItemRecord | null>;

  /** Live items for a document, optionally narrowed to topics. */
  forDocument(
    documentId: string,
    options?: { topicIds?: string[]; limit?: number },
  ): Promise<ItemRecord[]>;

  /** Stems already written for a document, so generation avoids repeats. */
  existingStems(documentId: string, limit: number): Promise<string[]>;

  /**
   * What this reader owes today, across every document — due first, then
   * items they have never seen. The queue is global on purpose: reviewing
   * across documents is the whole point of scheduling.
   */
  due(
    userId: string,
    now: Date,
    limit: number,
    options?: { documentId?: string },
  ): Promise<DueItem[]>;

  /**
   * What is due now, in full — not merely the first page of it.
   *
   * The queue itself is paged, so anything derived from that page would
   * disagree with the totals shown beside it. This answers for the whole
   * due set instead.
   */
  dueSummary(
    userId: string,
    now: Date,
  ): Promise<{
    due: number;
    documents: number;
    /** Never met before, across the whole due set. */
    newCount: number;
    /** Which books today's cards come from, biggest first. */
    byDocument: { title: string; count: number }[];
    nextDueAt: Date | null;
  }>;

  recordStats(
    itemId: string,
    stats: { pValue: number; discrimination: number | null; n: number },
  ): Promise<void>;

  retire(itemId: string, now: Date): Promise<void>;

  /** Every response to an item, for computing its statistics. */
  responsesFor(
    itemId: string,
  ): Promise<{ correct: boolean; overallScore: number }[]>;
}

export interface ItemReviewRepository {
  find(userId: string, itemId: string): Promise<ItemReviewRecord | null>;
  upsert(
    userId: string,
    itemId: string,
    state: Omit<ItemReviewRecord, 'itemId'>,
  ): Promise<void>;
}
