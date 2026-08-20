import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from 'sequelize-typescript';
import { BaseModel } from './base';
import { UserModel } from './user.model';

/**
 * A study group (classroom plan): an owner, up to six members, one
 * shareable invite code. The code is the whole social model.
 */
@Table({ tableName: 'study_groups', underscored: true, timestamps: true })
export class StudyGroupModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare ownerId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @Column({ type: DataType.CHAR(8), allowNull: false, unique: true })
  declare inviteCode: string;

  @HasMany(() => StudyGroupMemberModel)
  declare members?: StudyGroupMemberModel[];
}

@Table({
  tableName: 'study_group_members',
  underscored: true,
  timestamps: true,
})
export class StudyGroupMemberModel extends BaseModel {
  @ForeignKey(() => StudyGroupModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare groupId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({
    type: DataType.ENUM('owner', 'member'),
    allowNull: false,
    defaultValue: 'member',
  })
  declare role: 'owner' | 'member';

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @BelongsTo(() => StudyGroupModel)
  declare group?: StudyGroupModel;
}

/**
 * A live or past session. Only the group owner starts one; members join
 * mid-flight. `topicId` scopes the lesson to a chapter when set.
 */
@Table({ tableName: 'study_sessions', underscored: true, timestamps: true })
export class StudySessionModel extends BaseModel {
  @ForeignKey(() => StudyGroupModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare groupId: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare hostId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  /** Chapter scope: null or empty means the whole document. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare topicIds: string[] | null;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare tutorId: string;

  @Column({
    type: DataType.ENUM('live', 'ended'),
    allowNull: false,
    defaultValue: 'live',
  })
  declare status: 'live' | 'ended';

  @Column({ type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare endedAt: Date | null;
}
