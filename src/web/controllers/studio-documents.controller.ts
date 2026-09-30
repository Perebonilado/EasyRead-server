import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import type {
  StudioDocumentCardDto,
  StudioDocumentDto,
  StudioEpisodeDto,
  StudioShowDto,
  UploadIntentResponse,
} from '../../contracts';
import { MAX_UPLOAD_BYTES } from '../../business/domain/values';
import { StudioDocumentsService } from '../../business/handlers/studio/studio-documents.service';
import { StudioService } from '../../business/handlers/studio/studio.service';
import { CurrentUser } from '../security/current-user.decorator';

class StudioUploadIntentDto {
  @IsString()
  @Length(1, 512)
  filename!: string;

  @IsString()
  @Length(1, 128)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes!: number;
}

class AttachDto {
  @IsString()
  @Length(1, 64)
  documentId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  episodeId?: string;
}

class PagesDto {
  @IsString()
  @Length(1, 64)
  documentId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  episodeId?: string;

  /** Each a [from, to] pair; kept sound by the service. */
  @IsArray()
  @ArrayMaxSize(40)
  ranges!: unknown[];

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  topicIds!: string[];

  @IsOptional()
  @IsBoolean()
  series?: boolean;
}

/**
 * The Studio's documents (studio-documents.service): a file given in the
 * chat (its bytes go by the library's own upload path, `/documents/:id/
 * content`), the maker's Studio documents to give again, one as its cards
 * show it, and its pages chosen for an episode or a series.
 */
@Controller('studio')
export class StudioDocumentsController {
  constructor(
    private readonly documents: StudioDocumentsService,
    private readonly studio: StudioService,
  ) {}

  @Post('documents/upload-intent')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  intent(
    @CurrentUser('id') userId: string,
    @Body() body: StudioUploadIntentDto,
  ): Promise<UploadIntentResponse> {
    return this.documents.intent(userId, body);
  }

  @Get('documents')
  list(@CurrentUser('id') userId: string): Promise<StudioDocumentCardDto[]> {
    return this.documents.list(userId);
  }

  @Get('documents/:id')
  view(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('show') showId?: string,
  ): Promise<StudioDocumentDto> {
    return this.documents.view(userId, id, showId ?? null);
  }

  /** A document given to a show, in its thread. */
  @Post('shows/:id/document')
  async attach(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AttachDto,
  ): Promise<{ show: StudioShowDto; episode: StudioEpisodeDto }> {
    const { episodeId } = await this.documents.attach(userId, id, body);
    return this.outcome(userId, id, episodeId);
  }

  /** Its pages chosen: "Use these pages". */
  @Post('shows/:id/pages')
  async pages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: PagesDto,
  ): Promise<{ show: StudioShowDto; episode: StudioEpisodeDto }> {
    const { episodeId } = await this.documents.usePages(userId, id, {
      documentId: body.documentId,
      episodeId: body.episodeId ?? null,
      ranges: body.ranges as [number, number][],
      topicIds: body.topicIds,
      series: body.series ?? false,
    });
    return this.outcome(userId, id, episodeId);
  }

  private async outcome(userId: string, showId: string, episodeId: string) {
    const [show, episode] = await Promise.all([
      this.studio.show(userId, showId),
      this.studio.episode(userId, episodeId),
    ]);
    return { show, episode };
  }
}
