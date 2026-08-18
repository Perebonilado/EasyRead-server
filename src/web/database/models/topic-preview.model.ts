import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { TopicPreviewBody } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';

@Table({ tableName: 'topic_previews', underscored: true, timestamps: true })
export class TopicPreviewModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare topicId: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare body: TopicPreviewBody;
}
