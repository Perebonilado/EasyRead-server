import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Document } from '../../business/domain/entities/document';
import type {
  CreateDocumentInput,
  DocumentRepository,
} from '../../business/repositories/document.repository';
import { DocumentModel } from '../database/models';
import { newId } from '../database/uuid';
import { toDocument } from './mappers';

@Injectable()
export class SequelizeDocumentRepository implements DocumentRepository {
  constructor(
    @InjectModel(DocumentModel) private readonly model: typeof DocumentModel,
  ) {}

  async findById(id: string): Promise<Document | null> {
    const row = await this.model.findByPk(id);
    return row ? toDocument(row) : null;
  }

  async listForUser(userId: string): Promise<Document[]> {
    const rows = await this.model.findAll({
      where: { userId, deletedAt: { [Op.is]: null } },
      order: [['createdAt', 'DESC']],
    });
    return rows.map(toDocument);
  }

  async create(input: CreateDocumentInput): Promise<Document> {
    const row = await this.model.create({
      id: newId(),
      ...input,
      status: 'uploading',
    } as any);
    return toDocument(row);
  }

  async save(doc: Document): Promise<void> {
    const p = doc.props;
    await this.model.update(
      {
        title: p.title,
        status: p.status,
        pageCount: p.pageCount,
        sizeBytes: p.sizeBytes,
        originalFileRef: p.originalFileRef,
        canonicalPdfRef: p.canonicalPdfRef,
        thumbnailRef: p.thumbnailRef,
        contentVersion: p.contentVersion,
        simplificationUnavailable: p.simplificationUnavailable,
        failureReason: p.failureReason,
        brief: p.brief,
        deletedAt: p.deletedAt,
      },
      { where: { id: p.id } },
    );
  }

  async purge(documentId: string): Promise<void> {
    // Child rows cascade via foreign keys.
    await this.model.destroy({ where: { id: documentId } });
  }
}
