import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { StruggleKind } from '../../../business/domain/struggle';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';
import { UserModel } from './user.model';

@Table({ tableName: 'struggle_signals', underscored: true, timestamps: true })
export class StruggleSignalModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageNumber: number | null;

  @Column({
    type: DataType.ENUM(
      'quiz_wrong',
      'quiz_right',
      'chat_question',
      'highlight_explain',
      'prereq_requested',
      'reread',
      'long_dwell',
      'still_not_clear',
    ),
    allowNull: false,
  })
  declare kind: StruggleKind;

  @Column({ type: DataType.FLOAT, allowNull: false })
  declare weight: number;

  @Column({ type: DataType.JSON, allowNull: true })
  declare meta: Record<string, unknown> | null;
}
