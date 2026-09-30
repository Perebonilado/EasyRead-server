import type {
  ElevenLabsModel,
  ListedEngine,
  SceneVoiceEngine,
  VoiceCast,
} from '../domain/scene-voice';
import type { VoiceRates } from '../domain/scene-pace';

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

/** The admin's model for each engine with more than one. */
export type VoiceModels = { elevenlabs?: ElevenLabsModel };

export interface AppSettingsRecord {
  /** Visualize's voice, as the admin chose it; null for the deployment's own. */
  sceneVoice: SceneVoiceEngine | null;
  /** The admin's voices for the narrator and each kind of character, by engine: ElevenLabs' and Cartesia's. */
  voiceCast: Partial<Record<ListedEngine, VoiceCast>>;
  /** Each voice's measured rate (voice:calibrate); absent or empty until measured. */
  voiceRates?: VoiceRates;
  /** The model an engine with more than one speaks with, as the admin chose (ElevenLabs' v4 or v3); absent keeps its own. */
  voiceModels?: VoiceModels;
  /** Null until a worker has started since there were settings. */
  worker: WorkerVoices | null;
  changedBy: string | null;
  changedAt: Date | null;
}

/** The one row of settings the admin switches: made empty when missing. */
export interface AppSettingsRepository {
  get(): Promise<AppSettingsRecord>;
  set(
    patch: {
      sceneVoice?: SceneVoiceEngine | null;
      voiceCast?: AppSettingsRecord['voiceCast'];
      /** Rates measured, laid over those kept, voice by voice. */
      voiceRates?: VoiceRates;
      /** An engine's model: a value sets it, null gives it back to the engine's own. */
      voiceModels?: { elevenlabs?: ElevenLabsModel | null };
    },
    changedBy: string,
    now: Date,
  ): Promise<AppSettingsRecord>;
  /** What the worker can speak with, said as it starts. */
  announce(worker: WorkerVoices): Promise<void>;
}
