import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col } from 'sequelize';
import type { DocumentListItem, DocumentStatus } from '../contracts';
import {
  DocumentModel,
  ReadingPositionModel,
  SimplifiedPageModel,
} from '../web/database/models';
import {
  buildPagination,
  clampPagination,
  type Pagination,
} from './shared/pagination';
import { toListItem } from './shared/document-shape';

export interface DocumentListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: DocumentStatus;
  sort?: 'recent' | 'title' | 'progress';
}

/**
 * The library grid (PRD FR-2.1).
 *
 * Simplified counts come from one grouped query over the page rows rather than
 * a per-document count, so a library of 200 documents is still two round trips.
 */
@Injectable()
export class DocumentListQuery {
  constructor(
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(ReadingPositionModel)
    private readonly positions: typeof ReadingPositionModel,
  ) {}

  async execute(
    userId: string,
    filters: DocumentListFilters,
  ): Promise<{ items: DocumentListItem[]; pagination: Pagination }> {
    const { page, limit, offset } = clampPagination(filters);

    const where: Record<string | symbol, unknown> = { userId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      const term = `%${filters.search}%`;
      where[Op.or as unknown as string] = [
        { title: { [Op.like]: term } },
        { fileName: { [Op.like]: term } },
      ];
    }

    const order: [string, string][] =
      filters.sort === 'title' ? [['title', 'ASC']] : [['createdAt', 'DESC']];

    const { rows, count } = await this.documents.findAndCountAll({
      where: where as never,
      order: order as never,
      limit,
      offset,
    });

    const counts = await this.countSimplified(rows.map((row) => row.id));

    return {
      items: rows.map((row) => toListItem(row, counts.get(row.id) ?? 0)),
      pagination: buildPagination(page, limit, count),
    };
  }

  /** Standard-level pages written so far, keyed by document. */
  private async countSimplified(
    documentIds: string[],
  ): Promise<Map<string, number>> {
    if (!documentIds.length) return new Map();

    const rows = (await this.simplified.findAll({
      attributes: ['documentId', [fn('COUNT', col('id')), 'total']],
      where: {
        documentId: { [Op.in]: documentIds },
        level: 'standard',
        status: 'done',
      },
      group: ['documentId'],
      raw: true,
    })) as unknown as { documentId: string; total: number | string }[];

    return new Map(rows.map((row) => [row.documentId, Number(row.total)]));
  }

  /** Empty-state check: has this user ever uploaded anything? (PRD FR-2.4) */
  async hasAny(userId: string): Promise<boolean> {
    const row = await this.documents.findOne({
      where: { userId, deletedAt: null } as never,
      attributes: ['id'],
    });
    return row !== null;
  }

  /**
   * "Continue reading" rail — driven by the reading positions rather than the
   * documents, because "recent" means recently *read*, not recently uploaded.
   */
  async recentlyRead(userId: string, take = 3): Promise<DocumentListItem[]> {
    const positions = await this.positions.findAll({
      where: { userId } as never,
      order: [['updatedAt', 'DESC']] as never,
      limit: take,
    });
    if (!positions.length) return [];

    const ids = positions.map((position) => position.documentId);
    const rows = await this.documents.findAll({
      where: {
        id: { [Op.in]: ids },
        userId,
        deletedAt: null,
        status: 'ready',
      } as never,
    });

    const counts = await this.countSimplified(rows.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));

    // Preserve the position ordering; documents deleted since are dropped.
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is DocumentModel => Boolean(row))
      .map((row) => toListItem(row, counts.get(row.id) ?? 0));
  }
}
