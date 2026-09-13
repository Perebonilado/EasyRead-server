import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  CourseDto,
  DepartmentDto,
  InstitutionAdminDto,
  LevelDto,
  InstitutionListItemDto,
} from '../../contracts';
import type {
  InstitutionRepository,
  MembershipRecord,
  JoinCodeRecord,
} from '../../business/repositories/institution.repository';
import {
  CourseModel,
  DepartmentModel,
  DocumentModel,
  InstitutionMemberModel,
  InstitutionModel,
  LevelModel,
  InstitutionJoinCodeModel,
} from '../database/models';
import { newId } from '../database/uuid';

const toDepartment = (row: DepartmentModel): DepartmentDto => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  orderIndex: row.orderIndex,
});

const toLevel = (row: LevelModel): LevelDto => ({
  id: row.id,
  name: row.name,
  orderIndex: row.orderIndex,
});

const toCourse = (row: CourseModel): CourseDto => ({
  id: row.id,
  departmentId: row.departmentId,
  levelId: row.levelId ?? null,
  name: row.name,
  code: row.code ?? null,
  orderIndex: row.orderIndex,
});

@Injectable()
export class SequelizeInstitutionRepository implements InstitutionRepository {
  constructor(
    @InjectModel(InstitutionModel)
    private readonly institutions: typeof InstitutionModel,
    @InjectModel(DepartmentModel)
    private readonly departments: typeof DepartmentModel,
    @InjectModel(LevelModel) private readonly levels: typeof LevelModel,
    @InjectModel(CourseModel) private readonly courses: typeof CourseModel,
    @InjectModel(InstitutionMemberModel)
    private readonly members: typeof InstitutionMemberModel,
    @InjectModel(InstitutionJoinCodeModel)
    private readonly joinCodes: typeof InstitutionJoinCodeModel,
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
  ) {}

