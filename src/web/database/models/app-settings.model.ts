import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** One row: what the admin switches while the app runs, and who last did. */
@Table({ tableName: 'app_settings', underscored: true, timestamps: true })
export class AppSettingsModel extends BaseModel {
  /** Visualize's voice engine; null leaves it to SCENE_VOICE_ENGINE. */
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare sceneVoice: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare changedBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare changedAt: Date | null;
}
