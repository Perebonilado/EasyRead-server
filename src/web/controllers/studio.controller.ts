import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  SceneDto,
  StudioEpisodeDto,
  StudioMessagePageDto,
  StudioPlayDto,
  StudioSceneDto,
  StudioShowCardDto,
  StudioShowDto,
  StudioTurnLine,
} from '../../contracts';
import { StudioService } from '../../business/handlers/studio/studio.service';
import type { StoragePort } from '../../business/ports/storage.port';
import { STORAGE } from '../../business/ports/tokens';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

/** What the maker is looking at in the panel as they write. */
class FocusDto {
  @IsIn(['brief', 'outline', 'cast', 'script', 'made'])
  step!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sceneId?: string;
}

class TurnDto {
  @IsString()
  @Length(1, 16_000)
  message!: string;

  @IsOptional()
  @IsString()
  episodeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FocusDto)
  focus?: FocusDto;
}

class BeforeDto {
  @IsString()
  @Length(1, 64)
  before!: string;
}

class RequestDto {
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  request?: string;
}

class TitleDto {
  @IsString()
  @Length(1, 120)
  title!: string;
}

class ShareDto {
  @IsBoolean()
  on!: boolean;
}

class AddSceneDto {
  @IsInt()
  @Min(-1)
  after!: number;

  @IsString()
  @Length(1, 4000)
  request!: string;
}

/** The maker's choice between a character's drawing and a new one. */
class ChoiceDto {
  @IsIn(['use', 'again', 'keep'])
  choice!: 'use' | 'again' | 'keep';
}

class AnyDto {
  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}

/**
 * The Studio (see studio.service.ts): shows, the conversation with the
 * producer, episodes from outline to film, scenes, and the films
 * themselves; and, without an account, a film shared by its link.
 */