  private async toAdmin(row: InstitutionModel): Promise<InstitutionAdminDto> {
    const [memberCount, documentCount] = await Promise.all([
      this.members.count({ where: { institutionId: row.id } }),
      this.documents.count({
        where: { institutionId: row.id, deletedAt: { [Op.is]: null } },
      }),
    ]);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      country: row.country ?? null,
      levelWord: row.levelWord,
      needsInviteCode: row.inviteCode !== null,
      emailDomains: row.emailDomains ?? [],
      verifyStudents: row.verifyStudents === true,
      inviteCode: row.inviteCode ?? null,
      memberCount,
      documentCount,
    };
  }

  async listPublic(): Promise<InstitutionListItemDto[]> {
    const rows = await this.institutions.findAll({ order: [['name', 'ASC']] });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      country: row.country ?? null,
      verifyStudents: row.verifyStudents === true,
    }));
  }

  async findById(id: string): Promise<InstitutionAdminDto | null> {
    const row = await this.institutions.findByPk(id);
    return row ? this.toAdmin(row) : null;
  }

  async findBySlug(slug: string): Promise<InstitutionAdminDto | null> {
    const row = await this.institutions.findOne({ where: { slug } });
    return row ? this.toAdmin(row) : null;
  }

  async list(): Promise<InstitutionAdminDto[]> {
    const rows = await this.institutions.findAll({ order: [['name', 'ASC']] });
    return Promise.all(rows.map((row) => this.toAdmin(row)));
  }

  async create(input: {
    name: string;
    slug: string;
    country: string | null;
    levelWord: string;
    emailDomains: string[];
    inviteCode: string | null;
  }): Promise<InstitutionAdminDto> {
    const row = await this.institutions.create({
      id: newId(),
      ...input,
    } as never);
    return this.toAdmin(row);
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      slug: string;
      country: string | null;
      levelWord: string;
      emailDomains: string[];
      inviteCode: string | null;
      verifyStudents: boolean;
    }>,
  ): Promise<void> {
    await this.institutions.update(patch, { where: { id } });
  }

  async listDepartments(institutionId: string): Promise<DepartmentDto[]> {
    const rows = await this.departments.findAll({
      where: { institutionId },
      order: [
        ['orderIndex', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map(toDepartment);
  }

  async findDepartment(id: string) {
    const row = await this.departments.findByPk(id);
    return row
      ? { ...toDepartment(row), institutionId: row.institutionId }
      : null;
  }

  async createDepartment(input: {
    institutionId: string;
    name: string;
    slug: string;
    orderIndex: number;
  }): Promise<DepartmentDto> {
    const row = await this.departments.create({
      id: newId(),
      ...input,
    } as never);
    return toDepartment(row);
  }

  async updateDepartment(
    id: string,
    patch: Partial<{ name: string; slug: string; orderIndex: number }>,
  ): Promise<void> {
    await this.departments.update(patch, { where: { id } });
  }

  async deleteDepartment(id: string): Promise<void> {
    await this.departments.destroy({ where: { id } });
  }

  async listLevels(institutionId: string): Promise<LevelDto[]> {
    const rows = await this.levels.findAll({
      where: { institutionId },
      order: [
        ['orderIndex', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map(toLevel);
  }

  async findLevel(id: string) {
    const row = await this.levels.findByPk(id);
    return row ? { ...toLevel(row), institutionId: row.institutionId } : null;
  }

  async createLevel(input: {
    institutionId: string;
    name: string;
    orderIndex: number;
  }): Promise<LevelDto> {
    const row = await this.levels.create({ id: newId(), ...input } as never);
    return toLevel(row);
  }

  async updateLevel(
    id: string,
    patch: Partial<{ name: string; orderIndex: number }>,
  ): Promise<void> {
    await this.levels.update(patch, { where: { id } });
  }

  async deleteLevel(id: string): Promise<void> {
    await this.levels.destroy({ where: { id } });
  }

  async listCourses(institutionId: string): Promise<CourseDto[]> {
    const rows = await this.courses.findAll({
      include: [
        {
          model: DepartmentModel,
          where: { institutionId },
          attributes: [],
          required: true,
        },
      ],
      order: [
        ['orderIndex', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map(toCourse);
  }

  async findCourse(id: string) {
    const row = await this.courses.findByPk(id, {
      include: [{ model: DepartmentModel, attributes: ['institutionId'] }],
    });
    if (!row) return null;
    return { ...toCourse(row), institutionId: row.department!.institutionId };
  }

  async createCourse(input: {
    departmentId: string;
    levelId: string | null;
    name: string;
    code: string | null;
    orderIndex: number;
  }): Promise<CourseDto> {
    const row = await this.courses.create({ id: newId(), ...input } as never);
    return toCourse(row);
  }

  async updateCourse(
    id: string,
    patch: Partial<{
      levelId: string | null;
      name: string;
      code: string | null;
      orderIndex: number;
    }>,
  ): Promise<void> {
    await this.courses.update(patch, { where: { id } });
  }

  async deleteCourse(id: string): Promise<void> {
    await this.courses.destroy({ where: { id } });
  }

  async findMembership(userId: string): Promise<MembershipRecord | null> {
    const row = await this.members.findOne({ where: { userId } });
    if (!row) return null;
    return {
      userId: row.userId,
      institutionId: row.institutionId,
      departmentId: row.departmentId ?? null,
      levelId: row.levelId ?? null,
      role: row.role,
      schoolEmail: row.schoolEmail ?? null,
      verifiedAt: row.verifiedAt ?? null,
    };
  }

  async isMember(userId: string, institutionId: string): Promise<boolean> {
    const count = await this.members.count({
      where: { userId, institutionId },
    });
    return count > 0;
  }

  async join(input: {
    userId: string;
    institutionId: string;
    departmentId: string | null;
    levelId: string | null;
    schoolEmail: string | null;
    verifiedAt: Date | null;
  }): Promise<void> {
    // One institution per user: joining another replaces the membership.
    await this.members.destroy({ where: { userId: input.userId } });
    await this.members.create({
      id: newId(),
      ...input,
      role: 'student',
    } as never);
  }

  async setMembership(
    userId: string,
    patch: { departmentId: string | null; levelId: string | null },
  ): Promise<void> {
    await this.members.update(patch, { where: { userId } });
  }

  async leave(userId: string): Promise<void> {
    await this.members.destroy({ where: { userId } });
  }

  async findJoinCode(
    userId: string,
    institutionId: string,
  ): Promise<JoinCodeRecord | null> {
    const row = await this.joinCodes.findOne({
      where: { userId, institutionId },
      order: [['createdAt', 'DESC']],
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      institutionId: row.institutionId,
      email: row.email,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      attempts: row.attempts,
      consumedAt: row.consumedAt ?? null,
      createdAt: row.get('createdAt') as Date,
    };
  }

  async saveJoinCode(input: {
    userId: string;
    institutionId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.joinCodes.destroy({
      where: { userId: input.userId, institutionId: input.institutionId },
    });
    await this.joinCodes.create({
      id: newId(),
      ...input,
      attempts: 0,
    } as never);
  }

  async countJoinAttempt(id: string): Promise<void> {
    await this.joinCodes.increment('attempts', { where: { id } });
  }

  async consumeJoinCode(id: string, now: Date): Promise<void> {
    await this.joinCodes.update({ consumedAt: now }, { where: { id } });
  }
}
