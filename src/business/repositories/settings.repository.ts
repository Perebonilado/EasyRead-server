import type { SceneVoiceEngine } from '../domain/scene-voice';

export interface AppSettingsRecord {
  /** Visualize's voice, as the admin chose it; null for the deployment's own. */
  sceneVoice: SceneVoiceEngine | null;
  changedBy: string | null;
  changedAt: Date | null;
}

/** The one row of settings the admin switches: made empty when missing. */
export interface AppSettingsRepository {
  get(): Promise<AppSettingsRecord>;
  set(
    patch: { sceneVoice?: SceneVoiceEngine | null },
    changedBy: string,
    now: Date,
  ): Promise<AppSettingsRecord>;
}
