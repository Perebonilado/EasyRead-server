import { Column, DataType, HasMany, HasOne, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { SubscriptionModel } from './subscription.model';

@Table({ tableName: 'users', underscored: true, timestamps: true })
export class UserModel extends BaseModel {
  @Column({ type: DataType.STRING(320), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare passwordHash: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare googleId: string | null;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare name: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare emailVerifiedAt: Date | null;

  @Column({
    type: DataType.ENUM('standard', 'easiest'),
    allowNull: false,
    defaultValue: 'standard',
  })
  declare defaultLevel: 'standard' | 'easiest';

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare verificationTokenHash: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare verificationTokenExpires: Date | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare resetTokenHash: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resetTokenExpires: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare tokenVersion: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedAt: Date | null;

  @HasOne(() => SubscriptionModel)
  declare subscription?: SubscriptionModel;

  @HasMany(() => DocumentModel)
  declare documents?: DocumentModel[];
}
