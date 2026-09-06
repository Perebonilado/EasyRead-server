import type { LectureStyle } from '../../contracts';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  DocumentLearningStateRecord,
  DocumentLearningStateRepository,
  ProfileChangeField,
  ProfileChangeRecord,
  ProfileChangeRepository,
  ProfileChangeSource,
  AssessmentEventRecord,
  AssessmentKind,
  AssessmentRepository,
  LearnerProfileRecord,
  LearnerProfileRepository,
} from '../../business/repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../business/repositories/learning.repository';
import { AssessmentEventModel, LearnerProfileModel } from '../database/models';
import { DocumentLearningStateModel } from '../database/models/document-learning-state.model';
import { ProfileChangeModel } from '../database/models/profile-change.model';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeAssessmentRepository implements AssessmentRepository {
  constructor(
    @InjectModel(AssessmentEventModel)
    private readonly model: typeof AssessmentEventModel,
  ) {}

  async record(input: {
    userId: string;
    documentId: string;
    topicId: string | null;
    kind: AssessmentKind;
    score: number;
    payload?: unknown;
  }): Promise<void> {
    await this.model.create({
      id: newId(),
      userId: input.userId,
      documentId: input.documentId,
      topicId: input.topicId,
      kind: input.kind,
      // Clamped here so a buggy caller can never poison the mastery math.
      score: Math.min(1, Math.max(0, input.score)),
      payload: input.payload ?? null,
    } as never);
  }

  async recent(
    userId: string,
    documentId: string,
    limit: number,
  ): Promise<AssessmentEventRecord[]> {
    const rows = await this.model.findAll({
      where: { userId, documentId } as never,
      order: [['createdAt', 'DESC']] as never,
      limit,
    });
    return rows.map((row) => ({
      topicId: row.topicId,
      kind: row.kind,
      score: row.score,
      payload: (row.payload ?? null) as Record<string, unknown> | null,
      // sequelize-typescript types the timestamp columns as `any`.
      createdAt: row.createdAt as Date,
    }));
  }
}

@Injectable()
export class SequelizeLearnerProfileRepository implements LearnerProfileRepository {
  constructor(
    @InjectModel(LearnerProfileModel)
    private readonly model: typeof LearnerProfileModel,
  ) {}

  async find(userId: string): Promise<LearnerProfileRecord | null> {
    const row = await this.model.findOne({ where: { userId } as never });
    return row ? toProfile(row) : null;
  }

  async upsert(
    userId: string,
    patch: Partial<LearnerProfileRecord>,
  ): Promise<LearnerProfileRecord> {
    const existing = await this.model.findOne({ where: { userId } as never });
    if (existing) {
      await existing.update(patch as never);
      return toProfile(existing);
    }
    const created = await this.model.create({
      id: newId(),
      userId,
      ...DEFAULT_LEARNER_PROFILE,
      ...patch,
    } as never);
    return toProfile(created);
  }
}

/** A stored style, or null for anything else a column might hold. */
function asStyle(value: string | null | undefined): LectureStyle | null {
  return value === 'gentle' || value === 'steady' || value === 'brisk'
    ? value
    : null;
}

function toProfile(row: LearnerProfileModel): LearnerProfileRecord {
  return {
    pace: row.pace,
    depth: row.depth,
    interactivity: row.interactivity,
    styleNotes: row.styleNotes,
    lectureStyle: asStyle(row.lectureStyle),
    paceSource: row.paceSource ?? 'default',
    depthSource: row.depthSource ?? 'default',
    interactivitySource: row.interactivitySource ?? 'default',
  };
}

@Injectable()
export class SequelizeProfileChangeRepository implements ProfileChangeRepository {
  constructor(
    @InjectModel(ProfileChangeModel)
    private readonly model: typeof ProfileChangeModel,
  ) {}

  async record(input: {
    userId: string;
    field: ProfileChangeField;
    fromValue: string | null;
    toValue: string;
    source: ProfileChangeSource;
    reason?: string | null;
  }): Promise<void> {
    await this.model.create({
      id: newId(),
      userId: input.userId,
      field: input.field,
      fromValue: input.fromValue,
      toValue: input.toValue,
      source: input.source,
      reason: input.reason ?? null,
      narratedAt: null,
    } as never);
  }

  async list(userId: string, limit: number): Promise<ProfileChangeRecord[]> {
    const rows = await this.model.findAll({
      where: { userId } as never,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit,
    });
    return rows.map(toChange);
  }

  async unnarrated(
    userId: string,
    limit: number,
  ): Promise<ProfileChangeRecord[]> {
    const rows = await this.model.findAll({
      where: {
        userId,
        narratedAt: null,
        // Manual changes are the reader's own doing; narrating them back
        // ("you set your pace to faster") would be noise.
        source: ['auto', 'tutor'],
      } as never,
      order: [['createdAt', 'ASC']] as never,
      limit,
    });
    return rows.map(toChange);
  }

  async markNarrated(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.model.update(
      { narratedAt: new Date() },
      {
        where: { id: ids } as never,
      },
    );
  }
}

function toChange(row: ProfileChangeModel): ProfileChangeRecord {
  return {
    id: row.id,
    field: row.field,
    fromValue: row.fromValue,
    toValue: row.toValue,
    source: row.source,
    reason: row.reason,
    narratedAt: row.narratedAt,
    createdAt: row.get('createdAt') as Date,
  };
}

@Injectable()
export class SequelizeDocumentLearningStateRepository implements DocumentLearningStateRepository {
  constructor(
    @InjectModel(DocumentLearningStateModel)
    private readonly model: typeof DocumentLearningStateModel,
  ) {}

  private toRecord(row: DocumentLearningStateModel) {
    return {
      documentId: row.documentId,
      paceDelta: row.paceDelta,
      depthDelta: row.depthDelta,
      reason: row.reason,
      lectureStyle: asStyle(row.lectureStyle),
    };
  }

  async find(userId: string, documentId: string) {
    const row = await this.model.findOne({ where: { userId, documentId } });
    return row ? this.toRecord(row) : null;
  }

  async active(userId: string) {
    const rows = await this.model.findAll({
      where: {
        userId,
        [Op.or]: [
          { paceDelta: { [Op.ne]: 'none' } },
          { depthDelta: { [Op.ne]: 'none' } },
        ],
      } as never,
    });
    return rows.map((row) => this.toRecord(row));
  }

  async upsert(
    userId: string,
    documentId: string,
    patch: Partial<Omit<DocumentLearningStateRecord, 'documentId'>>,
  ) {
    const row = await this.model.findOne({ where: { userId, documentId } });
    if (row) {
      await row.update(patch as never);
      return;
    }
    await this.model.create({
      id: newId(),
      userId,
      documentId,
      paceDelta: 'none',
      depthDelta: 'none',
      ...patch,
    } as never);
  }

  async clearDelta(
    userId: string,
    documentIds: string[],
    field: 'pace' | 'depth',
  ) {
    if (!documentIds.length) return;
    await this.model.update({ [`${field}Delta`]: 'none' } as never, {
      where: { userId, documentId: { [Op.in]: documentIds } } as never,
    });
  }
}
