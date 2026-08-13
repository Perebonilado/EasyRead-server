import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'subscriptions', underscored: true, timestamps: true })
export class SubscriptionModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @Column({
    type: DataType.ENUM('paystack'),
    allowNull: false,
    defaultValue: 'paystack',
  })
  declare provider: 'paystack';

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare planCode: string;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare subscriptionCode: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare customerCode: string | null;

  @Column({
    type: DataType.ENUM(
      'active',
      'non_renewing',
      'attention',
      'cancelled',
      'expired',
    ),
    allowNull: false,
  })
  declare status:
    'active' | 'non_renewing' | 'attention' | 'cancelled' | 'expired';

  @Column({ type: DataType.DATE, allowNull: true })
  declare currentPeriodEnd: Date | null;

  @Column({ type: DataType.JSON, allowNull: true })
  declare raw: unknown;
}
