import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn } from 'sequelize';
import type { DocumentDetail, PageStatus } from '../contracts';
import {
  DocumentModel,
  PipelineRunModel,
  ReadingPositionModel,
  SimplifiedPageModel,
  TopicModel,
  InstitutionMemberModel,
  InstitutionModel,
  CourseModel,
} from '../web/database/models';
import { toListItem } from './shared/document-shape';
import { SchoolAccessService } from '../business/handlers/institutions/school-access.service';

type LevelTally = { done: number; failed: number; total: number };

/**
 * Everything the reader needs to render its chrome in one round trip, and the
 * exact payload replayed as the `snapshot` SSE event on connect (§5) — a
 * reconnecting client therefore never has to reconcile two different shapes.
 */
@Injectable()
export class DocumentDetailQuery {
  constructor(
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(PipelineRunModel)
    private readonly runs: typeof PipelineRunModel,
    @InjectModel(TopicModel) private readonly topics: typeof TopicModel,
    @InjectModel(ReadingPositionModel)
    private readonly positions: typeof ReadingPositionModel,
    @InjectModel(InstitutionMemberModel)
    private readonly members: typeof InstitutionMemberModel,
    @InjectModel(InstitutionModel)
    private readonly institutions: typeof InstitutionModel,
    @InjectModel(CourseModel)
    private readonly courses: typeof CourseModel,
    private readonly schoolAccess: SchoolAccessService,
  ) {}

  async execute(documentId: string, userId: string): Promise<DocumentDetail> {
    const doc = await this.documents.findOne({
      where: { id: documentId, deletedAt: null } as never,
    });
    // Someone else's document reads as missing so ids can't be probed. A
    // school's document is every member's.
    if (!doc || !(await this.mayRead(doc, userId))) {
      throw new NotFoundException('Document not found');
    }

    const [simplified, steps, topicCount, position, school] = await Promise.all(
      [
        this.tally(documentId),
        this.runs.findAll({ where: { documentId } as never }),
        this.topics.count({ where: { documentId } as never }),
        this.positions.findOne({ where: { documentId, userId } as never }),
        this.schoolOf(doc),
      ],
    );

    return {
      ...toListItem(doc, simplified.done),
      contentVersion: doc.contentVersion,
      steps: steps.map((run) => ({
        step: run.step,
        status: run.status,
        error: run.error,
      })),
      simplified,
      topicsReady: topicCount > 0,
      position: position
        ? {
            lastPage: position.lastPage,
            furthestPage: position.furthestPage,
            level: position.level,
          }
        : null,
      school,
    };
  }

  /** The school's name and the file's course there, so the reader can say where it sits. */
  private async schoolOf(
    doc: DocumentModel,
  ): Promise<DocumentDetail['school']> {
    if (!doc.institutionId) return null;
    const [institution, course] = await Promise.all([
      this.institutions.findByPk(doc.institutionId),
      doc.courseId ? this.courses.findByPk(doc.courseId) : null,
    ]);
    if (!institution) return null;
    return {
      name: institution.name,
      course: course
        ? { id: course.id, name: course.name, code: course.code ?? null }
        : null,
    };
  }

  private async mayRead(doc: DocumentModel, userId: string): Promise<boolean> {
    if (doc.userId === userId) return true;
    // A school's document, and only once the admin has published it.
    if (!doc.institutionId || !doc.publishedAt) return false;
    const member = await this.members.count({
      where: { userId, institutionId: doc.institutionId } as never,
    });
    if (member === 0) return false;
    // A locked member answers 402, not 404, so the client can offer the pass.
    await this.schoolAccess.assertMayRead(userId, doc.institutionId);
    return true;
  }

  private async tally(documentId: string): Promise<LevelTally> {
    const rows = (await this.simplified.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      where: { documentId } as never,
      group: ['status'],
      raw: true,
    })) as unknown as { status: PageStatus; total: number | string }[];

    const tally: LevelTally = { done: 0, failed: 0, total: 0 };
    for (const row of rows) {
      const count = Number(row.total);
      tally.total += count;
      if (row.status === 'done') tally.done += count;
      if (row.status === 'failed') tally.failed += count;
    }
    return tally;
  }
}
