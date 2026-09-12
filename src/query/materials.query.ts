import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal } from 'sequelize';
import type {
  LectureSegmentStatus,
  LectureStyle,
  Level,
  MaterialDto,
  MaterialPageDto,
  MaterialProgress,
  MaterialState,
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

    const [runs, tallies, lectures, costs, failedRows] = await Promise.all([
      this.runs.findAll({ where: { documentId: { [Op.in]: ids } } as never }),
      this.tallies(ids),
      this.lectures(ids),
      this.failedRows(ids),
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
        progress: progressOf(
          row,
          lectures.get(row.id) ?? emptyLecture(),
          failedRows.get(row.id) ?? 0,
        ),
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
      attributes: [
        'documentId',
        'style',
        'status',
        'updatedAt',
        [literal('script_text IS NOT NULL'), 'scripted'],
      ],
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
      if (Number(row.get('scripted'))) bucket.scripted += 1;
      if (status === 'done') bucket.ready += 1;
      if (status === 'failed') bucket.failed += 1;
      out.set(row.documentId, lecture);
    }
    return out;
  }

  /** Failed rows of every kind, the number the card shows in red. */
  private async failedRows(ids: string[]): Promise<Map<string, number>> {
    const rows = (await this.segments.findAll({
      attributes: ['documentId', [fn('COUNT', col('id')), 'n']],
      where: { documentId: { [Op.in]: ids }, status: 'failed' } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; n: number | string }[];
    return new Map(rows.map((row) => [row.documentId, Number(row.n)]));
  }

  /** One document's lecture rows, every style and kind, with their reasons. */
  async pages(
    institutionId: string,
    documentId: string,
  ): Promise<MaterialPageDto[]> {
    const doc = await this.documents.findOne({
      where: { id: documentId, institutionId, deletedAt: null } as never,
      attributes: ['id', 'contentVersion'],
    });
    if (!doc) return [];
    const rows = await this.segments.findAll({
      attributes: [
        'pageNumber',
        'kind',
        'style',
        'status',
        'error',
        'updatedAt',
      ],
      where: {
        documentId,
        contentVersion: doc.get('contentVersion'),
      } as never,
      order: [
        ['pageNumber', 'ASC'],
        ['style', 'ASC'],
        ['kind', 'ASC'],
      ],
    });
    return rows.map((row) => ({
      pageNumber: row.pageNumber,
      kind: row.kind,
      style: row.style,
      status: effectiveStatus({
        status: row.status,
        updatedAt: row.get('updatedAt') as Date,
      }),
      error: row.error ?? null,
    }));
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

/**
 * The three bars and the word under them. The text bar is the pipeline's
 * own progress; the other two are pages with words and pages with audio
 * over the pages seeded, all styles together. The word is what is
 * happening now, or what needs a person: failed pages with nothing still
 * moving is attention; failed pages with work still going on is the work.
 */
function progressOf(
  row: { status: string; progress?: number | null },
  lecture: MaterialDto['lecture'],
  failed: number,
): MaterialProgress {
  const tallies = Object.values(lecture);
  const total = tallies.reduce((sum, t) => sum + t.total, 0);
  const scripted = tallies.reduce((sum, t) => sum + t.scripted, 0);
  const ready = tallies.reduce((sum, t) => sum + t.ready, 0);
  const percent = (part: number) =>
    total === 0 ? 0 : Math.round((part / total) * 100);
  const text =
    row.status === 'ready'
      ? 100
      : Math.round(Math.max(0, Math.min(1, row.progress ?? 0)) * 100);

  let state: MaterialState;
  if (row.status === 'failed') state = 'failed';
  else if (row.status === 'uploading') state = 'uploading';
  else if (row.status !== 'ready') state = 'preparing';
  else if (total === 0) state = 'ready';
  else if (scripted + failed < total) state = 'writing';
  else if (ready + failed < total) state = 'voicing';
  else if (failed > 0) state = 'attention';
  else state = 'ready';

  return {
    text,
    scripts: percent(scripted),
    audio: percent(ready),
    failed,
    state,
  };
}

const emptyTally = (): MaterialDto['simplified'] => ({
  standard: { done: 0, failed: 0, total: 0 },
  easiest: { done: 0, failed: 0, total: 0 },
});

const emptyLecture = (): MaterialDto['lecture'] =>
  Object.fromEntries(
    LECTURE_STYLE_KEYS.map((style) => [
      style,
      { total: 0, scripted: 0, ready: 0, failed: 0 },
    ]),
  ) as Record<
    LectureStyle,
    { total: number; scripted: number; ready: number; failed: number }
  >;
