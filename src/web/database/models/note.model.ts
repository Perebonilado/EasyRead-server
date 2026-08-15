import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type { NoteSource } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';
import { UserModel } from './user.model';

@Table({ tableName: 'notes', underscored: true, timestamps: true })
export class NoteModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.TEXT('long'), allowNull: false })
  declare body: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageNumber: number | null;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare quotedText: string | null;

  @Column({
    type: DataType.ENUM('typed', 'highlight', 'chat', 'lesson', 'recap'),
    allowNull: false,
    defaultValue: 'typed',
  })
  declare source: NoteSource;

  /** Read outside the reader, a note has to be able to name its document. */
  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;
}
