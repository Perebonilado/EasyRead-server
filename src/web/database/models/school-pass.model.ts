import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type { SubscriptionStatus } from '../../../contracts';
import { BaseModel } from './base';
import { InstitutionModel } from './institution.model';
import { UserModel } from './user.model';

/**
 * A person's standing with one school's library: the one document they
 * opened free, and the yearly pass once bought, held the way
 * `subscriptions` holds Pro. One row per person and school, whether or
 * not they ever paid.
 */
@Table({ tableName: 'school_passes', underscored: true, timestamps: true })
export class SchoolPassModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @ForeignKey(() => InstitutionModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare institutionId: string;

  @BelongsTo(() => InstitutionModel)
  declare institution?: InstitutionModel;

  /** The one school document opened free, ever. */
  @Column({ type: DataType.UUID, allowNull: true })
  declare freeDocumentId: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare freeDocumentAt: Date | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare provider: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare providerSubscriptionId: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare providerCustomerId: string | null;

  /** Null until a pass was ever bought. */
  @Column({
    type: DataType.ENUM(
      'active',
      'trialing',
      'past_due',
      'paused',
      'cancelled',
      'expired',
    ),
    allowNull: true,
  })
  declare status: SubscriptionStatus | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare currentPeriodEnd: Date | null;

  /** Stops renewing at `currentPeriodEnd`; reads until then. */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare cancelAtPeriodEnd: boolean;

  @Column({ type: DataType.JSON, allowNull: true })
  declare raw: unknown;

  /** When the gateway event that last wrote the pass happened, for ordering. */
  @Column({ type: DataType.DATE, allowNull: true })
  declare lastEventAt: Date | null;
}
