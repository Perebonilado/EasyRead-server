import { profileKey } from '../../business/domain/scene-profile';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  VisualPositionRecord,
  VisualSceneRecord,
  VisualSceneRepository,
} from '../../business/repositories/visual.repository';
import { VisualPositionModel, VisualSceneModel } from '../database/models';
import { newId } from '../database/uuid';

function toRecord(row: VisualSceneModel): VisualSceneRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    topicId: row.topicId,
    pageNumber: row.pageNumber,
    contentVersion: row.contentVersion,
    generatorVersion: row.generatorVersion,
    status: row.status,
    step: row.step ?? null,
    fit: row.fit ?? null,
    fitReason: row.fitReason ?? null,
    error: row.error ?? null,
    attempts: row.attempts ?? 0,
    title: row.title ?? null,
    sceneKey: row.sceneKey ?? null,
    audioKey: row.audioKey ?? null,
    thumbKey: row.thumbKey ?? null,
    timing: row.timing ?? null,
    durationMs: row.durationMs ?? null,
    requestedBy: row.requestedBy ?? null,
    updatedAt: (row.get('updatedAt') as Date | undefined) ?? null,
  };
}

@Injectable()
export class SequelizeVisualSceneRepository implements VisualSceneRepository {
  constructor(
    @InjectModel(VisualSceneModel)
    private readonly model: typeof VisualSceneModel,
    @InjectModel(VisualPositionModel)
    private readonly positions: typeof VisualPositionModel,
  ) {}

  async findPosition(
    documentId: string,
    userId: string,
  ): Promise<VisualPositionRecord | null> {
    const row = await this.positions.findOne({ where: { documentId, userId } });
    return row
      ? {
          documentId: row.documentId,
          userId: row.userId,
          pageNumber: row.pageNumber,
          offsetMs: row.offsetMs,
          updatedAt: (row.get('updatedAt') as Date | undefined) ?? null,
        }
      : null;
  }

  async savePosition(input: {
    documentId: string;
    userId: string;
    pageNumber: number;
    offsetMs: number;
  }): Promise<void> {
    const existing = await this.positions.findOne({
      where: { documentId: input.documentId, userId: input.userId },
    });
    if (existing) {
      await existing.update({
        pageNumber: input.pageNumber,
        offsetMs: input.offsetMs,
      });
      return;
    }
    await this.positions.create({ id: newId(), ...input } as never);
  }

  async find(
    documentId: string,
    contentVersion: number,
    pageNumber: number,
    generatorVersion: string,
  ): Promise<VisualSceneRecord | null> {
    const row = await this.model.findOne({
      where: { documentId, contentVersion, pageNumber, generatorVersion },
    });
    return row ? toRecord(row) : null;
  }

  async listByDocument(
    documentId: string,
    contentVersion: number,
    generatorVersion: string,
  ): Promise<VisualSceneRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, contentVersion, generatorVersion },
      order: [['pageNumber', 'ASC']],
    });
    return rows.map(toRecord);
  }

  async ensure(input: {
    documentId: string;
    contentVersion: number;
    pageNumber: number;
    topicId: string;
    generatorVersion: string;
    requestedBy: string;
  }): Promise<{ record: VisualSceneRecord; created: boolean }> {
    const existing = await this.find(
      input.documentId,
      input.contentVersion,
      input.pageNumber,
      input.generatorVersion,
    );
    if (existing) return { record: existing, created: false };
    const row = await this.model.create({
      id: newId(),
      ...input,
      status: 'pending',
      attempts: 0,
    } as never);
    return { record: toRecord(row), created: true };
  }

  async resetForRetry(id: string): Promise<void> {
    await this.model.update(
      {
        status: 'pending',
        step: null,
        error: null,
        fit: null,
        fitReason: null,
      },
      { where: { id } },
    );
  }

  async update(id: string, patch: Partial<VisualSceneRecord>): Promise<void> {
    await this.model.update(patch, { where: { id } });
  }

  async filesOf(documentId: string): Promise<string[]> {
    const rows = await this.model.findAll({ where: { documentId } });
    // And each version's profile, which no row names.
    const versions = [...new Set(rows.map((row) => row.contentVersion))];
    return [
      ...rows.flatMap((row) =>
        [row.sceneKey, row.audioKey, row.thumbKey].filter(
          (key): key is string => Boolean(key),
        ),
      ),
      ...versions.map((version) => profileKey(documentId, version)),
    ];
  }

  async purgeDocument(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } });
    await this.positions.destroy({ where: { documentId } });
  }
}
