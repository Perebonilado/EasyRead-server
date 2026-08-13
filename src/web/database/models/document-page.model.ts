import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'document_pages', underscored: true, timestamps: true })
export class DocumentPageModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({ type: DataType.TEXT('long'), allowNull: false })
  declare text: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare charCount: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isEmpty: boolean;
}
