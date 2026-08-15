import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'page_assets', underscored: true, timestamps: true })
export class PageAssetModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare contentVersion: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({
    type: DataType.ENUM('figure'),
    allowNull: false,
    defaultValue: 'figure',
  })
  declare kind: 'figure';

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare fileRef: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare mimeType: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare width: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare height: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare caption: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare orderIndex: number;
}
