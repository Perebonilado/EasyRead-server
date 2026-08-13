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
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';
import type { VoiceSessionResponse } from '../../contracts';
import {
  PageAudioHandler,
  StartVoiceSessionHandler,
  type AudioLevel,
} from '../../business/handlers/documents/voice.handlers';
import { ValidationError } from '../../business/domain/errors/errors';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';

const AUDIO_LEVELS: AudioLevel[] = ['original', 'standard', 'easiest'];

class VoiceSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;
}

class PageAudioParams {
  @IsIn(AUDIO_LEVELS)
  level!: AudioLevel;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;
}

@Controller('documents/:id')
export class VoiceController {
  constructor(
    private readonly pageAudio: PageAudioHandler,
    private readonly startSession: StartVoiceSessionHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /**
   * The page read aloud. Synthesises on first request, then serves the cached
   * file; the client fetches it with the session's token and plays a blob URL,
   * so no Range support is needed here.
   */
  @Get('audio/:level/:page')
  async audio(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param() params: PageAudioParams,
    @Res() response: Response,
  ): Promise<void> {
    if (!AUDIO_LEVELS.includes(params.level)) {
      throw new ValidationError('Unknown audio level');
    }

    const { data } = await this.pageAudio.handle({
      userId,
      documentId,
      level: params.level,
      pageNumber: params.page,
    });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', data.mimeType);
    response.setHeader('Content-Length', size);
    // The file is immutable for its key — the key changes when anything that
    // would alter the audio does — so the browser may keep it.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }

  /** Mints the short-lived credentials for a voice conversation. */
  @Post('voice-session')
  @HttpCode(201)
  async voiceSession(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: VoiceSessionDto,
  ): Promise<VoiceSessionResponse> {
    const result = await this.startSession.handle({
      userId,
      documentId,
      pageNumber: body.pageNumber,
    });
    return result.data;
  }
}
