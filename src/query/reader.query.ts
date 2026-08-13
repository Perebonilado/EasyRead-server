import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  Level,
  PageTextResponse,
  SimplifiedPagesResponse,
  TopicDto,
} from '../contracts';
import {
  DocumentPageModel,
  SimplifiedPageModel,
  TopicModel,
  TopicReadStateModel,
} from '../web/database/models';

export interface PageRange {
  from?: number;
  to?: number;
}

/** Windowed so a 300-page document never ships in one response. */
const MAX_PAGE_WINDOW = 50;

@Injectable()
export class ReaderQuery {
  constructor(
    @InjectModel(DocumentPageModel)
    private readonly pages: typeof DocumentPageModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(TopicModel) private readonly topics: typeof TopicModel,
    @InjectModel(TopicReadStateModel)
    private readonly readStates: typeof TopicReadStateModel,
  ) {}

  /**
   * The Original pane's text layer. The reader renders the PDF itself from the
   * canonical file; this is the extracted text used for selection, search and
   * the highlight actions.
   */
  async pageText(
    documentId: string,
    range: PageRange,
  ): Promise<PageTextResponse> {
    const { from, to } = this.window(range);

    const rows = await this.pages.findAll({
      where: {
        documentId,
        pageNumber: { [Op.between]: [from, to] },
      } as never,
      order: [['pageNumber', 'ASC']] as never,
    });

    return {
      pages: rows.map((row) => ({
        pageNumber: row.pageNumber,
        text: row.text,
        isEmpty: row.isEmpty,
      })),
    };
  }

  /**
   * The Simplified pane. Pages that haven't been written yet come back as
   * `pending` rather than being omitted, so the client can render the skeleton
   * in the right slot instead of guessing at gaps (§5).
   */
  async simplifiedPages(
    documentId: string,
    level: Level,
    range: PageRange,
  ): Promise<SimplifiedPagesResponse> {
    const { from, to } = this.window(range);

    const rows = await this.simplified.findAll({
      where: {
        documentId,
        level,
        pageNumber: { [Op.between]: [from, to] },
      } as never,
      order: [['pageNumber', 'ASC']] as never,
    });

    return {
      level,
      pages: rows.map((row) => ({
        pageNumber: row.pageNumber,
        status: row.status,
        blocks: row.blocks ?? [],
      })),
    };
  }

  /** Topic list with this user's read state folded in (PRD FR-3). */
  async topicList(documentId: string, userId: string): Promise<TopicDto[]> {
    const topics = await this.topics.findAll({
      where: { documentId } as never,
      order: [['orderIndex', 'ASC']] as never,
    });
    if (!topics.length) return [];

    const read = await this.readStates.findAll({
      where: { userId, topicId: { [Op.in]: topics.map((t) => t.id) } } as never,
    });
    const readIds = new Set(read.map((state) => state.topicId));

    return topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      shortDescription: topic.shortDescription,
      startPage: topic.startPage,
      endPage: topic.endPage,
      isRead: readIds.has(topic.id),
    }));
  }

  private window(range: PageRange): { from: number; to: number } {
    const from = Math.max(1, Math.floor(range.from ?? 1));
    const requested = Math.floor(range.to ?? from + MAX_PAGE_WINDOW - 1);
    const to = Math.max(from, Math.min(requested, from + MAX_PAGE_WINDOW - 1));
    return { from, to };
  }
}
