import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({ tableName: 'reading_positions', underscored: true, timestamps: true })
export class ReadingPositionModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare lastPage: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare furthestPage: number;

  @Column({
    type: DataType.ENUM('original', 'standard', 'easiest'),
    allowNull: false,
    defaultValue: 'standard',
  })
  declare level: 'original' | 'standard' | 'easiest';
}
