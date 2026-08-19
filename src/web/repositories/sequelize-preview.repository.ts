import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { TopicPreviewBody } from '../../contracts';
import type { TopicPreviewRepository } from '../../business/repositories/preview.repository';
import { TopicPreviewModel } from '../database/models/topic-preview.model';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeTopicPreviewRepository implements TopicPreviewRepository {
  constructor(
    @InjectModel(TopicPreviewModel)
    private readonly model: typeof TopicPreviewModel,
  ) {}

  async find(topicId: string): Promise<TopicPreviewBody | null> {
    const row = await this.model.findOne({ where: { topicId } as never });
    return row ? row.body : null;
  }

  async save(input: {
    documentId: string;
    topicId: string;
    body: TopicPreviewBody;
  }): Promise<void> {
    // Upsert by topic: a regenerated preview (say, when the schema grew a
    // field an old row lacks) replaces the stale body instead of dying on
    // the unique index.
    const existing = await this.model.findOne({
      where: { topicId: input.topicId } as never,
    });
    if (existing) {
      existing.body = input.body;
      await existing.save();
      return;
    }
    try {
      await this.model.create({ id: newId(), ...input } as never);
    } catch {
      // A racing first-reader beat us to the insert; the cache is warm.
    }
  }
}
