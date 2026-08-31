import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AnswerItemResponse,
  GenerateItemsResponse,
  ReviewQueueResponse,
} from '../../contracts';
import {
  AnswerItemHandler,
  GenerateItemsHandler,
  ReviewQueueHandler,
  type GeneratableKind,
} from '../../business/handlers/items/item.handlers';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import { CurrentUser } from '../security/current-user.decorator';

class GenerateItemsDto {
  @IsUUID()
  documentId!: string;

  /** One of `topicId`, `topicIds` or `page` says which chapters to use. */
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  // Any version: this codebase mints UUIDv7, so pinning to v4 would refuse
  // every real id.
  @IsUUID(undefined, { each: true })
  topicIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** A highlighted sentence the item must be built from. */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  fromQuote?: string;

  @IsIn(['mcq', 'flashcard', 'cloze', 'true_false', 'mixed'])
  kind!: GeneratableKind;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  count!: number;
}

class ReviewQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}

class AnswerItemDto {
  @IsUUID()
  itemId!: string;

  /** -1 means the reader gave up rather than guessing. */
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  @Max(9)
  choiceIndex!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

/**
 * The testing engine's HTTP surface, deliberately small: write items, ask
 * what is due, answer one.
 *
 * Generation is gated on study time like every other AI call — it costs
 * tokens. Answering is not: reviewing what you already have is the habit
 * the whole feature exists to build, and metering it would punish exactly
 * the behaviour worth encouraging.
 */
@Controller('items')
export class ItemsController {
  constructor(
    private readonly generate: GenerateItemsHandler,
    private readonly queue: ReviewQueueHandler,
    private readonly answer: AnswerItemHandler,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Post('generate')
  @HttpCode(200)
  async generateItems(
    @CurrentUser('id') userId: string,
    @Body() body: GenerateItemsDto,
  ): Promise<GenerateItemsResponse> {
    await this.entitlements.assertStudyTime(userId);
    const result = await this.generate.handle({ userId, ...body });
    return result.data;
  }

  @Get('review')
  async review(
    @CurrentUser('id') userId: string,
    @Query() query: ReviewQueueQueryDto,
  ): Promise<ReviewQueueResponse> {
    const result = await this.queue.handle({ userId, ...query });
    return result.data;
  }

  @Post('answer')
  @HttpCode(200)
  async answerItem(
    @CurrentUser('id') userId: string,
    @Body() body: AnswerItemDto,
  ): Promise<AnswerItemResponse> {
    const result = await this.answer.handle({ userId, ...body });
    return result.data;
  }
}
