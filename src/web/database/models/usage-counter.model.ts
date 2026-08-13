import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'usage_counters', underscored: true, timestamps: true })
export class UsageCounterModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare period: string;

  @Column({
    type: DataType.ENUM(
      'documents_uploaded',
      'easiest_conversions',
      'highlight_actions',
    ),
    allowNull: false,
  })
  declare metric:
    'documents_uploaded' | 'easiest_conversions' | 'highlight_actions';

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare count: number;
}
