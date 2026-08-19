import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from 'sequelize-typescript';
import type {
  DocumentSource,
  DocumentBrief,
  DocumentStatus,
  ImportManifest,
} from '../../../contracts';
import { BaseModel } from './base';
import { DocumentPageModel } from './document-page.model';
import { SimplifiedPageModel } from './simplified-page.model';
import { UserModel } from './user.model';

@Table({ tableName: 'documents', underscored: true, timestamps: true })
export class DocumentModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare title: string;

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare fileName: string;

  @Column({
    type: DataType.ENUM('uploading', 'processing', 'ready', 'failed'),
    allowNull: false,
    defaultValue: 'uploading',
  })
  declare status: DocumentStatus;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageCount: number | null;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare sourceMimeType: string;

  @Column({
    type: DataType.ENUM('uploaded', 'generated', 'imported', 'starter'),
    allowNull: false,
    defaultValue: 'uploaded',
  })
  declare source: DocumentSource;

  @Column({ type: DataType.JSON, allowNull: true })
  declare brief: DocumentBrief | null;

  @Column({ type: DataType.STRING(2048), allowNull: true })
  declare sourceUrl: string | null;

  @Column({ type: DataType.JSON, allowNull: true })
  declare importManifest: ImportManifest | null;

  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare sizeBytes: number;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare originalFileRef: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare canonicalPdfRef: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare thumbnailRef: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare contentVersion: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare simplificationUnavailable: boolean;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare failureReason: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedAt: Date | null;

  @HasMany(() => DocumentPageModel)
  declare pages?: DocumentPageModel[];

  @HasMany(() => SimplifiedPageModel)
  declare simplifiedPages?: SimplifiedPageModel[];
}
