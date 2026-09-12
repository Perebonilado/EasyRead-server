import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn } from 'sequelize';
import type {
  LectureSegmentStatus,
  LectureStyle,
  Level,
  MaterialDto,
} from '../contracts';
import { LECTURE_STYLE_KEYS } from '../contracts';
import { effectiveStatus } from '../business/domain/lecture';
import {
  AiCallLogModel,
  DocumentModel,
  LectureSegmentModel,
  PipelineRunModel,
  SimplifiedPageModel,
} from '../web/database/models';
import { toListItem } from './shared/document-shape';

/**
 * A school's documents as the admin's screen needs them: each with where it
 * sits, how far its processing has got at every step, and what it has
 * cost. A few grouped queries over the set, never one per document.
 */
@Injectable()
export class MaterialsQuery {
  constructor(
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
    @InjectModel(PipelineRunModel)
    private readonly runs: typeof PipelineRunModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(LectureSegmentModel)
    private readonly segments: typeof LectureSegmentModel,
    @InjectModel(AiCallLogModel)
    private readonly calls: typeof AiCallLogModel,
  ) {}

  async execute(input: {
    institutionId: string;
    departmentId?: string;
    levelId?: string;
    courseId?: string;
  }): Promise<MaterialDto[]> {
    const where: Record<string, unknown> = {
      institutionId: input.institutionId,
      deletedAt: null,
    };
    if (input.departmentId) where.departmentId = input.departmentId;
    if (input.levelId) where.levelId = input.levelId;
    if (input.courseId) where.courseId = input.courseId;
    const rows = await this.documents.findAll({
      where: where as never,
      order: [
        ['orderIndex', 'ASC'],
        ['createdAt', 'ASC'],
      ] as never,
    });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);

    const [runs, tallies, lectures, costs] = await Promise.all([
      this.runs.findAll({ where: { documentId: { [Op.in]: ids } } as never }),
      this.tallies(ids),
      this.lectures(ids),
      this.costs(ids),
    ]);

    return rows.map((row) => {
      const tally = tallies.get(row.id) ?? emptyTally();
      return {
        document: toListItem(row, tally.standard.done),
        departmentId: row.departmentId ?? null,
        levelId: row.levelId ?? null,
        courseId: row.courseId ?? null,
        orderIndex: row.orderIndex ?? 0,
        contentHash: row.contentHash ?? null,
        steps: runs
          .filter((run) => run.documentId === row.id)
          .map((run) => ({
            step: run.step,
            status: run.status,
            error: run.error,
          })),
        simplified: tally,
        lecture: lectures.get(row.id) ?? emptyLecture(),
        costUsd: costs.get(row.id) ?? 0,
      };
    });
  }

  private async tallies(
    ids: string[],
  ): Promise<Map<string, MaterialDto['simplified']>> {
    const rows = (await this.simplified.findAll({
      attributes: [
        'documentId',
        'level',
        'status',
        [fn('COUNT', col('id')), 'n'],
      ],
      where: { documentId: { [Op.in]: ids } } as never,
      group: ['documentId', 'level', 'status'],
      raw: true,
    })) as unknown as {
      documentId: string;
      level: Level;
      status: string;
      n: number | string;
    }[];
    const out = new Map<string, MaterialDto['simplified']>();
    for (const row of rows) {
      const tally = out.get(row.documentId) ?? emptyTally();
      const bucket = tally[row.level];
      const n = Number(row.n);
      bucket.total += n;
      if (row.status === 'done') bucket.done += n;
      if (row.status === 'failed') bucket.failed += n;
      out.set(row.documentId, tally);
    }
    return out;
  }

  private async lectures(
    ids: string[],
  ): Promise<Map<string, MaterialDto['lecture']>> {
    const rows = await this.segments.findAll({
      attributes: ['documentId', 'style', 'status', 'updatedAt'],
      where: { documentId: { [Op.in]: ids }, kind: 'page' } as never,
    });
    const out = new Map<string, MaterialDto['lecture']>();
    for (const row of rows) {
      const lecture = out.get(row.documentId) ?? emptyLecture();
      const bucket = lecture[row.style];
      const status: LectureSegmentStatus = effectiveStatus({
        status: row.status,
        updatedAt: row.get('updatedAt') as Date,
      });
      bucket.total += 1;
      if (status === 'done') bucket.ready += 1;
      if (status === 'failed') bucket.failed += 1;
      out.set(row.documentId, lecture);
    }
    return out;
  }

  private async costs(ids: string[]): Promise<Map<string, number>> {
    const rows = (await this.calls.findAll({
      attributes: ['documentId', [fn('SUM', col('cost_estimate')), 'usd']],
      where: { documentId: { [Op.in]: ids } } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; usd: string | number | null }[];
    return new Map(
      rows.map((row) => [
        row.documentId,
        Math.round(Number(row.usd ?? 0) * 10_000) / 10_000,
      ]),
    );
  }
}

const emptyTally = (): MaterialDto['simplified'] => ({
  standard: { done: 0, failed: 0, total: 0 },
  easiest: { done: 0, failed: 0, total: 0 },
});

const emptyLecture = (): MaterialDto['lecture'] =>
  Object.fromEntries(
    LECTURE_STYLE_KEYS.map((style) => [
      style,
      { total: 0, ready: 0, failed: 0 },
    ]),
  ) as Record<LectureStyle, { total: number; ready: number; failed: number }>;
