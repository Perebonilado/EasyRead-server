import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
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
    const { costUsd, ...row } = input;
    const costEstimate = costUsd ?? costOf(row);
    await this.logs.create({
      id: newId(),
      ...row,
      costEstimate: costEstimate === null ? null : costEstimate.toFixed(6),
    } as never);
  }
}
