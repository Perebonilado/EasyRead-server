import { Column, DataType, Table } from 'sequelize-typescript';
import type { ProcessingChannel } from '../../../contracts';
import { BaseModel } from './base';

/** One row: where a school's processing runs, and who last changed it. */
@Table({ tableName: 'platform_settings', underscored: true, timestamps: true })
export class PlatformSettingsModel extends BaseModel {
  @Column({
    type: DataType.ENUM('openai', 'modal'),
    allowNull: false,
    defaultValue: 'openai',
  })
  declare textChannel: ProcessingChannel;

  @Column({
    type: DataType.ENUM('openai', 'modal'),
    allowNull: false,
    defaultValue: 'modal',
  })
  declare audioChannel: ProcessingChannel;

  @Column({ type: DataType.UUID, allowNull: true })
  declare changedBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare changedAt: Date | null;
}
