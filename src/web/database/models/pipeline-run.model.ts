import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { PipelineStatus, PipelineStep } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';

@Table({ tableName: 'pipeline_runs', underscored: true, timestamps: true })
export class PipelineRunModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({
    type: DataType.ENUM(
      'convert',
      'extract',
      'summarize',
      'topics',
      'embed',
      'simplify_standard',
      'simplify_easiest',
      'export',
    ),
    allowNull: false,
  })
  declare step: PipelineStep;

  @Column({
    type: DataType.ENUM('queued', 'running', 'done', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'queued',
  })
  declare status: PipelineStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare startedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare finishedAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}
