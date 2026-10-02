import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/**
 * The picture desk's cache (migration 0066): a file it judged, cleared
 * with our copy or refused with why, or a question it answered ('lookup').
 */
@Table({ tableName: 'picture_cache', underscored: true, timestamps: true })
export class PictureCacheModel extends BaseModel {
  @Column({ type: DataType.STRING(32), allowNull: true })
  declare qid: string | null;

  /** 'commons', 'nasa', 'met' or 'lookup'. */
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare source: string;

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare sourceId: string;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare kind: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare subject: string | null;

  @Column({ type: DataType.STRING(1024), allowNull: true })
  declare url: string | null;

  @Column({ type: DataType.STRING(1024), allowNull: true })
  declare sourceUrl: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare licence: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare credit: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare chip: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare width: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare height: number | null;

  /** JSON [x, y, w, h] in our copy's pixels. */
  @Column({ type: DataType.STRING(128), allowNull: true })
  declare focal: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare sha1: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare mime: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare storageKey: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare depthKey: string | null;

  /** JSON. */
  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare meta: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare checkedAt: Date;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare refusedReason: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
