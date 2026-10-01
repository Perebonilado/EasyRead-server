import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** A Studio film made into a video file: what was asked for, how far it has got, and the file once it is made. */
@Table({ tableName: 'studio_exports', underscored: true, timestamps: true })
export class StudioExportModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: false })
  declare showId: string;

  /** The episode it was asked from (a twin's lead: either shape lists it). */
  @Column({ type: DataType.UUID, allowNull: false })
  declare episodeId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  /** 'episode' or 'show'. */
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare scope: string;

  /** 'wide' or 'tall'. */
  @Column({ type: DataType.STRING(8), allowNull: false })
  declare shape: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare captions: boolean;

  /** 'queued', 'rendering', 'done' or 'failed'. */
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: string;

  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
  declare progress: number;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare fileKey: string | null;

  /** MySQL hands a BIGINT back as a string. */
  @Column({ type: DataType.BIGINT, allowNull: true })
  declare bytes: number | string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  /** What the video is made from (studio-export filmPrint). */
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare filmHash: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
