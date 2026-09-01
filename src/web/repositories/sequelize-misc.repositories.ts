import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { HighlightAction, Level } from '../../contracts';
import type {
  PrerequisiteDraft,
  ExportRecord,
  ExportRepository,
  LookupRecord,
  LookupRepository,
  PositionRecord,
  ReadingPositionRepository,
  SummaryRepository,
  TopicRecord,
  TopicRepository,
} from '../../business/repositories/misc.repository';
import {
  TopicPrerequisiteModel,
  DocumentModel,
  DocumentSummaryModel,
  ExportModel,
  HighlightLookupModel,
  ReadingPositionModel,
  TopicModel,
  TopicReadStateModel,
} from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeSummaryRepository implements SummaryRepository {
  constructor(
    @InjectModel(DocumentSummaryModel)
    private readonly model: typeof DocumentSummaryModel,
  ) {}

  async upsert(
    documentId: string,
    summary: string,
    model: string,
  ): Promise<void> {
    const existing = await this.model.findOne({ where: { documentId } });
    if (existing) await existing.update({ summary, model });
    else
      await this.model.create({
        id: newId(),
        documentId,
        summary,
        model,
      } as any);
  }

  async find(documentId: string): Promise<string | null> {
    const row = await this.model.findOne({ where: { documentId } });
    return row?.summary ?? null;
  }
}

@Injectable()
export class SequelizeTopicRepository implements TopicRepository {
  constructor(
    @InjectModel(TopicModel) private readonly model: typeof TopicModel,
    @InjectModel(TopicReadStateModel)
    private readonly readStates: typeof TopicReadStateModel,
    @InjectModel(TopicPrerequisiteModel)
    private readonly prereqModel: typeof TopicPrerequisiteModel,
  ) {}

  async replaceAll(
    documentId: string,
    topics: (Omit<TopicRecord, 'id'> & {
      prerequisites?: PrerequisiteDraft[];
    })[],
    source: 'outline_pass' | 'page_tagging',
  ): Promise<void> {
    await this.model.sequelize!.transaction(async (transaction) => {
      // Prerequisite rows cascade with their topics.
      await this.model.destroy({ where: { documentId }, transaction });
      if (!topics.length) return;

      // Ids are minted up front so a draft's "covered by chapter 3" can
      // become a real foreign key in the same write.
      const ids = topics.map(() => newId());
      await this.model.bulkCreate(
        topics.map(({ prerequisites: _prerequisites, ...topic }, index) => ({
          id: ids[index],
          documentId,
          source,
          ...topic,
        })) as any,
        { transaction },
      );

      const prereqRows = topics.flatMap(
        (topic, topicIndex) =>
          topic.prerequisites?.map((draft, order) => ({
            id: newId(),
            topicId: ids[topicIndex],
            orderIndex: order,
            concept: draft.concept,
            why: draft.why,
            kind: draft.kind,
            coveredByTopicId:
              draft.coveredByIndex !== null ? ids[draft.coveredByIndex] : null,
          })) ?? [],
      );
      if (prereqRows.length) {
        await this.prereqModel.bulkCreate(prereqRows as any, { transaction });
      }
    });
  }

  /**
   * Read state is joined here rather than deduped on the read path — the write
   * side keeps the data clean, per PRD FR-5.2.
   */
  async listByDocument(documentId: string) {
    const rows = await this.model.findAll({
      where: { documentId },
      order: [['orderIndex', 'ASC']],
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      shortDescription: row.shortDescription,
      startPage: row.startPage,
      endPage: row.endPage,
      orderIndex: row.orderIndex,
    }));
  }

  async listWithReadState(documentId: string, userId: string) {
    const rows = await this.model.findAll({
      where: { documentId },
      order: [['orderIndex', 'ASC']],
    });
    const read = await this.readStates.findAll({
      where: { userId, topicId: { [Op.in]: rows.map((row) => row.id) } },
    });
    const readIds = new Set(read.map((row) => row.topicId));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      shortDescription: row.shortDescription,
      startPage: row.startPage,
      endPage: row.endPage,
      orderIndex: row.orderIndex,
      isRead: readIds.has(row.id),
    }));
  }

  count(documentId: string): Promise<number> {
    return this.model.count({ where: { documentId } });
  }

  async markRead(topicIds: string[], userId: string, now: Date): Promise<void> {
    if (!topicIds.length) return;
    await this.readStates.bulkCreate(
      topicIds.map((topicId) => ({
        id: newId(),
        topicId,
        userId,
        readAt: now,
      })) as any,
      { ignoreDuplicates: true },
    );
  }

  async markUnread(topicIds: string[], userId: string): Promise<void> {
    if (!topicIds.length) return;
    await this.readStates.destroy({
      where: { userId, topicId: { [Op.in]: topicIds } },
    });
  }

  /** Prevents marking topics on a document the caller doesn't own. */
  async belongToUser(topicIds: string[], userId: string): Promise<boolean> {
    if (!topicIds.length) return true;
    const count = await this.model.count({
      where: { id: { [Op.in]: topicIds } },
      include: [
        {
          model: DocumentModel,
          where: { userId },
          required: true,
          attributes: [],
        },
      ],
    });
    return count === topicIds.length;
  }
}

