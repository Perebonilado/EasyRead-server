import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { isSceneVoiceEngine } from '../../business/domain/scene-voice';
import type {
  AppSettingsRecord,
  AppSettingsRepository,
  WorkerVoices,
} from '../../business/repositories/settings.repository';
import { AppSettingsModel } from '../database/models';
import { newId } from '../database/uuid';

/** The worker's voices as kept; null for none, or for what cannot be read. */
function workerVoices(kept: string | null): WorkerVoices | null {
  if (!kept) return null;
  try {
    const read = JSON.parse(kept) as WorkerVoices;
    return read?.ready && isSceneVoiceEngine(read.deployment) ? read : null;
  } catch {
    return null;
  }
}

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
      worker: workerVoices(row.workerVoices),
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
      workerVoices: null,
      changedBy: null,
      changedAt: null,
    } as never);
  }

  async get(): Promise<AppSettingsRecord> {
    return this.toRecord(await this.row());
  }

  async announce(worker: WorkerVoices): Promise<void> {
    const row = await this.row();
    await row.update({ workerVoices: JSON.stringify(worker) });
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
