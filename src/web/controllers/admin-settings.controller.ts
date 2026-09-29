import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { SceneVoiceStatusDto, VoiceOptionDto } from '../../contracts';
import { SceneVoiceService } from '../../business/handlers/admin/scene-voice.service';
import {
  LISTED_ENGINES,
  SCENE_VOICE_ENGINES,
  VOICE_ROLES,
  type ListedEngine,
  type SceneVoiceEngine,
  type VoiceRole,
} from '../../business/domain/scene-voice';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class SetSceneVoiceDto {
  /** An engine, or null for the deployment's own. */
  @IsOptional()
  @IsIn([...SCENE_VOICE_ENGINES])
  engine?: SceneVoiceEngine | null;
}

class SetVoiceCastDto {
  /** The narrator, or a kind of character. */
  @IsIn([...VOICE_ROLES])
  role!: VoiceRole;

  /** An ElevenLabs voice id or a Cartesia voice's UUID, or null for the default. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{12,40}$/)
  voice?: string | null;

  /** Whose voices: ElevenLabs' when not said, as before Cartesia was one. */
  @IsOptional()
  @IsIn([...LISTED_ENGINES])
  engine?: ListedEngine;
}

/** What the admin switches while the app runs: Visualize's voice. */
@Controller('admin/settings')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(private readonly voices: SceneVoiceService) {}

  @Get('voice')
  async voice(): Promise<SceneVoiceStatusDto> {
    return this.voices.status();
  }

  /** Takes effect on the next page the worker voices, within seconds. */
  @Patch('voice')
  async setVoice(
    @CurrentUser('id') userId: string,
    @Body() body: SetSceneVoiceDto,
  ): Promise<SceneVoiceStatusDto> {
    return this.voices.choose(body.engine ?? null, userId);
  }

  /** The voices ElevenLabs offers this account, to give the narrator and each kind of character. */
  @Get('voice/elevenlabs-voices')
  async elevenLabsVoices(): Promise<{ voices: VoiceOptionDto[] }> {
    return { voices: await this.voices.voiceOptions() };
  }

  /**
   * The voices Cartesia offers this account; each sample is fetched here,
   * since Cartesia's ask for the key.
   */
  @Get('voice/cartesia-voices')
  async cartesiaVoices(): Promise<{ voices: VoiceOptionDto[] }> {
    const voices = await this.voices.voiceOptions('cartesia');
    return {
      voices: voices.map((voice) => ({
        ...voice,
        previewUrl: voice.previewUrl
          ? `/admin/settings/voice/cartesia-voices/${encodeURIComponent(voice.id)}/preview`
          : null,
      })),
    };
  }

  /** A Cartesia voice's sample, fetched with the key the browser never sees. */
  @Get('voice/cartesia-voices/:id/preview')
  async cartesiaPreview(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { audio, mimeType } = await this.voices.voicePreview('cartesia', id);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', audio.length);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.end(audio);
  }

  /** The narrator's or a kind of character's voice on ElevenLabs or Cartesia; null for the default. */
  @Patch('voice/cast')
  async setCast(
    @CurrentUser('id') userId: string,
    @Body() body: SetVoiceCastDto,
  ): Promise<SceneVoiceStatusDto> {
    return this.voices.chooseCast(
      body.role,
      body.voice ?? null,
      userId,
      body.engine ?? 'elevenlabs',
    );
  }
}
