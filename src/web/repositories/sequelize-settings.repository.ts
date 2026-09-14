import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { ProcessingChannels } from '../../contracts';
import { DEFAULT_CHANNELS } from '../../business/domain/processing';
import type {
  ProcessingSettingsRecord,
  ProcessingSettingsRepository,
} from '../../business/repositories/settings.repository';
import { PlatformSettingsModel } from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeProcessingSettingsRepository implements ProcessingSettingsRepository {
  constructor(
    @InjectModel(PlatformSettingsModel)
    private readonly model: typeof PlatformSettingsModel,
  ) {}

  private toRecord(row: PlatformSettingsModel): ProcessingSettingsRecord {
    return {
      channels: { text: row.textChannel, audio: row.audioChannel },
      changedBy: row.changedBy,
      changedAt: row.changedAt,
    };
  }

  private async row(): Promise<PlatformSettingsModel> {
    const existing = await this.model.findOne({
      order: [['createdAt', 'ASC']],
    });
    if (existing) return existing;
    return this.model.create({
      id: newId(),
      textChannel: DEFAULT_CHANNELS.text,
      audioChannel: DEFAULT_CHANNELS.audio,
      changedBy: null,
      changedAt: null,
    } as never);
  }

  async get(): Promise<ProcessingSettingsRecord> {
    return this.toRecord(await this.row());
  }

  async set(
    channels: ProcessingChannels,
    changedBy: string,
    now: Date,
  ): Promise<ProcessingSettingsRecord> {
    const row = await this.row();
    await row.update({
      textChannel: channels.text,
      audioChannel: channels.audio,
      changedBy,
      changedAt: now,
    });
    return this.toRecord(row);
  }
}
