import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  AssessmentEventRecord,
  AssessmentKind,
  AssessmentRepository,
  LearnerProfileRecord,
  LearnerProfileRepository,
} from '../../business/repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../business/repositories/learning.repository';
import { AssessmentEventModel, LearnerProfileModel } from '../database/models';
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
    return row
      ? {
          pace: row.pace,
          depth: row.depth,
          interactivity: row.interactivity,
          styleNotes: row.styleNotes,
        }
      : null;
  }

  async upsert(
    userId: string,
    patch: Partial<LearnerProfileRecord>,
  ): Promise<LearnerProfileRecord> {
    const existing = await this.model.findOne({ where: { userId } as never });
    if (existing) {
      await existing.update(patch as never);
      return {
        pace: existing.pace,
        depth: existing.depth,
        interactivity: existing.interactivity,
        styleNotes: existing.styleNotes,
      };
    }
    const created = await this.model.create({
      id: newId(),
      userId,
      ...DEFAULT_LEARNER_PROFILE,
      ...patch,
    } as never);
    return {
      pace: created.pace,
      depth: created.depth,
      interactivity: created.interactivity,
      styleNotes: created.styleNotes,
    };
  }
}
