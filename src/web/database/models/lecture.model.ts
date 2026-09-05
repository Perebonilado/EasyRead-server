import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import type {
  BoardStatus,
  LectureSegmentStatus,
  LectureStyle,
  SegmentKind,
  FollowStatus,
} from '../../../contracts';
import { BaseModel } from './base';
import { DocumentModel } from './document.model';
import { TopicModel } from './topic.model';
import { UserModel } from './user.model';

/** A chapter's lecture arc: written once, then cut into segments. */
@Table({ tableName: 'lecture_plans', underscored: true, timestamps: true })
export class LecturePlanModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare topicId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare contentVersion: number;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: LectureSegmentStatus;

  @Column({ type: DataType.JSON, allowNull: true })
  declare planJson: unknown;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare generatorVersion: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}

/** One page of the lecture: its script, and the audio made from it. */
@Table({ tableName: 'lecture_segments', underscored: true, timestamps: true })
export class LectureSegmentModel extends BaseModel {
  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @BelongsTo(() => DocumentModel)
  declare document?: DocumentModel;

  @ForeignKey(() => TopicModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare topicId: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare contentVersion: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare seq: number;

  /** Which way of teaching this row is; the plan is shared across styles. */
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'steady',
  })
  declare style: LectureStyle;

  /** A page of the lecture, or one of the short segments around a chapter. */
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'page',
  })
  declare kind: SegmentKind;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: LectureSegmentStatus;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare scriptText: string | null;

  /** Character offsets where each move of the page begins in the script. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare moveOffsets: number[] | null;

  /** What the writer said each section teaches in the note, for the follow-along matcher. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare sectionTags: unknown;

  /** What the lecturer writes and draws while this row plays. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare board: unknown;

  /** Where each spoken word is heard in the audio. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare wordTimes: unknown;

  /** The board's own life, apart from the page's: a page plays without one. */
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'none',
  })
  declare boardStatus: BoardStatus;

  /** Where in the simplified note the tutor is, moment by moment. */
  @Column({ type: DataType.JSON, allowNull: true })
  declare follow: unknown;

  /** The track's own life, apart from the page's. */
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'none',
  })
  declare followStatus: FollowStatus;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare audioKey: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare bridge: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare generatorVersion: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}

/** Where a person stopped listening. Survives regeneration. */
@Table({ tableName: 'lecture_positions', underscored: true, timestamps: true })
export class LecturePositionModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => DocumentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare documentId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare pageNumber: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare offsetMs: number;

  /** The style the student was listening in when they stopped. */
  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: 'steady',
  })
  declare style: LectureStyle;
}
