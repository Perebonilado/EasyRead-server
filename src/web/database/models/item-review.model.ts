import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { ItemModel } from './item.model';
import { UserModel } from './user.model';
import type { CardState } from '../../../business/domain/scheduling';

/**
 * One person's schedule for one item.
 *
 * The FSRS state lives here rather than on the item because the same
 * question is easy for one reader and hard for another, and modelling that
 * difference is the entire value of spaced repetition.
 */
@Table({ tableName: 'item_reviews', underscored: true, timestamps: true })
export class ItemReviewModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => ItemModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare itemId: string;

  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
  declare stability: number;

  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 0 })
  declare difficulty: number;

  @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'new' })
  declare state: CardState;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare reps: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare lapses: number;

  @Column({ type: DataType.DATE, allowNull: false })
  declare dueAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastReviewedAt: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare lastCorrect: boolean | null;
}
