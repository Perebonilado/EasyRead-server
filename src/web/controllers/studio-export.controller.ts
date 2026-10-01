import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { SceneDto, StudioExportDto, StudioPlayDto } from '../../contracts';
import { contentDisposition } from '../../business/domain/studio/studio-export';
import { StudioExportService } from '../../business/handlers/studio/studio-export.service';
import { StudioService } from '../../business/handlers/studio/studio.service';
import type { StoragePort } from '../../business/ports/storage.port';
import { STORAGE } from '../../business/ports/tokens';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

/** Asking for a film as a video file (StudioExportRequest). */
class ExportRequestDto {
  @IsIn(['episode', 'show'])
  scope!: 'episode' | 'show';

  @IsOptional()
  @IsIn(['wide', 'tall'])
  shape?: 'wide' | 'tall';

  @IsOptional()
  @IsBoolean()
  captions?: boolean;
}

class KeyDto {
  @IsString()
  @Length(1, 200)
  key!: string;
}

/**
 * A Studio film made into a video file (studio-export): asked for and
 * followed by its maker, downloaded by them or by anyone holding its
 * link; and the render page's way in, by the key the worker signed for
 * the one episode it is drawing, with no account at all.
 */
@Controller('studio')
export class StudioExportController {
  constructor(
    private readonly videos: StudioExportService,
    private readonly studio: StudioService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** A video of the film: one episode or the whole show, in a shape, captions on unless said. */
  @Post('episodes/:id/export')
  @HttpCode(202)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  exportFilm(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: ExportRequestDto,
  ): Promise<StudioExportDto> {
    return this.videos.request(userId, id, body);
  }

  @Get('exports/:id')
  exportOf(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioExportDto> {
    return this.videos.get(userId, id);
  }

  /** The video file, for its maker. */
  @Get('exports/:id/file')
  async file(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.send(await this.videos.fileFor(userId, id), request, response);
  }

  /** The video file, for whoever holds its link (the export's `url`): a plain link a browser can follow. */
  @Public()
  @Get('exports/:id/download')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(
    @Param('id') id: string,
    @Query() query: KeyDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.send(
      await this.videos.fileByKey(id, query.key),
      request,
      response,
    );
  }

  // ── The render page's way in, by its key ───────────────────────────────

  @Public()
  @Get('render/:key/play/:episodeId')
  async renderPlay(
    @Param('key') key: string,
    @Param('episodeId') episodeId: string,
  ): Promise<StudioPlayDto> {
    const episode = await this.videos.renderEpisode(key, episodeId);
    return this.studio.playForRender(episode.id);
  }

  @Public()
  @Get('render/:key/scenes/:sceneId/scene')
  async renderScene(
    @Param('key') key: string,
    @Param('sceneId') sceneId: string,
  ): Promise<SceneDto> {
    return this.studio.sceneJson(
      await this.videos.renderFile(key, sceneId, 'scene'),
    );
  }

  @Public()
  @Get('render/:key/scenes/:sceneId/audio')
  async renderAudio(
    @Param('key') key: string,
    @Param('sceneId') sceneId: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.pipe(
      await this.videos.renderFile(key, sceneId, 'audio'),
      'audio/mpeg',
      response,
    );
  }

  /** A scene's still: a story clip's last frame, which the next lesson's card shows. */
  @Public()
  @Get('render/:key/scenes/:sceneId/thumb')
  async renderThumb(
    @Param('key') key: string,
    @Param('sceneId') sceneId: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.pipe(
      await this.videos.renderFile(key, sceneId, 'thumb'),
      'image/png',
      response,
    );
  }

  /** A video file, named for saving, a range of it where one is asked for (a player seeking). */
  private async send(
    file: { key: string; name: string },
    request: Request,
    response: Response,
  ): Promise<void> {
    const size = await this.storage.size(file.key);
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    let start = 0;
    let end = size - 1;
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        end = range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      } else {
        // The last bytes: "bytes=-500".
        start = Math.max(0, size - Number(range[2]));
      }
      if (start > end || start >= size) {
        response.status(416).setHeader('Content-Range', `bytes */${size}`);
        response.end();
        return;
      }
    }
    const partial = Boolean(range && (range[1] || range[2]));
    const { stream } = await this.storage.stream(
      file.key,
      partial ? { start, end } : undefined,
    );
    response.status(partial ? 206 : 200);
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Length', end - start + 1);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Disposition', contentDisposition(file.name));
    response.setHeader('Cache-Control', 'private, max-age=3600');
    if (partial)
      response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    stream.pipe(response);
  }

  private async pipe(
    key: string,
    type: string,
    response: Response,
  ): Promise<void> {
    try {
      const { stream, size } = await this.storage.stream(key);
      response.setHeader('Content-Type', type);
      response.setHeader('Content-Length', size);
      response.setHeader('Cache-Control', 'private, max-age=3600');
      stream.pipe(response);
    } catch {
      response.status(404).end();
    }
  }
}
