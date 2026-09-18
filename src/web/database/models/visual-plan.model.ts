import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';

/** A chapter's visual plan, made once and read by every page's tutorial. */
@Table({ tableName: 'visual_plans', underscored: true, timestamps: true })
export class VisualPlanModel extends BaseModel {
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

  @Column({ type: DataType.JSON, allowNull: false })
  declare plan: unknown;
}
