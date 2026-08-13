import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { HighlightAction } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({ tableName: 'highlight_lookups', underscored: true, timestamps: true })
export class HighlightLookupModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({
    type: DataType.ENUM('explain', 'simplify', 'define', 'visualize'),
    allowNull: false,
  })
  declare action: HighlightAction;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare selection: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageNumber: number | null;

  @Column({ type: DataType.JSON, allowNull: true })
  declare answer: unknown;
}
