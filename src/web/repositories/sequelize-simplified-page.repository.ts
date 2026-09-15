import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col, literal } from 'sequelize';
import type { Block } from '../../contracts';
import type {
  LevelProgress,
  SimplifiedPageRecord,
  SimplifiedPageRepository,
} from '../../business/repositories/simplified-page.repository';
import { SimplifiedPageModel } from '../database/models';
import { newId } from '../database/uuid';

const toRecord = (row: SimplifiedPageModel): SimplifiedPageRecord => ({
  pageNumber: row.pageNumber,
  status: row.status,
  blocks: row.blocks,
  attempts: row.attempts,
});

/**
 * MySQL resolves a deadlock by killing one side; the loser is meant to try
 * again. Ten pages simplify at once and all write this table, so a status
 * write that lost the race is repeated a few times before it counts as a
 * failure. Without this a page stays pending forever and the document
 * never reaches ready.
 */
/** The one simplified note a page has; the column keeps its old name. */
const LEVEL = 'standard' as const;

async function withDeadlockRetry<T>(write: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      lastError = error;
      const message = (error as Error).message ?? '';
      if (!/deadlock|lock wait timeout/i.test(message)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 50 * attempt + Math.random() * 100),
      );
    }
  }
  throw lastError;
}

@Injectable()
export class SequelizeSimplifiedPageRepository implements SimplifiedPageRepository {
  constructor(
    @InjectModel(SimplifiedPageModel)
    private readonly model: typeof SimplifiedPageModel,
  ) {}

  /**
   * Pre-creates a pending row per page. `ignoreDuplicates` makes re-running the
   * fan-out harmless — pages already written keep their state.
   */
  async seed(documentId: string, pageCount: number): Promise<void> {
    const rows = Array.from({ length: pageCount }, (_, index) => ({
      id: newId(),
      documentId,
      level: LEVEL,
      pageNumber: index + 1,
      status: 'pending' as const,
    }));
    await this.model.bulkCreate(rows as any, { ignoreDuplicates: true });
  }

  async clear(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } });
  }

  async find(documentId: string, pageNumber: number) {
    const row = await this.model.findOne({
      where: { documentId, level: LEVEL, pageNumber },
    });
    return row ? toRecord(row) : null;
  }

  async findRange(documentId: string, from: number, to: number) {
    const rows = await this.model.findAll({
      where: {
        documentId,
        level: LEVEL,
        pageNumber: { [Op.between]: [from, to] },
      },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async findAllDone(documentId: string) {
    const rows = await this.model.findAll({
      where: { documentId, level: LEVEL, status: 'done' },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async markProcessing(documentId: string, pageNumber: number): Promise<void> {
    await this.model.update(
      { status: 'processing' },
      { where: { documentId, level: LEVEL, pageNumber, status: 'pending' } },
    );
  }

  async markDone(input: {
    documentId: string;
    pageNumber: number;
    blocks: Block[];
    model: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<void> {
    await withDeadlockRetry(() =>
      this.model.update(
        {
          status: 'done',
          blocks: input.blocks,
          model: input.model,
          tokensIn: input.tokensIn,
          tokensOut: input.tokensOut,
          error: null,
        },
        {
          where: {
            documentId: input.documentId,
            level: LEVEL,
            pageNumber: input.pageNumber,
          },
        },
      ),
    );
  }

  /** Returns the attempt count so the caller can decide to stop retrying. */
  async markFailed(
    documentId: string,
    pageNumber: number,
    error: string,
  ): Promise<number> {
    await withDeadlockRetry(() =>
      this.model.update(
        { status: 'failed', error, attempts: literal('attempts + 1') },
        { where: { documentId, level: LEVEL, pageNumber } },
      ),
    );
    const row = await this.model.findOne({
      where: { documentId, level: LEVEL, pageNumber },
    });
    return row?.attempts ?? 0;
  }

  async progress(documentId: string): Promise<LevelProgress> {
    const rows = (await this.model.findAll({
      where: { documentId, level: LEVEL },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    })) as unknown as { status: string; count: number }[];

    let done = 0;
    let failed = 0;
    let total = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      if (row.status === 'done') done = count;
      if (row.status === 'failed') failed = count;
    }
    return { done, failed, total };
  }

  async reset(documentId: string, pageNumber: number): Promise<void> {
    await this.model.update(
      { status: 'pending', error: null },
      { where: { documentId, level: LEVEL, pageNumber } },
    );
  }
}
