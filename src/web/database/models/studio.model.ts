import { Column, CreatedAt, DataType, Table } from 'sequelize-typescript';
import { BaseModel } from './base';

/** A show made in the Studio: its brief and its bible, as JSON. */
@Table({ tableName: 'studio_shows', underscored: true, timestamps: true })
export class StudioShowModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare title: string;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare format: string | null;

  @Column({ type: DataType.TEXT('medium'), allowNull: false })
  declare brief: string;

  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare bible: string | null;

  /** The document given to it in the chat, if any: the Studio's own. */
  @Column({ type: DataType.UUID, allowNull: true })
  declare documentId: string | null;

  /** An explainer the editor plans: its angles, research, plan and world, as JSON (studio-editor). */
  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare editor: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

/** One episode of a show: its outline, and where its making has got to. */
@Table({ tableName: 'studio_episodes', underscored: true, timestamps: true })
export class StudioEpisodeModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: false })
  declare showId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare number: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare logline: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare phase: string;

  @Column({ type: DataType.STRING(24), allowNull: true })
  declare busy: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare outline: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare shareToken: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare thumbKey: string | null;

  /** What is happening to it now, as JSON (studio-progress). */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare activity: string | null;

  /** The pages of the show's document it teaches, as JSON (studio-document). */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare pages: string | null;

  /** The shape its film is made in: 'wide' or 'tall' (studio-vertical-plan). */
  @Column({ type: DataType.STRING(8), allowNull: false, defaultValue: 'wide' })
  declare shape: string;

  /** The episode it is the twin of, in the other shape: that one's script and voice are its. */
  @Column({ type: DataType.UUID, allowNull: true })
  declare twinOf: string | null;

  /** An episode the editor wrote: its beat sheet, hooks, two-column script and package, as JSON (studio-editorial). */
  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare editorial: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

/** One scene of an episode: its sheet, what the check found, and what it was made into. */
@Table({ tableName: 'studio_scenes', underscored: true, timestamps: true })
export class StudioSceneModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: false })
  declare episodeId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare position: number;

  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare sheet: string | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare sheetHash: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare problems: string | null;

  @Column({ type: DataType.TEXT('medium'), allowNull: true })
  declare previousSheet: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: string;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare step: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare sceneKey: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare audioKey: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true })
  declare thumbKey: string | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare madeHash: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  /** What is happening to it now, as JSON (studio-progress). */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare activity: string | null;

  /** A twin episode's scene: the scene of the episode it is the twin of that it is the same scene of. */
  @Column({ type: DataType.UUID, allowNull: true })
  declare twinOf: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

/** One message of a show's conversation with the producer. */
@Table({ tableName: 'studio_messages', underscored: true, timestamps: true })
export class StudioMessageModel extends BaseModel {
  @Column({ type: DataType.UUID, allowNull: false })
  declare showId: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare episodeId: string | null;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare role: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare content: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare meta: string | null;

  // Kept to the millisecond (0057), so what is said in the same second
  // reads in the order it came.
  @CreatedAt
  @Column({ type: DataType.DATE(3) })
  declare createdAt: Date;
  declare updatedAt: Date;
}
