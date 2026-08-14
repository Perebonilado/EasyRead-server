import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  AppendChatMessageInput,
  ChatMessageRecord,
  ChatRepository,
} from '../../business/repositories/chat.repository';
import { ChatMessageModel } from '../database/models/chat-message.model';
import { newId } from '../database/uuid';

const toRecord = (row: ChatMessageModel): ChatMessageRecord => ({
  id: row.id,
  role: row.role,
  text: row.text,
  highlightAction: row.highlightAction,
  quotedText: row.quotedText,
  pageNumber: row.pageNumber,
  sources: row.sources,
  createdAt: row.get('createdAt') as Date,
});

@Injectable()
export class SequelizeChatRepository implements ChatRepository {
  constructor(
    @InjectModel(ChatMessageModel)
    private readonly model: typeof ChatMessageModel,
  ) {}

  async append(input: AppendChatMessageInput): Promise<ChatMessageRecord> {
    const row = await this.model.create({
      id: newId(),
      documentId: input.documentId,
      userId: input.userId,
      role: input.role,
      text: input.text,
      highlightAction: input.highlightAction ?? null,
      quotedText: input.quotedText ?? null,
      pageNumber: input.pageNumber ?? null,
      sources: input.sources ?? null,
    } as never);
    return toRecord(row);
  }

  async page(
    documentId: string,
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ messages: ChatMessageRecord[]; hasMore: boolean }> {
    // One extra row answers "is there more before this page?" without a
    // second count query.
    const rows = await this.model.findAll({
      where: {
        documentId,
        userId,
        ...(before ? { createdAt: { [Op.lt]: before } } : {}),
      } as never,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { messages: page.reverse().map(toRecord), hasMore };
  }

  async recent(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<ChatMessageRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, userId } as never,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit,
    });
    return rows.reverse().map(toRecord);
  }
}
