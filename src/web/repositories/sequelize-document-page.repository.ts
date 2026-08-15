import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  DocumentPageRepository,
  PageText,
} from '../../business/repositories/document-page.repository';
import { DocumentPageModel } from '../database/models';
import { newId } from '../database/uuid';

const toRecord = (row: DocumentPageModel): PageText => ({
  pageNumber: row.pageNumber,
  text: row.text,
  charCount: row.charCount,
  isEmpty: row.isEmpty,
  textSource: row.textSource,
});

@Injectable()
export class SequelizeDocumentPageRepository implements DocumentPageRepository {
  constructor(
    @InjectModel(DocumentPageModel)
    private readonly model: typeof DocumentPageModel,
  ) {}

  /** One transaction so a partial extraction never becomes visible (§4.3). */
  async replaceAll(
    documentId: string,
    pages: Omit<PageText, 'textSource'>[],
  ): Promise<void> {
    await this.model.sequelize!.transaction(async (transaction) => {
      await this.model.destroy({ where: { documentId }, transaction });
      if (!pages.length) return;
      await this.model.bulkCreate(
        pages.map((page) => ({ id: newId(), documentId, ...page })) as any,
        { transaction },
      );
    });
  }

  async findRange(
    documentId: string,
    from: number,
    to: number,
  ): Promise<PageText[]> {
    const rows = await this.model.findAll({
      where: { documentId, pageNumber: { [Op.between]: [from, to] } },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async findOne(
    documentId: string,
    pageNumber: number,
  ): Promise<PageText | null> {
    const row = await this.model.findOne({ where: { documentId, pageNumber } });
    return row ? toRecord(row) : null;
  }

  async countEmpty(documentId: string): Promise<number> {
    return this.model.count({ where: { documentId, isEmpty: true } });
  }

  async writeOcrText(
    documentId: string,
    pageNumber: number,
    text: string,
    charCount: number,
    isEmpty: boolean,
  ): Promise<void> {
    await this.model.update(
      { text, charCount, isEmpty, textSource: 'ocr' },
      { where: { documentId, pageNumber } },
    );
  }
}
