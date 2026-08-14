import { Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import type { ChatRole, HighlightAction } from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { UserModel } from './user.model';

@Table({ tableName: 'chat_messages', underscored: true, timestamps: true })
export class ChatMessageModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.ENUM('user', 'assistant'), allowNull: false })
  declare role: ChatRole;

  @Column({ type: DataType.TEXT('long'), allowNull: false })
  declare text: string;

  @Column({
    type: DataType.ENUM('explain', 'simplify', 'define'),
    allowNull: true,
  })
  declare highlightAction: Exclude<HighlightAction, 'visualize'> | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare quotedText: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare pageNumber: number | null;

  @Column({ type: DataType.JSON, allowNull: true })
  declare sources: { pageNumber: number; text: string }[] | null;
}
