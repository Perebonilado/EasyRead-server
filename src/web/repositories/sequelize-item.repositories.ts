import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import type {
  DueItem,
  ItemRecord,
  ItemRepository,
  ItemReviewRecord,
  ItemReviewRepository,
} from '../../business/repositories/item.repository';
import { DocumentModel, ItemModel, ItemReviewModel } from '../database/models';
import { newId } from '../database/uuid';

const toRecord = (row: ItemModel): ItemRecord => ({
  id: row.id,
  documentId: row.documentId,
  topicId: row.topicId,
  kind: row.kind,
  stem: row.stem,
  options: row.options,
  correctIndex: row.correctIndex,
  explanation: row.explanation,
  hint: row.hint,
  groundingQuote: row.groundingQuote,
  sourcePage: row.sourcePage,
  timesAnswered: row.timesAnswered,
  pValue: row.pValue,
  discrimination: row.discrimination,
});

const toReview = (row: ItemReviewModel): ItemReviewRecord => ({
  itemId: row.itemId,
  stability: row.stability,
  difficulty: row.difficulty,
  state: row.state,
  reps: row.reps,
  lapses: row.lapses,
  dueAt: row.dueAt,
  lastReviewedAt: row.lastReviewedAt,
  lastCorrect: row.lastCorrect,
});

@Injectable()
export class SequelizeItemRepository implements ItemRepository {
  constructor(
    @InjectModel(ItemModel) private readonly model: typeof ItemModel,
    @InjectModel(ItemReviewModel)
    private readonly reviews: typeof ItemReviewModel,
  ) {}

