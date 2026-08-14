import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col, literal } from 'sequelize';
import type { Block, Level } from '../../contracts';
import type {
  LevelProgress,
  SimplifiedPageRecord,
  SimplifiedPageRepository,
} from '../../business/repositories/simplified-page.repository';
import { SimplifiedPageModel } from '../database/models';
import { newId } from '../database/uuid';

const toRecord = (row: SimplifiedPageModel): SimplifiedPageRecord => ({
  pageNumber: row.pageNumber,
  level: row.level,
  status: row.status,
  blocks: row.blocks,
  attempts: row.attempts,
});

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
  async seed(
    documentId: string,
    level: Level,
    pageCount: number,
  ): Promise<void> {
    const rows = Array.from({ length: pageCount }, (_, index) => ({
      id: newId(),
      documentId,
      level,
      pageNumber: index + 1,
      status: 'pending' as const,
    }));
    await this.model.bulkCreate(rows as any, { ignoreDuplicates: true });
  }

  async clear(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } });
  }

  async find(documentId: string, level: Level, pageNumber: number) {
    const row = await this.model.findOne({
      where: { documentId, level, pageNumber },
    });
    return row ? toRecord(row) : null;
  }

  async findRange(documentId: string, level: Level, from: number, to: number) {
    const rows = await this.model.findAll({
      where: { documentId, level, pageNumber: { [Op.between]: [from, to] } },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async findAllDone(documentId: string, level: Level) {
    const rows = await this.model.findAll({
      where: { documentId, level, status: 'done' },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async markProcessing(
    documentId: string,
    level: Level,
    pageNumber: number,
  ): Promise<void> {
    await this.model.update(
      { status: 'processing' },
      { where: { documentId, level, pageNumber, status: 'pending' } },
    );
  }

  async markDone(input: {
    documentId: string;
    level: Level;
    pageNumber: number;
    blocks: Block[];
    model: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<void> {
    await this.model.update(
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
          level: input.level,
          pageNumber: input.pageNumber,
        },
      },
    );
  }

  /** Returns the attempt count so the caller can decide to stop retrying. */
  async markFailed(
    documentId: string,
    level: Level,
    pageNumber: number,
    error: string,
  ): Promise<number> {
    await this.model.update(
      { status: 'failed', error, attempts: literal('attempts + 1') as any },
      { where: { documentId, level, pageNumber } },
    );
    const row = await this.model.findOne({
      where: { documentId, level, pageNumber },
    });
    return row?.attempts ?? 0;
  }

  async progress(documentId: string, level: Level): Promise<LevelProgress> {
    const rows = (await this.model.findAll({
      where: { documentId, level },
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

  async reset(
    documentId: string,
    level: Level,
    pageNumber: number,
  ): Promise<void> {
    await this.model.update(
      { status: 'pending', error: null },
      { where: { documentId, level, pageNumber } },
    );
  }
}
