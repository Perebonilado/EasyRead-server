import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { DialSource } from '../../../business/repositories/learning.repository';
import { BaseModel } from './base';
import { UserModel } from './user.model';

@Table({ tableName: 'learner_profiles', underscored: true, timestamps: true })
export class LearnerProfileModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare userId: string;

  @Column({
    type: DataType.ENUM('slower', 'steady', 'faster'),
    allowNull: false,
    defaultValue: 'steady',
  })
  declare pace: 'slower' | 'steady' | 'faster';

  @Column({
    type: DataType.ENUM('lighter', 'standard', 'deeper'),
    allowNull: false,
    defaultValue: 'standard',
  })
  declare depth: 'lighter' | 'standard' | 'deeper';

  @Column({
    type: DataType.ENUM('less', 'standard', 'more'),
    allowNull: false,
    defaultValue: 'standard',
  })
  declare interactivity: 'less' | 'standard' | 'more';

  @Column({ type: DataType.TEXT, allowNull: true })
  declare styleNotes: string | null;

  /** How the learner asked to be taught every document; null until they say "use for all". */
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare lectureStyle: string | null;

  @Column({
    type: DataType.ENUM('default', 'auto', 'manual'),
    allowNull: false,
    defaultValue: 'default',
  })
  declare paceSource: DialSource;

  @Column({
    type: DataType.ENUM('default', 'auto', 'manual'),
    allowNull: false,
    defaultValue: 'default',
  })
  declare depthSource: DialSource;

  @Column({
    type: DataType.ENUM('default', 'auto', 'manual'),
    allowNull: false,
    defaultValue: 'default',
  })
  declare interactivitySource: DialSource;
}
