import { Inject, Injectable, Logger } from '@nestjs/common';
import { ALIGNER, STORAGE } from '../../business/ports/tokens';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import {
  estimateWordTimes,
  wordTimesFromAligned,
  type WordTimes,
} from '../../business/domain/board';
import { scriptForTts } from '../../business/domain/lecture';
import type { LectureAlignJobData } from '../queues';
import type { JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';
import { LectureFollowService } from './lecture-follow.service';

/**
 * Measures where each spoken word falls in a row's finished audio, then
 * times the row's board on it.
 *
 * Its own queue, because alignment is CPU work on the worker: it must
 * never slow voicing, and two at a time is plenty. When the aligner is
 * off, cannot run, or returns something the sanity checks refuse, the
 * board is timed on the estimate instead: worse timing, never no board.
 */
@Injectable()
export class LectureAlignProcessor {
  private readonly logger = new Logger(LectureAlignProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(ALIGNER) private readonly aligner: AlignerPort,
    private readonly boards: LectureBoardService,
    private readonly follows: LectureFollowService,
  ) {}

  async process(job: LectureAlignJobData, context: JobContext): Promise<void> {
    const { documentId, pageNumber, contentVersion } = job;
    const style = job.style ?? 'steady';
    const kind = job.kind ?? 'page';

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
    if (!row?.scriptText || !row.audioKey) return;
    const key = { documentId, contentVersion, pageNumber, style, kind };

    // Times measured on this very audio are kept; other audio makes them
    // stale, which is how a re-voiced page is measured again.
    const existing = row.wordTimes as WordTimes | null;
    let times: WordTimes | null =
      existing &&
      existing.audioKey === row.audioKey &&
      existing.source !== 'estimate'
        ? existing
        : null;

    const spoken = scriptForTts(row.scriptText);
    const durationMs =
      row.durationMs ?? Math.round((spoken.length / 15) * 1000);

    if (!times && this.aligner.enabled()) {
      try {
        const audio = await this.storage.get(row.audioKey);
        const aligned = await this.aligner.align({
          audio,
          mimeType: 'audio/mpeg',
          text: spoken,
        });
        if (aligned) {
          times = wordTimesFromAligned(
            aligned.words,
            spoken,
            durationMs,
            row.audioKey,
            aligned.engine === 'dtw' ? 'echogarden-dtw' : 'echogarden-whisper',
          );
          if (!times) {
            this.logger.warn(
              `${documentId} p${pageNumber} ${style} ${kind}: alignment failed the sanity checks; timing on the estimate`,
            );
          }
        }
      } catch (error) {
        // A transient failure is worth one more try; the last one falls
        // back to the estimate rather than leaving the board untimed.
        if (!context.isFinalAttempt) throw error;
        this.logger.warn(
          `${documentId} p${pageNumber}: alignment gave up — ${(error as Error).message}`,
        );
      }
    }

    if (!times) times = estimateWordTimes(spoken, durationMs, row.audioKey);
    await this.lectures.saveWordTimes({ ...key, wordTimes: times });
    // Measured times give the sentence the tutor is on; the estimate only
    // ever gives the block, which the row already has.
    if (times.source !== 'estimate') {
      await this.follows.trackOnTimes(key, { ...row, wordTimes: times }, times);
    }
    await this.boards.timeRow({
      key,
      row: { ...row, wordTimes: times },
      wordTimes: times,
    });
  }
}
