import { Inject, Injectable, Logger } from '@nestjs/common';
import type { StruggleKind } from '../../domain/struggle';
import {
  STRUGGLE_SIGNAL_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { StruggleSignalRepository } from '../../repositories/struggle.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import { AdaptationService } from './adaptation.service';

/**
 * The one door into the struggle-signal stream.
 *
 * Producers hand over what happened and where; this service resolves the
 * page to a chapter (so signals aggregate by topic later) and writes the
 * row. Fire-and-forget by contract: a lost signal is a statistic missed, and
 * must never fail the request that produced it.
 */
@Injectable()
export class StruggleRecorder {
  private readonly logger = new Logger(StruggleRecorder.name);

  constructor(
    @Inject(STRUGGLE_SIGNAL_REPOSITORY)
    private readonly signals: StruggleSignalRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    private readonly adaptation: AdaptationService,
  ) {}

  /** Never throws. */
  async record(input: {
    userId: string;
    documentId: string;
    kind: StruggleKind;
    pageNumber?: number | null;
    topicId?: string | null;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      let topicId = input.topicId ?? null;
      if (!topicId && input.pageNumber) {
        const topics = await this.topics.listWithReadState(
          input.documentId,
          input.userId,
        );
        topicId =
          topics.find(
            (topic) =>
              (input.pageNumber as number) >= topic.startPage &&
              (input.pageNumber as number) <= topic.endPage,
          )?.id ?? null;
      }
      await this.signals.record({
        userId: input.userId,
        documentId: input.documentId,
        kind: input.kind,
        topicId,
        pageNumber: input.pageNumber ?? null,
        meta: input.meta ?? null,
      });
      // Re-judge on every write: the fast loop is what makes adaptation
      // arrive within a session rather than after one.
      await this.adaptation.reassess(input.userId, input.documentId);
    } catch (error) {
      this.logger.warn(
        `signal ${input.kind} dropped: ${(error as Error).message}`,
      );
    }
  }
}
