import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import type { TopicRepository } from '../../business/repositories/misc.repository';
import {
  linesOfTimeline,
  nextFreeLine,
  type BoardTimeline,
  type WordTimes,
} from '../../business/domain/board';
import {
  beatFor,
  estimateDurationMs,
  scriptForTts,
  type LecturePlan,
} from '../../business/domain/lecture';
import type { LectureBoardJobData } from '../queues';
import type { JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';

/**
 * Writes the board for a row that already has its words: a lecture from
 * before boards existed, or one whose board failed. The script and the
 * audio are left exactly as they are; only the board is written, drawn
 * and timed.
 */
@Injectable()
export class LectureBoardProcessor {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly boards: LectureBoardService,
  ) {}

  // The runner hands every processor its context; this one has nothing to log.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of the processor shape
  async process(job: LectureBoardJobData, _context: JobContext): Promise<void> {
    const { documentId, pageNumber, contentVersion } = job;
    const style = job.style ?? 'steady';
    const kind = job.kind ?? 'page';
    const key = { documentId, contentVersion, pageNumber, style, kind };

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;

    const row = await this.lectures.findSegment(
      documentId,
      pageNumber,
      contentVersion,
      style,
      kind,
    );
    if (!row?.scriptText || !row.topicId) return;
    await this.lectures.saveBoard({
      ...key,
      board: row.board ?? null,
      boardStatus: 'pending',
    });
    const planRecord = await this.lectures.findPlan(
      documentId,
      row.topicId,
      contentVersion,
    );
    const plan = planRecord?.plan as LecturePlan | null;
    if (!plan) {
      await this.lectures.saveBoard({
        ...key,
        board: row.board ?? null,
        boardStatus: 'failed',
      });
      return;
    }
    const topic = (await this.topics.listByDocument(documentId)).find(
      (candidate) => candidate.id === row.topicId,
    );
    const durationMs =
      row.durationMs ?? estimateDurationMs(scriptForTts(row.scriptText));

    if (kind === 'terms' || kind === 'check') {
      await this.boards.writeForExtra({
        key,
        script: row.scriptText,
        topicTitle: topic?.title ?? 'this chapter',
        plan,
        durationMs,
      });
    } else if (kind === 'page' || kind === 'part') {
      const page = await this.pages.findOne(documentId, pageNumber);
      const beat = beatFor(plan, pageNumber);
      // A board the planner wrote keeps its lines: they are read back from
      // the board itself and placed again by the words, with no model call.
      const stored = row.board as BoardTimeline | null;
      const planned =
        stored?.marked === true && Array.isArray(stored.ops)
          ? linesOfTimeline(stored)
          : null;
      // A part continues the page's board: its lines start after them.
      const pageRow =
        kind === 'part'
          ? await this.lectures.findSegment(
              documentId,
              pageNumber,
              contentVersion,
              style,
              'page',
            )
          : null;
      const pageBoard = pageRow?.board as BoardTimeline | null | undefined;
      const startLine =
        kind === 'part' && pageBoard && Array.isArray(pageBoard.ops)
          ? nextFreeLine(pageBoard)
          : undefined;
      const timeline = planned
        ? await this.boards.writeFromMarkers({
            key,
            script: row.scriptText,
            pageText: page?.text ?? '',
            plan,
            beat,
            durationMs,
            continues: kind === 'part',
            startLine,
            sections: [{ move: 0, text: row.scriptText }],
            board: planned,
          })
        : await this.boards.writeForPage({
            key,
            script: row.scriptText,
            pageText: page?.text ?? '',
            topicTitle: topic?.title ?? 'this chapter',
            plan,
            beat,
            durationMs,
            continues: kind === 'part',
            startLine,
            bridge: row.bridge,
            moveOffsets: row.moveOffsets ?? undefined,
          });
      if (
        timeline &&
        kind === 'page' &&
        this.boards.figureFor(plan, pageNumber)
      ) {
        await this.boards.requestDiagram({ ...key, topicId: row.topicId });
      }
    } else {
      return;
    }

    // The board is up, timed on what the row had. When the audio exists
    // and has not been measured yet, ask for the measurement, which times
    // the board again.
    const fresh = await this.lectures.findSegment(
      documentId,
      pageNumber,
      contentVersion,
      style,
      kind,
    );
    if (!fresh || fresh.boardStatus !== 'done') return;
    const times = fresh.wordTimes as WordTimes | null;
    const measured =
      times && times.audioKey === fresh.audioKey && times.source !== 'estimate';
    if (!measured && fresh.audioKey) await this.boards.requestAlignment(key);
  }
}
