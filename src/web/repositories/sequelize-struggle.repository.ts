import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { SIGNAL_WEIGHT } from '../../business/domain/struggle';
import type { StruggleSignalRecord } from '../../business/domain/struggle';
import type {
  RecordSignalInput,
  StruggleSignalRepository,
} from '../../business/repositories/struggle.repository';
import { StruggleSignalModel } from '../database/models/struggle-signal.model';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeStruggleSignalRepository implements StruggleSignalRepository {
  constructor(
    @InjectModel(StruggleSignalModel)
    private readonly model: typeof StruggleSignalModel,
  ) {}

  async record(input: RecordSignalInput): Promise<void> {
    await this.model.create({
      id: newId(),
      userId: input.userId,
      documentId: input.documentId,
      topicId: input.topicId ?? null,
      pageNumber: input.pageNumber ?? null,
      kind: input.kind,
      // Derived here, in one place, so a weight change never needs a backfill
      // of producers — only of this mapping.
      weight: SIGNAL_WEIGHT[input.kind],
      meta: input.meta ?? null,
    } as never);
  }

  async window(
    userId: string,
    documentId: string,
    since: Date,
    limit: number,
  ): Promise<StruggleSignalRecord[]> {
    const rows = await this.model.findAll({
      where: {
        userId,
        documentId,
        createdAt: { [Op.gte]: since },
      } as never,
      order: [['createdAt', 'DESC']] as never,
      limit,
    });
    return rows.map((row) => ({
      kind: row.kind,
      weight: row.weight,
      topicId: row.topicId,
      pageNumber: row.pageNumber,
      createdAt: row.get('createdAt') as Date,
    }));
  }
}
