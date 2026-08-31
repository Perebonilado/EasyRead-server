import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';
import type { ItemKind } from '../../../business/domain/items';

/**
 * One question. A row, not a slice of a JSON blob — which is what makes a
 * review queue, per-item history and item statistics possible at all.
 */
@Table({ tableName: 'items', underscored: true, timestamps: true })
export class ItemModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare kind: ItemKind;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare stem: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare options: string[];

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare correctIndex: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare explanation: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare hint: string | null;

  /** The verifier's verbatim quote: "here is where this came from". */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare groundingQuote: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sourcePage: number | null;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare generatorVersion: string;

  @Column({ type: DataType.FLOAT, allowNull: true })
  declare pValue: number | null;

  @Column({ type: DataType.FLOAT, allowNull: true })
  declare discrimination: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare timesAnswered: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare retiredAt: Date | null;
}
