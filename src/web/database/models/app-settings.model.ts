import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** One row: what the admin switches while the app runs, and who last did. */
@Table({ tableName: 'app_settings', underscored: true, timestamps: true })
export class AppSettingsModel extends BaseModel {
  /** Visualize's voice engine; null leaves it to SCENE_VOICE_ENGINE. */
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare sceneVoice: string | null;

  /**
   * The admin's voices for the narrator and each kind of character, by
   * engine, as JSON ({"elevenlabs":{"narrator":"<voice id>","man":"…"},
   * "cartesia":{"narrator":"<voice uuid>"}});
   * null keeps every engine's own.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare voiceCast: string | null;

  /**
   * Each voice's measured rate, by engine and voice, as JSON
   * ({"kokoro":{"am_puck":{"wpm":168}},"gemini":{"Sulafat":{"wpm":150,
   * "words":{"natural":152}}}}); null keeps each engine's own guess.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare voiceRates: string | null;

  /** What the worker can speak with, as JSON, as it said at its last start. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare workerVoices: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare changedBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare changedAt: Date | null;
}
