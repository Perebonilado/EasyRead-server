import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENT_BUS, SPEECH, STORAGE } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { SpeechPort } from '../../business/ports/voice.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import {
  LECTURE_GENERATOR_VERSION,
  LECTURE_STYLES,
  contentHash,
  estimateDurationMs,
  scriptForTts,
} from '../../business/domain/lecture';
import type { LectureVoiceJobData } from '../queues';
import type { JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';

/**
 * One finished script, turned into audio.
 *
 * Its own queue, because synthesis depends on nothing but the script:
 * keeping it off the writing path lets a chapter carry on writing while
 * its earlier pages are being voiced, and lets many pages be voiced at
 * once. The file is cached on a key carrying everything that could change
 * the audio, so nothing is ever synthesised twice.
 */
@Injectable()
export class LectureVoiceProcessor {
  private readonly logger = new Logger(LectureVoiceProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly config: ConfigService,
    private readonly boards: LectureBoardService,
  ) {}

  async process(job: LectureVoiceJobData, context: JobContext): Promise<void> {
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
    // Nothing to voice yet: the writer has not committed a script. The
    // chapter job enqueues this only after it has, so this is a guard
    // against out-of-order delivery rather than an expected path.
    if (!row?.scriptText) return;
    if (row.status === 'done' && row.audioKey) return;

    const spoken = scriptForTts(row.scriptText);

    try {
      const voice = this.config.get<string>('AI_LECTURE_VOICE', 'alloy');
      const model = this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');
      // The words and their delivery are both in the key: a page written
      // again, or a style whose delivery changed, gets new audio; a page
      // written the same way gets the file it has.
      const { delivery, speed } = LECTURE_STYLES[style];
      const key =
        `documents/${doc.id}/lecture/v${doc.contentVersion}/` +
        `${pageNumber}${kind === 'page' ? '' : `-${kind}`}-${style}-${voice}-${model}-${LECTURE_GENERATOR_VERSION}-${contentHash(`${delivery}\n${spoken}`)}.mp3`;

      const cached = await this.storage.size(key).catch(() => null);
      if (!cached) {
        const result = await this.speech.synthesize({
          text: spoken,
          voice,
          instructions: delivery,
          speed,
        });
        await this.storage.put({
          key,
          body: result.audio,
          mimeType: result.mimeType,
        });
        await this.calls.record({
          documentId: doc.id,
          task: 'tts_lecture',
          model: `openai:${result.model}`,
          // Speech is priced per character, so the text length is the input.
          tokensIn: spoken.length,
          tokensOut: null,
          latencyMs: null,
          outcome: 'ok',
        });
      }

      await this.lectures.markSegmentDone({
        documentId,
        pageNumber,
        contentVersion,
        style,
        kind,
        audioKey: key,
        durationMs: estimateDurationMs(spoken),
      });

      // The student may be listening right now, waiting on this page.
      await this.events.publish(documentId, {
        type: 'lecture.segment_ready',
        pageNumber,
        style,
        kind,
      });

      // The board learns its timing from this audio, off this path.
      if (this.boards.enabled()) {
        await this.boards.requestAlignment({
          documentId,
          contentVersion,
          pageNumber,
          style,
          kind,
        });
      }
    } catch (error) {
      const message = (error as Error).message;
      if (!context.isFinalAttempt) {
        this.logger.warn(
          `${documentId} p${pageNumber} voicing failed, retrying — ${message}`,
        );
        throw error;
      }
      await this.lectures.markSegmentFailed({
        documentId,
        pageNumber,
        contentVersion,
        style,
        kind,
        error: message,
      });
      await this.calls.record({
        documentId,
        task: 'tts_lecture',
        model: 'unknown',
        tokensIn: null,
        tokensOut: null,
        latencyMs: null,
        outcome: 'failed',
      });
      await this.events.publish(documentId, {
        type: 'lecture.segment_failed',
        pageNumber,
        style,
        kind,
      });
    }
  }
}
