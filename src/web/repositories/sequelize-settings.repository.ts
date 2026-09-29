import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  LISTED_ENGINES,
  isSceneVoiceEngine,
  isVoiceIdOf,
  isVoiceRole,
  type VoiceCast,
} from '../../business/domain/scene-voice';
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

/**
 * The admin's voices as kept, by engine; only an engine with a list, a
 * role and a voice id that could be that engine's are read back.
 */
export function voiceCast(kept: string | null): AppSettingsRecord['voiceCast'] {
  if (!kept) return {};
  try {
    const read = JSON.parse(kept) as Record<string, Record<string, unknown>>;
    const out: AppSettingsRecord['voiceCast'] = {};
    for (const engine of LISTED_ENGINES) {
      const cast: VoiceCast = {};
      for (const [role, voice] of Object.entries(read?.[engine] ?? {}))
        if (isVoiceRole(role) && isVoiceIdOf(engine, voice))
          cast[role] = voice as string;
      if (Object.keys(cast).length) out[engine] = cast;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The admin's voices with a patch laid over them: each engine the patch
 * names is replaced, the others kept as they are. Null when none is left.
 */
export function castAfter(
  kept: string | null,
  patch: AppSettingsRecord['voiceCast'],
): string | null {
  const merged = { ...voiceCast(kept), ...patch };
  for (const engine of LISTED_ENGINES)
    if (!Object.keys(merged[engine] ?? {}).length) delete merged[engine];
  return Object.keys(merged).length ? JSON.stringify(merged) : null;
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
      voiceCast: voiceCast(row.voiceCast),
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
      voiceCast: null,
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
    patch: {
      sceneVoice?: AppSettingsRecord['sceneVoice'];
      voiceCast?: AppSettingsRecord['voiceCast'];
    },
    changedBy: string,
    now: Date,
  ): Promise<AppSettingsRecord> {
    const row = await this.row();
    await row.update({
      ...('sceneVoice' in patch
        ? { sceneVoice: patch.sceneVoice ?? null }
        : {}),
      ...(patch.voiceCast
        ? { voiceCast: castAfter(row.voiceCast, patch.voiceCast) }
        : {}),
      changedBy,
      changedAt: now,
    });
    return this.toRecord(row);
  }
}
