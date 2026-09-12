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

@Table({ tableName: 'institutions', underscored: true, timestamps: true })
export class InstitutionModel extends BaseModel {
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(80), allowNull: false, unique: true })
  declare slug: string;

  @Column({ type: DataType.STRING(2), allowNull: true })
  declare country: string | null;

  @Column({ type: DataType.JSON, allowNull: false })
  declare emailDomains: string[];

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare inviteCode: string | null;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare levelWord: string;

  @HasMany(() => DepartmentModel)
  declare departments?: DepartmentModel[];

  @HasMany(() => LevelModel)
  declare levels?: LevelModel[];
}

@Table({ tableName: 'departments', underscored: true, timestamps: true })
export class DepartmentModel extends BaseModel {
  @ForeignKey(() => InstitutionModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare institutionId: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare slug: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare orderIndex: number;

  @HasMany(() => CourseModel)
  declare courses?: CourseModel[];
}

@Table({ tableName: 'levels', underscored: true, timestamps: true })
export class LevelModel extends BaseModel {
  @ForeignKey(() => InstitutionModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare institutionId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare orderIndex: number;
}

@Table({ tableName: 'courses', underscored: true, timestamps: true })
export class CourseModel extends BaseModel {
  @ForeignKey(() => DepartmentModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare departmentId: string;

  @ForeignKey(() => LevelModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare levelId: string | null;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare code: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare orderIndex: number;

  @BelongsTo(() => DepartmentModel)
  declare department?: DepartmentModel;
}

@Table({
  tableName: 'institution_members',
  underscored: true,
  timestamps: true,
})
export class InstitutionMemberModel extends BaseModel {
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @ForeignKey(() => InstitutionModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare institutionId: string;

  @ForeignKey(() => DepartmentModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare departmentId: string | null;

  @ForeignKey(() => LevelModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare levelId: string | null;

  @Column({
    type: DataType.ENUM('student', 'staff', 'admin'),
    allowNull: false,
    defaultValue: 'student',
  })
  declare role: 'student' | 'staff' | 'admin';

  @BelongsTo(() => InstitutionModel)
  declare institution?: InstitutionModel;
}

@Table({ tableName: 'pronunciations', underscored: true, timestamps: true })
export class PronunciationModel extends BaseModel {
  @ForeignKey(() => InstitutionModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare institutionId: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare documentId: string | null;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare term: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare spoken: string;

  @Column({
    type: DataType.ENUM('proposed', 'kept', 'dropped'),
    allowNull: false,
    defaultValue: 'proposed',
  })
  declare status: 'proposed' | 'kept' | 'dropped';

  @Column({
    type: DataType.ENUM('seeded', 'admin'),
    allowNull: false,
    defaultValue: 'seeded',
  })
  declare source: 'seeded' | 'admin';
}
