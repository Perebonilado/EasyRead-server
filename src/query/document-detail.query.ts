import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn } from 'sequelize';
import type { DocumentDetail, Level, PageStatus } from '../contracts';
import {
  DocumentModel,
  PipelineRunModel,
  ReadingPositionModel,
  SimplifiedPageModel,
  TopicModel,
} from '../web/database/models';
import { toListItem } from './shared/document-shape';

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
  ) {}

  async execute(documentId: string, userId: string): Promise<DocumentDetail> {
    const doc = await this.documents.findOne({
      where: { id: documentId, userId, deletedAt: null } as never,
    });
    // Someone else's document reads as missing so ids can't be probed.
    if (!doc) throw new NotFoundException('Document not found');

    const [tallies, steps, topicCount, position] = await Promise.all([
      this.tallyByLevel(documentId),
      this.runs.findAll({ where: { documentId } as never }),
      this.topics.count({ where: { documentId } as never }),
      this.positions.findOne({ where: { documentId, userId } as never }),
    ]);

    const standard = tallies.standard;
    const easiest = tallies.easiest;

    return {
      ...toListItem(doc, standard.done),
      contentVersion: doc.contentVersion,
      steps: steps.map((run) => ({
        step: run.step,
        status: run.status,
        error: run.error,
      })),
      simplified: { standard, easiest },
      topicsReady: topicCount > 0,
      easiestState: this.easiestState(easiest),
      position: position
        ? {
            lastPage: position.lastPage,
            furthestPage: position.furthestPage,
            level: position.level,
          }
        : null,
    };
  }

  /**
   * `locked` until the user spends a conversion, `generating` while pages are
   * still being written, `ready` once every page has landed — the three states
   * the Easiest toggle renders (§3.2).
   */
  private easiestState(tally: LevelTally): DocumentDetail['easiestState'] {
    if (tally.total === 0) return 'locked';
    if (tally.done + tally.failed < tally.total) return 'generating';
    return 'ready';
  }

  private async tallyByLevel(
    documentId: string,
  ): Promise<Record<Level, LevelTally>> {
    const rows = (await this.simplified.findAll({
      attributes: ['level', 'status', [fn('COUNT', col('id')), 'total']],
      where: { documentId } as never,
      group: ['level', 'status'],
      raw: true,
    })) as unknown as {
      level: Level;
      status: PageStatus;
      total: number | string;
    }[];

    const empty = (): LevelTally => ({ done: 0, failed: 0, total: 0 });
    const result: Record<Level, LevelTally> = {
      standard: empty(),
      easiest: empty(),
    };

    for (const row of rows) {
      const count = Number(row.total);
      const tally = result[row.level];
      if (!tally) continue;
      tally.total += count;
      if (row.status === 'done') tally.done += count;
      if (row.status === 'failed') tally.failed += count;
    }

    return result;
  }
}
