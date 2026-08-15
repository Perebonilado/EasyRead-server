import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import type { AllNotesResponse } from '../../contracts';
import { ListAllNotesHandler } from '../../business/handlers/documents/notes.handlers';
import { CurrentUser } from '../security/current-user.decorator';

class AllNotesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

/**
 * The notebook across every document — what the notes screen reads.
 *
 * Separate from `/documents/:id/notes` because the scope is different: that
 * one is a document's notebook, this one is the reader's.
 */
@Controller('notes')
export class NotebookController {
  constructor(private readonly listAll: ListAllNotesHandler) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: AllNotesQueryDto,
  ): Promise<AllNotesResponse> {
    const result = await this.listAll.handle({
      userId,
      limit: query.limit,
      before: query.before,
    });
    return result.data;
  }
}
