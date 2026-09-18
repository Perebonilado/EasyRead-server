import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal } from 'sequelize';
import type {
  LectureSegmentStatus,
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
  LecturePlanModel,
  LectureSegmentModel,
  PipelineRunModel,
  SimplifiedPageModel,
  VisualSceneModel,
} from '../web/database/models';
import { VISUAL_GENERATOR_VERSION } from '../business/domain/visual';
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
    @InjectModel(LecturePlanModel)
    private readonly plans: typeof LecturePlanModel,
    @InjectModel(VisualSceneModel)
    private readonly visuals: typeof VisualSceneModel,
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

    // A chapter whose plan failed leaves its pages pending with nothing
    // coming: they are counted as failed, so the card says so and offers
    // Retry, instead of reading "writing" for ever.
    const failedPlans = await this.failedPlans(ids);
    const [runs, tallies, lectures, failedRows, costs, untaughtRows, drawn] =
      await Promise.all([
        this.runs.findAll({ where: { documentId: { [Op.in]: ids } } as never }),
        this.tallies(ids),
        this.lectures(ids, failedPlans),
        this.failedRows(ids, failedPlans),
        this.costs(ids),
        this.untaughtRows(ids),
        this.drawnPages(ids),
      ]);

    return rows.map((row) => {
      const tally = tallies.get(row.id) ?? emptyTally();
      return {
        document: toListItem(row, tally.done),
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
        visuals: {
          done: drawn.get(row.id) ?? 0,
          total: row.pageCount ?? 0,
        },
        progress: progressOf(
          row,
          lectures.get(row.id) ?? emptyLecture(),
          failedRows.get(row.id) ?? 0,
          untaughtRows.get(row.id) ?? 0,
        ),
        costUsd: costs.get(row.id) ?? 0,
        batchId: row.uploadBatchId ?? null,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      };
    });
  }

  /** Pages with a visual tutorial made, or marked not suited, under the current generator. */
  private async drawnPages(ids: string[]): Promise<Map<string, number>> {
    const rows = (await this.visuals.findAll({
      attributes: ['documentId', [fn('COUNT', col('id')), 'n']],
      where: {
        documentId: { [Op.in]: ids },
        generatorVersion: VISUAL_GENERATOR_VERSION,
        status: { [Op.in]: ['done', 'not_suitable'] },
      } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; n: number | string }[];
    return new Map(rows.map((row) => [row.documentId, Number(row.n)]));
  }

  private async tallies(
    ids: string[],
  ): Promise<Map<string, MaterialDto['simplified']>> {
    const rows = (await this.simplified.findAll({
      attributes: ['documentId', 'status', [fn('COUNT', col('id')), 'n']],
      where: { documentId: { [Op.in]: ids } } as never,
      group: ['documentId', 'status'],
      raw: true,
    })) as unknown as {
      documentId: string;
      status: string;
      n: number | string;
    }[];
    const out = new Map<string, MaterialDto['simplified']>();
    for (const row of rows) {
      const tally = out.get(row.documentId) ?? emptyTally();
      const n = Number(row.n);
      tally.total += n;
      if (row.status === 'done') tally.done += n;
      if (row.status === 'failed') tally.failed += n;
      out.set(row.documentId, tally);
    }
    return out;
  }

  private async lectures(
    ids: string[],
    failedPlans: FailedPlans,
  ): Promise<Map<string, MaterialDto['lecture']>> {
    const rows = await this.segments.findAll({
      attributes: [
        'documentId',
        'topicId',
        'contentVersion',
        'style',
        'status',
        'updatedAt',
        [literal('script_text IS NOT NULL'), 'scripted'],
      ],
      // Every row, the short segments around a chapter included, so that
      // an audio bar at 100 means the whole lecture and the failed count
      // never contradicts it.
      where: { documentId: { [Op.in]: ids } } as never,
    });
    const out = new Map<string, MaterialDto['lecture']>();
    for (const row of rows) {
      const lecture = out.get(row.documentId) ?? emptyLecture();
      const bucket = lecture[row.style];
      const status: LectureSegmentStatus = planFailedFor(failedPlans, row)
        ? 'failed'
        : effectiveStatus({
            status: row.status,
            updatedAt: row.get('updatedAt') as Date,
          });
      bucket.total += 1;
      if (Number(row.get('scripted'))) bucket.scripted += 1;
      if (status === 'voicing') bucket.voicing += 1;
      if (status === 'done') bucket.ready += 1;
      if (status === 'failed') bucket.failed += 1;
      out.set(row.documentId, lecture);
    }
    return out;
  }

  /** Paragraphs left untaught across a document's written pages, the number the card shows beside failures. */
  private async untaughtRows(ids: string[]): Promise<Map<string, number>> {
    const rows = (await this.segments.findAll({
      attributes: ['documentId', 'untaught'],
      where: {
        documentId: { [Op.in]: ids },
        untaught: { [Op.ne]: null },
        scriptText: { [Op.ne]: null },
      } as never,
      raw: true,
    })) as unknown as { documentId: string; untaught: number[] | null }[];
    const out = new Map<string, number>();
    for (const row of rows) {
      const count = Array.isArray(row.untaught) ? row.untaught.length : 0;
      if (count)
        out.set(row.documentId, (out.get(row.documentId) ?? 0) + count);
    }
    return out;
  }

  /** Failed rows of every kind, the number the card shows in red. */
  private async failedRows(
    ids: string[],
    failedPlans: FailedPlans,
  ): Promise<Map<string, number>> {
    const rows = (await this.segments.findAll({
      attributes: ['documentId', [fn('COUNT', col('id')), 'n']],
      where: { documentId: { [Op.in]: ids }, status: 'failed' } as never,
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; n: number | string }[];
    const out = new Map(rows.map((row) => [row.documentId, Number(row.n)]));
    // The pages of a chapter that could not be planned: pending rows that
    // nothing will write until the chapter is asked for again.
    const stuck = failedPlans.size
      ? ((await this.segments.findAll({
          attributes: ['documentId', 'topicId', 'contentVersion', 'status'],
          where: {
            documentId: { [Op.in]: [...failedPlans.keys()] },
            status: 'pending',
          } as never,
          raw: true,
        })) as unknown as {
          documentId: string;
          topicId: string | null;
          contentVersion: number;
          status: string;
        }[])
      : [];
    for (const row of stuck) {
      if (!planFailedFor(failedPlans, row)) continue;
      out.set(row.documentId, (out.get(row.documentId) ?? 0) + 1);
    }
    return out;
  }

  /** Chapters whose plan failed on its last attempt, by document, with the reason. */
  private async failedPlans(ids: string[]): Promise<FailedPlans> {
    const rows = (await this.plans.findAll({
      attributes: ['documentId', 'topicId', 'contentVersion', 'error'],
      where: { documentId: { [Op.in]: ids }, status: 'failed' } as never,
      raw: true,
    })) as unknown as {
      documentId: string;
      topicId: string;
      contentVersion: number;
      error: string | null;
    }[];
    const out: FailedPlans = new Map();
    for (const row of rows) {
      const chapters = out.get(row.documentId) ?? new Map<string, string>();
      chapters.set(
        planKey(row.topicId, row.contentVersion),
        row.error ?? 'The chapter could not be planned',
      );
      out.set(row.documentId, chapters);
    }
    return out;
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
    const failedPlans = await this.failedPlans([documentId]);
    const rows = await this.segments.findAll({
      attributes: [
        'documentId',
        'topicId',
        'contentVersion',
        'pageNumber',
        'kind',
        'style',
        'status',
        'error',
        'untaught',
        'scriptText',
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
      status: planFailedFor(failedPlans, row)
        ? 'failed'
        : effectiveStatus({
            status: row.status,
            updatedAt: row.get('updatedAt') as Date,
          }),
      error: planFailedFor(failedPlans, row)
        ? `Chapter not planned: ${planFailedFor(failedPlans, row)}`
        : (row.error ?? null),
      untaught:
        row.scriptText && Array.isArray(row.untaught)
          ? row.untaught.length
          : null,
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

/** Document → chapter key → why its plan failed. */
type FailedPlans = Map<string, Map<string, string>>;

const planKey = (topicId: string, contentVersion: number) =>
  `${topicId}:${contentVersion}`;

/**
 * The reason a pending row will never be written on its own: its chapter's
 * plan failed. Null for any row that is not pending, or whose chapter
 * planned fine.
 */
export function planFailedFor(
  failedPlans: FailedPlans,
  row: {
    documentId: string;
    topicId: string | null;
    contentVersion: number;
    status: string;
  },
): string | null {
  if (row.status !== 'pending' || !row.topicId) return null;
  return (
    failedPlans
      .get(row.documentId)
      ?.get(planKey(row.topicId, row.contentVersion)) ?? null
  );
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
  untaught = 0,
): MaterialProgress {
  const tallies = Object.values(lecture);
  const total = tallies.reduce((sum, t) => sum + t.total, 0);
  const scripted = tallies.reduce((sum, t) => sum + t.scripted, 0);
  const voicing = tallies.reduce((sum, t) => sum + t.voicing, 0);
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
  // Every page has its words. Audio being made is voicing; a failure with
  // nothing moving needs a person; otherwise the words are waiting for the
  // admin's Voice.
  else if (ready + failed < total)
    state = voicing > 0 ? 'voicing' : failed > 0 ? 'attention' : 'written';
  else if (failed > 0 || untaught > 0) state = 'attention';
  else state = 'ready';

  return {
    text,
    scripts: percent(scripted),
    audio: percent(ready),
    failed,
    untaught,
    state,
  };
}

const emptyTally = (): MaterialDto['simplified'] => ({
  done: 0,
  failed: 0,
  total: 0,
});

const emptyLecture = (): MaterialDto['lecture'] =>
  Object.fromEntries(
    LECTURE_STYLE_KEYS.map((style) => [
      style,
      { total: 0, scripted: 0, voicing: 0, ready: 0, failed: 0 },
    ]),
  ) as MaterialDto['lecture'];
