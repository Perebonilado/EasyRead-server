import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type { Block, PageStatus } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'simplified_pages', underscored: true, timestamps: true })
export class SimplifiedPageModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  /** The one note a page has now; the column and its value stay for the unique index. */
  @Column({ type: DataType.ENUM('standard'), allowNull: false })
  declare level: 'standard';

  @Column({ type: DataType.JSON, allowNull: true })
  declare blocks: Block[] | null;

  @Column({
    type: DataType.ENUM('pending', 'processing', 'done', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  })
  declare status: PageStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare model: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare tokensIn: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare tokensOut: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}
