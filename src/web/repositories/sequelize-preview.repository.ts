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
    // Two racing first-readers may both generate; the unique index makes the
    // second write a no-op rather than a duplicate row.
    try {
      await this.model.create({ id: newId(), ...input } as never);
    } catch {
      // Row already exists — the cache is warm either way.
    }
  }
}
