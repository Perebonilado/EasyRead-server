import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Block, Level } from '../../contracts';
import { EVENT_BUS, LLM_GATEWAY } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  LECTURE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  LectureRepository,
  LectureSegmentRecord,
  SegmentKey,
} from '../../business/repositories/lecture.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import type { WordTimes } from '../../business/domain/board';
import {
  MEANING_DIMENSIONS,
  meaningScores,
  meaningTexts,
  noteLevelFor,
  noteUnits,
  trackFromAlignment,
  trackFromEstimate,
  trackFromMoves,
  type FollowTrack,
  type SectionTag,
} from '../../business/domain/follow';
import { estimateWordTimes } from '../../business/domain/board';
import {
  beatFor,
  scriptForTts,
  type LecturePlan,
} from '../../business/domain/lecture';

type FollowKey = SegmentKey & {
  kind: 'page' | 'part' | 'map' | 'terms' | 'check' | 'review';
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

  /** Vectors by text, so a note's sentences are embedded once for every style and rebuild. */
  private readonly vectors = new Map<string, number[]>();

  constructor(
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
  ) {}

  /**
   * How much each note unit is about each spoken sentence, by meaning:
   * one small embedding call per row, the note's vectors kept so the next
   * style or rebuild pays only for the spoken side. Null when the service
   * is unavailable; the track is then built on words and tags, marked so,
   * and built again later.
   */
  private async meaningFor(
    documentId: string,
    spoken: string,
    sentences: number[][],
    blocks: Block[],
  ): Promise<number[][] | null> {
    const texts = meaningTexts(spoken, sentences, noteUnits(blocks));
    const wanted = [...new Set([...texts.spoken, ...texts.units])].filter(
      (text) => text && !this.vectors.has(text),
    );
    try {
      if (wanted.length) {
        const result = await this.llm.embed({
          texts: wanted,
          dimensions: MEANING_DIMENSIONS,
        });
        wanted.forEach((text, i) => this.vectors.set(text, result.value[i]));
        // A bounded cache: the oldest entries go first.
        while (this.vectors.size > 20_000) {
          for (const oldest of this.vectors.keys()) {
            this.vectors.delete(oldest);
            break;
          }
        }
        await this.calls.record({
          documentId,
          task: 'lecture_follow',
          model: result.usage.model,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          latencyMs: result.usage.latencyMs,
          outcome: 'ok',
        });
      }
    } catch (error) {
      this.logger.warn(
        `${documentId}: the follow track goes without meaning: ${(error as Error).message}`,
      );
      return null;
    }
    const vector = (text: string) => this.vectors.get(text) ?? [];
    return meaningScores(texts.spoken.map(vector), texts.units.map(vector));
  }

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
        (row.sectionTags as SectionTag[] | null) ?? null,
        await this.meaningFor(
          key.documentId,
          spoken,
          estimateWordTimes(spoken, durationMs, '').sentences,
          note.blocks,
        ),
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
        (row.sectionTags as SectionTag[] | null) ?? null,
        await this.meaningFor(
          key.documentId,
          spoken,
          wordTimes.sentences,
          note.blocks,
        ),
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

  /**
   * The tracks of a page, built again on its note as it stands now. A
   * note written again moves every sentence the old tracks pointed at;
   * the words and the audio are untouched, so this is only the matching.
   */
  async retrackPage(
    documentId: string,
    contentVersion: number,
    pageNumber: number,
  ): Promise<void> {
    const rows = await this.lectures.listSegments(documentId, contentVersion);
    for (const row of rows) {
      if (row.pageNumber !== pageNumber || row.status !== 'done') continue;
      if (!row.scriptText) continue;
      if (row.kind !== 'page' && row.kind !== 'part') continue;
      const key: FollowKey = {
        documentId,
        contentVersion,
        pageNumber,
        style: row.style,
        kind: row.kind,
      };
      const times = row.wordTimes as WordTimes | null;
      const measured =
        times && times.audioKey === row.audioKey && times.source !== 'estimate';
      if (measured) await this.trackOnTimes(key, row, times);
      else await this.trackOnMoves(key, row);
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
