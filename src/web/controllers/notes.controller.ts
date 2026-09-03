import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import type { NoteDto, NoteSource, NotesResponse } from '../../contracts';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  ListNotesHandler,
  UpdateNoteHandler,
} from '../../business/handlers/documents/notes.handlers';
import { MAX_NOTE_BODY } from '../../business/domain/values/notes';
import { CurrentUser } from '../security/current-user.decorator';

class CreateNoteDto {
  /** Empty is allowed when quotedText carries the note (a pure highlight). */
  @IsString()
  @Length(0, MAX_NOTE_BODY)
  body!: string;

  /** Optional: a note taken in a lesson has no page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  quotedText?: string;

  @IsOptional()
  @IsIn(['typed', 'highlight', 'chat', 'lesson', 'recap', 'question', 'board'])
  source?: NoteSource;
}

class UpdateNoteDto {
  @IsString()
  @Length(1, MAX_NOTE_BODY)
  body!: string;
}

class ListNotesQueryDto {
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
 * The notebook for one document.
 *
 * Plain REST rather than the streaming shape the chat uses: nothing here is
 * generated, so a note either saved or it didn't.
 */
@Controller('documents/:id/notes')
export class NotesController {
  constructor(
    private readonly createNote: CreateNoteHandler,
    private readonly listNotes: ListNotesHandler,
    private readonly updateNote: UpdateNoteHandler,
    private readonly deleteNote: DeleteNoteHandler,
  ) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query() query: ListNotesQueryDto,
  ): Promise<NotesResponse> {
    const result = await this.listNotes.handle({
      userId,
      documentId,
      limit: query.limit,
      before: query.before,
    });
    return result.data;
  }

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: CreateNoteDto,
  ): Promise<NoteDto> {
    const result = await this.createNote.handle({
      userId,
      documentId,
      body: body.body,
      pageNumber: body.pageNumber ?? null,
      topicId: body.topicId ?? null,
      quotedText: body.quotedText ?? null,
      source: body.source,
    });
    return result.data;
  }

  @Patch(':noteId')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('noteId') noteId: string,
    @Body() body: UpdateNoteDto,
  ): Promise<NoteDto> {
    const result = await this.updateNote.handle({
      userId,
      documentId,
      noteId,
      body: body.body,
    });
    return result.data;
  }

  @Delete(':noteId')
  @HttpCode(204)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    await this.deleteNote.handle({ userId, documentId, noteId });
  }
}
