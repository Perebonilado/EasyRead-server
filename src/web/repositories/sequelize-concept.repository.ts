import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { ConceptKnowledgeRepository } from '../../business/repositories/concept.repository';
import { normaliseConcept } from '../../business/domain/values/concepts';
import { ConceptKnowledgeModel } from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeConceptRepository implements ConceptKnowledgeRepository {
  constructor(
    @InjectModel(ConceptKnowledgeModel)
    private readonly model: typeof ConceptKnowledgeModel,
  ) {}

  async markUnclear(userId: string, concept: string): Promise<void> {
    const normalised = normaliseConcept(concept);
    if (!normalised) return;
    const existing = await this.model.findOne({
      where: { userId, concept: normalised } as never,
    });
    // Never demote: a concept already taught stays taught — asking about it
    // again is curiosity, not regression.
    if (existing) return;
    await this.model.create({
      id: newId(),
      userId,
      concept: normalised,
      state: 'unclear',
      firstFlaggedAt: new Date(),
    } as never);
  }

  async markTaught(
    userId: string,
    concept: string,
    resolvedDocumentId: string | null,
  ): Promise<void> {
    const normalised = normaliseConcept(concept);
    if (!normalised) return;
    const existing = await this.model.findOne({
      where: { userId, concept: normalised } as never,
    });
    if (existing) {
      if (existing.state === 'taught') return;
      await existing.update({
        state: 'taught',
        resolvedDocumentId,
        resolvedAt: new Date(),
      });
      return;
    }
    await this.model.create({
      id: newId(),
      userId,
      concept: normalised,
      state: 'taught',
      resolvedDocumentId,
      firstFlaggedAt: new Date(),
      resolvedAt: new Date(),
    } as never);
  }

  async listTaught(userId: string): Promise<string[]> {
    const rows = await this.model.findAll({
      where: { userId, state: 'taught' } as never,
    });
    return rows.map((row) => row.concept);
  }
}
