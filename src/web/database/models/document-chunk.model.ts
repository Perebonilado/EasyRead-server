import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'document_chunks', underscored: true, timestamps: true })
export class DocumentChunkModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare chunkIndex: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare text: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare embedding: number[];

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare dimensions: number;
}
