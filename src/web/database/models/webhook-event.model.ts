import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

@Table({ tableName: 'webhook_events', underscored: true, timestamps: true })
export class WebhookEventModel extends BaseModel {
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(191), allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare eventType: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare payload: unknown;

  @Column({ type: DataType.DATE, allowNull: true })
  declare processedAt: Date | null;
}
