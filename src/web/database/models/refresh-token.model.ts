import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'refresh_tokens', underscored: true, timestamps: true })
export class RefreshTokenModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  declare tokenHash: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare familyId: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare revokedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare replacedById: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare userAgent: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare ip: string | null;
}
