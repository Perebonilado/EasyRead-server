import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type { BillingInterval, SubscriptionStatus } from '../../../contracts';
import { BaseModel } from './base';
import { UserModel } from './user.model';

/**
 * One row per user, holding what the gateway last told us.
 *
 * Deliberately provider-agnostic: `provider` names who is billing and the
 * ids are opaque strings, so moving from Paddle to Stripe adds a value to
 * the enum rather than a second table.
 */
@Table({ tableName: 'subscriptions', underscored: true, timestamps: true })
export class SubscriptionModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: 'stripe',
  })
  declare provider: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare planCode: string;

  @Column({ type: DataType.ENUM('monthly', 'yearly'), allowNull: true })
  declare interval: BillingInterval | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare providerSubscriptionId: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare providerCustomerId: string | null;

  @Column({
    type: DataType.ENUM(
      'active',
      'trialing',
      'past_due',
      'paused',
      'cancelled',
      'expired',
    ),
    allowNull: false,
  })
  declare status: SubscriptionStatus;

  @Column({ type: DataType.DATE, allowNull: true })
  declare currentPeriodEnd: Date | null;

  /** Cancelled, but paid through `currentPeriodEnd`. Still Pro until then. */
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare cancelAtPeriodEnd: boolean;

  @Column({ type: DataType.JSON, allowNull: true })
  declare raw: unknown;

  /**
   * When the gateway event that last wrote this row happened — not when we
   * wrote it. Gateways do not guarantee delivery order, so this is what
   * lets a stale event be recognised and dropped.
   */
  @Column({ type: DataType.DATE, allowNull: true })
  declare lastEventAt: Date | null;
}
