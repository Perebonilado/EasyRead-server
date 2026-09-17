import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type { VisualSceneStatus } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';

/** One chapter of a document as a short timed scene, made once per document version. */
@Table({ tableName: 'visual_scenes', underscored: true, timestamps: true })
export class VisualSceneModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare topicId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare contentVersion: number;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare generatorVersion: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: VisualSceneStatus;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare step: string | null;

  @Column({ type: DataType.STRING(8), allowNull: true })
  declare fit: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare fitReason: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare title: string | null;

  @Column({ type: DataType.JSON, allowNull: true })
  declare timeline: unknown;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare audioKey: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare requestedBy: string | null;
}
