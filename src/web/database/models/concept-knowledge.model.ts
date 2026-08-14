import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({ tableName: 'concept_knowledge', underscored: true, timestamps: true })
export class ConceptKnowledgeModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(300), allowNull: false })
  declare concept: string;

  @Column({ type: DataType.ENUM('unclear', 'taught'), allowNull: false })
  declare state: 'unclear' | 'taught';

  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare resolvedDocumentId: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare firstFlaggedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;
}