@Injectable()
export class SequelizeReadingPositionRepository implements ReadingPositionRepository {
  constructor(
    @InjectModel(ReadingPositionModel)
    private readonly model: typeof ReadingPositionModel,
  ) {}

  async find(
    documentId: string,
    userId: string,
  ): Promise<PositionRecord | null> {
    const row = await this.model.findOne({ where: { documentId, userId } });
    return row
      ? {
          lastPage: row.lastPage,
          furthestPage: row.furthestPage,
          level: row.level,
        }
      : null;
  }

  async upsert(
    documentId: string,
    userId: string,
    input: { lastPage: number; level: PositionRecord['level'] },
  ): Promise<void> {
    const existing = await this.model.findOne({
      where: { documentId, userId },
    });
    if (!existing) {
      await this.model.create({
        id: newId(),
        documentId,
        userId,
        lastPage: input.lastPage,
        furthestPage: input.lastPage,
        level: input.level,
      } as any);
      return;
    }
    await existing.update({
      lastPage: input.lastPage,
      // Furthest only ever moves forward — it's a high-water mark.
      furthestPage: Math.max(existing.furthestPage, input.lastPage),
      level: input.level,
    });
  }
}

@Injectable()
export class SequelizeExportRepository implements ExportRepository {
  constructor(
    @InjectModel(ExportModel) private readonly model: typeof ExportModel,
  ) {}

  private toRecord(row: ExportModel): ExportRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      level: row.level,
      contentVersion: row.contentVersion,
      status: row.status,
      fileRef: row.fileRef,
      watermarked: row.watermarked,
      renderedAt: row.get('updatedAt') as Date,
    };
  }

  async findCached(documentId: string, level: Level, contentVersion: number) {
    const row = await this.model.findOne({
      where: { documentId, level, contentVersion },
    });
    return row ? this.toRecord(row) : null;
  }

  async findById(id: string) {
    const row = await this.model.findByPk(id);
    return row ? this.toRecord(row) : null;
  }

  async create(input: {
    documentId: string;
    level: Level;
    contentVersion: number;
    watermarked: boolean;
  }) {
    const row = await this.model.create({
      id: newId(),
      ...input,
      status: 'processing',
    } as any);
    return this.toRecord(row);
  }

  async markProcessing(id: string): Promise<void> {
    await this.model.update(
      { status: 'processing', fileRef: null, error: null },
      { where: { id } },
    );
  }

  async markDone(id: string, fileRef: string): Promise<void> {
    await this.model.update({ status: 'done', fileRef }, { where: { id } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.model.update({ status: 'failed', error }, { where: { id } });
  }
}

@Injectable()
export class SequelizeLookupRepository implements LookupRepository {
  constructor(
    @InjectModel(HighlightLookupModel)
    private readonly model: typeof HighlightLookupModel,
  ) {}

  async record(input: {
    documentId: string;
    userId: string;
    action: HighlightAction;
    selection: string;
    pageNumber: number | null;
    answer: unknown;
  }): Promise<void> {
    await this.model.create({ id: newId(), ...input } as any);
  }

  async list(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<LookupRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, userId },
      order: [['createdAt', 'DESC']],
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      selection: row.selection,
      pageNumber: row.pageNumber,
      answer: row.answer,
      createdAt: row.get('createdAt') as Date,
    }));
  }
}
