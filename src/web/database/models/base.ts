import { Column, DataType, Model } from 'sequelize-typescript';

/**
 * Every table has a uuid v7 primary key generated in application code (MySQL
 * has no native uuid7()), so ids stay time-ordered and index well.
 */
export abstract class BaseModel<T extends object = any> extends Model<T> {
  @Column({ type: DataType.UUID, primaryKey: true, allowNull: false })
  declare id: string;
}
