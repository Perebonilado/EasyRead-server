import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';
import { UserModel } from './user.model';

@Table({ tableName: 'assessment_events', underscored: true, timestamps: true })
export class AssessmentEventModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  @Column({
    type: DataType.ENUM('mcq', 'flashcard', 'verbal'),
    allowNull: false,
  })
  declare kind: 'mcq' | 'flashcard' | 'verbal';

  @Column({ type: DataType.FLOAT, allowNull: false })
  declare score: number;

  @Column({ type: DataType.JSON, allowNull: true })
  declare payload: unknown;
}
