import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import type { RecapDto } from '../../contracts';
import {
  CreateRecapHandler,
  ListRecapsHandler,
} from '../../business/handlers/documents/recap.handlers';
import { CurrentUser } from '../security/current-user.decorator';

class CreateRecapDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromPage!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  toPage!: number;

  /** When this sitting began, as the reader's client saw it. */
  @IsOptional()
  @IsISO8601()
  since?: string;
}

class ListRecapsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/** Recaps of past sittings with one document. */
@Controller('documents/:id/recaps')
export class RecapsController {
  constructor(
    private readonly create: CreateRecapHandler,
    private readonly listRecaps: ListRecapsHandler,
  ) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query() query: ListRecapsQueryDto,
  ): Promise<RecapDto[]> {
    const result = await this.listRecaps.handle({
      userId,
      documentId,
      limit: query.limit,
    });
    return result.data;
  }

  @Post()
  async wrapUp(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: CreateRecapDto,
  ): Promise<RecapDto> {
    const result = await this.create.handle({
      userId,
      documentId,
      fromPage: body.fromPage,
      toPage: body.toPage,
      since: body.since,
    });
    return result.data;
  }
}
