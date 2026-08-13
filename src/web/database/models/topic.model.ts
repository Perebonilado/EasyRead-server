import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'topics', underscored: true, timestamps: true })
export class TopicModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  // Topics are addressed by id with no document in the path, so ownership is
  // proven by joining through to the document's owner.
  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare title: string;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare shortDescription: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare startPage: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare endPage: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare orderIndex: number;

  @Column({
    type: DataType.ENUM('outline_pass', 'page_tagging'),
    allowNull: false,
  })
  declare source: 'outline_pass' | 'page_tagging';
}
