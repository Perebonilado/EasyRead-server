import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  LECTURE_STYLE_KEYS,
  type LecturePosition,
  type LectureBoardResponse,
  type LectureFollowResponse,
  type LectureStatusResponse,
  type LectureStyle,
  type SegmentKind,
} from '../../contracts';
import { isLectureStyle, isSegmentKind } from '../../business/domain/lecture';
import {
  BackfillBoardsHandler,
  GenerateLectureHandler,
  LectureAudioHandler,
  LectureBoardHandler,
  LectureFollowHandler,
  LectureReviewHandler,
  LectureMapsHandler,
  LectureStatusHandler,
  SaveLecturePositionHandler,
  SetLectureStyleHandler,
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

  /** Discard this style of the lecture and write the whole document again. */
  @IsOptional()
  @IsBoolean()
  rewrite?: boolean;

  /** Which way of teaching to write. Omitted means steady. */
  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;

  /** A learner switched style here: this page's chapter is written first. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startAtPage?: number;

  /** Teach me from this page: the chapters around it are chosen by the always-a-chapter-ahead rule. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  aheadOfPage?: number;
}

class BackfillBoardsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  topicIds?: string[];

  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;
}

class LectureReviewDto {
  /** The style the learner is resuming in. Omitted means the one they stopped in. */
  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;
}

class LectureStyleDto {
  @IsIn(LECTURE_STYLE_KEYS)
  style!: LectureStyle;

  /** Use it for every document on the account. */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

class LectureSettingsDto {
  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;

  /** Whether the lecture runs its beats around each chapter. */
  @IsOptional()
  @IsBoolean()
  interactive?: boolean;

  /** Use it for every document on the account. */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

class LectureMapsDto {
  /** The learner's page: the chapter they are in and those ahead get their maps. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  aheadOfPage?: number;

  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;
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

  @IsOptional()
  @IsIn(LECTURE_STYLE_KEYS)
  style?: LectureStyle;
}

/** A `?kind=` query, or nothing (the page); anything else is a broken client. */
function kindQuery(value: string | undefined): SegmentKind | undefined {
  if (value === undefined || value === '') return undefined;
  if (!isSegmentKind(value)) {
    throw new ValidationError('That lecture segment kind does not exist');
  }
  return value;
}

/** A `?style=` query, or nothing; anything else is a broken client. */
function styleQuery(value: string | undefined): LectureStyle | undefined {
  if (value === undefined || value === '') return undefined;
  if (!isLectureStyle(value)) {
    throw new ValidationError('That lecture style does not exist');
  }
  return value;
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
    private readonly review: LectureReviewHandler,
    private readonly board: LectureBoardHandler,
    private readonly follow: LectureFollowHandler,
    private readonly backfill: BackfillBoardsHandler,
    private readonly position: SaveLecturePositionHandler,
    private readonly styleChoice: SetLectureStyleHandler,
    private readonly maps: LectureMapsHandler,
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
      aheadOfPage: body.aheadOfPage,
      rewrite: body.rewrite,
      style: body.style,
      startAtPage: body.startAtPage,
    });
    return data;
  }

  /**
   * The "last time" review for a learner coming back after a day. Answers
   * with the status once the review's script is written; its audio follows
   * over the event stream like any other segment.
   */
  @Post('review')
  @HttpCode(202)
  async writeReview(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: LectureReviewDto,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.review.handle({
      userId,
      documentId,
      style: body.style,
    });
    return data;
  }

  /** One row's board, once it is timed; 404 until then. */
  @Get('board/:page')
  async boardOf(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page') page: string,
    @Query('style') style?: string,
    @Query('kind') kind?: string,
  ): Promise<LectureBoardResponse> {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new ValidationError('That page number is not valid');
    }
    const { data } = await this.board.handle({
      userId,
      documentId,
      pageNumber,
      style: styleQuery(style),
      kind: kindQuery(kind),
    });
    return data;
  }

  /** One row's follow-along track, once it exists; 404 until then. */
  @Get('follow/:page')
  async followOf(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page') page: string,
    @Query('style') style?: string,
    @Query('kind') kind?: string,
  ): Promise<LectureFollowResponse> {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new ValidationError('That page number is not valid');
    }
    const { data } = await this.follow.handle({
      userId,
      documentId,
      pageNumber,
      style: styleQuery(style),
      kind: kindQuery(kind),
    });
    return data;
  }

  /** Boards for rows that have words but no board yet. */
  @Post('board')
  @HttpCode(202)
  async writeBoards(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: BackfillBoardsDto,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.backfill.handle({
      userId,
      documentId,
      topicIds: body.topicIds,
      style: body.style,
    });
    return data;
  }

  @Get()
  async read(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query('style') style?: string,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.status.handle({
      userId,
      documentId,
      style: styleQuery(style),
    });
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
    @Query('style') style?: string,
    @Query('kind') kind?: string,
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
      style: styleQuery(style),
      kind: kindQuery(kind),
    });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', data.mimeType);
    response.setHeader('Content-Length', size);
    // Immutable for its key: the key changes whenever the audio would.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }

  /** How the learner learns, for this document or for all of them. Kept for a release; `settings` is the route. */
  @Patch('style')
  async setStyle(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: LectureStyleDto,
  ): Promise<{ style: LectureStyle | null; all: boolean }> {
    const { data } = await this.styleChoice.handle({
      userId,
      documentId,
      style: body.style,
      all: body.all === true,
    });
    return data;
  }

  /** The lecture's settings: the style, whether it is interactive; for this document or for all of them. */
  @Patch('settings')
  async setSettings(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: LectureSettingsDto,
  ): Promise<{
    style: LectureStyle | null;
    interactive: boolean | null;
    all: boolean;
  }> {
    const { data } = await this.styleChoice.handle({
      userId,
      documentId,
      style: body.style,
      interactive: body.interactive,
      all: body.all === true,
    });
    return data;
  }

  /** Maps for chapters prepared before the map existed: the chapter the learner is in and those ahead. */
  @Post('maps')
  @HttpCode(202)
  async writeMaps(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: LectureMapsDto,
  ): Promise<LectureStatusResponse> {
    const { data } = await this.maps.handle({
      userId,
      documentId,
      aheadOfPage: body.aheadOfPage,
      style: body.style,
    });
    return data;
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
      style: body.style,
    });
    return data;
  }
}
