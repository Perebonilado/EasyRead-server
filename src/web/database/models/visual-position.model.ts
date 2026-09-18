import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

/** Where a learner stopped in a document's visuals: the page and the time into it. */
@Table({ tableName: 'visual_positions', underscored: true, timestamps: true })
export class VisualPositionModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare offsetMs: number;
}
