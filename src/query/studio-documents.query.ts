import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { DocumentModel } from '../web/database/models';

/** A document of the Studio's, as its picker lists it. */
export interface StudioDocumentRow {
  id: string;
  title: string;
  fileName: string;
  pageCount: number | null;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  failureReason: string | null;
  createdAt: Date;
}

/** How many of a maker's documents the Studio's picker lists. */
const LISTED = 30;

/**
 * The Studio's own documents (origin 'studio'): the ones a maker gave in
 * the Studio's chat, never listed in the library, to choose from again.
 */
@Injectable()
export class StudioDocumentsQuery {
  constructor(
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
  ) {}

  /** A maker's Studio documents, the newest first. */
  async list(userId: string): Promise<StudioDocumentRow[]> {
    const rows = await this.documents.findAll({
      where: {
        userId,
        origin: 'studio',
        institutionId: null,
        deletedAt: null,
      } as never,
      order: [['createdAt', 'DESC']] as never,
      limit: LISTED,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      pageCount: row.pageCount,
      status: row.status,
      failureReason: row.failureReason,
      createdAt: row.get('createdAt') as Date,
    }));
  }

  /** How many a maker has given the Studio since a moment: its own monthly count. */
  async countSince(userId: string, since: Date): Promise<number> {
    return this.documents.count({
      where: {
        userId,
        origin: 'studio',
        createdAt: { [Op.gte]: since },
      } as never,
    });
  }
}
