import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  AiCallLogInput,
  AiCallLogRepository,
} from '../../business/repositories/ai-call-log.repository';
import { AiCallLogModel } from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeAiCallLogRepository implements AiCallLogRepository {
  constructor(
    @InjectModel(AiCallLogModel) private readonly logs: typeof AiCallLogModel,
  ) {}

  async record(input: AiCallLogInput): Promise<void> {
    await this.logs.create({ id: newId(), ...input } as never);
  }
}
