import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALIGNER,
  EVENT_BUS,
  LECTURE_SPEECH,
  SPEECH,
  STORAGE,
} from '../../business/ports/tokens';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { SpeechPort } from '../../business/ports/voice.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
  PRONUNCIATION_REPOSITORY,
} from '../../business/repositories/tokens';
import type { PronunciationRepository } from '../../business/repositories/pronunciation.repository';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import {
  LECTURE_GENERATOR_VERSION,
  LECTURE_STYLES,
  PAUSE_MARKER,
  contentHash,
  estimateDurationMs,
  scriptForTts,
  type SegmentKind,
} from '../../business/domain/lecture';
import type { LectureStyle } from '../../contracts';
import type { LectureVoiceJobData } from '../queues';
import { catalogueSpeechCost } from '../../business/domain/cost';
import { spokenForm } from '../../business/domain/spoken';
import {
  DELIVERY_VERSION,
  deliveryPieces,
} from '../../business/domain/delivery';
import { mp3DurationMs, speechTooShort } from '../../business/domain/speech';
import { isPermanentFailure, type JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';
import { LectureFollowService } from './lecture-follow.service';

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
    @Inject(PRONUNCIATION_REPOSITORY)
    private readonly pronunciations: PronunciationRepository,
    @Inject(LECTURE_SPEECH) private readonly catalogueSpeech: SpeechPort,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly config: ConfigService,
    private readonly boards: LectureBoardService,
    private readonly follows: LectureFollowService,
    @Inject(ALIGNER) private readonly aligner: AlignerPort,
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

    // What the reader sees is not what the voice is handed: the school's
    // pronunciations, abbreviations as letters, numbers and units as words.
    const kept = doc.props.institutionId
      ? await this.pronunciations.kept(doc.props.institutionId)
      : undefined;
    const spoken = spokenForm(scriptForTts(row.scriptText), kept).text;
    // The page cut at each [pause] the writer placed, each stretch in its
    // spoken form, for a voice that answers to pace and silence: a held
    // silence at the pause, a slower sentence for a figure and for the
    // chapter's landing, a quicker opening join, weight where the writer
    // asked for it.
    const stretches = row.scriptText
      .split(PAUSE_MARKER)
      .map((stretch) => spokenForm(scriptForTts(stretch), kept).text)
      .filter(Boolean);
    const place = await this.placeInChapter(
      documentId,
      contentVersion,
      style,
      row,
    );
    const pieces = deliveryPieces({
      stretches,
      style,
      midChapter: kind === 'page' && place.midChapter,
      // The quick learner's chapter ends on its last idea, with no landing
      // line to slow or hold the door for.
      landing: place.landing && style !== 'brisk',
      emphasis: row.emphasis ?? null,
    });

    try {
      // A school's catalogue is voiced on the rented GPU; a learner's own
      // upload by the per-character voice, as always, so somebody waiting
      // on their own document never waits on a sleeping container.
      const rentedVoice = Boolean(doc.props.institutionId);
      const speech = rentedVoice ? this.catalogueSpeech : this.speech;
      const { model, voice: named } = speech.label();
      const voice = rentedVoice
        ? named
        : this.config.get<string>('AI_LECTURE_VOICE', named);
      // The words and their delivery are both in the key: a page written
      // again, or a style whose delivery changed, gets new audio; a page
      // written the same way gets the file it has.
      const { delivery, speed } = LECTURE_STYLES[style];
      const key =
        `documents/${doc.id}/lecture/v${doc.contentVersion}/` +
        `${pageNumber}${kind === 'page' ? '' : `-${kind}`}-${style}-${voice}-${model}-${LECTURE_GENERATOR_VERSION}-${contentHash(`${delivery}\n${DELIVERY_VERSION}\n${JSON.stringify(pieces)}`)}.mp3`;

      // A file already there is kept only when it is long enough to be
      // the whole page: a fragment the voice once returned is voiced again.
      const cached = await this.storage.size(key).catch(() => null);
      const whole = cached !== null && !speechTooShort(cached, spoken.length);
      let durationMs = estimateDurationMs(spoken);
      if (!whole) {
        if (cached !== null) {
          this.logger.warn(
            `${documentId} p${pageNumber} ${style}: the audio on file is ${Math.round(mp3DurationMs(cached) / 1000)}s for ${spoken.length} chars; voicing it again`,
          );
        }
        const result = await speech.synthesize({
          text: spoken,
          voice,
          instructions: delivery,
          speed,
          pieces,
        });
        await this.storage.put({
          key,
          body: result.audio,
          mimeType: result.mimeType,
        });
        // The rented GPU is priced by the audio it made at the bench's
        // measured rate; the per-character voice is priced from the text.
        const rented = result.model.startsWith('modal:');
        const rate = Number(
          this.config.get<string>('MODAL_USD_PER_AUDIO_HOUR', '0'),
        );
        await this.calls.record({
          documentId: doc.id,
          task: 'tts_lecture',
          model: result.model.includes(':')
            ? result.model
            : `openai:${result.model}`,
          // Speech is priced per character, so the text length is the input.
          tokensIn: spoken.length,
          tokensOut: null,
          latencyMs: null,
          outcome: 'ok',
          costUsd: rented
            ? catalogueSpeechCost(
                result.durationMs ?? mp3DurationMs(result.audio.length),
                rate,
              )
            : null,
        });
        // The length the service measured, silences and all; the estimate
        // from the text knows nothing of the silence the pace model adds.
        if (result.durationMs) durationMs = result.durationMs;
      }

      await this.lectures.markSegmentDone({
        documentId,
        pageNumber,
        contentVersion,
        style,
        kind,
        audioKey: key,
        durationMs,
      });

      // The student may be listening right now, waiting on this page.
      await this.events.publish(documentId, {
        type: 'lecture.segment_ready',
        pageNumber,
        style,
        kind,
      });

      // The reader's eye can follow at once, by block; the sentence comes
      // with the alignment.
      await this.follows.trackOnMoves(
        { documentId, contentVersion, pageNumber, style, kind },
        { ...row, durationMs: row.durationMs ?? estimateDurationMs(spoken) },
      );

      // The follow-along track and the board learn their timing from this
      // audio, off this path: the aligner measures every word of it.
      if (this.aligner.enabled() || this.boards.enabled()) {
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
      // A refused request (a 4xx from the voice) cannot succeed by being
      // sent again; it ends the page now rather than after the retries.
      if (!context.isFinalAttempt && !isPermanentFailure(error)) {
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

  /**
   * Where a row sits in its chapter: after the first page, so its opening
   * joins what was just said, and on the last, so it lands. A row around
   * a chapter, or one with no chapter, is neither.
   */
  private async placeInChapter(
    documentId: string,
    contentVersion: number,
    style: LectureStyle,
    row: { topicId: string | null; pageNumber: number; kind: SegmentKind },
  ): Promise<{ midChapter: boolean; landing: boolean }> {
    const none = { midChapter: false, landing: false };
    if (!row.topicId || (row.kind !== 'page' && row.kind !== 'part')) {
      return none;
    }
    const pages = (
      await this.lectures.listSegments(documentId, contentVersion, style)
    )
      .filter(
        (other) =>
          other.topicId === row.topicId &&
          other.kind === 'page' &&
          !other.bridge,
      )
      .sort((a, b) => a.seq - b.seq);
    if (!pages.length) return none;
    return {
      midChapter: row.pageNumber !== pages[0].pageNumber,
      landing: row.pageNumber === pages[pages.length - 1].pageNumber,
    };
  }
}
