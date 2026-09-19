import { Column, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** What a page asked to be drawn and what was found for it; no drawing means nothing in the library draws it. */
@Table({ tableName: 'visual_terms', underscored: true, timestamps: true })
export class VisualTermModel extends BaseModel {
  @Column({ type: DataType.STRING(120), allowNull: false })
  declare term: string;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare drawing: string | null;

  @Column({
    type: DataType.ENUM('spelling', 'meaning', 'hand'),
    allowNull: false,
    defaultValue: 'spelling',
  })
  declare foundBy: 'spelling' | 'meaning' | 'hand';

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare times: number;

  @Column({ type: DataType.UUID, allowNull: true })
  declare documentId: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageNumber: number | null;
}
