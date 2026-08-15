import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  PageAssetRecord,
  PageAssetRepository,
} from '../../business/repositories/page-asset.repository';
import { PageAssetModel } from '../database/models/page-asset.model';
import { newId } from '../database/uuid';

const toRecord = (row: PageAssetModel): PageAssetRecord => ({
  id: row.id,
  pageNumber: row.pageNumber,
  fileRef: row.fileRef,
  mimeType: row.mimeType,
  width: row.width,
  height: row.height,
  caption: row.caption,
  orderIndex: row.orderIndex,
});

@Injectable()
export class SequelizePageAssetRepository implements PageAssetRepository {
  constructor(
    @InjectModel(PageAssetModel) private readonly model: typeof PageAssetModel,
  ) {}

  async create(input: {
    documentId: string;
    contentVersion: number;
    pageNumber: number;
    fileRef: string;
    mimeType: string;
    width: number;
    height: number;
    caption?: string | null;
    orderIndex?: number;
  }): Promise<PageAssetRecord> {
    const row = await this.model.create({
      id: newId(),
      ...input,
      caption: input.caption ?? null,
      orderIndex: input.orderIndex ?? 0,
      kind: 'figure',
    } as never);
    return toRecord(row);
  }

  async list(
    documentId: string,
    contentVersion: number,
  ): Promise<PageAssetRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, contentVersion } as never,
      order: [
        ['pageNumber', 'ASC'],
        ['orderIndex', 'ASC'],
      ] as never,
    });
    return rows.map(toRecord);
  }

  async findById(assetId: string) {
    const row = await this.model.findByPk(assetId);
    return row ? { ...toRecord(row), documentId: row.documentId } : null;
  }

  async clear(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } as never });
  }
}
