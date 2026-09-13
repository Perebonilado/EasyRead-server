import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PronunciationHandlers } from '../../business/handlers/institutions/pronunciation.handlers';
import type { PronunciationRecord } from '../../business/repositories/pronunciation.repository';
import { AdminGuard } from '../security/admin.guard';

class AddPronunciationDto {
  @IsString()
  @Length(1, 120)
  term!: string;

  @IsString()
  @Length(1, 200)
  spoken!: string;
}

class UpdatePronunciationDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  spoken?: string;

  @IsOptional()
  @IsIn(['proposed', 'kept', 'dropped'])
  status?: 'proposed' | 'kept' | 'dropped';
}

class HearPronunciationDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  spoken?: string;
}

/**
 * A school's pronunciation list: what the seeding proposed, what the admin
 * kept, and a hearing of any entry on the lecture voice before deciding.
 */
@Controller('admin/institutions/:id/pronunciations')
@UseGuards(AdminGuard)
export class AdminPronunciationsController {
  constructor(private readonly handlers: PronunciationHandlers) {}

  @Get()
  async list(
    @Param('id') institutionId: string,
  ): Promise<{ pronunciations: PronunciationRecord[] }> {
    return { pronunciations: await this.handlers.list(institutionId) };
  }

  @Post()
  async add(
    @Param('id') institutionId: string,
    @Body() body: AddPronunciationDto,
  ): Promise<{ pronunciation: PronunciationRecord }> {
    return {
      pronunciation: await this.handlers.add(
        institutionId,
        body.term,
        body.spoken,
      ),
    };
  }

  @Patch(':pronunciationId')
  async update(
    @Param('id') institutionId: string,
    @Param('pronunciationId') pronunciationId: string,
    @Body() body: UpdatePronunciationDto,
  ): Promise<{ pronunciation: PronunciationRecord }> {
    return {
      pronunciation: await this.handlers.update(
        institutionId,
        pronunciationId,
        body,
      ),
    };
  }

  /** The entry said alone; a few seconds of audio, sent inline so the page can play it at once. */
  @Post(':pronunciationId/hear')
  async hear(
    @Param('id') institutionId: string,
    @Param('pronunciationId') pronunciationId: string,
    @Body() body: HearPronunciationDto,
  ): Promise<{ mimeType: string; base64: string }> {
    const said = await this.handlers.hear(
      institutionId,
      pronunciationId,
      body.spoken,
    );
    return { mimeType: said.mimeType, base64: said.audio.toString('base64') };
  }
}
