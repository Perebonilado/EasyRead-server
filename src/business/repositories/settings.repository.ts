import type { SceneVoiceEngine } from '../domain/scene-voice';

/**
 * The voices the worker can speak with, as it said when it last started:
 * the worker voices the pages, and may have a voice server the API has not.
 */
export interface WorkerVoices {
  ready: Record<SceneVoiceEngine, boolean>;
  deployment: SceneVoiceEngine;
  /** Each engine's model and voice there; null for one not set up. */
  labels: Record<SceneVoiceEngine, { model: string; voice: string } | null>;
  at: string;
}

export interface AppSettingsRecord {
  /** Visualize's voice, as the admin chose it; null for the deployment's own. */
  sceneVoice: SceneVoiceEngine | null;
  /** Null until a worker has started since there were settings. */
  worker: WorkerVoices | null;
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
  /** What the worker can speak with, said as it starts. */
  announce(worker: WorkerVoices): Promise<void>;
}
