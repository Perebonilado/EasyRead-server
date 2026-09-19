import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { VisualPlan, VisualTimeline } from '../../business/domain/visual';
import type {
  VisualPositionRecord,
  VisualSceneRecord,
  VisualSceneRepository,
  VisualTermRecord,
} from '../../business/repositories/visual.repository';
import {
  VisualPlanModel,
  VisualPositionModel,
  VisualSceneModel,
  VisualTermModel,
} from '../database/models';
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
    timeline: (row.timeline as VisualTimeline | null) ?? null,
    audioKey: row.audioKey ?? null,
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
    @InjectModel(VisualPlanModel)
    private readonly plans: typeof VisualPlanModel,
    @InjectModel(VisualPositionModel)
    private readonly positions: typeof VisualPositionModel,
    @InjectModel(VisualTermModel)
    private readonly terms: typeof VisualTermModel,
  ) {}

  async noteTerms(input: {
    documentId: string;
    pageNumber: number;
    terms: {
      term: string;
      drawing: string | null;
      foundBy: 'spelling' | 'meaning';
    }[];
  }): Promise<void> {
    for (const one of input.terms) {
      const term = one.term.trim().toLowerCase().slice(0, 120);
      if (!term) continue;
      const existing = await this.terms.findOne({ where: { term } });
      if (!existing) {
        await this.terms.create({
          id: newId(),
          term,
          drawing: one.drawing,
          foundBy: one.foundBy,
          times: 1,
          documentId: input.documentId,
          pageNumber: input.pageNumber,
        } as never);
        continue;
      }
      // What someone set by hand stands; the app only counts the asking.
      await existing.update(
        existing.foundBy === 'hand'
          ? { times: existing.times + 1 }
          : {
              drawing: one.drawing,
              foundBy: one.foundBy,
              times: existing.times + 1,
              documentId: input.documentId,
              pageNumber: input.pageNumber,
            },
      );
    }
  }

  async handPicked(): Promise<Map<string, string>> {
    const rows = await this.terms.findAll({ where: { foundBy: 'hand' } });
    const out = new Map<string, string>();
    for (const row of rows) if (row.drawing) out.set(row.term, row.drawing);
    return out;
  }

  async missingTerms(limit: number): Promise<VisualTermRecord[]> {
    const rows = await this.terms.findAll({
      where: { drawing: null },
      order: [['times', 'DESC']],
      limit,
    });
    return rows.map((row) => ({
      term: row.term,
      drawing: row.drawing,
      foundBy: row.foundBy,
      times: row.times,
    }));
  }

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

  async findPlan(
    documentId: string,
    contentVersion: number,
    topicId: string,
    generatorVersion: string,
  ): Promise<VisualPlan | null> {
    const row = await this.plans.findOne({
      where: { documentId, contentVersion, topicId, generatorVersion },
    });
    return row ? (row.plan as VisualPlan) : null;
  }

  async savePlan(input: {
    documentId: string;
    contentVersion: number;
    topicId: string;
    generatorVersion: string;
    plan: VisualPlan;
  }): Promise<void> {
    const { plan, ...key } = input;
    const row = await this.plans.findOne({ where: key });
    if (row) {
      await row.update({ plan });
      return;
    }
    await this.plans.create({ id: newId(), ...key, plan } as never);
  }
}
