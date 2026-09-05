import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Block, Level } from '../../contracts';
import { EVENT_BUS } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import {
  LECTURE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../business/repositories/tokens';
import type {
  LectureRepository,
  LectureSegmentRecord,
  SegmentKey,
} from '../../business/repositories/lecture.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import type { WordTimes } from '../../business/domain/board';
import {
  noteLevelFor,
  trackFromAlignment,
  trackFromEstimate,
  trackFromMoves,
  type FollowTrack,
} from '../../business/domain/follow';
import {
  beatFor,
  scriptForTts,
  type LecturePlan,
} from '../../business/domain/lecture';

type FollowKey = SegmentKey & {
  kind: 'page' | 'part' | 'terms' | 'check' | 'review';
};

/**
 * Builds and stores a row's follow-along track: where in the simplified
 * note the tutor is at each moment. Twice per row: on the moves the moment
 * the row is voiced, so the reader has a block to look at at once, and on
 * the measured word times once the aligner has run, so the sentence is
 * known. Never on the page's critical path: a row plays with or without it.
 */
@Injectable()
export class LectureFollowService {
  private readonly logger = new Logger(LectureFollowService.name);

  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  /** The note a style teaches from, falling back to the other level when that one is not written. */
  async noteFor(
    documentId: string,
    style: SegmentKey['style'],
    pageNumber: number,
  ): Promise<{ level: Level; blocks: Block[] } | null> {
    const wanted = noteLevelFor(style);
    const other: Level = wanted === 'easiest' ? 'standard' : 'easiest';
    for (const level of [wanted, other]) {
      const page = await this.simplified.find(documentId, level, pageNumber);
      if (page?.status === 'done' && page.blocks) {
        return { level, blocks: page.blocks };
      }
    }
    return null;
  }

  /** The block-level track, from the words at a steady pace, the moment the row is voiced. */
  async trackOnMoves(
    key: FollowKey,
    row: LectureSegmentRecord,
  ): Promise<FollowTrack | null> {
    if (key.kind !== 'page' && key.kind !== 'part') return null;
    if (!row.scriptText) return null;
    try {
      const note = await this.noteFor(
        key.documentId,
        key.style,
        key.pageNumber,
      );
      if (!note) {
        await this.lectures.saveFollow({
          ...key,
          follow: null,
          followStatus: 'none',
        });
        return null;
      }
      const spoken = scriptForTts(row.scriptText);
      const durationMs =
        row.durationMs ?? Math.round((spoken.length / 15) * 1000);
      // The words themselves say which block they teach; the plan's own
      // block numbers are only the fallback for a note with nothing to
      // match against.
      const estimated = trackFromEstimate(
        spoken,
        durationMs,
        note.blocks,
        note.level,
      );
      if (estimated) {
        await this.save(key, estimated);
        return estimated;
      }
      const plan = row.topicId
        ? ((
            await this.lectures.findPlan(
              key.documentId,
              row.topicId,
              key.contentVersion,
            )
          )?.plan as LecturePlan | null | undefined)
        : null;
      const beat = plan ? beatFor(plan, key.pageNumber) : null;
      const track = trackFromMoves(
        row.moveOffsets ?? [],
        row.scriptText.length,
        durationMs,
        beat?.moveBlocks ?? null,
        note.level,
      );
      await this.save(key, track);
      return track;
    } catch (error) {
      this.logger.warn(
        `${key.documentId} p${key.pageNumber} ${key.style}: follow track on moves failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** The sentence-level track, once the words are timed on the audio. */
  async trackOnTimes(
    key: FollowKey,
    row: LectureSegmentRecord,
    wordTimes: WordTimes,
  ): Promise<FollowTrack | null> {
    if (key.kind !== 'page' && key.kind !== 'part') return null;
    if (!row.scriptText) return null;
    try {
      const note = await this.noteFor(
        key.documentId,
        key.style,
        key.pageNumber,
      );
      if (!note) {
        await this.lectures.saveFollow({
          ...key,
          follow: null,
          followStatus: 'none',
        });
        return null;
      }
      const spoken = scriptForTts(row.scriptText);
      const track = trackFromAlignment(
        spoken,
        wordTimes.sentences,
        note.blocks,
        note.level,
      );
      await this.save(key, track);
      return track;
    } catch (error) {
      this.logger.warn(
        `${key.documentId} p${key.pageNumber} ${key.style}: follow track on times failed: ${(error as Error).message}`,
      );
      await this.lectures.saveFollow({
        ...key,
        follow: null,
        followStatus: 'failed',
      });
      return null;
    }
  }

  private async save(key: FollowKey, track: FollowTrack): Promise<void> {
    await this.lectures.saveFollow({
      ...key,
      follow: track,
      followStatus: 'done',
    });
    await this.events.publish(key.documentId, {
      type: 'lecture.follow_ready',
      pageNumber: key.pageNumber,
      style: key.style,
      kind: key.kind,
    });
  }
}
