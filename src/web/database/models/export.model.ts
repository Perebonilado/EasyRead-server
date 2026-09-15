import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'exports', underscored: true, timestamps: true })
export class ExportModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  /** The one note a document has now; the column stays as part of the cache key. */
  @Column({ type: DataType.ENUM('standard'), allowNull: false })
  declare level: 'standard';

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare contentVersion: number;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare fileRef: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare watermarked: boolean;

  @Column({
    type: DataType.ENUM('processing', 'done', 'failed'),
    allowNull: false,
    defaultValue: 'processing',
  })
  declare status: 'processing' | 'done' | 'failed';

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}
