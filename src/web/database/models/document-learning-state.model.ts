import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type {
  DepthDelta,
  PaceDelta,
} from '../../../business/repositories/learning.repository';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({
  tableName: 'document_learning_state',
  underscored: true,
  timestamps: true,
})
export class DocumentLearningStateModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({
    type: DataType.ENUM('slower', 'none', 'faster'),
    allowNull: false,
    defaultValue: 'none',
  })
  declare paceDelta: PaceDelta;

  @Column({
    type: DataType.ENUM('deeper', 'none', 'lighter'),
    allowNull: false,
    defaultValue: 'none',
  })
  declare depthDelta: DepthDelta;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare reason: string | null;

  /** How the learner asked to be taught this document; null until they choose. */
  @Column({ type: DataType.STRING(16), allowNull: true })
  declare lectureStyle: string | null;

  /** Whether the lecture runs its beats around each chapter for this document; null until chosen. */
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare lectureInteractive: boolean | null;
}
