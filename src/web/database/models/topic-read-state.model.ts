import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { TopicModel } from './topic.model';
import { UserModel } from './user.model';

@Table({ tableName: 'topic_read_states', underscored: true, timestamps: true })
export class TopicReadStateModel extends BaseModel {
  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare topicId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare readAt: Date;
}
