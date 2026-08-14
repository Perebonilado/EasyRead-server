import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type {
  ProfileChangeField,
  ProfileChangeSource,
} from '../../../business/repositories/learning.repository';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'profile_changes', underscored: true, timestamps: true })
export class ProfileChangeModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({
    type: DataType.ENUM('pace', 'depth', 'interactivity', 'style_notes'),
    allowNull: false,
  })
  declare field: ProfileChangeField;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare fromValue: string | null;

  @Column({ type: DataType.STRING(300), allowNull: false })
  declare toValue: string;

  @Column({
    type: DataType.ENUM('auto', 'tutor', 'manual'),
    allowNull: false,
  })
  declare source: ProfileChangeSource;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare reason: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare narratedAt: Date | null;
}
