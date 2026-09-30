import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type WhereOptions } from 'sequelize';
import type {
  AiCallLogInput,
  AiCallLogRepository,
} from '../../business/repositories/ai-call-log.repository';
import { costOf } from '../../business/domain/cost';
import { AiCallLogModel } from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeAiCallLogRepository implements AiCallLogRepository {
  constructor(
    @InjectModel(AiCallLogModel) private readonly logs: typeof AiCallLogModel,
  ) {}

  async record(input: AiCallLogInput): Promise<void> {
    // Priced as it lands, so spend per document is a sum and not a guess.
    const { costUsd, tokensCached, ...row } = input;
    const costEstimate = costUsd ?? costOf({ ...row, tokensCached });
    await this.logs.create({
      id: newId(),
      ...row,
      costEstimate: costEstimate === null ? null : costEstimate.toFixed(6),
    } as never);
  }

  async spentUsd(filter: {
    task: string;
    modelPrefix: string;
    documentId?: string;
    since?: Date;
  }): Promise<number> {
    const where: WhereOptions = {
      task: filter.task,
      model: { [Op.startsWith]: filter.modelPrefix },
      ...(filter.documentId ? { documentId: filter.documentId } : {}),
      ...(filter.since ? { createdAt: { [Op.gte]: filter.since } } : {}),
    };
    const sum = (await this.logs.sum('costEstimate', { where })) as
      number | string | null;
    const usd = Number(sum ?? 0);
    return Number.isFinite(usd) ? usd : 0;
  }
}
