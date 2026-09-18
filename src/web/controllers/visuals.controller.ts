import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import type { Response } from 'express';
import type {
  RequestVisualsRequest,
  RequestVisualsResponse,
  VisualPositionDto,
  VisualSceneDto,
  VisualSetDto,
} from '../../contracts';
import {
  RequestVisualsHandler,
  SaveVisualPositionHandler,
  VisualPositionHandler,
  VisualSceneHandler,
  VisualSetHandler,
} from '../../business/handlers/documents/visual.handlers';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';

class RequestVisualsDto implements RequestVisualsRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  fromPage?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  pages?: number[];

  @IsOptional()
  @IsIn(['page', 'ahead', 'whole'])
  mode?: 'page' | 'ahead' | 'whole';
}

/** Where the learner is: the page and the time into it. */
class VisualPositionBody {
  @IsInt()
  @Min(1)
  page!: number;

  @IsInt()
  @Min(0)
  offsetMs!: number;
}

/** A document's visuals: pages as short tutorials, asked for from the reader. */
@Controller('documents/:id/visuals')
export class VisualsController {
  constructor(
    private readonly set: VisualSetHandler,
    private readonly request: RequestVisualsHandler,
    private readonly scene: VisualSceneHandler,
    private readonly position: VisualPositionHandler,
    private readonly savePosition: SaveVisualPositionHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** Where the learner stopped last time, or null. Before the page routes, so "position" is never read as a page. */
  @Get('position')
  async where(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<{ position: VisualPositionDto | null }> {
    const { data } = await this.position.handle({ userId, documentId });
    return { position: data };
  }

  @Patch('position')
  async remember(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: VisualPositionBody,
  ): Promise<VisualPositionDto> {
    const { data } = await this.savePosition.handle({
      userId,
      documentId,
      page: body.page,
      offsetMs: body.offsetMs,
    });
    return data;
  }

  /** Every page and where its tutorial stands. */
  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<VisualSetDto> {
    const { data } = await this.set.handle({ userId, documentId });
    return data;
  }

  /** Ahead of a page, or pages by number: made once, joined if being made, asked again if failed. */
  @Post()
  @HttpCode(202)
  async ask(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: RequestVisualsDto,
  ): Promise<RequestVisualsResponse> {
    const { data } = await this.request.handle({
      userId,
      documentId,
      fromPage: body.fromPage,
      pages: body.pages,
    });
    return data;
  }

  /** One page's tutorial, once made. */
  @Get(':page')
  async one(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page', ParseIntPipe) page: number,
  ): Promise<VisualSceneDto> {
    const { data } = await this.scene.handle({ userId, documentId, page });
    return {
      page: data.pageNumber,
      title: data.title ?? '',
      durationMs: data.durationMs ?? 0,
      timeline: data.timeline as VisualSceneDto['timeline'],
    };
  }

  /** The sheet of stills the judge looked at, one per moment; absent on a page made before there was one. */
  @Get(':page/sheet')
  async sheet(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page', ParseIntPipe) page: number,
    @Res() response: Response,
  ): Promise<void> {
    const { data } = await this.scene.handle({ userId, documentId, page });
    const key = data.audioKey?.replace(/-[^/]*\.mp3$/, '-sheet.png');
    if (!key) {
      response.status(404).end();
      return;
    }
    try {
      const { stream, size } = await this.storage.stream(key);
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Content-Length', size);
      response.setHeader('Cache-Control', 'private, max-age=86400');
      stream.pipe(response);
    } catch {
      response.status(404).end();
    }
  }

  /**
   * The tutorial's audio. The client fetches it with the session token
   * and plays a blob URL, as it does for the lecture.
   */
  @Get(':page/audio')
  async audio(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('page', ParseIntPipe) page: number,
    @Res() response: Response,
  ): Promise<void> {
    const { data } = await this.scene.handle({ userId, documentId, page });
    const { stream, size } = await this.storage.stream(data.audioKey!);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Content-Length', size);
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }
}
