import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { UserModel } from './user.model';

/** One row per user: purchased voice seconds that never expire. */
@Table({ tableName: 'voice_credits', underscored: true, timestamps: true })
export class VoiceCreditModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare balanceSeconds: number;
}
