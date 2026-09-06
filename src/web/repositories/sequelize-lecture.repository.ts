import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  BoardStatus,
  LecturePosition,
  LectureStyle,
  SegmentKind,
  FollowStatus,
} from '../../contracts';
import type {
  LecturePlanRecord,
  LectureRepository,
  LectureSegmentRecord,
  LectureSegmentSeed,
  SegmentKey,
} from '../../business/repositories/lecture.repository';
import { playOrder } from '../../business/domain/lecture';
import {
  LecturePlanModel,
  LecturePositionModel,
  LectureSegmentModel,
} from '../database/models';
import { newId } from '../database/uuid';

/** When a position row was last written, as the client reads it. */
const savedAt = (row: LecturePositionModel): string | null => {
  const value: unknown = row.get('updatedAt');
  return value instanceof Date ? value.toISOString() : null;
};

/** The row a key names; a key without a kind names the page. */
const whereKey = (key: SegmentKey) => ({
  documentId: key.documentId,
  pageNumber: key.pageNumber,
  contentVersion: key.contentVersion,
  style: key.style,
  kind: key.kind ?? 'page',
});

const toDate = (value: unknown): Date | null =>
  value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;

const toSegment = (row: LectureSegmentModel): LectureSegmentRecord => ({
  topicId: row.topicId,
  pageNumber: row.pageNumber,
  seq: row.seq,
  style: row.style,
  kind: row.kind ?? 'page',
  status: row.status,
  updatedAt: toDate(row.get('updatedAt')),
  scriptText: row.scriptText,
  audioKey: row.audioKey,
  durationMs: row.durationMs,
  bridge: row.bridge,
  attempts: row.attempts,
  moveOffsets: row.moveOffsets ?? null,
  sectionTags: row.sectionTags ?? null,
  board: row.board ?? null,
  wordTimes: row.wordTimes ?? null,
  boardStatus: row.boardStatus ?? 'none',
  follow: row.follow ?? null,
  followStatus: row.followStatus ?? 'none',
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
      ? {
          topicId: row.topicId,
          status: row.status,
          plan: row.planJson,
          generatorVersion: row.generatorVersion,
        }
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
      generatorVersion: row.generatorVersion,
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
      style: segment.style,
      kind: segment.kind ?? 'page',
      bridge: segment.bridge,
      status: 'pending' as const,
    }));
    await this.segments.bulkCreate(rows as never, { ignoreDuplicates: true });
  }

  async findSegment(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
    style: LectureStyle,
    kind: SegmentKind = 'page',
  ): Promise<LectureSegmentRecord | null> {
    const row = await this.segments.findOne({
      where: { documentId, pageNumber, contentVersion, style, kind },
    });
    return row ? toSegment(row) : null;
  }

  async removeSegments(
    documentId: string,
    contentVersion: number,
    style: LectureStyle,
    kind: SegmentKind,
  ): Promise<void> {
    await this.segments.destroy({
      where: { documentId, contentVersion, style, kind },
    });
  }

  async listSegments(
    documentId: string,
    contentVersion: number,
    style?: LectureStyle,
  ): Promise<LectureSegmentRecord[]> {
    const rows = await this.segments.findAll({
      where: { documentId, contentVersion, ...(style ? { style } : {}) },
      order: [
        ['seq', 'ASC'],
        ['style', 'ASC'],
      ],
    });
    // Within one page, the extras play around it: review, terms, page, check.
    return playOrder(rows.map(toSegment));
  }

  async markSegmentWriting(
    documentId: string,
    pageNumber: number,
    contentVersion: number,
    style: LectureStyle,
    kind: SegmentKind = 'page',
  ): Promise<void> {
    await this.segments.update(
      { status: 'writing' },
      { where: { documentId, pageNumber, contentVersion, style, kind } },
    );
  }

  async markSegmentWritten(
    input: SegmentKey & {
      scriptText: string;
      moveOffsets: number[];
      durationMs: number | null;
      sectionTags?: unknown;
    },
  ): Promise<void> {
    await this.segments.update(
      {
        status: 'voicing',
        scriptText: input.scriptText,
        moveOffsets: input.moveOffsets,
        durationMs: input.durationMs,
        ...(input.sectionTags !== undefined
          ? { sectionTags: input.sectionTags }
          : {}),
        error: null,
      },
      { where: whereKey(input) },
    );
  }

  async markSegmentDone(
    input: SegmentKey & { audioKey: string; durationMs: number | null },
  ): Promise<void> {
    await this.segments.update(
      {
        status: 'done',
        audioKey: input.audioKey,
        durationMs: input.durationMs,
        error: null,
      },
      { where: whereKey(input) },
    );
  }

  async saveBoard(
    input: SegmentKey & { board: unknown; boardStatus: BoardStatus },
  ): Promise<void> {
    await this.segments.update(
      { board: input.board, boardStatus: input.boardStatus },
      { where: whereKey(input) },
    );
  }

  async saveFollow(
    input: SegmentKey & { follow: unknown; followStatus: FollowStatus },
  ): Promise<void> {
    await this.segments.update(
      { follow: input.follow, followStatus: input.followStatus },
      { where: whereKey(input) },
    );
  }

  async saveWordTimes(
    input: SegmentKey & { wordTimes: unknown; durationMs?: number },
  ): Promise<void> {
    await this.segments.update(
      {
        wordTimes: input.wordTimes,
        ...(input.durationMs ? { durationMs: input.durationMs } : {}),
      },
      { where: whereKey(input) },
    );
  }

  async listForBoardBackfill(
    documentId: string,
    contentVersion: number,
    topicIds: string[] | null,
  ): Promise<LectureSegmentRecord[]> {
    const rows = await this.segments.findAll({
      where: {
        documentId,
        contentVersion,
        ...(topicIds ? { topicId: topicIds } : {}),
      },
      order: [['seq', 'ASC']],
    });
    return rows.map(toSegment).filter((row) => row.scriptText !== null);
  }

  async markSegmentFailed(
    input: SegmentKey & { error: string },
  ): Promise<void> {
    const row = await this.segments.findOne({ where: whereKey(input) });
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
    style: LectureStyle,
  ): Promise<void> {
    if (!topicIds.length) return;
    await this.segments.update(
      { status: 'pending', error: null },
      {
        where: {
          documentId,
          contentVersion,
          topicId: topicIds,
          style,
          status: 'failed',
        },
      },
    );
  }

  async clear(documentId: string, style?: LectureStyle): Promise<void> {
    if (style) {
      // One style goes; the plan is shared by the others and stays.
      await this.segments.destroy({ where: { documentId, style } });
      return;
    }
    await this.segments.destroy({ where: { documentId } });
    await this.plans.destroy({ where: { documentId } });
  }

  async savePosition(input: {
    userId: string;
    documentId: string;
    pageNumber: number;
    offsetMs: number;
    style: LectureStyle;
  }): Promise<void> {
    const where = { userId: input.userId, documentId: input.documentId };
    const existing = await this.positions.findOne({ where });
    if (existing) {
      await existing.update({
        pageNumber: input.pageNumber,
        offsetMs: input.offsetMs,
        style: input.style,
      });
      return;
    }
    await this.positions.create({
      id: newId(),
      ...where,
      pageNumber: input.pageNumber,
      offsetMs: input.offsetMs,
      style: input.style,
    } as never);
  }

  async findPosition(
    userId: string,
    documentId: string,
  ): Promise<LecturePosition | null> {
    const row = await this.positions.findOne({
      where: { userId, documentId },
    });
    return row
      ? {
          pageNumber: row.pageNumber,
          offsetMs: row.offsetMs,
          style: row.style,
          updatedAt: savedAt(row),
        }
      : null;
  }
}
