import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  CreateNoteInput,
  NoteRecord,
  NoteRepository,
  NoteWithDocument,
} from '../../business/repositories/note.repository';
import { DocumentModel } from '../database/models/document.model';
import { NoteModel } from '../database/models/note.model';
import { newId } from '../database/uuid';

const toRecord = (row: NoteModel): NoteRecord => ({
  id: row.id,
  body: row.body,
  pageNumber: row.pageNumber,
  topicId: row.topicId,
  quotedText: row.quotedText,
  source: row.source,
  // sequelize-typescript types the timestamp columns as `any`.
  createdAt: row.get('createdAt') as Date,
  updatedAt: row.get('updatedAt') as Date,
});

@Injectable()
export class SequelizeNoteRepository implements NoteRepository {
  constructor(
    @InjectModel(NoteModel) private readonly model: typeof NoteModel,
  ) {}

  async create(input: CreateNoteInput): Promise<NoteRecord> {
    const row = await this.model.create({
      id: newId(),
      documentId: input.documentId,
      userId: input.userId,
      body: input.body,
      pageNumber: input.pageNumber ?? null,
      topicId: input.topicId ?? null,
      quotedText: input.quotedText ?? null,
      source: input.source ?? 'typed',
    } as never);
    return toRecord(row);
  }

  async page(
    documentId: string,
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ notes: NoteRecord[]; hasMore: boolean }> {
    // One extra row answers "is there more?" without a second count query.
    const rows = await this.model.findAll({
      where: {
        documentId,
        userId,
        ...(before ? { createdAt: { [Op.lt]: before } } : {}),
      } as never,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { notes: page.map(toRecord), hasMore };
  }

  async updateBody(
    noteId: string,
    userId: string,
    body: string,
  ): Promise<NoteRecord | null> {
    // The user id is part of the lookup, not a check afterwards: someone
    // else's note reads as missing rather than forbidden.
    const row = await this.model.findOne({
      where: { id: noteId, userId } as never,
    });
    if (!row) return null;
    await row.update({ body } as never);
    return toRecord(row);
  }

  async remove(noteId: string, userId: string): Promise<boolean> {
    const removed = await this.model.destroy({
      where: { id: noteId, userId } as never,
    });
    return removed > 0;
  }

  async lastChangedAt(
    documentId: string,
    userId: string,
  ): Promise<Date | null> {
    // A delete leaves no row to read, so the newest surviving write is the
    // best available answer; an export that dropped a deleted note is stale
    // in the harmless direction — it has one note too many, not too few.
    const row = await this.model.findOne({
      where: { documentId, userId } as never,
      order: [['updatedAt', 'DESC']] as never,
    });
    return row ? (row.get('updatedAt') as Date) : null;
  }

  async pageForUser(
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ notes: NoteWithDocument[]; hasMore: boolean }> {
    const rows = await this.model.findAll({
      where: {
        userId,
        ...(before ? { createdAt: { [Op.lt]: before } } : {}),
      } as never,
      include: [
        {
          model: DocumentModel,
          // `required` makes this an inner join: a note whose document is in
          // the bin has nowhere to lead, so it is not listed.
          required: true,
          attributes: ['id', 'title', 'deletedAt'],
          where: { deletedAt: null } as never,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      notes: page.map((row) => ({
        ...toRecord(row),
        documentId: row.documentId,
        documentTitle: row.document?.title ?? 'Untitled',
      })),
      hasMore,
    };
  }

  async all(documentId: string, userId: string): Promise<NoteRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, userId } as never,
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ] as never,
    });
    return rows.map(toRecord);
  }
}
