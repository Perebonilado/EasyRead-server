import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import type { Response } from 'express';
import type {
  RequestVisualsResponse,
  VisualSceneDto,
  VisualSetDto,
} from '../../contracts';
import {
  RequestVisualsHandler,
  VisualSceneHandler,
  VisualSetHandler,
} from '../../business/handlers/documents/visual.handlers';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';

class RequestVisualsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsUUID('all', { each: true })
  topicIds!: string[];
}

/** A document's visuals: chapters as short timed scenes, asked for from the reader. */
@Controller('documents/:id/visuals')
export class VisualsController {
  constructor(
    private readonly set: VisualSetHandler,
    private readonly request: RequestVisualsHandler,
    private readonly scene: VisualSceneHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** Every chapter and where its scene stands. */
  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<VisualSetDto> {
    const { data } = await this.set.handle({ userId, documentId });
    return data;
  }

  /** The chapters picked: made once, joined if being made, asked again if failed. */
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
      topicIds: body.topicIds,
    });
    return data;
  }

  /** One chapter's scene, once made. */
  @Get(':topicId')
  async one(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('topicId') topicId: string,
  ): Promise<VisualSceneDto> {
    const { data } = await this.scene.handle({ userId, documentId, topicId });
    return {
      topicId: data.topicId,
      title: data.title ?? '',
      durationMs: data.durationMs ?? 0,
      timeline: data.timeline as VisualSceneDto['timeline'],
    };
  }

  /**
   * The scene's audio. The client fetches it with the session token and
   * plays a blob URL, as it does for the lecture.
   */
  @Get(':topicId/audio')
  async audio(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('topicId') topicId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data } = await this.scene.handle({ userId, documentId, topicId });
    const { stream, size } = await this.storage.stream(data.audioKey!);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Content-Length', size);
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }
}
