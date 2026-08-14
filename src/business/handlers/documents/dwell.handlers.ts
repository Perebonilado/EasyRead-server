import { Inject, Injectable } from '@nestjs/common';
import type { Level } from '../../../contracts';
import { judgeVisit } from '../../domain/dwell';
import {
  DOCUMENT_PAGE_REPOSITORY,
  READING_POSITION_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import type { ReadingPositionRepository } from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { StruggleRecorder } from './struggle-recorder.service';

export interface DwellVisitInput {
  page: number;
  /** The original text counts too — dwell is about what was on screen. */
  level: Level | 'original';
  ms: number;
}

export interface RecordDwellRequest {
  userId: string;
  documentId: string;
  visits: DwellVisitInput[];
}

export interface RecordDwellResponse {
  /** The page to offer help on, if this batch found the reader stuck. */
  stuckOnPage: number | null;
}

/** One nudge per document per ten minutes, however much dwell arrives. */
const NUDGE_COOLDOWN_MS = 10 * 60_000;

/**
 * Turns reading time into signals — and, when someone is plainly stuck, into
 * an offer of help.
 *
 * Nothing raw is persisted: each visit is judged (see `domain/dwell`) and
 * either becomes a signal or disappears. The nudge is throttled in memory
 * rather than stored, because a missed nudge costs nothing and a table of
 * when-you-struggled costs trust.
 */
@Injectable()
export class RecordDwellHandler extends AbstractRequestHandlerTemplate<
  RecordDwellRequest,
  RecordDwellResponse
> {
  private readonly lastNudge = new Map<string, number>();

  constructor(
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(READING_POSITION_REPOSITORY)
    private readonly positions: ReadingPositionRepository,
    private readonly access: DocumentAccessService,
    private readonly struggles: StruggleRecorder,
  ) {
    super();
  }

  protected async handleRequest(cmd: RecordDwellRequest) {
    await this.access.requireReadable(cmd.documentId, cmd.userId);

    const position = await this.positions.find(cmd.documentId, cmd.userId);
    const furthest = position?.furthestPage ?? 0;

    let stuckOnPage: number | null = null;

    for (const visit of cmd.visits) {
      const words = await this.wordsOn(cmd.documentId, visit);
      // A page we can't measure can't be judged — silently skip it rather
      // than guess a length and invent a verdict.
      if (words === null) continue;

      const verdict = judgeVisit(
        { page: visit.page, words, ms: visit.ms },
        furthest,
      );
      if (!verdict) continue;

      await this.struggles.record({
        userId: cmd.userId,
        documentId: cmd.documentId,
        kind: verdict.kind,
        pageNumber: verdict.page,
        meta:
          verdict.kind === 'long_dwell'
            ? { ms: verdict.ms, expected: verdict.expected }
            : { ms: verdict.ms },
      });

      if (verdict.kind === 'long_dwell' && stuckOnPage === null) {
        stuckOnPage = verdict.page;
      }
    }

    return CommandResponse.of<RecordDwellResponse>({
      stuckOnPage:
        stuckOnPage !== null && this.mayNudge(cmd.userId, cmd.documentId)
          ? stuckOnPage
          : null,
    });
  }

  /** Word count at the level the reader was actually reading. */
  private async wordsOn(
    documentId: string,
    visit: DwellVisitInput,
  ): Promise<number | null> {
    if (visit.level === 'original') {
      const page = await this.pages.findOne(documentId, visit.page);
      return page ? countWords(page.text) : null;
    }
    const page = await this.simplified.find(
      documentId,
      visit.level,
      visit.page,
    );
    if (!page?.blocks) return null;
    return countWords(page.blocks.map((block) => block.text).join(' '));
  }

  private mayNudge(userId: string, documentId: string): boolean {
    const key = `${userId}:${documentId}`;
    const last = this.lastNudge.get(key) ?? 0;
    if (Date.now() - last < NUDGE_COOLDOWN_MS) return false;
    this.lastNudge.set(key, Date.now());
    return true;
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