  async createMany(
    items: (Omit<
      ItemRecord,
      'id' | 'timesAnswered' | 'pValue' | 'discrimination'
    > & { generatorVersion: string })[],
  ): Promise<ItemRecord[]> {
    if (!items.length) return [];
    const rows = await this.model.bulkCreate(
      items.map((item) => ({ id: newId(), ...item })),
    );
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ItemRecord | null> {
    const row = await this.model.findByPk(id);
    return row ? toRecord(row) : null;
  }

  async forDocument(
    documentId: string,
    options: { topicIds?: string[]; limit?: number } = {},
  ): Promise<ItemRecord[]> {
    const rows = await this.model.findAll({
      where: {
        documentId,
        retiredAt: null,
        ...(options.topicIds?.length
          ? { topicId: { [Op.in]: options.topicIds } }
          : {}),
      },
      limit: options.limit,
      order: [['createdAt', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async existingStems(documentId: string, limit: number): Promise<string[]> {
    const rows = await this.model.findAll({
      where: { documentId },
      attributes: ['stem'],
      order: [['createdAt', 'DESC']],
      limit,
    });
    return rows.map((row) => row.stem);
  }

  /**
   * The review queue, in one query.
   *
   * Due items come first, oldest due first, then items never seen. Ordering
   * by document would cluster a session into one book; the interleaving the
   * evidence favours comes from mixing, so the tie-break is deliberately
   * the item's own age rather than its document.
   */
  async due(
    userId: string,
    now: Date,
    limit: number,
    options: { documentId?: string } = {},
  ): Promise<DueItem[]> {
    const rows = await this.model.sequelize!.query<{
      item: string;
      review: string | null;
      document_title: string;
    }>(
      `SELECT
         JSON_OBJECT(
           'id', i.id, 'documentId', i.document_id, 'topicId', i.topic_id,
           'kind', i.kind, 'stem', i.stem, 'options', i.options,
           'correctIndex', i.correct_index, 'explanation', i.explanation,
           'hint', i.hint, 'groundingQuote', i.grounding_quote,
           'sourcePage', i.source_page, 'timesAnswered', i.times_answered,
           'pValue', i.p_value, 'discrimination', i.discrimination
         ) AS item,
         CASE WHEN r.id IS NULL THEN NULL ELSE JSON_OBJECT(
           'itemId', r.item_id, 'stability', r.stability,
           'difficulty', r.difficulty, 'state', r.state, 'reps', r.reps,
           'lapses', r.lapses, 'dueAt', r.due_at,
           'lastReviewedAt', r.last_reviewed_at, 'lastCorrect', r.last_correct
         ) END AS review,
         d.title AS document_title
       FROM items i
       JOIN documents d ON d.id = i.document_id AND d.deleted_at IS NULL
       LEFT JOIN item_reviews r ON r.item_id = i.id AND r.user_id = :userId
       WHERE i.retired_at IS NULL
         AND d.user_id = :userId
         ${options.documentId ? 'AND i.document_id = :documentId' : ''}
         AND (r.id IS NULL OR r.due_at <= :now)
       ORDER BY (r.id IS NULL) ASC, r.due_at ASC, i.created_at ASC
       LIMIT :limit`,
      {
        replacements: {
          userId,
          now,
          limit,
          ...(options.documentId ? { documentId: options.documentId } : {}),
        },
        type: QueryTypes.SELECT,
      },
    );

    const parse = <T>(value: unknown): T =>
      (typeof value === 'string' ? JSON.parse(value) : value) as T;

    return rows.map((row) => {
      const review = row.review ? parse<ItemReviewRecord>(row.review) : null;
      return {
        item: parse<ItemRecord>(row.item),
        review: review
          ? {
              ...review,
              dueAt: new Date(review.dueAt),
              lastReviewedAt: review.lastReviewedAt
                ? new Date(review.lastReviewedAt)
                : null,
            }
          : null,
        documentTitle: row.document_title,
      };
    });
  }

  async dueSummary(
    userId: string,
    now: Date,
  ): Promise<{
    due: number;
    documents: number;
    newCount: number;
    byDocument: { title: string; count: number }[];
    nextDueAt: Date | null;
  }> {
    // One pass over the whole due set, grouped by document, so the totals
    // and the per-book breakdown can never disagree with each other.
    const rows = await this.model.sequelize!.query<{
      title: string;
      count: number;
      fresh: number;
    }>(
      `SELECT d.title AS title,
              COUNT(*) AS count,
              SUM(r.id IS NULL) AS fresh
       FROM items i
       JOIN documents d ON d.id = i.document_id AND d.deleted_at IS NULL
       LEFT JOIN item_reviews r ON r.item_id = i.id AND r.user_id = :userId
       WHERE i.retired_at IS NULL AND d.user_id = :userId
         AND (r.id IS NULL OR r.due_at <= :now)
       GROUP BY d.id, d.title
       ORDER BY count DESC`,
      { replacements: { userId, now }, type: QueryTypes.SELECT },
    );

    const [next] = await this.reviews.sequelize!.query<{ due_at: Date }>(
      `SELECT MIN(r.due_at) AS due_at
       FROM item_reviews r
       JOIN items i ON i.id = r.item_id AND i.retired_at IS NULL
       WHERE r.user_id = :userId AND r.due_at > :now`,
      { replacements: { userId, now }, type: QueryTypes.SELECT },
    );

    return {
      due: rows.reduce((sum, row) => sum + Number(row.count), 0),
      documents: rows.length,
      newCount: rows.reduce((sum, row) => sum + Number(row.fresh), 0),
      byDocument: rows.map((row) => ({
        title: row.title,
        count: Number(row.count),
      })),
      nextDueAt: next?.due_at ? new Date(next.due_at) : null,
    };
  }

  async recordStats(
    itemId: string,
    stats: { pValue: number; discrimination: number | null; n: number },
  ): Promise<void> {
    await this.model.update(
      {
        pValue: stats.pValue,
        discrimination: stats.discrimination,
        timesAnswered: stats.n,
      },
      { where: { id: itemId } },
    );
  }

  async retire(itemId: string, now: Date): Promise<void> {
    await this.model.update({ retiredAt: now }, { where: { id: itemId } });
  }

  /**
   * Every response to an item, paired with how that reader is doing overall
   * on the same document — the two series discrimination correlates.
   */
  async responsesFor(
    itemId: string,
  ): Promise<{ correct: boolean; overallScore: number }[]> {
    const rows = await this.reviews.sequelize!.query<{
      last_correct: number | null;
      overall: string | number | null;
    }>(
      `SELECT r.last_correct,
              (SELECT AVG(r2.last_correct)
                 FROM item_reviews r2
                 JOIN items i2 ON i2.id = r2.item_id
                WHERE r2.user_id = r.user_id
                  AND i2.document_id = i.document_id
                  AND r2.last_correct IS NOT NULL) AS overall
         FROM item_reviews r
         JOIN items i ON i.id = r.item_id
        WHERE r.item_id = :itemId AND r.last_correct IS NOT NULL`,
      { replacements: { itemId }, type: QueryTypes.SELECT },
    );

    return rows.map((row) => ({
      correct: Boolean(row.last_correct),
      overallScore: Number(row.overall ?? 0),
    }));
  }
}

@Injectable()
export class SequelizeItemReviewRepository implements ItemReviewRepository {
  constructor(
    @InjectModel(ItemReviewModel)
    private readonly model: typeof ItemReviewModel,
  ) {}

  async find(userId: string, itemId: string): Promise<ItemReviewRecord | null> {
    const row = await this.model.findOne({ where: { userId, itemId } });
    return row ? toReview(row) : null;
  }

  async upsert(
    userId: string,
    itemId: string,
    state: Omit<ItemReviewRecord, 'itemId'>,
  ): Promise<void> {
    const existing = await this.model.findOne({ where: { userId, itemId } });
    if (existing) {
      await existing.update(state);
      return;
    }
    await this.model.create({ id: newId(), userId, itemId, ...state });
  }
}

/** Referenced so the document join above cannot silently drift. */
void DocumentModel;
