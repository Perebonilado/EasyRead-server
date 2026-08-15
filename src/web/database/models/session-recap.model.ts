import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { RecapBody } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({ tableName: 'session_recaps', underscored: true, timestamps: true })
export class SessionRecapModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare fromPage: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare toPage: number;

  @Column({ type: DataType.DATE(6), allowNull: true })
  declare since: Date | null;

  @Column({ type: DataType.JSON, allowNull: false })
  declare body: RecapBody;
}
