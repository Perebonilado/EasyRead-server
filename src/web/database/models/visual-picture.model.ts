import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** A picture drawn anew for a thing the library had none of, kept for every page after. */
@Table({ tableName: 'visual_pictures', underscored: true, timestamps: true })
export class VisualPictureModel extends BaseModel {
  @Column({ type: DataType.STRING(80), allowNull: false })
  declare nameKey: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare storageKey: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare width: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare height: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare judged: boolean;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare model: string | null;
}
