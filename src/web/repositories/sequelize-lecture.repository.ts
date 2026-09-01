import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { LecturePosition } from '../../contracts';
import type {
  LecturePlanRecord,
  LectureRepository,
  LectureSegmentRecord,
  LectureSegmentSeed,
} from '../../business/repositories/lecture.repository';
import {
  LecturePlanModel,
  LecturePositionModel,
  LectureSegmentModel,
} from '../database/models';
import { newId } from '../database/uuid';

const toSegment = (row: LectureSegmentModel): LectureSegmentRecord => ({
  topicId: row.topicId,
  pageNumber: row.pageNumber,
  seq: row.seq,
  status: row.status,
  scriptText: row.scriptText,
  audioKey: row.audioKey,
  durationMs: row.durationMs,
  bridge: row.bridge,
  attempts: row.attempts,
});

@Injectable()
export class SequelizeLectureRepository implements LectureRepository {
  constructor(
    @InjectModel(LecturePlanModel)
    private readonly plans: typeof LecturePlanModel,
    @InjectModel(LectureSegmentModel)
    private readonly segments: typeof LectureSegmentModel,
    @InjectModel(LecturePositionModel)
    private readonly positions: typeof LecturePositionModel,
  ) {}

  async savePlan(input: {
    documentId: string;
    topicId: string;
    contentVersion: number;
    status: LecturePlanRecord['status'];
    plan: unknown;
    generatorVersion: string;
    error?: string | null;
  }): Promise<void> {
    const where = {
      documentId: input.documentId,
      topicId: input.topicId,
      contentVersion: input.contentVersion,
    };
    const existing = await this.plans.findOne({ where });
    if (existing) {
      await existing.update({
        status: input.status,
        planJson: input.plan,
        generatorVersion: input.generatorVersion,
        error: input.error ?? null,
      });
      return;
    }
    await this.plans.create({
      id: newId(),
      ...where,
      status: input.status,
      planJson: input.plan,
      generatorVersion: input.generatorVersion,
      error: input.error ?? null,
    } as never);
  }

  async findPlan(
    documentId: string,
    topicId: string,
    contentVersion: number,
  ): Promise<LecturePlanRecord | null> {
    const row = await this.plans.findOne({
      where: { documentId, topicId, contentVersion },
    });
    return row
      ? { topicId: row.topicId, status: row.status, plan: row.planJson }
      : null;
  }

  async listPlans(
    documentId: string,
    contentVersion: number,
  ): Promise<LecturePlanRecord[]> {
    const rows = await this.plans.findAll({
      where: { documentId, contentVersion },
    });
    return rows.map((row) => ({
      topicId: row.topicId,
      status: row.status,
      plan: row.planJson,
    }));
  }

  /**
   * `ignoreDuplicates` makes the fan-out replay-safe: pages already
   * written keep their script, their audio and their status.
   */
  async seedSegments(input: {
    documentId: string;
    contentVersion: number;
    generatorVersion: string;
    segments: LectureSegmentSeed[];
  }): Promise<void> {
    if (!input.segments.length) return;
    const rows = input.segments.map((segment) => ({
      id: newId(),
      documentId: input.documentId,
      contentVersion: input.contentVersion,
      generatorVersion: input.generatorVersion,
      topicId: segment.topicId,
      pageNumber: segment.pageNumber,
      seq: segment.seq,
      bridge: segment.bridge,
      status: 'pending' as const,
    }));
    await this.segments.bulkCreate(rows as never, { ignoreDuplicates: true });
  }

  async findSegment(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
  ): Promise<LectureSegmentRecord | null> {
    const row = await this.segments.findOne({
      where: { documentId, pageNumber, contentVersion },
    });
    return row ? toSegment(row) : null;
  }

  async listSegments(
    documentId: string,
    contentVersion: number,
  ): Promise<LectureSegmentRecord[]> {
    const rows = await this.segments.findAll({
      where: { documentId, contentVersion },
      order: [['seq', 'ASC']],
    });
    return rows.map(toSegment);
  }

  async markSegmentWriting(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
  ): Promise<void> {
    await this.segments.update(
      { status: 'writing' },
      { where: { documentId, pageNumber, contentVersion } },
    );
  }

  async markSegmentWritten(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    scriptText: string;
    durationMs: number | null;
  }): Promise<void> {
    await this.segments.update(
      {
        status: 'voicing',
        scriptText: input.scriptText,
        durationMs: input.durationMs,
        error: null,
      },
      {
        where: {
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          contentVersion: input.contentVersion,
        },
      },
    );
  }

  async markSegmentDone(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    audioKey: string;
    durationMs: number | null;
  }): Promise<void> {
    await this.segments.update(
      {
        status: 'done',
        audioKey: input.audioKey,
        durationMs: input.durationMs,
        error: null,
      },
      {
        where: {
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          contentVersion: input.contentVersion,
        },
      },
    );
  }

  async markSegmentFailed(input: {
    documentId: string;
    pageNumber: number;
    contentVersion: number;
    error: string;
  }): Promise<void> {
    const row = await this.segments.findOne({
      where: {
        documentId: input.documentId,
        pageNumber: input.pageNumber,
        contentVersion: input.contentVersion,
      },
    });
    if (!row) return;
    await row.update({
      status: 'failed',
      attempts: row.attempts + 1,
      error: input.error,
    });
  }

  async resetFailedSegments(
    documentId: string,
    contentVersion: number,
    topicIds: string[],
  ): Promise<void> {
    if (!topicIds.length) return;
    await this.segments.update(
      { status: 'pending', error: null },
      {
        where: {
          documentId,
          contentVersion,
          topicId: topicIds,
          status: 'failed',
        },
      },
    );
  }

  async clear(documentId: string): Promise<void> {
    await this.segments.destroy({ where: { documentId } });
    await this.plans.destroy({ where: { documentId } });
  }

  async savePosition(input: {
    userId: string;
    documentId: string;
    pageNumber: number;
    offsetMs: number;
  }): Promise<void> {
    const where = { userId: input.userId, documentId: input.documentId };
    const existing = await this.positions.findOne({ where });
    if (existing) {
      await existing.update({
        pageNumber: input.pageNumber,
        offsetMs: input.offsetMs,
      });
      return;
    }
    await this.positions.create({
      id: newId(),
      ...where,
      pageNumber: input.pageNumber,
      offsetMs: input.offsetMs,
    } as never);
  }

  async findPosition(
    userId: string,
    documentId: string,
  ): Promise<LecturePosition | null> {
    const row = await this.positions.findOne({
      where: { userId, documentId },
    });
    return row ? { pageNumber: row.pageNumber, offsetMs: row.offsetMs } : null;
  }
}
