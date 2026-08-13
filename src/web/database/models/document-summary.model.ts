import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'document_summaries', underscored: true, timestamps: true })
export class DocumentSummaryModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare documentId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare summary: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare model: string;
}
