import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type {
  LibraryVoiceDto,
  SceneVoiceStatusDto,
  VoiceOptionDto,
} from '../../contracts';
import { SceneVoiceService } from '../../business/handlers/admin/scene-voice.service';
import {
  ELEVENLABS_MODELS,
  LISTED_ENGINES,
  SCENE_VOICE_ENGINES,
  VOICE_ROLES,
  type ElevenLabsModel,
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

class SetVoiceModelDto {
  /** ElevenLabs' model, or null for the default. */
  @IsOptional()
  @IsIn(ELEVENLABS_MODELS.map((model) => model.value))
  model?: ElevenLabsModel | null;
}

class AddLibraryVoiceDto {
  /** The library voice's owner, as the search gave it. */
  @IsString()
  @Matches(/^[A-Za-z0-9]{8,80}$/)
  ownerId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9]{12,40}$/)
  voiceId!: string;

  /** The name it is kept under in the account. */
  @IsString()
  @MaxLength(100)
  name!: string;
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

  /** ElevenLabs' model, v4 or v3; null for the default. Takes effect on the next page. */
  @Patch('voice/model')
  async setModel(
    @CurrentUser('id') userId: string,
    @Body() body: SetVoiceModelDto,
  ): Promise<SceneVoiceStatusDto> {
    return this.voices.chooseModel(body.model ?? null, userId);
  }

  /** ElevenLabs' Voice Library searched, for a voice the account does not have. */
  @Get('voice/elevenlabs-library')
  async elevenLabsLibrary(
    @Query('search') search?: string,
  ): Promise<{ voices: LibraryVoiceDto[] }> {
    return { voices: await this.voices.library(search ?? '') };
  }

  /** A library voice added to the ElevenLabs account: one of its voice slots. */
  @Post('voice/elevenlabs-library')
  async addElevenLabsVoice(
    @Body() body: AddLibraryVoiceDto,
  ): Promise<{ voices: VoiceOptionDto[] }> {
    return this.voices.addLibraryVoice(body.ownerId, body.voiceId, body.name);
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