@Controller('studio')
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Get('shows')
  shows(@CurrentUser('id') userId: string): Promise<StudioShowCardDto[]> {
    return this.studio.shows(userId);
  }

  @Post('shows')
  @HttpCode(201)
  create(@CurrentUser('id') userId: string): Promise<StudioShowDto> {
    return this.studio.createShow(userId);
  }

  @Get('shows/:id')
  show(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioShowDto> {
    return this.studio.show(userId, id);
  }

  @Patch('shows/:id')
  rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: TitleDto,
  ): Promise<StudioShowDto> {
    return this.studio.renameShow(userId, id, body.title);
  }

  @Delete('shows/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.studio.deleteShow(userId, id);
  }

  /** The brief changed by hand. */
  @Patch('shows/:id/brief')
  brief(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AnyDto,
  ): Promise<StudioShowDto> {
    return this.studio.updateBrief(userId, id, body.body ?? {});
  }

  /** The cast and the places changed by hand. */
  @Patch('shows/:id/bible')
  bible(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AnyDto,
  ): Promise<StudioShowDto> {
    return this.studio.updateBible(userId, id, body.body ?? {});
  }

  /** Every animal and creature of the cast not drawn yet, drawn now. */
  @Post('shows/:id/cast/draw')
  drawCast(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioShowDto> {
    return this.studio.drawMissing(userId, id);
  }

  /** A character's new drawing used, drawn once more, or let go. */
  @Post('shows/:id/characters/:characterId/drawing')
  chooseDrawing(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Body() body: ChoiceDto,
  ): Promise<StudioShowDto> {
    return this.studio.chooseDrawing(userId, id, characterId, body.choice);
  }

  /** A character's voice, a line of it. */
  @Get('shows/:id/voices/:characterId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async voice(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { audio, mimeType } = await this.studio.voiceSample(
      userId,
      id,
      characterId,
    );
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', audio.length);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.end(audio);
  }

  /** A new episode of a show, about what the maker says. */
  @Post('shows/:id/episodes')
  @HttpCode(201)
  addEpisode(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: RequestDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.addEpisode(userId, id, body.request ?? '');
  }

  /** Earlier messages of the thread: those before one, a page at a time. */
  @Get('shows/:id/messages')
  messages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() query: BeforeDto,
  ): Promise<StudioMessagePageDto> {
    return this.studio.messages(userId, id, query.before);
  }

  /**
   * The producer's turn, streamed as newline-delimited JSON: pieces of the
   * reply as they are written, then the whole outcome.
   */
  @Post('shows/:id/turn')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async turn(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: TurnDto,
    @Res() response: Response,
  ): Promise<void> {
    let started = false;
    const write = (line: StudioTurnLine) => {
      if (!started) {
        started = true;
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        });
      }
      response.write(`${JSON.stringify(line)}\n`);
    };
    try {
      const result = await this.studio.turn(
        userId,
        id,
        {
          episodeId: body.episodeId ?? null,
          message: body.message,
          focus: body.focus ?? null,
        },
        (token) => write({ token }),
      );
      write({ done: true, ...result });
      response.end();
    } catch (error) {
      // Before anything was sent, the usual error; after, a last line saying so.
      if (!started) throw error;
      write({ error: (error as Error).message || 'Something went wrong' });
      response.end();
    }
  }

  @Get('episodes/:id')
  episode(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioEpisodeDto> {
    return this.studio.episode(userId, id);
  }

  @Post('episodes/:id/outline')
  rewriteOutline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: RequestDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.rewriteOutline(userId, id, body.request ?? null);
  }

  @Patch('episodes/:id/outline')
  editOutline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AnyDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.editOutline(userId, id, body.body ?? {});
  }

  @Post('episodes/:id/cast')
  rewriteCast(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: RequestDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio
      .episode(userId, id)
      .then((episode) =>
        this.studio.rewriteCast(userId, episode.showId, id, body.request ?? ''),
      );
  }

  /** One character drawn again as the maker asks: the new drawing waits on their card. */
  @Post('episodes/:id/characters/:characterId/redraw')
  redraw(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Body() body: RequestDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.redrawCharacter(
      userId,
      id,
      characterId,
      body.request ?? '',
    );
  }

  @Post('episodes/:id/approve')
  approve(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioEpisodeDto> {
    return this.studio.approve(userId, id);
  }

  @Post('episodes/:id/make')
  make(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioEpisodeDto> {
    return this.studio.make(userId, id);
  }

  @Post('episodes/:id/scenes')
  addScene(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AddSceneDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.addScene(userId, id, body.after, body.request);
  }

  @Post('episodes/:id/share')
  share(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: ShareDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.share(userId, id, body.on);
  }

  @Get('episodes/:id/play')
  play(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioPlayDto> {
    return this.studio.play(userId, id);
  }

  @Get('episodes/:id/thumb')
  async thumb(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.pipe(
      await this.studio.episodeThumb(userId, id),
      'image/png',
      response,
    );
  }

  @Post('scenes/:id/rewrite')
  rewriteScene(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: RequestDto,
  ): Promise<StudioEpisodeDto> {
    return this.studio.rewriteScene(userId, id, body.request ?? '');
  }

  @Patch('scenes/:id')
  editScene(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: AnyDto,
  ): Promise<StudioSceneDto> {
    return this.studio.editScene(userId, id, body.body ?? {});
  }

  @Post('scenes/:id/undo')
  undo(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioSceneDto> {
    return this.studio.undoScene(userId, id);
  }

  @Delete('scenes/:id')
  removeScene(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<StudioEpisodeDto> {
    return this.studio.removeScene(userId, id);
  }

  @Get('scenes/:id/scene')
  async scene(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<SceneDto> {
    return this.studio.sceneJson(
      await this.studio.sceneFile(userId, id, 'scene'),
    );
  }

  @Get('scenes/:id/audio')
  async audio(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.audioOf(
      await this.studio.sceneFile(userId, id, 'audio'),
      request,
      response,
    );
  }

  @Get('scenes/:id/thumb')
  async sceneThumb(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.pipe(
      await this.studio.sceneFile(userId, id, 'thumb'),
      'image/png',
      response,
    );
  }

  // ── A film shared by its link: no account needed ─────────────────────────

  @Public()
  @Get('shared/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  shared(@Param('token') token: string): Promise<StudioPlayDto> {
    return this.studio.playShared(token);
  }

  @Public()
  @Get('shared/:token/scenes/:sceneId/scene')
  async sharedScene(
    @Param('token') token: string,
    @Param('sceneId') sceneId: string,
  ): Promise<SceneDto> {
    return this.studio.sceneJson(
      await this.studio.sharedFile(token, sceneId, 'scene'),
    );
  }

  @Public()
  @Get('shared/:token/scenes/:sceneId/audio')
  async sharedAudio(
    @Param('token') token: string,
    @Param('sceneId') sceneId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.audioOf(
      await this.studio.sharedFile(token, sceneId, 'audio'),
      request,
      response,
    );
  }

  /** A scene's audio, checked each time against the file it is made from now. */
  private async audioOf(
    key: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const tag = `"${createHash('sha1').update(key).digest('hex').slice(0, 16)}"`;
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('ETag', tag);
    if (request.headers['if-none-match'] === tag) {
      response.status(304).end();
      return;
    }
    await this.pipe(key, 'audio/mpeg', response);
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
      if (type.startsWith('image/'))
        response.setHeader('Cache-Control', 'private, max-age=86400');
      stream.pipe(response);
    } catch {
      response.status(404).end();
    }
  }
}
