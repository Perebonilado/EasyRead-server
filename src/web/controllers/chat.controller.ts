import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ChatHistoryResponse, ChatOrigin } from '../../contracts';
import {
  ClarifyChatMessageHandler,
  ListChatMessagesHandler,
  SendChatMessageHandler,
} from '../../business/handlers/documents/chat.handlers';
import type { ChatMessageRecord } from '../../business/repositories/chat.repository';
import { CurrentUser } from '../security/current-user.decorator';

class SendMessageDto {
  @IsString()
  @Length(2, 2000)
  text!: string;

  /** Present when the message came from the highlight popover. */
  @IsOptional()
  @IsIn(['explain', 'simplify', 'define', 'prerequisite'])
  highlightAction?: Exclude<ChatOrigin, null>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;
}

class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

@Controller('documents/:id/chat')
export class ChatController {
  constructor(
    private readonly send: SendChatMessageHandler,
    private readonly list: ListChatMessagesHandler,
    private readonly clarifyMessage: ClarifyChatMessageHandler,
  ) {}

  /** The thread, oldest first, paged backwards from `before`. */
  @Get()
  async history(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query() query: HistoryQueryDto,
  ): Promise<ChatHistoryResponse> {
    const result = await this.list.handle({
      userId,
      documentId,
      limit: query.limit,
      before: query.before,
    });
    return result.data;
  }

  /**
   * Sends a message and streams the reply as newline-delimited JSON.
   *
   * Headers are written on the first token rather than up front, so anything
   * that fails before generation starts — a limit, a missing document — still
   * comes back as a normal JSON error envelope instead of a half-open stream.
   * The final frame carries both persisted rows so the client can replace its
   * optimistic message with the real one.
   */
  @Post()
  async message(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await streamTurn(response, (onToken) =>
      this.send.handle({
        userId,
        documentId,
        text: body.text,
        highlightAction: body.highlightAction,
        pageNumber: body.pageNumber ?? null,
        onToken,
      }),
    );
  }

  /**
   * "Still not clear" — re-explains one answer, a different way.
   *
   * Streams exactly like sending a message, and returns the same pair of
   * rows, because that is what it is from the thread's point of view: the
   * reader said something and got an answer. The difference is that the
   * reader said it with a button.
   */
  @Post(':messageId/clarify')
  async clarify(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ): Promise<void> {
    await streamTurn(response, (onToken) =>
      this.clarifyMessage.handle({
        userId,
        documentId,
        messageId,
        onToken,
      }),
    );
  }
}

/**
 * Streams a chat turn as newline-delimited JSON.
 *
 * Headers are written on the first token rather than up front, so anything
 * that fails before generation starts — a limit, a missing message — still
 * comes back as a normal JSON error envelope instead of a half-open stream.
 * The final frame carries both persisted rows so the client can replace its
 * optimistic messages with the real ones.
 */
async function streamTurn(
  response: Response,
  run: (onToken: (chunk: string) => void) => Promise<{
    data: { userMessage: ChatMessageRecord; reply: ChatMessageRecord };
  }>,
): Promise<void> {
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
  };

  const result = await run((chunk) => {
    begin();
    response.write(`${JSON.stringify({ token: chunk })}\n`);
  });

  const { userMessage, reply } = result.data;
  begin();
  response.write(
    `${JSON.stringify({
      done: true,
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        text: userMessage.text,
        highlightAction: userMessage.highlightAction,
        quotedText: userMessage.quotedText,
        pageNumber: userMessage.pageNumber,
        sources: null,
        createdAt: userMessage.createdAt.toISOString(),
      },
      reply: {
        id: reply.id,
        role: reply.role,
        text: reply.text,
        highlightAction: null,
        quotedText: null,
        pageNumber: null,
        sources: reply.sources,
        createdAt: reply.createdAt.toISOString(),
      },
    })}\n`,
  );
  response.end();
}
