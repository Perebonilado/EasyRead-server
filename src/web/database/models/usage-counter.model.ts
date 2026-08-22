import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { UsageMetric } from '../../../business/domain/values';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'usage_counters', underscored: true, timestamps: true })
export class UsageCounterModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare period: string;

  // A plain string, not an enum: validity lives in the UsageMetric union,
  // and a new metric must not need a schema migration.
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare metric: UsageMetric;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare count: number;
}
