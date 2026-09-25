import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { isSceneVoiceEngine } from '../../business/domain/scene-voice';
import type {
  AppSettingsRecord,
  AppSettingsRepository,
} from '../../business/repositories/settings.repository';
import { AppSettingsModel } from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeAppSettingsRepository implements AppSettingsRepository {
  constructor(
    @InjectModel(AppSettingsModel)
    private readonly model: typeof AppSettingsModel,
  ) {}

  private toRecord(row: AppSettingsModel): AppSettingsRecord {
    return {
      // A value no engine answers to now is no choice.
      sceneVoice: isSceneVoiceEngine(row.sceneVoice) ? row.sceneVoice : null,
      changedBy: row.changedBy,
      changedAt: row.changedAt,
    };
  }

  private async row(): Promise<AppSettingsModel> {
    const existing = await this.model.findOne({
      order: [['createdAt', 'ASC']],
    });
    if (existing) return existing;
    return this.model.create({
      id: newId(),
      sceneVoice: null,
      changedBy: null,
      changedAt: null,
    } as never);
  }

  async get(): Promise<AppSettingsRecord> {
    return this.toRecord(await this.row());
  }

  async set(
    patch: { sceneVoice?: AppSettingsRecord['sceneVoice'] },
    changedBy: string,
    now: Date,
  ): Promise<AppSettingsRecord> {
    const row = await this.row();
    await row.update({
      ...('sceneVoice' in patch
        ? { sceneVoice: patch.sceneVoice ?? null }
        : {}),
      changedBy,
      changedAt: now,
    });
    return this.toRecord(row);
  }
}
