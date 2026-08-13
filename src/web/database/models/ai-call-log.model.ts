import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

@Table({ tableName: 'ai_call_logs', underscored: true, timestamps: true })
export class AiCallLogModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: true })
  declare documentId: string | null;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare task: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare model: string;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare promptId: string | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare promptVersion: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare tokensIn: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare tokensOut: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare latencyMs: number | null;

  @Column({ type: DataType.DECIMAL(12, 6), allowNull: true })
  declare costEstimate: string | null;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare outcome: string;
}
