import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';
import type { LearnDepth, LearnInterviewResponse } from '../../contracts';
import {
  ExpandDocumentHandler,
  GenerateDocumentHandler,
  InterviewHandler,
} from '../../business/handlers/learn/learn.handlers';
import { CurrentUser } from '../security/current-user.decorator';

class TopicDto {
  @IsString()
  @Length(2, 120)
  topic!: string;
}

class GenerateDto {
  @IsString()
  @Length(2, 120)
  topic!: string;

  @IsIn(['primer', 'solid', 'deep'])
  depth!: LearnDepth;

  /** Answers keyed by question id. Values are validated by length only. */
  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  goal?: string;
}

/** Learn a topic the reader doesn't have a document for (§8). */
@Controller('learn')
export class LearnController {
  constructor(
    private readonly interview: InterviewHandler,
    private readonly generate: GenerateDocumentHandler,
    private readonly expand: ExpandDocumentHandler,
  ) {}

  /** What to ask before writing about this topic. */
  @Post('interview')
  @HttpCode(200)
  async questions(
    @CurrentUser('id') userId: string,
    @Body() body: TopicDto,
  ): Promise<LearnInterviewResponse> {
    const result = await this.interview.handle({ userId, topic: body.topic });
    return result.data;
  }

  /**
   * Commissions the document and returns its id straight away — the client
   * navigates to the reader and watches the usual processing screen while it
   * is written.
   */
  @Post('generate')
  @HttpCode(202)
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: GenerateDto,
  ): Promise<{ documentId: string }> {
    const result = await this.generate.handle({
      userId,
      topic: body.topic,
      depth: body.depth,
      answers: sanitiseAnswers(body.answers),
      goal: body.goal,
    });
    return result.data;
  }

  /**
   * Rewrites a generated document at the next length up, covering the topics
   * it listed as out of scope. Returns as soon as the rewrite is queued.
   */
  @Post(':id/expand')
  @HttpCode(202)
  async grow(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<{ documentId: string; depth: LearnDepth }> {
    const result = await this.expand.handle({ userId, documentId });
    return result.data;
  }
}

/** Answers arrive as free-form JSON; keep it string-to-string and bounded. */
function sanitiseAnswers(
  answers: Record<string, string> | undefined,
): Record<string, string> {
  if (!answers) return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers).slice(0, 6)) {
    if (typeof value !== 'string') continue;
    clean[String(key).slice(0, 40)] = value.slice(0, 200);
  }
  return clean;
}
