import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { filmShapeOf } from '../../business/domain/scene-shape';
import type {
  ExportScope,
  ExportStatus,
} from '../../business/domain/studio/studio-export';
import type {
  StudioExportPatch,
  StudioExportRecord,
  StudioExportRepository,
} from '../../business/repositories/studio-export.repository';
import { StudioExportModel } from '../database/models';
import { newId } from '../database/uuid';

const STATUSES: readonly ExportStatus[] = [
  'queued',
  'rendering',
  'done',
  'failed',
];

@Injectable()
export class SequelizeStudioExportRepository implements StudioExportRepository {
  constructor(
    @InjectModel(StudioExportModel)
    private readonly exports: typeof StudioExportModel,
  ) {}

  private record(row: StudioExportModel): StudioExportRecord {
    const bytes = row.bytes === null ? null : Number(row.bytes);
    return {
      id: row.id,
      showId: row.showId,
      episodeId: row.episodeId,
      userId: row.userId,
      scope: row.scope === 'show' ? 'show' : 'episode',
      shape: filmShapeOf(row.shape),
      captions: Boolean(row.captions),
      status: STATUSES.includes(row.status as ExportStatus)
        ? (row.status as ExportStatus)
        : 'failed',
      progress: Number(row.progress) || 0,
      fileKey: row.fileKey,
      bytes: Number.isFinite(bytes) ? bytes : null,
      error: row.error,
      filmHash: row.filmHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(input: {
    showId: string;
    episodeId: string;
    userId: string;
    scope: ExportScope;
    shape: 'wide' | 'tall';
    captions: boolean;
    filmHash: string | null;
  }): Promise<StudioExportRecord> {
    const row = await this.exports.create({
      id: newId(),
      ...input,
      status: 'queued',
      progress: 0,
      fileKey: null,
      bytes: null,
      error: null,
    });
    return this.record(row);
  }

  async find(id: string): Promise<StudioExportRecord | null> {
    const row = await this.exports.findByPk(id);
    return row ? this.record(row) : null;
  }

  async update(id: string, patch: StudioExportPatch): Promise<void> {
    await this.exports.update(patch, { where: { id } });
  }

  async listSame(input: {
    showId: string;
    episodeId: string;
    scope: ExportScope;
    shape: 'wide' | 'tall';
    limit: number;
  }): Promise<StudioExportRecord[]> {
    const rows = await this.exports.findAll({
      where:
        input.scope === 'show'
          ? { showId: input.showId, scope: 'show', shape: input.shape }
          : {
              episodeId: input.episodeId,
              scope: 'episode',
              shape: input.shape,
            },
      order: [['createdAt', 'DESC']],
      limit: input.limit,
    });
    return rows.map((row) => this.record(row));
  }

  async listFor(input: {
    showId: string;
    episodeId: string;
    limit: number;
  }): Promise<StudioExportRecord[]> {
    const rows = await this.exports.findAll({
      where: {
        [Op.or]: [
          { episodeId: input.episodeId },
          { showId: input.showId, scope: 'show' },
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: input.limit,
    });
    return rows.map((row) => this.record(row));
  }
}
