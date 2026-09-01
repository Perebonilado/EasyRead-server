import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { LecturePosition, LectureStatusResponse } from '../../contracts';
import {
  GenerateLectureHandler,
  LectureAudioHandler,
  LectureStatusHandler,
  SaveLecturePositionHandler,
} from '../../business/handlers/documents/lecture.handlers';
import { ValidationError } from '../../business/domain/errors/errors';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';

class GenerateLectureDto {
  /** Omitted means the whole document. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  // Any version: this codebase mints UUIDv7, so pinning to v4 would
  // refuse every real id.
  @IsUUID(undefined, { each: true })
  topicIds?: string[];

  /** Discard the current lecture and write the whole document again. */
  @IsOptional()
  @IsBoolean()
  rewrite?: boolean;
}

class LecturePositionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;

  /** Capped at a day: anything larger is a broken client, not a position. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  offsetMs!: number;
}

/**
 * The lecture: a document taught aloud, page by page.
 *
 * Generation is a background fan-out, so the POST answers immediately with
 * the same shape the GET returns and the player watches it fill in.
 */
@Controller('documents/:id/lecture')
export class LectureController {
  constructor(
    private readonly generate: GenerateLectureHandler,
    private readonly status: LectureStatusHandler,
    private readonly audio: LectureAudioHandler,
    private readonly position: SaveLecturePositionHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Post()
  @HttpCode(202)
  async start(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: GenerateLectureDto,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.generate.handle({
      userId,
      documentId,
      topicIds: body.topicIds,
      rewrite: body.rewrite,
    });
    return data;
  }

  @Get()
  async read(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.status.handle({ userId, documentId });
    return data;
  }

  /**
   * One segment's audio. The client fetches it with the session token and
   * plays a blob URL, exactly as it does for page audio, so no Range
   * support is needed here.
   */
  @Get('audio/:page')
  async segmentAudio(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page') page: string,
    @Res() response: Response,
  ): Promise<void> {
    // Validated by hand: a whole-object @Param() DTO would also receive the
    // route's :id and be rejected by the global whitelist.
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new ValidationError('That page number is not valid');
    }

    const { data } = await this.audio.handle({
      userId,
      documentId,
      pageNumber,
    });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', data.mimeType);
    response.setHeader('Content-Length', size);
    // Immutable for its key: the key changes whenever the audio would.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }

  @Patch('position')
  async savePosition(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: LecturePositionDto,
  ): Promise<LecturePosition> {
    const { data } = await this.position.handle({
      userId,
      documentId,
      pageNumber: body.pageNumber,
      offsetMs: body.offsetMs,
    });
    return data;
  }
}
