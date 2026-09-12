import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn } from 'sequelize';
import type { CatalogueDto } from '../contracts';
import { publicShape } from '../business/handlers/institutions/institution.handlers';
import {
  CourseModel,
  DepartmentModel,
  DocumentModel,
  InstitutionMemberModel,
  InstitutionModel,
  LectureSegmentModel,
  LevelModel,
  ReadingPositionModel,
  SimplifiedPageModel,
} from '../web/database/models';
import { toListItem } from './shared/document-shape';

/**
 * The school's catalogue as one member sees it: every course with its
 * documents, and against each the member's own progress. The dashboard
 * puts the member's department and level first; the shape carries both so
 * it can.
 */
@Injectable()
export class CatalogueQuery {
  constructor(
    @InjectModel(InstitutionModel)
    private readonly institutions: typeof InstitutionModel,
    @InjectModel(InstitutionMemberModel)
    private readonly members: typeof InstitutionMemberModel,
    @InjectModel(DepartmentModel)
    private readonly departments: typeof DepartmentModel,
    @InjectModel(LevelModel) private readonly levels: typeof LevelModel,
    @InjectModel(CourseModel) private readonly courses: typeof CourseModel,
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(ReadingPositionModel)
    private readonly positions: typeof ReadingPositionModel,
    @InjectModel(LectureSegmentModel)
    private readonly segments: typeof LectureSegmentModel,
  ) {}

  async execute(slug: string, userId: string): Promise<CatalogueDto> {
    const school = await this.institutions.findOne({
      where: { slug: slug.toLowerCase() } as never,
    });
    if (!school) throw new NotFoundException('School not found');
    const member = await this.members.findOne({
      where: { userId, institutionId: school.id } as never,
    });
    // A non-member sees the same missing school a visitor would.
    if (!member) throw new NotFoundException('School not found');

    const [departments, levels, courses, docs] = await Promise.all([
      this.departments.findAll({
        where: { institutionId: school.id } as never,
        order: [['orderIndex', 'ASC']] as never,
      }),
      this.levels.findAll({
        where: { institutionId: school.id } as never,
        order: [['orderIndex', 'ASC']] as never,
      }),
      this.courses.findAll({
        include: [
          {
            model: DepartmentModel,
            where: { institutionId: school.id },
            attributes: [],
            required: true,
          },
        ],
        order: [['orderIndex', 'ASC']] as never,
      }),
      this.documents.findAll({
        where: { institutionId: school.id, deletedAt: null } as never,
        order: [
          ['orderIndex', 'ASC'],
          ['createdAt', 'ASC'],
        ] as never,
      }),
    ]);

    const ids = docs.map((doc) => doc.id);
    const [counts, read, audio] = await Promise.all([
      this.countSimplified(ids),
      this.readBy(ids, userId),
      this.withAudio(ids),
    ]);

    return {
      institution: publicShape({
        id: school.id,
        name: school.name,
        slug: school.slug,
        country: school.country ?? null,
        levelWord: school.levelWord,
        needsInviteCode: school.inviteCode !== null,
        emailDomains: school.emailDomains ?? [],
        inviteCode: school.inviteCode ?? null,
        memberCount: 0,
        documentCount: 0,
      }),
      departments: departments.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        orderIndex: row.orderIndex,
      })),
      levels: levels.map((row) => ({
        id: row.id,
        name: row.name,
        orderIndex: row.orderIndex,
      })),
      courses: courses.map((course) => ({
        id: course.id,
        departmentId: course.departmentId,
        levelId: course.levelId ?? null,
        name: course.name,
        code: course.code ?? null,
        orderIndex: course.orderIndex,
      })),
      documents: docs.map((doc) => ({
        ...toListItem(doc, counts.get(doc.id) ?? 0),
        departmentId: doc.departmentId ?? null,
        levelId: doc.levelId ?? null,
        courseId: doc.courseId ?? null,
        read: read.get(doc.id) ?? 0,
        audio: audio.has(doc.id),
      })),
      membership: {
        departmentId: member.departmentId ?? null,
        levelId: member.levelId ?? null,
      },
    };
  }

  private async countSimplified(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = (await this.simplified.findAll({
      attributes: ['documentId', [fn('COUNT', col('id')), 'total']],
      where: {
        documentId: { [Op.in]: ids },
        level: 'standard',
        status: 'done',
      } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; total: number | string }[];
    return new Map(rows.map((row) => [row.documentId, Number(row.total)]));
  }

  /** How far the member has read each document, from their furthest page. */
  private async readBy(
    ids: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.positions.findAll({
      where: { userId, documentId: { [Op.in]: ids } } as never,
    });
    const pages = new Map(
      (
        await this.documents.findAll({
          attributes: ['id', 'pageCount'],
          where: { id: { [Op.in]: ids } } as never,
        })
      ).map((doc) => [doc.id, doc.pageCount ?? 0]),
    );
    return new Map(
      rows.map((row) => {
        const total = pages.get(row.documentId) ?? 0;
        const furthest = row.furthestPage ?? row.lastPage ?? 0;
        return [row.documentId, total > 0 ? Math.min(1, furthest / total) : 0];
      }),
    );
  }

  private async withAudio(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = (await this.segments.findAll({
      attributes: ['documentId'],
      where: {
        documentId: { [Op.in]: ids },
        kind: 'page',
        status: 'done',
      } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string }[];
    return new Set(rows.map((row) => row.documentId));
  }
}
