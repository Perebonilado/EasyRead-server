import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { TopicModel } from './topic.model';

@Table({
  tableName: 'topic_prerequisites',
  underscored: true,
  timestamps: true,
})
export class TopicPrerequisiteModel extends BaseModel {
  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare topicId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare orderIndex: number;

  @Column({ type: DataType.STRING(300), allowNull: false })
  declare concept: string;

  @Column({ type: DataType.STRING(600), allowNull: false })
  declare why: string;

  @Column({ type: DataType.ENUM('internal', 'external'), allowNull: false })
  declare kind: 'internal' | 'external';

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare coveredByTopicId: string | null;
}
