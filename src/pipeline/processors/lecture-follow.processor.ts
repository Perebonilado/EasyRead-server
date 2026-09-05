import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import type { WordTimes } from '../../business/domain/board';
import type { LectureFollowJobData } from '../queues';
import { LectureFollowService } from './lecture-follow.service';

/**
 * Builds the follow-along track for a row that already has its words: a
 * lecture from before tracks existed, a track from an older generator, or
 * a note that was written after the lecture. The words and the audio are
 * left exactly as they are.
 */
@Injectable()
export class LectureFollowProcessor {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    private readonly follows: LectureFollowService,
  ) {}

  async process(job: LectureFollowJobData): Promise<void> {
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
    if (!row?.scriptText) return;
    const key = { documentId, contentVersion, pageNumber, style, kind };
    const times = row.wordTimes as WordTimes | null;
    const measured =
      times && times.audioKey === row.audioKey && times.source !== 'estimate';
    if (measured) {
      await this.follows.trackOnTimes(key, row, times);
    } else {
      await this.follows.trackOnMoves(key, row);
    }
  }
}
